import * as vscode from 'vscode'
import type { HarnessGatewayService } from '../gateway/harness-gateway-service.js'
import type { DshPluginCatalogService } from './plugin-catalog.js'
import type { DshPluginManager } from './plugin-manager.js'
import type { DshPluginCenterSnapshot } from './types.js'

/** Extension Host application controller for plugin-center user workflows. */
export class DshPluginCenterController implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<DshPluginCenterSnapshot>()
  private snapshot: DshPluginCenterSnapshot = { installed: [], busy: false }

  readonly onDidChange = this.changeEmitter.event

  constructor(
    private readonly manager: DshPluginManager,
    private readonly catalog: DshPluginCatalogService,
    private readonly gateway: HarnessGatewayService,
  ) {}

  dispose(): void {
    this.changeEmitter.dispose()
  }

  async load(force: boolean): Promise<void> {
    this.update(pendingSnapshot(this.snapshot))
    const [catalog, installed] = await Promise.allSettled([
      this.catalog.load(vscode.env.language, force),
      this.manager.listInstalled(),
    ])
    const errors = [catalog, installed].flatMap((result) => result.status === 'rejected' ? [errorText(result.reason)] : [])
    this.update({
      ...(catalog.status === 'fulfilled'
        ? { catalog: catalog.value }
        : this.snapshot.catalog === undefined ? {} : { catalog: this.snapshot.catalog }),
      installed: installed.status === 'fulfilled' ? installed.value : this.snapshot.installed,
      busy: false,
      ...(errors.length === 0 ? {} : { error: errors.join('\n') }),
    })
  }

  async install(spec: string, name: string | undefined, repositoryUrl: string | undefined): Promise<void> {
    const install = vscode.l10n.t('Install')
    const label = name ?? spec
    const detail = [
      vscode.l10n.t('Third-party DSH plugins run outside the Agent sandbox and can access files, credentials, commands, and the network.'),
      vscode.l10n.t('Review the source before installing. UI contributions made for the official DSH Web client may not appear in this native workbench.'),
      repositoryUrl === undefined ? undefined : vscode.l10n.t('Source: {0}', repositoryUrl),
      vscode.l10n.t('Package: {0}', spec),
    ].filter((line): line is string => line !== undefined).join('\n\n')
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('Install DSH plugin “{0}”?', label),
      { modal: true, detail },
      install,
    )
    if (answer !== install) return
    await this.mutate(
      async () => { await this.manager.install(spec) },
      vscode.l10n.t('DSH plugin installed: {0}', label),
    )
  }

  async remove(name: string): Promise<void> {
    const remove = vscode.l10n.t('Remove')
    const answer = await vscode.window.showWarningMessage(
      vscode.l10n.t('Remove DSH plugin “{0}”?', name),
      { modal: true, detail: vscode.l10n.t('Harness will restart after the profile is updated.') },
      remove,
    )
    if (answer !== remove) return
    await this.mutate(
      async () => { await this.manager.remove(name) },
      vscode.l10n.t('DSH plugin removed: {0}', name),
    )
  }

  private async mutate(mutation: () => Promise<void>, successMessage: string): Promise<void> {
    this.update(pendingSnapshot(this.snapshot))
    try {
      await this.gateway.mutateRuntime(mutation)
      void vscode.window.showInformationMessage(successMessage)
      await this.load(false)
    } catch (cause) {
      this.update({ ...this.snapshot, busy: false, error: errorText(cause) })
      throw cause
    }
  }

  private update(snapshot: DshPluginCenterSnapshot): void {
    this.snapshot = snapshot
    this.changeEmitter.fire(snapshot)
  }
}

function pendingSnapshot(snapshot: DshPluginCenterSnapshot): DshPluginCenterSnapshot {
  return {
    ...(snapshot.catalog === undefined ? {} : { catalog: snapshot.catalog }),
    installed: snapshot.installed,
    busy: true,
  }
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
