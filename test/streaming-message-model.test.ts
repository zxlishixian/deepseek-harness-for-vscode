import { describe, expect, it } from 'vitest'
import { nextStreamText } from '../src/webview/streaming-message/model.js'

describe('smooth message streaming', () => {
  it('reveals small deltas progressively and eventually reaches the target', () => {
    let rendered = ''
    const target = 'DeepSeek is reasoning in a visible stream.'
    const frames: string[] = []
    while (rendered !== target) {
      rendered = nextStreamText(rendered, target)
      frames.push(rendered)
    }
    expect(frames.length).toBeGreaterThan(1)
    expect(frames.at(-1)).toBe(target)
  })

  it('repairs non-prefix updates immediately', () => {
    expect(nextStreamText('old content', 'replacement')).toBe('replacement')
  })
})
