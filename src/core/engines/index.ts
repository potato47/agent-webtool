import type { EngineName, SearchAdapter } from '../types.ts'
import { bing } from './bing.ts'
import { brave } from './brave.ts'
import { duckduckgo } from './duckduckgo.ts'
import { yahoo } from './yahoo.ts'

export const adapters: Record<EngineName, SearchAdapter> = {
  duckduckgo,
  bing,
  brave,
  yahoo,
}
