import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { checkpointOf, skillFromTool, skillsIn, toolText } from './history.ts'
import { blockStore, skillStore, type StorageLike } from './stores.ts'

const toolMessage = (created: number, name: string, status = 'completed') => ({
  type: 'assistant', id: `a${created}`, time: { created },
  content: [{ type: 'tool', id: 't', name: 'skill', state: { status, input: { id: name }, content: [{ type: 'text', text: `<skill_content name="${name}">body</skill_content>` }], metadata: { name, directory: `/skills/${name}` } } }],
})

describe('toolText', () => {
  it('reads a string or the text parts', () => {
    expect(toolText('x')).toBe('x')
    expect(toolText([{ type: 'text', text: 'a' }, { type: 'file', uri: 'u' }, { type: 'text', text: 'b' }])).toBe('ab')
    expect(toolText(undefined)).toBe('')
  })
})

describe('skillFromTool', () => {
  it('takes name and directory from the metadata', () => {
    expect(skillFromTool({ name: 'tdd', directory: '/skills/tdd' }, 'body', 7)).toEqual({ name: 'tdd', path: '/skills/tdd', content: 'body', invokedAt: 7 })
  })

  it('needs a name and content', () => {
    expect(skillFromTool({}, 'body', 7)).toBeUndefined()
    expect(skillFromTool({ name: 'tdd' }, '', 7)).toBeUndefined()
  })
})

describe('skillsIn', () => {
  it('reads every source', () => {
    const history = [
      toolMessage(1, 'tdd'),
      { type: 'skill', id: 's2', skill: 'brainstorming', name: 'brainstorming', text: 'B', time: { created: 2 } },
      { type: 'user', id: 'u3', time: { created: 3 }, skills: [{ id: 'x', name: 'review', text: 'R' }] },
    ]
    expect(skillsIn(history)).toEqual([
      { name: 'tdd', path: '/skills/tdd', content: '<skill_content name="tdd">body</skill_content>', invokedAt: 1 },
      { name: 'brainstorming', path: 'brainstorming', content: 'B', invokedAt: 2 },
      { name: 'review', path: 'review', content: 'R', invokedAt: 3 },
    ])
  })

  it('reads times decoded as DateTime.Utc', async () => {
    const { DateTime } = await import('effect')
    const at = DateTime.makeUnsafe(1_700_000_000_000)
    const history = [{ type: 'skill', id: 's', skill: 'b', name: 'b', text: 'B', time: { created: at } }]
    expect(skillsIn(history)[0]?.invokedAt).toBe(1_700_000_000_000)
    expect(checkpointOf([{ type: 'compaction', status: 'completed', id: 'c1', recent: '', time: { created: at } }])?.createdAt).toBe(1_700_000_000_000)
  })

  it('ignores other tools, unfinished calls and malformed entries', () => {
    const other = { ...toolMessage(1, 'x'), content: [{ type: 'tool', name: 'bash', state: { status: 'completed', content: 'ls' } }] }
    expect(skillsIn([other, toolMessage(2, 'y', 'running'), null, 3, { type: 'user' }, { type: 'skill', time: { created: 4 } }])).toEqual([])
  })
})

describe('checkpointOf', () => {
  it('reads a completed compaction at the start', () => {
    const cp = checkpointOf([{ type: 'compaction', status: 'completed', id: 'c1', recent: 'kept B here', time: { created: 9 } }])
    expect(cp?.id).toBe('c1')
    expect(cp?.createdAt).toBe(9)
    expect(cp?.kept.asMessage('B')).toBe(true)
    expect(cp?.kept.asMessage('Z')).toBe(false)
    expect(cp?.kept.inRestoreBlock('B')).toBe(false)
  })

  it('is undefined otherwise', () => {
    expect(checkpointOf([])).toBeUndefined()
    expect(checkpointOf([{ type: 'user', time: { created: 1 } }])).toBeUndefined()
    expect(checkpointOf([{ type: 'compaction', status: 'running', id: 'c1', time: { created: 1 } }])).toBeUndefined()
  })
})

describe('stores', () => {
  const storage = (): StorageLike & { map: Map<string, unknown> } => {
    const map = new Map<string, unknown>()
    return { map, get: (k) => Effect.sync(() => map.get(k)), set: (k, v) => Effect.sync(() => void map.set(k, v)) }
  }

  it('round-trip under the plugin keys', async () => {
    const s = storage()
    await skillStore(s, Effect.runPromise).save('s1', [{ name: 'a', path: 'a', content: 'A', invokedAt: 1 }])
    await blockStore(s, Effect.runPromise).save('s1', { checkpoint: 'c', text: 'T' })
    expect([...s.map.keys()]).toEqual(['agent-compaction:skills:s1', 'agent-compaction:block:s1'])
    expect(await skillStore(s, Effect.runPromise).load('s1')).toEqual([{ name: 'a', path: 'a', content: 'A', invokedAt: 1 }])
    expect(await blockStore(s, Effect.runPromise).load('s1')).toEqual({ checkpoint: 'c', text: 'T' })
  })

  it('read missing or garbage as empty', async () => {
    const s = storage()
    s.map.set('agent-compaction:skills:s1', 'garbage')
    s.map.set('agent-compaction:block:s1', { checkpoint: 1 })
    expect(await skillStore(s, Effect.runPromise).load('s1')).toEqual([])
    expect(await blockStore(s, Effect.runPromise).load('s1')).toBeUndefined()
    expect(await skillStore(s, Effect.runPromise).load('s2')).toEqual([])
  })
})
