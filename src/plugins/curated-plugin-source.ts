import { isRecord, nonEmptyText, nonNegativeInteger, safeHttpsUrl, type CatalogFetcher } from './catalog-utils.js'
import { registryInstallSpec } from './plugin-spec.js'
import type { DshPluginCatalogContribution, DshPluginCatalogItem } from './types.js'

const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const CACHE_TTL_MS = 15 * 60 * 1_000

/** Community-curated metadata source used for categories and translations. */
export class CuratedDshPluginSource {
  private cached: { readonly at: number; readonly value: unknown } | undefined

  constructor(private readonly fetcher: CatalogFetcher = globalThis.fetch) {}

  async load(language: string, force = false): Promise<DshPluginCatalogContribution> {
    if (!force && this.cached !== undefined && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return projectPluginRegistry(this.cached.value, language)
    }
    const response = await this.fetcher(REGISTRY_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`Curated plugin registry request failed: HTTP ${response.status}`)
    const value: unknown = await response.json()
    const projected = projectPluginRegistry(value, language)
    this.cached = { at: Date.now(), value }
    return projected
  }
}

/** Narrows the community registry into a trusted catalog contribution. */
export function projectPluginRegistry(value: unknown, language: string): DshPluginCatalogContribution {
  if (!isRecord(value) || !Array.isArray(value.plugins)) throw new Error('The DSH plugin registry returned an invalid document.')
  const preferredLanguage = language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const categories = isRecord(value.categories)
    ? Object.entries(value.categories).flatMap(([id, labels]) => {
      if (!isRecord(labels)) return []
      return [{ id, label: nonEmptyText(labels[preferredLanguage]) ?? nonEmptyText(labels.en) ?? id }]
    })
    : []
  const plugins = value.plugins.flatMap((item): DshPluginCatalogItem[] => {
    if (!isRecord(item)) return []
    const name = nonEmptyText(item.name)
    const owner = nonEmptyText(item.owner)
    const repositoryUrl = safeHttpsUrl(item.url, 'github.com')
    const installSpec = registryInstallSpec(item.install)
    const descriptions = isRecord(item.description) ? item.description : undefined
    const description = descriptions === undefined
      ? ''
      : nonEmptyText(descriptions[preferredLanguage]) ?? nonEmptyText(descriptions.en) ?? ''
    if (name === undefined || owner === undefined || repositoryUrl === undefined || installSpec === undefined) return []
    const detailsUrl = safeHttpsUrl(item.page, 'awesome-dsh-plugin.com')
    const npmPackage = nonEmptyText(item.npm)
    const added = nonEmptyText(item.added)
    return [{
      id: repositoryUrl.toLowerCase(),
      name,
      owner,
      description,
      category: nonEmptyText(item.category) ?? 'other',
      repositoryUrl,
      ...(detailsUrl === undefined ? {} : { detailsUrl }),
      installSpec,
      ...(npmPackage === undefined ? {} : { npmPackage }),
      stars: nonNegativeInteger(item.stars),
      ...(added === undefined ? {} : { added }),
      catalogSource: 'curated',
      compatibility: pluginCompatibility(nonEmptyText(item.category), description),
    }]
  })
  const updated = nonEmptyText(value.updated)
  return {
    source: 'curated',
    categories,
    plugins,
    ...(updated === undefined ? {} : { updated }),
  }
}

function pluginCompatibility(category: string | undefined, description: string): DshPluginCatalogItem['compatibility'] {
  if (category === 'ui' || category === 'theme') return 'official-web-ui'
  return /\b(?:web ui|web client|settings? (?:ui|page|panel))\b|设置页|网页界面|浏览器界面/iu.test(description)
    ? 'partial'
    : 'agent'
}
