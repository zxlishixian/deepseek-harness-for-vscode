import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN,
  DETAILS_DEFAULT,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  computeColumns,
  sidebarCollapsed,
} from '../src/webview/layout.js'

describe('computeColumns', () => {
  it('fits all three columns on a wide viewport', () => {
    expect(computeColumns(2000, SIDEBAR_DEFAULT, DETAILS_DEFAULT)).toEqual({
      sidebar: 280,
      center: 2000 - 280 - 360,
      details: 360,
    })
  })

  it('renders details as 0 when closed', () => {
    expect(computeColumns(2000, SIDEBAR_DEFAULT, 0)).toEqual({
      sidebar: 280,
      center: 2000 - 280,
      details: 0,
    })
  })

  it('maps a collapsed sidebar (0) to the 56px rail', () => {
    expect(computeColumns(2000, 0, 0)).toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1944, details: 0 })
  })

  it('clamps sidebar and details to their bounds', () => {
    expect(computeColumns(5000, 9999, 9999)).toEqual({ sidebar: 420, center: 4060, details: 520 })
    // Negative widths clamp up to the minimum (only an exact 0 means closed).
    expect(computeColumns(5000, -1, -1)).toEqual({ sidebar: 264, center: 4436, details: 300 })
  })

  it('shrinks details toward its minimum before auto-closing', () => {
    // viewport = 1240: 280 + 360 + 640 overflows, but 280 + 320 + 640 fits at center 640.
    expect(computeColumns(1240, 280, 360)).toEqual({ sidebar: 280, center: 640, details: 320 })
  })

  it('auto-closes details when even the minimum cannot fit', () => {
    // viewport = 900; 280 + 640 already exceeds it → details forced to 0, center may dip below 640
    expect(computeColumns(900, 280, 360)).toEqual({ sidebar: 280, center: 620, details: 0 })
  })

  it('keeps the sidebar width even when the viewport is tiny', () => {
    expect(computeColumns(100, 280, 360)).toEqual({ sidebar: 280, center: 0, details: 0 })
  })
})

describe('sidebarCollapsed', () => {
  it('collapses when sidebar is 0 on a wide viewport', () => {
    expect(sidebarCollapsed(false, false, 0)).toBe(true)
    expect(sidebarCollapsed(false, false, 280)).toBe(false)
  })

  it('collapses below the auto-collapse threshold unless manually expanded', () => {
    expect(sidebarCollapsed(true, false, 280)).toBe(true)
    expect(sidebarCollapsed(true, true, 280)).toBe(false)
  })

  it('ignores narrowExpanded above the threshold', () => {
    expect(sidebarCollapsed(false, true, 0)).toBe(true)
  })
})
