import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  EXTENSION_COMMANDS,
  projectConversation,
  projectionCommands,
  projectionPermissions,
  projectionTokenUsage,
} from '../src/domain/workbench-state.js'

describe('projectConversation', () => {
  it('projects durable messages, reasoning, tools and the latest todo snapshot', () => {
    const entries = [
      entry(0, 'user/message', {
        id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '修复测试' }],
      }, 'append'),
      entry(1, 'assistant/message', {
        turn: 1, step: 1,
        message: {
          id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-v4-flash' },
          content: [{ type: 'reasoning', text: '先定位' }, { type: 'text', text: '开始修改。' }],
        },
      }, 'append'),
      entry(2, 'tool/call', { turn: 1, step: 1, callId: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' }),
      entry(3, 'todo/write', { todos: [{ content: '运行测试', status: 'in_progress' }] }),
    ] as HistoryEntry[]

    const result = projectConversation(entries)
    expect(result.messages.map((message) => message.kind)).toEqual(['message', 'message', 'tool'])
    expect(result.messages[1]?.blocks).toEqual([
      { kind: 'reasoning', text: '先定位' },
      { kind: 'text', text: '开始修改。' },
    ])
    expect(result.todos).toEqual([{ content: '运行测试', status: 'in_progress' }])
  })

  it('shows streamed chunks only until their finalized assistant message exists', () => {
    const partial = [
      entry(0, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } }),
      entry(1, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '流式' } }),
    ] as HistoryEntry[]
    expect(projectConversation(partial).messages[0]?.blocks).toEqual([{ kind: 'text', text: '流式', streaming: true }])

    const finalized = [...partial, entry(2, 'assistant/message', {
      turn: 1, step: 1,
      message: {
        id: 'a1', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'text', text: '最终' }],
      },
    }, 'append')] as HistoryEntry[]
    expect(projectConversation(finalized).messages).toHaveLength(1)
    expect(projectConversation(finalized).messages[0]?.blocks).toEqual([{ kind: 'text', text: '最终' }])
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

    expect(projectConversation(entries).messages[0]?.blocks).toEqual([
      { kind: 'reasoning', text: '先分析' },
      { kind: 'text', text: '开始回答', streaming: true },
    ])
  })

  it('pairs slash-command lifecycle events into one visible result row', () => {
    const entries = [
      entry(4, 'command/run', {
        commandId: 'cmd-1', name: 'permission', args: ' read-only', source: { kind: 'user' },
      }),
      entry(5, 'command/done', {
        commandId: 'cmd-1', kind: 'success', text: 'preset read-only',
      }),
    ] as HistoryEntry[]

    expect(projectConversation(entries).messages).toEqual([expect.objectContaining({
      id: 'command-cmd-1',
      title: '/permission read-only',
      status: 'success',
      detail: 'preset read-only',
    })])
  })

  it('shows one turn duration on the final visible result', () => {
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
        message: { id: 'r1', role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: 'ok' }] },
      }),
      timedEntry(3, 4_600, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ] as HistoryEntry[]

    const messages = projectConversation(entries).messages
    expect(messages[0]?.workDuration).toBeUndefined()
    expect(messages[1]?.workDuration).toEqual({ startedAt: 1_000, endedAt: 4_600 })
  })
})

describe('projectionCommands', () => {
  it('merges host command descriptors with the extension commands, sorted by name', () => {
    const commands = projectionCommands([
      { name: 'plan', description: 'Enter or leave plan mode', input: { hint: '[off|message]' } },
      { name: 'compact', description: '压缩当前会话上下文' },
      { name: 'permission', description: '切换权限预设', input: { hint: '<preset>' } },
    ])
    expect(commands.map((command) => command.name)).toEqual([
      'compact', 'permission', 'plan',
      ...EXTENSION_COMMANDS.map((command) => command.name),
    ])
    expect(commands[2]).toMatchObject({ name: 'plan', kind: 'host', input: { hint: '[off|message]' } })
    expect(commands[0]?.input).toBeUndefined()
    expect(commands.filter((command) => command.kind === 'extension')).toHaveLength(EXTENSION_COMMANDS.length)
  })

  it('skips malformed entries and still exposes the extension commands', () => {
    const commands = projectionCommands([
      { name: 42, description: 'broken' },
      { name: 'goal', description: '' },
      { name: 'ok', description: '有效命令', input: { hint: '' } },
    ])
    expect(commands.filter((command) => command.kind === 'host').map((command) => command.name)).toEqual(['ok'])
    expect(commands.at(-1)?.kind).toBe('extension')
  })

  it('returns the extension commands only when the host list is empty or absent', () => {
    expect(projectionCommands([])).toEqual(EXTENSION_COMMANDS)
    expect(projectionCommands(undefined)).toEqual(EXTENSION_COMMANDS)
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

function entry(seq: number, type: string, data: unknown, surfaceOp?: 'append'): unknown {
  return { event: { seq, time: seq + 1, type, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) } }
}

function timedEntry(seq: number, time: number, type: string, data: unknown, surfaceOp?: 'append'): unknown {
  return { event: { seq, time, type, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) } }
}
