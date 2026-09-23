import { buildIssueBody, screenshotMarkdown } from "../shared/issue-body";
import {
  parseContentRequest,
  type AddMappingRequest,
  type CaptureContext,
  type ContentRequest,
  type ResponseFor,
  type SubmitIssueRequest,
  type TargetChoice,
} from "../shared/messages";
import { loadSettings, saveSettings, validateMapping, type Settings } from "../shared/settings";
import { effectiveOwner, hostFromUrl, repoKey, resolveTarget } from "../shared/site-mapping";
import { getLabels, preselectedFor } from "./cache";
import { captureArea } from "./capture";
import { createIssue, describeError } from "./github-api";
import { uploadScreenshot, type UploadResult } from "./upload";

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "start-capture") void startCapture(tab);
});

chrome.action.onClicked.addListener((tab) => void startCapture(tab));

async function startCapture(tab?: chrome.tabs.Tab): Promise<void> {
  const activeTab = tab?.id !== undefined ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const tabId = activeTab?.id;
  if (tabId === undefined) return;
  const settings = await loadSettings();
  if (!settings.owner || !settings.token) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "start-capture", context: buildContext(activeTab.url ?? "", settings) });
  } catch (error) {
    console.info("[BugPicker] capture unavailable on this page:", error);
    await flagUnavailable(tabId);
  }
}

async function flagUnavailable(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#d1242f" });
  await chrome.action.setBadgeText({ tabId, text: "✕" });
  await chrome.action.setTitle({ tabId, title: "BugPicker: capture isn't available on this page" });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    chrome.action.setTitle({ tabId, title: "BugPicker: capture area" }).catch(() => undefined);
  }, 4000);
}

function targetChoices(settings: Settings): TargetChoice[] {
  const seen = new Set<string>();
  const choices: TargetChoice[] = [];
  for (const mapping of settings.mappings) {
    const owner = effectiveOwner(mapping, settings);
    const key = repoKey(owner, mapping.repo);
    if (!seen.has(key)) {
      seen.add(key);
      choices.push({ owner, repo: mapping.repo, pattern: mapping.pattern });
    }
  }
  return choices;
}

function buildContext(url: string, settings: Settings): CaptureContext {
  const resolved = resolveTarget(url, settings);
  return {
    target: resolved ? { owner: resolved.owner, repo: resolved.repo, pattern: resolved.mapping.pattern } : null,
    choices: targetChoices(settings),
    hostname: hostFromUrl(url) ?? "",
    defaultOwner: settings.owner,
  };
}

/** The content script may only file issues into repos the user has mapped. */
function isMappedTarget(settings: Settings, owner: string, repo: string): boolean {
  const key = repoKey(owner, repo);
  return settings.mappings.some((m) => repoKey(effectiveOwner(m, settings), m.repo) === key);
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) return false;
  const message = parseContentRequest(raw);
  if (!message) return false;
  handle(message, sender.tab).then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: describeError(error) }));
  return true;
});

async function handle(message: ContentRequest, tab: chrome.tabs.Tab): Promise<ResponseFor[ContentRequest["type"]]> {
  switch (message.type) {
    case "capture-area": {
      try {
        return { ok: true, dataUrl: await captureArea(tab.windowId, message.rect, message.viewport, message.dpr) };
      } catch (error) {
        return { ok: false, error: `Capture failed: ${describeError(error)}` };
      }
    }
    case "get-labels": {
      const settings = await loadSettings();
      if (!isMappedTarget(settings, message.owner, message.repo)) return { ok: false, error: "This repo isn't mapped." };
      try {
        const labels = await getLabels(settings.token, message.owner, message.repo);
        return { ok: true, labels, preselected: preselectedFor(settings, message.owner, message.repo, labels) };
      } catch (error) {
        return { ok: false, error: describeError(error, `${message.owner}/${message.repo}`) };
      }
    }
    case "add-mapping":
      return addMapping(message, tab);
    case "submit-issue":
      return submitIssue(message);
  }
}

async function addMapping(message: AddMappingRequest, tab: chrome.tabs.Tab): Promise<ResponseFor["add-mapping"]> {
  const settings = await loadSettings();
  const checked = validateMapping(
    { pattern: message.pattern, repo: message.repo, owner: message.owner, defaultLabels: [] },
    settings.mappings,
    settings.owner,
  );
  if ("error" in checked) return { ok: false, error: checked.error };
  const mappings = [...settings.mappings, checked.mapping];
  await saveSettings({ mappings });
  const updated = { ...settings, mappings };
  const owner = effectiveOwner(checked.mapping, updated);
  // Continue with the new repo even if the pattern the user typed doesn't match this page.
  return {
    ok: true,
    context: {
      ...buildContext(tab.url ?? "", updated),
      target: { owner, repo: checked.mapping.repo, pattern: checked.mapping.pattern },
    },
  };
}

/** Uploaded images, kept so a retry after a failed issue creation doesn't upload twice. */
const uploads = new Map<string, UploadResult>();

async function submitIssue(message: SubmitIssueRequest): Promise<ResponseFor["submit-issue"]> {
  const settings = await loadSettings();
  const { owner, repo } = message;
  const fullName = `${owner}/${repo}`;
  if (!isMappedTarget(settings, owner, repo)) return { ok: false, error: `${fullName} isn't a mapped repo.` };
  if (!message.title.trim()) return { ok: false, error: "A title is required." };

  const uploadKey = `${message.submissionId}|${repoKey(owner, repo)}`;
  let upload = uploads.get(uploadKey);
  if (!upload) {
    try {
      upload = await uploadScreenshot(settings, owner, repo, message.screenshotDataUrl);
    } catch (error) {
      return { ok: false, error: `Screenshot upload failed: ${describeError(error, fullName)}` };
    }
    uploads.set(uploadKey, upload);
  }

  const body = buildIssueBody({
    description: message.description,
    imageMarkdown: screenshotMarkdown(upload.url),
    meta: message.meta,
  });
  try {
    const issue = await createIssue(settings.token, owner, repo, { title: message.title.trim(), body, labels: message.labels });
    uploads.delete(uploadKey);
    const { lastLabels } = await loadSettings();
    await saveSettings({ lastLabels: { ...lastLabels, [repoKey(owner, repo)]: message.labels } });
    return { ok: true, number: issue.number, htmlUrl: issue.html_url, strategyUsed: upload.strategyUsed, fellBack: upload.fellBack };
  } catch (error) {
    return { ok: false, error: describeError(error, fullName) };
  }
}
