import { describe, expect, it } from 'vitest'
import type { HistoryEntry, SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  projectConversation,
  projectionCommands,
  projectionPermissions,
  projectionTokenUsage,
  sessionListItem,
} from '../src/domain/workbench-state.js'

describe('projectConversation', () => {
  it('projects durable messages, reasoning, running tools and the latest todo snapshot', () => {
    const entries = [
      entry(0, 'user/message', {
        id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '修复测试' }],
      }, 'append'),
      entry(1, 'assistant/message', {
        turn: 1, step: 1,
        message: {
          id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' },
          content: [{ type: 'reasoning', text: '先定位' }, { type: 'text', text: '开始修改。' }],
        },
      }, 'append'),
      entry(2, 'tool/call', { turn: 1, step: 1, callId: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' }),
      entry(3, 'todo/write', { todos: [{ content: '运行测试', status: 'in_progress' }] }),
    ] as HistoryEntry[]

    const result = projectConversation(entries)
    expect(result.nodes.map((node) => node.kind)).toEqual(['user', 'assistant'])
    expect(result.nodes[1]).toMatchObject({
      blocks: [
        { kind: 'reasoning', text: '先定位' },
        { kind: 'text', text: '开始修改。' },
      ],
    })
    expect(result.runningCalls.map((call) => call.callId)).toEqual(['c1'])
    expect(result.todos).toEqual([{ content: '运行测试', status: 'in_progress' }])
  })

  it('keeps streamed chunks as the partial until their assistant message finalizes', () => {
    const partial = [
      entry(0, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } }),
      entry(1, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '流式' } }),
    ] as HistoryEntry[]

    expect(projectConversation(partial).partial).toEqual({ turn: 1, step: 1, blocks: [{ kind: 'text', text: '流式' }] })
    expect(projectConversation(partial).nodes).toEqual([])

    const finalized = [...partial, entry(2, 'assistant/message', {
      turn: 1, step: 1,
      message: {
        id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'text', text: '最终' }],
      },
    }, 'append')] as HistoryEntry[]

    const result = projectConversation(finalized)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toMatchObject({ blocks: [{ kind: 'text', text: '最终' }] })
    expect(result.partial).toBeNull()
  })

  it('marks reasoning complete at block-end while the following text still streams', () => {
    const entries = [
      entry(0, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } }),
      entry(1, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: '先分析' } }),
      entry(2, 'assistant/chunk', {
        turn: 1, step: 1,
        chunk: { type: 'block-end', index: 0, block: { type: 'reasoning', text: '先分析' } },
      }),
      entry(3, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 1, blockType: 'text' } }),
      entry(4, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 1, text: '开始回答' } }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).partial?.blocks).toEqual([
      { kind: 'reasoning', text: '先分析' },
      { kind: 'text', text: '开始回答' },
    ])
  })

  it('pairs slash-command lifecycle events into one command node', () => {
    const entries = [
      entry(4, 'command/run', {
        commandId: 'cmd-1', name: 'permission', args: ' read-only', source: { kind: 'user' },
      }),
      entry(5, 'command/done', {
        commandId: 'cmd-1', kind: 'success', text: 'preset read-only',
      }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).nodes).toEqual([expect.objectContaining({
      kind: 'command',
      commandId: 'cmd-1',
      name: 'permission',
      args: ' read-only',
      outcome: { kind: 'success', text: 'preset read-only' },
    })])
  })

  it('builds a turn footer from turn boundaries', () => {
    const entries = [
      timedEntry(0, 1_000, 'turn/start', { turn: 1 }),
      timedEntry(1, 1_200, 'assistant/message', {
        turn: 1, step: 1,
        message: {
          id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' },
          content: [{ type: 'text', text: '先检查。' }],
        },
      }, 'append'),
      timedEntry(2, 2_000, 'tool/result', {
        turn: 1, step: 1, error: undefined,
        message: {
          id: 'r1', role: 'user', source: { kind: 'tool', callId: 'c1' },
          content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] }],
        },
      }),
      timedEntry(3, 4_600, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).turnTails).toEqual([{ turn: 1, startedAt: 1_000, endedAt: 4_600 }])
  })

  it('emits a turn-error node for a failed turn with no scheduled retry', () => {
    const entries = [
      entry(0, 'turn/start', { turn: 1 }),
      entry(1, 'turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'PROVIDER', message: 'boom' } } }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).nodes).toEqual([expect.objectContaining({
      kind: 'turn-error',
      turn: 1,
      message: 'boom',
      code: 'PROVIDER',
    })])
  })

  it('emits a max-tokens notice for an output-capped turn', () => {
    const entries = [
      entry(0, 'turn/start', { turn: 1 }),
      entry(1, 'turn/end', { turn: 1, reason: { kind: 'max-tokens' } }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).nodes).toEqual([expect.objectContaining({
      kind: 'turn-max-tokens',
      turn: 1,
    })])
  })

  it('suppresses the turn-error node when a retry is scheduled for the turn', () => {
    const entries = [
      entry(0, 'turn/start', { turn: 1 }),
      entry(1, 'llm/retry', {
        mode: 'normal', maxRetries: 3, retryId: 'r1', turn: 1, step: 1,
        provider: 'p', policyKey: 'k', retry: 0, delayMs: 100,
        failure: { code: 'PROVIDER', message: 'boom' },
      }),
      entry(2, 'turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'PROVIDER', message: 'boom' } } }),
    ] as HistoryEntry[]

    const nodes = projectConversation(entries).nodes
    expect(nodes.map((node) => node.kind)).toEqual(['model-retry'])
    expect(nodes[0]).toMatchObject({ retryState: 'cancelled' })
  })

  it('marks a compaction checkpoint with its summary and shadowed counts', () => {
    const entries = [
      entry(0, 'compaction/summary', {
        compactionId: 'cp1', summary: [{ type: 'text', text: '上下文已压缩' }],
        shadowedRange: {}, shadowedSeqs: [1, 2], shadowedTokenCount: 100, provider: 'p', model: 'm',
      }),
      entry(1, 'user/message', {
        id: 'u1', role: 'user',
        source: { kind: 'plugin', plugin: 'compact', compactionId: 'cp1', sourceCommandId: 'cmd-1' },
        content: [{ type: 'text', text: '…' }],
      }, { op: 'replace', start: 0, end: 1 }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).nodes).toEqual([expect.objectContaining({
      kind: 'compaction',
      summary: '上下文已压缩',
      summaryEventSeq: 0,
      shadowedItemCount: 2,
      shadowedTokenCount: 100,
    })])
  })

  it('degrades unknown append surface events to a raw row', () => {
    const entries = [entry(0, 'some/future-event', { foo: 1 }, 'append')] as HistoryEntry[]
    expect(projectConversation(entries).nodes).toEqual([expect.objectContaining({
      kind: 'unknown',
      type: 'some/future-event',
    })])
  })

  it('attaches nested code-dispatch children to their running parent call', () => {
    const entries = [
      entry(0, 'tool/call', { turn: 1, step: 1, callId: 'root', name: 'bash', arguments: '{}' }),
      entry(1, 'tool/code-dispatch-start', { rootCallId: 'root', parentCallId: 'root', subCallId: 'child', name: 'read_file', arguments: {} }),
      entry(2, 'tool/code-dispatch', {
        rootCallId: 'root', parentCallId: 'root', subCallId: 'child', name: 'read_file',
        arguments: {}, isError: false, content: [{ type: 'text', text: 'ok' }],
      }),
    ] as HistoryEntry[]

    const result = projectConversation(entries)
    expect(result.runningCalls.map((call) => call.callId)).toEqual(['root'])
    expect(result.runningCalls[0]?.subCalls).toMatchObject([{ kind: 'tool-result' }])
  })
})

