import { beforeEach, describe, expect, test } from "bun:test";
import {
  ENGINE_NAMES,
  clearCollectedSources,
  collectedSources,
  normalizeUrl,
  webSearch,
} from "../src/index.ts";
import type { FetchOptions, RawFetchResult } from "../src/core/http.ts";
import type { SearchDeps, SearchInput } from "../src/index.ts";

const fixture = (name: string) => Bun.file(`test/fixtures/${name}.html`).text();

beforeEach(() => {
  clearCollectedSources();
});

async function mockFetch(name: string): Promise<RawFetchResult> {
  return rawResponse(await fixture(name));
}

function fetcherFor(
  overrides: Record<string, (url: string) => Promise<RawFetchResult> | Promise<never>> = {},
) {
  return (url: string) => {
    for (const [key, fn] of Object.entries(overrides)) {
      if (url.includes(key)) return fn(url);
    }
    if (url.includes("baidu.com")) return mockFetch("baidu");
    if (url.includes("wx.sogou.com")) return mockFetch("wechat");
    if (url.includes("so.toutiao.com")) return mockFetch("toutiao");
    if (url.includes("duckduckgo.com")) return mockFetch("duckduckgo");
    throw new Error(`unexpected url: ${url}`);
  };
}

async function searchText(input: SearchInput, deps: SearchDeps): Promise<string> {
  return (await webSearch(input, deps)).text;
}

function rawResponse(body: string): RawFetchResult {
  return {
    finalUrl: "https://example.com/search",
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: new TextEncoder().encode(body).buffer as ArrayBuffer,
  };
}

function duckDuckGoPage(items: Array<{ title: string; url: string; snippet: string }>): string {
  return items
    .map(
      (item) => `<div class="result">
        <a class="result__a" href="${item.url}">${item.title}</a>
        <div class="result__snippet">${item.snippet}</div>
      </div>`,
    )
    .join("");
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
  test("strips Toutiao tracking parameters", () => {
    expect(
      normalizeUrl(
        "https://toutiao.com/group/123/?channel=x&source=search_tab&traffic_source=y&utm_source=z",
      ),
    ).toBe("https://toutiao.com/group/123");
  });
});

describe("webSearch text output", () => {
  test("returns citation lines across all supported engines", async () => {
    const output = await searchText(
      { query: "bun javascript runtime", limit: 5 },
      { fetch: fetcherFor() },
    );
    expect(output).toMatch(/^\[1\] .+$/m);
    expect(output).toMatch(/\[\d+\] .+\nhttps?:\/\/\S+\n/m);
    expect(output.toLowerCase()).toContain("bun");
  });

  test("renders engine metadata inline", async () => {
    const output = await searchText({ query: "bun", engines: ["wechat"] }, { fetch: fetcherFor() });
    expect(output).toMatch(/^\[1\] .+\(.+\)$/m);
  });

  test("partial failure appends a failed footer note", async () => {
    const output = await searchText(
      { query: "bun javascript runtime", engines: ["baidu", "duckduckgo"] },
      { fetch: fetcherFor({ "baidu.com": () => Promise.reject(new Error("boom")) }) },
    );
    expect(output).toMatch(/^\[1\] /m);
    expect(output).toContain("> Note: 1 engine(s) failed — baidu.");
  });

  test("empty parsed results append a no-results footer note", async () => {
    const emptyPage = rawResponse("<html><body>No parseable SERP hits</body></html>");
    const output = await searchText(
      { query: "bun javascript runtime" },
      { fetch: fetcherFor({ "so.toutiao.com": () => Promise.resolve(emptyPage) }) },
    );
    expect(output).toMatch(/^\[1\] /m);
    expect(output).toContain("> Note: 1 engine(s) returned no results — toutiao.");
  });

  test("no results reports per-engine status", async () => {
    const emptyPage = rawResponse("<html><body>nothing</body></html>");
    const output = await searchText(
      { query: "zzz no such thing", engines: ["duckduckgo", "baidu"] },
      { fetch: () => Promise.resolve(emptyPage) },
    );
    expect(output).toContain("No results. Engine status:");
    expect(output).toContain("duckduckgo: 0 results");
    expect(output).toContain("baidu: 0 results");
  });

  test("engines subset is honored", async () => {
    const calls: string[] = [];
    const output = await searchText(
      { query: "bun runtime", engines: ["duckduckgo"] },
      {
        fetch: (url: string) => {
          calls.push(url);
          return mockFetch("duckduckgo");
        },
      },
    );
    expect(calls).toHaveLength(1);
    expect(output).toMatch(/^\[1\] /m);
  });

  test("reports when all engines fail", async () => {
    const output = await searchText(
      { query: "x" },
      { fetch: () => Promise.reject(new Error("blocked")) },
    );
    expect(output).toContain("No results. Engine status:");
    expect(output).toContain("duckduckgo: blocked");
    expect(output).toContain("baidu: blocked");
  });
});

