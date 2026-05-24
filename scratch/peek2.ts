// Refine Brave selectors using data-type="web" wrappers; also try URL unwrap for DDG/Bing/Yahoo.
import * as cheerio from 'cheerio'

const braveHtml = await Bun.file('scratch/dump/brave.html').text()
const $b = cheerio.load(braveHtml)
console.log(`=== brave [data-type=web] ===`)
$b('[data-type="web"]').slice(0, 4).each((i, el) => {
  const $el = $b(el)
  const a = $el.find('a').first()
  // Brave often shows the source URL in .site-name-content or .url-wrapper
  const title =
    $el.find('.title, .h1, .h2, .h3, h1, h2, h3').first().text().trim() ||
    a.attr('title')?.trim() || ''
  const url = a.attr('href') || ''
  const snippet = $el.find('.snippet-description, .snippet').first().text().trim()
  const siteName = $el.find('.site-name-content').first().text().trim()
  console.log(`#${i} title=${title.slice(0, 80)}`)
  console.log(`   url=${url.slice(0, 100)}`)
  console.log(`   site=${siteName.slice(0, 60)}`)
  console.log(`   snip=${snippet.slice(0, 120)}`)
})

// Test DDG uddg unwrap
console.log(`\n=== DDG uddg unwrap ===`)
const ddgEx = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fbun.sh%2F&rut=df1e1f63b3e6c757dfd546d4bfa1fa867f2ed79df3003d6'
const u = new URL('https:' + ddgEx)
console.log('  uddg ->', u.searchParams.get('uddg'))

// Yahoo URLs are r.search.yahoo.com redirects — needs follow
// Bing /ck/a?... also needs follow. Let's HEAD one of each.
console.log(`\n=== Bing ck redirect ===`)
const bingHtml = await Bun.file('scratch/dump/bing-cn.html').text()
const $bing = cheerio.load(bingHtml)
const bingHref = $bing('li.b_algo h2 a').first().attr('href') || ''
console.log('  first href:', bingHref.slice(0, 120))
// Bing sometimes encodes target in a `u` param. Check.
try {
  const bu = new URL(bingHref, 'https://www.bing.com/')
  console.log('  query keys:', [...bu.searchParams.keys()])
} catch (e) {
  console.log('  parse error', (e as Error).message)
}

// Try fetching with HEAD/GET no-follow to see Location
console.log(`\n  HEAD with no-follow:`)
try {
  const res = await fetch(bingHref.startsWith('http') ? bingHref : 'https://www.bing.com' + bingHref, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  console.log('  status=', res.status, 'location=', res.headers.get('location')?.slice(0, 120))
} catch (e) {
  console.log('  fetch error', (e as Error).message)
}

console.log(`\n=== Yahoo r.search redirect ===`)
const yhHtml = await Bun.file('scratch/dump/yahoo.html').text()
const $yh = cheerio.load(yhHtml)
const yhHref = $yh('div.algo h3 a, li.algo h3 a, .Sr h3 a').first().attr('href') || ''
console.log('  first href:', yhHref.slice(0, 160))
try {
  const res = await fetch(yhHref, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } })
  console.log('  status=', res.status, 'location=', res.headers.get('location')?.slice(0, 160))
} catch (e) {
  console.log('  fetch error', (e as Error).message)
}
