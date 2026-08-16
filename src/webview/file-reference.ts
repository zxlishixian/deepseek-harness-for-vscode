export interface FileReference {
  readonly path: string
  readonly line?: number
  readonly column?: number
}

export interface LocatedFileReference extends FileReference {
  readonly start: number
  readonly end: number
}

const FILE_REFERENCE_PATTERN = /(?:(?:(?:[a-z]:)?[\\/]|\.{1,2}[\\/]|[\w@+-]+[\\/])(?:[\w@+.-]+[\\/])*[\w@+.-]+|[\w@+-]+\.[a-z][a-z0-9._-]{0,15})(?::\d+(?::\d+|-\d+)?|#L\d+(?:C\d+)?(?:-L\d+(?:C\d+)?)?)?/giu

/** Parses model-produced workspace references such as src/app.ts:12:4. */
export function parseFileReference(raw: string): FileReference | undefined {
  const decoded = decodeReference(raw.trim())
  if (decoded === undefined || decoded === '' || hasExternalScheme(decoded)) return undefined
  const unwrapped = unwrap(decoded.replace(/^@/u, ''))
  const hash = /^(.*)#L(\d+)(?:C(\d+))?(?:-L\d+(?:C\d+)?)?$/iu.exec(unwrapped)
  if (hash !== null) return result(hash[1], hash[2], hash[3])
  const lineAndColumn = /^(.*):(\d+):(\d+)$/u.exec(unwrapped)
  if (lineAndColumn !== null) return result(lineAndColumn[1], lineAndColumn[2], lineAndColumn[3])
  const lineRange = /^(.*):(\d+)-\d+$/u.exec(unwrapped)
  if (lineRange !== null) return result(lineRange[1], lineRange[2], undefined)
  const lineOnly = /^(.*):(\d+)$/u.exec(unwrapped)
  if (lineOnly !== null) return result(lineOnly[1], lineOnly[2], undefined)
  return looksLikeFile(unwrapped) ? { path: unwrapped } : undefined
}

/** Finds plain-text file references without interpreting surrounding prose. */
export function findFileReferences(source: string): readonly LocatedFileReference[] {
  return [...source.matchAll(FILE_REFERENCE_PATTERN)].flatMap((match): LocatedFileReference[] => {
    const raw = match[0].replace(/[.,;!?]+$/u, '')
    const reference = parseFileReference(raw)
    if (reference === undefined || match.index === undefined) return []
    return [{ ...reference, start: match.index, end: match.index + raw.length }]
  })
}

function result(path: string | undefined, line: string | undefined, column: string | undefined): FileReference | undefined {
  if (path === undefined || !looksLikeFile(path)) return undefined
  const parsedLine = positiveInteger(line)
  const parsedColumn = positiveInteger(column)
  return {
    path,
    ...(parsedLine === undefined ? {} : { line: parsedLine }),
    ...(parsedColumn === undefined ? {} : { column: parsedColumn }),
  }
}

function looksLikeFile(value: string): boolean {
  if (value === '' || /[\n\r\t]/u.test(value) || value.endsWith('/')) return false
  const basename = value.split(/[\\/]/u).pop() ?? ''
  return value.includes('/')
    || value.includes('\\')
    || /^\.?[\w@+-]+\.[a-z][a-z0-9._-]{0,15}$/iu.test(basename)
    || /^(?:Dockerfile|Makefile|Procfile|README|LICENSE)$/iu.test(basename)
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function unwrap(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value.at(-1)
  return (first === '"' && last === '"') || (first === "'" && last === "'") || (first === '<' && last === '>')
    ? value.slice(1, -1)
    : value
}

function decodeReference(value: string): string | undefined {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function hasExternalScheme(value: string): boolean {
  // A Windows drive prefix is a path, not a URI scheme.
  return /^[a-z][a-z0-9+.-]*:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)
}
