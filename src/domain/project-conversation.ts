// Event -> conversation-node assembler. Projects the append-only Harness event
// log into the official ConversationNode model plus the in-flight partial and
// running tool calls.
//
// The official Harness assembles this through a cordis "Definition" system with
// a LocationIndex; here we run the same folds as a two-pass pure function over
// the loaded window (typically 80-140 events), which is simpler and auditable.
// Deliberate simplifications are noted inline.

import type { HistoryEntry } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-commands/types'
import type {} from '@deepseek-ai/dsh-compaction/types'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type {} from '@deepseek-ai/dsh-tools/types'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools/presentation'
import type {
  AssistantBlock,
  ConversationNode,
  ModelRetryNode,
  PartialAssistant,
  RunningToolCall,
  ToolCallBlock,
  ToolResultNode,
} from './conversation-node.js'
import {
  contextForm,
  contextProvenance,
  displayFailureMessage,
  emptyAssistantBlock,
  toAssistantBlocks,
} from './conversation-node.js'
import {
  assistantStepKey,
  indexAssistantStepTiming,
  settledAssistantTiming,
  deriveTurnMetrics,
} from './turn-metrics.js'
import { projectTurnDurations, type TurnDurationView } from './turn-duration.js'

/** One turn's footer: elapsed boundaries plus derived TTFT/throughput. */
export interface TurnTailView {
  readonly turn: number
  readonly startedAt: number
  readonly endedAt?: number
  readonly ttftMs?: number
  readonly tokensPerSecond?: number
}

/** The full conversation projection handed to the Webview. */
export interface ConversationProjection {
  readonly nodes: readonly ConversationNode[]
  readonly partial: PartialAssistant | null
  readonly runningCalls: readonly RunningToolCall[]
  readonly turnTails: readonly TurnTailView[]
  readonly todos: readonly { readonly content: string; readonly status: string }[]
}

/** Wire-safety ceiling for the recursive tool-call tree, mirroring the official constant. */
const MAX_TOOL_CALL_TREE_DEPTH = 256

interface IndexedCall {
  readonly name: string
  readonly argsRaw: string
  readonly time: number
  readonly turn: number
  readonly step: number
  readonly callView: ToolCallView | null
}

interface CommandRun {
  readonly seq: number
  readonly time: number
  readonly name: string
  readonly args?: string
}

interface CommandDone {
  readonly seq: number
  readonly time: number
  readonly kind: 'success' | 'error'
  readonly text?: string
  readonly sourceEventSeq?: number
}

interface CompactionSummaryRecord {
  readonly seq: number
  readonly time: number
  readonly summary: readonly { readonly type: string; readonly text?: string }[]
  readonly shadowedSeqs: readonly number[]
  readonly shadowedTokenCount: number
}

/** Owns code-dispatch child pairing with a cycle/depth guard. */
class ToolCallTreeIndex {
  private readonly childrenByParent = new Map<string, ToolCallBlock[]>()
  private readonly depthByCall = new Map<string, number>()

  /** Fold one code-dispatch lifecycle event. */
  apply(event: SessionEvent): void {
    if (event.type === 'tool/code-dispatch-start') {
      const data = event.data
      const running: RunningToolCall = {
        callId: String(data.subCallId),
        name: data.name,
        argsRaw: JSON.stringify(data.arguments),
        turn: 0,
        step: 0,
        time: event.time,
        callView: null,
        subCalls: [],
      }
      const siblings = this.childrenByParent.get(String(data.parentCallId)) ?? []
      if (!this.acceptEdge(String(data.parentCallId), String(data.subCallId))) return
      this.childrenByParent.set(String(data.parentCallId), [...siblings, running])
      return
    }
    if (event.type !== 'tool/code-dispatch') return
    const data = event.data
    const siblings = this.childrenByParent.get(String(data.parentCallId)) ?? []
    const at = siblings.findIndex(sub => sub.callId === String(data.subCallId))
    if (at === -1 && !this.acceptEdge(String(data.parentCallId), String(data.subCallId))) return
    const started = at === -1 ? undefined : siblings[at]
    const settled: ToolResultNode = {
      kind: 'tool-result',
      seq: event.seq,
      time: event.time,
      callId: String(data.subCallId),
      call: { name: data.name, argsRaw: JSON.stringify(data.arguments) },
      callTime: started?.time ?? null,
      content: data.content,
      isError: data.isError,
      callView: null,
      resultView: null,
      subCalls: [],
    }
    this.childrenByParent.set(
      String(data.parentCallId),
      at === -1 ? [...siblings, settled] : siblings.map((sub, index) => index === at ? settled : sub),
    )
  }

