import { describe, expect, it, vi } from 'vitest'
import { CuratedDshPluginSource, projectPluginRegistry } from '../src/plugins/curated-plugin-source.js'
import { GitHubDshPluginTopicSource, projectGitHubTopicResponse } from '../src/plugins/github-topic-source.js'
import { DshPluginCatalogService, mergePluginCatalog } from '../src/plugins/plugin-catalog.js'
import type { DshPluginCatalogContribution } from '../src/plugins/types.js'

const registry = {
  updated: '2026-08-14',
  categories: { tools: { en: 'Tools', zh: '工具' } },
  plugins: [
    {
      name: 'Shared Plugin', owner: 'alice', url: 'https://github.com/alice/shared-plugin',
      page: 'https://awesome-dsh-plugin.com/plugins/alice/shared-plugin', category: 'tools',
      description: { en: 'Curated English', zh: '精选中文介绍' }, npm: 'dsh-shared', stars: 2,
      install: 'dsh plugin --profile web add dsh-shared', added: '2026-08-01',
    },
    {
      name: 'Curated Only', owner: 'bob', url: 'https://github.com/bob/curated-only', category: 'tools',
      description: { en: 'Curated only' }, stars: 40,
      install: 'dsh plugin --profile web add github:bob/curated-only#v1',
    },
    {
      name: 'Untrusted URL', owner: 'mallory', url: 'https://example.com/plugin', category: 'tools',
      description: { en: 'Must be filtered' }, stars: 999,
      install: 'dsh plugin --profile web add safe-name',
    },
    {
      name: 'Unsafe command', owner: 'mallory', url: 'https://github.com/mallory/unsafe', category: 'tools',
      description: { en: 'Must be filtered' }, stars: 999,
      install: 'dsh plugin --profile web add safe-name && whoami',
    },
  ],
}

const githubSearch = {
  total_count: 3016,
  items: [
    {
      full_name: 'alice/shared-plugin', html_url: 'https://github.com/alice/shared-plugin',
      description: 'GitHub description', stargazers_count: 20, updated_at: '2026-08-15T12:00:00Z',
      archived: false, fork: false,
    },
    {
      full_name: 'carol/topic-only', html_url: 'https://github.com/carol/topic-only',
      description: 'Direct from topic', stargazers_count: 4, updated_at: '2026-08-15T13:00:00Z',
      archived: false, fork: false,
    },
    {
      full_name: 'old/archived', html_url: 'https://github.com/old/archived',
      description: 'Hidden', stargazers_count: 100, updated_at: '2026-08-15T14:00:00Z',
      archived: true, fork: false,
    },
  ],
}

describe('DSH plugin catalog sources', () => {
  it('validates and localizes the curated registry independently', () => {
    const contribution = projectPluginRegistry(registry, 'zh-cn')

    expect(contribution.source).toBe('curated')
    expect(contribution.categories).toEqual([{ id: 'tools', label: '工具' }])
    expect(contribution.plugins.map((plugin) => plugin.name)).toEqual(['Shared Plugin', 'Curated Only'])
    expect(contribution.plugins[0]).toMatchObject({
      description: '精选中文介绍', installSpec: 'dsh-shared', npmPackage: 'dsh-shared',
      catalogSource: 'curated', compatibility: 'agent',
    })
  })

  it('distinguishes Agent functionality from upstream Web UI-only entries', () => {
    const contribution = projectPluginRegistry({
      categories: {},
      plugins: [
        {
          name: 'Theme', owner: 'alice', url: 'https://github.com/alice/theme', category: 'theme',
          description: { en: 'A Web UI theme' }, stars: 1,
          install: 'dsh plugin --profile web add github:alice/theme',
        },
        {
          name: 'Memory', owner: 'bob', url: 'https://github.com/bob/memory', category: 'memory',
          description: { en: 'Memory tools with a settings page browser' }, stars: 1,
          install: 'dsh plugin --profile web add github:bob/memory',
        },
      ],
    }, 'en')

    expect(contribution.plugins.map((plugin) => plugin.compatibility)).toEqual(['official-web-ui', 'partial'])
  })

  it('projects the actual GitHub Topic response into installable repository specs', () => {
    const contribution = projectGitHubTopicResponse(githubSearch, 'en')

    expect(contribution.totalAvailable).toBe(3016)
    expect(contribution.plugins).toHaveLength(2)
    expect(contribution.plugins[1]).toMatchObject({
      name: 'topic-only', owner: 'carol', installSpec: 'github:carol/topic-only',
      category: 'github-topic', catalogSource: 'github-topic',
    })
  })

  it('merges duplicate repositories while preserving curated install metadata', () => {
    const catalog = mergePluginCatalog([
      projectGitHubTopicResponse(githubSearch, 'zh-cn'),
      projectPluginRegistry(registry, 'zh-cn'),
    ])

    expect(catalog.topicRepositoryCount).toBe(3016)
    expect(catalog.plugins.map((plugin) => plugin.name)).toEqual(['topic-only', 'Shared Plugin', 'Curated Only'])
    expect(catalog.plugins[1]).toMatchObject({
      installSpec: 'dsh-shared', npmPackage: 'dsh-shared', stars: 20,
      description: '精选中文介绍', catalogSource: 'both', compatibility: 'agent',
    })
  })

  it('keeps the marketplace usable when either remote source is unavailable', async () => {
    const github = projectGitHubTopicResponse(githubSearch, 'en')
    const failingSource = { load: vi.fn(async (): Promise<DshPluginCatalogContribution> => { throw new Error('offline') }) }
    const workingSource = { load: vi.fn(async () => github) }
    const service = new DshPluginCatalogService(workingSource, failingSource)

    const catalog = await service.load('en')
    expect(catalog.plugins).toHaveLength(2)
    expect(catalog.topicRepositoryCount).toBe(3016)
  })

  it('caches both remote adapters and supports explicit refresh', async () => {
    const curatedFetch = vi.fn(async () => jsonResponse(registry))
    const githubFetch = vi.fn(async () => jsonResponse(githubSearch))
    const curated = new CuratedDshPluginSource(curatedFetch)
    const github = new GitHubDshPluginTopicSource(githubFetch)

    await curated.load('en'); await curated.load('zh-cn'); await curated.load('en', true)
    await github.load('en'); await github.load('zh-cn'); await github.load('en', true)

    expect(curatedFetch).toHaveBeenCalledTimes(2)
    expect(githubFetch).toHaveBeenCalledTimes(2)
  })

  it('fails only when every marketplace source fails', async () => {
    const failing = { load: vi.fn(async (): Promise<DshPluginCatalogContribution> => { throw new Error('offline') }) }
    await expect(new DshPluginCatalogService(failing, failing).load('en')).rejects.toThrow('Could not load')
  })
})

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}