describe('projectionCommands', () => {
  it('keeps only host command descriptors, sorted by name', () => {
    const commands = projectionCommands([
      { name: 'plan', description: 'Enter or leave plan mode', input: { hint: '[off|message]' } },
      { name: 'compact', description: '压缩当前会话上下文' },
      { name: 'permission', description: '切换权限预设', input: { hint: '<preset>' } },
    ])
    expect(commands.map((command) => command.name)).toEqual(['compact', 'permission', 'plan'])
    expect(commands[2]).toEqual({ name: 'plan', description: 'Enter or leave plan mode', input: { hint: '[off|message]' } })
    expect(commands[0]?.input).toBeUndefined()
  })

  it('skips malformed entries', () => {
    const commands = projectionCommands([
      { name: 42, description: 'broken' },
      { name: 'goal', description: '' },
      { name: 'ok', description: '有效命令', input: { hint: '' } },
    ])
    expect(commands.map((command) => command.name)).toEqual(['ok'])
  })

  it('returns an empty list when the host list is empty or absent', () => {
    expect(projectionCommands([])).toEqual([])
    expect(projectionCommands(undefined)).toEqual([])
  })
})

describe('sessionListItem', () => {
  it('derives the sidebar status dot from the running flag', () => {
    expect(sessionListItem({ sessionId: 's1', updatedAt: 1, running: true, blank: false } as SessionSummary).status)
      .toBe('ongoing')
    expect(sessionListItem({ sessionId: 's2', updatedAt: 1, running: false, blank: true } as SessionSummary).status)
      .toBe('done')
  })
})

