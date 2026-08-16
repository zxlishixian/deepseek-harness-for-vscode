import { describe, expect, it } from 'vitest'

import { findFileReferences, parseFileReference } from '../src/webview/file-reference.js'

describe('parseFileReference', () => {
  it('parses relative, absolute, Windows, and line-anchor references', () => {
    expect(parseFileReference('src/extension.ts:41:7')).toEqual({ path: 'src/extension.ts', line: 41, column: 7 })
    expect(parseFileReference('/repo/src/app.ts#L12-L18')).toEqual({ path: '/repo/src/app.ts', line: 12 })
    expect(parseFileReference('src/app.ts:12-18')).toEqual({ path: 'src/app.ts', line: 12 })
    expect(parseFileReference('C:\\repo\\src\\app.ts:9:3')).toEqual({ path: 'C:\\repo\\src\\app.ts', line: 9, column: 3 })
    expect(parseFileReference('package.json')).toEqual({ path: 'package.json' })
  })

  it('does not turn external URLs or ordinary labels into workspace links', () => {
    expect(parseFileReference('https://example.com/src/app.ts')).toBeUndefined()
    expect(parseFileReference('reasoning-process')).toBeUndefined()
    expect(findFileReferences('Release v0.4.4 is ready.')).toEqual([])
  })
})

describe('findFileReferences', () => {
  it('locates clickable references in ordinary model prose', () => {
    const source = 'Update src/ui/view.ts:27, then verify package.json.'

    expect(findFileReferences(source)).toEqual([
      { path: 'src/ui/view.ts', line: 27, start: 7, end: 24 },
      { path: 'package.json', start: 38, end: 50 },
    ])
  })
})
