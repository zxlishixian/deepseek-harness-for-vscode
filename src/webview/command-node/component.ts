import type { CommandNode } from '../../domain/conversation-node.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

export interface CommandNodeComponent {
  /** Renders one slash-command lifecycle (name + args + outcome). */
  render(node: CommandNode): HTMLElement
}

/**
 * Slash-command card. A manual `/compact` is just a command named `compact`;
 * the compaction checkpoint itself renders separately as a compaction node.
 */
export function createCommandNodeComponent(options: {
  readonly document: Document
  readonly translate: Translator
}): CommandNodeComponent {
  const { document, translate } = options

  return {
    render(node) {
      const container = document.createElement('div')
      container.className = 'command-card'
      const head = document.createElement('div')
      head.className = 'command-head'
      const name = document.createElement('span')
      name.className = 'command-name'
      name.textContent = node.name === null ? translate('slashCommand') : `/${node.name}`
      head.append(name)
      if (node.args !== null && node.args !== '') {
        const args = document.createElement('span')
        args.className = 'command-args'
        args.textContent = node.args
        head.append(args)
      }
      container.append(head)
      if (node.outcome?.kind === 'error') {
        container.classList.add('error')
        if (node.outcome.text !== undefined && node.outcome.text !== '') {
          const detail = document.createElement('span')
          detail.className = 'command-outcome error'
          detail.textContent = node.outcome.text
          container.append(detail)
        }
      } else if (node.outcome?.kind === 'success' && node.outcome.text !== undefined && node.outcome.text !== '') {
        const detail = document.createElement('span')
        detail.className = 'command-outcome success'
        detail.textContent = node.outcome.text
        container.append(detail)
      }
      return container
    },
  }
}
