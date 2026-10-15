import type { BlockStore, Checkpoint, Limits, SkillEntry, SkillStore } from '../ports.ts'
import { POLICY, threshold, type Policy } from './policy.ts'
import { applyUpdates, recordEntry, restoreSkills } from './restore.ts'
import { renderBlock } from './skills.ts'

export function applyThresholds(limits: Limits, policy: Policy = POLICY): void {
  for (const model of limits.list()) {
    if (!(model.context > 0)) continue
    const tokens = threshold(model.context, model.output, policy)
    if (tokens > 0) limits.compactAt(model, tokens)
  }
}

export async function recordSkills(store: SkillStore, session: string, found: readonly SkillEntry[]): Promise<void> {
  if (found.length === 0) return
  const before = await store.load(session)
  let after = before
  for (const entry of found) after = recordEntry(after, entry)
  if (after !== before) await store.save(session, after)
}

// One block per checkpoint: computed on the first request after it, then reused byte for
// byte so the prompt cache stays stable.
export async function restoreBlock(skills: SkillStore, blocks: BlockStore, session: string, checkpoint: Checkpoint, policy: Policy = POLICY): Promise<string> {
  const stored = await blocks.load(session)
  if (stored?.checkpoint === checkpoint.id) return stored.text
  const entries = await skills.load(session)
  const result = restoreSkills(entries.filter((e) => e.invokedAt < checkpoint.createdAt), checkpoint.kept, policy)
  if (result.updates.size > 0) await skills.save(session, applyUpdates(entries, result.updates))
  const text = renderBlock(result.skills)
  await blocks.save(session, { checkpoint: checkpoint.id, text })
  return text
}
