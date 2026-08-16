import type { RunningToolCall, ToolCallBlock, ToolResultNode } from '../../domain/conversation-node.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import { prettyJson } from '../pretty-json.js'
import { toolResultText } from '../tool-output.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

export interface DetailsPanelComponent {
  /** Panel title — the settled/running tool name, or a fallback label. */
  title(block: ToolCallBlock | null): string
  /** Input/Output body; empty when no block is selected. */
  body(block: ToolCallBlock | null): HTMLElement
}

function isResult(block: ToolCallBlock): block is ToolResultNode {
  return 'kind' in block
}

/**
 * Tool-call inspector: header tool name + Input (pretty JSON args) + Output
 * (settled result text or a running placeholder). Mirrors the official
 * `DetailsPanel` + `ToolDetails` output.
 */
export function createDetailsPanelComponent(options: {
  readonly document: Document
  readonly translate: Translator
}): DetailsPanelComponent {
  const { document, translate } = options

  const section = (label: string, content: HTMLElement): HTMLElement => {
    const wrap = document.createElement('section')
    wrap.className = 'details-section'
    const heading = document.createElement('div')
    heading.className = 'details-section-label'
    heading.textContent = label
    wrap.append(heading, content)
    return wrap
  }

  const argsPre = (argsRaw: string): HTMLElement => {
    const pre = document.createElement('pre')
    pre.className = 'tool-detail'
    pre.textContent = prettyJson(argsRaw)
    return pre
  }

  const outputPre = (text: string, isError: boolean): HTMLElement => {
    const pre = document.createElement('pre')
    pre.className = 'tool-result-content'
    if (isError) pre.dataset.error = 'true'
    pre.textContent = text
    return pre
  }

  return {
    title(block) {
      if (block === null) return ''
      if (isResult(block)) return block.call?.name || block.callId || translate('toolResult')
      return block.name || block.callId
    },
    body(block) {
      const container = document.createElement('div')
      container.className = 'details-body-content'
      if (block === null) return container

      const argsRaw = isResult(block) ? (block.call?.argsRaw ?? '') : block.argsRaw
      if (argsRaw !== '') container.append(section(translate('inspectorInput'), argsPre(argsRaw)))

      if (isResult(block)) {
        const text = toolResultText(block.content, translate)
        if (text !== '') {
          container.append(section(translate('inspectorOutput'), outputPre(text, block.isError)))
        }
      } else {
        container.append(section(translate('inspectorOutput'), outputPre(translate('running'), false)))
      }

      return container
    },
  }
}
