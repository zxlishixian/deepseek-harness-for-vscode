import { describe, expect, it } from 'vitest'
import {
  AGENT_PRESET_OPTIONS,
  MODEL_OPTIONS,
  REASONING_OPTIONS,
  agentPresetId,
  modelId,
  reasoningEffort,
} from '../src/domain/options.js'

describe('official Harness option catalogs', () => {
  it('contains the two official DeepSeek V4 routes', () => {
    expect(MODEL_OPTIONS.map((item) => item.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
  })

  it('contains the official reasoning and preset ids', () => {
    expect(REASONING_OPTIONS.map((item) => item.id)).toEqual(['off', 'high', 'max'])
    expect(AGENT_PRESET_OPTIONS.map((item) => item.id)).toEqual(['standard', 'code', 'minimal', 'cordis'])
  })

  it('falls back safely when settings contain stale values', () => {
    expect(modelId('unknown')).toBe('deepseek-v4-flash')
    expect(reasoningEffort('unknown')).toBe('high')
    expect(agentPresetId('unknown')).toBe('standard')
  })
})
