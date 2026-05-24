import { describe, expect, test } from 'bun:test'
import { webSearch, normalizeUrl } from '../src/index.ts'
import type { RawFetchResult } from '../src/core/http.ts'

const fixture = (name: string) => Bun.file(`test/fixtures/${name}.html`).text()

async function mockFetch(name: string): Promise<RawFetchResult> {
  const text = await fixture(name)
  return {
    finalUrl: `https://${name}.example/search`,
    status: 200,
    contentType: 'text/html',
    body: new TextEncoder().encode(text).buffer as ArrayBuffer,
  }
}

describe('normalizeUrl', () => {
  test('strips tracking params, www, trailing slash, fragment, sorts keys', () => {
    expect(
      normalizeUrl('https://www.Example.com/path/?utm_source=x&utm_medium=y&a=1&b=2#frag'),
    ).toBe('https://example.com/path?a=1&b=2')
  })
  test('upgrades http to https', () => {
    expect(normalizeUrl('http://bun.sh/')).toBe('https://bun.sh/')
  })
  test('keeps root slash', () => {
    expect(normalizeUrl('https://bun.sh/')).toBe('https://bun.sh/')
  })
  test('strips fbclid/gclid', () => {
    expect(
      normalizeUrl('https://example.com/x?fbclid=a&gclid=b&keep=1'),
    ).toBe('https://example.com/x?keep=1')
  })
})

describe('webSearch aggregation', () => {
  test('merges duplicates across engines and sorts by RRF', async () => {
    const fetcher = (url: string) => {
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('bing.com'))       return mockFetch('bing')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected url: ${url}`)
    }
    const out = await webSearch(
      { query: 'bun javascript runtime', limit: 10 },
      { fetch: fetcher as any },
    )
    expect(out.engines).toEqual(['duckduckgo', 'bing', 'brave', 'yahoo'])
    expect(out.errors).toEqual([])
    expect(out.results.length).toBeGreaterThan(0)
    // At least one result should have been reported by 2+ engines (bun.sh would)
    const multi = out.results.filter(r => r.sources.length >= 2)
    expect(multi.length).toBeGreaterThan(0)
    // RRF: results must be sorted by score desc
    for (let i = 1; i < out.results.length; i++) {
      expect(out.results[i - 1]!.score).toBeGreaterThanOrEqual(out.results[i]!.score)
    }
    // Top result must be bun-related and reported by the most engines.
    expect(out.results[0]!.url.toLowerCase()).toContain('bun')
    expect(out.results[0]!.sources.length).toBeGreaterThanOrEqual(3)
  })

  test('partial failure: one engine errors, others still return', async () => {
    const fetcher = (url: string) => {
      if (url.includes('bing.com')) {
        return Promise.reject(new Error('Bing blew up'))
      }
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected: ${url}`)
    }
    const out = await webSearch(
      { query: 'bun javascript runtime' },
      { fetch: fetcher as any },
    )
    expect(out.errors.length).toBe(1)
    expect(out.errors[0]!.engine).toBe('bing')
    expect(out.errors[0]!.message).toContain('Bing blew up')
    expect(out.results.length).toBeGreaterThan(0)
  })

  test('engines subset is honored', async () => {
    const calls: string[] = []
    const fetcher = (url: string) => {
      calls.push(url)
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      throw new Error(`unexpected: ${url}`)
    }
    const out = await webSearch(
      { query: 'bun runtime', engines: ['duckduckgo'] },
      { fetch: fetcher as any },
    )
    expect(out.engines).toEqual(['duckduckgo'])
    expect(calls.length).toBe(1)
    expect(out.results.length).toBeGreaterThan(0)
    // No multi-engine hits possible with just one engine
    expect(out.results.every(r => r.sources.length === 1)).toBe(true)
  })

  test('limit caps final result count', async () => {
    const fetcher = (url: string) => {
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('bing.com'))       return mockFetch('bing')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected: ${url}`)
    }
    const out = await webSearch({ query: 'bun', limit: 3 }, { fetch: fetcher as any })
    expect(out.results.length).toBeLessThanOrEqual(3)
  })
})
