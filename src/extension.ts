import * as vscode from 'vscode'
import { ConfigurationService } from './config/configuration.js'
import { HarnessGatewayService } from './gateway/harness-gateway-service.js'
import { BundledRuntimeResolver } from './runtime/bundled-runtime.js'
import { HarnessHostRuntime } from './runtime/web-runtime.js'
import { CredentialStore } from './security/credential-store.js'
import { SessionArchiveService } from './session/session-archive-service.js'
import { WorkbenchViewProvider } from './ui/workbench-view-provider.js'

let activeRuntime: HarnessHostRuntime | undefined

/** Activates one self-contained Harness workbench; no external deployment is required. */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('DeepSeek Harness', { log: true })
  const configuration = new ConfigurationService()
  const credentials = new CredentialStore(context.secrets)
  const resolver = new BundledRuntimeResolver(context, (message, ...args) => vscode.l10n.t(message, ...args))
  const runtime = new HarnessHostRuntime(context, configuration, credentials, resolver, output)
  const gateway = new HarnessGatewayService(runtime, configuration, credentials, output)
  const sessionArchive = new SessionArchiveService(context.workspaceState)
  activeRuntime = runtime

  const setApiKey = async (): Promise<void> => {
    const value = await vscode.window.showInputBox({
      title: vscode.l10n.t('Configure DeepSeek API Key'),
      prompt: vscode.l10n.t('The key will be written to deepseekHarness.apiKey in your local VS Code user settings.json.'),
      password: true,
      ignoreFocusOut: true,
      validateInput: (input) => input.trim() === '' ? vscode.l10n.t('The API Key cannot be empty.') : undefined,
    })
    if (value === undefined) return
    await credentials.setApiKey(value.trim())
    await provider.refresh()
    void vscode.window.showInformationMessage(vscode.l10n.t('DeepSeek API Key was saved to the local VS Code settings.json.'))
  }

  const provider = new WorkbenchViewProvider(
    context.extensionUri,
    configuration,
    gateway,
    sessionArchive,
    {
      setApiKey,
      openSettings: async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'deepseekHarness')
      },
      showLogs: () => output.show(true),
    },
  )

  context.subscriptions.push(
    output,
    configuration,
    runtime,
    gateway,
    sessionArchive,
    provider,
    vscode.commands.registerCommand('deepseekHarness.openChat', () => { provider.createOrShowPanel() }),
    vscode.commands.registerCommand('deepseekHarness.reloadRuntime', () => provider.refresh()),
    vscode.commands.registerCommand('deepseekHarness.setApiKey', setApiKey),
    vscode.commands.registerCommand('deepseekHarness.clearApiKey', async () => {
      const clear = vscode.l10n.t('Clear')
      const answer = await vscode.window.showWarningMessage(
        vscode.l10n.t('Clear the DeepSeek API Key from the local VS Code settings.json?'),
        { modal: true },
        clear,
      )
      if (answer !== clear) return
      await credentials.clearApiKey()
      await provider.refresh()
    }),
    vscode.commands.registerCommand('deepseekHarness.showLogs', () => output.show(true)),
  )
}

export async function deactivate(): Promise<void> {
  await activeRuntime?.stop()
  activeRuntime = undefined
}
