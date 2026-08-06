import { decodeBody } from "./decode.ts";
import { adapters } from "./engines/index.ts";
import { fetchWithGuards } from "./http.ts";
import type { EngineName, EngineStatus, RawHit, SearchInput, SearchResult } from "./types.ts";
import { ENGINE_NAMES } from "./types.ts";

const RRF_K = 60;
/** Per-engine timeout so one slow/blocked engine can't stall the whole fan-out. */
const PER_ENGINE_TIMEOUT_MS = 3_000;

const TRACKING_PARAM_PREFIXES = ["utm_", "mc_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "ref",
  "ref_src",
  "spm",
  "yclid",
  "msclkid",
  "_ga",
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
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    else if (TRACKING_PARAM_PREFIXES.some((p) => key.startsWith(p))) u.searchParams.delete(key);
  }
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const newParams = new URLSearchParams();
  for (const [k, v] of sorted) newParams.append(k, v);
  u.search = newParams.toString() ? `?${newParams.toString()}` : "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

export interface SearchDeps {
  fetch?: typeof fetchWithGuards;
}

// Sources collected across all web_search/web_fetch calls in this process, keyed by normalized URL.
const sources = new Map<string, SearchResult>();
let sourceCounter = 0;

/** All web sources seen in this process, ordered by citation id. */
export function collectedSources(): SearchResult[] {
  return [...sources.values()].toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

/** Test helper: reset per-process citation state without reaching into module internals. */
export function resetSearchSourcesForTest(): void {
  sources.clear();
  sourceCounter = 0;
}

function citeResult(r: ScoredResult): SearchResult {
  const key = normalizeUrl(r.url);
  const existing = sources.get(key);
  if (existing) {
    for (const e of r.engines) {
      if (!existing.engines.includes(e)) existing.engines.push(e);
    }
    if (r.meta) existing.meta = { ...r.meta, ...existing.meta };
    if (!existing.title && r.title) existing.title = r.title;
    if (r.content.length > existing.content.length) existing.content = r.content;
    return existing;
  }
  const cited: SearchResult = { ...r, score: 0, id: ++sourceCounter, fetched: false };
  sources.set(key, cited);
  return cited;
}

export function registerFetchedPage(url: string, title: string): SearchResult {
  const key = normalizeUrl(url);
  const existing = sources.get(key);
  if (existing) {
    existing.fetched = true;
    if (!existing.title && title) existing.title = title;
    return existing;
  }
  const cited: SearchResult = {
    id: ++sourceCounter,
    title,
    url,
    content: "",
    score: 0,
    engines: [],
    fetched: true,
  };
  sources.set(key, cited);
  return cited;
}

function buildQuery(input: SearchInput): string {
  let q = input.query.trim();
  if (input.site) q = `${q} site:${input.site}`;
  return q;
}

export interface SearchDeps {
  fetch?: typeof fetchWithGuards;
}

async function fetchEngine(
  engine: EngineName,
  query: string,
  timeRange: SearchInput["timeRange"],
  deps: SearchDeps,
): Promise<RawHit[]> {
  const adapter = adapters[engine];
  const url = adapter.buildUrl(query, { timeRange });
  const res = await (deps.fetch ?? fetchWithGuards)(url, {
    timeoutMs: PER_ENGINE_TIMEOUT_MS,
    redirect: "follow",
  });
  if (res.status >= 400) throw new Error(`${engine} returned HTTP ${res.status}`);
  const html = decodeBody(res);
  return adapter.parse(html);
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
  for (const v of map.values()) if (v.length > best.length) best = v;
  return best;
}

interface ScoredResult {
  title: string;
  url: string;
  content: string;
  engines: EngineName[];
  meta?: Record<string, string>;
}

function formatResults(
  results: ScoredResult[],
  statuses: EngineStatus[],
  failed: EngineName[],
  noResults: EngineName[],
): string {
  let out: string;
  if (results.length === 0) {
    const statusLine = statuses
      .map((s) => `${s.engine}: ${s.ok ? `${s.count} results` : s.error}`)
      .join("; ");
    out = `No results. Engine status: ${statusLine}`;
  } else {
    const lines: string[] = [];
    for (const r of results) {
      const cited = citeResult(r);
      const meta = Object.values(cited.meta ?? {}).join(" · ");
      lines.push(
        `[${cited.id}] ${cited.title}${meta ? ` (${meta})` : ""}\n${cited.url}\n${cited.content}`,
      );
    }
    out = lines.join("\n\n");
  }
  const notes: string[] = [];
  if (failed.length > 0) {
    notes.push(`> Note: ${failed.length} engine(s) failed — ${failed.join(", ")}.`);
  }
  if (noResults.length > 0) {
    notes.push(
      `> Note: ${noResults.length} engine(s) returned no results — ${noResults.join(", ")}.`,
    );
  }
  if (notes.length > 0) out += `\n\n${notes.join("\n")}`;
  return out;
}

/** Run a multi-engine web search and return results with global citation ids. */
export async function webSearch(raw: SearchInput, deps: SearchDeps = {}): Promise<string> {
  const engines: EngineName[] =
    raw.engines && raw.engines.length > 0 ? raw.engines : [...ENGINE_NAMES];
  const limit = Math.min(Math.max(raw.limit ?? 10, 1), 30);
  const perEnginePull = Math.max(limit, 10);
  const query = buildQuery(raw);

  const settled = await Promise.allSettled(
    engines.map((eng) => fetchEngine(eng, query, raw.timeRange, deps)),
  );

  const statuses: EngineStatus[] = [];
  const failedEngines: EngineName[] = [];
  const noResultEngines: EngineName[] = [];
  const perEngine: Array<{ engine: EngineName; hits: RawHit[] }> = [];
  settled.forEach((r, i) => {
    const eng = engines[i]!;
    if (r.status === "fulfilled") {
      if (r.value.length === 0) noResultEngines.push(eng);
      else perEngine.push({ engine: eng, hits: r.value.slice(0, perEnginePull) });
      statuses.push({ engine: eng, ok: true, count: r.value.length });
    } else {
      failedEngines.push(eng);
      statuses.push({ engine: eng, ok: false, count: 0, error: (r.reason as Error).message });
    }
  });

  // If every engine failed, surface that as a "no results" status line.
  if (perEngine.length === 0) {
    return formatResults([], statuses, failedEngines, noResultEngines);
  }

  const agg = new Map<string, AggEntry>();
  for (const { engine, hits } of perEngine) {
    for (const hit of hits) {
      const norm = normalizeUrl(hit.url);
      if (!norm) continue;
      let entry = agg.get(norm);
      if (!entry) {
        entry = { norm, titles: new Map(), snippets: new Map(), sources: [], meta: {} };
        agg.set(norm, entry);
      }
      if (!entry.titles.has(engine)) {
        entry.titles.set(engine, hit.title);
        entry.snippets.set(engine, hit.snippet);
        entry.sources.push({ engine, rank: hit.rank });
        if (hit.meta) entry.meta = { ...hit.meta, ...entry.meta };
      }
    }
  }

  const scored = [...agg.values()]
    .map((e) => ({
      title: pickLongest(e.titles),
      url: e.norm,
      content: pickLongest(e.snippets),
      engines: e.sources.map((s) => s.engine),
      meta: e.meta,
      score: e.sources.reduce((a, s) => a + 1 / (RRF_K + s.rank), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return formatResults(scored, statuses, failedEngines, noResultEngines);
}
