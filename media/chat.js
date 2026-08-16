import { renderMarkdown } from '../src/webview/markdown.js'
import { createWebviewTranslator } from '../src/webview/localization.js'
import { composerConfigurationInput } from '../src/webview/composer-configuration/adapter.js'
import { createComposerConfigurationComponent } from '../src/webview/composer-configuration/component.js'
import { composerStatusText } from '../src/webview/composer-status.js'
import { createContextMeterComponent } from '../src/webview/context-meter/component.js'
import { permissionSelectOptions } from '../src/webview/permission/adapter.js'
import { StreamingMessageComponent } from '../src/webview/streaming-message/component.js'
import { createWorkDurationComponent } from '../src/webview/work-duration/component.js'
import { createTurnTailComponent } from '../src/webview/turn-tail/component.js'
import { createToolNodeComponent } from '../src/webview/tool-node/component.js'
import { createCommandNodeComponent } from '../src/webview/command-node/component.js'
import { createNoticeNodeComponent } from '../src/webview/notice-node/component.js'
import { createDetailsPanelComponent } from '../src/webview/details-panel/component.js'
import { createComposerDockComponent } from '../src/webview/composer-dock/component.js'
import { createSessionHeaderComponent } from '../src/webview/session-header/component.js'
import { scanTextRefs } from '../src/webview/text-ref.js'
import {
  DETAILS_DEFAULT,
  DETAILS_MAX,
  DETAILS_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  computeColumns,
  sidebarCollapsed,
} from '../src/webview/layout.js'

const vscode = acquireVsCodeApi()
const t = createWebviewTranslator()

const byId = (id) => document.getElementById(id)
const elements = {
  connection: byId('connection'),
  historyToggle: byId('history-toggle'),
  historyPanel: byId('history-panel'),
  historySearch: byId('history-search'),
  sessionList: byId('session-list'),
  newSession: byId('new-session'),
  sessionTitle: byId('session-title'),
  backParent: byId('back-parent'),
  fork: byId('fork'),
  permission: byId('permission'),
  keyBanner: byId('key-banner'),
  setApiKey: byId('set-api-key'),
  openSettings: byId('open-settings'),
  loading: byId('loading'),
  error: byId('error'),
  errorMessage: byId('error-message'),
  retry: byId('retry'),
  showLogs: byId('show-logs'),
  chat: byId('chat'),
  conversation: byId('conversation'),
  loadOlder: byId('load-older'),
  empty: byId('empty'),
  messages: byId('messages'),
  bodyColumns: document.querySelector('.body-columns'),
  detailsPanel: byId('details-panel'),
  detailsTitle: byId('details-title'),
  detailsBody: byId('details-body'),
  detailsClose: byId('details-close'),
  interactions: byId('interactions'),
  prompt: byId('prompt'),
  commandMenu: byId('command-menu'),
  composerAdd: byId('composer-add'),
  planToggle: byId('plan-toggle'),
  composerBackdrop: document.querySelector('.composer-backdrop'),
  composerMirror: document.querySelector('.composer-mirror'),
  composerScroll: document.querySelector('.composer-scroll'),
  send: byId('send'),
  composerStatus: byId('composer-status'),
}

let payload
let renderedSessionId = ''
let lastActiveId = ''
const messageSignatures = new WeakMap()
let searchResults = []
let searchTimer
let menuState = null
let menuLoadedSession = null
let sessionMenuEl = null
let selectorSignature = ''
let interactionSignature = ''
const layout = { sidebar: SIDEBAR_DEFAULT, details: 0, narrowExpanded: false }
let selectedCallId = null
let dragState = null
let dragFrame = 0
const markdownActions = {
  openExternal: (url) => post('openExternal', { url }),
  copyCode: (code) => copyText(code),
  defaultCodeLanguage: t('code'),
  copyLabel: t('copy'),
  copyCodeLabel: (language) => t('copyCode', { language }),
}
const composerConfiguration = createComposerConfigurationComponent({
  document,
  translate: t,
  onChange: () => renderComposer(payload?.state.active),
  onOpen: closeCommandMenu,
})
const contextMeter = createContextMeterComponent({ document, translate: t })
const workDuration = createWorkDurationComponent({ document, translate: t })
const turnTail = createTurnTailComponent({ document, translate: t, workDuration })
const toolNode = createToolNodeComponent({ document, translate: t, onInspect: inspectTool })
const commandNode = createCommandNodeComponent({ document, translate: t })
const noticeNode = createNoticeNodeComponent({ document, translate: t })
const detailsPanel = createDetailsPanelComponent({ document, translate: t })
const composerDock = createComposerDockComponent({ document, translate: t, post })
const sessionHeader = createSessionHeaderComponent({ document, translate: t, post })
const streamingMessage = new StreamingMessageComponent({
  document,
  reasoningLabel: () => t('reasoningProcess'),
  thinkingLabel: () => t('thinking'),
  imageLabel: () => t('imageAttachment'),
  renderMarkdown: (target, source) => renderMarkdown(target, source, markdownActions),
  onStreamFrame: () => {
    if (isNearBottom(elements.conversation)) elements.conversation.scrollTop = elements.conversation.scrollHeight
  },
})

