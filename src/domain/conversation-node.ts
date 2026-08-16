// The conversation node model the state layer feeds the UI, mirroring the
// official Harness `ConversationNode` union (packages/client/runtime/src/client/
// sessions/conversation.ts). This file is a type-only reimplementation: the
// official union lives in `@deepseek-ai/dsh-client-runtime/client`, which drags
// in react + immer, so we re-declare the node shapes here and import only leaf
// types from the connection / host-apiproxy / llm / tools faces.
//
// Deliberate deviation from the official source: id fields are plain `string`
// here rather than branded (`CallId` / `MessageId` / `CommandId` / `RetryId`).
// The wire types already brand them, and widening to `string` on read is free;
// it keeps this layer free of `@deepseek-ai/dsh-brand` casts without changing a
// single field name.

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm/types'
import type { LlmRetryEventData } from '@deepseek-ai/dsh-llm-retry/types'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools/presentation'

/** Assistant content blocks classified by what the UI cares about. */
export type AssistantBlock =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; attachment: ImageAttachmentRef }
  | { kind: 'tool-call'; callId: string; name: string; argsRaw: string }
  | { kind: 'other'; block: unknown }

/** Classify one core content block (tool-call id/arguments mapped to callId/argsRaw). */
export function toAssistantBlock(block: ContentBlock): AssistantBlock {
  switch (block.type) {
    case 'text': return { kind: 'text', text: block.text }
    case 'reasoning': return { kind: 'reasoning', text: block.text }
    case 'image': return { kind: 'image', attachment: block.attachment }
    case 'tool-call': return { kind: 'tool-call', callId: String(block.id), name: block.name, argsRaw: block.arguments }
    default: return { kind: 'other', block }
  }
}

/** Classify a full assistant content block list in source order. */
export function toAssistantBlocks(content: readonly ContentBlock[]): AssistantBlock[] {
  return content.map(toAssistantBlock)
}

/** Create the empty client projection for one streamed assistant block kind. */
export function emptyAssistantBlock(blockType: string): AssistantBlock {
  switch (blockType) {
    case 'text': return { kind: 'text', text: '' }
    case 'reasoning': return { kind: 'reasoning', text: '' }
    case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' }
    default: return { kind: 'other', block: null }
  }
}

/**
 * Whether a stream chunk carries visible model output (the first-token boundary
 * shared by step timing). Empty deltas (heartbeats, empty tool-call frames) do
 * not count.
 */
export function isTokenDelta(chunk: StreamChunk): boolean {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text !== ''
    case 'tool-call-delta':
      return chunk.argumentsDelta !== '' || chunk.name !== undefined
    default:
      return false
  }
}

/** Recorded boundaries used to derive assistant latency and throughput. */
export interface AssistantTiming {
  stepStartTime: number | null
  firstTokenTime: number | null
  completedTime: number
}

/** A finalized user message. */
export interface UserMessageNode {
  kind: 'user'
  seq: number
  time: number
  content: readonly ContentBlock[]
  source: unknown
  /** Owning turn envelope (inline for turn-tail positioning; official derives it from a LocationIndex). */
  turn?: number
}

/** A finalized (or interruption-frozen) assistant message. */
export interface AssistantMessageNode {
  kind: 'assistant'
  seq: number
  messageId?: string
  time: number
  turn: number
  step: number
  blocks: readonly AssistantBlock[]
  usage?: unknown
  timing?: AssistantTiming
  interrupted?: true
}

/** A human message admitted from the next-step inbox while a turn was running. */
export interface SteeringMessageNode {
  kind: 'steering'
  messageId: string
  seq: number
  time: number
  content: readonly ContentBlock[]
  source: unknown
  turn?: number
}

/** A context/system injection surfaced in the flow. */
export interface ContextMessageNode {
  kind: 'context'
  seq: number
  time: number
  content: readonly ContentBlock[]
  source: unknown
  provenance: ContextProvenanceView
  form: KnownContextForm | null
  turn?: number
}

/** Durable notice that a closed failed step is waiting for a model-request retry. */
export type ModelRetryNode = LlmRetryEventData & {
  kind: 'model-retry'
  seq: number
  time: number
  retryState: 'scheduled' | 'started' | 'cancelled'
}

/** Durable terminal failure for a turn that has no scheduled retry. */
export interface TurnErrorNode {
  kind: 'turn-error'
  seq: number
  time: number
  turn: number
  step: number
  message: string
  code?: string
}

/** Durable notice for a turn ended by the per-request output-token cap. */
export interface TurnMaxTokensNode {
  kind: 'turn-max-tokens'
  seq: number
  time: number
  turn: number
  step: number
}

