import { expect, test } from "bun:test";
import { validatePackage, validateTrigger, repository } from "../scripts/npm/check.ts";
import pkg from "../package.json";

test("release metadata selects stable and prerelease channels", () => {
  expect(validatePackage({ ...pkg, version: "0.7.0" }).distTag).toBe("latest");
  expect(validatePackage({ ...pkg, version: "0.7.0-beta.1" })).toEqual({
    version: "0.7.0-beta.1",
    filename: "agent-webtool-0.7.0-beta.1.tgz",
    distTag: "next",
  });
  for (const version of [
    "v0.7.0",
    "01.0.0",
    "0.7.0-beta.01",
    "0.7.0+build",
    "0.7.0\nfilename=bad",
  ]) {
    expect(() => validatePackage({ ...pkg, version })).toThrow();
  }
});

test("release metadata rejects wrong repository, registry and local dependencies", () => {
  for (const patch of [
    { repository: { type: "git", url: "git+https://github.com/other/repo.git" } },
    { publishConfig: { access: "public", registry: "https://example.com" } },
    { private: true },
    { dependencies: { local: "file:../local" } },
    { optionalDependencies: { local: "workspace:*" } },
  ])
    expect(() => validatePackage({ ...pkg, ...patch })).toThrow();
});

test("release accepts only exact version tags or manual validation in the owning repository", () => {
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: repository,
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: `refs/tags/v${pkg.version}`,
  };
  expect(() => validateTrigger(pkg.version, env)).not.toThrow();
  expect(() =>
    validateTrigger(pkg.version, {
      ...env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
    }),
  ).not.toThrow();
  for (const patch of [
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_REF: "refs/tags/v0.0.0" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REPOSITORY: "other/agent-webtool" },
  ])
    expect(() => validateTrigger(pkg.version, { ...env, ...patch })).toThrow();
});
