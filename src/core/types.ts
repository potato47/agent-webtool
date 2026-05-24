export const ENGINE_NAMES = ['duckduckgo', 'bing', 'brave', 'yahoo'] as const
export type EngineName = (typeof ENGINE_NAMES)[number]

export type FetchFormat = 'markdown' | 'text' | 'html'

export interface FetchInput {
  url: string
  format?: FetchFormat
  maxBytes?: number
  timeoutMs?: number
}

export interface FetchOutput {
  url: string
  status: number
  contentType: string
  content: string
  bytes: number
  truncated: boolean
  durationMs: number
}

export type TimeRange = 'day' | 'week' | 'month' | 'year'

export interface SearchInput {
  query: string
  engines?: EngineName[]
  limit?: number
  timeRange?: TimeRange
  site?: string
}

export interface RawHit {
  title: string
  url: string
  snippet: string
  rank: number
}

export interface SearchHitSource {
  engine: EngineName
  rank: number
}

export interface SearchHit {
  title: string
  url: string
  snippet: string
  score: number
  sources: SearchHitSource[]
}

export interface SearchError {
  engine: EngineName
  message: string
}

export interface SearchOutput {
  query: string
  engines: EngineName[]
  results: SearchHit[]
  errors: SearchError[]
  durationMs: number
}

export interface SearchAdapter {
  name: EngineName
  buildUrl(query: string, opts: { timeRange?: TimeRange }): string
  parse(html: string): RawHit[]
}
