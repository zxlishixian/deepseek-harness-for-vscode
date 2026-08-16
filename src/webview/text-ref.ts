/**
 * Plain-text reference scan (the official Harness composer's "text-ref"
 * decision): a `/name` or `@name` token whose name is on the trigger's lexicon
 * draws as a chip-like highlight over the draft's own glyphs. Zero DOM — the
 * composer backdrop renders the instructions; tests drive this directly.
 */

/** A half-open [start, end) range in the draft plus the trigger that matched it. */
export interface TextRefRange {
  readonly start: number
  readonly end: number
  readonly trigger: '/' | '@'
}

/**
 * Trigger matcher: a trigger char at line start or after whitespace, then a
 * word-ish name that never crosses a newline. `x/name` never matches.
 */
const TEXT_REF_RE = /(^|\s)([/@])([\w-]+)/g

/**
 * Scan the draft for plain-text reference tokens against the hot lexicons.
 * Word-boundary discipline: the trigger must sit at the draft start or after
 * whitespace, and the name must be an exact lexicon member for that trigger.
 * @param draft - draft text.
 * @param lexicon - per-trigger name lists (a missing trigger scans nothing).
 * @returns matched ranges in draft order.
 */
export function scanTextRefs(
  draft: string, lexicon: ReadonlyMap<'/' | '@', readonly string[]>,
): readonly TextRefRange[] {
  if (lexicon.size === 0 || draft === '') return []
  const out: TextRefRange[] = []
  TEXT_REF_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TEXT_REF_RE.exec(draft)) !== null) {
    const trigger = match[2] as '/' | '@'
    const name = match[3] ?? ''
    if (lexicon.get(trigger)?.includes(name)) {
      const start = match.index + (match[1]?.length ?? 0)
      out.push({ start, end: start + 1 + name.length, trigger })
    }
  }
  return out
}
