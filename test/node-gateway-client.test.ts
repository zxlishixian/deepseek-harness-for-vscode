import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeGatewayClient } from '../src/gateway/node-gateway-client.js'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
  }))
})

describe('NodeGatewayClient Remote carrier', () => {
  it('wraps command arguments in the Typert Connection args envelope', async () => {
    const requests: { readonly method: string; readonly payload: unknown }[] = []
    const server = createServer((request, response) => {
      void (async () => {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          readonly rpcId: string
          readonly method: string
          readonly payload: unknown
        }
        requests.push(message)
        const value = message.method === 'commands/list'
          ? [{ name: 'plan', description: 'Plan mode' }]
          : { commandId: 'cmd-1', result: { kind: 'success', text: 'Plan mode on.' } }
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: message.rpcId,
          result: { ok: true, value },
        }))
      })()
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const client = new NodeGatewayClient(`http://127.0.0.1:${address.port}`)

    await expect(client.listCommands('session-1')).resolves.toEqual([{ name: 'plan', description: 'Plan mode' }])
    await expect(client.executeCommand('session-1', '/plan')).resolves.toMatchObject({ commandId: 'cmd-1' })
    expect(requests).toEqual([
      expect.objectContaining({ method: 'commands/list', payload: { args: { agentId: 'session-1' } } }),
      expect.objectContaining({ method: 'commands/execute', payload: { args: { agentId: 'session-1', line: '/plan' } } }),
    ])
  })
})
