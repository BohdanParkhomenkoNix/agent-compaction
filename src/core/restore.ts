import { POLICY, type Policy } from './policy.ts'
import { cutSkill, estimateTokens, type RestoredSkill } from './skills.ts'

// One entry per skill name, like Claude Code's registry: a new invocation replaces it.
export interface SkillEntry {
  readonly name: string
  readonly path: string
  readonly content: string
  readonly invokedAt: number
}

// What the host still shows the model after the compaction.
export interface Kept {
  inRestoreBlock(content: string): boolean
  asMessage(content: string): boolean
}

export interface Restore {
  readonly skills: readonly RestoredSkill[]
  // name → content to store: the cut text, or '' for a skill dropped over budget.
  readonly updates: ReadonlyMap<string, string>
}

// Claude Code 2.1.300 `hUr`: newest first, each cut to `skillTokens`, added while the total
// stays within `skillBudget`; one that does not fit is skipped and older ones are still tried.
export function restoreSkills(entries: readonly SkillEntry[], kept: Kept, policy: Policy = POLICY): Restore {
  const skills: RestoredSkill[] = []
  const updates = new Map<string, string>()
  let total = 0
  for (const entry of [...entries].sort((a, b) => b.invokedAt - a.invokedAt)) {
    if (!entry.content) continue
    const asMessage = kept.asMessage(entry.content)
    if (!asMessage && kept.inRestoreBlock(entry.content)) continue
    const content = cutSkill(entry.content, policy.skillTokens)
    const tokens = estimateTokens(content)
    if (total + tokens > policy.skillBudget) {
      if (!asMessage) updates.set(entry.name, '')
      continue
    }
    total += tokens
    if (!asMessage && content !== entry.content) updates.set(entry.name, content)
    skills.push({ name: entry.name, path: entry.path, content })
  }
  return { skills, updates }
}

export function recordEntry(entries: readonly SkillEntry[], entry: SkillEntry): readonly SkillEntry[] {
  const index = entries.findIndex((e) => e.name === entry.name)
  if (index === -1) return [...entries, entry]
  if ((entries[index]?.invokedAt ?? Infinity) >= entry.invokedAt) return entries
  return entries.map((e, i) => (i === index ? entry : e))
}

export function applyUpdates(entries: readonly SkillEntry[], updates: ReadonlyMap<string, string>): readonly SkillEntry[] {
  return entries.map((e) => (updates.has(e.name) ? { ...e, content: updates.get(e.name) ?? '' } : e))
}
