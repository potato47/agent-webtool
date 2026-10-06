import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const repository = "potato47/agent-webtool";
export const registry = "https://registry.npmjs.org";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const numeric = "(?:0|[1-9]\\d*)";
const prerelease = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const versionPattern = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?$`,
);
const dependencies = z.record(z.string(), z.string()).optional();
const schema = z.object({
  name: z.literal("agent-webtool"),
  version: z.string().regex(versionPattern),
  private: z.literal(false).optional(),
  repository: z.object({
    type: z.literal("git"),
    url: z.literal(`git+https://github.com/${repository}.git`),
  }),
  publishConfig: z.object({ access: z.literal("public"), registry: z.literal(registry) }),
  dependencies,
  devDependencies: dependencies,
  peerDependencies: dependencies,
  optionalDependencies: dependencies,
});

export function validatePackage(input: unknown) {
  const pkg = schema.parse(input);
  for (const group of [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.peerDependencies,
    pkg.optionalDependencies,
  ]) {
    for (const spec of Object.values(group ?? {})) {
      assert(
        !/^(?:workspace:|file:|link:|\.\.?[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(spec),
        "Package cannot depend on local paths",
      );
    }
  }
  return {
    version: pkg.version,
    filename: `agent-webtool-${pkg.version}.tgz`,
    distTag: pkg.version.includes("-") ? "next" : "latest",
  };
}

export function validateTrigger(version: string, env: Record<string, string | undefined>) {
  if (env.GITHUB_ACTIONS !== "true") return;
  assert(env.GITHUB_REPOSITORY === repository, "Unexpected release repository");
  if (env.GITHUB_EVENT_NAME === "push") {
    assert(env.GITHUB_REF === `refs/tags/v${version}`, "Release tag must equal v<package.version>");
  } else {
    assert(env.GITHUB_EVENT_NAME === "workflow_dispatch", "Unexpected release trigger");
  }
}

if (import.meta.main) {
  const release = validatePackage(
    await Bun.file(new URL("../../package.json", import.meta.url)).json(),
  );
  if (process.argv.includes("--release")) validateTrigger(release.version, process.env);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${release.version}\nfilename=${release.filename}\ndist-tag=${release.distTag}\n`,
    );
  }
  console.log(`Validated agent-webtool@${release.version} (${release.distTag})`);
}
