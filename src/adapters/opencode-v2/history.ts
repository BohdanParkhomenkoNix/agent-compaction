import type { Checkpoint, SkillEntry } from '../../ports.ts'

// OpenCode 2.0.29 session history (`SessionMessage.Info`). Read as unknown: a shape this
// code does not expect yields nothing rather than a crash.
export const SKILL_TOOL = 'skill'

type Fields = Record<string, unknown>

function fields(value: unknown): Fields | undefined {
  return typeof value === 'object' && value !== null ? (value as Fields) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

// Decoded history carries `DateTime.Utc` (`DateTimeUtcFromMillis`); encoded rows carry millis.
function createdAt(message: Fields): number | undefined {
  const created = fields(message.time)?.created
  if (typeof created === 'number') return created
  if (created instanceof Date) return created.getTime()
  const epoch = fields(created)?.epochMilliseconds
  if (typeof epoch === 'number') return epoch
  if (typeof created === 'string') {
    const parsed = Date.parse(created)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

export function toolText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => (fields(part)?.type === 'text' ? (text(fields(part)?.text) ?? '') : '')).join('')
}

export function skillFromTool(metadata: unknown, content: unknown, invokedAt: number): SkillEntry | undefined {
  const name = text(fields(metadata)?.name)
  const body = toolText(content)
  if (name === undefined || body === '') return undefined
  return { name, path: text(fields(metadata)?.directory) ?? name, content: body, invokedAt }
}

function named(name: unknown, body: unknown, invokedAt: number): SkillEntry | undefined {
  const n = text(name)
  const b = text(body)
  return n === undefined || b === undefined ? undefined : { name: n, path: n, content: b, invokedAt }
}

export function skillsIn(history: readonly unknown[]): SkillEntry[] {
  const found: SkillEntry[] = []
  const add = (entry: SkillEntry | undefined) => entry && found.push(entry)
  for (const item of history) {
    const message = fields(item)
    if (message === undefined) continue
    const at = createdAt(message)
    if (at === undefined) continue
    if (message.type === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content) {
        const p = fields(part)
        const state = fields(p?.state)
        if (p?.type !== 'tool' || p.name !== SKILL_TOOL || state?.status !== 'completed') continue
        add(skillFromTool(state.metadata, state.content, at))
      }
    } else if (message.type === 'skill') {
      add(named(message.name, message.text, at))
    } else if (message.type === 'user' && Array.isArray(message.skills)) {
      for (const skill of message.skills) add(named(fields(skill)?.name, fields(skill)?.text, at))
    }
  }
  return found
}

// OpenCode loads history from the latest completed compaction on, so it is the first item.
export function checkpointOf(history: readonly unknown[]): Checkpoint | undefined {
  const first = fields(history[0])
  if (first?.type !== 'compaction' || first.status !== 'completed') return undefined
  const id = text(first.id)
  const at = createdAt(first)
  if (id === undefined || at === undefined) return undefined
  const recent = typeof first.recent === 'string' ? first.recent : ''
  // The plugin's block lives in `system`, never in messages, so no earlier block is kept.
  return { id, createdAt: at, kept: { inRestoreBlock: () => false, asMessage: (content) => recent.includes(content) } }
}
