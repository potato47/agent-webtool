import * as cheerio from "cheerio";
import type { RawHit, SearchAdapter, TimeRange } from "../types.ts";

const TF_MAP: Record<TimeRange, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

export const brave: SearchAdapter = {
  name: "brave",
  buildUrl(query, opts) {
    const u = new URL("https://search.brave.com/search");
    u.searchParams.set("q", query);
    if (opts.timeRange) u.searchParams.set("tf", TF_MAP[opts.timeRange]);
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html);
    const hits: RawHit[] = [];
    $('[data-type="web"]').each((_, el) => {
      const $el = $(el);
      const a = $el.find('a[href^="http"]').first();
      const url = a.attr("href") ?? "";
      if (!url) return;
      const title =
        $el.find(".title").first().text().trim() ||
        $el.find("h1, h2, h3").first().text().trim() ||
        a.attr("title")?.trim() ||
        "";
      const snippet =
        $el.find(".snippet-description").first().text().trim() ||
        $el.find(".generic-snippet").first().text().trim() ||
        $el.find(".line-clamp-2").first().text().trim();
      if (!title) return;
      hits.push({ title, url, snippet, rank: hits.length + 1 });
    });
    return hits;
  },
};
