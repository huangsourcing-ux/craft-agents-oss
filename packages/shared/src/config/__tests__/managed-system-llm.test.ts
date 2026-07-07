import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

const MANAGED_MODULE_PATH = pathToFileURL(join(import.meta.dir, '..', 'managed-system-llm.ts')).href

function setupWorkspaceConfigDir(options: {
  llmConnections?: any[]
  defaultLlmConnection?: string
  workspaceDefaults?: Record<string, unknown>
} = {}) {
  const configDir = mkdtempSync(join(tmpdir(), 'craft-agent-managed-llm-'))
  const workspaceRoot = join(configDir, 'workspaces', 'my-workspace')
  mkdirSync(workspaceRoot, { recursive: true })

  const workspaceConfigPath = join(workspaceRoot, 'config.json')
  writeFileSync(
    workspaceConfigPath,
    JSON.stringify(
      {
        id: 'ws-config-1',
        name: 'My Workspace',
        slug: 'my-workspace',
        defaults: options.workspaceDefaults,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      null,
      2,
    ),
    'utf-8',
  )

  const configPath = join(configDir, 'config.json')
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        workspaces: [
          {
            id: 'ws-1',
            name: 'My Workspace',
            rootPath: workspaceRoot,
            createdAt: Date.now(),
          },
        ],
        activeWorkspaceId: 'ws-1',
        activeSessionId: null,
        defaultLlmConnection: options.defaultLlmConnection,
        llmConnections: options.llmConnections ?? [],
      },
      null,
      2,
    ),
    'utf-8',
  )

  return { configDir, configPath, workspaceConfigPath }
}

function runBootstrap(configDir: string, env: Record<string, string | undefined> = {}) {
  return Bun.spawnSync([
    process.execPath,
    '--eval',
    `import { ensureManagedSystemLlmConnection } from '${MANAGED_MODULE_PATH}'; console.log(JSON.stringify(ensureManagedSystemLlmConnection()));`,
  ], {
    env: {
      ...process.env,
      CRAFT_CONFIG_DIR: configDir,
      WUDI_MANAGED_LLM: 'true',
      OPENROUTER_API_KEY: 'test-openrouter-key',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('managed system LLM bootstrap', () => {
  it('creates system OpenRouter connection, sets it as default, and clears workspace overrides', () => {
    const { configDir, configPath, workspaceConfigPath } = setupWorkspaceConfigDir({
      workspaceDefaults: {
        defaultLlmConnection: 'legacy-workspace-default',
        model: 'legacy-model',
      },
    })

    const run = runBootstrap(configDir)
    expect(run.exitCode).toBe(0)

    const result = JSON.parse(run.stdout.toString())
    expect(result).toMatchObject({
      enabled: true,
      configChanged: true,
      workspaceOverridesCleared: 1,
      connectionSlug: 'system-openrouter',
    })

    const config = readJson(configPath)
    const connection = config.llmConnections.find((item: any) => item.slug === 'system-openrouter')
    expect(config.defaultLlmConnection).toBe('system-openrouter')
    expect(connection).toMatchObject({
      providerType: 'pi',
      authType: 'environment',
      piAuthProvider: 'openrouter',
      defaultModel: 'pi/minimax/minimax-m3',
      modelSelectionMode: 'userDefined3Tier',
      midStreamBehavior: 'steer',
    })
    expect(connection.models.map((model: any) => model.id)).toEqual([
      'pi/z-ai/glm-5.2',
      'pi/xiaomi/mimo-v2.5',
      'pi/minimax/minimax-m3',
      'pi/moonshotai/kimi-k2.7-code',
      'pi/qwen/qwen3.7-plus',
      'pi/deepseek/deepseek-v4-pro',
    ])

    const workspaceConfig = readJson(workspaceConfigPath)
    expect(workspaceConfig.defaults.defaultLlmConnection).toBeUndefined()
    expect(workspaceConfig.defaults.model).toBe('legacy-model')
  })

  it('updates an existing system connection without leaking stale connection fields', () => {
    const createdAt = Date.now() - 10_000
    const { configDir, configPath } = setupWorkspaceConfigDir({
      defaultLlmConnection: 'legacy-default',
      llmConnections: [
        {
          slug: 'system-openrouter',
          name: 'Old OpenRouter',
          providerType: 'pi_compat',
          authType: 'api_key',
          baseUrl: 'https://example.invalid/v1',
          defaultModel: 'pi/openrouter/auto',
          models: ['pi/openrouter/auto'],
          createdAt,
        },
      ],
    })

    const run = runBootstrap(configDir)
    expect(run.exitCode).toBe(0)

    const config = readJson(configPath)
    const connection = config.llmConnections.find((item: any) => item.slug === 'system-openrouter')
    expect(connection.createdAt).toBe(createdAt)
    expect(connection.providerType).toBe('pi')
    expect(connection.authType).toBe('environment')
    expect(connection.piAuthProvider).toBe('openrouter')
    expect(connection.baseUrl).toBeUndefined()
    expect(connection.defaultModel).toBe('pi/minimax/minimax-m3')
    expect(config.defaultLlmConnection).toBe('system-openrouter')
  })

  it('fails fast when managed mode is enabled without OPENROUTER_API_KEY', () => {
    const { configDir } = setupWorkspaceConfigDir()

    const run = runBootstrap(configDir, { OPENROUTER_API_KEY: '' })
    expect(run.exitCode).not.toBe(0)
    expect(run.stderr.toString()).toContain('OPENROUTER_API_KEY is required when WUDI_MANAGED_LLM=true')
  })
})
