import * as cheerio from 'cheerio'
import type { RawHit, SearchAdapter, TimeRange } from '../types.ts'

const DF_MAP: Record<TimeRange, string> = {
  day: 'd',
  week: 'w',
  month: 'm',
  year: 'y',
}

function unwrap(href: string): string {
  // DDG packages outbound links as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  if (!href) return ''
  try {
    const u = new URL(href, 'https://duckduckgo.com/')
    if (u.hostname.endsWith('duckduckgo.com') && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg')
      if (target) return decodeURIComponent(target)
    }
    return u.toString()
  } catch {
    return href
  }
}

export const duckduckgo: SearchAdapter = {
  name: 'duckduckgo',
  buildUrl(query, opts) {
    // The html.duckduckgo.com subdomain tends to serve the lightweight SERP
    // even when duckduckgo.com/html/ throws a JS challenge.
    const u = new URL('https://html.duckduckgo.com/html/')
    u.searchParams.set('q', query)
    if (opts.timeRange) u.searchParams.set('df', DF_MAP[opts.timeRange])
    return u.toString()
  },
  parse(html) {
    const $ = cheerio.load(html)
    const hits: RawHit[] = []
    $('.result').each((i, el) => {
      const $el = $(el)
      const a = $el.find('.result__a').first()
      const title = a.text().trim()
      const url = unwrap(a.attr('href') ?? '')
      const snippet = $el.find('.result__snippet').first().text().trim()
      if (!title || !url) return
      hits.push({ title, url, snippet, rank: hits.length + 1 })
    })
    return hits
  },
}
