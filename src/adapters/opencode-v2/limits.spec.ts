import { describe, expect, it } from 'vitest'
import { applyThresholds } from '../../core/run.ts'
import { defaultBuffer, inputLimitFor, openCodeLimits, triggerAt, type EditableModel, type ModelEditorLike } from './limits.ts'

function editor(models: EditableModel[]): ModelEditorLike {
  return {
    list: () => models,
    update: (providerID, modelID, update) => {
      const model = models.find((m) => m.providerID === providerID && m.id === modelID)
      if (model) update(model)
    },
  }
}

describe('OpenCode 2.0.29 trigger', () => {
  it('default buffer', () => {
    expect(defaultBuffer(300_000)).toBe(30_000)
    expect(defaultBuffer(100_000)).toBe(16_000)
    expect(defaultBuffer(20_000)).toBe(2_000)
  })

  it.each([238_000, 91_800, 17_000])('input limit fires exactly at %i', (tokens) => {
    const limit = inputLimitFor(tokens, undefined)
    expect(triggerAt(limit, undefined)).toBe(tokens)
    expect(triggerAt(limit - 1, undefined)).toBeLessThan(tokens)
  })

  it('a configured buffer is added as is', () => {
    expect(inputLimitFor(238_000, 5_000)).toBe(243_000)
  })
})

describe('openCodeLimits', () => {
  it('sets limit.input so OpenCode compacts at the policy threshold', () => {
    const models: EditableModel[] = [{ id: 'm', providerID: 'p', limit: { context: 1_000_000, output: 64_000 } }]
    applyThresholds(openCodeLimits(editor(models), undefined))
    expect(triggerAt(models[0]!.limit.input!, undefined)).toBe(238_000)
  })

  it('uses limit.input as the window', () => {
    const models: EditableModel[] = [{ id: 'm', providerID: 'p', limit: { context: 400_000, input: 272_000, output: 128_000 } }]
    applyThresholds(openCodeLimits(editor(models), undefined))
    expect(triggerAt(models[0]!.limit.input!, undefined)).toBe(214_200)
  })

  it('treats output 0 as unknown', () => {
    const models: EditableModel[] = [{ id: 'm', providerID: 'p', limit: { context: 200_000, output: 0 } }]
    applyThresholds(openCodeLimits(editor(models), 0))
    expect(models[0]!.limit.input).toBe(153_000)
  })
})
