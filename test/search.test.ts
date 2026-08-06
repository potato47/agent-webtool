import { beforeEach, describe, expect, test } from "bun:test";
import {
  collectedSources,
  normalizeUrl,
  resetSearchSourcesForTest,
  webSearch,
} from "../src/index.ts";
import type { RawFetchResult } from "../src/core/http.ts";

const fixture = (name: string) => Bun.file(`test/fixtures/${name}.html`).text();

beforeEach(() => {
  resetSearchSourcesForTest();
});

async function mockFetch(name: string): Promise<RawFetchResult> {
  const text = await fixture(name);
  return {
    finalUrl: `https://${name}.example/search`,
    status: 200,
    contentType: "text/html",
    body: new TextEncoder().encode(text).buffer as ArrayBuffer,
  };
}

function fetcherFor(
  overrides: Record<string, (url: string) => Promise<RawFetchResult> | Promise<never>> = {},
) {
  return (url: string) => {
    for (const [key, fn] of Object.entries(overrides)) {
      if (url.includes(key)) return fn(url);
    }
    if (url.includes("bing.com")) return mockFetch("bing-rss");
    if (url.includes("baidu.com")) return mockFetch("baidu");
    if (url.includes("wx.sogou.com")) return mockFetch("wechat");
    if (url.includes("so.toutiao.com")) return mockFetch("toutiao");
    if (url.includes("duckduckgo.com")) return mockFetch("duckduckgo");
    if (url.includes("yahoo.com")) return mockFetch("yahoo");
    throw new Error(`unexpected url: ${url}`);
  };
}

describe("normalizeUrl", () => {
  test("strips tracking params, www, trailing slash, fragment, sorts keys", () => {
    expect(
      normalizeUrl("https://www.Example.com/path/?utm_source=x&utm_medium=y&a=1&b=2#frag"),
    ).toBe("https://example.com/path?a=1&b=2");
  });
  test("upgrades http to https", () => {
    expect(normalizeUrl("http://bun.sh/")).toBe("https://bun.sh/");
  });
  test("keeps root slash", () => {
    expect(normalizeUrl("https://bun.sh/")).toBe("https://bun.sh/");
  });
  test("strips fbclid/gclid", () => {
    expect(normalizeUrl("https://example.com/x?fbclid=a&gclid=b&keep=1")).toBe(
      "https://example.com/x?keep=1",
    );
  });
});

describe("webSearch citation output", () => {
  test("returns citation lines with url and content across all engines", async () => {
    const out = await webSearch(
      { query: "bun javascript runtime", limit: 5 },
      { fetch: fetcherFor() as any },
    );
    expect(typeof out).toBe("string");
    // citation lines: [n] title \n url \n content
    expect(out).toMatch(/^\[1\] .+$/m);
    expect(out).toMatch(/\[\d+\] .+\nhttps?:\/\/\S+\n/m);
    expect(out.toLowerCase()).toContain("bun");
    // no JSON noise
    expect(out).not.toContain('"sources"');
    expect(out).not.toContain('"score"');
  });

  test("renders engine metadata inline", async () => {
    const out = await webSearch(
      { query: "bun", engines: ["wechat"] },
      { fetch: fetcherFor() as any },
    );
    expect(out).toMatch(/^\[1\] .+\(.+\)$/m);
  });

  test("partial failure appends a failed footer note", async () => {
    const out = await webSearch(
      { query: "bun javascript runtime" },
      { fetch: fetcherFor({ "bing.com": () => Promise.reject(new Error("boom")) }) as any },
    );
    expect(out).toMatch(/^\[1\] /m);
    expect(out).toContain("> Note: 1 engine(s) failed — bing.");
  });

  test("empty parsed results append a no-results footer note", async () => {
    const emptyPage = {
      finalUrl: "https://toutiao.example/search",
      status: 200,
      contentType: "text/html",
      body: new TextEncoder().encode("<html><body>No parseable SERP hits</body></html>")
        .buffer as ArrayBuffer,
    };
    const out = await webSearch(
      { query: "bun javascript runtime" },
      { fetch: fetcherFor({ "so.toutiao.com": () => Promise.resolve(emptyPage) }) as any },
    );
    expect(out).toMatch(/^\[1\] /m);
    expect(out).toContain("> Note: 1 engine(s) returned no results — toutiao.");
  });

  test("no results reports per-engine status", async () => {
    const emptyPage = {
      finalUrl: "https://x.example/search",
      status: 200,
      contentType: "text/html",
      body: new TextEncoder().encode("<html><body>nothing</body></html>").buffer as ArrayBuffer,
    };
    const out = await webSearch(
      { query: "zzz no such thing", engines: ["duckduckgo", "bing"] },
      { fetch: () => Promise.resolve(emptyPage) },
    );
    expect(out).toContain("No results. Engine status:");
    expect(out).toContain("duckduckgo: 0 results");
    expect(out).toContain("bing: 0 results");
  });

  test("engines subset is honored", async () => {
    const calls: string[] = [];
    const fetcher = (url: string) => {
      calls.push(url);
      if (url.includes("duckduckgo.com")) return mockFetch("duckduckgo");
      throw new Error(`unexpected: ${url}`);
    };
    const out = await webSearch(
      { query: "bun runtime", engines: ["duckduckgo"] },
      { fetch: fetcher },
    );
    expect(calls.length).toBe(1);
    expect(out).toMatch(/^\[1\] /m);
  });

  test("limit caps final count", async () => {
    const out = await webSearch({ query: "bun", limit: 3 }, { fetch: fetcherFor() as any });
    const numbered = out.match(/^\[\d+\] /gm) ?? [];
    expect(numbered.length).toBeLessThanOrEqual(3);
    expect(numbered.length).toBeGreaterThan(0);
  });

  test("throws when all engines fail", async () => {
    const fetcher = () => Promise.reject(new Error("blocked"));
    const out = await webSearch({ query: "x" }, { fetch: fetcher as any });
    expect(out).toContain("No results. Engine status:");
    expect(out).toContain("duckduckgo: blocked");
    expect(out).toContain("bing: blocked");
  });

  test("citation ids stay stable across calls and populate collectedSources", async () => {
    const fetchMock = fetcherFor() as any;
    const first = await webSearch({ query: "bun", limit: 3 }, { fetch: fetchMock });
    const second = await webSearch({ query: "bun", limit: 3 }, { fetch: fetchMock });
    const ids = [...first.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1]!);
    const secondIds = [...second.matchAll(/^\[(\d+)\]/gm)].map((m) => m[1]!);
    // Overlapping URLs reuse earlier ids instead of renumbering.
    expect(secondIds[0]).toBe(ids[0]);
    const sources = collectedSources();
    expect(sources.length).toBeGreaterThan(0);
    const allIds = sources.map((s) => s.id ?? 0);
    expect(allIds).toEqual([...allIds].sort((a, b) => a - b));
  });
});
