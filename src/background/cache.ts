import type { Label } from "../shared/messages";
import { preselectLabels } from "../shared/label-selection";
import type { Settings } from "../shared/settings";
import { effectiveOwner, repoKey } from "../shared/site-mapping";
import { getRepo, listLabels } from "./github-api";

const LABEL_TTL_MS = 10 * 60 * 1000;

interface LabelCacheEntry {
  at: number;
  labels: Label[];
}

export async function getLabels(token: string, owner: string, repo: string, force = false): Promise<Label[]> {
  const key = repoKey(owner, repo);
  if (!force) {
    const { labelCache = {} } = (await chrome.storage.local.get("labelCache")) as {
      labelCache?: Record<string, LabelCacheEntry>;
    };
    const hit = labelCache[key];
    if (hit && Date.now() - hit.at < LABEL_TTL_MS) return hit.labels;
  }
  const labels = await listLabels(token, owner, repo);
  // Re-read just before writing so a concurrent fetch for another repo isn't lost.
  const { labelCache = {} } = (await chrome.storage.local.get("labelCache")) as {
    labelCache?: Record<string, LabelCacheEntry>;
  };
  labelCache[key] = { at: Date.now(), labels };
  await chrome.storage.local.set({ labelCache });
  return labels;
}

export async function getRepoId(token: string, owner: string, repo: string): Promise<number> {
  const key = repoKey(owner, repo);
  const { repoIds = {} } = (await chrome.storage.local.get("repoIds")) as { repoIds?: Record<string, number> };
  const cached = repoIds[key];
  if (cached !== undefined) return cached;
  const { id } = await getRepo(token, owner, repo);
  const { repoIds: latest = {} } = (await chrome.storage.local.get("repoIds")) as { repoIds?: Record<string, number> };
  latest[key] = id;
  await chrome.storage.local.set({ repoIds: latest });
  return id;
}

export function preselectedFor(settings: Settings, owner: string, repo: string, labels: readonly Label[]): string[] {
  const key = repoKey(owner, repo);
  const mapping = settings.mappings.find((m) => repoKey(effectiveOwner(m, settings), m.repo) === key);
  return preselectLabels(
    labels.map((l) => l.name),
    settings.lastLabels[key],
    mapping?.defaultLabels,
    settings.defaultLabels,
  );
}
