export { webFetch, clearFetchCache } from "./core/fetch.ts";
export { webSearch, normalizeUrl, collectedSources, clearCollectedSources } from "./core/search.ts";
export { WebtoolError } from "./core/http.ts";
export type {
  FetchInput,
  SearchInput,
  EngineName,
  FetchFormat,
  TimeRange,
  SearchResult,
  SearchResponse,
  EngineStatus,
} from "./core/types.ts";
export type { FetchDeps } from "./core/fetch.ts";
export type { SearchDeps } from "./core/search.ts";
export { ENGINE_NAMES } from "./core/types.ts";
export { fetchInputSchema, searchInputSchema } from "./schemas.ts";
