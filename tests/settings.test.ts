import { describe, expect, it } from "vitest";
import { preselectLabels } from "../src/shared/label-selection";
import { parseContentRequest } from "../src/shared/messages";
import { screenshotPath } from "../src/background/upload-branch";
import {
  defaultSettings,
  exportSettings,
  isValidBranchName,
  isValidOwner,
  parseImportedSettings,
  parseLabelList,
  validateMapping,
} from "../src/shared/settings";

describe("validateMapping", () => {
  const existing = [{ id: "a", pattern: "example.com", repo: "site" }];

  it("normalizes the pattern and drops an owner equal to the global one", () => {
    const result = validateMapping({ pattern: "https://www.New.com/x", repo: "r", owner: "Me", defaultLabels: [] }, existing, "me");
    expect(result).toMatchObject({ mapping: { pattern: "new.com", repo: "r" } });
    expect("mapping" in result && result.mapping.owner).toBeUndefined();
  });

  it("keeps a real owner override", () => {
    const result = validateMapping({ pattern: "c.ch", repo: "r", owner: "client-org", defaultLabels: ["bug"] }, existing, "me");
    expect(result).toMatchObject({ mapping: { owner: "client-org", defaultLabels: ["bug"] } });
  });

  it("rejects duplicates, bad repo names and empty patterns", () => {
    expect(validateMapping({ pattern: "WWW.example.com", repo: "r", owner: "", defaultLabels: [] }, existing, "me")).toHaveProperty("error");
    expect(validateMapping({ pattern: "x.com", repo: "bad name", owner: "", defaultLabels: [] }, existing, "me")).toHaveProperty("error");
    expect(validateMapping({ pattern: "  ", repo: "r", owner: "", defaultLabels: [] }, existing, "me")).toHaveProperty("error");
  });

  it("lets a mapping keep its own pattern when edited", () => {
    expect(validateMapping({ id: "a", pattern: "example.com", repo: "other", owner: "", defaultLabels: [] }, existing, "me")).toHaveProperty(
      "mapping",
    );
  });
});

describe("names", () => {
  it("validates owners like GitHub", () => {
    expect(isValidOwner("my-name")).toBe(true);
    expect(isValidOwner("-bad")).toBe(false);
    expect(isValidOwner("bad-")).toBe(false);
    expect(isValidOwner("a--b")).toBe(false);
    expect(isValidOwner("x".repeat(40))).toBe(false);
  });

  it("validates branch names", () => {
    expect(isValidBranchName("qa-screenshots")).toBe(true);
    expect(isValidBranchName("qa/screens")).toBe(true);
    expect(isValidBranchName("bad..name")).toBe(false);
    expect(isValidBranchName("x.lock")).toBe(false);
    expect(isValidBranchName("with space")).toBe(false);
  });

  it("parses label lists", () => {
    expect(parseLabelList(" bug, qa ,, Bug,ui ")).toEqual(["bug", "qa", "ui"]);
  });
});

describe("export / import", () => {
  it("never exports the token", () => {
    const exported = exportSettings({ ...defaultSettings(), owner: "me", token: "secret", lastLabels: { "me/r": ["bug"] } });
    expect(JSON.stringify(exported)).not.toContain("secret");
    expect(exported).not.toHaveProperty("lastLabels");
  });

  it("round-trips and ignores a token in the file", () => {
    const settings = { ...defaultSettings(), owner: "me", mappings: [{ id: "1", pattern: "a.com", repo: "r" }] };
    const parsed = parseImportedSettings(JSON.stringify({ ...exportSettings(settings), token: "stolen" }));
    expect(parsed).not.toHaveProperty("token");
    expect(parsed.mappings?.[0]).toMatchObject({ pattern: "a.com", repo: "r" });
    expect(parsed.owner).toBe("me");
  });

  it("rejects malformed files", () => {
    expect(() => parseImportedSettings("[]")).toThrow();
    expect(() => parseImportedSettings(JSON.stringify({ uploadStrategy: "ftp" }))).toThrow();
    expect(() => parseImportedSettings(JSON.stringify({ mappings: [{ pattern: "a.com" }] }))).toThrow();
  });
});

describe("preselectLabels", () => {
  const available = ["bug", "UI", "qa"];

  it("prefers the last selection for the repo, even an empty one", () => {
    expect(preselectLabels(available, ["qa"], ["bug"], ["ui"])).toEqual(["qa"]);
    expect(preselectLabels(available, [], ["bug"], ["ui"])).toEqual([]);
  });

  it("falls back to mapping defaults, then global defaults", () => {
    expect(preselectLabels(available, undefined, ["bug"], ["ui"])).toEqual(["bug"]);
    expect(preselectLabels(available, undefined, [], ["ui"])).toEqual(["UI"]);
  });

  it("drops labels the repo doesn't have", () => {
    expect(preselectLabels(available, ["bug", "gone"], undefined, [])).toEqual(["bug"]);
  });
});

describe("parseContentRequest", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const submit = {
    type: "submit-issue",
    submissionId: "abc",
    owner: "me",
    repo: "r",
    title: "t",
    description: "",
    labels: ["bug"],
    screenshotDataUrl: png,
    meta: { url: "https://x", pageTitle: "", userAgent: "ua", viewport: { width: 1, height: 1 }, dpr: 1, timestamp: "now" },
  };

  it("accepts well-formed messages", () => {
    expect(parseContentRequest(submit)).not.toBeNull();
    expect(parseContentRequest({ type: "capture-area", rect: { x: 0, y: 0, width: 10, height: 10 }, dpr: 1, viewport: { width: 5, height: 5 } })).not.toBeNull();
  });

  it("rejects unknown types and bad fields", () => {
    expect(parseContentRequest({ type: "get-token" })).toBeNull();
    expect(parseContentRequest(null)).toBeNull();
    expect(parseContentRequest({ ...submit, labels: "bug" })).toBeNull();
    expect(parseContentRequest({ ...submit, screenshotDataUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseContentRequest({ type: "capture-area", rect: { x: 0, y: 0, width: Number.NaN, height: 1 }, dpr: 1, viewport: { width: 5, height: 5 } })).toBeNull();
  });
});

describe("screenshotPath", () => {
  it("uses the UTC date layout from the plan", () => {
    expect(screenshotPath(new Date("2026-09-03T07:05:09Z"), "abc123", "png")).toBe("screenshots/2026/09/20260903-070509-abc123.png");
  });
});
