import * as vscode from 'vscode'

const ARCHIVED_KEY = 'deepseekHarness.archivedSessionIds'

/**
 * Durable set of archived session ids, persisted in workspace state so the
 * archive survives reloads. Archiving only hides a session from the sidebar
 * (matching the official web client's registry-global archive set); it never
 * touches the Harness session log, which has no archive operation.
 */
export class SessionArchiveService implements vscode.Disposable {
  private readonly archived: Set<string>

  constructor(private readonly state: vscode.Memento) {
    this.archived = new Set(this.read())
  }

  isArchived(sessionId: string): boolean {
    return this.archived.has(sessionId)
  }

  archivedIds(): readonly string[] {
    return [...this.archived]
  }

  archive(sessionId: string): void {
    this.archived.add(sessionId)
    this.persist()
  }

  unarchive(sessionId: string): void {
    this.archived.delete(sessionId)
    this.persist()
  }

  dispose(): void {}

  private read(): string[] {
    const value: unknown = this.state.get(ARCHIVED_KEY, [])
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private persist(): void {
    void this.state.update(ARCHIVED_KEY, [...this.archived])
  }
}
