import { describe, expect, it } from "vitest";
import { buildIssueBody, screenshotMarkdown, type IssueMeta } from "../src/shared/issue-body";

const meta: IssueMeta = {
  url: "https://app.example.com/orders?id=42",
  pageTitle: "Orders",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0",
  viewport: { width: 1440, height: 900 },
  dpr: 2,
  timestamp: "2026-09-23T10:00:00.000Z",
};

const WEB_URL = "https://github.com/user-attachments/assets/0b7e1c1e-1111-2222-3333-444455556666";
const BRANCH_URL = "https://github.com/me/repo/blob/qa-screenshots/screenshots/2026/09/20260923-100000-abc123.png?raw=true";

describe("buildIssueBody", () => {
  it("renders the full template", () => {
    expect(buildIssueBody({ description: "Button overlaps the footer.", imageMarkdown: screenshotMarkdown(WEB_URL), meta })).toBe(
      [
        "Button overlaps the footer.",
        "",
        `![screenshot](${WEB_URL})`,
        "",
        "<details>",
        "<summary>Environment</summary>",
        "",
        "| | |",
        "|---|---|",
        "| Page | [Orders](<https://app.example.com/orders?id=42>) |",
        "| Browser | Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 |",
        "| Viewport | 1440 × 900 (DPR 2) |",
        "| Reported | 2026-09-23T10:00:00.000Z |",
        "",
        "</details>",
        "",
        "<sub>Filed with BugPicker</sub>",
        "",
      ].join("\n"),
    );
  });

  it("uses a placeholder for an empty description", () => {
    const body = buildIssueBody({ description: "   \n", imageMarkdown: screenshotMarkdown(WEB_URL), meta });
    expect(body.startsWith("_No description provided._\n")).toBe(true);
  });

  it("escapes pipes in table cells", () => {
    const body = buildIssueBody({
      description: "",
      imageMarkdown: screenshotMarkdown(WEB_URL),
      meta: { ...meta, pageTitle: "Orders | Admin", url: "https://example.com/?a=b|c" },
    });
    expect(body).toContain("| Page | [Orders \\| Admin](<https://example.com/?a=b\\|c>) |");
  });

  it("escapes brackets in the page title", () => {
    const body = buildIssueBody({ description: "", imageMarkdown: "", meta: { ...meta, pageTitle: "[beta] Orders" } });
    expect(body).toContain("[\\[beta\\] Orders]");
  });

  it("truncates long page titles to 100 characters", () => {
    const body = buildIssueBody({ description: "", imageMarkdown: "", meta: { ...meta, pageTitle: "x".repeat(150) } });
    expect(body).toContain(`[${"x".repeat(99)}…]`);
    expect(body).not.toContain("x".repeat(100));
  });

  it("falls back to the URL when the page has no title", () => {
    const body = buildIssueBody({ description: "", imageMarkdown: "", meta: { ...meta, pageTitle: "" } });
    expect(body).toContain("| Page | [https://app.example.com/orders?id=42](<https://app.example.com/orders?id=42>) |");
  });

  it("works with both image URL styles", () => {
    for (const url of [WEB_URL, BRANCH_URL]) {
      const body = buildIssueBody({ description: "d", imageMarkdown: screenshotMarkdown(url), meta });
      expect(body).toContain(`\n![screenshot](${url})\n`);
    }
  });

  it("formats fractional DPR", () => {
    const body = buildIssueBody({ description: "", imageMarkdown: "", meta: { ...meta, dpr: 1.2500000001 } });
    expect(body).toContain("(DPR 1.25)");
  });
});
