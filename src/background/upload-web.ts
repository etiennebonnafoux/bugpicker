import { getRepoId } from "./cache";

export interface UploadFile {
  filename: string;
  contentType: string;
  dataUrl: string;
}

interface PageUploadResult {
  href: string | null;
  error?: string;
}

const TAB_LOAD_TIMEOUT_MS = 15_000;

/**
 * Strategy A: replays github.com's drag-and-drop upload from inside a github.com page,
 * using the browser's GitHub session. Relies on an undocumented endpoint, hence the
 * branch fallback. Returns a `user-attachments` URL.
 */
export async function uploadViaWeb(token: string, owner: string, repo: string, file: UploadFile): Promise<string> {
  const repositoryId = await getRepoId(token, owner, repo);
  // Always a fresh tab: scripts from other extensions in an existing github.com tab could
  // read the screenshot and the upload tokens.
  const tab = await chrome.tabs.create({
    url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    active: false,
  });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error("web upload: could not open a github.com tab");
  try {
    await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: uploadFromGitHubPage,
      args: [repositoryId, file],
    });
    const result = injection?.result as PageUploadResult | undefined;
    if (!result?.href) throw new Error(`web upload: ${result?.error ?? "no result from the page"}`);
    return result.href;
  } finally {
    chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdated = (id: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
      if (id === tabId && info.status === "complete" && tab.url?.startsWith("https://github.com/")) done();
    };
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("web upload: github.com tab did not load within 15 s"));
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === "complete" && tab.url?.startsWith("https://github.com/")) done();
      },
      () => undefined,
    );
  });
}

/**
 * Runs in the github.com page (MAIN world). It is serialized by `executeScript`, so it must
 * not reference anything outside its own body.
 */
async function uploadFromGitHubPage(repositoryId: number, file: UploadFile): Promise<PageUploadResult> {
  const shortBody = async (response: Response) => (await response.text().catch(() => "")).slice(0, 200);
  try {
    const binary = atob(file.dataUrl.slice(file.dataUrl.indexOf(",") + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.contentType });

    const policyForm = new FormData();
    policyForm.append("repository_id", String(repositoryId));
    policyForm.append("name", file.filename);
    policyForm.append("size", String(blob.size));
    policyForm.append("content_type", file.contentType);
    const policyResponse = await fetch("https://github.com/upload/policies/assets", {
      method: "POST",
      body: policyForm,
      credentials: "same-origin",
      headers: { "GitHub-Verified-Fetch": "true", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!policyResponse.ok) {
      return { href: null, error: `policy: ${policyResponse.status} ${await shortBody(policyResponse)}` };
    }
    const policy = (await policyResponse.json()) as {
      upload_url?: string;
      form?: Record<string, string>;
      asset_upload_url?: string;
      asset_upload_authenticity_token?: string;
      asset?: { href?: string };
    };
    if (!policy.upload_url || !policy.asset_upload_url || !policy.asset_upload_authenticity_token || !policy.asset?.href) {
      return { href: null, error: "policy: unexpected response shape" };
    }

    const uploadForm = new FormData();
    for (const [name, value] of Object.entries(policy.form ?? {})) uploadForm.append(name, value);
    uploadForm.append("file", blob, file.filename);
    const uploadResponse = await fetch(policy.upload_url, { method: "POST", body: uploadForm, mode: "cors" });
    if (!uploadResponse.ok) {
      return { href: null, error: `upload: ${uploadResponse.status} ${await shortBody(uploadResponse)}` };
    }

    const confirmForm = new FormData();
    confirmForm.append("authenticity_token", policy.asset_upload_authenticity_token);
    const confirmResponse = await fetch(new URL(policy.asset_upload_url, location.origin), {
      method: "PUT",
      body: confirmForm,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!confirmResponse.ok) {
      return { href: null, error: `confirm: ${confirmResponse.status} ${await shortBody(confirmResponse)}` };
    }
    return { href: policy.asset.href };
  } catch (error) {
    return { href: null, error: `exception: ${String(error)}` };
  }
}
