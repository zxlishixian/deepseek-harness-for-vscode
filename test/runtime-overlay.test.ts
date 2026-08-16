import { describe, expect, it } from 'vitest'
import { renderOverlay } from '../src/runtime/runtime-overlay.js'

describe('Harness Web profile overlay', () => {
  it('projects model, reasoning and agent preset defaults', () => {
    const overlay = renderOverlay({
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
      agentPreset: 'code',
      provider: 'deepseek-official',
      permissionMode: 'workspace-write',
      baseUrl: undefined,
      autoAttachSelection: true,
    })
    expect(overlay).toContain('reasoningEffort: max')
    expect(overlay).toContain('model: deepseek-v4-pro')
    expect(overlay).toContain('default: code')
    expect(overlay).toContain('defaultPreset: workspace-write')
    expect(overlay).toContain(`presets:
      read-only:
        sandbox: read-only
        approval: ask`)
    expect(overlay).toContain(`workspace-write:
        sandbox: workspace-write
        approval: ask`)
    expect(overlay).toContain(`danger-full-access:
        sandbox: danger-full-access
        approval: never`)
  })

  it('disables thinking and safely quotes custom provider ids', () => {
    const overlay = renderOverlay({
      model: 'deepseek-v4-flash',
      reasoningEffort: 'off',
      agentPreset: 'standard',
      provider: 'custom: route',
      permissionMode: 'read-only',
      baseUrl: 'https://example.test',
      autoAttachSelection: false,
    })
    expect(overlay).toContain('thinking: disabled')
    expect(overlay).toContain('provider: "custom: route"')
    expect(overlay).toContain('defaultPreset: read-only')
  })
})
