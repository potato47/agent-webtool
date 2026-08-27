import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import TurndownService from "turndown";
import { LRUCache } from "./cache.ts";
import { decodeBody, decodeSogouLink } from "./decode.ts";
import { fetchWithGuards, WebtoolError } from "./http.ts";
import { registerFetchedPage } from "./search.ts";
import type { FetchFormat, FetchInput } from "./types.ts";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

const STRIP_SELECTORS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "aside",
  "noscript",
  "form",
  ".nav",
  ".header",
  ".footer",
  ".sidebar",
];

const CONTENT_CANDIDATES = [
  "article",
  "main",
  '[role="main"]',
  "#main-content",
  ".post-content",
  ".entry-content",
  ".markdown-body",
  "#bodyContent",
  "#js_content", // WeChat article body
  ".rich_media_content",
];

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

/** Pick the main-content node: first candidate with substantial text, else body. */
function extractHost($: CheerioAPI): Cheerio<AnyNode> {
  for (const sel of CONTENT_CANDIDATES) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el;
  }
  return $("body").first();
}

function prepareDocument(html: string): { $: CheerioAPI; host: Cheerio<AnyNode> } {
  const $ = cheerio.load(html);
  const host = extractHost($);
  for (const sel of STRIP_SELECTORS) {
    host.find(sel).remove();
  }
  return { $, host };
}

function htmlToText($: CheerioAPI, host: Cheerio<AnyNode>): string {
  const text = host.text() || $.root().text();
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(host: Cheerio<AnyNode>): string {
  return getTurndown().turndown(host.html() ?? "");
}

function extractTitle($: CheerioAPI): string {
  return (
    $("title").first().text().trim() || $("#activity-name, .rich_media_title").first().text().trim()
  );
}

export interface FetchDeps {
  fetch?: typeof fetchWithGuards;
  signal?: AbortSignal;
}

/** Fetch a URL and return its content as a plain string (markdown by default). */
export async function webFetch(raw: FetchInput, deps: FetchDeps = {}): Promise<string> {
  const format: FetchFormat = raw.format ?? "markdown";
  const maxBytes = raw.maxBytes ?? 100_000;
  const timeoutMs = raw.timeoutMs ?? 30_000;
  const cacheKey = `${raw.url}::${format}::${maxBytes}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const fetcher = deps.fetch ?? fetchWithGuards;
  const result = await fetcher(raw.url, {
    timeoutMs,
    redirect: "same-origin",
    signal: deps.signal,
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

  const isHtml = result.contentType.includes("text/html");
  let html = decodeBody(result);
  // Sogou /link is a JS-redirect stub, not an HTTP 3xx — resolve it to the real article.
  const real = decodeSogouLink(raw.url, html);
  if (real && real !== raw.url) {
    const resolved = await fetcher(real, {
      timeoutMs,
      redirect: "same-origin",
      signal: deps.signal,
    });
    if (!resolved.redirect && !looksBinary(resolved.contentType)) {
      html = decodeBody(resolved);
    }
  }

  let out: string;
  if (format === "html" || !isHtml) {
    out = html;
  } else {
    const { $, host } = prepareDocument(html);
    out = format === "text" ? htmlToText($, host) : htmlToMarkdown(host);
  }

  const title = isHtml ? extractTitle(cheerio.load(html)) : "";
  registerFetchedPage(raw.url, title);

  out = truncate(out, maxBytes);
  cache.set(cacheKey, out, new TextEncoder().encode(out).byteLength);
  return out;
}

export function clearFetchCache(): void {
  cache.clear();
}
