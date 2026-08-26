import assert from "node:assert/strict";

import {
  ENGINE_NAMES,
  WebtoolError,
  collectedSources,
  fetchInputSchema,
  normalizeUrl,
  searchInputSchema,
  webFetch,
  webSearch,
} from "agent-webtool";

assert.equal(typeof webFetch, "function");
assert.equal(typeof webSearch, "function");
assert.equal(typeof collectedSources, "function");
assert.equal(typeof normalizeUrl, "function");
assert.equal(typeof WebtoolError, "function");
assert.deepEqual(ENGINE_NAMES, ["bing", "baidu", "wechat", "toutiao", "duckduckgo", "yahoo"]);
assert.equal(fetchInputSchema.parse({ url: "https://example.com" }).format, "markdown");
assert.equal(searchInputSchema.parse({ query: "agent sdk" }).limit, 10);

console.log("ESM SDK smoke test passed");
