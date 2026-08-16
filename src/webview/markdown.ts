import DOMPurify, { type Config } from 'dompurify'
import MarkdownIt from 'markdown-it'
import { findFileReferences, parseFileReference, type FileReference } from './file-reference.js'

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
  readonly openFile: (reference: FileReference) => void
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
    const reference = parseFileReference(href)
    if (reference !== undefined) {
      decorateFileLink(link, reference, actions)
      return
    }
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
  target.querySelectorAll<HTMLElement>('code').forEach((code) => {
    if (code.closest('pre') !== null) return
    const reference = parseFileReference(code.textContent ?? '')
    if (reference !== undefined) decorateFileLink(code, reference, actions)
  })
  decoratePlainTextReferences(target, actions)
}

function decoratePlainTextReferences(target: HTMLElement, actions: MarkdownActions): void {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const text = walker.currentNode
    if (text instanceof Text && text.parentElement?.closest('a, button, code, pre, .md-file-link') === null) nodes.push(text)
  }
  for (const textNode of nodes) {
    const source = textNode.data
    const references = findFileReferences(source)
    if (references.length === 0) continue
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const reference of references) {
      fragment.append(source.slice(offset, reference.start))
      const link = document.createElement('span')
      link.textContent = source.slice(reference.start, reference.end)
      decorateFileLink(link, reference, actions)
      fragment.append(link)
      offset = reference.end
    }
    fragment.append(source.slice(offset))
    textNode.replaceWith(fragment)
  }
}

function decorateFileLink(element: HTMLElement, reference: FileReference, actions: MarkdownActions): void {
  element.removeAttribute('href')
  element.classList.add('md-file-link')
  element.setAttribute('role', 'link')
  element.tabIndex = 0
  const open = (event: Event): void => {
    event.preventDefault()
    actions.openFile(reference)
  }
  element.addEventListener('click', open)
  element.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) return
    open(event)
  })
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
