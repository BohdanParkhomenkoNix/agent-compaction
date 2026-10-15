/// <reference types="node" />
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Cause, Effect } from 'effect'
import type { Scope } from 'effect'
import type { Plugin } from '@opencode/plugin/effect'
import type { SessionContext } from '@opencode/plugin/effect/session'
import type { ToolHooks } from '@opencode/plugin/effect/tool'
import { POLICY, type Policy } from '../../core/policy.ts'
import { applyThresholds, recordSkills, restoreBlock } from '../../core/run.ts'
import type { BlockStore, Capabilities, SkillStore } from '../../ports.ts'
import { checkpointOf, SKILL_TOOL, skillFromTool, skillsIn } from './history.ts'
import { openCodeLimits, type ModelEditorLike } from './limits.ts'
import { blockStore, skillStore, type RunEffect } from './stores.ts'

export type Ctx = Pick<Plugin.Context, 'options' | 'session' | 'storage' | 'tool' | 'model'>

export const OPENCODE_CAPABILITIES: Capabilities = { nativeThreshold: false, nativeSkillRestore: false }

const LOG_DIR = join(homedir(), '.cache', 'agent-compaction')

export function log(text: string): void {
  console.error(`[agent-compaction] ${text}`)
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(join(LOG_DIR, 'opencode.log'), `${new Date().toISOString()} ${text}\n`)
  } catch {
    // The console line above is enough when the cache directory is not writable.
  }
}

function describe(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown)
}

function count(value: unknown, min: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined
}

// `cap` exists for the live test; `buffer` must equal `compaction.buffer` when that is set,
// because a plugin cannot read OpenCode's config.
export function optionsOf(options: Readonly<Record<string, unknown>>): { policy: Policy; buffer: number | undefined } {
  const cap = count(options.cap, 1)
  return { policy: cap === undefined ? POLICY : { ...POLICY, cap }, buffer: count(options.buffer, 0) }
}

// A failing activation takes OpenCode's whole plugin generation down, so each step fails alone.
function step<R>(name: string, effect: Effect.Effect<void, never, R>): Effect.Effect<void, never, R> {
  return Effect.catchCause(effect, (cause) => Effect.sync(() => log(`${name} — ${Cause.pretty(cause)}`)))
}

function onSkillTool(skills: SkillStore) {
  return (e: ToolHooks['execute.after']): Effect.Effect<void> =>
    Effect.promise(async () => {
      if (e.tool !== SKILL_TOOL || e.status !== 'completed') return
      try {
        const entry = skillFromTool(e.result.metadata, e.result.content, Date.now())
        if (entry !== undefined) await recordSkills(skills, e.sessionID, [entry])
      } catch (thrown) {
        log(`skill tool ${e.sessionID} — ${describe(thrown)}`)
      }
    })
}

function onContext(ctx: Ctx, run: RunEffect, skills: SkillStore, blocks: BlockStore, policy: Policy) {
  return (e: SessionContext): Effect.Effect<void> =>
    Effect.promise(async () => {
      try {
        const history = await run(ctx.session.context({ sessionID: e.sessionID }))
        await recordSkills(skills, e.sessionID, skillsIn(history))
        const checkpoint = checkpointOf(history)
        if (checkpoint === undefined) return
        const text = await restoreBlock(skills, blocks, e.sessionID, checkpoint, policy)
        if (text !== '') e.system.push({ type: 'text', text })
      } catch (thrown) {
        log(`context ${e.sessionID} — ${describe(thrown)}`)
      }
    })
}

export function activate(ctx: Ctx): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* () {
    const run: RunEffect = Effect.runPromiseWith(yield* Effect.context<never>())
    const { policy, buffer } = optionsOf(ctx.options)
    const skills = skillStore(ctx.storage, run)
    const blocks = blockStore(ctx.storage, run)
    yield* step('limits', Effect.asVoid(ctx.model.transform((editor) => {
      try {
        applyThresholds(openCodeLimits(editor as unknown as ModelEditorLike, buffer), policy)
      } catch (thrown) {
        log(`limits — ${describe(thrown)}`)
      }
    })))
    yield* step('skill tool', Effect.asVoid(ctx.tool.hook('execute.after', onSkillTool(skills))))
    yield* step('context', Effect.asVoid(ctx.session.hook('context', onContext(ctx, run, skills, blocks, policy))))
  })
}

const plugin: Plugin.Plugin = { id: 'agent-compaction', effect: (ctx) => activate(ctx) }

export default plugin
