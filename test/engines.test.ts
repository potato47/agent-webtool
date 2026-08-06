import { describe, expect, test } from "bun:test";
import { baidu } from "../src/core/engines/baidu.ts";
import { bing } from "../src/core/engines/bing.ts";
import { duckduckgo } from "../src/core/engines/duckduckgo.ts";
import { toutiao } from "../src/core/engines/toutiao.ts";
import { wechat } from "../src/core/engines/wechat.ts";
import { yahoo } from "../src/core/engines/yahoo.ts";

const fixture = (name: string) => Bun.file(`test/fixtures/${name}.html`).text();

describe("bing adapter (RSS)", () => {
  test("parses ≥5 hits with direct URLs", async () => {
    const hits = bing.parse(await fixture("bing-rss"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(h.url).not.toContain("bing.com");
      expect(typeof h.snippet).toBe("string");
    }
  });
  test("carries pubDate metadata", async () => {
    const hits = bing.parse(await fixture("bing-rss"));
    expect(hits.some((h) => h.meta?.pubDate)).toBe(true);
  });
  test("build URL uses rss format", () => {
    const u = bing.buildUrl("hello world");
    expect(u).toContain("format=rss");
    expect(u).toContain("count=30");
  });
});

describe("baidu adapter", () => {
  test("parses ≥5 hits with real URLs", async () => {
    const hits = baidu.parse(await fixture("baidu"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
    }
  });
});

describe("wechat adapter (Sogou)", () => {
  test("parses ≥5 hits with Sogou stub URLs", async () => {
    const hits = wechat.parse(await fixture("wechat"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https:\/\/wx\.sogou\.com\/link\?url=/);
      expect(typeof h.snippet).toBe("string");
    }
  });
  test("carries account metadata", async () => {
    const hits = wechat.parse(await fixture("wechat"));
    expect(hits.some((h) => (h.meta?.account ?? "").length > 0)).toBe(true);
  });
});

describe("toutiao adapter", () => {
  test("parses ≥5 hits with unwrapped URLs", async () => {
    const hits = toutiao.parse(await fixture("toutiao"));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const h of hits) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.url).toMatch(/^https?:\/\//);
      expect(h.url).not.toContain("/search/jump");
    }
  });
  test("carries source metadata", async () => {
    const hits = toutiao.parse(await fixture("toutiao"));
    expect(hits.some((h) => (h.meta?.source ?? "").length > 0)).toBe(true);
  });
});

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
