import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { LRUCache } from "./cache.ts";
import { fetchWithGuards, WebtoolError } from "./http.ts";
import type { FetchFormat, FetchInput } from "./types.ts";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

const cache = new LRUCache<string>({
  maxEntries: CACHE_MAX_ENTRIES,
  maxBytes: CACHE_MAX_BYTES,
  ttlMs: CACHE_TTL_MS,
});

let turndownInstance: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
  }
  return turndownInstance;
}

function looksBinary(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/") ||
    ct.startsWith("font/") ||
    ct.includes("application/pdf") ||
    ct.includes("application/zip") ||
    ct.includes("application/octet-stream")
  );
}

function truncate(s: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(s);
  if (encoded.byteLength <= maxBytes) return s;
  const cut = encoded.slice(0, maxBytes);
  return new TextDecoder("utf-8").decode(cut) + "\n\n[truncated]";
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text() || $.root().text();
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();
  return getTurndown().turndown($.html());
}

export interface FetchDeps {
  fetch?: typeof fetchWithGuards;
}

/** Fetch a URL and return its content as a plain string (markdown by default). */
export async function webFetch(raw: FetchInput, deps: FetchDeps = {}): Promise<string> {
  const format: FetchFormat = raw.format ?? "markdown";
  const maxBytes = raw.maxBytes ?? 100_000;
  const timeoutMs = raw.timeoutMs ?? 30_000;
  const cacheKey = `${raw.url}::${format}::${maxBytes}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = await (deps.fetch ?? fetchWithGuards)(raw.url, {
    timeoutMs,
    redirect: "same-origin",
  });

  if (result.redirect) {
    const msg =
      `[Redirected to a different host: ${result.redirect.to}]\n` +
      `[Call web_fetch again with the redirect URL to follow.]`;
    cache.set(cacheKey, msg, msg.length);
    return msg;
  }

  if (looksBinary(result.contentType) && format !== "html") {
    throw new WebtoolError(
      "binary_content",
      `Binary content (${result.contentType}, ${result.body.byteLength}B) cannot be converted to ${format}. ` +
        `Use format="html" to fetch raw bytes if you need them.`,
    );
  }

  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(result.body);
  let out: string;
  if (format === "html") {
    out = decoded;
  } else if (format === "text") {
    out = result.contentType.includes("text/html") ? htmlToText(decoded) : decoded;
  } else {
    out = result.contentType.includes("text/html") ? htmlToMarkdown(decoded) : decoded;
  }

  out = truncate(out, maxBytes);
  cache.set(cacheKey, out, new TextEncoder().encode(out).byteLength);
  return out;
}

export function clearFetchCache(): void {
  cache.clear();
}
