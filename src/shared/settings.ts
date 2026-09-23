import { isValidPattern, normalizePattern, type SiteMapping } from "./site-mapping";
import { randomId } from "./ids";

export type UploadStrategy = "auto" | "web" | "branch";
export const UPLOAD_STRATEGIES: readonly UploadStrategy[] = ["auto", "web", "branch"];

export interface Settings {
  owner: string;
  mappings: SiteMapping[];
  token: string;
  defaultLabels: string[];
  uploadStrategy: UploadStrategy;
  screenshotBranch: string;
  /** Last label selection, keyed by `repoKey(owner, repo)`. */
  lastLabels: Record<string, string[]>;
}

export function defaultSettings(): Settings {
  return {
    owner: "",
    mappings: [],
    token: "",
    defaultLabels: [],
    uploadStrategy: "auto",
    screenshotBranch: "qa-screenshots",
    lastLabels: {},
  };
}

const SETTING_KEYS = Object.keys(defaultSettings()) as (keyof Settings)[];

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(SETTING_KEYS)) as Partial<Settings>;
  return { ...defaultSettings(), ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_NAME = /^[A-Za-z0-9._-]+$/;
const BRANCH_NAME = /^(?!\/|-)(?!.*(?:\.\.|\/\/|@\{))[A-Za-z0-9._/-]+(?<![/.])(?<!\.lock)$/;

export function isValidOwner(owner: string): boolean {
  return OWNER_NAME.test(owner);
}

export function isValidRepoName(repo: string): boolean {
  return REPO_NAME.test(repo) && repo !== "." && repo !== "..";
}

export function isValidBranchName(branch: string): boolean {
  return BRANCH_NAME.test(branch);
}

export function parseLabelList(text: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of text.split(",")) {
    const label = raw.trim();
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      labels.push(label);
    }
  }
  return labels;
}

export interface MappingDraft {
  id?: string;
  pattern: string;
  repo: string;
  owner: string;
  defaultLabels: string[];
}

/** Validates a mapping against the others; returns the mapping to store or an error message. */
export function validateMapping(
  draft: MappingDraft,
  existing: readonly SiteMapping[],
  globalOwner: string,
): { mapping: SiteMapping } | { error: string } {
  const pattern = normalizePattern(draft.pattern);
  if (!pattern) return { error: "Pattern is required." };
  if (!isValidPattern(pattern)) return { error: `"${pattern}" is not a valid hostname pattern.` };
  if (existing.some((m) => m.id !== draft.id && normalizePattern(m.pattern) === pattern)) {
    return { error: `A mapping for "${pattern}" already exists.` };
  }
  const repo = draft.repo.trim();
  if (!isValidRepoName(repo)) return { error: "Repo name may only contain letters, digits, '.', '_' and '-'." };
  const owner = draft.owner.trim();
  if (owner && !isValidOwner(owner)) return { error: `"${owner}" is not a valid GitHub owner.` };
  const mapping: SiteMapping = { id: draft.id ?? randomId(), pattern, repo };
  if (owner && owner.toLowerCase() !== globalOwner.trim().toLowerCase()) mapping.owner = owner;
  if (draft.defaultLabels.length) mapping.defaultLabels = draft.defaultLabels;
  return { mapping };
}

export type ExportedSettings = Omit<Settings, "token" | "lastLabels">;

export function exportSettings(settings: Settings): ExportedSettings {
  const { token: _token, lastLabels: _lastLabels, ...rest } = settings;
  return rest;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Parses an export file. Never touches the token; unknown or malformed fields are rejected. */
export function parseImportedSettings(json: string): Partial<Settings> {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("Not a settings file.");
  const input = data as Record<string, unknown>;
  const result: Partial<Settings> = {};
  if (input.owner !== undefined) {
    if (typeof input.owner !== "string" || (input.owner && !isValidOwner(input.owner))) throw new Error("Invalid owner.");
    result.owner = input.owner;
  }
  if (input.defaultLabels !== undefined) {
    if (!isStringArray(input.defaultLabels)) throw new Error("Invalid defaultLabels.");
    result.defaultLabels = input.defaultLabels;
  }
  if (input.uploadStrategy !== undefined) {
    if (!UPLOAD_STRATEGIES.includes(input.uploadStrategy as UploadStrategy)) throw new Error("Invalid uploadStrategy.");
    result.uploadStrategy = input.uploadStrategy as UploadStrategy;
  }
  if (input.screenshotBranch !== undefined) {
    if (typeof input.screenshotBranch !== "string" || !isValidBranchName(input.screenshotBranch)) {
      throw new Error("Invalid screenshotBranch.");
    }
    result.screenshotBranch = input.screenshotBranch;
  }
  if (input.mappings !== undefined) {
    if (!Array.isArray(input.mappings)) throw new Error("Invalid mappings.");
    const mappings: SiteMapping[] = [];
    for (const raw of input.mappings as unknown[]) {
      const m = (raw ?? {}) as Record<string, unknown>;
      if (typeof m.pattern !== "string" || typeof m.repo !== "string") throw new Error("Invalid mapping entry.");
      if (m.owner !== undefined && typeof m.owner !== "string") throw new Error("Invalid mapping owner.");
      if (m.defaultLabels !== undefined && !isStringArray(m.defaultLabels)) throw new Error("Invalid mapping labels.");
      const checked = validateMapping(
        {
          pattern: m.pattern,
          repo: m.repo,
          owner: (m.owner as string | undefined) ?? "",
          defaultLabels: (m.defaultLabels as string[] | undefined) ?? [],
        },
        mappings,
        result.owner ?? "",
      );
      if ("error" in checked) throw new Error(checked.error);
      mappings.push(checked.mapping);
    }
    result.mappings = mappings;
  }
  return result;
}
