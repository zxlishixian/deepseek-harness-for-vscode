import { describe, expect, it } from 'vitest'
import { formatWorkDuration } from '../src/webview/work-duration/format.js'

describe('formatWorkDuration', () => {
  it('formats seconds, minutes, and hours compactly', () => {
    expect(formatWorkDuration(0)).toBe('0s')
    expect(formatWorkDuration(59_999)).toBe('59s')
    expect(formatWorkDuration(60_000)).toBe('1m')
    expect(formatWorkDuration(125_900)).toBe('2m 5s')
    expect(formatWorkDuration(3_600_000)).toBe('1h')
    expect(formatWorkDuration(7_500_000)).toBe('2h 5m')
  })
})
