import { describe, expect, it } from 'vitest'
import { applyUpdates, recordEntry, restoreSkills, type Kept, type SkillEntry } from './restore.ts'
import { MARKER } from './skills.ts'

const NONE: Kept = { inRestoreBlock: () => false, asMessage: () => false }
const entry = (name: string, chars: number, invokedAt: number): SkillEntry => ({ name, path: `/s/${name}`, content: name.repeat(chars), invokedAt })

describe('restoreSkills', () => {
  it('orders newest first and skips empty content', () => {
    const result = restoreSkills([entry('a', 10, 1), entry('b', 10, 2), { ...entry('c', 10, 3), content: '' }], NONE)
    expect(result.skills.map((s) => s.name)).toEqual(['b', 'a'])
    expect(result.updates.size).toBe(0)
  })

  it('cuts a long skill and writes the cut back', () => {
    const result = restoreSkills([entry('a', 30_000, 1)], NONE)
    expect(result.skills[0]?.content).toBe('a'.repeat(20_000 - MARKER.length) + MARKER)
    expect(result.updates.get('a')).toBe('a'.repeat(20_000 - MARKER.length) + MARKER)
  })

  it('skips a skill over budget, clears it, and still adds an older smaller one', () => {
    const entries = [
      entry('a', 80_000, 7), entry('b', 80_000, 6), entry('c', 80_000, 5), entry('d', 80_000, 4),
      entry('e', 16_000, 3), entry('f', 8_000, 2), entry('g', 4_000, 1),
    ]
    const result = restoreSkills(entries, NONE)
    expect(result.skills.map((s) => s.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'g'])
    expect(result.updates.get('f')).toBe('')
  })

  it('includes a skill still kept as a message but never writes it back', () => {
    const kept: Kept = { inRestoreBlock: () => true, asMessage: (c) => c.startsWith('a') }
    const result = restoreSkills([entry('a', 30_000, 1)], kept)
    expect(result.skills.map((s) => s.name)).toEqual(['a'])
    expect(result.updates.size).toBe(0)
  })

  it('skips a skill already in a kept restore block', () => {
    const kept: Kept = { inRestoreBlock: () => true, asMessage: () => false }
    expect(restoreSkills([entry('a', 10, 1)], kept).skills).toEqual([])
  })
})

describe('recordEntry', () => {
  it('a newer invocation replaces the entry', () => {
    const cleared = { ...entry('a', 10, 1), content: '' }
    expect(recordEntry([cleared], entry('a', 10, 2))).toEqual([entry('a', 10, 2)])
  })

  it('an older or equal invocation changes nothing', () => {
    const entries = [entry('a', 10, 5)]
    expect(recordEntry(entries, entry('a', 20, 5))).toBe(entries)
    expect(recordEntry(entries, entry('a', 20, 4))).toBe(entries)
  })

  it('a new name is added', () => {
    expect(recordEntry([entry('a', 1, 1)], entry('b', 1, 2)).map((e) => e.name)).toEqual(['a', 'b'])
  })
})

describe('applyUpdates', () => {
  it('replaces content by name and keeps the rest', () => {
    const result = applyUpdates([entry('a', 2, 1), entry('b', 2, 2)], new Map([['a', 'cut']]))
    expect(result).toEqual([{ ...entry('a', 2, 1), content: 'cut' }, entry('b', 2, 2)])
  })
})
