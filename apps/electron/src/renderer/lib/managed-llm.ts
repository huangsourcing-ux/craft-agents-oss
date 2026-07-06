import type { SetupNeeds } from '../../shared/types'

// [FORK] Company builds default to a server-managed OpenRouter connection.
type ManagedLlmEnv = {
  VITE_WUDI_MANAGED_LLM?: string
}

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
