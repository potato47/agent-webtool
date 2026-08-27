import {
  ENGINE_NAMES,
  clearCollectedSources,
  collectedSources,
  webFetch,
  webSearch,
  type FetchDeps,
  type FetchInput,
  type SearchDeps,
  type SearchInput,
  type SearchResponse,
  type SearchResult,
} from "agent-webtool";

const fetchInput: FetchInput = {
  url: "https://example.com",
  format: "markdown",
};
const searchInput: SearchInput = {
  query: "agent sdk",
  engines: [ENGINE_NAMES[0]],
  limit: 3,
  timeoutMs: 5_000,
};
const fetchDeps: FetchDeps = {};
const searchDeps: SearchDeps = { signal: new AbortController().signal };

const fetched: Promise<string> = webFetch(fetchInput, fetchDeps);
const searched: Promise<SearchResponse> = webSearch(searchInput, searchDeps);
const sources: SearchResult[] = collectedSources();
clearCollectedSources();

void fetched;
void searched;
void sources;
