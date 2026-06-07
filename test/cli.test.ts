import { describe, expect, test } from 'bun:test'

import { getPackageVersion } from '../src/version.ts'

describe('cli', () => {
  test('--version matches package.json', () => {
    const result = Bun.spawnSync([process.execPath, 'bin/cli.ts', '--version'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).toBe('')
    expect(result.stdout.toString().trim()).toBe(getPackageVersion())
  })
})