window.addEventListener('message', (event) => {
  if (event.data?.type === 'searchResults') {
    if (event.data.query === elements.historySearch.value.trim()) {
      searchResults = event.data.results
      renderSessions()
    }
    return
  }
  if (event.data?.type !== 'state') return
  payload = event.data
  render()
})

elements.historyToggle.addEventListener('click', () => toggleSidebar())
elements.historySearch.addEventListener('input', () => {
  clearTimeout(searchTimer)
  const query = elements.historySearch.value.trim()
  if (query === '') {
    searchResults = []
    renderSessions()
  } else {
    searchResults = []
    renderSessions()
    searchTimer = setTimeout(() => post('searchSessions', { query }), 180)
  }
})
elements.newSession.addEventListener('click', () => {
  composerConfiguration.reset()
  post('newSession')
})
elements.sessionTitle.addEventListener('click', () => post('rename'))
elements.backParent.addEventListener('click', () => {
  composerConfiguration.reset()
  post('selectParent')
})
elements.fork.addEventListener('click', () => {
  composerConfiguration.reset()
  post('fork')
})
elements.setApiKey.addEventListener('click', () => post('setApiKey'))
elements.openSettings.addEventListener('click', () => post('openSettings'))
elements.retry.addEventListener('click', () => post('retry'))
elements.showLogs.addEventListener('click', () => post('showLogs'))
elements.loadOlder.addEventListener('click', () => post('loadOlder'))
elements.detailsClose.addEventListener('click', () => closeDetails())
elements.send.addEventListener('click', () => {
  if (payload?.state.active?.running) post('cancel')
  else sendPrompt()
})
elements.prompt.addEventListener('input', () => {
  resizePrompt()
  updateCommandMenu()
})
elements.prompt.addEventListener('keydown', (event) => {
  if (menuState && menuState.items.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      menuState.index = (menuState.index + 1) % menuState.items.length
      renderCommandMenu()
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      menuState.index = (menuState.index - 1 + menuState.items.length) % menuState.items.length
      renderCommandMenu()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      chooseCommand(menuState.items[menuState.index])
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      if (menuState.items[menuState.index]) {
        const trigger = menuState.trigger
        const name = menuState.items[menuState.index].name
        closeCommandMenu()
        insertReference(trigger, name)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCommandMenu()
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    sendPrompt()
  }
})
elements.prompt.addEventListener('blur', () => {
  setTimeout(() => { if (!elements.commandMenu.matches(':hover')) closeCommandMenu() }, 120)
})
elements.permission.addEventListener('change', () => post('setPermission', { value: elements.permission.value }))
elements.composerAdd.addEventListener('click', openComposerMenu)
elements.planToggle.addEventListener('click', () => {
  const plan = payload?.state?.active?.plan
  if (!plan || plan.pending) return
  post('setPlan', { active: !plan.active })
})
window.addEventListener('resize', applyLayout)
for (const handle of document.querySelectorAll('.drag-handle')) bindDragHandle(handle)

function render() {
  if (!payload) return
  const { state } = payload
  const active = state.active
  renderPhase(state)
  if (!isSidebarCollapsed()) renderSessions()
  renderSelectors(active)
  elements.keyBanner.classList.toggle('hidden', state.hasApiKey)
  elements.sessionTitle.textContent = active?.title || t('newConversation')
  elements.sessionTitle.disabled = !active || !!active.parentSessionId
  elements.backParent.classList.toggle('hidden', !active?.parentSessionId)
  elements.fork.disabled = !active || active.blank
  elements.loadOlder.classList.toggle('hidden', !active?.hasMore)
  renderMessages(active)
  renderInteractions(active)
  if (active?.id !== lastActiveId) {
    lastActiveId = active?.id ?? ''
    selectedCallId = null
    closeDetails()
  }
  if (selectedCallId !== null) renderDetailsPanel()
  renderComposer(active)
  composerDock.render(active)
  sessionHeader.render(active)
  updateCommandMenu()
}

function renderPhase(state) {
  const phase = state.phase
  elements.connection.className = `connection ${phase}`
  elements.connection.textContent = phase === 'connected' ? t('connected') : phase === 'reconnecting' ? t('reconnecting') : phase === 'error' ? t('connectionError') : t('starting')
  const failed = phase === 'error'
  const loading = phase === 'idle' || phase === 'starting'
  elements.loading.classList.toggle('hidden', !loading)
  elements.error.classList.toggle('hidden', !failed)
  elements.chat.classList.toggle('hidden', loading || failed)
  if (failed) elements.errorMessage.textContent = state.error || t('unknownError')
}

function renderSessions() {
  if (!payload) return
  closeSessionMenu()
  const query = elements.historySearch.value.trim()
  const snippets = new Map(searchResults.map((result) => [result.sessionId, result.snippet]))
  const resultIds = new Set(searchResults.map((result) => result.sessionId))
  const recent = query === ''
    ? payload.state.sessions
    : payload.state.sessions.filter((session) => resultIds.has(session.id))
  const archived = query === '' ? payload.state.archivedSessions || [] : []
  const fragment = document.createDocumentFragment()
  for (const session of recent) fragment.append(sessionRow(session, snippets.get(session.id), false))
  if (archived.length > 0) {
    fragment.append(node('div', 'session-group-header', t('archived')))
    for (const session of archived) fragment.append(sessionRow(session, undefined, true))
  }
  if (recent.length === 0 && archived.length === 0) fragment.append(node('p', 'muted-empty', t('noMatchingConversations')))
  elements.sessionList.replaceChildren(fragment)
}

function sessionRow(session, snippet, archived) {
  const row = node('div', 'session-row')
  row.setAttribute('role', 'button')
  row.tabIndex = 0
  if (session.id === payload.state.active?.id) row.classList.add('active')
  const top = node('span', 'session-row-top')
  top.append(node('span', 'session-name', session.title), node('span', `running-dot ${session.status || 'done'}`))
  const meta = node('span', 'session-meta', formatRelativeTime(session.updatedAt))
  if (session.agentPreset) meta.append(` · ${session.agentPreset}`)
  row.append(top, meta)
  if (snippet) row.append(node('span', 'session-snippet', snippet))
  const menuButton = node('button', 'session-row-menu', '⋯')
  menuButton.type = 'button'
  menuButton.title = t('sessionActions')
  menuButton.setAttribute('aria-label', t('sessionActions'))
  menuButton.addEventListener('click', (event) => {
    event.stopPropagation()
    openSessionMenu(session, menuButton, archived)
  })
  row.append(menuButton)
  row.addEventListener('click', () => {
    if (archived) return
    composerConfiguration.reset()
    post('selectSession', { sessionId: session.id })
  })
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      row.click()
    }
  })
  return row
}

