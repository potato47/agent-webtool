import assert from "node:assert/strict";

import {
  ENGINE_NAMES,
  WebtoolError,
  clearCollectedSources,
  collectedSources,
  fetchInputSchema,
  normalizeUrl,
  searchInputSchema,
  webFetch,
  webSearch,
} from "agent-webtool";

assert.equal(typeof webFetch, "function");
assert.equal(typeof webSearch, "function");
assert.equal(typeof clearCollectedSources, "function");
assert.equal(typeof collectedSources, "function");
assert.equal(typeof normalizeUrl, "function");
assert.equal(typeof WebtoolError, "function");
assert.deepEqual(ENGINE_NAMES, ["baidu", "wechat", "toutiao", "duckduckgo"]);
assert.equal(fetchInputSchema.parse({ url: "https://example.com" }).format, "markdown");
assert.equal(searchInputSchema.parse({ query: "agent sdk" }).limit, 10);
assert.equal(searchInputSchema.parse({ query: "agent sdk" }).timeoutMs, 3_000);

console.log("ESM SDK smoke test passed");
