/** Three-column layout solver, transcribed from the official
 * `packages/client/ui-layout/src/client/columns.ts`. Pure and unit-testable so
 * the webview (chat.js) and tests share one source of truth for column widths. */

export const CENTER_MIN = 640
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_COLLAPSED = 56
export const SIDEBAR_AUTO_COLLAPSE = 1024
export const DETAILS_MIN = 300
export const DETAILS_MAX = 520
export const DETAILS_DEFAULT = 360

export interface ComputedColumns {
  readonly sidebar: number
  readonly center: number
  readonly details: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Concession-chain solver. The sidebar never concedes below its clamp; the
 * details column shrinks toward its minimum before auto-closing; the center
 * column is always the remainder and may drop below CENTER_MIN only as the
 * last resort.
 */
export function computeColumns(
  viewport: number,
  sidebar: number,
  details: number,
): ComputedColumns {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clamp(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clamp(details, DETAILS_MIN, DETAILS_MAX)
  if (s + d0 + CENTER_MIN <= viewport) {
    return { sidebar: s, center: viewport - s - d0, details: d0 }
  }
  const d1 = Math.max(DETAILS_MIN, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) {
    return { sidebar: s, center: CENTER_MIN, details: d1 }
  }
  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}

/**
 * Whether the sidebar renders as the collapsed rail. Below the auto-collapse
 * threshold the rail is forced unless a narrow-mode manual expand (`narrowExpanded`)
 * is armed; otherwise a stored width of 0 means collapsed.
 */
export function sidebarCollapsed(narrow: boolean, narrowExpanded: boolean, sidebar: number): boolean {
  return narrow ? !narrowExpanded : sidebar === 0
}
