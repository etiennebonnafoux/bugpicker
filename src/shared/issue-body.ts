export interface IssueMeta {
  url: string;
  pageTitle: string;
  userAgent: string;
  viewport: { width: number; height: number };
  dpr: number;
  timestamp: string;
}

export interface IssueBodyInput {
  description: string;
  imageMarkdown: string;
  meta: IssueMeta;
}

export const MAX_PAGE_TITLE_LENGTH = 100;

export function screenshotMarkdown(url: string): string {
  return `![screenshot](${url})`;
}

export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

export function escapeTableCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, "\\$&");
}

function escapeLinkDestination(url: string): string {
  return url.replace(/[<> ]/g, (c) => encodeURIComponent(c));
}

function formatDpr(dpr: number): string {
  return String(Number(dpr.toFixed(2)));
}

export function buildIssueBody({ description, imageMarkdown, meta }: IssueBodyInput): string {
  const title = truncate(meta.pageTitle.trim() || meta.url, MAX_PAGE_TITLE_LENGTH);
  const page = `[${escapeLinkText(title)}](<${escapeLinkDestination(meta.url)}>)`;
  const rows = [
    ["Page", page],
    ["Browser", meta.userAgent],
    ["Viewport", `${meta.viewport.width} × ${meta.viewport.height} (DPR ${formatDpr(meta.dpr)})`],
    ["Reported", meta.timestamp],
  ];
  return [
    description.trim() || "_No description provided._",
    "",
    imageMarkdown,
    "",
    "<details>",
    "<summary>Environment</summary>",
    "",
    "| | |",
    "|---|---|",
    ...rows.map(([name, value]) => `| ${name} | ${escapeTableCell(value ?? "")} |`),
    "",
    "</details>",
    "",
    "<sub>Filed with BugPicker</sub>",
    "",
  ].join("\n");
}
