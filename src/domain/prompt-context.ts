/** Text context that is prepended to a Harness prompt. */
export interface PromptAttachment {
  readonly kind: 'selection' | 'file'
  readonly file?: string
  readonly text: string
  readonly startLine?: number
  readonly endLine?: number
  readonly tooLong?: boolean
}
