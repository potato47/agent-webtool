import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

const require = createRequire(import.meta.url);
const pkg = require("agent-webtool/package.json");
const packageRoot = dirname(require.resolve("agent-webtool/package.json"));
for (const name of ["agent-webtool", "webtool"]) {
  const output = execFileSync(
    process.execPath,
    [resolve(packageRoot, pkg.bin[name]), "--version"],
    { encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(output.trim(), pkg.version);
}

async function checkMcp(args, names) {
  const child = spawn(process.execPath, [resolve(packageRoot, pkg.bin.webtool), "mcp", ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  let stderr = "";
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on("error", rejectPending);
  child.on("exit", (code) => rejectPending(new Error(`MCP exited (${code}): ${stderr}`)));
  lines.on("line", (line) => {
    try {
      const response = JSON.parse(line);
      const request = pending.get(response.id);
      if (request) {
        pending.delete(response.id);
        if (response.error) request.reject(new Error(JSON.stringify(response.error)));
        else request.resolve(response.result);
      }
    } catch (error) {
      rejectPending(error);
    }
  });
  let id = 0;
  const request = (method, params = {}) =>
    new Promise((resolveResult, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve: resolveResult, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
    });
  const timeout = setTimeout(() => {
    rejectPending(new Error("MCP smoke timed out"));
    child.kill();
  }, 10_000);
  try {
    const initialized = await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "package-smoke", version: "1.0.0" },
    });
    assert.equal(initialized.serverInfo.version, pkg.version);
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    const list = await request("tools/list");
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(), names.sort());
    const invalid = await request("tools/call", {
      name: "web_fetch",
      arguments: { url: "file:///not-a-network-request" },
    });
    assert.equal(invalid.isError, true);
    assert(invalid.content.some((item) => item.type === "text"));
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.kill();
    await exited;
  }
}
await checkMcp([], ["web_fetch", "web_search"]);
await checkMcp(["--tools", "fetch"], ["web_fetch"]);
console.log("Packaged CLI aliases and MCP stdio handshake/tools/error response passed");
