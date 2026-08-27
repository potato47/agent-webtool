import { decodeBody } from "./decode.ts";
import { adapters } from "./engines/index.ts";
import { fetchWithGuards } from "./http.ts";
import type {
  EngineName,
  EngineStatus,
  RawHit,
  SearchInput,
  SearchResponse,
  SearchResult,
} from "./types.ts";
import { ENGINE_NAMES } from "./types.ts";

const RRF_K = 60;
/** Per-engine timeout so one slow/blocked engine can't stall the whole fan-out. */
const PER_ENGINE_TIMEOUT_MS = 3_000;

const TRACKING_PARAM_PREFIXES = ["utm_", "mc_", "pk_"];
const TRACKING_PARAMS = new Set([
  "_ga",
  "_hsenc",
  "_hsmi",
  "fbclid",
  "gclid",
  "igshid",
  "msclkid",
  "ref",
  "ref_src",
  "s_cid",
  "spm",
  "yclid",
]);
const TOUTIAO_TRACKING_PARAMS = new Set([
  "channel",
  "in_ogs",
  "in_tfs",
  "original_source",
  "source",
  "traffic_source",
  "upstream_biz",
]);

export function normalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  for (const key of Array.from(u.searchParams.keys())) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) u.searchParams.delete(key);
    else if (TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      u.searchParams.delete(key);
    } else if (u.hostname.endsWith("toutiao.com") && TOUTIAO_TRACKING_PARAMS.has(lower)) {
      u.searchParams.delete(key);
    }
  }
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const newParams = new URLSearchParams();
  for (const [key, value] of sorted) newParams.append(key, value);
  u.search = newParams.toString() ? `?${newParams.toString()}` : "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

export interface SearchDeps {
  fetch?: typeof fetchWithGuards;
  signal?: AbortSignal;
}

// Sources collected across all web_search/web_fetch calls in this process, keyed by normalized URL.
const sources = new Map<string, SearchResult>();
let sourceCounter = 0;

function cloneResult(result: SearchResult): SearchResult {
  return {
    ...result,
    engines: [...result.engines],
    meta: { ...result.meta },
  };
}

/** All web sources seen in this process, ordered by citation id. */
export function collectedSources(): SearchResult[] {
  return [...sources.values()].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)).map(cloneResult);
}

/** Clear the process-wide citation index. Call only when no search is in flight. */
export function clearCollectedSources(): void {
  sources.clear();
  sourceCounter = 0;
}

interface ScoredResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
  engines: EngineName[];
  meta: Record<string, string>;
}

function citeResult(result: ScoredResult): SearchResult {
  const key = normalizeUrl(result.url);
  const existing = sources.get(key);
  if (existing) {
    const current: SearchResult = {
      ...result,
      url: key,
      engines: [...result.engines],
      meta: { ...result.meta },
      id: existing.id,
      fetched: existing.fetched,
    };
    const engines = [...existing.engines];
    for (const engine of result.engines) {
      if (!engines.includes(engine)) engines.push(engine);
    }
    const meta = { ...existing.meta, ...result.meta };
    existing.title = result.title || existing.title;
    existing.url = key;
    existing.score = result.score;
    existing.engines = engines;
    existing.meta = meta;
    if (result.snippet.length > existing.snippet.length) {
      existing.snippet = result.snippet;
    }
    return current;
  }
  const cited: SearchResult = {
    ...result,
    url: key,
    id: ++sourceCounter,
    fetched: false,
  };
  sources.set(key, cited);
  return cloneResult(cited);
}

export function registerFetchedPage(url: string, title: string): SearchResult {
  const key = normalizeUrl(url);
  const existing = sources.get(key);
  if (existing) {
    existing.fetched = true;
    if (!existing.title && title) existing.title = title;
    return cloneResult(existing);
  }
  const cited: SearchResult = {
    id: ++sourceCounter,
    title,
    url: key,
    snippet: "",
    score: 0,
    engines: [],
    meta: {},
    fetched: true,
  };
  sources.set(key, cited);
  return cloneResult(cited);
}

function buildQuery(input: SearchInput): string {
  let query = input.query.trim();
  if (input.site) query = `${query} site:${input.site}`;
  return query;
}

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "how",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "with",
]);

function queryTerms(query: string): string[] {
  const tokens =
    query
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu) ?? [];
  const terms = new Set<string>();
  for (const token of tokens) {
    if (QUERY_STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
    const chars = [...token];
    const hasHan = /\p{Script=Han}/u.test(token);
    if (!hasHan && chars.length < 2) continue;
    terms.add(token);
    if (hasHan && chars.length > 2) {
      for (let i = 0; i < chars.length - 1; i++) terms.add(chars.slice(i, i + 2).join(""));
    }
  }
  return [...terms];
}

function filterRelevantHits(query: string, hits: RawHit[]): RawHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return hits;
  return hits
    .filter((hit) => {
      const text = `${hit.title} ${hit.snippet}`.normalize("NFKC").toLocaleLowerCase();
      return terms.some((term) => text.includes(term));
    })
    .map((hit, index) => ({ ...hit, rank: index + 1 }));
}

class InvalidEngineResultsError extends Error {
  constructor(
    engine: EngineName,
    public rawCount: number,
  ) {
    super(`${engine} returned ${rawCount} result(s), but none contained a query term`);
    this.name = "InvalidEngineResultsError";
  }
}

