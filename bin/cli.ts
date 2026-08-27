#!/usr/bin/env node
import { Command } from "commander";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { webFetch, webSearch, WebtoolError, ENGINE_NAMES } from "../src/index.ts";
import { fetchInputSchema, searchInputSchema } from "../src/schemas.ts";
import { runMcpServer } from "./mcp.ts";
import { getPackageVersion } from "../src/version.ts";
import type { EngineName, FetchFormat, TimeRange } from "../src/core/types.ts";

const VERSION = getPackageVersion();

function die(code: number, msg: string): never {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// Configure marked-terminal lazily so we only pay the cost when we actually render.
let markedConfigured = false;
function ensureMarked(): void {
  if (markedConfigured) return;
  // @types/marked-terminal@6 is behind marked-terminal@7 in its return type;
  // the runtime object is a valid Marked extension, the static types just disagree.
  marked.use(markedTerminal() as unknown as Parameters<typeof marked.use>[0]);
  markedConfigured = true;
}

function shouldRender(opts: { raw?: boolean; renderable?: boolean }): boolean {
  if (opts.raw) return false;
  if (opts.renderable === false) return false;
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY);
}

function out(text: string, opts: { raw?: boolean; renderable?: boolean } = {}): void {
  let body = text;
  if (shouldRender(opts)) {
    ensureMarked();
    body = marked.parse(text) as string;
  }
  process.stdout.write(body);
  if (!body.endsWith("\n")) process.stdout.write("\n");
}

function classifyError(e: unknown): number {
  if (e instanceof WebtoolError) {
    if (e.code === "invalid_url" || e.code === "private_address") return 2;
    return 3;
  }
  return 1;
}

const program = new Command();
program
  .name("webtool")
  .description("Web fetch + multi-engine search tools for AI agents")
  .version(VERSION);

program
  .command("fetch <url>")
  .description("Fetch a URL and print its content as markdown (default), text, or html")
  .option("-f, --format <fmt>", "output format: markdown | text | html", "markdown")
  .option("-m, --max-bytes <n>", "truncate at N bytes", (v) => Number.parseInt(v, 10))
  .option("-t, --timeout-ms <n>", "request timeout in ms", (v) => Number.parseInt(v, 10))
  .option("--raw", "print raw text without terminal markdown rendering")
  .action(
    async (
      url: string,
      opts: { format?: string; maxBytes?: number; timeoutMs?: number; raw?: boolean },
    ) => {
      const format = (opts.format ?? "markdown") as FetchFormat;
      const parsed = fetchInputSchema.safeParse({
        url,
        format,
        maxBytes: opts.maxBytes,
        timeoutMs: opts.timeoutMs,
      });
      if (!parsed.success) die(2, parsed.error.toString());
      try {
        // Only markdown output is worth rendering; text/html stay raw.
        out(await webFetch(parsed.data), { raw: opts.raw, renderable: format === "markdown" });
      } catch (e) {
        die(classifyError(e), `${(e as Error).message}`);
      }
    },
  );

program
  .command("search <query>")
  .description("Run a multi-engine web search and print results as citation lines")
  .option(
    "-e, --engines <list>",
    `comma-separated subset of [${ENGINE_NAMES.join(",")}]; defaults to all`,
  )
  .option("-l, --limit <n>", "max final results", (v) => Number.parseInt(v, 10))
  .option("-t, --timeout-ms <n>", "per-engine timeout in ms", (v) => Number.parseInt(v, 10))
  .option("--time <range>", "time filter: day | week | month | year")
  .option("--site <domain>", "restrict to a site (injects site: operator)")
  .option("--raw", "print raw markdown without terminal rendering")
  .action(
    async (
      query: string,
      opts: {
        engines?: string;
        limit?: number;
        timeoutMs?: number;
        time?: string;
        site?: string;
        raw?: boolean;
      },
    ) => {
      let engines: EngineName[] | undefined;
      if (opts.engines) {
        const parts = opts.engines
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const known = new Set<string>(ENGINE_NAMES);
        const bad = parts.filter((p) => !known.has(p));
        if (bad.length)
          die(2, `Unknown engines: ${bad.join(", ")}. Valid: ${ENGINE_NAMES.join(", ")}`);
        engines = parts as EngineName[];
      }
      const parsed = searchInputSchema.safeParse({
        query,
        engines,
        limit: opts.limit,
        timeoutMs: opts.timeoutMs,
        timeRange: opts.time as TimeRange | undefined,
        site: opts.site,
      });
      if (!parsed.success) die(2, parsed.error.toString());
      try {
        out((await webSearch(parsed.data)).text, { raw: opts.raw });
      } catch (e) {
        die(classifyError(e), `${(e as Error).message}`);
      }
    },
  );

program
  .command("mcp")
  .description("Run an MCP server over stdio exposing web_fetch / web_search")
  .option("-t, --tools <list>", "comma-separated subset of [fetch,search]", "fetch,search")
  .action(async (opts: { tools: string }) => {
    const requested = opts.tools
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = new Set(["fetch", "search"]);
    const bad = requested.filter((t) => !valid.has(t));
    if (bad.length) die(2, `Unknown tools: ${bad.join(", ")}. Valid: fetch, search`);
    await runMcpServer({ tools: requested as ("fetch" | "search")[] });
  });

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(`fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
