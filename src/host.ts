/**
 * Lifecycle for the spawned dsh Web server: command resolution, process
 * start, loopback-URL discovery, and shutdown.
 *
 * The extension never links against harness packages. It runs the `dsh`
 * launcher as a child process and reads the one URL line the Web app prints
 * once its server is listening (`dsh web: http://127.0.0.1:<port>`).
 * @module dsh-vscode/host
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'

/** A running dsh Web server: its process, canonical loopback URL, and shutdown. */
export interface RunningServer {
  /** The child process hosting the Cordis tree and HTTP server. */
  readonly child: ChildProcess
  /** Canonical loopback URL printed by the Web app, e.g. `http://127.0.0.1:52217`. */
  readonly url: string
  /** Listening port (OS-assigned when the configured port was 0). */
  readonly port: number
  /** Stop the server and await process exit. */
  stop(): Promise<void>
}

/** Options for {@link startServer}. */
export interface StartOptions {
  /** `dsh.binary` setting: a path, or empty for the default npx form. */
  binary: string
  /** Bind host forwarded to the Web app's `--host`. */
  host: string
  /** Listen port forwarded to the Web app's `--port`; 0 asks the OS. */
  port: number
  /** Extra arguments forwarded verbatim after the Web app's own flags. */
  args: readonly string[]
  /** `DSH_HOME` override; absent leaves the default home. */
  home?: string
  /** Child-process working directory; the harness treats it as the default workspace root. */
  cwd?: string
  /** Sink for child stdout/stderr, drained as it arrives. */
  log: (text: string) => void
}

/**
 * Resolve the spawn command for a `dsh.binary` value.
 * @param binary - the configured binary, possibly empty.
 * @returns the executable plus any leading arguments (a `.js` path runs under `node`).
 */
function dshCommand(binary: string): { command: string; args: string[] } {
  const trimmed = binary.trim()
  if (trimmed === '') return { command: 'npx', args: ['--yes', '@deepseek-ai/dsh'] }
  if (trimmed.endsWith('.js')) return { command: 'node', args: [trimmed] }
  return { command: trimmed, args: [] }
}

/**
 * Spawn `dsh web` and resolve once it prints its loopback URL.
 *
 * Resolves to a {@link RunningServer} on the first URL line; rejects if the
 * child errors or exits before serving. stdout is drained both for the caller's
 * log sink and to find the URL, which may span chunk boundaries.
 * @param options - command, flags, environment, working directory, and log sink.
 * @returns a promise for the running server.
 */
/** Lowest supported Node line (harness engines: ^22.19.0 || >=24). */
const MIN_NODE_MAJOR = 22
const MIN_NODE_MINOR = 19

/** Read the installed Node version, or reject with a clear install hint. */
function readNodeVersion(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('node', ['--version'], (error, stdout) => {
      if (error !== null) {
        reject(new Error('DeepSeek Harness needs Node.js, but `node` was not found on PATH. Install Node 22.19+ or 24+.'))
      } else {
        resolvePromise(stdout.trim())
      }
    })
  })
}

/** Reject when the installed Node is outside the harness engines range. */
async function assertNodeVersion(): Promise<void> {
  const version = await readNodeVersion()
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (match === null) return
  const major = Number(match[1])
  const minor = Number(match[2])
  // Node 23 (odd/non-LTS) is intentionally outside the engines range.
  const ok = (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR) || major >= MIN_NODE_MAJOR + 2
  if (!ok) {
    throw new Error(`DeepSeek Harness requires Node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ or 24+, but found ${version}.`)
  }
}

export async function startServer(options: StartOptions): Promise<RunningServer> {
  await assertNodeVersion()
  return new Promise<RunningServer>((resolve, reject) => {
    const { command, args } = dshCommand(options.binary)
    const childArgs = [...args, 'web', '--host', options.host, '--port', String(options.port), ...options.args]
    const env = options.home !== undefined && options.home.trim() !== ''
      ? { ...process.env, DSH_HOME: options.home }
      : process.env
    const child = spawn(command, childArgs, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    const stdout = child.stdout
    const stderr = child.stderr
    if (stdout === null || stderr === null) {
      reject(new Error('dsh spawn did not expose stdout/stderr'))
      return
    }

    let settled = false
    let stdoutBuf = ''
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }

    stderr.on('data', (chunk: Buffer) => options.log(chunk.toString('utf8')))
    stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stdoutBuf += text
      options.log(text)
      if (settled) return
      const match = /dsh web:\s+(https?:\/\/\S+)/.exec(stdoutBuf)
      if (match === null) return
      settled = true
      try {
        const url = new URL(match[1]).toString().replace(/\/$/, '')
        resolve({ child, url, port: Number(new URL(url).port), stop: () => stopServer(child) })
      } catch {
        fail(new Error(`dsh printed an unparsable URL: ${JSON.stringify(match[1])}`))
      }
    })

    child.on('error', fail)
    child.on('exit', (code, signal) => {
      if (!settled) {
        fail(new Error(`dsh exited before printing its URL (code ${code ?? 'null'}, signal ${signal ?? 'none'})`))
      }
    })
  })
}

/**
 * Terminate a running server, awaiting exit with a SIGKILL grace fallback.
 * @param child - the server process.
 * @returns fulfillment after the process exits.
 */
function stopServer(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}
