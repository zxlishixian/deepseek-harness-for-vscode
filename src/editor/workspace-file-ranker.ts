import type { WorkspaceFileView } from './types.js'

/** Deterministic fuzzy ranking shared by every @-file query. */
export function rankWorkspaceFiles(
  files: readonly WorkspaceFileView[],
  query: string,
  limit = 20,
): readonly WorkspaceFileView[] {
  const needle = normalize(query)
  return files
    .map((file) => ({ file, score: scoreFile(file, needle) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score
      || left.file.path.length - right.file.path.length
      || left.file.path.localeCompare(right.file.path))
    .slice(0, limit)
    .map((item) => item.file)
}

function scoreFile(file: WorkspaceFileView, query: string): number {
  if (query === '') return file.path.length
  const target = normalize(file.path)
  const basename = normalize(file.label)
  if (target === query) return 0
  if (basename === query) return 2
  if (basename.startsWith(query)) return 8 + basename.length - query.length
  if (target.startsWith(query)) return 18 + target.length - query.length
  const basenameIndex = basename.indexOf(query)
  if (basenameIndex >= 0) return 30 + basenameIndex + basename.length / 100
  const pathIndex = target.indexOf(query)
  if (pathIndex >= 0) return 45 + pathIndex + target.length / 100
  const subsequence = subsequenceGap(target, query)
  return subsequence === undefined ? Number.POSITIVE_INFINITY : 70 + subsequence + target.length / 100
}

function subsequenceGap(target: string, query: string): number | undefined {
  let queryIndex = 0
  let first = -1
  let last = -1
  for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
    if (target[index] !== query[queryIndex]) continue
    if (first < 0) first = index
    last = index
    queryIndex += 1
  }
  return queryIndex === query.length ? last - first - query.length + 1 : undefined
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll('\\', '/')
}
