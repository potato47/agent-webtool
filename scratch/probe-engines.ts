// Probe search engines: fetch each, save raw HTML, print status + size.
// Goal: see which engines return real HTML SERPs without API keys / heavy JS.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const QUERY = 'bun javascript runtime'
const q = encodeURIComponent(QUERY)

const targets = [
  { name: 'duckduckgo-html', url: `https://duckduckgo.com/html/?q=${q}` },
  { name: 'duckduckgo-lite', url: `https://lite.duckduckgo.com/lite/?q=${q}` },
  { name: 'bing-cn',         url: `https://cn.bing.com/search?q=${q}&ensearch=1` },
  { name: 'bing-com',        url: `https://www.bing.com/search?q=${q}` },
  { name: 'brave',           url: `https://search.brave.com/search?q=${q}` },
  { name: 'yahoo',           url: `https://search.yahoo.com/search?p=${q}` },
]

async function probe(name: string, url: string) {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    const text = await res.text()
    const dur = Date.now() - start
    await Bun.write(`scratch/dump/${name}.html`, text)
    // crude probes for "looks like a real SERP"
    const hits = {
      'result__a (ddg)':       (text.match(/class="result__a"/g) || []).length,
      'b_algo (bing)':         (text.match(/class="b_algo"/g) || []).length,
      'snippet (brave/news)':  (text.match(/snippet/gi) || []).length,
      'data-snippet (brave)':  (text.match(/data-snippet/g) || []).length,
      'algo / Sr (yahoo)':     (text.match(/class="algo|class="Sr/g) || []).length,
    }
    console.log(`[${name}] status=${res.status} bytes=${text.length} ${dur}ms`)
    console.log(`         ${JSON.stringify(hits)}`)
  } catch (e) {
    console.log(`[${name}] ERROR ${(e as Error).message}`)
  }
}

for (const t of targets) {
  await probe(t.name, t.url)
}
