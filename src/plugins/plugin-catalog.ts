import { CuratedDshPluginSource, projectPluginRegistry } from './curated-plugin-source.js'
import { GitHubDshPluginTopicSource } from './github-topic-source.js'
import type { DshPluginCatalogContribution, DshPluginCatalogItem, DshPluginCatalogSnapshot } from './types.js'

const REGISTRY_PAGE = 'https://awesome-dsh-plugin.com/'
const TOPIC_URL = 'https://github.com/topics/dsh-plugin'

export interface DshPluginSource {
  load(language: string, force?: boolean): Promise<DshPluginCatalogContribution>
}

/** Combines the real GitHub Topic with curated translations and install metadata. */
export class DshPluginCatalogService {
  constructor(
    private readonly githubTopic: DshPluginSource = new GitHubDshPluginTopicSource(),
    private readonly curated: DshPluginSource = new CuratedDshPluginSource(),
  ) {}

  async load(language: string, force = false): Promise<DshPluginCatalogSnapshot> {
    const results = await Promise.allSettled([
      this.githubTopic.load(language, force),
      this.curated.load(language, force),
    ])
    const contributions = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    if (contributions.length === 0) {
      const details = results.flatMap((result) => result.status === 'rejected' ? [String(result.reason)] : []).join('\n')
      throw new Error(`Could not load the DSH plugin marketplace.\n${details}`)
    }
    return mergePluginCatalog(contributions)
  }
}

/** Deterministically merges the two independently validated remote sources. */
export function mergePluginCatalog(contributions: readonly DshPluginCatalogContribution[]): DshPluginCatalogSnapshot {
  const topic = contributions.find((item) => item.source === 'github-topic')
  const curated = contributions.find((item) => item.source === 'curated')
  const plugins = new Map<string, DshPluginCatalogItem>()
  for (const plugin of topic?.plugins ?? []) plugins.set(plugin.id, plugin)
  for (const plugin of curated?.plugins ?? []) {
    const existing = plugins.get(plugin.id)
    plugins.set(plugin.id, existing === undefined ? plugin : {
      ...existing,
      ...plugin,
      stars: Math.max(existing.stars, plugin.stars),
      ...(existing.updatedAt === undefined ? {} : { updatedAt: existing.updatedAt }),
      catalogSource: 'both',
    })
  }
  const merged = [...plugins.values()].sort((left, right) => {
    const recency = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
    return recency !== 0 ? recency : right.stars - left.stars || left.name.localeCompare(right.name)
  })
  const categories = new Map<string, string>()
  for (const contribution of contributions) {
    for (const category of contribution.categories) categories.set(category.id, category.label)
  }
  const updated = [topic?.updated, curated?.updated].filter((item): item is string => item !== undefined).sort().at(-1)
  return {
    source: 'github-topic+awesome-dsh-plugin',
    sourceUrl: TOPIC_URL,
    topicUrl: TOPIC_URL,
    curatedSourceUrl: REGISTRY_PAGE,
    ...(topic?.totalAvailable === undefined ? {} : { topicRepositoryCount: topic.totalAvailable }),
    ...(updated === undefined ? {} : { updated }),
    categories: [...categories].map(([id, label]) => ({ id, label })),
    plugins: merged,
  }
}

export { projectPluginRegistry }
