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

/** Ring geometry (official ContextMeter): 14px viewBox, 5.5 radius, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Composer context-occupancy meter: an SVG ring beside the send button fed by
 * the `contextPressure` projection. The provider-exact percent drives the ring
 * arc; the level tints it (business / warn / error) and the tooltip carries the
 * localized occupancy sentence. The official breakdown panel is omitted — the
 * host does not project `contextBreakdown`.
 */
export function createContextMeterComponent(options: ComponentOptions): ContextMeterComponent {
  const root = requiredElement<HTMLElement>(options.document, 'context-meter')
  const svg = buildRing(options.document)
  const fill = svg.querySelector<SVGCircleElement>('.context-meter-fill')!
  root.replaceChildren(svg)

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
      fill.style.strokeDasharray = `${CIRCUMFERENCE * usage.percent / 100} ${CIRCUMFERENCE}`
      root.title = summary
      root.setAttribute('aria-label', summary)
    },
  }
}

function buildRing(document: Document): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 14 14')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('aria-hidden', 'true')
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  track.classList.add('context-meter-track')
  track.setAttribute('cx', '7')
  track.setAttribute('cy', '7')
  track.setAttribute('r', String(RADIUS))
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  fill.classList.add('context-meter-fill')
  fill.setAttribute('cx', '7')
  fill.setAttribute('cy', '7')
  fill.setAttribute('r', String(RADIUS))
  fill.setAttribute('transform', 'rotate(-90 7 7)')
  svg.append(track, fill)
  return svg
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
