/**
 * VS Code extension entry: owns the dsh child process, the Webview panel that
 * embeds its Web GUI, and the command surface.
 *
 * The Web GUI is embedded as an `iframe` whose document is same-origin with
 * the spawned `dsh web` server. That same-origin relationship is required by
 * the host's `/api` browser-trust fence: a cross-site request (which a
 * Webview page would send on its own) is refused with 403.
 * @module dsh-vscode/extension
 */

import * as vscode from 'vscode'
import { startServer, type RunningServer } from './host'

let server: RunningServer | undefined
let panel: vscode.WebviewPanel | undefined
let output: vscode.OutputChannel

/** Activate: register commands, create the log channel, and honor `openOnStartup`. */
export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('DeepSeek Harness')
  context.subscriptions.push(output)

  const open = async (preserveFocus: boolean): Promise<void> => {
    if (server !== undefined) {
      revealPanel(preserveFocus)
      return
    }
    const config = vscode.workspace.getConfiguration('dsh')
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    // The harness treats the invoking directory as the default workspace root,
    // so running the child in the VS Code workspace aligns the agent's cwd.
    const cwd = workspaceFolder?.uri.fsPath
    output.appendLine(`starting dsh web (cwd: ${cwd ?? '(none)'})`)
    try {
      const started = await startServer({
        binary: config.get<string>('binary') ?? '',
        host: '127.0.0.1',
        port: config.get<number>('port') ?? 0,
        args: config.get<string[]>('args') ?? [],
        home: config.get<string>('home') || undefined,
        cwd,
        log: (text) => output.append(text),
      })
      server = started
      started.child.once('exit', (code, signal) => {
        output.appendLine(`dsh exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`)
        server = undefined
        if (panel !== undefined) {
          panel.webview.html = stoppedHtml(code, signal)
        }
      })
      openPanel(started.url, preserveFocus)
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to start DeepSeek Harness: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const stop = async (): Promise<void> => {
    const current = server
    server = undefined
    await current?.stop()
  }

  const openExternal = async (): Promise<void> => {
    if (server === undefined) {
      await open(true)
    }
    if (server !== undefined) {
      await vscode.env.openExternal(vscode.Uri.parse(server.url))
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('dsh.open', () => { void open(false) }),
    vscode.commands.registerCommand('dsh.openInBackground', () => { void open(true) }),
    vscode.commands.registerCommand('dsh.openExternal', () => { void openExternal() }),
    vscode.commands.registerCommand('dsh.stop', () => { void stop() }),
  )

  if (vscode.workspace.getConfiguration('dsh').get<boolean>('openOnStartup')) {
    void open(true)
  }
}

/** Deactivate: terminate the hosted server if it is still running. */
export function deactivate(): void {
  void server?.stop()
}

/** Open (or reuse) the panel hosting the iframe. */
function openPanel(url: string, preserveFocus: boolean): void {
  if (panel !== undefined) {
    panel.webview.html = panelHtml(url)
    panel.reveal(undefined, preserveFocus)
    return
  }
  panel = vscode.window.createWebviewPanel(
    'dsh.panel',
    'DeepSeek Harness',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
  )
  panel.webview.html = panelHtml(url)
  panel.onDidDispose(() => { panel = undefined })
}

/** Reveal the existing panel without changing its HTML. */
function revealPanel(preserveFocus: boolean): void {
  if (panel !== undefined) panel.reveal(undefined, preserveFocus)
}

/**
 * Build the Webview document: a bare page embedding the harness at `url`.
 * The CSP allows only the loopback host as a frame source; the inner SPA keeps
 * its own origin and CSP, and its same-origin fetches pass the host trust fence.
 * @param url - the canonical loopback URL printed by the Web app.
 * @returns the Webview HTML document.
 */
function panelHtml(url: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:*; child-src http://127.0.0.1:*; style-src 'unsafe-inline';">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe src="${url}/" title="DeepSeek Harness" allow="clipboard-read; clipboard-write"></iframe>
</body>
</html>`
}

/** Replace the panel content when the host process exits. */
function stoppedHtml(code: number | null, signal: NodeJS.Signals | null): string {
  const reason = signal !== null ? `signal ${signal}` : `code ${code ?? 'null'}`
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);display:grid;place-items:center;height:100%;margin:0">
DeepSeek Harness stopped (${reason}). Run the <code>DeepSeek Harness: Open</code> command to restart.
</body>
</html>`
}
