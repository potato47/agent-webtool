export const ENGINE_NAMES = ["baidu", "wechat", "toutiao", "duckduckgo"] as const;
export type EngineName = (typeof ENGINE_NAMES)[number];

export type FetchFormat = "markdown" | "text" | "html";

export interface FetchInput {
  url: string;
  format?: FetchFormat;
  maxBytes?: number;
  timeoutMs?: number;
}

export type TimeRange = "day" | "week" | "month" | "year";

export interface SearchInput {
  query: string;
  engines?: readonly EngineName[];
  limit?: number;
  timeRange?: TimeRange;
  site?: string;
  /** Per-engine request timeout in milliseconds. Defaults to 3000. */
  timeoutMs?: number;
}

/** Internal: a single parsed result from one search engine. */
export interface RawHit {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  /** Extra per-engine metadata, e.g. WeChat account name or Toutiao source. */
  meta?: Record<string, string>;
}

/** A merged, citation-numbered result surfaced to the caller. */
export interface SearchResult {
  title: string;
  url: string;
  /** Search-result summary. */
  snippet: string;
  score: number;
  /** Which engines returned this URL (in their result order). */
  engines: EngineName[];
  /** Extra per-engine metadata, e.g. WeChat account name or Toutiao source. */
  meta: Record<string, string>;
  /** Global citation number assigned within this process (1-based across all web_search/web_fetch calls). */
  id: number;
  /** Whether the full page was fetched via web_fetch. */
  fetched: boolean;
}

export interface EngineStatus {
  engine: EngineName;
  status: "success" | "no_results" | "invalid_results" | "error";
  ok: boolean;
  /** Number of results accepted after validation. */
  count: number;
  /** Number of results returned by the engine parser before validation. */
  rawCount: number;
  error?: string;
}

/** Structured result for one search call; safe to consume under concurrency. */
export interface SearchResponse {
  text: string;
  results: SearchResult[];
  engines: EngineStatus[];
}

export interface SearchAdapter {
  name: EngineName;
  buildUrl(query: string, opts?: { timeRange?: TimeRange }): string;
  parse(html: string): RawHit[];
}
