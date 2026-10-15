import { describe, expect, it } from 'vitest'
import { cutSkill, estimateTokens, HEADER, MARKER, renderBlock } from './skills.ts'

describe('values copied from Claude Code 2.1.300', () => {
  it('marker', () => {
    expect(MARKER).toBe('\n\n[... skill content truncated for compaction; use Read on the skill path if you need the full text]')
    expect(MARKER.length).toBe(100)
  })

  it('header', () => {
    expect(HEADER.startsWith('The following skills were invoked EARLIER in this session (before the conversation was compacted), not on the current turn. They are shown here for context only so you remain aware of their guidelines.\n\nIMPORTANT: Do NOT re-execute these skills')).toBe(true)
    expect(HEADER).toContain('embedded in the skill bodies below — for example under a "## User Request" or "## Input" heading — was captured')
    expect(HEADER.endsWith('Only continue to apply ongoing behavioral guidelines from these skills where still relevant.\n\n')).toBe(true)
  })
})

describe('estimateTokens', () => {
  it('rounds length / 4', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcde')).toBe(1)
    expect(estimateTokens('abcdef')).toBe(2)
  })
})

describe('cutSkill', () => {
  it('keeps content within the limit', () => {
    const content = 'x'.repeat(20_001)
    expect(cutSkill(content, 5_000)).toBe(content)
  })

  it('cuts longer content to limit × 4 characters including the marker', () => {
    const cut = cutSkill('x'.repeat(20_002), 5_000)
    expect(cut).toBe('x'.repeat(19_900) + MARKER)
    expect(cut.length).toBe(20_000)
  })
})

describe('renderBlock', () => {
  it('is empty without skills', () => {
    expect(renderBlock([])).toBe('')
  })

  it('renders like the invoked_skills attachment', () => {
    const block = renderBlock([
      { name: 'a', path: '/skills/a', content: 'A' },
      { name: 'b', path: 'b', content: 'B' },
    ])
    expect(block).toBe(HEADER + '### Skill: a\nPath: /skills/a\n\nA\n\n---\n\n### Skill: b\nPath: b\n\nB')
  })
})
