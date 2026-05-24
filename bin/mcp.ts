import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { webFetch, webSearch, WebtoolError } from '../src/index.ts'
import { fetchInputSchema, searchInputSchema } from '../src/schemas.ts'

export interface McpOptions {
  tools: Array<'fetch' | 'search'>
}

export async function runMcpServer(opts: McpOptions): Promise<void> {
  const server = new McpServer(
    { name: 'webtool', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Exposes web_fetch (fetch a URL → markdown/text/html) and web_search ' +
        '(parallel multi-engine search with RRF aggregation). No API keys required.',
    },
  )

  if (opts.tools.includes('fetch')) {
    server.registerTool(
      'web_fetch',
      {
        title: 'Fetch a web page',
        description:
          'Fetch a URL and return its content. Default format is markdown (HTML is ' +
          'converted via turndown). HTTP is auto-upgraded to HTTPS. Same-origin ' +
          'redirects are followed; cross-origin redirects are reported and not followed. ' +
          'Private IPs are rejected. Use format="html" to get raw HTML, "text" for plain text.',
        inputSchema: fetchInputSchema.shape,
      },
      async (args) => {
        try {
          const result = await webFetch(args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const code = e instanceof WebtoolError ? e.code : 'error'
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ error: msg, code }) }],
          }
        }
      },
    )
  }

  if (opts.tools.includes('search')) {
    server.registerTool(
      'web_search',
      {
        title: 'Search the web across multiple engines',
        description:
          'Run a search query concurrently across DuckDuckGo, Bing, Brave, and Yahoo. ' +
          'Results are deduplicated by normalized URL and ranked via Reciprocal Rank Fusion. ' +
          'Each result reports which engines surfaced it and at what rank. Pass `engines` ' +
          'to restrict to a subset. `errors[]` lists engines that failed (partial success is OK).',
        inputSchema: searchInputSchema.shape,
      },
      async (args) => {
        try {
          const result = await webSearch(args)
          const allFailed =
            result.results.length === 0 &&
            result.errors.length > 0 &&
            result.errors.length === result.engines.length
          return {
            isError: allFailed,
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
          }
        }
      },
    )
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
