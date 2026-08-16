import DOMPurify, { type Config } from 'dompurify'
import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  maxNesting: 40,
})

// Remote Markdown images are intentionally disabled: arbitrary image URLs
// would add a privacy leak and are blocked by the Webview CSP anyway.
markdown.disable('image')

const SANITIZE_OPTIONS: Config = {
  ALLOWED_TAGS: [
    'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'li', 'ol', 'p', 'pre', 's', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
  ],
  ALLOWED_ATTR: ['class', 'href', 'title'],
  RETURN_TRUSTED_TYPE: false,
}

const renderedSources = new WeakMap<HTMLElement, string>()

export interface MarkdownActions {
  readonly openExternal: (url: string) => void
  readonly copyCode: (code: string) => void
  readonly defaultCodeLanguage: string
  readonly copyLabel: string
  readonly copyCodeLabel: (language: string) => string
}

/** Converts CommonMark/GFM-style source into markup before DOM sanitization. */
export function markdownMarkup(source: string): string {
  return markdown.render(source)
}

/**
 * Renders model/user Markdown into one stable message block.
 *
 * Raw HTML is disabled in the parser and the generated markup is passed
 * through DOMPurify before reaching innerHTML. The source cache avoids parsing
 * unchanged blocks when unrelated Gateway state updates arrive.
 */
export function renderMarkdown(target: HTMLElement, source: string, actions: MarkdownActions): void {
  if (renderedSources.get(target) === source) return
  const clean = DOMPurify.sanitize(markdownMarkup(source), SANITIZE_OPTIONS)
  target.innerHTML = String(clean)
  renderedSources.set(target, source)
  target.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href') ?? ''
    const url = safeExternalUrl(href)
    if (url === undefined) {
      link.removeAttribute('href')
      return
    }
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.addEventListener('click', (event) => {
      event.preventDefault()
      actions.openExternal(url)
    })
  })
  target.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => decorateCodeBlock(pre, actions))
}

function decorateCodeBlock(pre: HTMLPreElement, actions: MarkdownActions): void {
  const code = pre.querySelector(':scope > code')
  if (code === null) return
  const language = Array.from(code.classList)
    .find((className) => className.startsWith('language-'))
    ?.slice('language-'.length) || actions.defaultCodeLanguage
  const wrapper = document.createElement('div')
  wrapper.className = 'md-codeblock'
  const header = document.createElement('div')
  header.className = 'md-codeblock-header'
  const label = document.createElement('span')
  label.className = 'md-codeblock-lang'
  label.textContent = language
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'md-copy'
  copy.textContent = actions.copyLabel
  copy.setAttribute('aria-label', actions.copyCodeLabel(language))
  copy.addEventListener('click', () => actions.copyCode(code.textContent ?? ''))
  header.append(label, copy)
  pre.replaceWith(wrapper)
  wrapper.append(header, pre)
}

function safeExternalUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}
