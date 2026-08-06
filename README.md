# agent-webtool

[![npm version](https://img.shields.io/npm/v/agent-webtool.svg)](https://www.npmjs.com/package/agent-webtool)
[![GitHub](https://img.shields.io/badge/GitHub-potato47%2Fagent--webtool-181717?logo=github)](https://github.com/potato47/agent-webtool)
[![license](https://img.shields.io/npm/l/agent-webtool.svg)](./LICENSE)

Web fetch and multi-engine search tools for AI agents. **No API keys required.**

Exposes two tools through a single binary, usable as a **CLI** or as an **MCP server**:

| Tool         | Purpose                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `web_fetch`  | Fetch a URL and return its content as **markdown**, plain text, or raw HTML.                                                       |
| `web_search` | Query **Bing (RSS) + Baidu + WeChat (Sogou) + Toutiao + DuckDuckGo + Yahoo** in parallel, deduplicate by URL, rank via Reciprocal Rank Fusion (RRF, k=60). |

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

Both commands print to stdout. When stdout is an **interactive terminal**, output is rendered with colors and headings (via `marked-terminal`). When stdout is a **pipe / file / non-TTY**, the same content is printed as **raw text** — perfect for `> page.md` or piping into another command. Use `--raw` to force raw output even in a terminal. `NO_COLOR=1` also disables rendering.

### `webtool fetch`

```bash
webtool fetch https://bun.sh                          # markdown, auto-rendered if TTY
webtool fetch https://example.com --format text       # plain text
webtool fetch https://example.com --format html       # raw HTML
webtool fetch https://example.com > page.md           # raw markdown to file
webtool fetch https://example.com --raw               # raw markdown in terminal
```

Options:

| Flag                | Default    | Description                                            |
| ------------------- | ---------- | ------------------------------------------------------ |
| `--format <fmt>`    | `markdown` | `markdown` \| `text` \| `html`                         |
| `--max-bytes <n>`   | `100000`   | Truncate output at this many bytes                     |
| `--timeout-ms <n>`  | `30000`    | Per-request timeout                                    |
| `--raw`             | —          | Disable terminal markdown rendering (TTY only)         |

> Rendering only applies to `--format markdown`. `text` and `html` are always printed verbatim.

### `webtool search`

```bash
# All 6 engines in parallel
webtool search "bun javascript runtime" --limit 5

# Restrict to a subset
webtool search "typescript handbook" --engines bing,baidu --limit 10

# Past-week news only
webtool search "ai breakthroughs" --time week

# Site-scoped
webtool search "structured outputs" --site docs.anthropic.com
```

Options:

| Flag                  | Default                            | Description                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `--engines <list>`    | `bing,baidu,wechat,toutiao,duckduckgo,yahoo` | Comma-separated subset                           |
| `--limit <n>`         | `10`                               | Max aggregated results (1–30)                              |
| `--time <range>`      | —                                  | `day` \| `week` \| `month` \| `year` (engines may ignore)  |
| `--site <domain>`     | —                                  | Restrict to a domain (injects `site:` operator)            |
| `--raw`               | —                                  | Disable terminal markdown rendering (TTY only)             |

### Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Success                                                |
| `1`  | Generic error                                          |
| `2`  | Invalid input (URL, engine name, schema validation)    |
| `3`  | Network failure                                        |

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

## Output format

Both tools return **plain text** — no JSON wrapping, no metadata envelope. Pipe it straight into a file or another command.

### `web_fetch`

Returns the page content as a string in the requested format (`markdown` / `text` / `html`). For example, fetching `https://example.com` in markdown mode prints:

```markdown
Example Domain

# Example Domain

This domain is for use in documentation examples without needing permission. Avoid use in operations.

[Learn more](https://iana.org/domains/example)
```

When a URL redirects to a different host, the output is a single line you can act on:

```
[Redirected to a different host: https://final-host.example/]
[Call web_fetch again with the redirect URL to follow.]
```

If the content exceeds `--max-bytes`, the output ends with a `[truncated]` marker.

### `web_search`

Returns a citation list, one entry per result (number, title, URL, snippet). Citation numbers are stable across calls within the same process — the same URL keeps its `[n]`:

```text
[1] Bun — A fast all-in-one JavaScript runtime
https://bun.sh/
Bundle, install, and run JavaScript & TypeScript — all in Bun.

[2] GitHub - oven-sh/bun: Incredibly fast JavaScript runtime, bundler, test runner, and package manager
https://github.com/oven-sh/bun
Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one.

[3] Bun (software) - Wikipedia (2026年8月6日)
https://en.wikipedia.org/wiki/Bun_(software)
Bun is a JavaScript runtime, package manager and test runner designed as a drop-in replacement for Node.js.
```

Per-engine metadata (WeChat account name, Toutiao source, Bing publish date) is appended in parentheses. If some engines fail (timeout / challenge page / parse error) or return a page with zero parsed hits, footer lines appear at the end:

```text
> Note: 1 engine(s) failed — bing.
> Note: 1 engine(s) returned no results — toutiao.
```

If **all** engines fail or return nothing, the search returns a per-engine status line instead of erroring:

```text
No results. Engine status: bing: timeout; baidu: 3 results; wechat: 0 results; ...
```

Aggregation: results from each engine are pulled in parallel (3s per-engine cap), URLs are **normalized** (HTTPS-upgraded, `www.` stripped, tracking params removed, trailing slash trimmed, query keys sorted), then merged across engines. Final ranking uses **Reciprocal Rank Fusion** (`score = Σ 1 / (60 + rank)`).

---

## Behavior & security

- **HTTPS upgrade.** `http://` URLs are auto-upgraded to `https://`.
- **Same-origin redirects only.** Up to 10 hops, host compared modulo a leading `www.`. Cross-origin redirects are reported in the output (not followed) — call again with the new URL to follow.
- **SSRF guard.** Private, loopback, and link-local addresses (RFC 1918, `127/8`, `169.254/16`, IPv6 ULA/link-local, `::ffff:` mapped privates) are rejected. Set `WEBTOOL_ALLOW_PRIVATE=1` to allow `localhost` for development.
- **Hard 10 MB cap** on fetched response body.
- **15-minute LRU cache** on `web_fetch` (keyed by URL + format + maxBytes; 256 entries / 50 MB cap).
- **Charset-aware decoding.** Responses are decoded honoring the `Content-Type` charset (then a `<meta charset>` sniff), so GBK/GB2312 pages from Chinese sites don't mojibake.
- **Sogou `/link` resolution.** WeChat search results are Sogou JS-redirect stubs; `web_fetch` resolves them to the real article automatically.
- **Article extraction.** `web_fetch` prefers a main-content node (`article`, `main`, `#js_content`, `.rich_media_content`, …) and strips nav/header/footer noise before converting.
- **Per-engine 3s timeout** in `web_search`. Engines that fail or return zero parsed hits are reported in the footer; others still return results (partial success). If every engine fails, a per-engine status line is returned instead of erroring.
- **No telemetry.** No third-party API keys. All requests go directly to the target host.

---

## Library use (optional)

This package primarily ships a CLI / MCP binary. If you want to call the core functions from JavaScript, install the source and import from `src/`:

```ts
import { webFetch, webSearch } from 'agent-webtool/src/index.ts' // requires bun or a TS-aware loader

const markdown = await webFetch({ url: 'https://example.com' })  // → string
const citations = await webSearch({ query: 'bun runtime' })      // → string (citation list)
```

Both functions return a plain string. `webFetch` also populates a per-process citation index (`collectedSources()`), so a URL fetched after appearing in search results keeps its `[n]` id.

---

## Development

```bash
git clone https://github.com/potato47/agent-webtool.git
cd agent-webtool
bun install
bun test            # 67 fixture-based tests; no network
bun run cli -- search "test" --limit 3
bun run build       # produces dist/cli.mjs (single ESM bundle)
```

The build is a single self-contained ESM file that runs under plain Node ≥ 18. Bun is only required at dev time.

Refreshing engine selectors when a SERP changes:

```bash
bun scratch/probe-engines.ts          # captures fresh HTML to scratch/dump/
bun scratch/peek.ts                   # tests parsers against fresh capture
# then update selectors in src/core/engines/*.ts
```

---

## Contributing

Issues and pull requests welcome at <https://github.com/potato47/agent-webtool>.

When opening a bug report, please include:
- the command you ran (or MCP `tools/call` request),
- the full output (use `--raw` for searches so the markdown is verbatim),
- your Node / Bun version (`node -v`, `bun -v`) and OS.

---

## License

MIT — see [LICENSE](./LICENSE).