describe("webSearch structured response", () => {
  test("uses every supported engine by default", async () => {
    const calls: string[] = [];
    const response = await webSearch(
      { query: "bun", limit: 2 },
      {
        fetch: (url: string) => {
          calls.push(new URL(url).hostname);
          return fetcherFor()(url);
        },
      },
    );

    expect(calls.sort()).toEqual(
      ["www.baidu.com", "wx.sogou.com", "so.toutiao.com", "html.duckduckgo.com"].sort(),
    );
    expect(response.engines.map((status) => status.engine)).toEqual([...ENGINE_NAMES]);
  });

  test("returns this call's results with real RRF scores", async () => {
    const response = await webSearch(
      { query: "bun runtime", engines: ["duckduckgo"], limit: 3 },
      { fetch: fetcherFor() },
    );

    expect(response.results).toHaveLength(3);
    expect(response.text).toMatch(/^\[1\] /m);
    for (const item of response.results) {
      expect(item.score).toBeGreaterThan(0);
      expect(item.snippet.length).toBeGreaterThan(0);
      expect(item.meta).toEqual(expect.any(Object));
    }
    expect(collectedSources().every((item) => item.score > 0)).toBe(true);
    expect(response.engines).toEqual([
      {
        engine: "duckduckgo",
        status: "success",
        ok: true,
        count: 10,
        rawCount: 10,
      },
    ]);
  });

  test("drops unrelated hits before ranking", async () => {
    const body = duckDuckGoPage([
      {
        title: "PostgreSQL administration",
        url: "https://example.com/unrelated",
        snippet: "Database tools and documentation",
      },
      {
        title: "Rust async runtime guide",
        url: "https://example.com/relevant",
        snippet: "Build an async executor in Rust",
      },
    ]);
    const response = await webSearch(
      { query: "rust async runtime", engines: ["duckduckgo"] },
      { fetch: async () => rawResponse(body) },
    );

    expect(response.results).toHaveLength(1);
    expect(response.results[0]!.title).toBe("Rust async runtime guide");
    expect(response.results[0]!.score).toBeCloseTo(1 / 61);
    expect(response.engines[0]).toMatchObject({ status: "success", count: 1, rawCount: 2 });
  });

  test("marks an all-unrelated response as invalid", async () => {
    const body = duckDuckGoPage([
      {
        title: "PostgreSQL administration",
        url: "https://example.com/unrelated",
        snippet: "Database tools and documentation",
      },
    ]);
    const response = await webSearch(
      { query: "rust async runtime", engines: ["duckduckgo"] },
      { fetch: async () => rawResponse(body) },
    );

    expect(response.results).toEqual([]);
    expect(response.engines[0]).toMatchObject({
      status: "invalid_results",
      ok: false,
      count: 0,
      rawCount: 1,
    });
    expect(response.text).toContain("none contained a query term");
  });

  test("keeps concurrent result sets isolated", async () => {
    const fetch = async (url: string): Promise<RawFetchResult> => {
      const query = new URL(url).searchParams.get("q") ?? "";
      await Bun.sleep(query === "alpha runtime" ? 10 : 1);
      const slug = query.replace(/\s+/g, "-");
      return rawResponse(
        duckDuckGoPage([
          {
            title: `${query} guide`,
            url: `https://example.com/${slug}`,
            snippet: `Documentation for ${query}`,
          },
        ]),
      );
    };

    const [alpha, beta] = await Promise.all([
      webSearch({ query: "alpha runtime", engines: ["duckduckgo"] }, { fetch }),
      webSearch({ query: "beta runtime", engines: ["duckduckgo"] }, { fetch }),
    ]);

    expect(alpha.results.map((item) => item.title)).toEqual(["alpha runtime guide"]);
    expect(beta.results.map((item) => item.title)).toEqual(["beta runtime guide"]);
  });

  test("passes timeout and cancellation to guarded fetch", async () => {
    let seenTimeout: number | undefined;
    const timeoutResponse = await webSearch(
      { query: "bun", engines: ["duckduckgo"], timeoutMs: 1_234 },
      {
        fetch: async (_url: string, options?: FetchOptions) => {
          seenTimeout = options?.timeoutMs;
          return rawResponse(await fixture("duckduckgo"));
        },
      },
    );
    expect(timeoutResponse.results.length).toBeGreaterThan(0);
    expect(seenTimeout).toBe(1_234);

    const controller = new AbortController();
    const pending = webSearch(
      { query: "bun", engines: ["duckduckgo"] },
      {
        signal: controller.signal,
        fetch: (_url: string, options?: FetchOptions) =>
          new Promise<RawFetchResult>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
              once: true,
            });
          }),
      },
    );
    controller.abort(new Error("cancelled by caller"));
    await expect(pending).rejects.toThrow("cancelled by caller");
  });

  test("keeps citation ids stable and allows clearing the history", async () => {
    const first = await webSearch(
      { query: "bun", engines: ["duckduckgo"], limit: 1 },
      { fetch: fetcherFor() },
    );
    const second = await webSearch(
      { query: "bun", engines: ["duckduckgo"], limit: 1 },
      { fetch: fetcherFor() },
    );
    expect(second.results[0]!.id).toBe(first.results[0]!.id);
    expect(collectedSources()).toHaveLength(1);
    clearCollectedSources();
    expect(collectedSources()).toEqual([]);
  });
});
