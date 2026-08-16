import { describe, expect, it } from 'vitest'

import { agentPresetTransition, promptConfiguration } from '../src/domain/prompt-configuration.js'

describe('prompt configuration', () => {
  it('accepts a complete model, reasoning, and preset tuple', () => {
    expect(promptConfiguration({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
      agentPreset: 'code',
    })).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
      agentPreset: 'code',
    })
  })

  it('rejects missing, empty, and non-string fields', () => {
    expect(promptConfiguration(undefined)).toBeUndefined()
    expect(promptConfiguration({ model: 'deepseek-v4-pro' })).toBeUndefined()
    expect(promptConfiguration({
      provider: 'deepseek-official',
      model: '',
      reasoningEffort: 'max',
      agentPreset: 'code',
    })).toBeUndefined()
    expect(promptConfiguration({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 3,
      agentPreset: 'code',
    })).toBeUndefined()
  })

  it('keeps, switches, or recreates a session according to the preset lock', () => {
    expect(agentPresetTransition(false, 'standard', 'standard')).toBe('keep-session')
    expect(agentPresetTransition(true, 'standard', 'code')).toBe('select-blank-session')
    expect(agentPresetTransition(false, 'standard', 'code')).toBe('create-session')
  })
})
