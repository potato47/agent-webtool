import * as cheerio from 'cheerio'

// === Bing: try to decode `u` param (typically base64 with 'a1' prefix)
const bingHtml = await Bun.file('scratch/dump/bing-cn.html').text()
const $bing = cheerio.load(bingHtml)
console.log(`=== Bing first 3 hrefs + decoded u ===`)
$bing('li.b_algo h2 a').slice(0, 3).each((i, a) => {
  const href = $bing(a).attr('href') || ''
  try {
    const u = new URL(href, 'https://www.bing.com/').searchParams.get('u') || ''
    // Strip leading 'a1' if present, urlsafe base64 -> standard
    let raw = u.startsWith('a1') ? u.slice(2) : u
    raw = raw.replace(/-/g, '+').replace(/_/g, '/')
    while (raw.length % 4) raw += '='
    let decoded = ''
    try {
      decoded = Buffer.from(raw, 'base64').toString('utf-8')
    } catch {}
    console.log(`#${i} u(raw)=${u.slice(0, 40)}... -> ${decoded.slice(0, 120)}`)
  } catch (e) {
    console.log(`#${i} parse error`)
  }
})

// === Brave: hunt for snippet text near each result
const braveHtml = await Bun.file('scratch/dump/brave.html').text()
const $b = cheerio.load(braveHtml)
console.log(`\n=== Brave snippet hunt ===`)
$b('[data-type="web"]').slice(0, 3).each((i, el) => {
  const $el = $b(el)
  const candidates = [
    '.snippet-description',
    '.snippet-content',
    '.generic-snippet',
    '.line-clamp-2',
    'p',
  ]
  for (const sel of candidates) {
    const text = $el.find(sel).first().text().trim()
    if (text.length > 20) {
      console.log(`  #${i} ${sel}: ${text.slice(0, 120)}`)
      break
    }
  }
})

// === Yahoo: hunt
const yhHtml = await Bun.file('scratch/dump/yahoo.html').text()
const $yh = cheerio.load(yhHtml)
console.log(`\n=== Yahoo selectors ===`)
console.log('div.algo count:', $yh('div.algo').length)
console.log('li.algo count:', $yh('li.algo').length)
console.log('.Sr count:', $yh('.Sr').length)
console.log('.algo-sr count:', $yh('.algo-sr').length)
$yh('div.algo, li.algo').slice(0, 3).each((i, el) => {
  const $el = $yh(el)
  const a = $el.find('h3 a').first()
  console.log(`#${i} title=${$el.find('h3').first().text().trim().slice(0, 60)}`)
  console.log(`   href=${(a.attr('href') || '').slice(0, 100)}`)
  console.log(`   snip=${$el.find('.compText, p, div').filter((_, e) => $yh(e).text().trim().length > 30).first().text().trim().slice(0, 120)}`)
})
