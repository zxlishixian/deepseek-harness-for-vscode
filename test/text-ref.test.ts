import { describe, expect, it } from 'vitest'
import { scanTextRefs } from '../src/webview/text-ref.js'

const lexicon: ReadonlyMap<'/' | '@', readonly string[]> = new Map([
  ['/', ['compact', 'plan']],
  ['@', ['researcher', 'planner']],
])

describe('scanTextRefs', () => {
  it('matches a leading slash command against the lexicon', () => {
    expect(scanTextRefs('/compact', lexicon)).toEqual([{ start: 0, end: 8, trigger: '/' }])
  })

  it('matches an @ reference after whitespace', () => {
    expect(scanTextRefs('delegate to @researcher now', lexicon)).toEqual([
      { start: 12, end: 23, trigger: '@' },
    ])
  })

  it('ignores names that are not exact lexicon members', () => {
    expect(scanTextRefs('/compactly done', lexicon)).toEqual([])
    expect(scanTextRefs('@research the thing', lexicon)).toEqual([])
  })

  it('does not match a trigger embedded mid-word', () => {
    expect(scanTextRefs('x/plan', lexicon)).toEqual([])
    expect(scanTextRefs('foo@researcher', lexicon)).toEqual([])
  })

  it('matches both triggers and returns ranges in draft order', () => {
    const draft = '/plan then @planner and @researcher'
    expect(scanTextRefs(draft, lexicon)).toEqual([
      { start: 0, end: 5, trigger: '/' },
      { start: 11, end: 19, trigger: '@' },
      { start: 24, end: 35, trigger: '@' },
    ])
  })

  it('returns nothing for an empty draft or empty lexicon', () => {
    expect(scanTextRefs('', lexicon)).toEqual([])
    expect(scanTextRefs('/compact', new Map())).toEqual([])
  })
})
