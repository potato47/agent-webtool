import type { RawFetchResult } from "./http.ts";

/** Decode an HTTP response body honoring its charset (Content-Type header, then a `<meta charset>` sniff).
 * Many Chinese sites (incl. Sogou/Baidu) serve GBK/GB2312; a blind utf-8 decode would mojibake them. */
export function decodeBody(result: RawFetchResult): string {
  const buf = new Uint8Array(result.body);
  let charset = /charset=["']?([\w-]+)/i.exec(result.contentType)?.[1];
  if (!charset) {
    const head = Buffer.from(buf.subarray(0, 2048)).toString("latin1");
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  charset = charset?.toLowerCase();
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      // TextDecoder typing only lists known labels; the runtime accepts any label and throws on unknown ones.
      return new TextDecoder(charset as string as never).decode(buf);
    } catch {
      /* unknown label → fall back to utf-8 */
    }
  }
  return new TextDecoder("utf-8").decode(buf);
}

/** Resolve Sogou's /link?url=... stub to the real article URL.
 * Sogou returns 200 (not a 3xx) with a JS redirect that builds the destination by
 * concatenating `url += '...'` fragments to defeat scrapers — fetch() can't follow it. */
export function decodeSogouLink(currentUrl: string, html: string): string | null {
  let host: string;
  try {
    host = new URL(currentUrl).host.toLowerCase();
  } catch {
    return null;
  }
  if (!host.endsWith("sogou.com")) return null;
  const frags = [...html.matchAll(/url\s*\+=\s*['"]([^'"]*)['"]/g)].map((m) => m[1]);
  if (frags.length === 0) return null;
  const dest = frags.join("");
  return /^https?:\/\//i.test(dest) ? dest : null;
}

/** Decode Toutiao's /search/jump?...&url=<url-encoded>&... redirect. */
export function decodeToutiaoUrl(href: string): string {
  try {
    const u = new URL(href, "https://so.toutiao.com").searchParams.get("url");
    return u ? decodeURIComponent(u) : href;
  } catch {
    return href;
  }
}

/** Normalize whitespace and decode common HTML entities. */
export function cleanText(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
