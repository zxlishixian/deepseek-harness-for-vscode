import { describe, expect, it } from 'vitest'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm/types'
import {
  contextForm,
  contextProvenance,
  displayFailureMessage,
  emptyAssistantBlock,
  isTokenDelta,
  toAssistantBlock,
  toAssistantBlocks,
} from '../src/domain/conversation-node.js'

function chunk(value: unknown): StreamChunk {
  return value as StreamChunk
}

function block(value: unknown): ContentBlock {
  return value as ContentBlock
}

describe('toAssistantBlock', () => {
  it('classifies text, reasoning, image and tool-call blocks', () => {
    expect(toAssistantBlock(block({ type: 'text', text: 'hi' }))).toEqual({ kind: 'text', text: 'hi' })
    expect(toAssistantBlock(block({ type: 'reasoning', text: 'why' }))).toEqual({ kind: 'reasoning', text: 'why' })
    expect(toAssistantBlock(block({ type: 'image', attachment: { id: 'a1' } }))).toEqual({
      kind: 'image',
      attachment: { id: 'a1' },
    })
    expect(toAssistantBlock(block({ type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' }))).toEqual({
      kind: 'tool-call',
      callId: 'c1',
      name: 'read',
      argsRaw: '{}',
    })
  })

  it('degrades unrecognized blocks to the raw passthrough', () => {
    const unknown = { type: 'something-new', value: 1 }
    expect(toAssistantBlock(block(unknown))).toEqual({ kind: 'other', block: unknown })
    expect(toAssistantBlocks([block({ type: 'text', text: 'a' }), block(unknown)]).length).toBe(2)
  })
})

describe('emptyAssistantBlock', () => {
  it('builds the empty projection for streamed block kinds', () => {
    expect(emptyAssistantBlock('text')).toEqual({ kind: 'text', text: '' })
    expect(emptyAssistantBlock('reasoning')).toEqual({ kind: 'reasoning', text: '' })
    expect(emptyAssistantBlock('tool-call')).toEqual({ kind: 'tool-call', callId: '', name: '', argsRaw: '' })
    expect(emptyAssistantBlock('future')).toEqual({ kind: 'other', block: null })
  })
})

describe('isTokenDelta', () => {
  it('counts only visible model output as the first-token boundary', () => {
    expect(isTokenDelta(chunk({ type: 'text-delta', index: 0, text: 'x' }))).toBe(true)
    expect(isTokenDelta(chunk({ type: 'text-delta', index: 0, text: '' }))).toBe(false)
    expect(isTokenDelta(chunk({ type: 'reasoning-delta', index: 0, text: 'x' }))).toBe(true)
    expect(isTokenDelta(chunk({ type: 'tool-call-delta', index: 0, id: 'c1', argumentsDelta: '{}' }))).toBe(true)
    expect(isTokenDelta(chunk({ type: 'tool-call-delta', index: 0, id: 'c1', name: 'read', argumentsDelta: '' }))).toBe(true)
    expect(isTokenDelta(chunk({ type: 'tool-call-delta', index: 0, id: 'c1', argumentsDelta: '' }))).toBe(false)
    expect(isTokenDelta(chunk({ type: 'block-end', index: 0, block: { type: 'text', text: 'x' } }))).toBe(false)
    expect(isTokenDelta(chunk({ type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }))).toBe(false)
  })
})

describe('contextProvenance / contextForm', () => {
  it('projects known message sources onto role and producer label', () => {
    expect(contextProvenance({ kind: 'session-reference', references: [{ label: 'A' }, { label: 'B' }] }))
      .toEqual({ role: 'recall', label: 'A, B' })
    expect(contextProvenance({ kind: 'plugin', plugin: 'compact' })).toEqual({ role: 'inject', label: 'compact' })
    expect(contextProvenance({ kind: 'agent-instructions', changes: [{ path: 'CLAUDE.md' }] }))
      .toEqual({ role: 'inject', label: 'CLAUDE.md' })
  })

  it('degrades unreadable sources without throwing', () => {
    expect(contextProvenance(null)).toEqual({ role: 'inject', label: null })
    expect(contextProvenance({ kind: 'mystery' })).toEqual({ role: 'inject', label: 'mystery' })
  })

  it('reads only known context forms', () => {
    expect(contextForm({ form: 'instructions' })).toBe('instructions')
    expect(contextForm({ form: 'bogus' })).toBeNull()
    expect(contextForm(null)).toBeNull()
  })
})

describe('displayFailureMessage', () => {
  it('masks credentials and returns safe GUI copy', () => {
    expect(displayFailureMessage({ code: 'AUTH', message: 'credential leaked' })).toBe('API key is invalid')
    expect(displayFailureMessage({ code: 'PROVIDER', message: 'timeout' })).toBe('timeout')
    expect(displayFailureMessage('plain')).toBe('plain')
  })
})
