#!/usr/bin/env node
import { Command } from 'commander'
import { webFetch, webSearch, WebtoolError, ENGINE_NAMES } from '../src/index.ts'
import { fetchInputSchema, searchInputSchema } from '../src/schemas.ts'
import { runMcpServer } from './mcp.ts'
import type { EngineName, FetchFormat, TimeRange } from '../src/core/types.ts'

const VERSION = '0.1.0'

function die(code: number, msg: string): never {
  process.stderr.write(msg.endsWith('\n') ? msg : msg + '\n')
  process.exit(code)
}

function emit(json: unknown, pretty: boolean): void {
  process.stdout.write(JSON.stringify(json, null, pretty ? 2 : 0))
  process.stdout.write('\n')
}

function classifyError(e: unknown): number {
  if (e instanceof WebtoolError) {
    if (e.code === 'invalid_url' || e.code === 'private_address') return 2
    return 3
  }
  return 1
}

const program = new Command()
program
  .name('webtool')
  .description('Web fetch + multi-engine search tools for AI agents')
  .version(VERSION)

program
  .command('fetch <url>')
  .description('Fetch a URL and return its content')
  .option('-f, --format <fmt>', 'output format: markdown | text | html', 'markdown')
  .option('-m, --max-bytes <n>', 'truncate at N bytes', (v) => Number.parseInt(v, 10))
  .option('-t, --timeout-ms <n>', 'request timeout in ms', (v) => Number.parseInt(v, 10))
  .option('--pretty', 'pretty-print JSON output')
  .action(async (url: string, opts: { format?: string; maxBytes?: number; timeoutMs?: number; pretty?: boolean }) => {
    const parsed = fetchInputSchema.safeParse({
      url,
      format: (opts.format ?? 'markdown') as FetchFormat,
      maxBytes: opts.maxBytes,
      timeoutMs: opts.timeoutMs,
    })
    if (!parsed.success) die(2, parsed.error.toString())
    try {
      const out = await webFetch(parsed.data)
      emit(out, !!opts.pretty)
    } catch (e) {
      emit({ error: (e as Error).message, code: (e as WebtoolError).code }, !!opts.pretty)
      process.exit(classifyError(e))
    }
  })

program
  .command('search <query>')
  .description('Run a multi-engine web search and return aggregated results')
  .option('-e, --engines <list>', `comma-separated subset of [${ENGINE_NAMES.join(',')}]`)
  .option('-l, --limit <n>', 'max final results', (v) => Number.parseInt(v, 10))
  .option('--time <range>', 'time filter: day | week | month | year')
  .option('--site <domain>', 'restrict to a site (injects site: operator)')
  .option('--pretty', 'pretty-print JSON output')
  .action(async (query: string, opts: { engines?: string; limit?: number; time?: string; site?: string; pretty?: boolean }) => {
    let engines: EngineName[] | undefined
    if (opts.engines) {
      const parts = opts.engines.split(',').map(s => s.trim()).filter(Boolean)
      const known = new Set<string>(ENGINE_NAMES)
      const bad = parts.filter(p => !known.has(p))
      if (bad.length) die(2, `Unknown engines: ${bad.join(', ')}. Valid: ${ENGINE_NAMES.join(', ')}`)
      engines = parts as EngineName[]
    }
    const parsed = searchInputSchema.safeParse({
      query,
      engines,
      limit: opts.limit,
      timeRange: opts.time as TimeRange | undefined,
      site: opts.site,
    })
    if (!parsed.success) die(2, parsed.error.toString())
    try {
      const out = await webSearch(parsed.data)
      const allFailed =
        out.results.length === 0 &&
        out.errors.length > 0 &&
        out.errors.length === out.engines.length
      emit(out, !!opts.pretty)
      if (allFailed) process.exit(3)
    } catch (e) {
      emit({ error: (e as Error).message, code: (e as WebtoolError).code }, !!opts.pretty)
      process.exit(classifyError(e))
    }
  })

program
  .command('mcp')
  .description('Run an MCP server over stdio exposing web_fetch / web_search')
  .option('-t, --tools <list>', 'comma-separated subset of [fetch,search]', 'fetch,search')
  .action(async (opts: { tools: string }) => {
    const requested = opts.tools.split(',').map(s => s.trim()).filter(Boolean)
    const valid = new Set(['fetch', 'search'])
    const bad = requested.filter(t => !valid.has(t))
    if (bad.length) die(2, `Unknown tools: ${bad.join(', ')}. Valid: fetch, search`)
    await runMcpServer({ tools: requested as ('fetch' | 'search')[] })
  })

program.parseAsync(process.argv).catch(e => {
  process.stderr.write(`fatal: ${e?.stack ?? e}\n`)
  process.exit(1)
})
