import type { Kept, SkillEntry } from './core/restore.ts'

export type { Kept, SkillEntry }

// A host that already applies a rule itself declares it; its adapter does nothing for that rule.
export interface Capabilities {
  readonly nativeThreshold: boolean
  readonly nativeSkillRestore: boolean
}

export interface ModelLimit {
  readonly providerID: string
  readonly modelID: string
  readonly context: number
  readonly output: number | undefined
}

// Makes the host's own auto-compaction fire at `tokens` for that model.
export interface Limits {
  list(): readonly ModelLimit[]
  compactAt(model: ModelLimit, tokens: number): void
}

export interface SkillStore {
  load(session: string): Promise<readonly SkillEntry[]>
  save(session: string, entries: readonly SkillEntry[]): Promise<void>
}

export interface StoredBlock {
  readonly checkpoint: string
  readonly text: string
}

export interface BlockStore {
  load(session: string): Promise<StoredBlock | undefined>
  save(session: string, block: StoredBlock): Promise<void>
}

export interface Checkpoint {
  readonly id: string
  readonly createdAt: number
  readonly kept: Kept
}
