import type {
  AgentPresetEntry,
  JobView,
  SessionModels,
  SessionSummary,
  SkillEntry,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import type { ContextPressureView } from './context-pressure.js'
import type {
  AssistantBlock,
  AssistantMessageNode,
  AssistantTiming,
  CommandNode,
  CompactionSummaryNode,
  ContextMessageNode,
  ContextProvenanceView,
  ContextRole,
  ConversationNode,
  KnownContextForm,
  ModelRetryNode,
  PartialAssistant,
  RunningToolCall,
  SteeringMessageNode,
  ToolCallBlock,
  ToolResultNode,
  TurnErrorNode,
  TurnMaxTokensNode,
  UnknownSurfaceNode,
  UserMessageNode,
} from './conversation-node.js'
import { deriveSessionStatus } from './session-status.js'
import type { PendingInteractionStatus, SessionStatus } from './session-status.js'
import { projectConversation } from './project-conversation.js'
import type { ConversationProjection, TurnTailView } from './project-conversation.js'
import type { AssistantStepMetadata, StepReading, TurnMetrics } from './turn-metrics.js'

// The conversation-node model now lives in its own module. Re-export it here so
// the gateway, webview and tests keep a single state-layer import surface.
export type {
  AssistantBlock,
  AssistantMessageNode,
  AssistantTiming,
  CommandNode,
  CompactionSummaryNode,
  ContextMessageNode,
  ContextProvenanceView,
  ContextRole,
  ConversationNode,
  KnownContextForm,
  ModelRetryNode,
  PartialAssistant,
  RunningToolCall,
  SteeringMessageNode,
  ToolCallBlock,
  ToolResultNode,
  TurnErrorNode,
  TurnMaxTokensNode,
  UnknownSurfaceNode,
  UserMessageNode,
}
export { deriveSessionStatus }
export type { PendingInteractionStatus, SessionStatus }
export { projectConversation }
export type { ConversationProjection, TurnTailView }
export type { AssistantStepMetadata, StepReading, TurnMetrics }

export type ConnectionPhase = 'idle' | 'starting' | 'connected' | 'reconnecting' | 'error'

export interface SessionListItem {
  readonly id: string
  readonly title: string
  readonly cwd?: string
  readonly updatedAt: number
  readonly running: boolean
  readonly blank: boolean
  readonly agentPreset?: string
  /** Primary presentation state shown as the row's status dot. */
  readonly status: SessionStatus
}

export interface PendingApprovalView {
  readonly key: string
  readonly toolName: string
  readonly reason?: string
}

export interface QuestionOptionView {
  readonly label: string
  readonly description?: string
}

export interface PendingQuestionView {
  readonly key: string
  readonly questions: readonly {
    readonly id: string
    readonly question: string
    readonly header?: string
    readonly detail?: string
    readonly options: readonly QuestionOptionView[]
    readonly multiSelect: boolean
  }[]
}

export interface ActiveSessionView {
  readonly id: string
  readonly title: string
  readonly running: boolean
  readonly blank: boolean
  readonly agentPreset?: string
  readonly hasMore: boolean
  readonly status: SessionStatus
  /** Detached model-directory snapshot; flattened by the composer adapter. */
  readonly models?: SessionModels
  readonly nodes: readonly ConversationNode[]
  readonly partial: PartialAssistant | null
  readonly runningCalls: readonly RunningToolCall[]
  readonly turnTails: readonly TurnTailView[]
  readonly todos: readonly { readonly content: string; readonly status: string }[]
  readonly skills: readonly SkillEntry[]
  readonly jobs: readonly JobView[]
  readonly approvals: readonly PendingApprovalView[]
  readonly questions: readonly PendingQuestionView[]
  readonly subagents: readonly SubagentView[]
  readonly parentSessionId?: string
  readonly subagentMode?: 'one-shot' | 'continuable'
  readonly permissions?: PermissionView
  readonly commands?: readonly CommandEntry[]
  readonly plan?: { readonly active: boolean; readonly pending: boolean }
  readonly goal?: GoalView
  readonly tokenUsage?: TokenUsageView
  readonly contextPressure?: ContextPressureView
}

export type SubagentView = {
  readonly kind: 'child'
  readonly id: string
  readonly activity: 'running' | 'inactive'
  readonly hasChildren: boolean
  readonly mode: 'one-shot' | 'continuable'
  readonly label?: string
} | {
  readonly kind: 'diagnostic'
  readonly id: string
  readonly reason: string
}

export interface PermissionView {
  readonly currentValue: string
  readonly options: readonly { readonly value: string; readonly name: string; readonly description?: string }[]
}

/** A slash-command entry registered by the Harness runtime (`/compact`, `/plan`, …). */
export interface CommandEntry {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string }
}

export interface WorkbenchLabels {
  readonly newConversation: string
  readonly session: string
}

export const ENGLISH_WORKBENCH_LABELS: WorkbenchLabels = {
  newConversation: 'New conversation',
  session: 'Session',
}

