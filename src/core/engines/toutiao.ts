import * as cheerio from "cheerio";
import { cleanText, decodeToutiaoUrl } from "../decode.ts";
import type { RawHit, SearchAdapter } from "../types.ts";

export const toutiao: SearchAdapter = {
  name: "toutiao",
  buildUrl(query) {
    const u = new URL("https://so.toutiao.com/search");
    u.searchParams.set("keyword", query);
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html);
    const hits: RawHit[] = [];
    const seen = new Set<string>();
    $(".result-content").each((_, el) => {
      const $el = $(el);
      let title = "";
      const crParams = $el.attr("cr-params");
      if (crParams) {
        try {
          const j = JSON.parse(crParams);
          if (typeof j.title === "string") title = j.title;
        } catch {
          /* ignore */
        }
      }
      if (!title) {
        title = cleanText($el.find(".line-clamp-1.color-darker, .font-medium").first().text());
      }
      const rawHref = $el.find("a[href]").first().attr("href") ?? "";
      const url = decodeToutiaoUrl(rawHref);
      if (
        !title ||
        !url.startsWith("http") ||
        url.startsWith("https://so.toutiao.com/search") ||
        seen.has(url)
      )
        return;
      seen.add(url);
      const snippet = cleanText($el.find(".l-paragraph, .mb-8 .line-clamp-2").first().text());
      const source = cleanText($el.find(".l-source").first().text());
      hits.push({
        title,
        url,
        snippet: snippet || title,
        rank: hits.length + 1,
        meta: source ? { source } : undefined,
      });
    });
    return hits;
  },
};
