import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearFetchCache,
  clearCollectedSources,
  collectedSources,
  webFetch,
} from "../src/index.ts";
import type { RawFetchResult } from "../src/core/http.ts";

beforeEach(() => {
  clearCollectedSources();
});

const HTML = `<!doctype html><html><head><title>T</title>
<script>var x=1</script>
<style>body{color:red}</style>
</head><body>
<h1>Hello</h1>
<p>World <a href="https://bun.sh">bun</a></p>
</body></html>`;

function mockResp(body: string, contentType = "text/html"): RawFetchResult {
  return {
    finalUrl: "https://example.com/",
    status: 200,
    contentType,
    body: new TextEncoder().encode(body).buffer as ArrayBuffer,
  };
}

describe("webFetch", () => {
  test("markdown format converts HTML", async () => {
    clearFetchCache();
    const out = await webFetch(
      { url: "https://example.com/m", format: "markdown" },
      { fetch: async () => mockResp(HTML) },
    );
    expect(typeof out).toBe("string");
    expect(out).toContain("# Hello");
    expect(out).toContain("[bun](https://bun.sh)");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("[truncated]");
  });

  test("text format strips tags", async () => {
    clearFetchCache();
    const out = await webFetch(
      { url: "https://example.com/t", format: "text" },
      { fetch: async () => mockResp(HTML) },
    );
    expect(out).toContain("Hello");
    expect(out).toContain("World");
    expect(out).not.toContain("<h1>");
    expect(out).not.toContain("var x=1");
  });

  test("html format returns raw", async () => {
    clearFetchCache();
    const out = await webFetch(
      { url: "https://example.com/h", format: "html" },
      { fetch: async () => mockResp(HTML) },
    );
    expect(out).toBe(HTML);
  });

  test("truncates when over maxBytes", async () => {
    clearFetchCache();
    const big = "x".repeat(2000);
    const out = await webFetch(
      { url: "https://example.com/big", format: "html", maxBytes: 500 },
      { fetch: async () => mockResp(big, "text/plain") },
    );
    expect(out).toContain("[truncated]");
    expect(out.length).toBeLessThan(2000);
  });

  test("caches by url+format+maxBytes", async () => {
    clearFetchCache();
    let calls = 0;
    const f = async () => {
      calls++;
      return mockResp(HTML);
    };
    await webFetch({ url: "https://cache.example/", format: "markdown" }, { fetch: f });
    await webFetch({ url: "https://cache.example/", format: "markdown" }, { fetch: f });
    expect(calls).toBe(1);
    await webFetch({ url: "https://cache.example/", format: "text" }, { fetch: f });
    expect(calls).toBe(2);
  });

  test("rejects binary in markdown mode", async () => {
    clearFetchCache();
    const bin = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    await expect(
      webFetch(
        { url: "https://example.com/img", format: "markdown" },
        {
          fetch: async () => ({
            finalUrl: "https://example.com/img",
            status: 200,
            contentType: "image/png",
            body: bin.buffer as ArrayBuffer,
          }),
        },
      ),
    ).rejects.toThrow(/Binary content/);
  });

  test("reports cross-origin redirect as plain text", async () => {
    clearFetchCache();
    const out = await webFetch(
      { url: "https://a.example/" },
      {
        fetch: async () => ({
          finalUrl: "https://a.example/",
          status: 301,
          contentType: "",
          body: new ArrayBuffer(0),
          redirect: { from: "https://a.example/", to: "https://b.example/x", status: 301 },
        }),
      },
    );
    expect(out).toContain("[Redirected");
    expect(out).toContain("https://b.example/x");
  });

  test("decodes GBK content via content-type charset", async () => {
    clearFetchCache();
    // "你好世界" in GBK bytes.
    const gbk = [0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7];
    const head = new TextEncoder().encode("<html><head><title>t</title></head><body><h1>");
    const tail = new TextEncoder().encode("</h1></body></html>");
    const bytes = new Uint8Array([...head, ...gbk, ...tail]);
    const out = await webFetch(
      { url: "https://gbk.example/", format: "markdown" },
      {
        fetch: async () => ({
          finalUrl: "https://gbk.example/",
          status: 200,
          contentType: "text/html; charset=gbk",
          body: bytes.buffer as ArrayBuffer,
        }),
      },
    );
    expect(out).toContain("你好世界");
    expect(out).not.toContain("ä½");
  });

  test("sniffs charset from meta when content-type has none", async () => {
    clearFetchCache();
    const gbk = [0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7];
    const head = new TextEncoder().encode('<html><head><meta charset="gbk"></head><body><p>');
    const tail = new TextEncoder().encode("</p></body></html>");
    const bytes = new Uint8Array([...head, ...gbk, ...tail]);
    const out = await webFetch(
      { url: "https://gbkmeta.example/", format: "text" },
      {
        fetch: async () => ({
          finalUrl: "https://gbkmeta.example/",
          status: 200,
          contentType: "text/html",
          body: bytes.buffer as ArrayBuffer,
        }),
      },
    );
    expect(out).toContain("你好世界");
  });

  test("resolves Sogou /link JS-redirect to the real article", async () => {
    clearFetchCache();
    const stub = `<html><head><title>Redirect</title></head><body><script>function f(){var url='';url+='https://mp.weixin.qq.com/';url+='s?src=11&timestamp=1234567';location.href=url;}</script></body></html>`;
    const article = `<html><head><title>微信文章</title></head><body><div id="js_content">${"这里是文章正文内容。".repeat(30)}</div></body></html>`;
    const calls: string[] = [];
    const out = await webFetch(
      { url: "https://wx.sogou.com/link?url=abc", format: "markdown" },
      {
        fetch: async (url: string) => {
          calls.push(url);
          if (url.includes("wx.sogou.com")) return mockResp(stub);
          if (url.startsWith("https://mp.weixin.qq.com/"))
            return mockResp(article, "text/html; charset=utf-8");
          throw new Error(`unexpected url: ${url}`);
        },
      },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe("https://mp.weixin.qq.com/s?src=11&timestamp=1234567");
    expect(out).toContain("这里是文章正文内容");
  });

  test("extracts main content node, skipping nav/footer junk", async () => {
    clearFetchCache();
    const html = `<html><head><title>WeChat Article</title></head><body>
      <header class="header">NAV JUNK</header>
      <nav>NAV JUNK 2</nav>
      <div id="js_content">${"正文段落内容。".repeat(30)}</div>
      <footer>FOOTER JUNK</footer>
    </body></html>`;
    const out = await webFetch(
      { url: "https://wechat.example/", format: "markdown" },
      { fetch: async () => mockResp(html) },
    );
    expect(out).toContain("正文段落内容");
    expect(out).not.toContain("NAV JUNK");
    expect(out).not.toContain("FOOTER JUNK");
  });

  test("registers fetched pages in collectedSources", async () => {
    clearFetchCache();
    await webFetch({ url: "https://reg.example/" }, { fetch: async () => mockResp(HTML) });
    const sources = collectedSources();
    expect(sources.length).toBe(1);
    expect(sources[0]!.url).toContain("reg.example");
    expect(sources[0]!.fetched).toBe(true);
    expect(sources[0]!.id).toBe(1);
  });
});
