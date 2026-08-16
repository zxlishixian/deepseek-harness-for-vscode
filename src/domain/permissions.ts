/** Permission presets shipped by the bundled DeepSeek Harness composition. */
export const PERMISSION_PRESET_IDS = [
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const

export type PermissionPresetId = typeof PERMISSION_PRESET_IDS[number]

/** Narrows untrusted Webview or settings input to a Harness permission preset. */
export function isPermissionPresetId(value: unknown): value is PermissionPresetId {
  return typeof value === 'string'
    && (PERMISSION_PRESET_IDS as readonly string[]).includes(value)
}

/** Uses workspace-write as the safe, useful extension default. */
export function permissionPresetId(value: unknown): PermissionPresetId {
  return isPermissionPresetId(value) ? value : 'workspace-write'
}
