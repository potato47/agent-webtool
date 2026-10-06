import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, registry, root, validatePackage } from "./check.ts";

async function run(args: string[], cwd: string, capture = false): Promise<string> {
  const child = Bun.spawn(args, { cwd, stdout: capture ? "pipe" : "inherit", stderr: "inherit" });
  const output = capture ? await new Response(child.stdout).text() : "";
  assert((await child.exited) === 0, `Failed: ${args.join(" ")}`);
  return output;
}

const release = validatePackage(await Bun.file(join(root, "package.json")).json());
const output = join(root, "artifacts/npm");
await mkdir(output, { recursive: true });
const archive = join(output, release.filename);
await rm(archive, { force: true });
const packed = JSON.parse(
  await run(
    ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", output],
    root,
    true,
  ),
);
assert(packed.length === 1 && packed[0].filename === release.filename, "Unexpected archive name");
const files: string[] = packed[0].files.map((entry: { path: string }) => entry.path);
for (const name of files) {
  assert(
    ["package.json", "README.md", "LICENSE"].includes(name) ||
      /^dist\/(?:cli\.mjs|index\.(?:mjs|cjs)|types\/[\w/.-]+\.d\.ts)$/.test(name),
    `Unexpected archive entry: ${name}`,
  );
  assert(!name.split("/").includes(".."), `Unsafe archive entry: ${name}`);
}
for (const name of [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/cli.mjs",
  "dist/index.mjs",
  "dist/index.cjs",
  "dist/types/index.d.ts",
]) {
  assert(files.includes(name), `Missing archive entry: ${name}`);
}

const temporary = await mkdtemp(join(tmpdir(), "agent-webtool-consumer-"));
try {
  const typescript = await Bun.file(join(root, "node_modules/typescript/package.json")).json();
  await writeFile(
    join(temporary, "package.json"),
    JSON.stringify({
      name: "webtool-consumer",
      private: true,
      type: "module",
      dependencies: { "agent-webtool": `file:${archive}` },
      devDependencies: { typescript: typescript.version },
    }),
  );
  await run(
    [
      "npm",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      `--registry=${registry}`,
    ],
    temporary,
  );
  const installed = await Bun.file(
    join(temporary, "node_modules/agent-webtool/package.json"),
  ).json();
  assert(
    validatePackage(installed).version === release.version,
    "Installed version differs from archive",
  );
  for (const name of ["sdk-smoke.mjs", "sdk-smoke.cjs", "sdk-consumer.ts", "package-smoke.mjs"]) {
    await cp(join(root, "test", name), join(temporary, name));
  }
  await run(["node", "sdk-smoke.mjs"], temporary);
  await run(["node", "sdk-smoke.cjs"], temporary);
  await run(
    [
      "node",
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--skipLibCheck",
      "sdk-consumer.ts",
    ],
    temporary,
  );
  await run(["node", "package-smoke.mjs"], temporary);
  const sha256 = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(archive).arrayBuffer())
    .digest("hex");
  await writeFile(`${archive}.sha256`, `${sha256}  ${release.filename}\n`);
  console.log(
    `Verified independent SDK, CLI and MCP consumer: ${release.filename}\nSHA-256: ${sha256}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
