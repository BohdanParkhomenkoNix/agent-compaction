import type { Effect, Schema } from 'effect'
import type { BlockStore, SkillEntry, SkillStore, StoredBlock } from '../../ports.ts'

// Runs one of OpenCode's effects on the services the plugin was activated with.
export type RunEffect = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>

export interface StorageLike {
  get(key: string): Effect.Effect<unknown>
  set(key: string, value: Schema.Json): Effect.Effect<void>
}

const PREFIX = 'agent-compaction'

function isEntry(value: unknown): value is SkillEntry {
  const v = value as Partial<SkillEntry> | null
  return typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.path === 'string' && typeof v.content === 'string' && typeof v.invokedAt === 'number'
}

function isBlock(value: unknown): value is StoredBlock {
  const v = value as Partial<StoredBlock> | null
  return typeof v === 'object' && v !== null && typeof v.checkpoint === 'string' && typeof v.text === 'string'
}

export function skillStore(storage: StorageLike, run: RunEffect): SkillStore {
  const key = (session: string) => `${PREFIX}:skills:${session}`
  return {
    load: async (session) => {
      const value = await run(storage.get(key(session)))
      return Array.isArray(value) ? value.filter(isEntry) : []
    },
    save: (session, entries) => run(storage.set(key(session), entries as unknown as Schema.Json)),
  }
}

export function blockStore(storage: StorageLike, run: RunEffect): BlockStore {
  const key = (session: string) => `${PREFIX}:block:${session}`
  return {
    load: async (session) => {
      const value = await run(storage.get(key(session)))
      return isBlock(value) ? value : undefined
    },
    save: (session, block) => run(storage.set(key(session), block as unknown as Schema.Json)),
  }
}
