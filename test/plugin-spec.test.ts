import { describe, expect, it } from 'vitest'
import { isNpmPackageName, normalizePluginSpec, registryInstallSpec } from '../src/plugins/plugin-spec.js'

describe('DSH plugin package specifications', () => {
  it('accepts supported single-argument package sources', () => {
    expect(normalizePluginSpec('dsh-vault')).toBe('dsh-vault')
    expect(normalizePluginSpec('github:Ox0400/dsh-vault#v0.5.0')).toBe('github:Ox0400/dsh-vault#v0.5.0')
    expect(normalizePluginSpec('../dsh-plugin')).toBe('../dsh-plugin')
    expect(normalizePluginSpec('file:///C:/Plugin')).toBe('file:///C:/Plugin')
    expect(normalizePluginSpec('dsh plugin --profile web add dsh-vault')).toBe('dsh-vault')
  })

  it('rejects forwarded flags, multiple arguments, and shell metacharacters', () => {
    for (const value of ['', '--ignore-scripts', 'dsh-vault another-package', 'dsh-vault && whoami', 'dsh-vault|whoami', 'dsh-vault%PATH%']) {
      expect(() => normalizePluginSpec(value), value).toThrow('Invalid DSH plugin package specification.')
    }
  })

  it('only accepts exact web-profile commands from the registry', () => {
    expect(registryInstallSpec('dsh plugin --profile web add github:owner/plugin#v1')).toBe('github:owner/plugin#v1')
    expect(registryInstallSpec('dsh plugin --profile demo add dsh-vault')).toBeUndefined()
    expect(registryInstallSpec('dsh plugin --profile web remove dsh-vault')).toBeUndefined()
    expect(registryInstallSpec('dsh plugin --profile web add one two')).toBeUndefined()
  })

  it('validates dependency names before path resolution and removal', () => {
    expect(isNpmPackageName('dsh-vault')).toBe(true)
    expect(isNpmPackageName('@scope/dsh-plugin')).toBe(true)
    expect(isNpmPackageName('../dsh-plugin')).toBe(false)
    expect(isNpmPackageName('@scope/../../escape')).toBe(false)
  })
})
