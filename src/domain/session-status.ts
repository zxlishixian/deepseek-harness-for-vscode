// Session status derivation, mirroring the official `sessionStatuses` fold
// (packages/client/ui-workspace/src/client/rows/Rows.tsx) without the label
// plumbing: the Webview owns labels, so this layer returns only the state.

/** Presentation state shown as the session status dot. */
export type SessionStatus = 'done' | 'warning' | 'ongoing' | 'error'

/** A live interaction waiting on the human, primary above all activity. */
export type PendingInteractionStatus = 'approval' | 'plan-review' | 'question'

/** The inputs a session row can contribute to its status. */
export interface SessionStatusInput {
  pendingInteraction?: PendingInteractionStatus
  running: boolean
  runningSubagentCount?: number
  completed?: boolean
}

/**
 * Derive the primary session status. Pending interaction is primary (warning);
 * live activity outranks completion reminders (ongoing); otherwise done.
 * @param input - the session's live flags.
 * @returns the single primary status shown as the dot.
 */
export function deriveSessionStatus(input: SessionStatusInput): SessionStatus {
  if (input.pendingInteraction !== undefined) return 'warning'
  if (input.running) return 'ongoing'
  if ((input.runningSubagentCount ?? 0) > 0) return 'ongoing'
  return 'done'
}
