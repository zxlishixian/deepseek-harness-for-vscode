import type {
  CompactionSummaryNode,
  ModelRetryNode,
  TurnErrorNode,
  TurnMaxTokensNode,
  UnknownSurfaceNode,
} from '../../domain/conversation-node.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'
import { prettyJson } from '../pretty-json.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

/** Non-chat transcript rows: failures, retries, compactions, and unknown events. */
export type NoticeNode =
  | TurnErrorNode
  | TurnMaxTokensNode
  | ModelRetryNode
  | CompactionSummaryNode
  | UnknownSurfaceNode

export interface NoticeNodeComponent {
  render(node: NoticeNode): HTMLElement
}

/**
 * Durable notice rows. Follows the pre-existing `.notice` visual language
 * (left-ruled, subdued) rather than a message card.
 */
export function createNoticeNodeComponent(options: {
  readonly document: Document
  readonly translate: Translator
}): NoticeNodeComponent {
  const { document, translate } = options

  const notice = (status: string, title: string, detail?: string, body?: HTMLElement): HTMLElement => {
    const element = document.createElement('div')
    element.className = `notice ${status}`.trim()
    const strong = document.createElement('strong')
    strong.textContent = title
    element.append(strong)
    if (detail !== undefined && detail !== '') {
      const span = document.createElement('span')
      span.textContent = detail
      element.append(span)
    }
    if (body !== undefined) element.append(body)
    return element
  }

  const compaction = (node: CompactionSummaryNode): HTMLElement => {
    const counts = node.shadowedItemCount !== null && node.shadowedTokenCount !== null
      ? translate('compactedItems', { count: node.shadowedItemCount, tokens: node.shadowedTokenCount })
      : undefined
    const body = node.summary === null ? undefined : document.createElement('pre')
    if (body !== undefined) {
      body.className = 'notice-body'
      body.textContent = node.summary
    }
    return notice('', translate('contextCompacted'), counts, body)
  }

  return {
    render(node) {
      switch (node.kind) {
        case 'turn-error':
          return notice('error', node.code === undefined ? translate('turnFailed') : `${translate('turnFailed')} · ${node.code}`, node.message)
        case 'turn-max-tokens':
          return notice('', translate('outputLimitReached'))
        case 'model-retry':
          return notice('', translate('retrying'))
        case 'compaction':
          return compaction(node)
        case 'unknown':
          return notice('', node.type, prettyJson(node.data))
      }
    },
  }
}
