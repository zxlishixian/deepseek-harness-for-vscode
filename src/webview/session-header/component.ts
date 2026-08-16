import type { ActiveSessionView } from '../../domain/workbench-state.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'

type Translate = (key: WebviewMessageKey, args?: MessageArguments) => string
type Post = (type: string, body?: Record<string, unknown>) => void

export interface SessionHeaderComponent {
  /** Renders the sub-agent and background-job chips in the session header strip. */
  render(active: ActiveSessionView | undefined): void
}

/**
 * The session header strip: the official Harness surfaces sub-agents and
 * background jobs in the session header (not a details tab). Sub-agent chips
 * open their child session; job rows are read-only status lines.
 */
export function createSessionHeaderComponent(options: {
  readonly document: Document
  readonly translate: Translate
  readonly post: Post
}): SessionHeaderComponent {
  const { document, translate: t, post } = options
  const root = requiredElement<HTMLElement>(document, 'session-header')

  const el = (tag: string, className: string, text?: string): HTMLElement => {
    const element = document.createElement(tag)
    element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }

  return {
    render(active) {
      const agents = (active?.subagents ?? []).map(renderAgent)
      const jobs = (active?.jobs ?? []).map(renderJob)
      if (agents.length === 0 && jobs.length === 0) {
        root.classList.add('hidden')
        root.replaceChildren()
        return
      }
      root.classList.remove('hidden')
      const fragment = document.createDocumentFragment()
      for (const chip of agents) fragment.append(chip)
      for (const row of jobs) fragment.append(row)
      root.replaceChildren(fragment)
    },
  }

  function renderAgent(agent: ActiveSessionView['subagents'][number]): HTMLElement {
    if (agent.kind === 'diagnostic') {
      const chip = el('span', 'header-agent diagnostic')
      chip.title = agent.reason
      chip.append(el('span', 'header-agent-status diagnostic', '!'))
      chip.append(el('span', 'header-agent-label', `${agent.id.slice(0, 8)} · ${agent.reason}`))
      return chip
    }
    const chip = el('button', 'header-agent') as HTMLButtonElement
    chip.type = 'button'
    chip.append(el('span', `header-agent-status ${agent.activity}`, ''))
    chip.append(el('span', 'header-agent-label', agent.label || `${t('agent')} ${agent.id.slice(0, 8)}`))
    chip.append(el('span', 'header-agent-mode', agent.mode === 'continuable' ? t('continuableConversation') : t('oneShot')))
    chip.title = agent.mode === 'continuable' ? t('continuableConversation') : t('oneShot')
    chip.addEventListener('click', () => post('selectSubagent', { sessionId: agent.id, mode: agent.mode }))
    return chip
  }

  function renderJob(job: ActiveSessionView['jobs'][number]): HTMLElement {
    const row = el('div', 'header-job')
    row.append(el('span', `header-job-status ${job.status}`, ''))
    row.append(el('span', 'header-job-label', job.label))
    if (job.detail !== undefined) row.append(el('span', 'header-job-detail', job.detail))
    return row
  }
}

function requiredElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`Missing session header element: ${id}`)
  return element as T
}
