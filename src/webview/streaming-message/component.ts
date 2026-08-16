import type { ChatBlock, ChatItem } from '../../domain/workbench-state.js'
import { createSequentialActivityDots } from '../activity-indicator/component.js'
import { nextStreamText } from './model.js'

type StreamingMessage = Pick<ChatItem, 'status' | 'blocks'>

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
    readonly renderMarkdown: (target: HTMLElement, source: string) => void
    readonly onStreamFrame: () => void
  }) {}

  render(body: HTMLElement, item: StreamingMessage): void {
    const running = item.status === 'running'
    for (const [index, block] of (item.blocks ?? []).entries()) {
      body.append(this.renderBlock(block, index, running))
    }
    if (running) body.append(createSequentialActivityDots(this.options.document))
  }

  patch(body: HTMLElement, item: StreamingMessage): boolean {
    const blocks = item.blocks ?? []
    const renderedBlocks = Array.from(body.children).filter((child) => !child.classList.contains('streaming-indicator'))
    if (renderedBlocks.length !== blocks.length) return false
    const running = item.status === 'running'
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

  private renderBlock(block: ChatBlock, index: number, messageRunning: boolean): HTMLElement {
    const running = messageRunning && block.streaming === true
    if (block.kind === 'reasoning') {
      const details = this.options.document.createElement('details')
      details.className = `reasoning-block${running ? ' running' : ''}`
      details.dataset.disclosureKey = `reasoning-${index}`
      details.dataset.autoOpen = running ? 'true' : 'false'
      details.open = running
      const summary = this.options.document.createElement('summary')
      summary.append(this.reasoningDot(), this.label(running), this.chevron())
      const content = this.options.document.createElement('div')
      content.className = `reasoning-content markdown-body${running ? ' streaming-content' : ''}`
      this.renderContent(content, block, running)
      details.append(summary, content)
      return details
    }
    const content = this.options.document.createElement('div')
    content.className = `content-block ${block.kind}${block.kind === 'text' ? ' markdown-body' : ''}${running ? ' streaming-content' : ''}`
    this.renderContent(content, block, running)
    return content
  }

  private patchBlock(rendered: HTMLElement, block: ChatBlock, messageRunning: boolean): boolean {
    const running = messageRunning && block.streaming === true
    if (block.kind === 'reasoning') {
      if (!(rendered instanceof HTMLDetailsElement) || !rendered.classList.contains('reasoning-block')) return false
      const content = rendered.querySelector<HTMLElement>('.reasoning-content')
      const label = rendered.querySelector<HTMLElement>('.reasoning-label')
      if (content === null || label === null) return false
      rendered.classList.toggle('running', running)
      rendered.dataset.autoOpen = running ? 'true' : 'false'
      rendered.open = running
      label.textContent = running ? this.options.thinkingLabel() : this.options.reasoningLabel()
      content.classList.toggle('streaming-content', running)
      this.renderContent(content, block, running)
      return true
    }
    if (!rendered.classList.contains('content-block') || !rendered.classList.contains(block.kind)) return false
    rendered.classList.toggle('streaming-content', running)
    this.renderContent(rendered, block, running)
    return true
  }

  private renderContent(target: HTMLElement, block: ChatBlock, running: boolean): void {
    if (block.kind === 'image') {
      this.finishStream(target)
      target.textContent = block.text
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
