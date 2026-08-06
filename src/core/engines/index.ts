import type { EngineName, SearchAdapter } from "../types.ts";
import { baidu } from "./baidu.ts";
import { bing } from "./bing.ts";
import { duckduckgo } from "./duckduckgo.ts";
import { toutiao } from "./toutiao.ts";
import { wechat } from "./wechat.ts";
import { yahoo } from "./yahoo.ts";

export const adapters: Record<EngineName, SearchAdapter> = {
  bing,
  baidu,
  wechat,
  toutiao,
  duckduckgo,
  yahoo,
};
