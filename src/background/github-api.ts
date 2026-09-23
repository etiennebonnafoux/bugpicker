import type { Label } from "../shared/messages";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Network error, check your connection");
    this.name = "NetworkError";
  }
}

interface ApiResponse<T> {
  data: T;
  response: Response;
}

async function request<T>(token: string, method: string, pathOrUrl: string, body?: unknown): Promise<ApiResponse<T>> {
  const url = pathOrUrl.startsWith(`${API}/`) ? pathOrUrl : `${API}${pathOrUrl}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new NetworkError();
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = (data as { message?: unknown } | null)?.message;
    throw new GitHubError(
      `GitHub ${response.status}: ${typeof message === "string" ? message : response.statusText}`,
      response.status,
      data,
    );
  }
  return { data: data as T, response };
}

const repoPath = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

export interface RepoInfo {
  id: number;
  full_name: string;
  private: boolean;
}

export async function getRepo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  return (await request<RepoInfo>(token, "GET", repoPath(owner, repo))).data;
}

function nextPageUrl(link: string | null): string | null {
  for (const part of link?.split(",") ?? []) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match?.[1]?.startsWith(`${API}/`)) return match[1];
  }
  return null;
}

export async function listLabels(token: string, owner: string, repo: string): Promise<Label[]> {
  const labels: Label[] = [];
  let url: string | null = `${repoPath(owner, repo)}/labels?per_page=100`;
  for (let page = 0; url && page < 20; page++) {
    const { data, response }: ApiResponse<Label[]> = await request<Label[]>(token, "GET", url);
    labels.push(...data.map(({ name, color, description }) => ({ name, color, description })));
    url = nextPageUrl(response.headers.get("Link"));
  }
  return labels;
}

export interface CreatedIssue {
  number: number;
  html_url: string;
}

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  issue: { title: string; body: string; labels: string[] },
): Promise<CreatedIssue> {
  return (await request<CreatedIssue>(token, "POST", `${repoPath(owner, repo)}/issues`, issue)).data;
}

export async function getBranchRef(token: string, owner: string, repo: string, branch: string): Promise<{ object: { sha: string } }> {
  return (await request<{ object: { sha: string } }>(token, "GET", `${repoPath(owner, repo)}/git/ref/heads/${encodePath(branch)}`)).data;
}

export async function createBlob(token: string, owner: string, repo: string, content: string): Promise<string> {
  const { data } = await request<{ sha: string }>(token, "POST", `${repoPath(owner, repo)}/git/blobs`, { content, encoding: "utf-8" });
  return data.sha;
}

export async function createTree(
  token: string,
  owner: string,
  repo: string,
  entries: { path: string; sha: string }[],
): Promise<string> {
  const tree = entries.map(({ path, sha }) => ({ path, sha, mode: "100644", type: "blob" }));
  const { data } = await request<{ sha: string }>(token, "POST", `${repoPath(owner, repo)}/git/trees`, { tree });
  return data.sha;
}

export async function createCommit(
  token: string,
  owner: string,
  repo: string,
  commit: { message: string; tree: string; parents: string[] },
): Promise<string> {
  const { data } = await request<{ sha: string }>(token, "POST", `${repoPath(owner, repo)}/git/commits`, commit);
  return data.sha;
}

export async function createRef(token: string, owner: string, repo: string, ref: string, sha: string): Promise<void> {
  await request(token, "POST", `${repoPath(owner, repo)}/git/refs`, { ref, sha });
}

export async function putContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  file: { message: string; content: string; branch: string },
): Promise<void> {
  await request(token, "PUT", `${repoPath(owner, repo)}/contents/${encodePath(path)}`, file);
}

export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

interface ValidationError {
  resource?: string;
  field?: string;
  code?: string;
  value?: unknown;
  message?: string;
}

function formatValidationErrors(body: unknown): string {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return "";
  return errors
    .map((raw) => {
      if (typeof raw === "string") return raw;
      const e = raw as ValidationError;
      if (e.message) return e.message;
      const value = e.value === undefined ? "" : ` (${JSON.stringify(e.value)})`;
      return [e.resource, e.field, e.code].filter(Boolean).join(" ") + value;
    })
    .join("; ");
}

/** Turns any error into the sentence shown to the user. `repoFullName` enables the no-access wording. */
export function describeError(error: unknown, repoFullName?: string): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof GitHubError) {
    if (error.status === 401) return "Token invalid or expired. Check the options page.";
    const rateLimited = error.status === 403 && /rate limit/i.test(error.message);
    if ((error.status === 403 || error.status === 404) && repoFullName && !rateLimited) {
      return `No access to ${repoFullName} with this token.`;
    }
    if (error.status === 422) {
      const details = formatValidationErrors(error.body);
      return details ? `${error.message} — ${details}` : error.message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
