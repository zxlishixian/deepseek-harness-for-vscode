import { describe, expect, it } from 'vitest'
import { renderConfigPatch } from '../src/runtime/runtime-patch.js'

describe('Harness Web profile patch', () => {
  it('projects model, reasoning and agent preset defaults', () => {
    const patch = renderConfigPatch({
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
      agentPreset: 'code',
      provider: 'deepseek-official',
      permissionMode: 'workspace-write',
      baseUrl: undefined,
    })
    expect(patch).toContain('reasoningEffort: max')
    expect(patch).toContain('model: deepseek-v4-pro')
    expect(patch).toContain('default: code')
    expect(patch).toContain('defaultPreset: workspace-write')
    expect(patch).toContain(`presets:
      read-only:
        sandbox: read-only
        approval: ask`)
    expect(patch).toContain(`workspace-write:
        sandbox: workspace-write
        approval: ask`)
    expect(patch).toContain(`danger-full-access:
        sandbox: danger-full-access
        approval: never`)
  })

  it('disables thinking and safely quotes custom provider ids', () => {
    const patch = renderConfigPatch({
      model: 'deepseek-v4-flash',
      reasoningEffort: 'off',
      agentPreset: 'standard',
      provider: 'custom: route',
      permissionMode: 'read-only',
      baseUrl: 'https://example.test',
    })
    expect(patch).toContain('thinking: disabled')
    expect(patch).toContain('provider: "custom: route"')
    expect(patch).toContain('defaultPreset: read-only')
  })
})
