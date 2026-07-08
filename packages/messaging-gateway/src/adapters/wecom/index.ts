/**
 * WeComAdapter — Enterprise WeChat smart bot WebSocket adapter.
 *
 * Phase 1 scope: local desktop long connection, text inbound, plain outbound
 * Markdown messages, and normal /pair-based session binding. Interactive
 * cards, streaming replies, and media are intentionally left for later.
 */

import {
  WSClient,
  type Logger as WeComSdkLogger,
  type TextMessage,
  type WsFrame,
  type WSClientOptions,
} from '@wecom/aibot-node-sdk'
import type {
  AdapterCapabilities,
  ButtonPress,
  IncomingMessage,
  InlineButton,
  MessagingLogger,
  PlatformAdapter,
  PlatformConfig,
  SendOptions,
  SentMessage,
} from '../../types'

export const DEFAULT_WECOM_WS_URL = 'wss://openws.work.weixin.qq.com'
const MAX_WECOM_MESSAGE_BYTES = 2048
const TEST_TIMEOUT_MS = 15_000

const NOOP_LOGGER: MessagingLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOGGER,
}

export interface WeComCredentials {
  botId: string
  secret: string
  wsUrl?: string
}

interface WeComClient {
  connect(): unknown
  disconnect(): void
  readonly isConnected: boolean
  sendMessage(chatid: string, body: { msgtype: 'markdown'; markdown: { content: string } }): Promise<WsFrame>
  on(event: 'connected', handler: () => void): unknown
  on(event: 'authenticated', handler: () => void): unknown
  on(event: 'disconnected', handler: (reason: string) => void): unknown
  on(event: 'reconnecting', handler: (attempt: number) => void): unknown
  on(event: 'error', handler: (error: Error) => void): unknown
  on(event: 'message.text', handler: (frame: WsFrame<TextMessage>) => void): unknown
}

type WeComClientFactory = (options: WSClientOptions) => WeComClient

export interface WeComConfig extends PlatformConfig {
  token?: string
  clientFactory?: WeComClientFactory
}

export function parseWeComCredentials(token: string | undefined): WeComCredentials {
  if (!token) throw new Error('WeCom credentials are missing')
  let parsed: unknown
  try {
    parsed = JSON.parse(token)
  } catch {
    throw new Error('WeCom credentials are not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WeCom credentials must be a JSON object')
  }

  const { botId, secret, wsUrl } = parsed as Record<string, unknown>
  if (typeof botId !== 'string' || botId.trim().length === 0) {
    throw new Error('WeCom credentials are missing `botId`')
  }
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('WeCom credentials are missing `secret`')
  }
  const trimmedWsUrl = typeof wsUrl === 'string' ? wsUrl.trim() : ''
  if (trimmedWsUrl && !/^wss?:\/\//i.test(trimmedWsUrl)) {
    throw new Error('WeCom credentials `wsUrl` must start with ws:// or wss://')
  }
  return {
    botId: botId.trim(),
    secret: secret.trim(),
    ...(trimmedWsUrl ? { wsUrl: trimmedWsUrl } : {}),
  }
}

