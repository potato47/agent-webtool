export const ENGINE_NAMES = ["bing", "baidu", "wechat", "toutiao", "duckduckgo", "yahoo"] as const;
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
  engines?: EngineName[];
  limit?: number;
  timeRange?: TimeRange;
  site?: string;
}

/** Internal: a single parsed result from one search engine. */
export interface RawHit {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  /** Extra per-engine metadata, e.g. wechat account name, toutiao source, bing pubDate. */
  meta?: Record<string, string>;
}

/** A merged, citation-numbered result surfaced to the caller. */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  /** Which engines returned this URL (in their result order). */
  engines: EngineName[];
  /** Extra per-engine metadata, e.g. wechat account name, toutiao source, bing pubDate. */
  meta?: Record<string, string>;
  /** Global citation number assigned within this process (1-based across all web_search/web_fetch calls). */
  id?: number;
  /** Whether the full page was fetched via web_fetch. */
  fetched?: boolean;
}

export interface EngineStatus {
  engine: EngineName;
  ok: boolean;
  count: number;
  error?: string;
}

export interface SearchAdapter {
  name: EngineName;
  buildUrl(query: string, opts?: { timeRange?: TimeRange }): string;
  parse(html: string): RawHit[];
}
