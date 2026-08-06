import * as cheerio from "cheerio";
import type { RawHit, SearchAdapter } from "../types.ts";

function unwrap(href: string): string {
  if (!href) return "";
  // Older Yahoo layout wraps targets via r.search.yahoo.com/_ylt=.../RU=<urlencoded>/RK=.../RS=...
  const m = href.match(/\/RU=([^/]+)\/RK=/);
  if (m && m[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return href;
}

export const yahoo: SearchAdapter = {
  name: "yahoo",
  buildUrl(query) {
    const u = new URL("https://search.yahoo.com/search");
    u.searchParams.set("p", query);
    return u.toString();
  },
  parse(html) {
    const $ = cheerio.load(html);
    const hits: RawHit[] = [];
    const seen = new Set<string>(); // de-dup within a single SERP

    // Newer layout: anchors carry data-matarget="algo" and a direct href.
    $('a[data-matarget="algo"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr("href") ?? "";
      if (!href || !/^https?:\/\//.test(href)) return;
      const url = unwrap(href);
      if (seen.has(url)) return;
      const title =
        $a.find("h3").first().text().trim() ||
        $a.find(".fz-20, .fz-18").first().text().trim() ||
        $a.attr("title")?.trim() ||
        "";
      if (!title) return;
      // Snippet usually sits in the closest result container's .compText.
      const container = $a.closest("div.algo, li.algo, .Sr, .algo-sr");
      const snippet = (container.length ? container : $a.parent().parent())
        .find(".compText p, .compText")
        .first()
        .text()
        .trim();
      seen.add(url);
      hits.push({ title, url, snippet, rank: hits.length + 1 });
    });

    // Fallback / older layout: div.algo blocks with r.search.yahoo.com hrefs.
    if (hits.length === 0) {
      $("div.algo").each((_, el) => {
        const $el = $(el);
        const a = $el.find('a[href*="r.search.yahoo.com"]').first();
        const href = a.attr("href") ?? "";
        const url = unwrap(href);
        if (!url || seen.has(url)) return;
        const title = $el.find("h3").first().text().trim() || a.text().trim();
        const snippet = $el.find(".compText p").first().text().trim();
        if (!title) return;
        seen.add(url);
        hits.push({ title, url, snippet, rank: hits.length + 1 });
      });
    }

    return hits;
  },
};
