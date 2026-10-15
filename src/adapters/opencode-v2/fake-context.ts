import { Effect } from 'effect'
import type { EditableModel } from './limits.ts'
import type { Ctx } from './plugin.ts'

const REGISTRATION = { dispose: Effect.void }

export interface FakeOptions {
  options?: Record<string, unknown>
  models?: EditableModel[]
  history?: Record<string, unknown[]>
  contextFails?: boolean
}

export interface Fake {
  ctx: Ctx
  hooks: Map<string, (input: never) => Effect.Effect<void>>
  store: Map<string, unknown>
  models: EditableModel[]
  history: Record<string, unknown[]>
}

export function fakeContext(opts: FakeOptions = {}): Fake {
  const fake: Fake = { ctx: {} as Ctx, hooks: new Map(), store: new Map(), models: opts.models ?? [], history: opts.history ?? {} }
  const hook = (domain: string) => (name: string, callback: (input: never) => Effect.Effect<void>) =>
    Effect.sync(() => (fake.hooks.set(`${domain}.${name}`, callback), REGISTRATION))
  const editor = {
    list: () => fake.models,
    update: (providerID: string, modelID: string, update: (model: EditableModel) => void) => {
      const model = fake.models.find((m) => m.providerID === providerID && m.id === modelID)
      if (model) update(model)
    },
  }
  fake.ctx = {
    options: opts.options ?? {},
    storage: {
      get: (key: string) => Effect.sync(() => fake.store.get(key)),
      set: (key: string, value: unknown) => Effect.sync(() => void fake.store.set(key, value)),
      remove: (key: string) => Effect.sync(() => void fake.store.delete(key)),
    },
    session: {
      context: ({ sessionID }: { sessionID: string }) =>
        opts.contextFails ? Effect.fail(new Error('context failed')) : Effect.succeed(fake.history[sessionID] ?? []),
      hook: hook('session'),
    },
    tool: { hook: hook('tool') },
    model: { transform: (callback: (e: typeof editor) => void) => Effect.sync(() => (callback(editor), REGISTRATION)) },
  } as unknown as Ctx
  return fake
}

export async function callHook(fake: Fake, name: string, input: unknown): Promise<void> {
  const callback = fake.hooks.get(name)
  if (callback === undefined) throw new Error(`no hook ${name}`)
  await Effect.runPromise(callback(input as never))
}
