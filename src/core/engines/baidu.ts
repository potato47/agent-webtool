import * as cheerio from "cheerio";
import { cleanText } from "../decode.ts";
import type { RawHit, SearchAdapter } from "../types.ts";

export const baidu: SearchAdapter = {
  name: "baidu",
  buildUrl(query) {
    const u = new URL("https://www.baidu.com/s");
    u.searchParams.set("wd", query);
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html);
    const hits: RawHit[] = [];
    $(".result.c-container").each((_, el) => {
      const $el = $(el);
      const title = cleanText($el.find("h3").first().text());
      const url = $el.attr("mu") ?? "";
      if (!title || !url.startsWith("http")) return;
      const snippet = cleanText(
        $el.find('[class*="summary-text"]').first().text() ||
          $el.find('[class*="content-right"]').first().text() ||
          $el.find(".c-abstract").first().text(),
      );
      hits.push({ title, url, snippet, rank: hits.length + 1 });
    });
    return hits;
  },
};
