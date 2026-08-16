export interface EditorSelectionView {
  /** Opaque host-issued identifier; the Webview never receives source text. */
  readonly id: string
  readonly file?: string
  readonly label: string
  readonly language: string
  readonly startLine: number
  readonly endLine: number
  readonly characterCount: number
  readonly tooLong?: boolean
}

export interface WorkspaceFileView {
  /** Opaque host-issued identifier used for reading and opening the file. */
  readonly id: string
  readonly path: string
  readonly label: string
  readonly folder?: string
}

export interface OpenWorkspaceFileRequest {
  readonly id?: string
  readonly path?: string
  readonly line?: number
  readonly column?: number
}
