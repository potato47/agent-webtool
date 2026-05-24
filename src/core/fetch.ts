import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import { LRUCache } from './cache.ts'
import { fetchWithGuards, WebtoolError } from './http.ts'
import type { FetchInput, FetchOutput, FetchFormat } from './types.ts'

const CACHE_TTL_MS = 15 * 60 * 1000
const CACHE_MAX_ENTRIES = 256
const CACHE_MAX_BYTES = 50 * 1024 * 1024

const cache = new LRUCache<FetchOutput>({
  maxEntries: CACHE_MAX_ENTRIES,
  maxBytes: CACHE_MAX_BYTES,
  ttlMs: CACHE_TTL_MS,
})

// Lazy turndown singleton; turndown carries domino which is ~1MB.
let turndownInstance: TurndownService | null = null
function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    })
  }
  return turndownInstance
}

function looksBinary(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  return (
    ct.startsWith('image/') ||
    ct.startsWith('audio/') ||
    ct.startsWith('video/') ||
    ct.startsWith('font/') ||
    ct.includes('application/pdf') ||
    ct.includes('application/zip') ||
    ct.includes('application/octet-stream')
  )
}

function truncate(s: string, maxBytes: number): { content: string; truncated: boolean; bytes: number } {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(s)
  if (encoded.byteLength <= maxBytes) {
    return { content: s, truncated: false, bytes: encoded.byteLength }
  }
  // Cut at byte boundary; TextDecoder('utf-8', { fatal:false }) tolerates partial cp at end.
  const cut = encoded.slice(0, maxBytes)
  const decoded = new TextDecoder('utf-8').decode(cut)
  const marker = '\n\n[truncated]'
  return { content: decoded + marker, truncated: true, bytes: maxBytes + encoder.encode(marker).byteLength }
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript').remove()
  const text = $('body').text() || $.root().text()
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function htmlToMarkdown(html: string): string {
  // Strip noisy nodes first so turndown doesn't emit them.
  const $ = cheerio.load(html)
  $('script, style, noscript, iframe').remove()
  return getTurndown().turndown($.html())
}

export interface FetchDeps {
  fetch?: typeof fetchWithGuards
  now?: () => number
}

export async function webFetch(
  raw: FetchInput,
  deps: FetchDeps = {},
): Promise<FetchOutput> {
  const format: FetchFormat = raw.format ?? 'markdown'
  const maxBytes = raw.maxBytes ?? 100_000
  const timeoutMs = raw.timeoutMs ?? 30_000
  const cacheKey = `${raw.url}::${format}::${maxBytes}`

  const cached = cache.get(cacheKey)
  if (cached) return cached

  const start = (deps.now ?? Date.now)()
  const result = await (deps.fetch ?? fetchWithGuards)(raw.url, {
    timeoutMs,
    redirect: 'same-origin',
  })

  // Cross-origin redirect surfaced as redirect info — return a message,
  // not the empty body. Lets the agent decide whether to follow.
  if (result.redirect) {
    const msg =
      `REDIRECT to a different host (status ${result.redirect.status}).\n` +
      `From: ${result.redirect.from}\nTo: ${result.redirect.to}\n` +
      `Call WebFetch again with the new URL to follow.`
    const out: FetchOutput = {
      url: result.finalUrl,
      status: result.redirect.status,
      contentType: result.contentType,
      content: msg,
      bytes: new TextEncoder().encode(msg).byteLength,
      truncated: false,
      durationMs: (deps.now ?? Date.now)() - start,
    }
    cache.set(cacheKey, out, out.bytes)
    return out
  }

  const contentType = result.contentType
  const raw_bytes = result.body.byteLength

  if (looksBinary(contentType) && format !== 'html') {
    throw new WebtoolError(
      'binary_content',
      `Binary content (${contentType}, ${raw_bytes}B) cannot be converted to ${format}. ` +
        `Use format="html" to fetch raw bytes if you need them.`,
    )
  }

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(result.body)

  let content: string
  if (format === 'html') {
    content = decoded
  } else if (format === 'text') {
    content = contentType.includes('text/html') ? htmlToText(decoded) : decoded
  } else {
    // markdown
    if (contentType.includes('text/html')) {
      content = htmlToMarkdown(decoded)
    } else {
      // markdown/plain/json — pass through
      content = decoded
    }
  }

  const { content: cut, truncated, bytes } = truncate(content, maxBytes)
  const out: FetchOutput = {
    url: result.finalUrl,
    status: result.status,
    contentType,
    content: cut,
    bytes,
    truncated,
    durationMs: (deps.now ?? Date.now)() - start,
  }
  cache.set(cacheKey, out, bytes)
  return out
}

export function clearFetchCache(): void {
  cache.clear()
}
