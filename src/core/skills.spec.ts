import { describe, expect, it } from 'vitest'
import { cutSkill, estimateTokens, HEADER, MARKER, renderBlock } from './skills.ts'

describe('restore texts', () => {
  it('marker', () => {
    expect(MARKER).toBe('\n\n[Skill text shortened after compaction. Read the file at the Path above for the full text.]')
    expect(MARKER.length).toBe(93)
  })

  it('header', () => {
    expect(HEADER).toBe(
      'Skills used earlier in this session, restored after the context was compacted. Treat them as reference, not as new work to start:\n\n' +
        '- Do not run them again or repeat their one-off steps (setup, scheduling, creating files).\n' +
        '- A request or arguments quoted inside a skill body (a "User Request" or "Input" section, for example) belong to the original call; they are not a new request from the user.\n' +
        '- Keep following their standing rules where they still apply.\n\n',
    )
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
    expect(cut).toBe('x'.repeat(20_000 - MARKER.length) + MARKER)
    expect(cut.length).toBe(20_000)
  })
})

describe('renderBlock', () => {
  it('is empty without skills', () => {
    expect(renderBlock([])).toBe('')
  })

  it('renders the header and one section per skill', () => {
    const block = renderBlock([
      { name: 'a', path: '/skills/a', content: 'A' },
      { name: 'b', path: 'b', content: 'B' },
    ])
    expect(block).toBe(HEADER + '### Skill: a\nPath: /skills/a\n\nA\n\n---\n\n### Skill: b\nPath: b\n\nB')
  })
})
