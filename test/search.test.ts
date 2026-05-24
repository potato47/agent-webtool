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

describe('webSearch markdown output', () => {
  test('returns numbered markdown list across all engines', async () => {
    const fetcher = (url: string) => {
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('bing.com'))       return mockFetch('bing')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected url: ${url}`)
    }
    const md = await webSearch(
      { query: 'bun javascript runtime', limit: 5 },
      { fetch: fetcher as any },
    )
    expect(typeof md).toBe('string')
    // numbered list
    expect(md).toMatch(/^1\. \[/m)
    // markdown link syntax
    expect(md).toMatch(/\[.+\]\(https?:\/\//)
    // bun-related content present
    expect(md.toLowerCase()).toContain('bun')
    // no JSON noise
    expect(md).not.toContain('"sources"')
    expect(md).not.toContain('"score"')
    expect(md).not.toContain('"durationMs"')
  })

  test('partial failure appends a footer note', async () => {
    const fetcher = (url: string) => {
      if (url.includes('bing.com')) return Promise.reject(new Error('boom'))
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected: ${url}`)
    }
    const md = await webSearch(
      { query: 'bun javascript runtime' },
      { fetch: fetcher as any },
    )
    expect(md).toContain('1. [')
    expect(md).toMatch(/^> Note:.*bing/m)
  })

  test('engines subset is honored', async () => {
    const calls: string[] = []
    const fetcher = (url: string) => {
      calls.push(url)
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      throw new Error(`unexpected: ${url}`)
    }
    const md = await webSearch(
      { query: 'bun runtime', engines: ['duckduckgo'] },
      { fetch: fetcher as any },
    )
    expect(calls.length).toBe(1)
    expect(md).toMatch(/^1\. \[/m)
  })

  test('limit caps final count', async () => {
    const fetcher = (url: string) => {
      if (url.includes('duckduckgo.com')) return mockFetch('duckduckgo')
      if (url.includes('bing.com'))       return mockFetch('bing')
      if (url.includes('brave.com'))      return mockFetch('brave')
      if (url.includes('yahoo.com'))      return mockFetch('yahoo')
      throw new Error(`unexpected: ${url}`)
    }
    const md = await webSearch({ query: 'bun', limit: 3 }, { fetch: fetcher as any })
    // count "^N. " numbered items
    const numbered = md.match(/^\d+\. \[/gm) ?? []
    expect(numbered.length).toBeLessThanOrEqual(3)
    expect(numbered.length).toBeGreaterThan(0)
  })

  test('throws when all engines fail', async () => {
    const fetcher = () => Promise.reject(new Error('blocked'))
    await expect(
      webSearch({ query: 'x' }, { fetch: fetcher as any }),
    ).rejects.toThrow(/All search engines failed/)
  })
})
