/** Configuration staged in the composer and committed immediately before a prompt. */
export interface PromptConfiguration {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort: string
  readonly agentPreset: string
}

export type AgentPresetTransition = 'keep-session' | 'select-blank-session' | 'create-session'

/** Encodes the upstream rule that an Agent Preset is immutable after the first prompt. */
export function agentPresetTransition(
  blank: boolean,
  currentPreset: string,
  requestedPreset: string,
): AgentPresetTransition {
  if (currentPreset === requestedPreset) return 'keep-session'
  return blank ? 'select-blank-session' : 'create-session'
}

/** Treats Webview input as untrusted and accepts only a complete string tuple. */
export function promptConfiguration(value: unknown): PromptConfiguration | undefined {
  if (!isRecord(value)) return undefined
  const provider = nonEmptyString(value.provider)
  const model = nonEmptyString(value.model)
  const reasoningEffort = nonEmptyString(value.reasoningEffort)
  const agentPreset = nonEmptyString(value.agentPreset)
  if (provider === undefined || model === undefined || reasoningEffort === undefined || agentPreset === undefined) {
    return undefined
  }
  return { provider, model, reasoningEffort, agentPreset }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
