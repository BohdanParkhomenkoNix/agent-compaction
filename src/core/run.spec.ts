import { describe, expect, it } from 'vitest'
import { CLAUDE_CODE_CAPABILITIES } from '../adapters/claude-code/capabilities.ts'
import type { BlockStore, Checkpoint, Limits, ModelLimit, SkillEntry, SkillStore, StoredBlock } from '../ports.ts'
import { applyThresholds, recordSkills, restoreBlock } from './run.ts'
import { HEADER } from './skills.ts'

function memory() {
  const skills = new Map<string, readonly SkillEntry[]>()
  const blocks = new Map<string, StoredBlock>()
  const counts = { skillLoads: 0, skillSaves: 0 }
  const skillStore: SkillStore = {
    load: async (s) => (counts.skillLoads++, skills.get(s) ?? []),
    save: async (s, e) => void (counts.skillSaves++, skills.set(s, e)),
  }
  const blockStore: BlockStore = { load: async (s) => blocks.get(s), save: async (s, b) => void blocks.set(s, b) }
  return { skills, blocks, counts, skillStore, blockStore }
}

const entry = (name: string, invokedAt: number, content = name): SkillEntry => ({ name, path: name, content, invokedAt })
const checkpoint = (id: string, createdAt: number): Checkpoint => ({ id, createdAt, kept: { inRestoreBlock: () => false, asMessage: () => false } })

describe('applyThresholds', () => {
  it('skips models with no positive threshold', () => {
    const calls: [string, number][] = []
    const models: ModelLimit[] = [
      { providerID: 'p', modelID: 'big', context: 1_000_000, output: 64_000 },
      { providerID: 'p', modelID: 'none', context: 0, output: undefined },
      { providerID: 'p', modelID: 'tiny', context: 15_000, output: 4_000 },
    ]
    const limits: Limits = { list: () => models, compactAt: (m, t) => void calls.push([m.modelID, t]) }
    applyThresholds(limits)
    expect(calls).toEqual([['big', 238_000]])
  })
})

describe('recordSkills', () => {
  it('saves new entries and skips the save when nothing changes', async () => {
    const m = memory()
    await recordSkills(m.skillStore, 's', [entry('a', 1)])
    await recordSkills(m.skillStore, 's', [entry('a', 1)])
    await recordSkills(m.skillStore, 's', [])
    expect(m.skills.get('s')).toEqual([entry('a', 1)])
    expect(m.counts.skillSaves).toBe(1)
  })
})

describe('restoreBlock', () => {
  it('renders skills invoked before the checkpoint and stores the block', async () => {
    const m = memory()
    m.skills.set('s', [entry('a', 1), entry('late', 20)])
    const text = await restoreBlock(m.skillStore, m.blockStore, 's', checkpoint('c1', 10))
    expect(text).toBe(HEADER + '### Skill: a\nPath: a\n\na')
    expect(m.blocks.get('s')).toEqual({ checkpoint: 'c1', text })
  })

  it('same checkpoint returns the stored block without reloading', async () => {
    const m = memory()
    m.skills.set('s', [entry('a', 1)])
    const first = await restoreBlock(m.skillStore, m.blockStore, 's', checkpoint('c1', 10))
    const loads = m.counts.skillLoads
    expect(await restoreBlock(m.skillStore, m.blockStore, 's', checkpoint('c1', 10))).toBe(first)
    expect(m.counts.skillLoads).toBe(loads)
  })

  it('a dropped skill stays dropped at the next checkpoint', async () => {
    const m = memory()
    const big = (name: string, at: number) => entry(name, at, 'x'.repeat(20_000))
    m.skills.set('s', [big('a', 6), big('b', 5), big('c', 4), big('d', 3), big('e', 2), big('f', 1)])
    await restoreBlock(m.skillStore, m.blockStore, 's', checkpoint('c1', 10))
    expect(m.skills.get('s')?.find((e) => e.name === 'f')?.content).toBe('')
    const second = await restoreBlock(m.skillStore, m.blockStore, 's', checkpoint('c2', 20))
    expect(second).not.toContain('### Skill: f')
  })
})

describe('Claude Code adapter', () => {
  it('does both rules natively', () => {
    expect(CLAUDE_CODE_CAPABILITIES).toEqual({ nativeThreshold: true, nativeSkillRestore: true })
  })
})
