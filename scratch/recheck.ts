// Re-fetch DDG and Yahoo live and re-parse with current adapters.
import { duckduckgo } from '../src/core/engines/duckduckgo.ts'
import { yahoo } from '../src/core/engines/yahoo.ts'
import { fetchWithGuards } from '../src/core/http.ts'

const q = 'bun javascript runtime'

for (const adapter of [duckduckgo, yahoo]) {
  const url = adapter.buildUrl(q, {})
  const res = await fetchWithGuards(url, { redirect: 'follow' })
  const html = new TextDecoder('utf-8', { fatal: false }).decode(res.body)
  console.log(`\n=== ${adapter.name} ${url} status=${res.status} bytes=${html.length} ===`)
  await Bun.write(`scratch/dump/${adapter.name}-live.html`, html)
  const hits = adapter.parse(html)
  console.log(`parsed ${hits.length} hits`)
  for (const h of hits.slice(0, 3)) {
    console.log(`  #${h.rank} ${h.title.slice(0, 60)}`)
    console.log(`     ${h.url.slice(0, 100)}`)
  }
}
