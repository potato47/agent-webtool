import { adapters } from "./engines/index.ts";
import { fetchWithGuards, WebtoolError } from "./http.ts";
import type { EngineName, RawHit, SearchInput } from "./types.ts";
import { ENGINE_NAMES } from "./types.ts";

const RRF_K = 60;
const PER_ENGINE_TIMEOUT_MS = 15_000;

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
  const html = new TextDecoder("utf-8", { fatal: false }).decode(res.body);
  return adapter.parse(html);
}

interface AggEntry {
  norm: string;
  titles: Map<EngineName, string>;
  snippets: Map<EngineName, string>;
  sources: Array<{ engine: EngineName; rank: number }>;
}

function pickLongest(map: Map<EngineName, string>): string {
  let best = "";
  for (const v of map.values()) if (v.length > best.length) best = v;
  return best;
}

function escapeMd(s: string): string {
  // Light escape for square brackets in titles so the link syntax stays intact.
  return s.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function formatMarkdown(
  results: Array<{ title: string; url: string; snippet: string }>,
  failed: EngineName[],
  noResults: EngineName[],
): string {
  if (results.length === 0) {
    if (failed.length > 0 && noResults.length > 0) {
      return `No results. Engines failed: ${failed.join(", ")}. Engines returned no results: ${noResults.join(", ")}.`;
    }
    if (failed.length > 0) {
      return `No results. All engines failed: ${failed.join(", ")}.`;
    }
    if (noResults.length > 0) {
      return `No results. All engines returned no results: ${noResults.join(", ")}.`;
    }
    return "No results.";
  }
  const lines: string[] = [];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. [${escapeMd(r.title)}](${r.url})`);
    if (r.snippet) lines.push(`   ${r.snippet.replace(/\s+/g, " ").trim()}`);
    lines.push("");
  });
  if (failed.length > 0) {
    lines.push(`> Note: ${failed.length} engine(s) failed — ${failed.join(", ")}.`);
  }
  if (noResults.length > 0) {
    lines.push(
      `> Note: ${noResults.length} engine(s) returned no results — ${noResults.join(", ")}.`,
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Run a multi-engine web search and return results as a markdown list. */
export async function webSearch(raw: SearchInput, deps: SearchDeps = {}): Promise<string> {
  const engines: EngineName[] =
    raw.engines && raw.engines.length > 0 ? raw.engines : [...ENGINE_NAMES];
  const limit = Math.min(Math.max(raw.limit ?? 10, 1), 30);
  const perEnginePull = Math.max(limit, 10);
  const query = buildQuery(raw);

  const settled = await Promise.allSettled(
    engines.map((eng) => fetchEngine(eng, query, raw.timeRange, deps)),
  );

  const failedEngines: EngineName[] = [];
  const noResultEngines: EngineName[] = [];
  const perEngine: Array<{ engine: EngineName; hits: RawHit[] }> = [];
  settled.forEach((r, i) => {
    const eng = engines[i]!;
    if (r.status === "fulfilled") {
      if (r.value.length === 0) noResultEngines.push(eng);
      else perEngine.push({ engine: eng, hits: r.value.slice(0, perEnginePull) });
    } else {
      failedEngines.push(eng);
    }
  });

  // If every engine failed, surface that as an error (caller decides how to handle).
  if (perEngine.length === 0) {
    const detailParts: string[] = [];
    if (failedEngines.length > 0) detailParts.push(`failed: ${failedEngines.join(", ")}`);
    if (noResultEngines.length > 0) detailParts.push(`no results: ${noResultEngines.join(", ")}`);
    throw new WebtoolError(
      "all_engines_failed",
      `All search engines failed or returned no results (${detailParts.join("; ")})`,
    );
  }

  const agg = new Map<string, AggEntry>();
  for (const { engine, hits } of perEngine) {
    for (const hit of hits) {
      const norm = normalizeUrl(hit.url);
      if (!norm) continue;
      let entry = agg.get(norm);
      if (!entry) {
        entry = { norm, titles: new Map(), snippets: new Map(), sources: [] };
        agg.set(norm, entry);
      }
      if (!entry.titles.has(engine)) {
        entry.titles.set(engine, hit.title);
        entry.snippets.set(engine, hit.snippet);
        entry.sources.push({ engine, rank: hit.rank });
      }
    }
  }

  const scored = [...agg.values()]
    .map((e) => ({
      title: pickLongest(e.titles),
      url: e.norm,
      snippet: pickLongest(e.snippets),
      score: e.sources.reduce((a, s) => a + 1 / (RRF_K + s.rank), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return formatMarkdown(scored, failedEngines, noResultEngines);
}
