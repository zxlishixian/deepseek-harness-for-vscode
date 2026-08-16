import { contextUsage, type ContextPressureView } from '../../domain/context-pressure.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import { formatTokenCount } from '../token-format.js'

type Translate = (key: WebviewMessageKey, args?: MessageArguments) => string

export interface ContextMeterComponent {
  readonly update: (pressure: ContextPressureView | undefined) => void
}

interface ComponentOptions {
  readonly document: Document
  readonly translate: Translate
}

/** Renders context occupancy independently from cumulative token accounting. */
export function createContextMeterComponent(options: ComponentOptions): ContextMeterComponent {
  const root = requiredElement<HTMLElement>(options.document, 'context-meter')
  const value = requiredElement<HTMLElement>(options.document, 'context-meter-value')
  return {
    update: (pressure) => {
      if (pressure === undefined) {
        root.classList.add('hidden')
        root.removeAttribute('data-level')
        return
      }
      const usage = contextUsage(pressure)
      const percent = percentageLabel(usage.percent, usage.usedTokens)
      const summary = options.translate('contextUsageSummary', {
        used: formatTokenCount(usage.usedTokens),
        limit: formatTokenCount(usage.contextWindow),
        percent,
      })
      root.classList.remove('hidden')
      root.dataset.level = usage.percent >= 90 ? 'critical' : usage.percent >= 70 ? 'warning' : 'normal'
      root.style.setProperty('--context-progress', `${usage.percent}%`)
      root.title = summary
      root.setAttribute('aria-label', summary)
      value.textContent = `${percent}%`
    },
  }
}

export function percentageLabel(percent: number, usedTokens: number): string {
  if (usedTokens > 0 && percent < 1) return '<1'
  return String(Math.round(percent))
}

function requiredElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`Missing context meter element: ${id}`)
  return element as T
}
