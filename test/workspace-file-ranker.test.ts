import { describe, expect, it } from 'vitest'

import type { WorkspaceFileView } from '../src/editor/types.js'
import { rankWorkspaceFiles } from '../src/editor/workspace-file-ranker.js'

const files: readonly WorkspaceFileView[] = [
  { id: '1', path: 'src/ui/workbench-view-provider.ts', label: 'workbench-view-provider.ts' },
  { id: '2', path: 'src/webview/editor-context/component.ts', label: 'component.ts' },
  { id: '3', path: 'test/workbench-view-provider.test.ts', label: 'workbench-view-provider.test.ts' },
  { id: '4', path: 'package.json', label: 'package.json' },
]

describe('rankWorkspaceFiles', () => {
  it('prefers basename prefixes and still supports fuzzy subsequences', () => {
    expect(rankWorkspaceFiles(files, 'workbench').map((file) => file.id)).toEqual(['1', '3'])
    expect(rankWorkspaceFiles(files, 'edctx').map((file) => file.id)).toContain('2')
  })

  it('returns a bounded deterministic list for an empty @ query', () => {
    expect(rankWorkspaceFiles(files, '', 2).map((file) => file.id)).toEqual(['4', '1'])
  })
})
