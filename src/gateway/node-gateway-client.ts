import type { RawData } from 'ws'
import WebSocket from 'ws'
import type {
  ApiProxy,
  HostFrame,
  MuxFrame,
  RpcRequest,
  ServerRequest,
} from '@deepseek-ai/dsh-host-apiproxy/api'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema, serverResponseSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'

type FrameParser<F> = { parse(value: unknown): F }
type SocketItem<F> = { readonly kind: 'frame'; readonly envelope: RpcRequest<F> } | { readonly kind: 'end' }

/** A host-registered slash command descriptor, as served by `commands/list`. */
export interface HostCommandDescriptor {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint: string }
}

export interface HostCommandExecution {
  readonly commandId: string
  /** RC.6 returns the settled result; newer Hosts may keep admission-only semantics. */
  readonly result?: { readonly kind: 'success' | 'error'; readonly text?: string }
}

/**
 * Node transport for the Harness Gateway. Unary calls use the official typed
 * fetch client; event downlinks use `ws` because VS Code's extension host is
 * not a browser and does not expose the Harness browser module loader.
 */
export class NodeGatewayClient extends AbstractApiClient {
  constructor(private readonly baseUrl: string) {
    super(30_000)
  }

  /** Lists the slash commands the active Harness deployment registers for one session. */
  async listCommands(sessionId: string): Promise<readonly HostCommandDescriptor[]> {
    // Typert Remote endpoints use the generic Connection `{ args }` carrier;
    // API Proxy methods use their payload directly. Keeping that envelope here
    // is what lets the Host interceptor claim commands/list before fallback.
    return this.callUnaryRaw<readonly HostCommandDescriptor[]>('commands/list', {
      args: { agentId: sessionId },
    })
  }

  /** Executes one registered Host slash command without sending it to the LLM. */
  async executeCommand(sessionId: string, line: string): Promise<HostCommandExecution | undefined> {
    return this.callUnaryRaw<HostCommandExecution | undefined>('commands/execute', {
      args: { agentId: sessionId, line },
    })
  }

  /**
   * Generic unary call for endpoints outside the typed RpcMethodMap (the host
   * commands service is a typert remote, not part of the api-proxy contract).
   * Mirrors `callUnary`'s envelope lifecycle without the per-method value
   * schema table; the caller narrows the raw value.
   */
  private async callUnaryRaw<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const message = {
      type: 'client-request' as const,
      rpcId: this.mintRpcId(),
      method,
      payload,
    }
    this.onEnvelope(message)
    const response = await this.doFetch(new URL(`/api/${method}`, this.resolveBase()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!response.ok) throw new Error(`transport failure for ${method}: HTTP ${response.status}`)
    const full = serverResponseSchema.parse(await response.json())
    this.onEnvelope(full)
    if (full.rpcId !== message.rpcId) throw new Error(`rpcId mismatch for ${method}: sent ${message.rpcId}, got ${full.rpcId}`)
    if (!full.result.ok) throw new Error(`RPC ${method} failed: ${full.result.error.code}: ${full.result.error.message}`)
    return full.result.value as T
  }

  protected override resolveBase(): string {
    return this.baseUrl
  }

  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }

  protected override openMux(
    _payload: Parameters<ApiProxy['events']['mux']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.readSocket('/api/events.mux', signal, muxFrameSchema, onOpen)
  }

  protected override openHost(
    _payload: Parameters<ApiProxy['events']['host']>[0]['payload'],
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.readSocket('/api/events.host', signal, hostFrameSchema, onOpen)
  }

  private async *readSocket<F extends MuxFrame | HostFrame>(
    path: string,
    signal: AbortSignal,
    parser: FrameParser<F>,
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<F>> {
    const url = new URL(path, this.baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    const inbox: SocketItem<F>[] = []
    let wake: (() => void) | undefined

    const enqueue = (item: SocketItem<F>): void => {
      inbox.push(item)
      wake?.()
      wake = undefined
    }
    const close = (): void => { enqueue({ kind: 'end' }) }
    const abort = (): void => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
    }
    const message = (data: RawData): void => {
      try {
        const full: ServerRequest = serverRequestSchema.parse(JSON.parse(rawDataText(data)))
        const payload = parser.parse(full.payload)
        this.onEnvelope(full)
        enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload } })
      } catch {
        // A malformed push is isolated. A later history refresh repairs gaps.
      }
    }

    socket.once('open', onOpen ?? (() => undefined))
    socket.on('message', message)
    socket.once('close', close)
    socket.once('error', close)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()

    try {
      while (!signal.aborted) {
        while (inbox.length > 0) {
          const item = inbox.shift()
          if (item?.kind === 'end') return
          if (item?.kind === 'frame') yield item.envelope
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', abort)
      socket.off('message', message)
      socket.off('close', close)
      socket.off('error', close)
      abort()
    }
  }
}

function rawDataText(data: RawData): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return data.toString('utf8')
}
