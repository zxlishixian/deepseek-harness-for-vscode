/** Pretty-prints a JSON value, tolerating already-serialized strings and raw shapes. */
export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), undefined, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, undefined, 2)
  } catch {
    return String(value)
  }
}
