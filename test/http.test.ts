import { describe, expect, test } from 'bun:test'
import {
  isPrivateAddress,
  isSameOriginRedirect,
  normalizeAndValidateUrl,
  WebtoolError,
} from '../src/core/http.ts'

describe('normalizeAndValidateUrl', () => {
  test('upgrades http to https', () => {
    const u = normalizeAndValidateUrl('http://example.com/')
    expect(u.protocol).toBe('https:')
  })
  test('rejects file://', () => {
    expect(() => normalizeAndValidateUrl('file:///etc/passwd')).toThrow(WebtoolError)
  })
  test('rejects credentialed URLs', () => {
    expect(() => normalizeAndValidateUrl('https://user:pw@example.com/')).toThrow(WebtoolError)
  })
  test('rejects too-long URLs', () => {
    const tooLong = 'https://example.com/' + 'a'.repeat(2100)
    expect(() => normalizeAndValidateUrl(tooLong)).toThrow(WebtoolError)
  })
  test('rejects garbage', () => {
    expect(() => normalizeAndValidateUrl('not a url')).toThrow(WebtoolError)
  })
})

describe('isPrivateAddress', () => {
  test.each([
    ['127.0.0.1', true],
    ['10.0.0.5', true],
    ['172.16.5.1', true],
    ['172.31.0.1', true],
    ['172.32.0.1', false], // outside private range
    ['192.168.0.1', true],
    ['169.254.1.1', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['2001:4860:4860::8888', false],
    ['::ffff:127.0.0.1', true],
    ['::ffff:8.8.8.8', false],
  ])('classifies %s as private=%s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })
})

describe('isSameOriginRedirect', () => {
  test('strips leading www and matches', () => {
    expect(
      isSameOriginRedirect(
        new URL('https://example.com/a'),
        new URL('https://www.example.com/b'),
      ),
    ).toBe(true)
  })
  test('rejects protocol change', () => {
    expect(
      isSameOriginRedirect(new URL('https://x.com/'), new URL('http://x.com/')),
    ).toBe(false)
  })
  test('rejects different host', () => {
    expect(
      isSameOriginRedirect(new URL('https://a.com/'), new URL('https://b.com/')),
    ).toBe(false)
  })
})
