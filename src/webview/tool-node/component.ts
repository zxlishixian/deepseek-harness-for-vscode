import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { RunningToolCall, ToolCallBlock, ToolResultNode } from '../../domain/conversation-node.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import { prettyJson } from '../pretty-json.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

export interface ToolNodeComponent {
  /** Renders an in-flight tool/call without a settled result yet. */
  renderRunning(call: RunningToolCall): HTMLElement
  /** Renders a settled tool result (recursively owning its code-dispatch children). */
  renderResult(node: ToolResultNode): HTMLElement
}

/**
 * Recursive tool tree. A running call shows its call head and any nested
 * children; a settled result adds the raw output and sub-call tree. Depth is
 * already capped by the projection layer, so this renderer recurses freely.
 */
export function createToolNodeComponent(options: {
  readonly document: Document
  readonly translate: Translator
  /** Opens the details-panel inspector for a call id. */
  readonly onInspect: (callId: string) => void
}): ToolNodeComponent {
  const { document, translate, onInspect } = options

  const card = (className: string, callId: string): HTMLDetailsElement => {
    const element = document.createElement('details')
    element.className = `tool-card ${className}`
    element.dataset.disclosureKey = 'tool'
    element.dataset.callId = callId
    return element
  }

  const summary = (label: string, callId: string): HTMLElement => {
    const element = document.createElement('summary')
    const dot = document.createElement('span')
    dot.className = 'tool-status'
    const title = document.createElement('span')
    title.className = 'tool-title'
    title.textContent = label
    element.append(dot, title)
    const inspect = document.createElement('button')
    inspect.type = 'button'
    inspect.className = 'tool-inspect'
    inspect.textContent = translate('inspect')
    inspect.setAttribute('aria-label', translate('inspect'))
    inspect.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onInspect(callId)
    })
    element.append(inspect)
    return element
  }

  const argsPre = (argsRaw: string): HTMLElement => {
    const pre = document.createElement('pre')
    pre.className = 'tool-detail'
    pre.textContent = prettyJson(argsRaw)
    return pre
  }

  const resultContent = (content: readonly ContentBlock[]): HTMLElement | null => {
    const text = content.map((block) => {
      if (block.type === 'text' || block.type === 'reasoning') return block.text
      if (block.type === 'image') return translate('imageAttachment')
      return prettyJson(block)
    }).join('\n')
    if (text === '') return null
    const pre = document.createElement('pre')
    pre.className = 'tool-result-content'
    pre.textContent = text
    return pre
  }

  const renderSubCalls = (parent: HTMLElement, subCalls: readonly ToolCallBlock[]): void => {
    for (const sub of subCalls) parent.append(renderCall(sub))
  }

  const renderRunningDetails = (call: RunningToolCall): HTMLElement => {
    const element = card('running', call.callId)
    element.open = true
    element.append(summary(call.name || call.callId, call.callId))
    if (call.argsRaw !== '') element.append(argsPre(call.argsRaw))
    renderSubCalls(element, call.subCalls)
    return element
  }

  const renderResultDetails = (node: ToolResultNode): HTMLElement => {
    const element = card(node.isError ? 'error' : 'success', node.callId)
    element.append(summary(node.call?.name || node.callId || translate('toolResult'), node.callId))
    if (node.call?.argsRaw) element.append(argsPre(node.call.argsRaw))
    const body = document.createElement('div')
    body.className = 'tool-result'
    const content = resultContent(node.content)
    if (content !== null) body.append(content)
    renderSubCalls(body, node.subCalls)
    if (body.childNodes.length > 0) element.append(body)
    return element
  }

  const renderCall = (block: ToolCallBlock): HTMLElement => {
    return 'kind' in block ? renderResultDetails(block) : renderRunningDetails(block)
  }

  return {
    renderRunning(call) {
      const container = document.createElement('div')
      container.className = 'tool-item'
      container.append(renderRunningDetails(call))
      return container
    },
    renderResult(node) {
      const container = document.createElement('div')
      container.className = 'tool-item'
      container.append(renderResultDetails(node))
      return container
    },
  }
}
