export interface SiteMapping {
  id: string;
  /** Hostname pattern: `example.com`, `*.example.com`, `localhost:5173`. */
  pattern: string;
  repo: string;
  /** Empty means "use the global owner". */
  owner?: string;
  defaultLabels?: string[];
}

export interface TargetSettings {
  owner: string;
  mappings: readonly SiteMapping[];
}

export interface ResolvedTarget {
  owner: string;
  repo: string;
  mapping: SiteMapping;
}

const LEADING_WWW = /^www\./;
const PATTERN_SYNTAX = /^(\*\.)?(\[[0-9a-f:.]+\]|[a-z0-9_-]+(\.[a-z0-9_-]+)*)(:\d{1,5})?$/;

/** `host[:port]` of an http(s) URL, lowercased, without a leading `www.`; `null` otherwise. */
export function hostFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const hostname = parsed.hostname.toLowerCase().replace(LEADING_WWW, "");
  if (!hostname) return null;
  return parsed.port ? `${hostname}:${parsed.port}` : hostname;
}

/** Accepts what a user may paste (full URL, uppercase, `www.`) and returns the canonical pattern. */
export function normalizePattern(input: string): string {
  let pattern = input.trim().toLowerCase();
  pattern = pattern.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  pattern = pattern.split(/[/?#]/, 1)[0] ?? "";
  pattern = pattern.replace(/^[^@]*@/, "");
  const wildcard = pattern.startsWith("*.");
  const rest = (wildcard ? pattern.slice(2) : pattern).replace(LEADING_WWW, "");
  return wildcard ? `*.${rest}` : rest;
}

export function isValidPattern(pattern: string): boolean {
  return PATTERN_SYNTAX.test(pattern);
}

function splitHost(host: string): { name: string; port: string | null } {
  const match = /^(.*?)(?::(\d+))?$/.exec(host);
  return { name: match?.[1] ?? host, port: match?.[2] ?? null };
}

interface MatchScore {
  exact: boolean;
  length: number;
}

function matchPattern(pattern: string, host: string): MatchScore | null {
  const p = splitHost(pattern);
  const h = splitHost(host);
  if (p.port !== null && p.port !== h.port) return null;
  if (p.name.startsWith("*.")) {
    const base = p.name.slice(2);
    if (h.name === base || h.name.endsWith(`.${base}`)) return { exact: false, length: pattern.length };
    return null;
  }
  return p.name === h.name ? { exact: true, length: pattern.length } : null;
}

function isBetter(a: MatchScore, b: MatchScore | null): boolean {
  if (!b) return true;
  if (a.exact !== b.exact) return a.exact;
  return a.length > b.length;
}

export function effectiveOwner(mapping: SiteMapping, settings: Pick<TargetSettings, "owner">): string {
  return mapping.owner?.trim() || settings.owner.trim();
}

/**
 * Picks the mapping for a page. Exact patterns beat wildcards, a longer pattern beats a
 * shorter one (so a pattern with a port beats the same pattern without one).
 */
export function resolveTarget(url: string, settings: TargetSettings): ResolvedTarget | null {
  const host = hostFromUrl(url);
  if (!host) return null;
  let best: SiteMapping | null = null;
  let bestScore: MatchScore | null = null;
  for (const mapping of settings.mappings) {
    const score = matchPattern(normalizePattern(mapping.pattern), host);
    if (score && isBetter(score, bestScore)) {
      best = mapping;
      bestScore = score;
    }
  }
  if (!best) return null;
  return { owner: effectiveOwner(best, settings), repo: best.repo, mapping: best };
}

/** GitHub owner and repo names are case-insensitive; caches and allow-lists use this key. */
export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}
