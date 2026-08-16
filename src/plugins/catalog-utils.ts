/** Shared narrowing helpers for untrusted remote plugin metadata. */
export function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function safeHttpsUrl(value: unknown, hostname: string): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === hostname ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type CatalogFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
