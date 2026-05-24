# agent-webtool

[![npm version](https://img.shields.io/npm/v/agent-webtool.svg)](https://www.npmjs.com/package/agent-webtool)
[![license](https://img.shields.io/npm/l/agent-webtool.svg)](./LICENSE)

Web fetch and multi-engine search tools for AI agents. **No API keys required.**

Exposes two tools through a single binary, usable as a **CLI** or as an **MCP server**:

| Tool         | Purpose                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `web_fetch`  | Fetch a URL and return its content as **markdown**, plain text, or raw HTML.                                                       |
| `web_search` | Query **DuckDuckGo + Bing + Brave + Yahoo** in parallel, deduplicate by URL, rank results via Reciprocal Rank Fusion (RRF, k=60).  |

Designed for agents that need first-class web access without depending on Google / Bing / SerpAPI accounts. Runs on **Node.js ≥ 18** or **Bun ≥ 1.0** — pick whichever you have.

---

## Install

### One-shot (no install, recommended for MCP)

```bash
# npm
npx -y agent-webtool fetch https://example.com
npx -y agent-webtool search "claude code mcp"

# bun
bunx agent-webtool fetch https://example.com
bunx agent-webtool search "claude code mcp"
```

### Global install

```bash
# npm
npm install -g agent-webtool

# bun
bun add -g agent-webtool

# then either binary name works:
webtool fetch https://example.com
agent-webtool search "claude code mcp"
```

Both binary names (`webtool` and `agent-webtool`) point to the same CLI.

### Project install

```bash
# npm
npm install --save-dev agent-webtool

# bun
bun add -d agent-webtool

# use in package.json scripts:
#   "search": "agent-webtool search ..."
```

> **Requirements:** Node.js ≥ 18 (native `fetch`) or Bun ≥ 1.0.

---

## Use as a CLI

```
Usage: webtool [options] [command]

Commands:
  fetch <url> [options]      Fetch a URL → markdown / text / html
  search <query> [options]   Multi-engine parallel search with RRF aggregation
  mcp [options]              Run an MCP stdio server exposing web_fetch / web_search

Run `webtool <command> --help` for per-command options.
```

### `webtool fetch`

```bash
webtool fetch https://bun.sh --format markdown --pretty
```

Options:

| Flag                | Default    | Description                                    |
| ------------------- | ---------- | ---------------------------------------------- |
| `--format <fmt>`    | `markdown` | `markdown` \| `text` \| `html`                 |
| `--max-bytes <n>`   | `100000`   | Truncate output at this many bytes             |
| `--timeout-ms <n>`  | `30000`    | Per-request timeout                            |
| `--pretty`          | —          | Pretty-print JSON output                       |

### `webtool search`

```bash
# All 4 engines in parallel
webtool search "bun javascript runtime" --limit 5 --pretty

# Restrict to a subset
webtool search "typescript handbook" --engines brave,duckduckgo --limit 10

# Past-week news only
webtool search "ai breakthroughs" --time week

# Site-scoped
webtool search "structured outputs" --site docs.anthropic.com
```

Options:

| Flag                  | Default                            | Description                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `--engines <list>`    | `duckduckgo,bing,brave,yahoo`      | Comma-separated subset                                     |
| `--limit <n>`         | `10`                               | Max aggregated results (1–30)                              |
| `--time <range>`      | —                                  | `day` \| `week` \| `month` \| `year` (engines may ignore)  |
| `--site <domain>`     | —                                  | Restrict to a domain (injects `site:` operator)            |
| `--pretty`            | —                                  | Pretty-print JSON output                                   |

### Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Success                                                |
| `1`  | Generic error                                          |
| `2`  | Invalid input (URL, engine name, schema validation)    |
| `3`  | Network failure (or **all** engines failed in search)  |

---

## Use as an MCP server

`agent-webtool` ships an MCP server over stdio. Any MCP-compatible client can connect.

```bash
# npm
npx -y agent-webtool mcp                      # both tools
npx -y agent-webtool mcp --tools fetch        # only web_fetch
npx -y agent-webtool mcp --tools fetch,search # both, explicit

# bun
bunx agent-webtool mcp
bunx agent-webtool mcp --tools fetch,search
```

> The integrations below use `npx -y` in their examples. If you prefer Bun, replace `npx -y` with `bunx` and `npx` (the launcher in the `args` array) with `bunx`.

### Claude Code

```bash
# User scope (available in every project; recommended)
claude mcp add --scope user webtool -- npx -y agent-webtool mcp

# Project scope (writes ./.mcp.json, shared with teammates via git)
claude mcp add --scope project webtool -- npx -y agent-webtool mcp

# Bun-based equivalent
claude mcp add --scope user webtool -- bunx agent-webtool mcp

# Verify
claude mcp list
```

### Codex CLI

```bash
codex mcp add webtool -- npx -y agent-webtool mcp

# Bun-based equivalent
codex mcp add webtool -- bunx agent-webtool mcp

# Verify
codex mcp list
```

The entry is written to `~/.codex/config.toml` under `[mcp_servers.webtool]`.

### Claude Desktop

No CLI for adding servers — edit the config file directly. On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "webtool": {
      "command": "npx",
      "args": ["-y", "agent-webtool", "mcp"]
    }
  }
}
```

### Cursor

Edit `~/.cursor/mcp.json` (user) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "webtool": {
      "command": "npx",
      "args": ["-y", "agent-webtool", "mcp"]
    }
  }
}
```

### Continue / any generic MCP client

Spawn `npx -y agent-webtool mcp` and speak the MCP protocol over stdio. The server advertises two tools (`web_fetch`, `web_search`) and their JSON Schemas via `tools/list`.

---

## Output schemas

### `web_fetch`

```jsonc
{
  "url":          "https://bun.sh/",
  "status":       200,
  "contentType":  "text/html; charset=utf-8",
  "content":      "...markdown / text / html...",
  "bytes":        12345,
  "truncated":    false,
  "durationMs":   612
}
```

### `web_search`

```jsonc
{
  "query": "bun javascript runtime",
  "engines": ["duckduckgo", "bing", "brave", "yahoo"],
  "results": [
    {
      "title":   "GitHub - oven-sh/bun: ...",
      "url":     "https://github.com/oven-sh/bun",
      "snippet": "...",
      "score":   0.0322,                          // RRF score, desc-sorted
      "sources": [                                // which engines reported it and at what rank
        { "engine": "brave", "rank": 2 },
        { "engine": "yahoo", "rank": 2 }
      ]
    }
  ],
  "errors": [
    { "engine": "duckduckgo", "message": "no results parsed (possible challenge page)" }
  ],
  "durationMs": 1066
}
```

Aggregation: results from each engine are pulled in parallel, URLs are **normalized** (HTTPS-upgraded, `www.` stripped, tracking params removed, trailing slash trimmed, query keys sorted), then merged. Final ordering uses **Reciprocal Rank Fusion** (`score = Σ 1 / (60 + rank)` over sources).

---

## Behavior & security

- **HTTPS upgrade.** `http://` URLs are auto-upgraded to `https://`.
- **Same-origin redirects only.** Up to 10 hops, host compared modulo a leading `www.`. Cross-origin redirects are *reported* (not followed) — call again with the new URL if you want to follow.
- **SSRF guard.** Private, loopback, and link-local addresses (RFC 1918, `127/8`, `169.254/16`, IPv6 ULA/link-local, `::ffff:` mapped privates) are rejected. Set `WEBTOOL_ALLOW_PRIVATE=1` to allow `localhost` for development.
- **Hard 10 MB cap** on fetched response body.
- **15-minute LRU cache** on `web_fetch` (keyed by URL + format + maxBytes; 256 entries / 50 MB cap).
- **Per-engine 15s timeout** in `web_search`. Engines that fail or return zero parsed hits are listed in `errors[]`; others still return results (partial success).
- **No telemetry.** No third-party API keys. All requests go directly to the target host.

---

## Library use (optional)

This package primarily ships a CLI / MCP binary. If you want to call the core functions from JavaScript, install the source and import from `src/`:

```ts
import { webFetch, webSearch } from 'agent-webtool/src/index.ts' // requires bun or a TS-aware loader
```

A dedicated library entry (`exports`-mapped, with `.d.ts`) may be added in a future release. For now, CLI/MCP is the supported surface.

---

## Development

```bash
git clone <repo>
cd agent-webtool
bun install
bun test            # 49 fixture-based tests; no network
bun run cli -- search "test" --limit 3
bun run build       # produces dist/cli.mjs (single ESM bundle, ~3.6 MB)
```

The build is a single self-contained ESM file that runs under plain Node ≥ 18. Bun is only required at dev time.

Refreshing engine selectors when a SERP changes:

```bash
bun scratch/probe-engines.ts          # captures fresh HTML to scratch/dump/
bun scratch/peek.ts                   # tests parsers against fresh capture
# then update selectors in src/core/engines/*.ts
```

---

## License

MIT — see [LICENSE](./LICENSE).
