import { describe, expect, it } from 'vitest'

import { markdownMarkup } from '../src/webview/markdown.js'

describe('markdownMarkup', () => {
  it('renders the message structures used by Harness replies', () => {
    const html = markdownMarkup([
      '# 标题',
      '',
      '- 普通项目',
      '- **强调项目**',
      '',
      '> 引用',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '| 名称 | 值 |',
      '| --- | --- |',
      '| answer | `42` |',
    ].join('\n'))

    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>强调项目</strong>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<code class="language-ts">')
    expect(html).toContain('<table>')
  })

  it('keeps raw HTML inert and does not create remote image elements', () => {
    const html = markdownMarkup([
      '<script>alert("unsafe")</script>',
      '',
      '![tracking pixel](https://example.com/pixel.png)',
      '',
      '[unsafe link](javascript:alert%281%29)',
    ].join('\n'))

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:')
  })

  it('linkifies bare web addresses', () => {
    const html = markdownMarkup('查看 https://example.com/docs')

    expect(html).toContain('<a href="https://example.com/docs">https://example.com/docs</a>')
  })
})