  /** Children of one call, or undefined when it owns none. */
  childrenOf(callId: string): readonly ToolCallBlock[] | undefined {
    return this.childrenByParent.get(callId)
  }

  private acceptEdge(parentCallId: string, subCallId: string): boolean {
    if (this.wouldCreateCycle(parentCallId, subCallId)) return false
    const pending = [{ callId: subCallId, depth: (this.depthByCall.get(parentCallId) ?? 1) + 1 }]
    const updates = new Map<string, number>()
    for (const candidate of pending) {
      const knownDepth = updates.get(candidate.callId) ?? this.depthByCall.get(candidate.callId) ?? 1
      if (candidate.depth <= knownDepth) continue
      if (candidate.depth > MAX_TOOL_CALL_TREE_DEPTH) return false
      updates.set(candidate.callId, candidate.depth)
      for (const child of this.childrenByParent.get(candidate.callId) ?? []) {
        pending.push({ callId: child.callId, depth: candidate.depth + 1 })
      }
    }
    for (const [callId, depth] of updates) this.depthByCall.set(callId, depth)
    return true
  }

  private wouldCreateCycle(parentCallId: string, subCallId: string): boolean {
    if (parentCallId === subCallId) return true
    const pending = [subCallId]
    const visited = new Set(pending)
    for (const callId of pending) {
      for (const child of this.childrenByParent.get(callId) ?? []) {
        if (child.callId === parentCallId) return true
        if (visited.has(child.callId)) continue
        visited.add(child.callId)
        pending.push(child.callId)
      }
    }
    return false
  }
}

/** Recursively project code-dispatch children onto one tool-call block. */
function projectSubCalls(block: ToolCallBlock, tree: ToolCallTreeIndex): ToolCallBlock {
  const children = tree.childrenOf(block.callId) ?? block.subCalls
  const projected = children.map(child => projectSubCalls(child, tree))
  return block.subCalls === projected ? block : { ...block, subCalls: projected }
}

/** Sparse assistant/chunk accumulator (the official PartialAccumulator fold). */
class ChunkAccumulator {
  private readonly blocks: (AssistantBlock | undefined)[] = []
  private lastSeq = 0

  constructor(readonly turn: number, readonly step: number) {}

  push(chunk: Extract<SessionEvent, { type: 'assistant/chunk' }>['data']['chunk'], seq: number): void {
    this.lastSeq = seq
    switch (chunk.type) {
      case 'block-start':
        this.blocks[chunk.index] = emptyAssistantBlock(chunk.blockType)
        break
      case 'text-delta': {
        const previous = this.blocks[chunk.index]
        this.blocks[chunk.index] = { kind: 'text', text: (previous?.kind === 'text' ? previous.text : '') + chunk.text }
        break
      }
      case 'reasoning-delta': {
        const previous = this.blocks[chunk.index]
        this.blocks[chunk.index] = { kind: 'reasoning', text: (previous?.kind === 'reasoning' ? previous.text : '') + chunk.text }
        break
      }
      case 'tool-call-delta': {
        const previous = this.blocks[chunk.index]
        const base = previous?.kind === 'tool-call'
          ? previous
          : { kind: 'tool-call' as const, callId: '', name: '', argsRaw: '' }
        this.blocks[chunk.index] = {
          kind: 'tool-call',
          callId: base.callId || String(chunk.id),
          name: chunk.name ?? base.name,
          argsRaw: base.argsRaw + chunk.argumentsDelta,
        }
        break
      }
      case 'block-end':
        this.blocks[chunk.index] = toAssistantBlocks([chunk.block])[0] ?? emptyAssistantBlock('other')
        break
      default:
        break
    }
  }

  seq(): number {
    return this.lastSeq
  }

  toPartial(): PartialAssistant {
    return { turn: this.turn, step: this.step, blocks: this.blocks.filter((b): b is AssistantBlock => b !== undefined) }
  }
}

