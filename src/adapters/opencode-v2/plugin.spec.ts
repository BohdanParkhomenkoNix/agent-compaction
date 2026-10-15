import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import { HEADER } from '../../core/skills.ts'
import { callHook, fakeContext, type FakeOptions } from './fake-context.ts'
import { inputLimitFor } from './limits.ts'
import { activate, optionsOf } from './plugin.ts'

let logDir = ''

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), 'agent-compaction-'))
  process.env.AGENT_COMPACTION_LOG_DIR = logDir
})

async function activated(opts: FakeOptions) {
  const fake = fakeContext(opts)
  await Effect.runPromise(Effect.scoped(activate(fake.ctx)))
  return fake
}

const request = (sessionID: string) => ({ sessionID, system: [] as { type: string; text: string }[], messages: [] })
const skillMessage = (name: string, created: number) => ({ type: 'skill', id: `k${created}`, skill: name, name, text: `${name} body`, time: { created } })
const checkpoint = (id: string, created: number) => ({ type: 'compaction', status: 'completed', id, recent: '', time: { created } })

describe('optionsOf', () => {
  it('reads cap and buffer, ignores bad values', () => {
    expect(optionsOf({ cap: 60_000, buffer: 0 })).toMatchObject({ policy: { cap: 60_000 }, buffer: 0 })
    expect(optionsOf({ cap: -1, buffer: 'x' })).toMatchObject({ policy: { cap: 300_000 }, buffer: undefined })
  })
})

describe('activate', () => {
  it('sets every model limit on activation', async () => {
    const fake = await activated({ models: [{ id: 'm', providerID: 'p', limit: { context: 1_000_000, output: 64_000 } }] })
    expect(fake.models[0]?.limit.input).toBe(inputLimitFor(238_000, undefined))
  })

  it('honours the cap option', async () => {
    const fake = await activated({ options: { cap: 60_000 }, models: [{ id: 'm', providerID: 'p', limit: { context: 1_000_000, output: 64_000 } }] })
    expect(fake.models[0]?.limit.input).toBe(inputLimitFor(27_000, undefined))
  })

  it('records skills before a checkpoint and adds nothing to system', async () => {
    const fake = await activated({ history: { s1: [skillMessage('tdd', 1)] } })
    const event = request('s1')
    await callHook(fake, 'session.context', event)
    expect(event.system).toEqual([])
    expect(fake.store.get('agent-compaction:skills:s1')).toEqual([{ name: 'tdd', path: 'tdd', content: 'tdd body', invokedAt: 1 }])
  })

  it('adds the same block after a checkpoint on every request', async () => {
    const fake = await activated({ history: { s1: [skillMessage('tdd', 1)] } })
    await callHook(fake, 'session.context', request('s1'))
    fake.history.s1 = [checkpoint('c1', 5)]
    const first = request('s1')
    const second = request('s1')
    await callHook(fake, 'session.context', first)
    await callHook(fake, 'session.context', second)
    expect(first.system).toEqual([{ type: 'text', text: HEADER + '### Skill: tdd\nPath: tdd\n\ntdd body' }])
    expect(second.system).toEqual(first.system)
  })

  it('records the skill tool as it completes', async () => {
    const fake = await activated({})
    await callHook(fake, 'tool.execute.after', { tool: 'skill', sessionID: 's1', status: 'completed', result: { content: 'S', metadata: { name: 'tdd', directory: '/skills/tdd' } } })
    await callHook(fake, 'tool.execute.after', { tool: 'bash', sessionID: 's1', status: 'completed', result: { content: 'ls' } })
    const stored = fake.store.get('agent-compaction:skills:s1') as { name: string; path: string }[]
    expect(stored.map((e) => [e.name, e.path])).toEqual([['tdd', '/skills/tdd']])
  })

  it('context failure leaves system unchanged', async () => {
    const fake = await activated({ contextFails: true })
    const event = request('s1')
    await callHook(fake, 'session.context', event)
    expect(event.system).toEqual([])
    expect(readFileSync(join(logDir, 'opencode.log'), 'utf8')).toContain('context s1')
  })
})
