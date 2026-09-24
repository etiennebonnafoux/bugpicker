import { getLabels } from "../background/cache";
import { describeError, getRepo, GitHubError } from "../background/github-api";
import {
  exportSettings,
  isValidBranchName,
  isValidOwner,
  loadSettings,
  parseImportedSettings,
  parseLabelList,
  saveSettings,
  validateMapping,
  UPLOAD_STRATEGIES,
  type Settings,
  type UploadStrategy,
} from "../shared/settings";
import { effectiveOwner, normalizePattern, resolveTarget, type SiteMapping } from "../shared/site-mapping";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const general = $<HTMLFormElement>("general");
const ownerInput = $<HTMLInputElement>("owner");
const tokenInput = $<HTMLInputElement>("token");
const defaultLabelsInput = $<HTMLInputElement>("default-labels");
const strategySelect = $<HTMLSelectElement>("upload-strategy");
const branchInput = $<HTMLInputElement>("screenshot-branch");
const generalStatus = $<HTMLSpanElement>("general-status");

const mappingRows = $<HTMLTableSectionElement>("mappings");
const editor = $<HTMLFormElement>("mapping-editor");
const editorTitle = $<HTMLElement>("mapping-editor-title");
const patternInput = $<HTMLInputElement>("m-pattern");
const repoInput = $<HTMLInputElement>("m-repo");
const mappingOwnerInput = $<HTMLInputElement>("m-owner");
const mappingLabelsInput = $<HTMLInputElement>("m-labels");
const mappingStatus = $<HTMLSpanElement>("mapping-status");

const probeInput = $<HTMLInputElement>("probe-url");
const probeResult = $<HTMLSpanElement>("probe-result");
const transferStatus = $<HTMLSpanElement>("transfer-status");
const importFile = $<HTMLInputElement>("import-file");

const hostAccess = $<HTMLDivElement>("host-access");
const hostAccessStatus = $<HTMLSpanElement>("host-access-status");

let settings: Settings;
let editingId: string | null = null;
/** Test results survive a re-render of the table. */
const results = new Map<string, { ok: boolean; text: string }>();

function setStatus(node: HTMLElement, text: string, ok: boolean): void {
  node.textContent = text;
  node.className = `status ${ok ? "ok" : "err"}`;
}

function fillGeneral(): void {
  ownerInput.value = settings.owner;
  tokenInput.value = settings.token;
  defaultLabelsInput.value = settings.defaultLabels.join(", ");
  strategySelect.value = settings.uploadStrategy;
  branchInput.value = settings.screenshotBranch;
  mappingOwnerInput.placeholder = settings.owner || "global owner";
}

general.addEventListener("submit", async (event) => {
  event.preventDefault();
  const owner = ownerInput.value.trim();
  const branch = branchInput.value.trim();
  if (!isValidOwner(owner)) return setStatus(generalStatus, "Owner must be a valid GitHub user or organization name.", false);
  if (!isValidBranchName(branch)) return setStatus(generalStatus, "Screenshot branch is not a valid branch name.", false);
  const strategy = strategySelect.value as UploadStrategy;
  if (!UPLOAD_STRATEGIES.includes(strategy)) return;
  const patch: Partial<Settings> = {
    owner,
    token: tokenInput.value.trim(),
    defaultLabels: parseLabelList(defaultLabelsInput.value),
    uploadStrategy: strategy,
    screenshotBranch: branch,
  };
  await saveSettings(patch);
  settings = { ...settings, ...patch };
  fillGeneral();
  renderMappings();
  updateProbe();
  setStatus(generalStatus, settings.token ? "Saved." : "Saved. Add a token to start filing issues.", !!settings.token);
});

// Mappings table

function cell(...children: (Node | string)[]): HTMLTableCellElement {
  const td = document.createElement("td");
  td.append(...children);
  return td;
}

function actionButton(text: string, onClick: () => void, className = ""): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.className = className;
  node.addEventListener("click", onClick);
  return node;
}

function renderMappings(): void {
  mappingRows.replaceChildren();
  if (!settings.mappings.length) {
    const td = cell("No mapping yet. Add one for each site you test.");
    td.colSpan = 5;
    td.className = "placeholder";
    mappingRows.append(document.createElement("tr"));
    mappingRows.lastElementChild!.append(td);
    return;
  }
  for (const mapping of settings.mappings) {
    const tr = document.createElement("tr");
    const owner = document.createElement("span");
    owner.textContent = mapping.owner || settings.owner || "—";
    if (!mapping.owner) owner.className = "placeholder";
    const result = document.createElement("div");
    result.className = "result";
    const saved = results.get(mapping.id);
    if (saved) {
      result.textContent = saved.text;
      result.classList.add(saved.ok ? "ok" : "err");
    }
    const actions = cell(
      actionButton("Test", () => void testMapping(mapping)),
      " ",
      actionButton("Refresh labels", () => void testMapping(mapping, "Labels refreshed")),
      " ",
      actionButton("Edit", () => openEditor(mapping)),
      " ",
      actionButton("Delete", () => void deleteMapping(mapping), "danger"),
      result,
    );
    actions.className = "actions";
    tr.append(cell(mapping.pattern), cell(mapping.repo), cell(owner), cell((mapping.defaultLabels ?? []).join(", ")), actions);
    mappingRows.append(tr);
  }
}

