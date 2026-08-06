import { describe, expect, test } from "bun:test";
import { clearFetchCache, webFetch } from "../src/index.ts";
import type { RawFetchResult } from "../src/core/http.ts";

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
});
