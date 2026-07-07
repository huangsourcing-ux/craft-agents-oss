import type { SetupNeeds } from '../../shared/types'
import type { LlmConnectionSetup } from '../../shared/types'
import type { EmployeeAuthSession } from './auth-client'
import {
  DEFAULT_MANAGED_OPENROUTER_MODEL_ID,
  MANAGED_OPENROUTER_MODELS,
  isManagedOpenRouterModelId,
  resolveManagedOpenRouterModelId,
} from '@config/managed-openrouter-models'

// [FORK] Company builds default to a server-managed OpenRouter connection.
type ManagedLlmEnv = {
  VITE_WUDI_MANAGED_LLM?: string
}

export const SYSTEM_OPENROUTER_CONNECTION_SLUG = 'system-openrouter'
export const SYSTEM_OPENROUTER_MODEL_ID = DEFAULT_MANAGED_OPENROUTER_MODEL_ID
export const SYSTEM_OPENROUTER_MODELS = MANAGED_OPENROUTER_MODELS
export { isManagedOpenRouterModelId, resolveManagedOpenRouterModelId }

function getEnv(): ManagedLlmEnv {
  return ((import.meta as unknown as { env?: ManagedLlmEnv }).env ?? {})
}

export function isManagedLlmMode(): boolean {
  const raw = getEnv().VITE_WUDI_MANAGED_LLM
  if (raw == null || raw.trim() === '') return true

  const normalized = raw.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no' && normalized !== 'off'
}

export const MANAGED_LLM_SETUP_NEEDS: SetupNeeds = {
  needsBillingConfig: false,
  needsCredentials: false,
  isFullyConfigured: true,
}

function modelProxyBaseUrl(serverUrl: string): string {
  return new URL('/api/model-proxy/v1', serverUrl).toString().replace(/\/+$/, '')
}

export async function syncManagedLlmConnection(session: EmployeeAuthSession): Promise<void> {
  if (!isManagedLlmMode()) return

  // [FORK] Keep workspaces local while routing only model calls through the
  // authenticated gateway. The stored credential is the employee JWT, not the
  // upstream OpenRouter key.
  const setup: LlmConnectionSetup = {
    slug: SYSTEM_OPENROUTER_CONNECTION_SLUG,
    credential: session.token,
    baseUrl: modelProxyBaseUrl(session.serverUrl),
    defaultModel: SYSTEM_OPENROUTER_MODEL_ID,
    models: SYSTEM_OPENROUTER_MODELS.map(model => ({ ...model })),
    modelSelectionMode: 'userDefined3Tier',
    customEndpoint: {
      api: 'openai-completions',
      supportsImages: false,
    },
  }

  const result = await window.electronAPI.setupLlmConnection(setup)
  if (!result.success) {
    throw new Error(result.error || 'Failed to configure managed LLM connection.')
  }

  // Company-managed builds must not fall back to a stale local Anthropic/Claude
  // default. User-created local API connections may still exist in config, but
  // normal chat in this mode is always routed through the server model proxy.
  const defaultResult = await window.electronAPI.setDefaultLlmConnection(SYSTEM_OPENROUTER_CONNECTION_SLUG)
  if (!defaultResult.success) {
    throw new Error(defaultResult.error || 'Failed to set managed LLM connection as default.')
  }
}

export async function syncManagedBackendSource(session: EmployeeAuthSession, workspaceId: string): Promise<void> {
  if (!isManagedLlmMode()) return

  const result = await window.electronAPI.syncManagedBackendSource(workspaceId, {
    serverUrl: session.serverUrl,
    token: session.token,
  })
  if (!result.success) {
    throw new Error(result.error || 'Failed to configure managed backend source.')
  }
}
