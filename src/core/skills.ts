// Our own wording of the rules Claude Code 2.1.300 applies when it restores skills after
// compaction: earlier skills are reference, quoted requests are not live, and a cut skill
// says where its full text is.
const CHARS_PER_TOKEN = 4

export const MARKER = '\n\n[Skill text shortened after compaction. Read the file at the Path above for the full text.]'

export const HEADER =
  'Skills used earlier in this session, restored after the context was compacted. Treat them as reference, not as new work to start:\n\n' +
  '- Do not run them again or repeat their one-off steps (setup, scheduling, creating files).\n' +
  '- A request or arguments quoted inside a skill body (a "User Request" or "Input" section, for example) belong to the original call; they are not a new request from the user.\n' +
  '- Keep following their standing rules where they still apply.\n\n'

export interface RestoredSkill {
  readonly name: string
  readonly path: string
  readonly content: string
}

export function estimateTokens(text: string): number {
  return Math.round(text.length / CHARS_PER_TOKEN)
}

export function cutSkill(content: string, limit: number): string {
  if (estimateTokens(content) <= limit) return content
  return content.slice(0, limit * CHARS_PER_TOKEN - MARKER.length) + MARKER
}

export function renderBlock(skills: readonly RestoredSkill[]): string {
  if (skills.length === 0) return ''
  return HEADER + skills.map((s) => `### Skill: ${s.name}\nPath: ${s.path}\n\n${s.content}`).join('\n\n---\n\n')
}