describe('projectionPermissions', () => {
  it('preserves the Harness value/name transport shape for the Webview adapter', () => {
    expect(projectionPermissions({
      currentValue: 'workspace-write',
      options: [
        { value: 'read-only', name: 'read-only' },
        { value: 'workspace-write', name: 'Workspace', description: 'Workspace writes.' },
        { value: 42, name: 'broken' },
      ],
    })).toEqual({
      currentValue: 'workspace-write',
      options: [
        { value: 'read-only', name: 'read-only' },
        { value: 'workspace-write', name: 'Workspace', description: 'Workspace writes.' },
      ],
    })
  })

  it('rejects malformed projection roots', () => {
    expect(projectionPermissions(undefined)).toBeUndefined()
    expect(projectionPermissions({ currentValue: 1, options: [] })).toBeUndefined()
    expect(projectionPermissions({ currentValue: 'read-only', options: {} })).toBeUndefined()
  })
})

describe('projectionTokenUsage', () => {
  it('accepts complete non-negative integer counters', () => {
    expect(projectionTokenUsage({
      uncachedInputTokens: 120,
      outputTokens: 80,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
    })).toEqual({
      uncachedInputTokens: 120,
      outputTokens: 80,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
    })
  })

  it('rejects missing, negative, fractional and non-finite counters', () => {
    expect(projectionTokenUsage({ uncachedInputTokens: 1 })).toBeUndefined()
    expect(projectionTokenUsage({
      uncachedInputTokens: -1,
      outputTokens: 1,
      cacheReadTokens: 1,
      cacheWriteTokens: 1,
    })).toBeUndefined()
    expect(projectionTokenUsage({
      uncachedInputTokens: 1.5,
      outputTokens: 1,
      cacheReadTokens: 1,
      cacheWriteTokens: 1,
    })).toBeUndefined()
    expect(projectionTokenUsage({
      uncachedInputTokens: Number.POSITIVE_INFINITY,
      outputTokens: 1,
      cacheReadTokens: 1,
      cacheWriteTokens: 1,
    })).toBeUndefined()
  })
})

function entry(seq: number, type: string, data: unknown, surfaceOp?: unknown): unknown {
  return { event: { seq, time: seq + 1, type, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) } }
}

function timedEntry(seq: number, time: number, type: string, data: unknown, surfaceOp?: 'append'): unknown {
  return { event: { seq, time, type, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) } }
}
