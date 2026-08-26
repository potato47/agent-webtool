import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import type { RequestInit as UndiciRequestInit } from "undici";

export const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 webtool/0.5.0";

export const MAX_URL_LENGTH = 2000;
export const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024;
export const MAX_REDIRECTS = 10;

const ALLOW_PRIVATE = process.env.WEBTOOL_ALLOW_PRIVATE === "1";

let nodeProxyDispatcher: EnvHttpProxyAgent | null = null;

function getNodeProxyDispatcher(): EnvHttpProxyAgent | null {
  if (process.versions.bun) return null;
  const hasProxy =
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy;

  if (!hasProxy) return null;
  nodeProxyDispatcher ??= new EnvHttpProxyAgent();
  return nodeProxyDispatcher;
}

async function fetchWithProxyFallback(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const dispatcher = getNodeProxyDispatcher();
    if (!dispatcher || init.signal?.aborted) throw e;
    const proxyInit: UndiciRequestInit = {
      method: init.method,
      headers: init.headers as Record<string, string>,
      redirect: init.redirect,
      signal: init.signal,
      dispatcher,
    };
    return undiciFetch(url, proxyInit) as unknown as Promise<Response>;
  }
}

export class WebtoolError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebtoolError";
  }
}

// IPv4 ranges considered private/loopback/link-local.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true; // link-local
  // IPv4-mapped: ::ffff:a.b.c.d → reuse v4 check
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]!);
  return false;
}

export function isPrivateAddress(host: string): boolean {
  const v = isIP(host);
  if (v === 4) return isPrivateIPv4(host);
  if (v === 6) return isPrivateIPv6(host);
  return false;
}

export function normalizeAndValidateUrl(input: string): URL {
  if (input.length > MAX_URL_LENGTH) {
    throw new WebtoolError("invalid_url", `URL too long (>${MAX_URL_LENGTH})`);
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new WebtoolError("invalid_url", `Cannot parse URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebtoolError("invalid_url", `Only http(s) is supported, got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new WebtoolError("invalid_url", "Credentials in URL are not allowed");
  }
  if (url.protocol === "http:") url.protocol = "https:";
  return url;
}

// Resolve host to IPs and reject if any is private (unless ALLOW_PRIVATE).
export async function ensurePublicHost(host: string): Promise<void> {
  if (ALLOW_PRIVATE) return;
  if (isPrivateAddress(host)) {
    throw new WebtoolError("private_address", `Host ${host} is a private/reserved address`);
  }
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateAddress(r.address)) {
        throw new WebtoolError(
          "private_address",
          `Host ${host} resolves to a private address ${r.address}`,
        );
      }
    }
  } catch (e) {
    if (e instanceof WebtoolError) throw e;
    // DNS failure surfaces as a normal fetch error later; don't block.
  }
}

// Same-origin redirect policy (strip leading "www." for hostname compare).
export function isSameOriginRedirect(from: URL, to: URL): boolean {
  if (from.protocol !== to.protocol) return false;
  if (from.port !== to.port) return false;
  if (to.username || to.password) return false;
  const strip = (h: string) => h.replace(/^www\./, "").toLowerCase();
  return strip(from.hostname) === strip(to.hostname);
}

export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * 'manual': do not follow any redirect, return the redirect Response as-is.
   * 'same-origin': follow only same-origin redirects up to MAX_REDIRECTS;
   *   cross-origin returns redirect Response.
   * 'follow': follow all redirects (browser default).
   * Default 'same-origin'.
   */
  redirect?: "manual" | "same-origin" | "follow";
}

export interface RawFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: ArrayBuffer;
  redirect?: { from: string; to: string; status: number }; // set when redirect not followed
}

export async function fetchWithGuards(
  rawUrl: string,
  opts: FetchOptions = {},
): Promise<RawFetchResult> {
  const url = normalizeAndValidateUrl(rawUrl);
  await ensurePublicHost(url.hostname);

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const policy = opts.redirect ?? "same-origin";

  const headers = {
    "User-Agent": DEFAULT_UA,
    Accept: "text/markdown, text/html, application/xhtml+xml, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...opts.headers,
  };

  // Build combined abort signal: caller's + timeout.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(
    () => ctrl.abort(new WebtoolError("timeout", `Timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });

  let currentUrl = url;
  let hops = 0;
  try {
    while (true) {
      const res = await fetchWithProxyFallback(currentUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: ctrl.signal,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) throw new WebtoolError("bad_redirect", "Redirect with no Location header");
        const next = new URL(location, currentUrl);
        if (policy === "manual") {
          return {
            finalUrl: currentUrl.toString(),
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            body: new ArrayBuffer(0),
            redirect: { from: currentUrl.toString(), to: next.toString(), status: res.status },
          };
        }
        if (policy === "same-origin" && !isSameOriginRedirect(currentUrl, next)) {
          return {
            finalUrl: currentUrl.toString(),
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            body: new ArrayBuffer(0),
            redirect: { from: currentUrl.toString(), to: next.toString(), status: res.status },
          };
        }
        if (++hops > MAX_REDIRECTS) {
          throw new WebtoolError("too_many_redirects", `Exceeded ${MAX_REDIRECTS} redirects`);
        }
        // Re-validate the next URL (re-runs SSRF guard).
        currentUrl = normalizeAndValidateUrl(next.toString());
        await ensurePublicHost(currentUrl.hostname);
        continue;
      }

      const lenHeader = res.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > MAX_HTTP_CONTENT_LENGTH) {
        throw new WebtoolError(
          "too_large",
          `Content-Length ${lenHeader} exceeds limit ${MAX_HTTP_CONTENT_LENGTH}`,
        );
      }

      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_HTTP_CONTENT_LENGTH) {
        throw new WebtoolError(
          "too_large",
          `Body ${body.byteLength}B exceeds limit ${MAX_HTTP_CONTENT_LENGTH}B`,
        );
      }

      return {
        finalUrl: currentUrl.toString(),
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body,
      };
    }
  } finally {
    clearTimeout(timeoutId);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}
