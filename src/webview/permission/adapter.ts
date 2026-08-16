import type { PermissionView } from '../../domain/workbench-state.js'

export interface PermissionSelectOption {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly disabled: boolean
}

/**
 * Adapts the Harness `permissions` projection to the Webview's shared select
 * contract. Harness calls the option key `value`; other selectors call it
 * `id`, so this boundary deliberately keeps those transport shapes separate.
 */
export function permissionSelectOptions(view: PermissionView): readonly PermissionSelectOption[] {
  return view.options.map((option) => ({
    id: option.value,
    label: option.name,
    ...(option.description === undefined ? {} : { description: option.description }),
    // Harness may expose `custom` as a derived current state, but its protocol
    // explicitly forbids selecting it as a target preset.
    disabled: option.value === 'custom',
  }))
}
