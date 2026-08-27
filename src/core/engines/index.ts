import type { EngineName, SearchAdapter } from "../types.ts";
import { baidu } from "./baidu.ts";
import { duckduckgo } from "./duckduckgo.ts";
import { toutiao } from "./toutiao.ts";
import { wechat } from "./wechat.ts";

export const adapters: Record<EngineName, SearchAdapter> = {
  baidu,
  wechat,
  toutiao,
  duckduckgo,
};
