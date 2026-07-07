import type { Workspace } from '@craft-agent/core/types';
import type { LlmConnection } from './llm-connections.ts';
import { defaultMidStreamBehavior } from './llm-connections.ts';
import {
  getManagedOpenRouterModels,
  toManagedOpenRouterPiModelId,
} from './managed-openrouter-models.ts';
import { loadStoredConfig, saveConfig, type StoredConfig } from './storage.ts';
import { loadWorkspaceConfig, saveWorkspaceConfig } from '../workspaces/storage.ts';
import type { WorkspaceConfig } from '../workspaces/types.ts';

export const WUDI_MANAGED_LLM_ENV = 'WUDI_MANAGED_LLM';
export const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';
export const SYSTEM_OPENROUTER_CONNECTION_SLUG = 'system-openrouter';
export const SYSTEM_OPENROUTER_MODEL_ID = toManagedOpenRouterPiModelId(undefined);

export interface ManagedSystemLlmBootstrapResult {
  enabled: boolean;
  configChanged: boolean;
  workspaceOverridesCleared: number;
  connectionSlug?: string;
}

function envFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

export function isManagedSystemLlmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return envFlagEnabled(env[WUDI_MANAGED_LLM_ENV]);
}

export function assertManagedSystemLlmEnv(env: Record<string, string | undefined> = process.env): void {
  if (!env[OPENROUTER_API_KEY_ENV]?.trim()) {
    throw new Error(`${OPENROUTER_API_KEY_ENV} is required when ${WUDI_MANAGED_LLM_ENV}=true.`);
  }
}

export function buildSystemOpenRouterConnection(existing?: LlmConnection, now = Date.now()): LlmConnection {
  const connection: LlmConnection = {
    slug: SYSTEM_OPENROUTER_CONNECTION_SLUG,
    name: 'System OpenRouter',
    providerType: 'pi',
    authType: 'environment',
    piAuthProvider: 'openrouter',
    defaultModel: SYSTEM_OPENROUTER_MODEL_ID,
    models: getManagedOpenRouterModels({ piPrefix: true }),
    modelSelectionMode: 'userDefined3Tier',
    midStreamBehavior: defaultMidStreamBehavior('pi'),
    createdAt: existing?.createdAt ?? now,
  };

  if (existing?.lastUsedAt) {
    connection.lastUsedAt = existing.lastUsedAt;
  }

  return connection;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyManagedSystemLlmConfig(config: StoredConfig, now = Date.now()): boolean {
  let changed = false;
  const connections = [...(config.llmConnections ?? [])];
  const existingIndex = connections.findIndex((connection) => connection.slug === SYSTEM_OPENROUTER_CONNECTION_SLUG);
  const existingConnection = existingIndex >= 0 ? connections[existingIndex] : undefined;
  const systemConnection = buildSystemOpenRouterConnection(existingConnection, now);

  if (existingIndex === -1) {
    connections.push(systemConnection);
    changed = true;
  } else if (!sameJson(connections[existingIndex], systemConnection)) {
    connections[existingIndex] = systemConnection;
    changed = true;
  }

  if (changed || config.llmConnections == null) {
    config.llmConnections = connections;
  }

  if (config.defaultLlmConnection !== SYSTEM_OPENROUTER_CONNECTION_SLUG) {
    config.defaultLlmConnection = SYSTEM_OPENROUTER_CONNECTION_SLUG;
    changed = true;
  }

  return changed;
}

function removeWorkspaceDefaultOverride(workspaceConfig: WorkspaceConfig): WorkspaceConfig | null {
  if (!workspaceConfig.defaults?.defaultLlmConnection) {
    return null;
  }

  const defaults = { ...workspaceConfig.defaults };
  delete defaults.defaultLlmConnection;

  const nextConfig: WorkspaceConfig = { ...workspaceConfig };
  if (Object.keys(defaults).length > 0) {
    nextConfig.defaults = defaults;
  } else {
    delete nextConfig.defaults;
  }
  return nextConfig;
}

function clearWorkspaceDefaultLlmConnection(workspace: Workspace): boolean {
  const workspaceConfig = loadWorkspaceConfig(workspace.rootPath);
  if (!workspaceConfig) return false;

  const nextConfig = removeWorkspaceDefaultOverride(workspaceConfig);
  if (!nextConfig) return false;

  saveWorkspaceConfig(workspace.rootPath, nextConfig);
  return true;
}

export function ensureManagedSystemLlmConnection(
  env: Record<string, string | undefined> = process.env,
): ManagedSystemLlmBootstrapResult {
  if (!isManagedSystemLlmEnabled(env)) {
    return { enabled: false, configChanged: false, workspaceOverridesCleared: 0 };
  }

  assertManagedSystemLlmEnv(env);

  const config = loadStoredConfig() ?? {
    workspaces: [],
    activeWorkspaceId: null,
    activeSessionId: null,
  };

  const configChanged = applyManagedSystemLlmConfig(config);
  if (configChanged) {
    saveConfig(config);
  }

  let workspaceOverridesCleared = 0;
  for (const workspace of config.workspaces) {
    if (clearWorkspaceDefaultLlmConnection(workspace)) {
      workspaceOverridesCleared += 1;
    }
  }

  return {
    enabled: true,
    configChanged,
    workspaceOverridesCleared,
    connectionSlug: SYSTEM_OPENROUTER_CONNECTION_SLUG,
  };
}
