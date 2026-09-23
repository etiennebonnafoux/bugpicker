import { describe, expect, it } from "vitest";
import { hostFromUrl, normalizePattern, resolveTarget, type SiteMapping } from "../src/shared/site-mapping";

let nextId = 0;
const m = (pattern: string, repo: string, owner?: string): SiteMapping => ({ id: String(nextId++), pattern, repo, owner });

const mappings: SiteMapping[] = [
  m("awesome-project.com", "repo-1"),
  m("other-project.th", "repo-2"),
  m("*.staging.awesome-project.com", "repo-1"),
  m("localhost:5173", "repo-2"),
  m("client-site.ch", "website", "client-org"),
];
const settings = { owner: "my-name", mappings };

const target = (url: string, s = settings) => {
  const t = resolveTarget(url, s);
  return t && `${t.owner}/${t.repo}`;
};

describe("resolveTarget", () => {
  it("resolves the plan's example table", () => {
    expect(target("https://awesome-project.com/page")).toBe("my-name/repo-1");
    expect(target("https://other-project.th")).toBe("my-name/repo-2");
    expect(target("https://app.staging.awesome-project.com")).toBe("my-name/repo-1");
    expect(target("http://localhost:5173/login")).toBe("my-name/repo-2");
    expect(target("https://client-site.ch")).toBe("client-org/website");
  });

  it("matches an exact pattern with and without www.", () => {
    expect(target("https://awesome-project.com")).toBe("my-name/repo-1");
    expect(target("https://www.awesome-project.com")).toBe("my-name/repo-1");
  });

  it("does not let an exact pattern match a subdomain", () => {
    expect(target("https://app.awesome-project.com")).toBeNull();
  });

  it("matches wildcard subdomains at any depth and the bare domain", () => {
    const s = { owner: "o", mappings: [m("*.example.com", "r")] };
    expect(target("https://app.example.com", s)).toBe("o/r");
    expect(target("https://a.b.example.com", s)).toBe("o/r");
    expect(target("https://example.com", s)).toBe("o/r");
    expect(target("https://notexample.com", s)).toBeNull();
  });

  it("prefers an exact pattern over a wildcard", () => {
    const s = { owner: "o", mappings: [m("*.example.com", "wild"), m("app.example.com", "exact")] };
    expect(target("https://app.example.com", s)).toBe("o/exact");
    expect(target("https://other.example.com", s)).toBe("o/wild");
  });

  it("prefers the longer wildcard", () => {
    const s = { owner: "o", mappings: [m("*.example.com", "short"), m("*.staging.example.com", "long")] };
    expect(target("https://x.staging.example.com", s)).toBe("o/long");
    expect(target("https://x.prod.example.com", s)).toBe("o/short");
  });

  it("respects ports", () => {
    const s = { owner: "o", mappings: [m("localhost:5173", "vite"), m("localhost", "any")] };
    expect(target("http://localhost:5173", s)).toBe("o/vite");
    expect(target("http://localhost:3000", s)).toBe("o/any");
    expect(target("http://localhost", s)).toBe("o/any");
    const portOnly = { owner: "o", mappings: [m("localhost:5173", "vite")] };
    expect(target("http://localhost:3000", portOnly)).toBeNull();
  });

  it("ignores case in hostnames and patterns", () => {
    const s = { owner: "o", mappings: [m("Example.COM", "r")] };
    expect(target("https://EXAMPLE.com/Path", s)).toBe("o/r");
  });

  it("uses the owner override, else the global owner", () => {
    expect(target("https://client-site.ch")).toBe("client-org/website");
    expect(target("https://awesome-project.com")).toBe("my-name/repo-1");
  });

  it("follows a change of the global owner", () => {
    const changed = { ...settings, owner: "new-owner" };
    expect(target("https://awesome-project.com", changed)).toBe("new-owner/repo-1");
    expect(target("https://client-site.ch", changed)).toBe("client-org/website");
  });

  it("returns null for non-http pages and unmatched sites", () => {
    expect(target("chrome://extensions")).toBeNull();
    expect(target("file:///home/me/index.html")).toBeNull();
    expect(target("https://unknown.org")).toBeNull();
    expect(target("not a url")).toBeNull();
  });

  it("returns the mapping that matched", () => {
    expect(resolveTarget("https://a.staging.awesome-project.com", settings)?.mapping.pattern).toBe("*.staging.awesome-project.com");
  });
});

describe("normalizePattern", () => {
  it("strips scheme, path, www. and case", () => {
    expect(normalizePattern("https://WWW.Example.com/path?q=1#x")).toBe("example.com");
    expect(normalizePattern("  http://localhost:5173/app ")).toBe("localhost:5173");
    expect(normalizePattern("*.www.example.com")).toBe("*.example.com");
  });
});

describe("hostFromUrl", () => {
  it("keeps non-default ports only", () => {
    expect(hostFromUrl("https://example.com:443/")).toBe("example.com");
    expect(hostFromUrl("http://example.com:8080/")).toBe("example.com:8080");
  });
});
