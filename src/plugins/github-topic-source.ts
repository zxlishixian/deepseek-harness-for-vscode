import { isRecord, nonEmptyText, nonNegativeInteger, safeHttpsUrl, type CatalogFetcher } from './catalog-utils.js'
import type { DshPluginCatalogContribution, DshPluginCatalogItem } from './types.js'

const SEARCH_URL = 'https://api.github.com/search/repositories?q=topic%3Adsh-plugin&sort=updated&order=desc&per_page=100&page=1'
const CACHE_TTL_MS = 15 * 60 * 1_000

/** Reads the actual `dsh-plugin` GitHub Topic through GitHub's public API. */
export class GitHubDshPluginTopicSource {
  private cached: { readonly at: number; readonly value: unknown } | undefined

  constructor(private readonly fetcher: CatalogFetcher = globalThis.fetch) {}

  async load(language: string, force = false): Promise<DshPluginCatalogContribution> {
    if (!force && this.cached !== undefined && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return projectGitHubTopicResponse(this.cached.value, language)
    }
    const response = await this.fetcher(SEARCH_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'deepseek-harness-for-vscode',
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`GitHub dsh-plugin topic request failed: HTTP ${response.status}`)
    const value: unknown = await response.json()
    const projected = projectGitHubTopicResponse(value, language)
    this.cached = { at: Date.now(), value }
    return projected
  }
}

/** Converts GitHub search results into directly installable DSH package cards. */
export function projectGitHubTopicResponse(value: unknown, language: string): DshPluginCatalogContribution {
  if (!isRecord(value) || !Array.isArray(value.items)) throw new Error('GitHub returned an invalid dsh-plugin topic response.')
  const categoryLabel = language.toLowerCase().startsWith('zh') ? 'GitHub Topic' : 'GitHub Topic'
  const plugins = value.items.flatMap((item): DshPluginCatalogItem[] => {
    if (!isRecord(item) || item.archived === true || item.fork === true) return []
    const fullName = nonEmptyText(item.full_name)
    const repositoryUrl = safeHttpsUrl(item.html_url, 'github.com')
    if (fullName === undefined || repositoryUrl === undefined || !/^[^/\s]+\/[^/\s]+$/u.test(fullName)) return []
    const [owner, repository] = fullName.split('/')
    if (owner === undefined || repository === undefined) return []
    const updatedAt = nonEmptyText(item.updated_at)
    return [{
      id: repositoryUrl.toLowerCase(),
      name: repository,
      owner,
      description: nonEmptyText(item.description) ?? '',
      category: 'github-topic',
      repositoryUrl,
      installSpec: `github:${fullName}`,
      stars: nonNegativeInteger(item.stargazers_count),
      ...(updatedAt === undefined ? {} : { updatedAt }),
      catalogSource: 'github-topic',
      compatibility: 'unknown',
    }]
  })
  const updated = plugins.map((plugin) => plugin.updatedAt).filter((item): item is string => item !== undefined).sort().at(-1)
  return {
    source: 'github-topic',
    categories: [{ id: 'github-topic', label: categoryLabel }],
    plugins,
    totalAvailable: nonNegativeInteger(value.total_count),
    ...(updated === undefined ? {} : { updated }),
  }
}
