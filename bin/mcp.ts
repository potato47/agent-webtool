import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { webFetch, webSearch } from "../src/index.ts";
import { fetchInputSchema, searchInputSchema } from "../src/schemas.ts";

export interface McpOptions {
  tools: Array<"fetch" | "search">;
}

export async function runMcpServer(opts: McpOptions): Promise<void> {
  const server = new McpServer(
    { name: "webtool", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Exposes web_fetch (fetch a URL → markdown/text/html) and web_search " +
        "(parallel multi-engine search returned as a markdown-formatted ranked list). " +
        "No API keys required.",
    },
  );

  if (opts.tools.includes("fetch")) {
    server.registerTool(
      "web_fetch",
      {
        title: "Fetch a web page",
        description:
          "Fetch a URL and return its content as a plain string. Default format is markdown " +
          "(HTML is converted via turndown). HTTP is auto-upgraded to HTTPS. Same-origin " +
          "redirects are followed; cross-origin redirects are reported in the output. " +
          'Private IPs are rejected. Use format="html" for raw HTML, "text" for plain text.',
        inputSchema: fetchInputSchema.shape,
      },
      async (args) => {
        try {
          const text = await webFetch(args);
          return { content: [{ type: "text", text }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { isError: true, content: [{ type: "text", text: msg }] };
        }
      },
    );
  }

  if (opts.tools.includes("search")) {
    server.registerTool(
      "web_search",
      {
        title: "Search the web across multiple engines",
        description:
          "Run a search query concurrently across DuckDuckGo, Bing, Brave, and Yahoo. " +
          "Results are deduplicated by normalized URL, ranked via Reciprocal Rank Fusion, " +
          "and returned as a markdown-formatted numbered list ([title](url) + snippet). " +
          "Pass `engines` to restrict to a subset.",
        inputSchema: searchInputSchema.shape,
      },
      async (args) => {
        try {
          const text = await webSearch(args);
          return { content: [{ type: "text", text }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { isError: true, content: [{ type: "text", text: msg }] };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
