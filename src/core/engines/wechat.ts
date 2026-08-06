import * as cheerio from "cheerio";
import { cleanText } from "../decode.ts";
import type { RawHit, SearchAdapter } from "../types.ts";

const SOGOU_BASE = "https://wx.sogou.com";

/** WeChat public-article search via Sogou. URLs are Sogou-wrapped /link?url=... redirect stubs;
 * web_fetch resolves them to the real article via decodeSogouLink. */
export const wechat: SearchAdapter = {
  name: "wechat",
  buildUrl(query) {
    const u = new URL("https://wx.sogou.com/weixin");
    u.searchParams.set("type", "2");
    u.searchParams.set("query", query);
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html);
    const hits: RawHit[] = [];
    $(".news-list li").each((_, el) => {
      const $el = $(el);
      const a = $el.find(".txt-box h3 a, h3 a").first();
      const title = cleanText(a.text());
      let href = a.attr("href") ?? "";
      if (!title || !href) return;
      if (href.startsWith("/")) href = `${SOGOU_BASE}${href}`;
      const snippet = cleanText($el.find(".txt-info").first().text());
      const account = cleanText($el.find(".account, .all-time-y2").first().text());
      hits.push({
        title,
        url: href,
        snippet,
        rank: hits.length + 1,
        meta: account ? { account } : undefined,
      });
    });
    return hits;
  },
};
