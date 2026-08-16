import type { HarnessConfiguration } from '../../config/configuration.js'
import type { HarnessWorkbenchState } from '../../domain/workbench-state.js'
import type { ComposerConfigurationInput, ConfigurationOption, ModelConfigurationOption } from './types.js'

interface LocalizedOption {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export interface ComposerConfigurationPayload {
  readonly state: HarnessWorkbenchState
  readonly configuration: HarnessConfiguration
  readonly fallbackOptions: {
    readonly models: readonly LocalizedOption[]
    readonly reasoning: readonly LocalizedOption[]
    readonly presets: readonly LocalizedOption[]
  }
}

/** Adapts the host workbench DTO to the frontend component contract. */
export function composerConfigurationInput(
  payload: ComposerConfigurationPayload,
): ComposerConfigurationInput | undefined {
  const active = payload.state.active
  if (active === undefined) return undefined
  const fallbackReasoning = payload.fallbackOptions.reasoning.map(copyOption)
  const models: readonly ModelConfigurationOption[] = active.models.length > 0
    ? active.models.map((model) => ({
      provider: model.provider,
      id: model.id,
      label: model.name,
      ...(model.description === undefined ? {} : { description: model.description }),
      // Keep the live catalog authoritative, but use the localized fallback
      // copy for known ids so Off / High / Maximum follow VS Code's language.
      reasoning: model.reasoning.map((effort) => {
        const fallback = fallbackReasoning.find((option) => option.id === effort.id)
        const description = effort.description ?? fallback?.description
        return {
          id: effort.id,
          label: fallback?.label ?? effort.name,
          ...(description === undefined ? {} : { description }),
        }
      }),
    }))
    : payload.fallbackOptions.models.map((model) => ({
      provider: payload.configuration.provider,
      id: model.id,
      label: model.label,
      ...(model.description === undefined ? {} : { description: model.description }),
      reasoning: fallbackReasoning,
    }))
  const presets: readonly ConfigurationOption[] = payload.state.presets.length > 0
    ? payload.state.presets.filter((preset) => !preset.broken).map((preset) => ({
      id: preset.id,
      label: preset.name || preset.id,
      ...(preset.description === undefined ? {} : { description: preset.description }),
    }))
    : payload.fallbackOptions.presets.map(copyOption)
  return {
    sessionId: active.id,
    connected: payload.state.phase === 'connected',
    editable: active.subagentMode === undefined,
    blank: active.blank,
    current: {
      provider: active.model?.provider ?? payload.configuration.provider,
      model: active.model?.model ?? payload.configuration.model,
      reasoningEffort: active.model?.reasoningEffort ?? payload.configuration.reasoningEffort,
      agentPreset: active.agentPreset ?? payload.configuration.agentPreset,
    },
    models,
    presets,
    fallbackReasoning,
  }
}

function copyOption(option: LocalizedOption): ConfigurationOption {
  return {
    id: option.id,
    label: option.label,
    ...(option.description === undefined ? {} : { description: option.description }),
  }
}
