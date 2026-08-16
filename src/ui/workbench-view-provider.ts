import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import type { ConfigurationService } from '../config/configuration.js'
import { AGENT_PRESET_OPTIONS, MODEL_OPTIONS, REASONING_OPTIONS } from '../domain/options.js'
import { promptConfiguration } from '../domain/prompt-configuration.js'
import type { HarnessWorkbenchState } from '../domain/workbench-state.js'
import type { HarnessGatewayService } from '../gateway/harness-gateway-service.js'
import type { SessionArchiveService } from '../session/session-archive-service.js'
import { localizeWebviewMessages, type WebviewMessageKey } from '../webview/localization.js'

export interface WorkbenchViewActions {
  readonly setApiKey: () => Promise<void>
  readonly openSettings: () => Promise<void>
  readonly showLogs: () => void
}

/** Native Harness workbench. No Harness page or iframe is embedded. */
export class WorkbenchViewProvider implements vscode.Disposable {
  static readonly viewType = 'deepseekHarness.chatView'

  private panel: vscode.WebviewPanel | undefined
  private readonly subscriptions: vscode.Disposable[]
  private publishing: Promise<void> | undefined
  private publishPending = false

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configuration: ConfigurationService,
    private readonly gateway: HarnessGatewayService,
    private readonly sessionArchive: SessionArchiveService,
    private readonly actions: WorkbenchViewActions,
  ) {
    this.subscriptions = [gateway.onDidChange(() => {
      void this.publishState().catch(() => undefined)
    })]
  }

  createOrShowPanel(): void {
    if (this.panel !== undefined) {
      this.panel.reveal(undefined, false)
      return
    }
    const panel = vscode.window.createWebviewPanel(
      WorkbenchViewProvider.viewType,
      vscode.l10n.t('DeepSeek Harness'),
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        ],
      },
    )
    this.panel = panel
    panel.webview.html = this.html(panel.webview)
    panel.onDidDispose(() => {
      this.panel = undefined
    })
    this.subscriptions.push(panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message).catch((cause: unknown) => {
        const detail = cause instanceof Error ? cause.message : String(cause)
        void vscode.window.showErrorMessage(vscode.l10n.t('DeepSeek Harness: {0}', detail))
      })
    }))
    void this.gateway.start()
  }

  async refresh(): Promise<void> {
    await this.gateway.restart()
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose()
    this.panel?.dispose()
    this.panel = undefined
  }

  private publishState(): Promise<void> {
    // Gateway frames can arrive every few milliseconds. Serialize snapshots
    // so an older async credentials read can never overtake a newer state and
    // make streamed text visibly jump backwards/forwards.
    this.publishPending = true
    if (this.publishing !== undefined) return this.publishing
    const task = this.drainPublishQueue()
    this.publishing = task.finally(() => {
      this.publishing = undefined
      if (this.publishPending) void this.publishState().catch(() => undefined)
    })
    return this.publishing
  }

  private async drainPublishQueue(): Promise<void> {
    while (this.publishPending) {
      this.publishPending = false
      const snapshot = await this.gateway.snapshot()
      const archived = new Set(this.sessionArchive.archivedIds())
      const state: HarnessWorkbenchState = {
        ...snapshot,
        sessions: snapshot.sessions.filter((session) => !archived.has(session.id)),
        archivedSessions: snapshot.sessions.filter((session) => archived.has(session.id)),
      }
      await this.panel?.webview.postMessage({
        type: 'state',
        state,
        configuration: this.configuration.get(),
        fallbackOptions: {
          models: MODEL_OPTIONS.map(localizedOption),
          reasoning: REASONING_OPTIONS.map(localizedOption),
          presets: AGENT_PRESET_OPTIONS.map(localizedOption),
        },
      })
    }
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isRecord(value) || typeof value.type !== 'string') return
    switch (value.type) {
      case 'ready':
        await this.publishState()
        break
      case 'retry':
        await this.refresh()
        break
      case 'setApiKey':
        await this.actions.setApiKey()
        break
      case 'openSettings':
        await this.actions.openSettings()
        break
      case 'showLogs':
        this.actions.showLogs()
        break
      case 'newSession':
        await this.gateway.createSession()
        break
      case 'searchSessions': {
        const query = typeof value.query === 'string' ? value.query : ''
        const results = await this.gateway.searchSessions(query)
        await this.panel?.webview.postMessage({ type: 'searchResults', query, results })
        break
      }
      case 'selectSession':
        await this.gateway.openSession(requiredString(value, 'sessionId'))
        break
      case 'selectSubagent': {
        const mode = value.mode === 'continuable' ? 'continuable' : 'one-shot'
        await this.gateway.selectSubagent(requiredString(value, 'sessionId'), mode)
        break
      }
      case 'selectParent':
        await this.gateway.selectParentSession()
        break
      case 'loadOlder':
        await this.gateway.loadOlder()
        break
      case 'sendPrompt': {
        const text = typeof value.text === 'string' ? value.text : ''
        const staged = promptConfiguration(value.configuration)
        if (value.configuration !== undefined && staged === undefined) {
          throw new Error(vscode.l10n.t('Invalid model or mode configuration.'))
        }
        if (staged !== undefined) await this.gateway.applyPromptConfiguration(staged)
        await this.gateway.prompt(text, value.mode === 'steer' ? 'steer' : 'queue')
        break
      }
      case 'cancel':
        await this.gateway.cancel()
        break
      case 'setPermission':
        await this.gateway.selectPermission(requiredString(value, 'value'))
        break
      case 'openExternal': {
        // Only http(s) links from rendered markdown are opened, never local
        // paths or custom schemes.
        const raw = typeof value.url === 'string' ? value.url : ''
        const uri = safeExternalUri(raw)
        if (uri !== undefined) void vscode.env.openExternal(uri)
        break
      }
      case 'loadCommands':
        await this.gateway.refreshCommands()
        break
      case 'setPlan':
        await this.gateway.setPlanMode(value.active === true)
        break
      case 'createGoal': {
        const objective = await vscode.window.showInputBox({
          title: vscode.l10n.t('Create Harness Goal'),
          prompt: vscode.l10n.t('Harness will pursue this goal until it is completed, paused, or reaches its round limit.'),
          validateInput: (input) => input.trim() === '' ? vscode.l10n.t('The goal cannot be empty.') : undefined,
        })
        if (objective !== undefined) await this.gateway.createGoal(objective.trim())
        break
      }
      case 'mutateGoal': {
        const action = goalAction(value.action)
        await this.gateway.mutateGoal(action)
        break
      }
      case 'rename': {
        const current = await this.gateway.snapshot()
        const title = await vscode.window.showInputBox({
          title: vscode.l10n.t('Rename Harness session'),
          value: current.active?.title ?? '',
          validateInput: (input) => input.trim() === '' ? vscode.l10n.t('The title cannot be empty.') : undefined,
        })
        if (title !== undefined) await this.gateway.rename(title)
        break
      }
      case 'renameSession': {
        const sessionId = requiredString(value, 'sessionId')
        const snapshot = await this.gateway.snapshot()
        const current = snapshot.sessions.find((session) => session.id === sessionId)?.title ?? ''
        const title = await vscode.window.showInputBox({
          title: vscode.l10n.t('Rename Harness session'),
          value: current,
          validateInput: (input) => input.trim() === '' ? vscode.l10n.t('The title cannot be empty.') : undefined,
        })
        if (title !== undefined) await this.gateway.renameSession(sessionId, title)
        break
      }
      case 'fork':
        await this.gateway.fork(numberValue(value.atSeq))
        break
      case 'forkSession':
        await this.gateway.forkSession(requiredString(value, 'sessionId'))
        break
      case 'archiveSession':
        this.sessionArchive.archive(requiredString(value, 'sessionId'))
        await this.publishState()
        break
      case 'unarchiveSession':
        this.sessionArchive.unarchive(requiredString(value, 'sessionId'))
        await this.publishState()
        break
      case 'answerApproval': {
        const outcome = value.outcome === 'allowed-once' ? 'allowed-once' : 'rejected'
        await this.gateway.answerApproval(requiredString(value, 'key'), outcome)
        break
      }
      case 'answerQuestions':
        await this.gateway.answerQuestions(requiredString(value, 'key'), questionAnswers(value.answers))
        break
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(18).toString('base64')
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'chat.js'))
    const tokens = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'tokens.css'))
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'))
    const logo = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'deepseek-harness.png'))
    const messages = localizeWebviewMessages((message) => vscode.l10n.t(message))
    const text = (key: WebviewMessageKey): string => escapeHtml(messages[key])
    const language = escapeHtml(vscode.env.language)
    const localization = jsonForInlineScript({ language: vscode.env.language, messages })
    return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${tokens}">
  <link rel="stylesheet" href="${style}">
  <title>DeepSeek Harness</title>