function isReplace(op: unknown): boolean {
  return typeof op === 'object' && op !== null && (op as { op: unknown }).op === 'replace'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a compaction replacement checkpoint's identity, when this event is one. */
function compactSource(event: SessionEvent): { compactionId: string; sourceCommandId?: string } | undefined {
  if (event.type !== 'user/message' || !isReplace(event.surfaceOp)) return undefined
  const source = event.data.source as unknown
  const record = isRecord(source) ? source : undefined
  if (record === undefined || record.kind !== 'plugin' || record.plugin !== 'compact'
    || typeof record.compactionId !== 'string') return undefined
  return {
    compactionId: record.compactionId,
    ...(typeof record.sourceCommandId === 'string' ? { sourceCommandId: record.sourceCommandId } : {}),
  }
}

/** Summary text joined from text blocks, or null when empty. */
function compactionSummaryText(summary: readonly { readonly type: string; readonly text?: string }[]): string | null {
  const text = summary.map(block => block.type === 'text' ? (block.text ?? '') : '').join('')
  return text.trim() === '' ? null : text
}

/**
 * Project the append-only event log into the conversation model.
 * @param entries - the loaded window, in ascending seq order.
 * @returns nodes, the in-flight partial, running calls, turn footers, and todos.
 */
export function projectConversation(entries: readonly HistoryEntry[]): ConversationProjection {
  // Pass 1: index boundaries and pairings.
  const stepTiming = new Map<string, { stepStartTime: number | null; firstTokenTime: number | null }>()
  const finalSteps = new Set<string>()
  const calls = new Map<string, IndexedCall>()
  const settledCallIds = new Set<string>()
  const commandRuns = new Map<string, CommandRun>()
  const commandDones = new Map<string, CommandDone>()
  const compactionSummary = new Map<string, CompactionSummaryRecord>()
  const manualCompactCommandIds = new Set<string>()
  const compactionCheckpoints = new Map<string, { seq: number; time: number; sourceCommandId?: string }>()
  const retryNodes: ModelRetryNode[] = []
  const startedRetries = new Set<string>()
  const closedTurns = new Set<number>()
  const retryTurns = new Set<number>()
  const maxStepByTurn = new Map<number, number>()
  const tree = new ToolCallTreeIndex()

  const noteStep = (turn: number, step: number): void => {
    const previous = maxStepByTurn.get(turn)
    if (previous === undefined || step > previous) maxStepByTurn.set(turn, step)
  }

  for (const entry of entries) {
    const event = entry.event
    indexAssistantStepTiming(stepTiming, event)
    switch (event.type) {
      case 'step/start':
        noteStep(event.data.turn, event.data.step)
        break
      case 'assistant/message':
        noteStep(event.data.turn, event.data.step)
        finalSteps.add(assistantStepKey(event.data.turn, event.data.step))
        break
      case 'tool/call':
        noteStep(event.data.turn, event.data.step)
        calls.set(String(event.data.callId), {
          name: event.data.name,
          argsRaw: event.data.arguments,
          time: event.time,
          turn: event.data.turn,
          step: event.data.step,
          callView: entry.view?.for === 'call' ? entry.view.view : null,
        })
        break
      case 'tool/result':
        noteStep(event.data.turn, event.data.step)
        settledCallIds.add(String(event.data.message.content[0].toolCallId))
        break
      case 'tool/code-dispatch-start':
      case 'tool/code-dispatch':
        tree.apply(event)
        break
      case 'command/run':
        commandRuns.set(String(event.data.commandId), {
          seq: event.seq,
          time: event.time,
          name: event.data.name,
          ...(event.data.args === undefined ? {} : { args: event.data.args }),
        })
        break
      case 'command/done':
        commandDones.set(String(event.data.commandId), {
          seq: event.seq,
          time: event.time,
          kind: event.data.kind,
          ...(event.data.text === undefined ? {} : { text: event.data.text }),
          ...(event.data.sourceEventSeq === undefined ? {} : { sourceEventSeq: event.data.sourceEventSeq }),
        })
        break
      case 'compaction/summary':
        compactionSummary.set(String(event.data.compactionId), {
          seq: event.seq,
          time: event.time,
          summary: event.data.summary,
          shadowedSeqs: event.data.shadowedSeqs,
          shadowedTokenCount: event.data.shadowedTokenCount,
        })
        break
      case 'llm/retry':
        retryNodes.push({ kind: 'model-retry', seq: event.seq, time: event.time, retryState: 'scheduled', ...event.data })
        retryTurns.add(event.data.turn)
        noteStep(event.data.turn, event.data.step)
        break
      case 'llm/retry-started':
        startedRetries.add(`${String(event.data.retryId)}:${event.data.retry}`)
        retryTurns.add(event.data.turn)
        break
      case 'turn/end':
        closedTurns.add(event.data.turn)
        break
      case 'user/message': {
        const checkpoint = compactSource(event)
        if (checkpoint !== undefined) {
          compactionCheckpoints.set(checkpoint.compactionId, {
            seq: event.seq,
            time: event.time,
            ...(checkpoint.sourceCommandId === undefined ? {} : { sourceCommandId: checkpoint.sourceCommandId }),
          })
          if (checkpoint.sourceCommandId !== undefined) manualCompactCommandIds.add(checkpoint.sourceCommandId)
        }
        break
      }
      default:
        break
    }
  }

  // Pass 2: emit nodes in seq order.
  const nodes: ConversationNode[] = []
  const partials = new Map<string, ChunkAccumulator>()
  let currentTurn = 0
  let todos: { content: string; status: string }[] = []

  for (const entry of entries) {
    const event = entry.event
    if (event.type === 'turn/start') currentTurn = event.data.turn
    switch (event.type) {
      case 'user/message': {
        if (isReplace(event.surfaceOp)) break
        const source = event.data.source as unknown
        const isUser = isRecord(source) && source.kind === 'user'
        if (isUser) {
          nodes.push({ kind: 'user', seq: event.seq, time: event.time, content: event.data.content, source, turn: currentTurn })
        } else {
          nodes.push({
            kind: 'context',
            seq: event.seq,
            time: event.time,
            content: event.data.content,
            source,
            provenance: contextProvenance(source),
            form: contextForm(source),
            turn: currentTurn,
          })
        }
        break
      }
      case 'assistant/chunk': {
        const key = assistantStepKey(event.data.turn, event.data.step)
        if (finalSteps.has(key)) break
        const accumulator = partials.get(key) ?? new ChunkAccumulator(event.data.turn, event.data.step)
        accumulator.push(event.data.chunk, event.seq)
        partials.set(key, accumulator)
        break
      }
      case 'assistant/message': {
        if (isReplace(event.surfaceOp)) break
        nodes.push({
          kind: 'assistant',
          seq: event.seq,
          messageId: String(event.data.message.id),
          time: event.time,
          turn: event.data.turn,
          step: event.data.step,
          blocks: toAssistantBlocks(event.data.message.content),
          ...(event.data.usage === undefined ? {} : { usage: event.data.usage }),
          timing: settledAssistantTiming(stepTiming, event.data.turn, event.data.step, event.time),
        })
        break
      }
      case 'tool/call':
        // Running calls render at the tail, not as settled nodes.
        break
      case 'tool/result': {
        const block = event.data.message.content[0]
        const callId = String(block.toolCallId)
        const call = calls.get(callId)
        nodes.push({
          kind: 'tool-result',
          seq: event.seq,
          time: event.time,
          callId,
          call: call === undefined ? null : { name: call.name, argsRaw: call.argsRaw },
          callTime: call?.time ?? null,
          content: block.content,
          isError: block.isError === true,
          ...(event.data.error === undefined ? {} : { error: event.data.error }),
          ...(event.data.meta === undefined ? {} : { meta: event.data.meta }),
          callView: call?.callView ?? null,
          resultView: entry.view?.for === 'result' ? entry.view.view : null,
          subCalls: [],
          turn: event.data.turn,
        })
        break
      }
      case 'command/run': {
        const commandId = String(event.data.commandId)
        const done = commandDones.get(commandId)
        const name = manualCompactCommandIds.has(commandId) ? 'compact' : event.data.name
        nodes.push({
          kind: 'command',
          seq: event.seq,
          time: event.time,
          commandId,
          name,
          args: event.data.args ?? null,
          outcome: done === undefined ? null : { kind: done.kind, ...(done.text === undefined ? {} : { text: done.text }), ...(done.sourceEventSeq === undefined ? {} : { sourceEventSeq: done.sourceEventSeq }) },
          turn: currentTurn,
        })
        break
      }
      case 'command/done': {
        const commandId = String(event.data.commandId)
        if (commandRuns.has(commandId)) break
        const done = event.data
        nodes.push({
          kind: 'command',
          seq: event.seq,
          time: event.time,
          commandId,
          name: manualCompactCommandIds.has(commandId) ? 'compact' : null,
          args: null,
          outcome: { kind: done.kind, ...(done.text === undefined ? {} : { text: done.text }), ...(done.sourceEventSeq === undefined ? {} : { sourceEventSeq: done.sourceEventSeq }) },
          turn: currentTurn,
        })
        break
      }
      case 'turn/end': {
        const reason = event.data.reason
        if (reason.kind === 'error' && !retryTurns.has(event.data.turn)) {
          nodes.push({
            kind: 'turn-error',
            seq: event.seq,
            time: event.time,
            turn: event.data.turn,
            step: maxStepByTurn.get(event.data.turn) ?? 0,
            message: displayFailureMessage(reason.error),
            ...(reason.error.code === undefined ? {} : { code: reason.error.code }),
          })
        } else if (reason.kind === 'max-tokens') {
          nodes.push({
            kind: 'turn-max-tokens',
            seq: event.seq,
            time: event.time,
            turn: event.data.turn,
            step: maxStepByTurn.get(event.data.turn) ?? 0,
          })
        }
        break
      }
      case 'todo/write':
        todos = event.data.todos.map(item => ({ content: item.content, status: item.status }))
        break
      default:
        // A future surface event this UI does not know degrades to a raw row.
        if (isAppendSurface(event)) {
          nodes.push({ kind: 'unknown', seq: event.seq, time: event.time, type: event.type, data: event.data, turn: currentTurn })
        }
        break
    }
  }

  // Emit compaction markers at their checkpoint positions.
  for (const [compactionId, checkpoint] of compactionCheckpoints) {
    const summary = compactionSummary.get(compactionId)
    nodes.push(compactNode(summary, checkpoint))
  }

  // Finalize retry states and merge them into the ordered transcript.
  for (const node of retryNodes) {
    const key = `${String(node.retryId)}:${node.retry}`
    node.retryState = startedRetries.has(key) ? 'started' : closedTurns.has(node.turn) ? 'cancelled' : 'scheduled'
  }
  nodes.push(...retryNodes)
  nodes.sort((left, right) => left.seq - right.seq)

  // The in-flight partial is the single non-finalized step still receiving deltas.
  const partial = [...partials.values()].sort((left, right) => right.seq() - left.seq())[0]?.toPartial() ?? null

  // Running calls are in-window tool/call events without a matching tool/result.
  const runningCalls: RunningToolCall[] = []
  for (const [callId, call] of calls) {
    if (settledCallIds.has(callId)) continue
    const running: RunningToolCall = {
      callId,
      name: call.name,
      argsRaw: call.argsRaw,
      turn: call.turn,
      step: call.step,
      time: call.time,
      callView: call.callView,
      subCalls: [],
    }
    runningCalls.push(projectSubCalls(running, tree) as RunningToolCall)
  }

  const turnTails = buildTurnTails(entries, nodes)
  return { nodes, partial, runningCalls, turnTails, todos }
}

/** Build one compaction marker node, or null when no checkpoint landed. */
function compactNode(
  summary: CompactionSummaryRecord | undefined,
  checkpoint: { seq: number; time: number },
): ConversationNode {
  const shadowedItemCount = summary !== undefined && summary.shadowedSeqs.every(seq => Number.isSafeInteger(seq) && seq >= 0)
    ? summary.shadowedSeqs.length
    : null
  const shadowedTokenCount = summary !== undefined && Number.isSafeInteger(summary.shadowedTokenCount) && summary.shadowedTokenCount >= 0
    ? summary.shadowedTokenCount
    : null
  return {
    kind: 'compaction',
    seq: checkpoint.seq,
    time: checkpoint.time,
    summary: summary === undefined ? null : compactionSummaryText(summary.summary),
    summaryEventSeq: summary?.seq ?? null,
    shadowedItemCount,
    shadowedTokenCount,
  }
}

/** Whether an event is an append surface event (an unknown-but-visible row). */
function isAppendSurface(event: SessionEvent): boolean {
  return (event as { surfaceOp?: unknown }).surfaceOp === 'append'
}

/** Combine per-turn durations with derived TTFT/throughput into footers. */
function buildTurnTails(entries: readonly HistoryEntry[], nodes: readonly ConversationNode[]): TurnTailView[] {
  const durations = projectTurnDurations(entries)
  const metrics = deriveTurnMetrics(nodes)
  const tails: TurnTailView[] = []
  for (const [turn, duration] of durations) {
    const metric = metrics.get(turn)
    tails.push({
      turn,
      startedAt: duration.startedAt,
      ...(duration.endedAt === undefined ? {} : { endedAt: duration.endedAt }),
      ...(metric?.ttftMs === undefined ? {} : { ttftMs: metric.ttftMs }),
      ...(metric?.tokensPerSecond === undefined ? {} : { tokensPerSecond: metric.tokensPerSecond }),
    })
  }
  tails.sort((left, right) => left.turn - right.turn)
  return tails
}
