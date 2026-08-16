import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

const targets = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-arm64': 'linux-arm64',
  'linux-x64': 'linux-x64',
  'win32-arm64': 'win32-arm64',
  'win32-x64': 'win32-x64',
}

const key = `${process.platform}-${process.arch}`
const target = targets[key]
if (target === undefined) throw new Error(`暂不支持为 ${key} 打包平台 VSIX。`)

const executable = path.join(
  process.cwd(),
  'node_modules',
  '@vscode',
  'vsce',
  'vsce',
)
// Spawn the vsce JS entry through the current Node executable instead of the
// platform shim (node_modules/.bin/vsce.cmd): spawning a .cmd directly from
// Node on Windows fails with EINVAL, which made `npm run package` unusable on
// Windows. Using process.execPath is cross-platform and avoids the shim layer.
const result = spawnSync(process.execPath, [executable, 'package', '--target', target, '--allow-missing-repository'], {
  stdio: 'inherit',
})
if (result.error !== undefined) throw result.error
process.exitCode = result.status ?? 1
