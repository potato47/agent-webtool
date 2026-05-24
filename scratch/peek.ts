// Use cheerio (already? if not we'll bun add) to extract title/url/snippet
// from each dump, and print first 3 results.
import * as cheerio from 'cheerio'

const cases: Array<{
  name: string
  file: string
  pick: ($: cheerio.CheerioAPI) => Array<{ title: string; url: string; snippet: string }>
}> = [
  {
    name: 'duckduckgo-html',
    file: 'scratch/dump/duckduckgo-html.html',
    pick($) {
      return $('.result').slice(0, 3).map((_, el) => {
        const $el = $(el)
        return {
          title: $el.find('.result__a').text().trim(),
          url: $el.find('.result__a').attr('href') || '',
          snippet: $el.find('.result__snippet').text().trim(),
        }
      }).get()
    },
  },
  {
    name: 'duckduckgo-lite',
    file: 'scratch/dump/duckduckgo-lite.html',
    pick($) {
      // lite is a table-based layout
      const results: any[] = []
      $('a.result-link').slice(0, 3).each((_, a) => {
        const $a = $(a)
        // snippet is typically in the next row
        results.push({
          title: $a.text().trim(),
          url: $a.attr('href') || '',
          snippet: $a.closest('tr').next('tr').find('.result-snippet').text().trim(),
        })
      })
      return results
    },
  },
  {
    name: 'bing-cn',
    file: 'scratch/dump/bing-cn.html',
    pick($) {
      return $('li.b_algo').slice(0, 3).map((_, el) => {
        const $el = $(el)
        return {
          title: $el.find('h2 a').text().trim(),
          url: $el.find('h2 a').attr('href') || '',
          snippet: $el.find('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4').first().text().trim(),
        }
      }).get()
    },
  },
  {
    name: 'brave',
    file: 'scratch/dump/brave.html',
    pick($) {
      return $('div.snippet').slice(0, 3).map((_, el) => {
        const $el = $(el)
        const a = $el.find('a').first()
        return {
          title: $el.find('.title, .h, h2, h3').first().text().trim() || a.text().trim(),
          url: a.attr('href') || '',
          snippet: $el.find('.snippet-description, .description, p').first().text().trim(),
        }
      }).get()
    },
  },
  {
    name: 'yahoo',
    file: 'scratch/dump/yahoo.html',
    pick($) {
      return $('div.algo, li.algo, .Sr').slice(0, 3).map((_, el) => {
        const $el = $(el)
        const a = $el.find('h3 a, a').first()
        return {
          title: $el.find('h3').first().text().trim() || a.text().trim(),
          url: a.attr('href') || '',
          snippet: $el.find('.compText, p').first().text().trim(),
        }
      }).get()
    },
  },
]

for (const c of cases) {
  const html = await Bun.file(c.file).text()
  const $ = cheerio.load(html)
  const items = c.pick($)
  console.log(`\n=== ${c.name} (${items.length} parsed) ===`)
  for (const it of items) {
    console.log(`  - title:   ${it.title.slice(0, 80)}`)
    console.log(`    url:     ${it.url.slice(0, 100)}`)
    console.log(`    snippet: ${it.snippet.slice(0, 120)}`)
  }
}
