import { describe, expect, it } from 'bun:test'
import type { WsFrame, WSClientOptions } from '@wecom/aibot-node-sdk'
import {
  DEFAULT_WECOM_WS_URL,
  WeComAdapter,
  parseWeComCredentials,
  testWeComCredentials,
} from '../adapters/wecom/index'
import type { IncomingMessage } from '../types'

type Handler = (...args: any[]) => void

class MockWeComClient {
  readonly handlers = new Map<string, Handler[]>()
  readonly sent: Array<{ chatid: string; body: { msgtype: 'markdown'; markdown: { content: string } } }> = []
  isConnected = false
  connectCalls = 0
  disconnectCalls = 0

  constructor(readonly options: WSClientOptions) {}

  connect(): void {
    this.connectCalls += 1
    this.isConnected = true
    this.emit('connected')
    this.emit('authenticated')
  }

  disconnect(): void {
    this.disconnectCalls += 1
    this.isConnected = false
  }

  on(event: string, handler: Handler): void {
    const list = this.handlers.get(event)
    if (list) list.push(handler)
    else this.handlers.set(event, [handler])
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  async sendMessage(
    chatid: string,
    body: { msgtype: 'markdown'; markdown: { content: string } },
  ): Promise<WsFrame> {
    this.sent.push({ chatid, body })
    return {
      headers: { req_id: `req-${this.sent.length}` },
      body: { msgid: `msg-${this.sent.length}` },
    } as WsFrame
  }
}

function credentialsToken(overrides: Partial<{ botId: string; secret: string; wsUrl: string }> = {}): string {
  return JSON.stringify({
    botId: 'aib-test',
    secret: 'rotated-secret',
    ...overrides,
  })
}

function makeFrame(overrides: Record<string, unknown> = {}): WsFrame {
  return {
    headers: { req_id: 'req-1' },
    body: {
      msgid: 'incoming-1',
      aibotid: 'aib-test',
      chattype: 'single',
      from: { userid: 'user-1' },
      create_time: 1_700_000_000,
      msgtype: 'text',
      text: { content: 'hello' },
      ...overrides,
    },
  } as WsFrame
}

describe('parseWeComCredentials', () => {
  it('parses valid JSON credentials and trims optional wsUrl', () => {
    expect(parseWeComCredentials(credentialsToken({ wsUrl: '  wss://example.test/ws  ' }))).toEqual({
      botId: 'aib-test',
      secret: 'rotated-secret',
      wsUrl: 'wss://example.test/ws',
    })
  })

  it('rejects malformed JSON and missing fields', () => {
    expect(() => parseWeComCredentials('not json')).toThrow('valid JSON')
    expect(() => parseWeComCredentials(JSON.stringify({ secret: 'x' }))).toThrow('botId')
    expect(() => parseWeComCredentials(JSON.stringify({ botId: 'x' }))).toThrow('secret')
  })

  it('rejects non-websocket wsUrl values', () => {
    expect(() => parseWeComCredentials(credentialsToken({ wsUrl: 'https://example.test' }))).toThrow('wsUrl')
  })
})

describe('WeComAdapter', () => {
  it('declares the expected phase-1 capabilities', () => {
    const adapter = new WeComAdapter()
    expect(adapter.platform).toBe('wecom')
    expect(adapter.capabilities.inlineButtons).toBe(false)
    expect(adapter.capabilities.messageEditing).toBe(false)
    expect(adapter.capabilities.webhookSupport).toBe(false)
    expect(adapter.capabilities.markdown).toBe('wecom-markdown')
  })

  it('maps SDK text frames to IncomingMessage using userid and chatid rules', async () => {
    const client = new MockWeComClient({ botId: 'aib-test', secret: 'secret' } as WSClientOptions)
    const adapter = new WeComAdapter()
    const received: IncomingMessage[] = []
    adapter.onMessage(async (msg) => {
      received.push(msg)
    })

    await adapter.initialize({
      token: credentialsToken(),
      clientFactory: () => client,
    })

    client.emit('message.text', makeFrame())
    client.emit('message.text', makeFrame({ chattype: 'group', chatid: 'chat-1' }))

    expect(received).toHaveLength(2)
    expect(received[0]).toMatchObject({
      platform: 'wecom',
      channelId: 'user-1',
      senderId: 'user-1',
      messageId: 'incoming-1',
      text: 'hello',
    })
    expect(received[1]?.channelId).toBe('chat-1')
  })

  it('sends outbound text as markdown messages and splits by UTF-8 bytes', async () => {
    const client = new MockWeComClient({ botId: 'aib-test', secret: 'secret' } as WSClientOptions)
    const adapter = new WeComAdapter()

    await adapter.initialize({
      token: credentialsToken(),
      clientFactory: () => client,
    })

    const longText = '好'.repeat(700)
    const sent = await adapter.sendText('chat-1', longText)

    expect(sent).toEqual({ platform: 'wecom', channelId: 'chat-1', messageId: 'msg-2' })
    expect(client.sent).toHaveLength(2)
    expect(client.sent[0]?.chatid).toBe('chat-1')
    expect(client.sent[0]?.body.msgtype).toBe('markdown')
    expect(Buffer.byteLength(client.sent[0]!.body.markdown.content, 'utf8')).toBeLessThanOrEqual(2048)
    expect(Buffer.byteLength(client.sent[1]!.body.markdown.content, 'utf8')).toBeLessThanOrEqual(2048)
  })

  it('passes the default WebSocket URL into the SDK client options', async () => {
    let captured: WSClientOptions | undefined
    const adapter = new WeComAdapter()

    await adapter.initialize({
      token: credentialsToken(),
      clientFactory: (options: WSClientOptions) => {
        captured = options
        return new MockWeComClient(options)
      },
    })

    expect(captured?.wsUrl).toBe(DEFAULT_WECOM_WS_URL)
  })
})

describe('testWeComCredentials', () => {
  it('disconnects a short-lived client after authentication succeeds', async () => {
    const client = new MockWeComClient({ botId: 'aib-test', secret: 'secret' } as WSClientOptions)
    const result = await testWeComCredentials(
      { botId: 'aib-test', secret: 'secret' },
      { clientFactory: () => client, timeoutMs: 50 },
    )

    expect(result).toEqual({ success: true })
    expect(client.connectCalls).toBe(1)
    expect(client.disconnectCalls).toBe(1)
  })
})
