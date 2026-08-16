export interface DshPluginCategory {
  readonly id: string
  readonly label: string
}

export interface DshPluginCatalogItem {
  readonly id: string
  readonly name: string
  readonly owner: string
  readonly description: string
  readonly category: string
  readonly repositoryUrl: string
  readonly detailsUrl?: string
  readonly installSpec: string
  readonly npmPackage?: string
  readonly stars: number
  readonly added?: string
  readonly updatedAt?: string
  readonly catalogSource: 'github-topic' | 'curated' | 'both'
  /** Best-effort compatibility derived from validated catalog metadata. */
  readonly compatibility: 'agent' | 'partial' | 'official-web-ui' | 'unknown'
}

export interface DshPluginCatalogSnapshot {
  readonly source: 'github-topic+awesome-dsh-plugin'
  readonly sourceUrl: string
  readonly topicUrl: string
  readonly curatedSourceUrl: string
  /** Total repositories reported by GitHub, including entries not loaded yet. */
  readonly topicRepositoryCount?: number
  readonly updated?: string
  readonly categories: readonly DshPluginCategory[]
  readonly plugins: readonly DshPluginCatalogItem[]
}

/** Validated contribution produced by one remote catalog adapter. */
export interface DshPluginCatalogContribution {
  readonly source: 'github-topic' | 'curated'
  readonly categories: readonly DshPluginCategory[]
  readonly plugins: readonly DshPluginCatalogItem[]
  readonly totalAvailable?: number
  readonly updated?: string
}

export interface InstalledDshPlugin {
  readonly name: string
  readonly version: string
  readonly source: string
  readonly description?: string
  readonly repositoryUrl?: string
  /** Client contributions target the official DSH Web UI, not the native workbench. */
  readonly includesWebClient: boolean
}

export interface DshPluginCenterSnapshot {
  readonly catalog?: DshPluginCatalogSnapshot
  readonly installed: readonly InstalledDshPlugin[]
  readonly busy: boolean
  readonly error?: string
}
