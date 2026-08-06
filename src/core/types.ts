export const ENGINE_NAMES = ["duckduckgo", "bing", "brave", "yahoo"] as const;
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
}

export interface SearchAdapter {
  name: EngineName;
  buildUrl(query: string, opts: { timeRange?: TimeRange }): string;
  parse(html: string): RawHit[];
}
