import type { ActiveSessionView, GoalView } from '../../domain/workbench-state.js'
import type { MessageArguments, WebviewMessageKey } from '../localization.js'

type Translate = (key: WebviewMessageKey, args?: MessageArguments) => string
type Post = (type: string, body?: Record<string, unknown>) => void

export interface ComposerDockComponent {
  /** Renders the plan strip (todos + goal) above the composer; empty renders nothing. */
  render(active: ActiveSessionView | undefined): void
}

/**
 * The composer dock: the official Harness re-homes the plan surface to a strip
 * above the composer (the web counterpart of the TUI plan panel). It renders the
 * standing todo list (collapsed by default) plus the goal card, mirroring
 * `TodoPanel` + the goal dock entry from ui-conversation.
 */
export function createComposerDockComponent(options: {
  readonly document: Document
  readonly translate: Translate
  readonly post: Post
}): ComposerDockComponent {
  const { document, translate: t, post } = options
  const root = requiredElement<HTMLElement>(document, 'composer-dock')

  const el = (tag: string, className: string, text?: string): HTMLElement => {
    const element = document.createElement(tag)
    element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }

  const goalPhaseLabel = (phase: GoalView['phase']): string => {
    if (phase === 'active') return t('goalPhaseActive')
    if (phase === 'paused') return t('goalPhasePaused')
    if (phase === 'blocked') return t('goalPhaseBlocked')
    return t('goalPhaseComplete')
  }

  const goalButton = (label: string, action: string, secondary = false): HTMLElement => {
    const button = el('button', secondary ? 'dock-goal-secondary' : 'dock-goal-action', label) as HTMLButtonElement
    button.type = 'button'
    button.addEventListener('click', () => post('mutateGoal', { action }))
    return button
  }

  return {
    render(active) {
      const fragment = document.createDocumentFragment()
      if (active !== undefined && active.todos.length > 0) fragment.append(renderTodos(active))
      if (active !== undefined && active.goal !== undefined) fragment.append(renderGoal(active.goal))
      if (fragment.childNodes.length === 0) {
        root.classList.add('hidden')
        root.replaceChildren()
        return
      }
      root.classList.remove('hidden')
      root.replaceChildren(fragment)
    },
  }

  function renderTodos(active: ActiveSessionView): HTMLElement {
    const section = el('section', 'dock-todos')
    const header = el('button', 'dock-todos-header') as HTMLButtonElement
    header.type = 'button'
    header.setAttribute('aria-expanded', 'false')
    header.append(el('span', 'dock-todos-icon', '☑'))
    header.append(el('span', 'dock-todos-title', t('plan')))
    header.append(el('span', 'dock-todos-progress', progressLabel(active)))
    header.append(el('span', 'dock-todos-chevron', '▴'))
    const list = el('ul', 'dock-todos-list hidden')
    for (const todo of active.todos) {
      const row = el('li', `dock-todo-item ${todo.status}`)
      row.append(el('span', 'dock-todo-glyph', ''), el('span', 'dock-todo-content', todo.content))
      list.append(row)
    }
    header.addEventListener('click', () => {
      const collapsed = list.classList.toggle('hidden')
      header.setAttribute('aria-expanded', String(!collapsed))
      header.querySelector('.dock-todos-chevron')!.textContent = collapsed ? '▴' : '▾'
    })
    section.append(header, list)
    return section
  }

  function progressLabel(active: ActiveSessionView): string {
    const done = active.todos.filter((todo) => todo.status === 'completed').length
    const activeCount = active.todos.filter((todo) => todo.status === 'in_progress').length
    const pending = active.todos.length - done - activeCount
    const segments: string[] = []
    if (done > 0) segments.push(t('todoProgressDone', { count: done }))
    if (activeCount > 0) segments.push(t('todoProgressActive', { count: activeCount }))
    if (pending > 0) segments.push(t('todoProgressPending', { count: pending }))
    return segments.join(' · ')
  }

  function renderGoal(goal: GoalView): HTMLElement {
    const card = el('section', 'dock-goal')
    card.append(el('strong', 'dock-goal-objective', goal.objective))
    card.append(el('span', 'dock-goal-meta', t('goalRounds', {
      phase: goalPhaseLabel(goal.phase),
      current: goal.roundsStarted ?? 0,
      max: goal.maxGoalRounds,
    })))
    if (goal.blockedReason !== undefined) card.append(el('p', 'dock-goal-blocked', goal.blockedReason))
    const actions = el('div', 'dock-goal-actions')
    if (goal.phase === 'active') actions.append(goalButton(t('pause'), 'pause'))
    if (goal.phase === 'paused' || goal.phase === 'blocked') actions.append(goalButton(t('resume'), 'resume'))
    if (goal.phase !== 'complete') actions.append(goalButton(t('markComplete'), 'complete'))
    actions.append(goalButton(t('clear'), 'clear', true))
    card.append(actions)
    return card
  }
}

function requiredElement<T extends HTMLElement>(document: Document, id: string): T {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`Missing composer dock element: ${id}`)
  return element as T
}
