import * as cheerio from "cheerio";
import { cleanText } from "../decode.ts";
import type { RawHit, SearchAdapter } from "../types.ts";

/**
 * Bing's HTML SERP now serves non-browser clients a JS-hydrated shell with no
 * server-rendered results, so scrape the RSS output format instead: structured
 * XML with direct (unwrapped) result links. Count is capped at build time; the
 * aggregator slices further downstream.
 */
export const bing: SearchAdapter = {
  name: "bing",
  buildUrl(query) {
    const u = new URL("https://www.bing.com/search");
    u.searchParams.set("q", query);
    u.searchParams.set("format", "rss");
    u.searchParams.set("count", "30");
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html, { xmlMode: true });
    const hits: RawHit[] = [];
    $("item").each((_, el) => {
      const $el = $(el);
      const title = cleanText($el.find("title").first().text());
      const url = $el.find("link").first().text().trim();
      if (!title || !url.startsWith("http")) return;
      const pubDate = $el.find("pubDate").first().text().trim();
      hits.push({
        title,
        url,
        snippet: cleanText($el.find("description").first().text()),
        rank: hits.length + 1,
        meta: pubDate ? { pubDate } : undefined,
      });
    });
    return hits;
  },
};