async function fetchEngine(
  engine: EngineName,
  query: string,
  relevanceQuery: string,
  timeRange: SearchInput["timeRange"],
  timeoutMs: number,
  deps: SearchDeps,
): Promise<{ hits: RawHit[]; rawCount: number }> {
  const adapter = adapters[engine];
  const url = adapter.buildUrl(query, { timeRange });
  const response = await (deps.fetch ?? fetchWithGuards)(url, {
    timeoutMs,
    redirect: "follow",
    signal: deps.signal,
  });
  if (response.status >= 400) throw new Error(`${engine} returned HTTP ${response.status}`);
  const parsed = adapter.parse(decodeBody(response));
  const hits = filterRelevantHits(relevanceQuery, parsed);
  if (parsed.length > 0 && hits.length === 0) {
    throw new InvalidEngineResultsError(engine, parsed.length);
  }
  return { hits, rawCount: parsed.length };
}

interface AggEntry {
  norm: string;
  titles: Map<EngineName, string>;
  snippets: Map<EngineName, string>;
  sources: Array<{ engine: EngineName; rank: number }>;
  meta: Record<string, string>;
}

function pickLongest(map: Map<EngineName, string>): string {
  let best = "";
  for (const value of map.values()) if (value.length > best.length) best = value;
  return best;
}

function formatResults(results: SearchResult[], statuses: EngineStatus[]): string {
  let output: string;
  if (results.length === 0) {
    const statusLine = statuses
      .map((status) =>
        status.ok
          ? `${status.engine}: ${status.count} results`
          : `${status.engine}: ${status.error}`,
      )
      .join("; ");
    output = `No results. Engine status: ${statusLine}`;
  } else {
    output = results
      .map((result) => {
        const meta = Object.values(result.meta).join(" · ");
        return `[${result.id}] ${result.title}${meta ? ` (${meta})` : ""}\n${result.url}\n${result.snippet}`;
      })
      .join("\n\n");
  }

  const failed = statuses.filter((status) => !status.ok).map((status) => status.engine);
  const noResults = statuses
    .filter((status) => status.status === "no_results")
    .map((status) => status.engine);
  const notes: string[] = [];
  if (failed.length > 0) {
    notes.push(`> Note: ${failed.length} engine(s) failed — ${failed.join(", ")}.`);
  }
  if (noResults.length > 0) {
    notes.push(
      `> Note: ${noResults.length} engine(s) returned no results — ${noResults.join(", ")}.`,
    );
  }
  if (notes.length > 0) output += `\n\n${notes.join("\n")}`;
  return output;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The search was aborted", "AbortError");
}

/** Run a search and return this call's text, structured results, and per-engine status. */
export async function webSearch(raw: SearchInput, deps: SearchDeps = {}): Promise<SearchResponse> {
  throwIfAborted(deps.signal);
  const engines: EngineName[] =
    raw.engines && raw.engines.length > 0 ? [...raw.engines] : [...ENGINE_NAMES];
  const limit = Math.min(Math.max(raw.limit ?? 10, 1), 30);
  const timeoutMs = Math.min(Math.max(raw.timeoutMs ?? PER_ENGINE_TIMEOUT_MS, 1), 120_000);
  const perEnginePull = Math.max(limit, 10);
  const query = buildQuery(raw);

  const settled = await Promise.allSettled(
    engines.map((engine) => fetchEngine(engine, query, raw.query, raw.timeRange, timeoutMs, deps)),
  );
  throwIfAborted(deps.signal);

  const statuses: EngineStatus[] = [];
  const perEngine: Array<{ engine: EngineName; hits: RawHit[] }> = [];
  settled.forEach((result, index) => {
    const engine = engines[index]!;
    if (result.status === "fulfilled") {
      const { hits, rawCount } = result.value;
      if (hits.length > 0) perEngine.push({ engine, hits: hits.slice(0, perEnginePull) });
      statuses.push({
        engine,
        status: hits.length > 0 ? "success" : "no_results",
        ok: true,
        count: hits.length,
        rawCount,
      });
      return;
    }
    const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    const invalid = error instanceof InvalidEngineResultsError;
    statuses.push({
      engine,
      status: invalid ? "invalid_results" : "error",
      ok: false,
      count: 0,
      rawCount: invalid ? error.rawCount : 0,
      error: error.message,
    });
  });

  const aggregate = new Map<string, AggEntry>();
  for (const { engine, hits } of perEngine) {
    for (const hit of hits) {
      const norm = normalizeUrl(hit.url);
      if (!norm) continue;
      let entry = aggregate.get(norm);
      if (!entry) {
        entry = { norm, titles: new Map(), snippets: new Map(), sources: [], meta: {} };
        aggregate.set(norm, entry);
      }
      if (!entry.titles.has(engine)) {
        entry.titles.set(engine, hit.title);
        entry.snippets.set(engine, hit.snippet);
        entry.sources.push({ engine, rank: hit.rank });
        if (hit.meta) entry.meta = { ...entry.meta, ...hit.meta };
      }
    }
  }

  const results = [...aggregate.values()]
    .map<ScoredResult>((entry) => ({
      title: pickLongest(entry.titles),
      url: entry.norm,
      snippet: pickLongest(entry.snippets),
      engines: entry.sources.map((source) => source.engine),
      meta: entry.meta,
      score: entry.sources.reduce((score, source) => score + 1 / (RRF_K + source.rank), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(citeResult);

  return {
    text: formatResults(results, statuses),
    results,
    engines: statuses,
  };
}
