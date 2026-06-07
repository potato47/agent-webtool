import { readFileSync } from 'node:fs'

type PackageJson = {
  version?: string
}

export function getPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as PackageJson

  if (!packageJson.version) {
    throw new Error('package.json is missing a version field')
  }

  return packageJson.version
}