export async function testWeComCredentials(
  creds: WeComCredentials,
  options: {
    clientFactory?: WeComClientFactory
    logger?: MessagingLogger
    timeoutMs?: number
  } = {},
): Promise<{ success: boolean; error?: string }> {
  if (!creds.botId || !creds.secret) {
    return { success: false, error: 'Bot ID or Secret is empty' }
  }

  const log = options.logger ?? NOOP_LOGGER
  const client = createWeComClient(creds, {
    clientFactory: options.clientFactory,
    logger: toSdkLogger(log.child({ component: 'wecom-test' })),
    maxReconnectAttempts: 0,
    maxAuthFailureAttempts: 1,
  })

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { success: boolean; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        client.disconnect()
      } catch {
        // ignore
      }
      resolve(result)
    }

    const timer = setTimeout(
      () => finish({ success: false, error: 'WeCom connection test timed out' }),
      options.timeoutMs ?? TEST_TIMEOUT_MS,
    )

    client.on('authenticated', () => finish({ success: true }))
    client.on('error', (err) => finish({ success: false, error: err.message }))
    client.on('disconnected', (reason) => {
      if (!settled) finish({ success: false, error: reason || 'Disconnected before authentication' })
    })

    try {
      client.connect()
    } catch (err) {
      finish({ success: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export class WeComAdapter implements PlatformAdapter {
  readonly platform = 'wecom' as const
  readonly capabilities: AdapterCapabilities = {
    messageEditing: false,
    inlineButtons: false,
    maxButtons: 0,
    maxMessageLength: MAX_WECOM_MESSAGE_BYTES,
    markdown: 'wecom-markdown',
    webhookSupport: false,
  }

  private client: WeComClient | null = null
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null
  private connected = false
  private log: MessagingLogger = NOOP_LOGGER

  async initialize(config: PlatformConfig): Promise<void> {
    const cfg = config as WeComConfig
    this.log = cfg.logger ?? NOOP_LOGGER
    const creds = parseWeComCredentials(cfg.token)

    if (this.client) {
      throw new Error('WeCom adapter already initialized')
    }

    this.client = createWeComClient(creds, {
      clientFactory: cfg.clientFactory,
      logger: toSdkLogger(this.log),
      maxReconnectAttempts: -1,
    })

    this.client.on('connected', () => {
      this.log.info('[wecom] websocket connected', { event: 'wecom_connected' })
    })
    this.client.on('authenticated', () => {
      this.connected = true
      this.log.info('[wecom] authenticated', {
        event: 'wecom_authenticated',
        botId: redactBotId(creds.botId),
      })
    })
    this.client.on('reconnecting', (attempt) => {
      this.connected = false
      this.log.warn('[wecom] reconnecting', { event: 'wecom_reconnecting', attempt })
    })
    this.client.on('disconnected', (reason) => {
      this.connected = false
      this.log.warn('[wecom] disconnected', { event: 'wecom_disconnected', reason })
    })
    this.client.on('error', (err) => {
      this.log.error('[wecom] sdk error', {
        event: 'wecom_error',
        error: err.message,
      })
    })
    this.client.on('message.text', (frame) => {
      void this.handleTextMessage(frame)
    })

    const authenticated = waitForAuthenticated(this.client, TEST_TIMEOUT_MS)
    this.client.connect()
    await authenticated
  }

  async destroy(): Promise<void> {
    if (!this.client) return
    try {
      this.client.disconnect()
    } finally {
      this.client = null
      this.connected = false
    }
  }

  isConnected(): boolean {
    return Boolean(this.connected && this.client?.isConnected)
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler
  }

  onButtonPress(_handler: (press: ButtonPress) => Promise<void>): void {
    // WeCom phase 1 has no inline button/callback surface.
  }

  async sendText(channelId: string, text: string, _opts?: SendOptions): Promise<SentMessage> {
    if (!this.client || !this.isConnected()) throw new Error('WeCom adapter is not connected')
    const chunks = splitUtf8(text, MAX_WECOM_MESSAGE_BYTES)
    let messageId = ''
    for (const chunk of chunks) {
      const result = await this.client.sendMessage(channelId, {
        msgtype: 'markdown',
        markdown: { content: chunk },
      })
      messageId = extractSentMessageId(result)
    }
    return { platform: 'wecom', channelId, messageId }
  }

  async editMessage(_channelId: string, _messageId: string, _text: string, _opts?: SendOptions): Promise<void> {
    throw new Error('WeCom message editing is not supported')
  }

  async sendButtons(
    _channelId: string,
    _text: string,
    _buttons: InlineButton[],
    _opts?: SendOptions,
  ): Promise<SentMessage> {
    throw new Error('WeCom inline buttons are not supported')
  }

  async sendTyping(_channelId: string, _opts?: SendOptions): Promise<void> {
    // WeCom smart bot has no typing indicator API in the phase-1 contract.
  }

  async sendFile(
    _channelId: string,
    _file: Buffer,
    _filename: string,
    _caption?: string,
    _opts?: SendOptions,
  ): Promise<SentMessage> {
    throw new Error('WeCom file sending is not supported in this build')
  }

  private async handleTextMessage(frame: WsFrame<TextMessage>): Promise<void> {
    if (!this.messageHandler) return
    const body = frame.body
    if (!body?.text?.content) return
    const senderId = body.from?.userid ?? ''
    const channelId = body.chattype === 'group' && body.chatid ? body.chatid : senderId
    if (!senderId || !channelId) {
      this.log.warn('[wecom] dropped text message without sender/channel', {
        event: 'wecom_message_missing_identity',
        messageId: body.msgid,
      })
      return
    }

    const msg: IncomingMessage = {
      platform: 'wecom',
      channelId,
      messageId: body.msgid || frame.headers?.req_id || `${Date.now()}`,
      senderId,
      senderName: senderId,
      text: body.text.content.trim(),
      timestamp: normalizeTimestamp(body.create_time),
      raw: frame,
    }

    this.log.info('[wecom] text message received', {
      event: 'wecom_message_received',
      channelId,
      messageId: msg.messageId,
      chattype: body.chattype,
      senderId,
    })

    await this.messageHandler(msg)
  }
}

function createWeComClient(
  creds: WeComCredentials,
  options: {
    clientFactory?: WeComClientFactory
    logger: WeComSdkLogger
    maxReconnectAttempts: number
    maxAuthFailureAttempts?: number
  },
): WeComClient {
  const opts: WSClientOptions = {
    botId: creds.botId,
    secret: creds.secret,
    logger: options.logger,
    maxReconnectAttempts: options.maxReconnectAttempts,
    wsUrl: creds.wsUrl ?? DEFAULT_WECOM_WS_URL,
    ...(options.maxAuthFailureAttempts !== undefined
      ? { maxAuthFailureAttempts: options.maxAuthFailureAttempts }
      : {}),
  }
  return options.clientFactory ? options.clientFactory(opts) : new WSClient(opts)
}

function waitForAuthenticated(client: WeComClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    const timer = setTimeout(
      () => finish(new Error('WeCom connection timed out before authentication')),
      timeoutMs,
    )

    client.on('authenticated', () => finish())
    client.on('error', (err) => finish(err))
    client.on('disconnected', (reason) => {
      finish(new Error(reason || 'Disconnected before WeCom authentication'))
    })
  })
}

function toSdkLogger(log: MessagingLogger): WeComSdkLogger {
  return {
    debug: (message, ...args) => {
      void args
      log.info(message, { event: 'wecom_sdk_debug' })
    },
    info: (message, ...args) => {
      void args
      log.info(message, { event: 'wecom_sdk_info' })
    },
    warn: (message, ...args) => {
      log.warn(message, { event: 'wecom_sdk_warn', args: sanitizeArgs(args) })
    },
    error: (message, ...args) => {
      log.error(message, { event: 'wecom_sdk_error', args: sanitizeArgs(args) })
    },
  }
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) return { name: arg.name, message: arg.message }
    if (!arg || typeof arg !== 'object') return arg
    return '[object]'
  })
}

function normalizeTimestamp(value: number | undefined): number {
  if (!value) return Date.now()
  return value > 1_000_000_000_000 ? value : value * 1000
}

function extractSentMessageId(frame: WsFrame): string {
  const body = frame.body
  if (body && typeof body === 'object') {
    const msgid = (body as { msgid?: unknown }).msgid
    if (typeof msgid === 'string' && msgid.length > 0) return msgid
  }
  return frame.headers?.req_id ?? `${Date.now()}`
}

function splitUtf8(text: string, maxBytes: number): string[] {
  const source = text.length > 0 ? text : ' '
  const chunks: string[] = []
  let current = ''
  let currentBytes = 0

  for (const char of source) {
    const bytes = Buffer.byteLength(char, 'utf8')
    if (current && currentBytes + bytes > maxBytes) {
      chunks.push(current)
      current = char
      currentBytes = bytes
    } else {
      current += char
      currentBytes += bytes
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [' ']
}

function redactBotId(botId: string): string {
  if (botId.length <= 8) return '***'
  return `${botId.slice(0, 4)}...${botId.slice(-4)}`
}
