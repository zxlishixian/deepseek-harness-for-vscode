import type { TokenUsageView } from '../domain/workbench-state.js'
import { formatTokenCount } from './token-format.js'

export interface ComposerStatusInput {
  readonly running: boolean
  readonly subagentMode?: 'one-shot' | 'continuable'
  readonly tokenUsage?: TokenUsageView
}

export interface ComposerStatusLabels {
  readonly oneShotReadOnly: string
  readonly runningQueue: string
  readonly continuableSubagent: string
}

/** Builds status text without repeating the model already shown by the picker. */
export function composerStatusText(
  input: ComposerStatusInput | undefined,
  labels: ComposerStatusLabels,
): string {
  if (input === undefined) return ''
  const segments: string[] = []
  if (input.subagentMode === 'one-shot') segments.push(labels.oneShotReadOnly)
  else if (input.running) segments.push(labels.runningQueue)
  else if (input.subagentMode === 'continuable') segments.push(labels.continuableSubagent)

  const usage = tokenUsageText(input.tokenUsage)
  if (usage !== '') segments.push(usage)
  return segments.join(' · ')
}

function tokenUsageText(usage: TokenUsageView | undefined): string {
  if (usage === undefined) return ''
  const input = usage.uncachedInputTokens + usage.cacheReadTokens
  const output = usage.outputTokens
  if (input === 0 && output === 0) return ''
  return `↑${formatTokenCount(input)} / ↓${formatTokenCount(output)}`
}