</head>
<body>
  <section id="key-banner" class="key-banner hidden">
    <span>${text('apiKeyRequired')}</span>
    <button id="set-api-key">${text('configure')}</button>
  </section>

  <div class="body-columns">
  <aside id="history-panel" class="history-panel" aria-label="${text('history')}">
    <div class="sidebar-header">
      <div class="brand"><img class="brand-logo" src="${logo}" alt=""><strong>Harness</strong></div>
      <button id="history-toggle" class="icon-button" title="${text('history')}" aria-label="${text('history')}" aria-expanded="true" aria-controls="history-panel">☰</button>
    </div>
    <button id="new-session" class="new-session-button" title="${text('newConversation')}"><span aria-hidden="true">＋</span><span class="new-session-label">${text('newConversation')}</span></button>
    <input id="history-search" class="search-input" type="search" placeholder="${text('searchConversations')}">
    <div id="session-list" class="session-list"></div>
    <div class="sidebar-footer">
      <button id="open-settings" class="icon-button" title="${text('extensionSettings')}" aria-label="${text('extensionSettings')}">⚙</button>
      <div class="sidebar-footer-status">
        <span id="connection" class="connection"></span>
      </div>
    </div>
    <div class="drag-handle" data-side="sidebar" aria-hidden="true"></div>
  </aside>

  <main id="workbench" class="workbench">
    <section id="loading" class="center-state">
      <div class="spinner"></div><h2>${text('startingHarness')}</h2><p>${text('startingHarnessDescription')}</p>
    </section>
    <section id="error" class="center-state hidden">
      <div class="error-icon">!</div><h2>${text('connectionFailed')}</h2><p id="error-message"></p>
      <div class="state-actions"><button id="retry" class="primary-button">${text('retry')}</button><button id="show-logs" class="secondary-button">${text('logs')}</button></div>
    </section>
    <section id="chat" class="chat hidden">
      <div class="session-bar">
        <button id="back-parent" class="icon-button compact hidden" title="${text('backToParentAgent')}" aria-label="${text('backToParentAgent')}">←</button>
        <button id="session-title" class="title-button" title="${text('renameConversation')}">${text('newConversation')}</button>
        <button id="fork" class="icon-button compact" title="${text('forkConversation')}" aria-label="${text('forkConversation')}">⑂</button>
      </div>
      <div id="session-header" class="session-header hidden"></div>
      <div id="conversation" class="conversation">
        <button id="load-older" class="load-older hidden">${text('loadOlder')}</button>
        <section id="empty" class="empty-state">
          <img class="empty-logo" src="${logo}" alt=""><h2>${text('emptyTitle')}</h2><p>${text('emptyDescription')}</p>
        </section>
        <div id="messages" class="messages" aria-live="polite"></div>
      </div>

      <div id="interactions" class="interactions"></div>
      <section class="composer-shell">
        <section id="configuration-panel" class="configuration-panel hidden" role="dialog" aria-label="${text('configurationTitle')}">
          <header class="configuration-panel-header">
            <strong>${text('configurationTitle')}</strong>
            <button id="configuration-close" class="icon-button compact" type="button" title="${text('configurationClose')}" aria-label="${text('configurationClose')}">×</button>
          </header>
          <div class="configuration-panel-scroll">
            <section class="configuration-group configuration-model-group" aria-labelledby="configuration-models-label">
              <h3 id="configuration-models-label">${text('configurationModels')}</h3>
              <div id="configuration-models" class="configuration-options" role="listbox"></div>
            </section>
            <section class="configuration-group" aria-labelledby="configuration-modes-label">
              <h3 id="configuration-modes-label">${text('configurationModes')}</h3>
              <div id="configuration-presets" class="configuration-options" role="listbox"></div>
            </section>
          </div>
          <footer id="effort-control" class="effort-control" data-effort="high">
            <div class="effort-main">
              <div class="effort-heading"><span>${text('configurationEffort')}</span><strong id="effort-value"></strong></div>
              <div class="effort-slider-row">
                <input id="effort-slider" type="range" min="0" max="2" step="1" value="1" aria-label="${text('configurationEffort')}">
                <div id="effort-ticks" class="effort-ticks"></div>
              </div>
            </div>
            <p id="configuration-hint">${text('configurationAppliesNextMessage')}</p>
          </footer>
        </section>
        <div id="command-menu" class="command-menu hidden" role="listbox" aria-label="${text('slashCommands')}"></div>
        <div class="composer-card">
          <section id="composer-dock" class="composer-dock hidden" aria-label="${text('plan')}"></section>
          <div class="composer-scroll" data-input-scroll>
            <div class="composer-grow">
              <div class="composer-backdrop" aria-hidden="true" data-input-backdrop></div>
              <textarea id="prompt" class="composer-input" rows="1" placeholder="${text('promptPlaceholder')}" aria-label="${text('message')}"></textarea>
              <div class="composer-mirror" aria-hidden="true" data-input-mirror></div>
            </div>
          </div>
          <div class="composer-row">
            <div class="composer-tools">
              <button id="composer-add" class="composer-add" type="button" title="${text('slashCommands')}" aria-label="${text('slashCommands')}" aria-haspopup="listbox" aria-expanded="false">+</button>
              <div class="composer-modes">
                <select id="permission" class="permission-select hidden" title="${text('permissionDescription')}"></select>
                <button id="plan-toggle" class="plan-toggle hidden" type="button" title="${text('plan')}" aria-label="${text('plan')}">${text('plan')}</button>
              </div>
            </div>
            <div class="composer-trailing">
              <span id="composer-status" class="composer-status"></span>
              <span id="context-meter" class="context-meter hidden" role="img"></span>
              <button id="configuration-toggle" class="configuration-toggle" type="button" title="${text('configurationOpen')}" aria-label="${text('configurationOpen')}" aria-expanded="false" aria-controls="configuration-panel" disabled>
                <span class="configuration-toggle-icon">◈</span>
                <span class="configuration-toggle-copy">
                  <strong id="configuration-toggle-model">${text('model')}</strong>
                  <small id="configuration-toggle-mode">${text('agent')}</small>
                </span>
                <span class="configuration-toggle-chevron">⌃</span>
              </button>
              <button id="send" class="send-button" title="${text('sendTitle')}" aria-label="${text('send')}">↑</button>
            </div>
          </div>
        </div>
      </section>
      <p class="composer-hint">${text('composerHint')}</p>
    </section>
  </main>

  <aside id="details-panel" class="details-panel" aria-label="${text('toolInspector')}">
    <div class="drag-handle" data-side="details" aria-hidden="true"></div>
    <div class="details-panel-header">
      <span id="details-title" class="details-title"></span>
      <button id="details-close" class="icon-button compact" type="button" title="${text('close')}" aria-label="${text('close')}">×</button>
    </div>
    <div id="details-body" class="details-body"></div>
  </aside>
  </div>
  <script nonce="${nonce}">globalThis.__DEEPSEEK_HARNESS_LOCALIZATION__=${localization};</script>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`
  }
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const item = value[key]
  if (typeof item !== 'string' || item.trim() === '') throw new Error(vscode.l10n.t('Invalid {0}.', key))
  return item
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function questionAnswers(value: unknown): { readonly id: string; readonly selected: readonly string[]; readonly custom?: string }[] {
  if (!Array.isArray(value)) throw new Error(vscode.l10n.t('Invalid question answer format.'))
  return value.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Array.isArray(item.selected)) {
      throw new Error(vscode.l10n.t('Invalid question answer format.'))
    }
    const selected = item.selected.filter((choice): choice is string => typeof choice === 'string')
    const custom = optionalString(item.custom)
    return { id: item.id, selected, ...(custom === undefined ? {} : { custom }) }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Only ever hands out http(s) URLs to the external browser. */
function safeExternalUri(raw: string): vscode.Uri | undefined {
  try {
    const uri = vscode.Uri.parse(raw)
    if (uri.scheme === 'http' || uri.scheme === 'https') return uri
  } catch {
    // Malformed URL: ignore.
  }
  return undefined
}

function goalAction(value: unknown): 'pause' | 'resume' | 'complete' | 'clear' {
  if (value === 'pause' || value === 'resume' || value === 'complete' || value === 'clear') return value
  throw new Error(vscode.l10n.t('Invalid Goal action.'))
}

function localizedOption(option: { readonly id: string; readonly label: string; readonly description?: string }): {
  readonly id: string
  readonly label: string
  readonly description?: string
} {
  return {
    id: option.id,
    label: vscode.l10n.t(option.label),
    ...(option.description === undefined ? {} : { description: vscode.l10n.t(option.description) }),
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
