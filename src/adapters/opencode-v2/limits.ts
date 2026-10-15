import type { Limits } from '../../ports.ts'

// OpenCode 2.0.29 (`im`): auto-compaction fires at `(limit.input || limit.context) - buffer`,
// buffer being `compaction.buffer` or 10% of the limit, at least 16000 from a 32000 limit up.
const SMALL_LIMIT = 32_000
const MIN_BUFFER = 16_000

export interface EditableModel {
  id: string
  providerID: string
  limit: { context: number; input?: number; output: number }
}

export interface ModelEditorLike {
  list(): readonly EditableModel[]
  update(providerID: string, modelID: string, update: (model: EditableModel) => void): void
}

export function defaultBuffer(limit: number): number {
  return Math.max(Math.floor(limit * 0.1), limit >= SMALL_LIMIT ? MIN_BUFFER : 0)
}

export function triggerAt(limit: number, buffer: number | undefined): number {
  return limit - (buffer ?? defaultBuffer(limit))
}

const memo = new Map<number, number>()

// The smallest input limit whose trigger reaches `tokens`; with the default buffer the
// trigger grows by 0 or 1 per unit of limit, so it lands on `tokens` exactly.
export function inputLimitFor(tokens: number, buffer: number | undefined): number {
  if (buffer !== undefined) return tokens + buffer
  const known = memo.get(tokens)
  if (known !== undefined) return known
  let limit = tokens
  while (triggerAt(limit, undefined) < tokens) limit += 1
  memo.set(tokens, limit)
  return limit
}

export function openCodeLimits(editor: ModelEditorLike, buffer: number | undefined): Limits {
  return {
    list: () =>
      editor.list().map((m) => ({
        providerID: m.providerID,
        modelID: m.id,
        context: m.limit.input || m.limit.context,
        output: m.limit.output || undefined,
      })),
    compactAt: (model, tokens) =>
      editor.update(model.providerID, model.modelID, (m) => {
        m.limit.input = inputLimitFor(tokens, buffer)
      }),
  }
}
