import { adapters } from './engines/index.ts'
import { fetchWithGuards } from './http.ts'
import type {
  EngineName,
  RawHit,
  SearchError,
  SearchHit,
  SearchInput,
  SearchOutput,
} from './types.ts'
import { ENGINE_NAMES } from './types.ts'

const RRF_K = 60
const PER_ENGINE_TIMEOUT_MS = 15_000

const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_']
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'ref',
  'ref_src',
  'spm',
  'yclid',
  'msclkid',
  '_ga',
])

export function normalizeUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input)
  } catch {
    return input
  }
  if (u.protocol === 'http:') u.protocol = 'https:'
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
  u.hash = ''
  // strip tracking params
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key)
    else if (TRACKING_PARAM_PREFIXES.some(p => key.startsWith(p))) u.searchParams.delete(key)
  }
  // canonicalize: sort keys
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  const newParams = new URLSearchParams()
  for (const [k, v] of sorted) newParams.append(k, v)
  u.search = newParams.toString() ? `?${newParams.toString()}` : ''
  // strip trailing slash on path (preserve root "/")
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '')
  }
  return u.toString()
}

interface AggKey {
  norm: string
}

interface AggEntry {
  norm: string
  titles: Map<EngineName, string>
  snippets: Map<EngineName, string>
  rawUrls: Map<EngineName, string>
  sources: Array<{ engine: EngineName; rank: number }>
}

function buildQuery(input: SearchInput): string {
  let q = input.query.trim()
  if (input.site) q = `${q} site:${input.site}`
  return q
}

export interface SearchDeps {
  fetch?: typeof fetchWithGuards
  now?: () => number
}

async function fetchEngine(
  engine: EngineName,
  query: string,
  timeRange: SearchInput['timeRange'],
  deps: SearchDeps,
): Promise<RawHit[]> {
  const adapter = adapters[engine]
  const url = adapter.buildUrl(query, { timeRange })
  const res = await (deps.fetch ?? fetchWithGuards)(url, {
    timeoutMs: PER_ENGINE_TIMEOUT_MS,
    redirect: 'follow',
  })
  if (res.status >= 400) {
    throw new Error(`${engine} returned HTTP ${res.status}`)
  }
  const html = new TextDecoder('utf-8', { fatal: false }).decode(res.body)
  return adapter.parse(html)
}

function pickLongest(map: Map<EngineName, string>): string {
  let best = ''
  for (const v of map.values()) {
    if (v.length > best.length) best = v
  }
  return best
}

export async function webSearch(
  raw: SearchInput,
  deps: SearchDeps = {},
): Promise<SearchOutput> {
  const start = (deps.now ?? Date.now)()
  const engines: EngineName[] = (raw.engines && raw.engines.length > 0)
    ? raw.engines
    : [...ENGINE_NAMES]
  const limit = Math.min(Math.max(raw.limit ?? 10, 1), 30)
  const perEnginePull = Math.max(limit, 10)
  const query = buildQuery(raw)

  const settled = await Promise.allSettled(
    engines.map(eng => fetchEngine(eng, query, raw.timeRange, deps)),
  )

  const errors: SearchError[] = []
  const perEngine: Array<{ engine: EngineName; hits: RawHit[] }> = []
  settled.forEach((r, i) => {
    const eng = engines[i]!
    if (r.status === 'fulfilled') {
      if (r.value.length === 0) {
        // Fetch succeeded but parser found no hits — likely a challenge page
        // or a layout change. Report as a partial failure so the caller knows.
        errors.push({ engine: eng, message: 'no results parsed (possible challenge page or layout change)' })
      } else {
        perEngine.push({ engine: eng, hits: r.value.slice(0, perEnginePull) })
      }
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
      errors.push({ engine: eng, message })
    }
  })

  // RRF aggregation, key = normalized URL
  const agg = new Map<string, AggEntry>()
  for (const { engine, hits } of perEngine) {
    for (const hit of hits) {
      const norm = normalizeUrl(hit.url)
      if (!norm) continue
      let entry = agg.get(norm)
      if (!entry) {
        entry = {
          norm,
          titles: new Map(),
          snippets: new Map(),
          rawUrls: new Map(),
          sources: [],
        }
        agg.set(norm, entry)
      }
      // Only first occurrence per engine (defensive against dup hits within one SERP)
      if (!entry.titles.has(engine)) {
        entry.titles.set(engine, hit.title)
        entry.snippets.set(engine, hit.snippet)
        entry.rawUrls.set(engine, hit.url)
        entry.sources.push({ engine, rank: hit.rank })
      }
    }
  }

  const results: SearchHit[] = []
  for (const entry of agg.values()) {
    const score = entry.sources.reduce((acc, s) => acc + 1 / (RRF_K + s.rank), 0)
    results.push({
      title: pickLongest(entry.titles),
      url: entry.norm,
      snippet: pickLongest(entry.snippets),
      score,
      sources: entry.sources.sort((a, b) => a.rank - b.rank),
    })
  }
  results.sort((a, b) => b.score - a.score)
  const top = results.slice(0, limit)

  return {
    query,
    engines,
    results: top,
    errors,
    durationMs: (deps.now ?? Date.now)() - start,
  }
}
