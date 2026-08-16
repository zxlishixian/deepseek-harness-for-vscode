import { describe, expect, it } from 'vitest'
import type { AssistantMessageNode, ConversationNode } from '../src/domain/conversation-node.js'
import { assistantStepReading, deriveTurnMetrics } from '../src/domain/turn-metrics.js'

function assistant(step: number, timing: AssistantMessageNode['timing'], outputTokens: number): ConversationNode {
  return {
    kind: 'assistant',
    seq: step,
    time: 0,
    turn: 1,
    step,
    blocks: [],
    usage: { outputTokens },
    timing,
  } as ConversationNode
}

describe('assistantStepReading', () => {
  it('reads TTFT, decode time and output tokens from recorded timing', () => {
    const node = assistant(1, { stepStartTime: 1000, firstTokenTime: 1500, completedTime: 5000 }, 50)
    expect(assistantStepReading(node as AssistantMessageNode)).toEqual({
      ttftMs: 500,
      decodeMs: 3500,
      outputTokens: 50,
    })
  })

  it('returns null readings when timing is unrecorded', () => {
    const node = { kind: 'assistant', seq: 0, time: 0, turn: 1, step: 1, blocks: [] } as AssistantMessageNode
    expect(assistantStepReading(node)).toEqual({ ttftMs: null, decodeMs: null, outputTokens: null })
  })
})

describe('deriveTurnMetrics', () => {
  it('folds the lowest-step TTFT and summed decode throughput per turn', () => {
    const nodes = [
      assistant(1, { stepStartTime: 1000, firstTokenTime: 1500, completedTime: 5000 }, 50),
      assistant(2, { stepStartTime: 2000, firstTokenTime: 2100, completedTime: 4000 }, 50),
    ]
    const metrics = deriveTurnMetrics(nodes).get(1)
    expect(metrics?.ttftMs).toBe(500)
    expect(metrics?.tokensPerSecond).toBeCloseTo(100 / 5.4, 2)
  })

  it('omits turns that carry no derivable metrics', () => {
    expect(deriveTurnMetrics([assistant(1, undefined, 0)]).size).toBe(0)
  })
})
