import { createHash } from 'node:crypto'
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { PromptAttachment } from '../domain/prompt-context.js'
import { rankWorkspaceFiles } from './workspace-file-ranker.js'
import type { OpenWorkspaceFileRequest, WorkspaceFileView } from './types.js'

const MAX_INDEXED_FILES = 5_000
const MAX_ATTACHED_FILES = 8
const MAX_FILE_CHARS = 80_000
const MAX_TOTAL_FILE_CHARS = 240_000
const FILE_INDEX_TTL_MS = 20_000
const FILE_EXCLUDE = '**/{.git,node_modules,.pnpm-store,.yarn,dist,out,build,coverage,.next,.cache}/**'

interface IndexedFile {
  readonly view: WorkspaceFileView
  readonly uri: vscode.Uri
}

/** Workspace-owned file search, attachment reads, and safe editor navigation. */
export class WorkspaceFileService implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[]
  private readonly filesById = new Map<string, IndexedFile>()
  private index: readonly IndexedFile[] = []
  private indexedAt = 0
  private indexing: Promise<readonly IndexedFile[]> | undefined

  constructor() {
    const invalidate = (): void => { this.indexedAt = 0 }
    this.subscriptions = [
      vscode.workspace.onDidCreateFiles(invalidate),
      vscode.workspace.onDidDeleteFiles(invalidate),
      vscode.workspace.onDidRenameFiles(invalidate),
    ]
  }

  async search(query: string): Promise<readonly WorkspaceFileView[]> {
    const files = await this.ensureIndex()
    const ranked = rankWorkspaceFiles(files.map((file) => file.view), query)
    if (query.trim() !== '') return ranked

    // Empty @ menus start with the active/open editors, then fall back to the
    // deterministic workspace ranking. This mirrors the files users are most
    // likely to reference before they type a query.
    const activeId = vscode.window.activeTextEditor === undefined
      ? undefined
      : fileId(vscode.window.activeTextEditor.document.uri)
    const openIds = [
      ...(activeId === undefined ? [] : [activeId]),
      ...vscode.workspace.textDocuments.map((document) => fileId(document.uri)),
    ]
    const recent = [...new Set(openIds)]
      .map((id) => this.filesById.get(id)?.view)
      .filter((file): file is WorkspaceFileView => file !== undefined)
    const recentIds = new Set(recent.map((file) => file.id))
    return [...recent, ...ranked.filter((file) => !recentIds.has(file.id))].slice(0, 20)
  }

  /** Reads only files selected from a host-issued @ suggestion. */
  async attachments(ids: readonly string[]): Promise<readonly PromptAttachment[]> {
    const uniqueIds = [...new Set(ids)].slice(0, MAX_ATTACHED_FILES)
    const attachments: PromptAttachment[] = []
    let remaining = MAX_TOTAL_FILE_CHARS
    for (const id of uniqueIds) {
      if (remaining <= 0) break
      const indexed = this.filesById.get(id)
      if (indexed === undefined || vscode.workspace.getWorkspaceFolder(indexed.uri) === undefined) continue
      const bytes = await vscode.workspace.fs.readFile(indexed.uri)
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      if (raw.slice(0, 8_192).includes('\0')) {
        throw new Error(vscode.l10n.t('Cannot attach binary file: {0}', indexed.view.path))
      }
      const limit = Math.min(MAX_FILE_CHARS, remaining)
      const tooLong = raw.length > limit
      const text = tooLong ? raw.slice(0, limit) : raw
      remaining -= text.length
      attachments.push({
        kind: 'file',
        file: indexed.view.path,
        text,
        ...(tooLong ? { tooLong: true } : {}),
      })
    }
    return attachments
  }

  async open(request: OpenWorkspaceFileRequest): Promise<boolean> {
    const indexed = request.id === undefined ? undefined : this.filesById.get(request.id)
    const uri = request.id === undefined
      ? await resolveWorkspaceReference(request.path)
      : indexed !== undefined && vscode.workspace.getWorkspaceFolder(indexed.uri) !== undefined ? indexed.uri : undefined
    if (uri === undefined) return false
    const document = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(document, { preview: true })
    const requestedLine = Math.max(1, request.line ?? 1)
    const line = Math.min(requestedLine - 1, Math.max(0, document.lineCount - 1))
    const lineLength = document.lineAt(line).text.length
    const requestedColumn = Math.max(1, request.column ?? 1)
    const column = Math.min(requestedColumn - 1, lineLength)
    const position = new vscode.Position(line, column)
    editor.selection = new vscode.Selection(position, position)
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    return true
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose()
  }

  private async ensureIndex(): Promise<readonly IndexedFile[]> {
    if (Date.now() - this.indexedAt < FILE_INDEX_TTL_MS && this.index.length > 0) return this.index
    if (this.indexing !== undefined) return this.indexing
    this.indexing = this.buildIndex().finally(() => { this.indexing = undefined })
    return this.indexing
  }

  private async buildIndex(): Promise<readonly IndexedFile[]> {
    const uris = await vscode.workspace.findFiles('**/*', FILE_EXCLUDE, MAX_INDEXED_FILES)
    const folders = vscode.workspace.workspaceFolders ?? []
    const indexed = uris.flatMap((uri): IndexedFile[] => {
      const folder = vscode.workspace.getWorkspaceFolder(uri)
      if (folder === undefined) return []
      const relative = relativeUriPath(folder.uri, uri)
      if (relative === undefined || relative === '') return []
      const displayPath = folders.length > 1 ? `${folder.name}/${relative}` : relative
      const id = fileId(uri)
      return [{
        uri,
        view: {
          id,
          path: displayPath,
          label: relative.split('/').pop() ?? relative,
          ...(folders.length > 1 ? { folder: folder.name } : {}),
        },
      }]
    })
    for (const file of indexed) this.filesById.set(file.view.id, file)
    this.index = indexed
    this.indexedAt = Date.now()
    return indexed
  }
}

async function resolveWorkspaceReference(raw: string | undefined): Promise<vscode.Uri | undefined> {
  const reference = raw?.trim()
  if (reference === undefined || reference === '' || reference.includes('\0')) return undefined
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return undefined

  if (path.isAbsolute(reference)) {
    const candidate = path.resolve(reference)
    const folder = folders.find((item) => item.uri.scheme === 'file' && isWithin(item.uri.fsPath, candidate))
    return folder === undefined ? undefined : existingFile(vscode.Uri.file(candidate))
  }

  const segments = reference.replaceAll('\\', '/').split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.length === 0 || segments.includes('..')) return undefined
  const matchingFolder = folders.length > 1 && segments[0] !== undefined
    ? folders.find((folder) => folder.name === segments[0])
    : undefined
  const candidates = matchingFolder === undefined
    ? folders.map((folder) => vscode.Uri.joinPath(folder.uri, ...segments))
    : [vscode.Uri.joinPath(matchingFolder.uri, ...segments.slice(1))]
  for (const candidate of candidates) {
    if (await existingFile(candidate) !== undefined) return candidate
  }
  return undefined
}

async function existingFile(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri)
    return (stat.type & vscode.FileType.Directory) === 0 ? uri : undefined
  } catch {
    return undefined
  }
}

function relativeUriPath(root: vscode.Uri, target: vscode.Uri): string | undefined {
  if (root.scheme !== target.scheme || root.authority !== target.authority) return undefined
  const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`
  if (!target.path.startsWith(prefix)) return undefined
  return target.path.slice(prefix.length)
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function fileId(uri: vscode.Uri): string {
  return createHash('sha256').update(uri.toString()).digest('hex').slice(0, 24)
}
