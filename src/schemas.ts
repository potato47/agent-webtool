import { z } from 'zod'
import { ENGINE_NAMES } from './core/types.ts'

export const fetchInputSchema = z
  .object({
    url: z.url().describe('The URL to fetch'),
    format: z
      .enum(['markdown', 'text', 'html'])
      .default('markdown')
      .describe('Output format. markdown converts HTML via turndown; text strips tags; html returns raw HTML.'),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .default(100_000)
      .describe('Truncate output at this many bytes'),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(120_000)
      .default(30_000)
      .describe('Per-request timeout'),
  })
  .strict()

export const searchInputSchema = z
  .object({
    query: z.string().min(1).describe('Search query'),
    engines: z
      .array(z.enum(ENGINE_NAMES))
      .min(1)
      .optional()
      .describe('Subset of engines to query in parallel. Defaults to all.'),
    limit: z
      .number()
      .int()
      .positive()
      .max(30)
      .default(10)
      .describe('Max number of aggregated results to return'),
    timeRange: z
      .enum(['day', 'week', 'month', 'year'])
      .optional()
      .describe('Time filter; engines that do not support it will ignore'),
    site: z
      .string()
      .optional()
      .describe('Restrict to a domain; injected as `site:` operator into query'),
  })
  .strict()

export type FetchInputZ = z.infer<typeof fetchInputSchema>
export type SearchInputZ = z.infer<typeof searchInputSchema>
