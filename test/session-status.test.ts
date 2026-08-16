import { describe, expect, it } from 'vitest'
import { deriveSessionStatus } from '../src/domain/session-status.js'

describe('deriveSessionStatus', () => {
  it('prioritizes a pending interaction above live activity', () => {
    expect(deriveSessionStatus({ pendingInteraction: 'approval', running: true })).toBe('warning')
    expect(deriveSessionStatus({ pendingInteraction: 'plan-review', running: false })).toBe('warning')
  })

  it('shows ongoing for running turns and running sub-agents', () => {
    expect(deriveSessionStatus({ running: true })).toBe('ongoing')
    expect(deriveSessionStatus({ running: false, runningSubagentCount: 1 })).toBe('ongoing')
  })

  it('falls back to done when nothing is live', () => {
    expect(deriveSessionStatus({ running: false })).toBe('done')
    expect(deriveSessionStatus({ running: false, runningSubagentCount: 0 })).toBe('done')
  })
})
