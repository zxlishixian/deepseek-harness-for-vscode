import type { TurnTailView } from '../../domain/project-conversation.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import type { WorkDurationComponent } from '../work-duration/component.js'
import { formatWorkDuration } from '../work-duration/format.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

export interface TurnTailComponent {
  /** Renders one turn footer (TTFT, throughput, elapsed). */
  render(tail: TurnTailView): HTMLElement
}

/**
 * Owns the turn footer layout. Elapsed time reuses the shared work-duration
 * ticker so a running turn's footer stays live without re-rendering the tree.
 */
export function createTurnTailComponent(options: {
  readonly document: Document
  readonly translate: Translator
  readonly workDuration: WorkDurationComponent
}): TurnTailComponent {
  const metric = (text: string): HTMLElement => {
    const span = options.document.createElement('span')
    span.className = 'turn-metric'
    span.textContent = text
    return span
  }

  return {
    render(tail) {
      const footer = options.document.createElement('div')
      footer.className = 'turn-tail'
      if (tail.ttftMs !== undefined) {
        footer.append(metric(options.translate('firstToken', { duration: formatWorkDuration(tail.ttftMs) })))
      }
      if (tail.tokensPerSecond !== undefined) {
        footer.append(metric(options.translate('tokensPerSecond', { rate: Math.round(tail.tokensPerSecond) })))
      }
      options.workDuration.update(footer, {
        startedAt: tail.startedAt,
        ...(tail.endedAt === undefined ? {} : { endedAt: tail.endedAt }),
      })
      return footer
    },
  }
}
