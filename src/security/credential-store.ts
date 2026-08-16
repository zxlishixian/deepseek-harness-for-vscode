import * as vscode from 'vscode'

const API_KEY_SECRET = 'deepseekHarness.apiKey'

/**
 * Stores the key in local VS Code user settings as requested by the extension
 * contract. SecretStorage is retained only to migrate installations of v0.1.0.
 */
export class CredentialStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('deepseekHarness')
      .get<string>('apiKey', '').trim()
    if (configured !== '') return configured

    const legacy = await this.secrets.get(API_KEY_SECRET)
    if (legacy === undefined || legacy.trim() === '') return undefined
    await this.setApiKey(legacy.trim())
    return legacy.trim()
  }

  async setApiKey(value: string): Promise<void> {
    await vscode.workspace.getConfiguration('deepseekHarness')
      .update('apiKey', value, vscode.ConfigurationTarget.Global)
    await this.secrets.delete(API_KEY_SECRET)
  }

  async clearApiKey(): Promise<void> {
    await vscode.workspace.getConfiguration('deepseekHarness')
      .update('apiKey', undefined, vscode.ConfigurationTarget.Global)
    await this.secrets.delete(API_KEY_SECRET)
  }
}
