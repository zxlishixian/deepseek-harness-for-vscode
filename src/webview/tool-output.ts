import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'
import type { MessageArguments, WebviewMessageKey } from './localization.js'
import { prettyJson } from './pretty-json.js'

type Translator = (key: WebviewMessageKey, args?: MessageArguments) => string

/**
 * Flattens settled tool-result content to display text: text/reasoning blocks
 * verbatim, images as a placeholder, everything else as pretty JSON. Shared by
 * the tool-card renderer and the details-panel inspector.
 */
export function toolResultText(content: readonly ContentBlock[], translate: Translator): string {
  return content
    .map((block) => {
      if (block.type === 'text' || block.type === 'reasoning') return block.text
      if (block.type === 'image') return translate('imageAttachment')
      return prettyJson(block)
    })
    .join('\n')
}