function openSessionMenu(session, anchor, archived) {
  closeSessionMenu()
  const menu = node('div', 'session-menu')
  menu.setAttribute('role', 'menu')
  for (const [label, action, extra] of sessionMenuItems(session, archived)) {
    const item = node('button', `session-menu-item${extra ? ` ${extra}` : ''}`, label)
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.addEventListener('click', () => {
      closeSessionMenu()
      action()
    })
    menu.append(item)
  }
  document.body.append(menu)
  sessionMenuEl = menu
  positionSessionMenu(menu, anchor)
  setTimeout(() => document.addEventListener('mousedown', onSessionMenuOutside, true), 0)
}

function sessionMenuItems(session, archived) {
  if (archived) {
    return [[t('unarchive'), () => post('unarchiveSession', { sessionId: session.id }), '']]
  }
  return [
    [t('rename'), () => post('renameSession', { sessionId: session.id }), ''],
    [t('fork'), () => post('forkSession', { sessionId: session.id }), ''],
    [t('archive'), () => post('archiveSession', { sessionId: session.id }), 'danger'],
  ]
}

function onSessionMenuOutside(event) {
  if (sessionMenuEl && !sessionMenuEl.contains(event.target)) closeSessionMenu()
}

function closeSessionMenu() {
  document.removeEventListener('mousedown', onSessionMenuOutside, true)
  if (sessionMenuEl) {
    sessionMenuEl.remove()
    sessionMenuEl = null
  }
}

function positionSessionMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect()
  menu.style.top = `${rect.bottom + 4}px`
  menu.style.left = `${Math.max(8, rect.left)}px`
  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect()
    if (menuRect.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, window.innerWidth - menuRect.width - 8)}px`
  })
}

function renderSelectors(active) {
  const nextSignature = JSON.stringify({
    sessionId: active?.id,
    phase: payload.state.phase,
    configuration: payload.configuration,
    fallbackOptions: payload.fallbackOptions,
    presets: payload.state.presets,
    models: active?.models,
    agentPreset: active?.agentPreset,
    parentSessionId: active?.parentSessionId,
    permissions: active?.permissions,
    running: active?.running,
  })
  if (nextSignature === selectorSignature) return
  selectorSignature = nextSignature
  composerConfiguration.update(composerConfigurationInput(payload))
  const permissions = active?.permissions
  if (permissions) {
    replaceOptions(elements.permission, permissionSelectOptions(permissions), permissions.currentValue)
    elements.permission.classList.remove('hidden')
    elements.permission.disabled = active.running || payload.state.phase !== 'connected'
  } else {
    elements.permission.classList.add('hidden')
  }
}

function replaceOptions(select, options, selected) {
  const fragment = document.createDocumentFragment()
  for (const item of options) {
    const option = document.createElement('option')
    option.value = item.id
    option.textContent = item.label || item.name || item.id
    option.title = item.description || ''
    option.selected = item.id === selected
    option.disabled = item.disabled === true
    fragment.append(option)
  }
  select.replaceChildren(fragment)
}

function renderMessages(active) {
  const rows = conversationRows(active)
  const sessionId = active?.id || ''
  const sessionChanged = sessionId !== renderedSessionId
  const shouldStick = sessionChanged || isNearBottom(elements.conversation)
  const previousTop = elements.conversation.scrollTop
  const previousHeight = elements.conversation.scrollHeight
  const previousFirstId = elements.messages.firstElementChild?.dataset.messageId
  const existing = new Map([...elements.messages.children].map((element) => [element.dataset.messageId, element]))
  const retained = new Set()
  let cursor = elements.messages.firstElementChild

  for (const row of rows) {
    const id = row.key
    const signature = rowSignature(row)
    let element = existing.get(id)
    if (!element) {
      element = renderRow(row)
      setMessageMetadata(element, id, signature)
    } else if (messageSignatures.get(element) !== signature) {
      if (patchRow(element, row)) {
        messageSignatures.set(element, signature)
      } else {
        const wasCursor = element === cursor
        const disclosureState = captureDisclosures(element)
        const replacement = renderRow(row)
        restoreDisclosures(replacement, disclosureState)
        setMessageMetadata(replacement, id, signature)
        element.replaceWith(replacement)
        element = replacement
        if (wasCursor) cursor = replacement
      }
    }
    retained.add(id)
    if (element !== cursor) elements.messages.insertBefore(element, cursor)
    cursor = element.nextElementSibling
  }

  for (const [id, element] of existing) {
    if (!retained.has(id)) element.remove()
  }
  elements.empty.classList.toggle('hidden', rows.length > 0)
  const prepended = !sessionChanged && previousFirstId !== undefined
    && rows.findIndex((row) => row.key === previousFirstId) > 0
  if (shouldStick) {
    elements.conversation.scrollTop = elements.conversation.scrollHeight
  } else if (prepended) {
    elements.conversation.scrollTop = previousTop + elements.conversation.scrollHeight - previousHeight
  } else {
    // Streaming below the viewport must not steal the reader's position.
    elements.conversation.scrollTop = previousTop
  }
  renderedSessionId = sessionId
}

/** Flattens nodes + running calls + partial into reconcileable rows, interleaving turn footers. */
function conversationRows(active) {
  const nodes = active?.nodes || []
  const runningCalls = active?.runningCalls || []
  const partial = active?.partial
  const tails = active?.turnTails || []
  const tailByTurn = new Map(tails.map((tail) => [tail.turn, tail]))
  const segments = []
  const lastByTurn = new Map()
  const push = (key, turn, segment) => {
    segments.push({ key, turn, ...segment })
    if (turn !== undefined) lastByTurn.set(turn, segments.length - 1)
  }
  for (const node of nodes) {
    // Assistant steps share their key with the in-flight partial, so the
    // streamed card transitions in place when the step finalizes.
    push(node.kind === 'assistant' ? `a:${node.turn}:${node.step}` : `n:${node.seq}`, node.turn, { node })
  }
  for (const call of runningCalls) push(`c:${call.callId}`, call.turn, { runningCall: call })
  if (partial) push(`a:${partial.turn}:${partial.step}`, partial.turn, { partial })

  const rows = []
  segments.forEach((segment, index) => {
    rows.push(segment)
    if (segment.turn !== undefined && lastByTurn.get(segment.turn) === index) {
      const tail = tailByTurn.get(segment.turn)
      if (tail) rows.push({ key: `t:${segment.turn}`, turn: segment.turn, tail })
    }
  })
  return rows
}

function rowSignature(row) {
  return JSON.stringify(row)
}

function renderRow(row) {
  if (row.tail) return turnTail.render(row.tail)
  if (row.runningCall) return toolNode.renderRunning(row.runningCall)
  if (row.partial) return renderAssistantCard({ blocks: row.partial.blocks }, true)
  return renderNode(row.node)
}

function renderNode(node) {
  switch (node.kind) {
    case 'user':
    case 'steering':
      return renderUserMessage(node)
    case 'assistant':
      return renderAssistantCard(node, false)
    case 'context':
      return renderContextNode(node)
    case 'tool-result':
      return toolNode.renderResult(node)
    case 'command':
      return commandNode.render(node)
    case 'compaction':
    case 'turn-error':
    case 'turn-max-tokens':
    case 'model-retry':
    case 'unknown':
      return noticeNode.render(node)
    default:
      return noticeNode.render({ kind: 'unknown', type: node.kind, data: node })
  }
}

function renderUserMessage(node) {
  const article = node('article', 'message user')
  article.append(node('div', 'message-label', t('you')))
  const body = node('div', 'message-body')
  renderContentBlocks(body, node.content)
  article.append(body)
  return article
}

function renderAssistantCard(card, running) {
  const article = node('article', 'message assistant')
  article.append(node('div', 'message-label', 'DeepSeek'))
  const body = node('div', 'message-body')
  streamingMessage.render(body, { running, blocks: card.blocks })
  article.append(body)
  return article
}

function renderContextNode(node) {
  const details = node('details', 'context-card')
  details.dataset.disclosureKey = 'context'
  details.append(node('summary', '', node.provenance?.label || t('context')))
  const body = node('div', 'context-body')
  renderContentBlocks(body, node.content)
  details.append(body)
  return details
}

function renderContentBlocks(container, content) {
  for (const block of content || []) {
    if (block.type === 'text' || block.type === 'reasoning') {
      const div = node('div', 'content-block text markdown-body')
      renderMarkdown(div, block.text, markdownActions)
      container.append(div)
    } else if (block.type === 'image') {
      container.append(node('div', 'content-block image', t('imageAttachment')))
    } else {
      container.append(node('div', 'content-block image', JSON.stringify(block)))
    }
  }
}

function renderInteractions(active) {
  const nextSignature = JSON.stringify({
    sessionId: active?.id,
    approvals: active?.approvals || [],
    questions: active?.questions || [],
  })
  if (nextSignature === interactionSignature) return
  interactionSignature = nextSignature
  const fragment = document.createDocumentFragment()
  for (const approval of active?.approvals || []) {
    const card = node('section', 'interaction-card warning')
    card.append(node('strong', '', t('approvalRequired', { tool: approval.toolName })))
    if (approval.reason) card.append(node('p', '', approval.reason))
    const actions = node('div', 'interaction-actions')
    const reject = node('button', 'secondary-button', t('reject'))
    reject.addEventListener('click', () => post('answerApproval', { key: approval.key, outcome: 'rejected' }))
    const allow = node('button', 'primary-button', t('allowOnce'))
    allow.addEventListener('click', () => post('answerApproval', { key: approval.key, outcome: 'allowed-once' }))
    actions.append(reject, allow)
    card.append(actions)
    fragment.append(card)
  }
  for (const pending of active?.questions || []) fragment.append(renderQuestions(pending))
  elements.interactions.replaceChildren(fragment)
}

function renderQuestions(pending) {
  const form = node('form', 'interaction-card question-card')
  form.append(node('strong', '', t('questionRequired')))
  for (const question of pending.questions) {
    const fieldset = document.createElement('fieldset')
    const legend = node('legend', '', question.header || question.question)
    fieldset.append(legend)
    if (question.header) fieldset.append(node('p', 'question-text', question.question))
    if (question.detail) fieldset.append(node('pre', 'question-detail', question.detail))
    for (const option of question.options) {
      const label = node('label', 'question-option')
      const input = document.createElement('input')
      input.type = question.multiSelect ? 'checkbox' : 'radio'
      input.name = `question-${question.id}`
      input.value = option.label
      label.append(input, node('span', '', option.label))
      if (option.description) label.append(node('small', '', option.description))
      fieldset.append(label)
    }
    const custom = document.createElement('input')
    custom.className = 'custom-answer'
    custom.name = `custom-${question.id}`
    custom.placeholder = t('otherAnswer')
    fieldset.append(custom)
    form.append(fieldset)
  }
  const submit = node('button', 'primary-button', t('submitAnswer'))
  submit.type = 'submit'
  form.append(submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const answers = pending.questions.map((question) => ({
      id: question.id,
      selected: [...form.querySelectorAll(`[name="question-${cssEscape(question.id)}"]:checked`)].map((input) => input.value),
      custom: form.querySelector(`[name="custom-${cssEscape(question.id)}"]`)?.value || undefined,
    }))
    post('answerQuestions', { key: pending.key, answers })
  })
  return form
}

function renderComposer(active) {
  const ready = payload.state.phase === 'connected' || payload.state.phase === 'reconnecting'
  elements.prompt.disabled = !ready
  if (active?.subagentMode === 'one-shot') elements.prompt.disabled = true
  elements.send.disabled = !ready || (!active?.running && elements.prompt.value.trim() === '')
  elements.send.textContent = active?.running ? '■' : '↑'
  elements.send.title = active?.running ? t('stopGenerating') : t('sendTitle')
  contextMeter.update(active?.contextPressure)
  renderPlanToggle(active)
  renderComposerBackdrop()
  elements.composerStatus.textContent = composerStatusText(active, {
    oneShotReadOnly: t('oneShotReadOnly'),
    runningQueue: t('runningQueue'),
    continuableSubagent: t('continuableSubagent'),
  })
}

function renderPlanToggle(active) {
  const plan = active?.plan
  elements.planToggle.classList.toggle('hidden', !plan)
  if (!plan) return
  elements.planToggle.dataset.state = plan.pending ? 'pending' : plan.active ? 'on' : 'off'
  elements.planToggle.setAttribute('aria-pressed', String(plan.active))
  elements.planToggle.disabled = plan.pending
  elements.planToggle.title = plan.pending ? t('planChanging') : plan.active ? t('planEnabled') : t('planDisabled')
}

function updateCommandMenu() {
  const active = payload?.state?.active
  const token = currentTrigger(elements.prompt)
  if (token === undefined || !active) {
    closeCommandMenu()
    return
  }
  if (!menuState || menuState.query !== token.query || menuState.trigger !== token.trigger) {
    menuState = { trigger: token.trigger, query: token.query, index: 0, items: [] }
  }
  if (token.trigger === '/' && menuLoadedSession !== active.id && (active.commands || []).length === 0) {
    menuLoadedSession = active.id
    post('loadCommands')
  }
  const query = token.query.toLowerCase()
  const items = menuItems(active, token.trigger).filter((item) => {
    const name = item.name.toLowerCase()
    return query === '' || name.includes(query) || (item.description || '').toLowerCase().includes(query)
  })
  items.sort((left, right) => rank(left.name, query) - rank(right.name, query))
  menuState.items = items
  if (menuState.index >= items.length) menuState.index = Math.max(0, items.length - 1)
  renderCommandMenu()
}

function currentTrigger(textarea) {
  const before = textarea.value.slice(0, textarea.selectionStart)
  const match = /(?:^|\s)([/@])([a-zA-Z0-9_-]*)$/.exec(before)
  return match ? { trigger: match[1], query: match[2] } : undefined
}

/** Candidate entries for the `/` command menu or the `@` mention menu. */
function menuItems(active, trigger) {
  const items = []
  for (const command of active.commands || []) {
    items.push({ name: command.name, description: command.description, hint: command.input?.hint })
  }
  if (trigger === '@') {
    for (const agent of active.subagents || []) {
      if (agent.kind === 'diagnostic') continue
      items.push({
        name: agent.label || `${t('agent')} ${agent.id.slice(0, 8)}`,
        description: agent.mode === 'continuable' ? t('continuableSubagent') : t('oneShot'),
      })
    }
    return items
  }
  for (const skill of active.skills || []) {
    items.push({ name: skill.name, description: skill.description })
  }
  return items
}

function rank(name, query) {
  if (query === '') return 0
  return name.toLowerCase().startsWith(query) ? 0 : 1
}

function renderCommandMenu() {
  const menu = elements.commandMenu
  const open = !!menuState && menuState.items.length > 0
  elements.composerAdd.setAttribute('aria-expanded', String(open))
  if (!open) {
    menu.classList.add('hidden')
    menu.replaceChildren()
    return
  }
  const trigger = menuState.trigger
  const fragment = document.createDocumentFragment()
  menuState.items.forEach((item, index) => {
    const button = node('button', `command-menu-item${index === menuState.index ? ' active' : ''}`)
    button.type = 'button'
    button.setAttribute('role', 'option')
    button.setAttribute('aria-selected', String(index === menuState.index))
    button.append(node('span', 'command-name', `${trigger}${item.name}`))
    if (item.description) button.append(node('span', 'command-desc', item.description))
    if (item.hint) button.append(node('span', 'command-hint', item.hint))
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => chooseCommand(item))
    fragment.append(button)
  })
  menu.replaceChildren(fragment)
  menu.classList.remove('hidden')
}

function chooseCommand(item) {
  const trigger = menuState?.trigger || '/'
  closeCommandMenu()
  insertReference(trigger, item.name)
}

function insertReference(trigger, name) {
  elements.prompt.value = `${trigger}${name} `
  resizePrompt()
  elements.prompt.focus()
  elements.prompt.setSelectionRange(elements.prompt.value.length, elements.prompt.value.length)
}

function closeCommandMenu() {
  menuState = null
  elements.composerAdd.setAttribute('aria-expanded', 'false')
  elements.commandMenu.classList.add('hidden')
  elements.commandMenu.replaceChildren()
}

/** Opens the `/` command menu from the `+` button by trailing a slash. */
function openComposerMenu() {
  const draft = elements.prompt.value
  const separator = draft === '' || /\s$/.test(draft) ? '' : ' '
  elements.prompt.value = `${draft}${separator}/`
  elements.prompt.focus()
  elements.prompt.setSelectionRange(elements.prompt.value.length, elements.prompt.value.length)
  resizePrompt()
  updateCommandMenu()
}

function sendPrompt() {
  closeCommandMenu()
  composerConfiguration.close()
  const text = elements.prompt.value.trim()
  if (!text) return
  const configuration = composerConfiguration.selection()
  composerConfiguration.markSubmitted()
  post('sendPrompt', {
    text,
    mode: 'queue',
    ...(configuration === undefined ? {} : { configuration }),
  })
  elements.prompt.value = ''
  resizePrompt()
}

function resizePrompt() {
  // The mirror is the height ruler: `draft + '\n'` so the last line always has
  // height. The textarea and backdrop are absolute overlays on the `.grow` cell.
  elements.composerMirror.textContent = `${elements.prompt.value}\n`
  revealCaret()
  if (payload) renderComposer(payload.state.active)
}

/** Keeps the caret in view once the composer text scrolls (mirror = measurement surrogate). */
function revealCaret() {
  const scroll = elements.composerScroll
  const mirror = elements.composerMirror
  if (!scroll || !mirror) return
  const caret = elements.prompt.selectionStart
  const textNode = mirror.firstChild
  if (textNode === null) return
  const range = document.createRange()
  range.setStart(textNode, Math.min(caret, textNode.textContent.length))
  range.collapse(true)
  const rect = range.getBoundingClientRect()
  const viewport = scroll.getBoundingClientRect()
  if (rect.bottom > viewport.bottom - 4) scroll.scrollTop += rect.bottom - (viewport.bottom - 4)
  else if (rect.top < viewport.top + 4) scroll.scrollTop -= (viewport.top + 4) - rect.top
}

/**
 * Paints `.textRef` marks over the draft glyphs in the backdrop layer. Both
 * `/command` and `@mention` are plain-text references (no width drift), so the
 * backdrop and the transparent textarea stay glyph-aligned by construction.
 */
function renderComposerBackdrop() {
  if (!elements.composerBackdrop) return
  const draft = elements.prompt.value
  const refs = scanTextRefs(draft, composerLexicons(payload?.state?.active))
  const fragment = document.createDocumentFragment()
  let cursor = 0
  for (const ref of refs) {
    if (ref.start > cursor) fragment.append(document.createTextNode(draft.slice(cursor, ref.start)))
    fragment.append(node('mark', 'text-ref', draft.slice(ref.start, ref.end)))
    cursor = ref.end
  }
  if (cursor < draft.length) fragment.append(document.createTextNode(draft.slice(cursor)))
  elements.composerBackdrop.replaceChildren(fragment)
}

/** Lexicon for text-ref scanning: `/` = commands + skills, `@` = subagents + commands. */
function composerLexicons(active) {
  const slash = []
  const at = []
  for (const command of active?.commands || []) {
    slash.push(command.name)
    at.push(command.name)
  }
  for (const skill of active?.skills || []) slash.push(skill.name)
  for (const agent of active?.subagents || []) {
    if (agent.kind === 'diagnostic') continue
    at.push(agent.label || `${t('agent')} ${agent.id.slice(0, 8)}`)
  }
  return new Map([['/', slash], ['@', at]])
}

function toggleSidebar() {
  const narrow = window.innerWidth < SIDEBAR_AUTO_COLLAPSE
  if (narrow) {
    layout.narrowExpanded = isSidebarCollapsed()
  } else {
    layout.sidebar = layout.sidebar === 0 ? SIDEBAR_DEFAULT : 0
  }
  applyLayout()
  if (!isSidebarCollapsed()) renderSessions()
}

function applyLayout() {
  const viewport = window.innerWidth
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  const collapsed = sidebarCollapsed(narrow, layout.narrowExpanded, layout.sidebar)
  const effective = collapsed ? 0 : layout.sidebar
  const columns = computeColumns(viewport, effective, layout.details)
  elements.bodyColumns.style.gridTemplateColumns = `${columns.sidebar}px minmax(0,1fr) ${columns.details}px`
  elements.historyPanel.setAttribute('data-sidebar-collapsed', String(collapsed))
  elements.detailsPanel.setAttribute('data-details-collapsed', String(columns.details === 0))
  elements.historyToggle.setAttribute('aria-expanded', String(!collapsed))
}

function isSidebarCollapsed() {
  return sidebarCollapsed(window.innerWidth < SIDEBAR_AUTO_COLLAPSE, layout.narrowExpanded, layout.sidebar)
}

function bindDragHandle(handle) {
  const side = handle.dataset.side
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragState = { side, origin: event.clientX, base: dragBase(side) }
    elements.bodyColumns.setAttribute('data-dragging', '')
    handle.setPointerCapture(event.pointerId)
  })
  handle.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.side !== side) return
    if (!handle.hasPointerCapture(event.pointerId)) return
    dragState.dx = event.clientX - dragState.origin
    if (dragFrame === 0) dragFrame = requestAnimationFrame(flushDrag)
  })
  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', endDrag)
}

function dragBase(side) {
  if (side === 'sidebar') return layout.sidebar === 0 ? SIDEBAR_DEFAULT : layout.sidebar
  return layout.details === 0 ? DETAILS_DEFAULT : layout.details
}

function flushDrag() {
  dragFrame = 0
  if (!dragState) return
  if (dragState.side === 'sidebar') {
    layout.sidebar = clampWidth(dragState.base + dragState.dx, SIDEBAR_MIN, SIDEBAR_MAX)
  } else {
    layout.details = clampWidth(dragState.base - dragState.dx, DETAILS_MIN, DETAILS_MAX)
  }
  applyLayout()
}

function endDrag() {
  if (dragFrame !== 0) {
    cancelAnimationFrame(dragFrame)
    dragFrame = 0
  }
  dragState = null
  elements.bodyColumns.removeAttribute('data-dragging')
}

function clampWidth(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function openDetails() {
  layout.details = DETAILS_DEFAULT
  applyLayout()
}

function closeDetails() {
  layout.details = 0
  selectedCallId = null
  applyLayout()
  renderDetailsPanel()
}

function inspectTool(callId) {
  selectedCallId = callId
  openDetails()
  renderDetailsPanel()
}

function renderDetailsPanel() {
  const active = payload?.state?.active
  const block = selectedCallId === null ? null : findToolCallById(active, selectedCallId)
  elements.detailsTitle.textContent = detailsPanel.title(block)
  elements.detailsBody.replaceChildren(detailsPanel.body(block))
  for (const card of elements.messages.querySelectorAll('.tool-card')) {
    card.classList.toggle('selected', card.dataset.callId === selectedCallId)
  }
}

/** Recursively locates a running or settled call by id, mirroring the official `findToolCall`. */
function findToolCallById(active, callId) {
  const candidates = [...(active?.runningCalls || []), ...(active?.nodes || []).filter((entry) => entry.kind === 'tool-result')]
  for (const block of candidates) {
    const found = findInBlock(block, callId)
    if (found) return found
  }
  return null
}

function findInBlock(block, callId) {
  if (block.callId === callId) return block
  for (const sub of block.subCalls || []) {
    const found = findInBlock(sub, callId)
    if (found) return found
  }
  return null
}

function post(type, data = {}) {
  vscode.postMessage({ type, ...data })
}

function node(tag, className = '', text = '') {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

function setMessageMetadata(element, id, signature) {
  element.dataset.messageId = id
  messageSignatures.set(element, signature)
}

/** Mutates an assistant card in place: streamed text or a finalized step. */
function patchRow(element, row) {
  if (row.node?.kind !== 'assistant' && !row.partial) return false
  if (element.tagName !== 'ARTICLE') return false
  const body = element.querySelector('.message-body')
  if (!body) return false
  const card = row.partial
    ? { running: true, blocks: row.partial.blocks }
    : { running: false, blocks: row.node.blocks }
  return streamingMessage.patch(body, card)
}

function captureDisclosures(root) {
  const state = new Map()
  for (const details of disclosureElements(root)) state.set(details.dataset.disclosureKey || '', details.open)
  return state
}

function restoreDisclosures(root, state) {
  for (const details of disclosureElements(root)) {
    if (details.dataset.autoOpen === 'true') details.open = true
    else if (details.dataset.autoOpen === 'false') details.open = false
    else details.open = state.get(details.dataset.disclosureKey || '') === true
  }
}

function disclosureElements(root) {
  const descendants = [...root.querySelectorAll('details')]
  return root.tagName === 'DETAILS' ? [root, ...descendants] : descendants
}

function isNearBottom(element) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 100
}

function formatRelativeTime(time) {
  const delta = Date.now() - time
  if (delta < 60_000) return t('justNow')
  if (delta < 3_600_000) return t('minutesAgo', { count: Math.floor(delta / 60_000) })
  if (delta < 86_400_000) return t('hoursAgo', { count: Math.floor(delta / 3_600_000) })
  return new Date(time).toLocaleDateString()
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

function copyText(text) {
  if (navigator.clipboard?.writeText !== undefined) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
  } else {
    legacyCopy(text)
  }
}

function legacyCopy(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    document.execCommand('copy')
  } catch {
    // Clipboard unavailable; the user can still select the text manually.
  }
  area.remove()
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSessionMenu()
})

applyLayout()

vscode.postMessage({ type: 'ready' })