async function testMapping(mapping: SiteMapping, prefix = "OK"): Promise<void> {
  const owner = effectiveOwner(mapping, settings);
  const fullName = `${owner}/${mapping.repo}`;
  results.set(mapping.id, { ok: true, text: "Testing…" });
  renderMappings();
  if (!settings.token) {
    results.set(mapping.id, { ok: false, text: "Save a token first." });
    renderMappings();
    return;
  }
  try {
    const repo = await getRepo(settings.token, owner, mapping.repo);
    const labels = await getLabels(settings.token, owner, mapping.repo, true);
    results.set(mapping.id, { ok: true, text: `${prefix}: ${repo.full_name}, ${labels.length} label${labels.length === 1 ? "" : "s"}` });
  } catch (error) {
    let text = describeError(error, fullName);
    const foreignOwner = owner.toLowerCase() !== settings.owner.toLowerCase();
    if (error instanceof GitHubError && error.status === 404 && foreignOwner) {
      text += ` This token has no access to ${owner}; fine-grained tokens are limited to one account or organization.`;
    }
    results.set(mapping.id, { ok: false, text });
  }
  renderMappings();
}

async function deleteMapping(mapping: SiteMapping): Promise<void> {
  if (!confirm(`Delete the mapping ${mapping.pattern} → ${mapping.repo}?`)) return;
  settings.mappings = settings.mappings.filter((m) => m.id !== mapping.id);
  await saveSettings({ mappings: settings.mappings });
  results.delete(mapping.id);
  if (editingId === mapping.id) closeEditor();
  renderMappings();
  updateProbe();
}

function openEditor(mapping: SiteMapping | null): void {
  editingId = mapping?.id ?? null;
  editorTitle.textContent = mapping ? `Edit ${mapping.pattern}` : "Add mapping";
  patternInput.value = mapping?.pattern ?? "";
  repoInput.value = mapping?.repo ?? "";
  mappingOwnerInput.value = mapping?.owner ?? "";
  mappingLabelsInput.value = (mapping?.defaultLabels ?? []).join(", ");
  mappingStatus.textContent = "";
  editor.hidden = false;
  patternInput.focus();
}

function closeEditor(): void {
  editingId = null;
  editor.hidden = true;
}

// Pasting a full URL keeps only its host.
patternInput.addEventListener("change", () => (patternInput.value = normalizePattern(patternInput.value)));

editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  const checked = validateMapping(
    {
      id: editingId ?? undefined,
      pattern: patternInput.value,
      repo: repoInput.value,
      owner: mappingOwnerInput.value,
      defaultLabels: parseLabelList(mappingLabelsInput.value),
    },
    settings.mappings,
    settings.owner,
  );
  if ("error" in checked) {
    mappingStatus.textContent = checked.error;
    return;
  }
  const { mapping } = checked;
  settings.mappings = editingId
    ? settings.mappings.map((m) => (m.id === editingId ? mapping : m))
    : [...settings.mappings, mapping];
  await saveSettings({ mappings: settings.mappings });
  results.delete(mapping.id);
  closeEditor();
  renderMappings();
  updateProbe();
});

$<HTMLButtonElement>("m-cancel").addEventListener("click", closeEditor);
$<HTMLButtonElement>("add-mapping").addEventListener("click", () => openEditor(null));
$<HTMLButtonElement>("test-all").addEventListener("click", () => {
  for (const mapping of settings.mappings) void testMapping(mapping);
});

// URL probe

function updateProbe(): void {
  const url = probeInput.value.trim();
  if (!url) {
    probeResult.textContent = "";
    return;
  }
  const target = resolveTarget(url, settings);
  probeResult.className = target ? "ok" : "muted";
  probeResult.textContent = target
    ? `→ ${target.owner || "(no owner)"}/${target.repo}, matched ${target.mapping.pattern}`
    : /^https?:\/\//i.test(url)
      ? "No mapping matches this URL."
      : "Only http(s) URLs can be mapped.";
}

probeInput.addEventListener("input", updateProbe);

// Export / import

$<HTMLButtonElement>("export").addEventListener("click", () => {
  const json = JSON.stringify(exportSettings(settings), null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  link.download = "bugpicker-settings.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setStatus(transferStatus, "Exported (without the token).", true);
});

$<HTMLButtonElement>("import").addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  try {
    const patch = parseImportedSettings(await file.text());
    if (patch.mappings && !confirm(`Replace your ${settings.mappings.length} mapping(s) with the ${patch.mappings.length} from this file?`)) {
      return;
    }
    await saveSettings(patch);
    settings = { ...settings, ...patch };
    results.clear();
    fillGeneral();
    renderMappings();
    updateProbe();
    setStatus(transferStatus, "Imported. Your token was kept.", true);
  } catch (error) {
    setStatus(transferStatus, `Import failed: ${error instanceof Error ? error.message : String(error)}`, false);
  }
});

// Host access: always granted in Chrome; Firefox lets the user withhold or revoke it.

const GITHUB_ORIGINS = { origins: chrome.runtime.getManifest().host_permissions ?? [] };

async function updateHostAccess(): Promise<void> {
  hostAccess.hidden = await chrome.permissions.contains(GITHUB_ORIGINS);
}

$<HTMLButtonElement>("grant-host-access").addEventListener("click", async () => {
  // No await before request(): Firefox only allows it while handling the click.
  const granted = await chrome.permissions.request(GITHUB_ORIGINS).catch(() => false);
  if (!granted) setStatus(hostAccessStatus, "Access not granted.", false);
  await updateHostAccess();
});

chrome.permissions.onAdded.addListener(() => void updateHostAccess());
chrome.permissions.onRemoved.addListener(() => void updateHostAccess());

void (async () => {
  void updateHostAccess();
  settings = await loadSettings();
  fillGeneral();
  renderMappings();
})();
