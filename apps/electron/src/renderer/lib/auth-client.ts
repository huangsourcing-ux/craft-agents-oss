export interface EmployeeAuthUser {
  id: string
  username: string
  displayName?: string
}

export interface EmployeeAuthSession {
  token: string
  serverUrl: string
  user: EmployeeAuthUser
  workspaceId: string
  expiresAt: string
}

export interface EmployeeLoginCredentials {
  username: string
  password: string
}

export class EmployeeAuthError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'EmployeeAuthError'
    this.status = status
  }
}

const SESSION_STORAGE_KEY = 'craft-employee-auth-session'
const MOCK_USERNAME = 'demo'
const MOCK_PASSWORD = 'demo123'
const LOCAL_GATEWAY_BASE_URL = 'http://localhost:8080'
const GATEWAY_API_PREFIXES = ['/api/auth', '/api/design', '/api/model-proxy', '/api/business-mcp']

type ViteEnv = {
  DEV?: boolean
  VITE_AUTH_GATEWAY_URL?: string
  VITE_AUTH_MOCK?: string
}

function getEnv(): ViteEnv {
  return ((import.meta as unknown as { env?: ViteEnv }).env ?? {})
}

function getRuntimeEnvironment(): 'electron' | 'web' {
  try {
    return window.electronAPI?.getRuntimeEnvironment?.() ?? 'electron'
  } catch {
    return 'electron'
  }
}

function getGatewayBaseUrl(): string {
  return (getEnv().VITE_AUTH_GATEWAY_URL ?? '').replace(/\/+$/, '')
}

function getStoredGatewayBaseUrl(): string {
  return (getStoredSession()?.serverUrl ?? '').replace(/\/+$/, '')
}

function isGatewayApiPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? path
  return GATEWAY_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function absoluteGatewayUrl(path: string, baseUrl: string): string {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

function isMockMode(): boolean {
  const env = getEnv()
  if (env.VITE_AUTH_MOCK === 'true') return true
  if (env.VITE_AUTH_MOCK === 'false') return false

  return Boolean(env.DEV && getRuntimeEnvironment() === 'electron' && !getGatewayBaseUrl())
}

function getStoredSession(): EmployeeAuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as EmployeeAuthSession
    if (typeof parsed.token !== 'string' || typeof parsed.serverUrl !== 'string' || !parsed.user?.id || typeof parsed.workspaceId !== 'string' || !parsed.expiresAt) {
      return null
    }
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearStoredSession()
      return null
    }
    return parsed
  } catch {
    clearStoredSession()
    return null
  }
}

function setStoredSession(session: EmployeeAuthSession): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Session persistence is a convenience for reloads; auth still works in memory.
  }
}

function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (getEnv().DEV && isGatewayApiPath(path)) return path

  const baseUrl = getGatewayBaseUrl() || getStoredGatewayBaseUrl()
  if (baseUrl) return absoluteGatewayUrl(path, baseUrl)

  const runtime = getRuntimeEnvironment()
  if (runtime === 'electron' || (getEnv().DEV && isGatewayApiPath(path))) {
    return absoluteGatewayUrl(path, LOCAL_GATEWAY_BASE_URL)
  }
  if (runtime === 'web') return path
  throw new EmployeeAuthError('Auth gateway URL is not configured.')
}

async function parseAuthResponse(res: Response, fallbackToken = ''): Promise<EmployeeAuthSession> {
  const body = await res.json().catch(() => null) as Partial<EmployeeAuthSession> | null
  if (!body?.user || typeof body.workspaceId !== 'string' || !body.expiresAt) {
    throw new EmployeeAuthError('Invalid auth response from gateway.', res.status)
  }
  return {
    token: body.token || fallbackToken,
    serverUrl: body.serverUrl || getGatewayBaseUrl(),
    user: {
      id: body.user.id,
      username: body.user.username,
      displayName: body.user.displayName,
    },
    workspaceId: body.workspaceId,
    expiresAt: body.expiresAt,
  }
}

function createMockSession(username: string): EmployeeAuthSession {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const user = {
    id: 'mock-user-demo',
    username,
    displayName: 'Demo User',
  }
  return {
    token: `mock.${btoa(JSON.stringify({ sub: user.id, username, workspace_id: 'mock-workspace', exp: Math.floor(Date.parse(expiresAt) / 1000) }))}`,
    serverUrl: getGatewayBaseUrl() || 'http://localhost:8080',
    user,
    workspaceId: 'mock-workspace',
    expiresAt,
  }
}

async function requestSession(path: string, init?: RequestInit): Promise<Response> {
  const stored = getStoredSession()
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (stored?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${stored.token}`)
  }

  return fetch(buildUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  })
}

export const authClient = {
  isMockMode,

  request(path: string, init?: RequestInit): Promise<Response> {
    return requestSession(path, init)
  },

  async getSession(): Promise<EmployeeAuthSession | null> {
    if (isMockMode()) return getStoredSession()

    try {
      const res = await requestSession('/api/auth/session', { method: 'GET' })
      if (res.status === 401) {
        clearStoredSession()
        return null
      }
      if (!res.ok) {
        clearStoredSession()
        return null
      }
      const session = await parseAuthResponse(res, getStoredSession()?.token ?? '')
      setStoredSession(session)
      return session
    } catch {
      clearStoredSession()
      return null
    }
  },

  async login(credentials: EmployeeLoginCredentials): Promise<EmployeeAuthSession> {
    if (isMockMode()) {
      if (credentials.username === MOCK_USERNAME && credentials.password === MOCK_PASSWORD) {
        const session = createMockSession(credentials.username)
        setStoredSession(session)
        return session
      }
      throw new EmployeeAuthError('Invalid credentials', 401)
    }

    const res = await requestSession('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new EmployeeAuthError(body?.error || 'Authentication failed', res.status)
    }

    const session = await parseAuthResponse(res)
    setStoredSession(session)
    return session
  },

  async logout(): Promise<void> {
    clearStoredSession()
    if (isMockMode()) return

    try {
      await requestSession('/api/auth/logout', { method: 'POST' })
    } catch {
      // Local session is already cleared; the next server check will enforce auth.
    }
  },
}
