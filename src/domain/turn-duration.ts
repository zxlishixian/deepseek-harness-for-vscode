import type { HistoryEntry } from '@deepseek-ai/dsh-host-apiproxy/api'

/**
 * Stable timing data for one Harness turn. An absent `endedAt` means that the
 * turn is still running, so the Webview can update the elapsed time locally.
 */
export interface TurnDurationView {
  readonly startedAt: number
  readonly endedAt?: number
}

/**
 * Projects the append-only event history into turn timings. Keeping this
 * independent from chat rendering makes duration handling easy to test and
 * prevents wall-clock updates from rebuilding message content.
 */
export function projectTurnDurations(
  entries: readonly HistoryEntry[],
): ReadonlyMap<number, TurnDurationView> {
  const startedAt = new Map<number, number>()
  const endedAt = new Map<number, number>()

  for (const { event } of entries) {
    if (event.type === 'turn/start') {
      const previous = startedAt.get(event.data.turn)
      if (previous === undefined || event.time < previous) startedAt.set(event.data.turn, event.time)
    } else if (event.type === 'turn/end') {
      const previous = endedAt.get(event.data.turn)
      if (previous === undefined || event.time < previous) endedAt.set(event.data.turn, event.time)
    }
  }

  const durations = new Map<number, TurnDurationView>()
  for (const [turn, start] of startedAt) {
    const end = endedAt.get(turn)
    durations.set(turn, {
      startedAt: start,
      ...(end === undefined ? {} : { endedAt: Math.max(start, end) }),
    })
  }
  return durations
}

/** Returns a non-negative duration for completed and currently running turns. */
export function elapsedTurnDuration(duration: TurnDurationView, now = Date.now()): number {
  return Math.max(0, (duration.endedAt ?? now) - duration.startedAt)
}
