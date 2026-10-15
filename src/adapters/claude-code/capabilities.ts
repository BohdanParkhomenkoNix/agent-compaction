import type { Capabilities } from '../../ports.ts'

// Claude Code compacts at the policy threshold through the environment `ag` sets
// (CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85) and
// restores invoked skills itself, so this adapter has no runtime code.
export const CLAUDE_CODE_CAPABILITIES: Capabilities = { nativeThreshold: true, nativeSkillRestore: true }
