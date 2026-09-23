import { randomId } from "../shared/ids";
import {
  createBlob,
  createCommit,
  createRef,
  createTree,
  encodePath,
  getBranchRef,
  GitHubError,
  putContents,
} from "./github-api";

const BRANCH_README = "Screenshots uploaded by BugPicker. Do not merge.\n";

/**
 * Strategy B: commits the image to an orphan branch through documented APIs and returns a
 * URL that renders inline for anyone who can see the repo, private repos included.
 */
export async function uploadViaBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  file: { base64: string; extension: string },
): Promise<string> {
  await ensureOrphanBranch(token, owner, repo, branch);
  const path = screenshotPath(new Date(), randomId(6), file.extension);
  await putContents(token, owner, repo, path, { message: `Add screenshot ${path}`, content: file.base64, branch });
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodePath(branch)}/${encodePath(path)}?raw=true`;
}

async function ensureOrphanBranch(token: string, owner: string, repo: string, branch: string): Promise<void> {
  try {
    await getBranchRef(token, owner, repo, branch);
    return;
  } catch (error) {
    if (!(error instanceof GitHubError && error.status === 404)) throw error;
  }
  const blob = await createBlob(token, owner, repo, BRANCH_README);
  const tree = await createTree(token, owner, repo, [{ path: "README.md", sha: blob }]);
  const commit = await createCommit(token, owner, repo, { message: "Create screenshot branch", tree, parents: [] });
  try {
    await createRef(token, owner, repo, `refs/heads/${branch}`, commit);
  } catch (error) {
    // 422 "Reference already exists": another upload created it in the meantime.
    if (!(error instanceof GitHubError && error.status === 422)) throw error;
  }
}

/** `screenshots/YYYY/MM/YYYYMMDD-HHmmss-<suffix>.<ext>`, in UTC. */
export function screenshotPath(date: Date, suffix: string, extension: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  const mm = pad(date.getUTCMonth() + 1);
  const stamp = `${yyyy}${mm}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `screenshots/${yyyy}/${mm}/${stamp}-${suffix}.${extension}`;
}
