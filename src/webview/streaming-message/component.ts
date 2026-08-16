import type { AssistantBlock } from '../../domain/conversation-node.js'
import { createSequentialActivityDots } from '../activity-indicator/component.js'
import { nextStreamText } from './model.js'

type AssistantCard = {
  readonly running: boolean
  readonly blocks: readonly AssistantBlock[]
}

interface StreamState {
  rendered: string
  target: string
  frame: number | undefined
}

/** Owns reasoning disclosure state and smooth incremental assistant text. */
export class StreamingMessageComponent {
  private readonly streams = new WeakMap<HTMLElement, StreamState>()

  constructor(private readonly options: {
    readonly document: Document
    readonly reasoningLabel: () => string
    readonly thinkingLabel: () => string
    readonly imageLabel: () => string
    readonly renderMarkdown: (target: HTMLElement, source: string) => void
    readonly onStreamFrame: () => void
  }) {}

  render(body: HTMLElement, card: AssistantCard): void {
    const running = card.running
    for (const [index, block] of card.blocks.entries()) {
      body.append(this.renderBlock(block, index, running))
    }
    if (running) body.append(createSequentialActivityDots(this.options.document))
  }

  patch(body: HTMLElement, card: AssistantCard): boolean {
    const blocks = card.blocks
    const renderedBlocks = Array.from(body.children).filter((child) => !child.classList.contains('streaming-indicator'))
    if (renderedBlocks.length !== blocks.length) return false
    const running = card.running
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      const rendered = renderedBlocks[index]
      if (block === undefined || !(rendered instanceof HTMLElement)) return false
      if (!this.patchBlock(rendered, block, running)) return false
    }
    const indicator = body.querySelector('.streaming-indicator')
    if (running && indicator === null) body.append(createSequentialActivityDots(this.options.document))
    else if (!running) indicator?.remove()
    return true
  }

  private renderBlock(block: AssistantBlock, index: number, cardRunning: boolean): HTMLElement {
    if (block.kind === 'reasoning') {
      const details = this.options.document.createElement('details')
      details.className = `reasoning-block${cardRunning ? ' running' : ''}`
      details.dataset.disclosureKey = `reasoning-${index}`
      details.dataset.autoOpen = cardRunning ? 'true' : 'false'
      details.open = cardRunning
      const summary = this.options.document.createElement('summary')
      summary.append(this.reasoningDot(), this.label(cardRunning), this.chevron())
      const content = this.options.document.createElement('div')
      content.className = `reasoning-content markdown-body${cardRunning ? ' streaming-content' : ''}`
      this.renderContent(content, block, cardRunning)
      details.append(summary, content)
      return details
    }
    if (block.kind === 'tool-call') {
      const container = this.options.document.createElement('div')
      container.className = 'content-block tool-call'
      this.renderToolCall(container, block)
      return container
    }
    const content = this.options.document.createElement('div')
    content.className = `content-block ${block.kind}${block.kind === 'text' ? ' markdown-body' : ''}${cardRunning && block.kind === 'text' ? ' streaming-content' : ''}`
    this.renderContent(content, block, cardRunning)
    return content
  }

  private patchBlock(rendered: HTMLElement, block: AssistantBlock, cardRunning: boolean): boolean {
    if (block.kind === 'reasoning') {
      if (!(rendered instanceof HTMLDetailsElement) || !rendered.classList.contains('reasoning-block')) return false
      const content = rendered.querySelector<HTMLElement>('.reasoning-content')
      const label = rendered.querySelector<HTMLElement>('.reasoning-label')
      if (content === null || label === null) return false
      rendered.classList.toggle('running', cardRunning)
      rendered.dataset.autoOpen = cardRunning ? 'true' : 'false'
      rendered.open = cardRunning
      label.textContent = cardRunning ? this.options.thinkingLabel() : this.options.reasoningLabel()
      content.classList.toggle('streaming-content', cardRunning)
      this.renderContent(content, block, cardRunning)
      return true
    }
    if (block.kind === 'tool-call') {
      if (!rendered.classList.contains('content-block') || !rendered.classList.contains('tool-call')) return false
      this.renderToolCall(rendered, block)
      return true
    }
    if (!rendered.classList.contains('content-block') || !rendered.classList.contains(block.kind)) return false
    rendered.classList.toggle('streaming-content', cardRunning && block.kind === 'text')
    this.renderContent(rendered, block, cardRunning)
    return true
  }

  private renderToolCall(target: HTMLElement, block: Extract<AssistantBlock, { kind: 'tool-call' }>): void {
    target.replaceChildren()
    const name = this.options.document.createElement('code')
    name.className = 'tool-call-name'
    name.textContent = block.name || block.callId
    target.append(name)
    if (block.argsRaw !== '') {
      const args = this.options.document.createElement('pre')
      args.className = 'tool-call-args'
      args.textContent = prettyJson(block.argsRaw)
      target.append(args)
    }
  }

  private renderContent(target: HTMLElement, block: AssistantBlock, running: boolean): void {
    if (block.kind === 'image') {
      this.finishStream(target)
      target.textContent = this.options.imageLabel()
    } else if (block.kind === 'other') {
      this.finishStream(target)
      target.textContent = prettyJson(block.block)
    } else if (block.kind === 'tool-call') {
      // A tool-call block reaches here only via a malformed card; render it as
      // a raw head so it never silently disappears.
      this.finishStream(target)
      target.textContent = block.name || block.callId
    } else if (running) {
      this.stream(target, block.text)
    } else {
      this.finishStream(target)
      this.options.renderMarkdown(target, block.text)
    }
  }

  private stream(target: HTMLElement, text: string): void {
    let state = this.streams.get(target)
    if (state === undefined) {
      target.textContent = ''
      state = { rendered: '', target: text, frame: undefined }
      this.streams.set(target, state)
    } else {
      state.target = text
    }
    if (state.frame === undefined) this.schedule(target, state)
  }

  private schedule(target: HTMLElement, state: StreamState): void {
    state.frame = requestAnimationFrame(() => {
      state.frame = undefined
      if (!target.isConnected) return
      state.rendered = nextStreamText(state.rendered, state.target)
      target.textContent = state.rendered
      if (target.classList.contains('reasoning-content')) target.scrollTop = target.scrollHeight
      this.options.onStreamFrame()
      if (state.rendered !== state.target) this.schedule(target, state)
    })
  }

  private finishStream(target: HTMLElement): void {
    const state = this.streams.get(target)
    if (state?.frame !== undefined) cancelAnimationFrame(state.frame)
    this.streams.delete(target)
  }

  private reasoningDot(): HTMLElement {
    const dot = this.options.document.createElement('span')
    dot.className = 'reasoning-dot'
    dot.setAttribute('aria-hidden', 'true')
    return dot
  }

  private label(running: boolean): HTMLElement {
    const label = this.options.document.createElement('span')
    label.className = 'reasoning-label'
    label.textContent = running ? this.options.thinkingLabel() : this.options.reasoningLabel()
    return label
  }

  private chevron(): HTMLElement {
    const chevron = this.options.document.createElement('span')
    chevron.className = 'reasoning-chevron'
    chevron.textContent = '⌄'
    chevron.setAttribute('aria-hidden', 'true')
    return chevron
  }
}

function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), undefined, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, undefined, 2)
  } catch {
    return String(value)
  }
}
