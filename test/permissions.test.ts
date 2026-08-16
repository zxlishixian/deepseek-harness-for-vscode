import { describe, expect, it } from 'vitest'
import {
  PERMISSION_PRESET_IDS,
  isPermissionPresetId,
  permissionPresetId,
} from '../src/domain/permissions.js'
import { permissionSelectOptions } from '../src/webview/permission/adapter.js'

describe('permission presets', () => {
  it('accepts exactly the three presets shipped by the bundled Harness', () => {
    expect(PERMISSION_PRESET_IDS).toEqual(['read-only', 'workspace-write', 'danger-full-access'])
    expect(PERMISSION_PRESET_IDS.every(isPermissionPresetId)).toBe(true)
    expect(isPermissionPresetId('custom')).toBe(false)
    expect(permissionPresetId('invalid')).toBe('workspace-write')
  })

  it('adapts Harness value/name options to the shared Webview select contract', () => {
    expect(permissionSelectOptions({
      currentValue: 'read-only',
      options: [
        { value: 'read-only', name: 'Read only', description: 'No file writes.' },
        { value: 'custom', name: 'Custom' },
      ],
    })).toEqual([
      { id: 'read-only', label: 'Read only', description: 'No file writes.', disabled: false },
      { id: 'custom', label: 'Custom', disabled: true },
    ])
  })
})
