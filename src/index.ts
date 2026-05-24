export { webFetch, clearFetchCache } from './core/fetch.ts'
export { webSearch, normalizeUrl } from './core/search.ts'
export { WebtoolError } from './core/http.ts'
export type {
  FetchInput,
  FetchOutput,
  SearchInput,
  SearchOutput,
  SearchHit,
  SearchError,
  EngineName,
} from './core/types.ts'
export { ENGINE_NAMES } from './core/types.ts'
export {
  fetchInputSchema,
  fetchOutputSchema,
  searchInputSchema,
  searchOutputSchema,
} from './schemas.ts'
