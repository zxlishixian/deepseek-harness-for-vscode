/** Stable context-occupancy data projected into the VS Code workbench. */
export interface ContextPressureView {
  readonly contextWindow: number
  readonly pressureTokens?: number
  readonly projectedTokens?: number
}

export interface ContextUsage {
  readonly usedTokens: number
  readonly contextWindow: number
  readonly percent: number
}

/** Validates the untrusted Harness `contextPressure` projection. */
export function projectionContextPressure(value: unknown): ContextPressureView | undefined {
  if (!isRecord(value) || !isPositiveTokenCount(value.contextWindow)) return undefined
  const pressureTokens = optionalTokenCount(value.pressureTokens)
  const projectedTokens = optionalTokenCount(value.projectedTokens)
  if (pressureTokens === false || projectedTokens === false) return undefined
  return {
    contextWindow: value.contextWindow,
    ...(pressureTokens === undefined ? {} : { pressureTokens }),
    ...(projectedTokens === undefined ? {} : { projectedTokens }),
  }
}

/** Uses the post-surface projection so compaction is reflected immediately. */
export function contextUsage(value: ContextPressureView): ContextUsage {
  const usedTokens = value.projectedTokens ?? value.pressureTokens ?? 0
  return {
    usedTokens,
    contextWindow: value.contextWindow,
    percent: Math.min(100, usedTokens / value.contextWindow * 100),
  }
}

function optionalTokenCount(value: unknown): number | undefined | false {
  if (value === undefined) return undefined
  return isTokenCount(value) ? value : false
}

function isPositiveTokenCount(value: unknown): value is number {
  return isTokenCount(value) && value > 0
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