/** Projects the runtime `commands/list` payload into menu entries, sorted by name. */
export function projectionCommands(value: unknown): readonly CommandEntry[] {
  const hosts: CommandEntry[] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.description !== 'string'
        || item.description.trim() === '') continue
      const input = isRecord(item.input) && typeof item.input.hint === 'string' && item.input.hint.trim() !== ''
        ? { hint: item.input.hint }
        : undefined
      hosts.push({ name: item.name, description: item.description, ...(input === undefined ? {} : { input }) })
    }
  }
  hosts.sort((left, right) => left.name < right.name ? -1 : 1)
  return hosts
}

export interface TokenUsageView {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** Projects the harness `tokenUsage` session projection (0 when absent). */
export function projectionTokenUsage(value: unknown): TokenUsageView | undefined {
  if (!isRecord(value)) return undefined
  const uncachedInputTokens = value.uncachedInputTokens
  const outputTokens = value.outputTokens
  const cacheReadTokens = value.cacheReadTokens
  const cacheWriteTokens = value.cacheWriteTokens
  if (!isTokenCount(uncachedInputTokens) || !isTokenCount(outputTokens)
    || !isTokenCount(cacheReadTokens) || !isTokenCount(cacheWriteTokens)) return undefined
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export interface GoalView {
  readonly id: string
  readonly revision: number
  readonly objective: string
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly maxGoalRounds: number
  /** Omitted when the projection did not report it; the UI treats that as unknown. */
  readonly roundsStarted?: number
  readonly blockedReason?: string
}

export interface HarnessWorkbenchState {
  readonly phase: ConnectionPhase
  readonly error?: string
  readonly hasApiKey: boolean
  readonly sessions: readonly SessionListItem[]
  readonly archivedSessions: readonly SessionListItem[]
  readonly active?: ActiveSessionView
  readonly presets: readonly AgentPresetEntry[]
}

/** Converts a Host summary to the small, stable DTO sent into the webview. */
export function sessionListItem(summary: SessionSummary, labels = ENGLISH_WORKBENCH_LABELS): SessionListItem {
  const title = projectionTitle(summary.projections?.values)
  return {
    id: String(summary.sessionId),
    title: title ?? (summary.blank ? labels.newConversation : fallbackTitle(summary, labels)),
    ...(summary.cwd === undefined ? {} : { cwd: summary.cwd }),
    updatedAt: summary.updatedAt,
    running: summary.running,
    blank: summary.blank,
    status: deriveSessionStatus({ running: summary.running }),
    ...(summary.agentPreset === undefined ? {} : { agentPreset: summary.agentPreset }),
  }
}

export function projectionTitle(values: unknown): string | undefined {
  if (!isRecord(values)) return undefined
  const title = values.title
  return typeof title === 'string' && title.trim() !== '' ? title : undefined
}

export function projectionPermissions(value: unknown): PermissionView | undefined {
  if (!isRecord(value) || typeof value.currentValue !== 'string' || !Array.isArray(value.options)) return undefined
  const options = value.options.flatMap((option) => {
    if (!isRecord(option) || typeof option.value !== 'string' || typeof option.name !== 'string') return []
    return [{
      value: option.value,
      name: option.name,
      ...(typeof option.description === 'string' ? { description: option.description } : {}),
    }]
  })
  return { currentValue: value.currentValue, options }
}

export function projectionPlan(value: unknown): { readonly active: boolean; readonly pending: boolean } | undefined {
  if (!isRecord(value) || typeof value.active !== 'boolean' || typeof value.pending !== 'boolean') return undefined
  return { active: value.active, pending: value.pending }
}

export function projectionGoal(value: unknown): GoalView | undefined {
  if (!isRecord(value) || !isRecord(value.goal)) return undefined
  const goal = value.goal
  if (typeof goal.id !== 'string' || typeof goal.revision !== 'number' || typeof goal.objective !== 'string'
    || !isGoalPhase(goal.phase) || typeof goal.maxGoalRounds !== 'number') return undefined
  const blockedReason = isRecord(goal.blockedReason) && typeof goal.blockedReason.message === 'string'
    ? goal.blockedReason.message
    : undefined
  return {
    id: goal.id,
    revision: goal.revision,
    objective: goal.objective,
    phase: goal.phase,
    maxGoalRounds: goal.maxGoalRounds,
    ...(typeof value.roundsStarted === 'number' ? { roundsStarted: value.roundsStarted } : {}),
    ...(blockedReason === undefined ? {} : { blockedReason }),
  }
}

function fallbackTitle(summary: SessionSummary, labels: WorkbenchLabels): string {
  const folder = summary.cwd?.split(/[\\/]/u).filter(Boolean).at(-1)
  return folder === undefined ? `${labels.session} ${String(summary.sessionId).slice(0, 8)}` : folder
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isGoalPhase(value: unknown): value is GoalView['phase'] {
  return value === 'active' || value === 'paused' || value === 'blocked' || value === 'complete'
}