/** A tool result paired (when in-window) with its call head. */
export interface ToolResultNode {
  kind: 'tool-result'
  seq: number
  time: number
  callId: string
  /** Call head backfilled from the in-window tool/call; null when the window cut left it outside. */
  call: { name: string; argsRaw: string } | null
  /** Epoch ms of the paired tool/call when still in-window. */
  callTime: number | null
  content: readonly ContentBlock[]
  isError: boolean
  error?: { name: string; code: string }
  meta?: unknown
  callView: ToolCallView | null
  resultView: ToolResultView | null
  subCalls: readonly ToolCallBlock[]
  turn?: number
}

/**
 * One landed compaction marker, at the checkpoint's own log position. It does
 * not replace the shadowed history in the transcript — it records where the
 * model stopped seeing it.
 */
export interface CompactionSummaryNode {
  kind: 'compaction'
  seq: number
  time: number
  summary: string | null
  summaryEventSeq: number | null
  shadowedItemCount: number | null
  shadowedTokenCount: number | null
  turn?: number
}

/** One slash-command lifecycle folded from the log-only command/run + command/done pair. */
export interface CommandNode {
  kind: 'command'
  seq: number
  time: number
  commandId: string
  name: string | null
  args: string | null
  outcome: {
    kind: 'success' | 'error'
    text?: string
    sourceEventSeq?: number
  } | null
  turn?: number
}

/** Fallback for surface events this UI version does not know. */
export interface UnknownSurfaceNode {
  kind: 'unknown'
  seq: number
  time: number
  type: string
  data: unknown
  turn?: number
}

/** Finalized conversation node union. */
export type ConversationNode =
  | UserMessageNode
  | AssistantMessageNode
  | SteeringMessageNode
  | ContextMessageNode
  | ModelRetryNode
  | TurnErrorNode
  | TurnMaxTokensNode
  | ToolResultNode
  | CommandNode
  | CompactionSummaryNode
  | UnknownSurfaceNode

/** In-flight tool card material: tool/call seen, tool/result not yet. */
export interface RunningToolCall {
  callId: string
  name: string
  argsRaw: string
  turn: number
  step: number
  time: number
  callView: ToolCallView | null
  subCalls: readonly ToolCallBlock[]
}

/** One running or settled call, recursively owning its child calls. */
export type ToolCallBlock = RunningToolCall | ToolResultNode

/** In-progress assistant output (chunk accumulator product). */
export interface PartialAssistant {
  turn: number
  step: number
  blocks: readonly AssistantBlock[]
}

/** Which model-facing role a logged non-user message plays. */
export type ContextRole = 'inject' | 'recall'

/** Role and producer name presented for one logged non-user message. */
export interface ContextProvenanceView {
  role: ContextRole
  label: string | null
}

/** One durable context form this UI version knows how to present. */
export type KnownContextForm = 'instructions' | 'catalog' | 'snapshot' | 'notice' | 'relay' | 'recall'

const KNOWN_FORMS: readonly string[] = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall']

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function collect(source: Record<string, unknown>, member: string, field: string): string[] {
  const list = source[member]
  if (!Array.isArray(list)) return []
  const seen: string[] = []
  for (const entry of list) {
    const record = asRecord(entry)
    const value = record === null ? null : readString(record, field)
    if (value !== null && !seen.includes(value)) seen.push(value)
  }
  return seen
}

/**
 * Project one durable message source onto its transcript role and producer name.
 * `MessageSource` is merge-extensible, so unreadable shapes degrade to `inject`
 * with whatever name the record still carries.
 */
export function contextProvenance(source: unknown): ContextProvenanceView {
  const record = asRecord(source)
  const kind = record === null ? null : readString(record, 'kind')
  if (record === null || kind === null) return { role: 'inject', label: null }
  switch (kind) {
    case 'session-reference':
      return { role: 'recall', label: collect(record, 'references', 'label').join(', ') || kind }
    case 'agent-instructions':
      return { role: 'inject', label: collect(record, 'changes', 'path').join(', ') || kind }
    case 'plugin':
      return { role: 'inject', label: readString(record, 'plugin') ?? kind }
    case 'skill-invocation':
      return { role: 'inject', label: readString(record, 'name') ?? kind }
    default:
      return { role: 'inject', label: kind }
  }
}

/** Read the producer-declared form off one durable message source. */
export function contextForm(source: unknown): KnownContextForm | null {
  const record = asRecord(source)
  const form = record === null ? null : readString(record, 'form')
  return form !== null && KNOWN_FORMS.includes(form) ? form as KnownContextForm : null
}

/** Convert a durable failure into display-safe GUI copy. */
export function displayFailureMessage(failure: unknown): string {
  if (failure === null || typeof failure !== 'object') return String(failure)
  const record = failure as { code?: unknown; message?: unknown }
  // Provider AUTH messages may echo a masked credential; never project it into UI state.
  if (record.code === 'AUTH') return 'API key is invalid'
  return typeof record.message === 'string' ? record.message : JSON.stringify(failure)
}
