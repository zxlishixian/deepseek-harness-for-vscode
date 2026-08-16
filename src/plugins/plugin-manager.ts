import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { BundledRuntimeResolver } from '../runtime/bundled-runtime.js'
import { isNpmPackageName, normalizePluginSpec } from './plugin-spec.js'
import type { InstalledDshPlugin } from './types.js'

const PROFILE = 'web'
const MAX_ERROR_OUTPUT = 12_000

/** Manages the exact `web` profile booted by this extension through DSH's CLI. */
export class DshPluginManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly resolver: BundledRuntimeResolver,
    private readonly output: vscode.OutputChannel,
  ) {}

  async listInstalled(): Promise<readonly InstalledDshPlugin[]> {
    const profileDir = this.profileDirectory()
    const profile = await readJson(path.join(profileDir, 'package.json'))
    if (!isRecord(profile)) return []
    const dependencies = stringRecord(profile.dependencies)
    const dsh = isRecord(profile.dsh) ? profile.dsh : undefined
    const profileConfig = dsh !== undefined && isRecord(dsh.profile) ? dsh.profile : undefined
    const bundles = profileConfig !== undefined && Array.isArray(profileConfig.bundles)
      ? profileConfig.bundles.filter((value): value is string => typeof value === 'string')
      : []
    const installed = await Promise.all(bundles.map(async (name): Promise<InstalledDshPlugin | undefined> => {
      const source = dependencies[name]
      if (source === undefined || !isNpmPackageName(name)) return undefined
      const manifest = await readJson(path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json'))
      if (!isRecord(manifest)) return { name, version: source, source, includesWebClient: false }
      const repositoryUrl = repositoryOf(manifest.repository)
      const manifestDsh = isRecord(manifest.dsh) ? manifest.dsh : undefined
      return {
        name,
        version: typeof manifest.version === 'string' ? manifest.version : source,
        source,
        ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
        ...(repositoryUrl === undefined ? {} : { repositoryUrl }),
        includesWebClient: manifestDsh !== undefined && isRecord(manifestDsh.client),
      }
    }))
    return installed.filter((item): item is InstalledDshPlugin => item !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  async install(value: string): Promise<readonly InstalledDshPlugin[]> {
    let spec: string
    try {
      spec = normalizePluginSpec(value)
    } catch {
      throw new Error(vscode.l10n.t('Invalid DSH plugin package specification.'))
    }
    await this.run(['add', spec])
    return await this.listInstalled()
  }

  async remove(name: string): Promise<readonly InstalledDshPlugin[]> {
    if (!isNpmPackageName(name)) throw new Error(vscode.l10n.t('Invalid DSH plugin package name.'))
    const installed = await this.listInstalled()
    if (!installed.some((item) => item.name === name)) throw new Error(vscode.l10n.t('DSH plugin is not installed: {0}', name))
    await this.run(['remove', name])
    return await this.listInstalled()
  }

  private async run(pnpmArguments: readonly string[]): Promise<void> {
    const launch = await this.resolver.resolve()
    const args = [...launch.args, 'plugin', '--profile', PROFILE, ...pnpmArguments]
    const env = { ...launch.environment, DSH_HOME: this.harnessHome() }
    this.output.appendLine(`[plugin] dsh plugin --profile ${PROFILE} ${pnpmArguments.map(diagnosticArgument).join(' ')}`)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(launch.command, args, {
        cwd: workspaceDirectory(),
        env,
        windowsHide: true,
      })
      let diagnostics = ''
      const collect = (chunk: Buffer | string): void => {
        const content = String(chunk)
        this.output.append(content)
        diagnostics = (diagnostics + content).slice(-MAX_ERROR_OUTPUT)
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(vscode.l10n.t('DSH plugin command failed (code={code}, signal={signal}): {detail}', {
          code: String(code),
          signal: String(signal),
          detail: lastMeaningfulLines(diagnostics),
        })))
      })
    })
  }

  private harnessHome(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'harness-home')
  }

  private profileDirectory(): string {
    return path.join(this.harnessHome(), 'profiles', PROFILE)
  }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function repositoryOf(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value : isRecord(value) && typeof value.url === 'string' ? value.url : undefined
  if (raw === undefined) return undefined
  const normalized = raw.replace(/^git\+/u, '').replace(/\.git$/u, '')
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function lastMeaningfulLines(value: string): string {
  const lines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  return lines.slice(-8).join('\n') || 'No diagnostic output.'
}

/** Avoids persisting credentials embedded in custom tarball URLs to logs. */
function diagnosticArgument(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return value
    url.username = ''
    url.password = ''
    url.search = ''
    return url.toString()
  } catch {
    return value
  }
}

function workspaceDirectory(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
