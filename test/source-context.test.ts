import { beforeEach, expect, test } from "bun:test";
import {
  clearFetchCache,
  clearCollectedSources,
  collectedSources,
  createSourceContext,
  webFetch,
  webSearch,
} from "../src/index.ts";
import type { RawFetchResult } from "../src/core/http.ts";
import type { SearchResult } from "../src/index.ts";
const response = async (): Promise<RawFetchResult> => ({
  finalUrl: "https://example.com/",
  status: 200,
  contentType: "text/html",
  body: new TextEncoder().encode("<title>Example</title><p>Hello</p>").buffer,
});
beforeEach(() => {
  clearFetchCache();
  clearCollectedSources();
});
test("isolated contexts register cached pages and preserve restored ids", async () => {
  const a = createSourceContext(),
    b = createSourceContext();
  await webFetch({ url: "https://example.com/a" }, { fetch: response, sources: a });
  await webFetch(
    { url: "https://example.com/a" },
    {
      fetch: async () => {
        throw new Error("cache miss");
      },
      sources: b,
    },
  );
  expect(a.snapshot()).toEqual(b.snapshot());
  expect(collectedSources()).toEqual([]);
  await webFetch({ url: "https://example.com/b" }, { fetch: response, sources: b });
  expect(a.snapshot()).toHaveLength(1);
  expect(b.snapshot()).toHaveLength(2);
  const restored = createSourceContext(b.snapshot());
  await webFetch({ url: "https://example.com/c" }, { fetch: response, sources: restored });
  expect(restored.snapshot().map((x) => x.id)).toEqual([1, 2, 3]);
  const copy = restored.snapshot();
  copy[0]!.title = "changed";
  expect(restored.snapshot()[0]!.title).toBe("Example");
});
test("concurrent calls are isolated and cancellation does not register cached results", async () => {
  const a = createSourceContext(),
    b = createSourceContext();
  await Promise.all([
    webFetch({ url: "https://example.com/a" }, { fetch: response, sources: a }),
    webFetch({ url: "https://example.com/b" }, { fetch: response, sources: b }),
  ]);
  expect(a.snapshot()[0]!.url).not.toBe(b.snapshot()[0]!.url);
  const controller = new AbortController();
  controller.abort(new Error("stopped"));
  await expect(
    webFetch({ url: "https://example.com/a" }, { sources: b, signal: controller.signal }),
  ).rejects.toThrow("stopped");
  await expect(
    webSearch({ query: "example" }, { sources: b, signal: controller.signal }),
  ).rejects.toThrow("stopped");
  expect(b.snapshot()).toHaveLength(1);
});
test("legacy global API remains available", async () => {
  await webFetch({ url: "https://example.com/global" }, { fetch: response });
  expect(collectedSources()).toHaveLength(1);
  clearCollectedSources();
  await webFetch({ url: "https://example.com/global" }, { fetch: response });
  expect(collectedSources()).toHaveLength(1);
});

const fixture = new URL("./fixtures/duckduckgo.html", import.meta.url);
const searchResponse = async (): Promise<RawFetchResult> => ({
  ...(await response()),
  body: await Bun.file(fixture).arrayBuffer(),
});

test("concurrent searches share IDs only within their own context", async () => {
  const a = createSourceContext();
  const b = createSourceContext();
  const input = { query: "bun", engines: ["duckduckgo"] as const };
  const [first, second, other] = await Promise.all([
    webSearch(input, { fetch: searchResponse, sources: a }),
    webSearch(input, { fetch: searchResponse, sources: a }),
    webSearch(input, { fetch: searchResponse, sources: b }),
  ]);
  expect(first.results.length).toBeGreaterThan(0);
  expect(first.results.map((item) => item.id)).toEqual(second.results.map((item) => item.id));
  expect(first.results[0]!.id).toBe(1);
  expect(other.results[0]!.id).toBe(1);
  expect(a.snapshot()).toHaveLength(first.results.length);
  await webFetch({ url: first.results[0]!.url }, { fetch: response, sources: a });
  expect(a.snapshot()[0]!.fetched).toBe(true);
  expect(b.snapshot()[0]!.fetched).toBe(false);
  a.clear();
  expect(b.snapshot()).toHaveLength(other.results.length);
  expect(collectedSources()).toEqual([]);
});

const saved: SearchResult = {
  id: 5,
  title: "Bun",
  url: "https://bun.sh/",
  snippet: "runtime",
  score: 1,
  engines: ["duckduckgo"],
  meta: { source: "docs" },
  fetched: true,
};

test("restoration and snapshots do not share mutable result fields", async () => {
  const initial = structuredClone(saved);
  const sources = createSourceContext([initial]);
  initial.engines.length = 0;
  initial.meta.source = "changed";
  const snapshot = sources.snapshot();
  snapshot[0]!.engines.length = 0;
  snapshot[0]!.meta.source = "changed again";
  expect(sources.snapshot()).toEqual([saved]);
  await webFetch({ url: "https://example.com/new" }, { fetch: response, sources });
  expect(sources.snapshot().map((item) => item.id)).toEqual([5, 6]);
});

test("restoration rejects ambiguous or invalid citation identities", () => {
  expect(() => createSourceContext([saved, { ...saved, url: "https://example.com/" }])).toThrow(
    "Invalid source snapshot",
  );
  expect(() =>
    createSourceContext([saved, { ...saved, id: 6, url: "http://www.bun.sh/?utm_source=test" }]),
  ).toThrow("Invalid source snapshot");
  for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => createSourceContext([{ ...saved, id }])).toThrow("Invalid source snapshot");
  }
});

test("cancellation after a fetch does not persist a source or cache entry", async () => {
  const controller = new AbortController();
  const sources = createSourceContext();
  const url = "https://example.com/cancelled";
  await expect(
    webFetch(
      { url },
      {
        sources,
        signal: controller.signal,
        fetch: async () => {
          controller.abort(new Error("stopped"));
          return response();
        },
      },
    ),
  ).rejects.toThrow("stopped");
  expect(sources.snapshot()).toEqual([]);
  let calls = 0;
  await webFetch(
    { url },
    {
      sources,
      fetch: async () => {
        calls++;
        return response();
      },
    },
  );
  expect(calls).toBe(1);
});
