import {
  ENGINE_NAMES,
  collectedSources,
  webFetch,
  webSearch,
  type FetchDeps,
  type FetchInput,
  type SearchDeps,
  type SearchInput,
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
};
const fetchDeps: FetchDeps = {};
const searchDeps: SearchDeps = {};

const fetched: Promise<string> = webFetch(fetchInput, fetchDeps);
const searched: Promise<string> = webSearch(searchInput, searchDeps);
const sources: SearchResult[] = collectedSources();

void fetched;
void searched;
void sources;
