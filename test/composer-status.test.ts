import { describe, expect, it } from 'vitest'
import { composerStatusText } from '../src/webview/composer-status.js'

const labels = {
  oneShotReadOnly: 'One-shot · read-only',
  runningQueue: 'Running · queue',
  continuableSubagent: 'Continuable sub-agent',
}

describe('composerStatusText', () => {
  it('shows token usage without a leading separator or repeated model name', () => {
    expect(composerStatusText({
      running: false,
      tokenUsage: {
        uncachedInputTokens: 171_900,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 4_000,
      },
    }, labels)).toBe('↑171.9k / ↓4.0k')
  })

  it('combines activity and token usage while preserving the activity label', () => {
    expect(composerStatusText({
      running: true,
      tokenUsage: {
        uncachedInputTokens: 1_000,
        cacheReadTokens: 500,
        cacheWriteTokens: 0,
        outputTokens: 20,
      },
    }, labels)).toBe('Running · queue · ↑1.5k / ↓20')
  })

  it('keeps one-shot status visible without usage', () => {
    expect(composerStatusText({ running: false, subagentMode: 'one-shot' }, labels)).toBe('One-shot · read-only')
    expect(composerStatusText(undefined, labels)).toBe('')
  })
})
