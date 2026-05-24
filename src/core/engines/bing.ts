import * as cheerio from 'cheerio'
import type { RawHit, SearchAdapter } from '../types.ts'

function decodeBingU(u: string): string {
  // Bing wraps target URLs as /ck/a?...&u=a1<base64url>&...
  // 'a1' = prefix marker; the rest is urlsafe base64 of the target URL.
  let raw = u.startsWith('a1') ? u.slice(2) : u
  raw = raw.replace(/-/g, '+').replace(/_/g, '/')
  while (raw.length % 4) raw += '='
  try {
    return Buffer.from(raw, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function unwrap(href: string): string {
  if (!href) return ''
  try {
    const u = new URL(href, 'https://www.bing.com/')
    if (u.hostname.endsWith('bing.com') && u.pathname === '/ck/a') {
      const target = u.searchParams.get('u')
      if (target) {
        const decoded = decodeBingU(target)
        if (decoded.startsWith('http')) return decoded
      }
    }
    return u.toString()
  } catch {
    return href
  }
}

export const bing: SearchAdapter = {
  name: 'bing',
  buildUrl(query) {
    const u = new URL('https://www.bing.com/search')
    u.searchParams.set('q', query)
    return u.toString()
  },
  parse(html) {
    const $ = cheerio.load(html)
    const hits: RawHit[] = []
    $('li.b_algo').each(() => {})
    $('li.b_algo').each((_, el) => {
      const $el = $(el)
      const a = $el.find('h2 a').first()
      const title = a.text().trim()
      const url = unwrap(a.attr('href') ?? '')
      const snippet =
        $el.find('.b_caption p').first().text().trim() ||
        $el.find('.b_lineclamp2, .b_lineclamp3, .b_lineclamp4').first().text().trim() ||
        $el.find('.b_dList').first().text().trim()
      if (!title || !url) return
      hits.push({ title, url, snippet, rank: hits.length + 1 })
    })
    return hits
  },
}
