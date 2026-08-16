import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@deepseek-ai/dsh-host-apiproxy/api'
import { elapsedTurnDuration, projectTurnDurations } from '../src/domain/turn-duration.js'

describe('projectTurnDurations', () => {
  it('pairs turn boundaries and leaves an active turn open', () => {
    const durations = projectTurnDurations([
      entry(1, 1_000, 'turn/start', { turn: 1 }),
      entry(2, 4_250, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      entry(3, 5_000, 'turn/start', { turn: 2 }),
    ] as HistoryEntry[])

    expect(durations.get(1)).toEqual({ startedAt: 1_000, endedAt: 4_250 })
    expect(durations.get(2)).toEqual({ startedAt: 5_000 })
    expect(elapsedTurnDuration(durations.get(1)!)).toBe(3_250)
    expect(elapsedTurnDuration(durations.get(2)!, 7_400)).toBe(2_400)
  })

  it('ignores unmatched ends and clamps malformed negative elapsed time', () => {
    const durations = projectTurnDurations([
      entry(1, 500, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      entry(2, 1_000, 'turn/start', { turn: 2 }),
      entry(3, 900, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ] as HistoryEntry[])

    expect(durations.has(1)).toBe(false)
    expect(durations.get(2)).toEqual({ startedAt: 1_000, endedAt: 1_000 })
  })
})

function entry(seq: number, time: number, type: string, data: unknown): unknown {
  return { event: { seq, time, type, data } }
}
