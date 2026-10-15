import { describe, expect, it } from 'vitest'
import { POLICY, threshold } from './policy.ts'

describe('threshold', () => {
  it.each([
    [1_000_000, 238_000],
    [300_000, 238_000],
    [200_000, 153_000],
    [128_000, 91_800],
    [50_000, 17_000],
  ])('a model with context %i compacts at %i', (context, expected) => {
    expect(threshold(context, 64_000)).toBe(expected)
  })

  it('reserves 20000 for an unknown max output', () => {
    expect(threshold(200_000, undefined)).toBe(153_000)
  })

  it('reserves only a smaller max output', () => {
    expect(threshold(200_000, 8_000)).toBe(163_200)
  })

  it('takes the cap from the policy', () => {
    expect(threshold(1_000_000, 64_000, { ...POLICY, cap: 60_000 })).toBe(27_000)
  })
})
