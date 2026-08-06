import { describe, expect, test } from "bun:test";
import { duckduckgo } from "../src/core/engines/duckduckgo.ts";
import { bing } from "../src/core/engines/bing.ts";
import { brave } from "../src/core/engines/brave.ts";
import { yahoo } from "../src/core/engines/yahoo.ts";

const fixture = (name: string) => Bun.file(`test/fixtures/${name}.html`).text();

describe("duckduckgo adapter", () => {
  test("parses ≥5 hits with unwrapped URLs", async () => {
    const hits = duckduckgo.parse(await fixture("duckduckgo"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(h.url).not.toContain("duckduckgo.com/l/");
      expect(typeof h.snippet).toBe("string");
    }
  });
  test("build URL passes time filter", () => {
    const u = duckduckgo.buildUrl("hello world", { timeRange: "week" });
    expect(u).toContain("q=hello+world");
    expect(u).toContain("df=w");
  });
});

describe("bing adapter", () => {
  test("parses ≥5 hits with base64-decoded URLs", async () => {
    const hits = bing.parse(await fixture("bing"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(h.url).not.toContain("bing.com/ck/a");
      expect(typeof h.snippet).toBe("string");
    }
  });
});

describe("brave adapter", () => {
  test("parses ≥5 hits with real URLs", async () => {
    const hits = brave.parse(await fixture("brave"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
    }
    // At least one snippet should be populated for fresh results
    expect(hits.some((h) => h.snippet.length > 0)).toBe(true);
  });
});

describe("yahoo adapter", () => {
  test("parses ≥5 hits with unwrapped URLs", async () => {
    const hits = yahoo.parse(await fixture("yahoo"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(h.url).not.toContain("r.search.yahoo.com");
    }
  });
});
