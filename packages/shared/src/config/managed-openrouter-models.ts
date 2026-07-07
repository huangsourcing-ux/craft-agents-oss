import type { ModelDefinition } from './models.ts';

export const DEFAULT_MANAGED_OPENROUTER_MODEL_ID = 'minimax/minimax-m3';

export const MANAGED_OPENROUTER_MODELS: ModelDefinition[] = [
  {
    id: 'z-ai/glm-5.2',
    name: 'Z.ai: GLM 5.2',
    shortName: 'GLM 5.2',
    description: 'Long-context text model via OpenRouter.',
    provider: 'pi',
    contextWindow: 1_048_576,
    supportsThinking: true,
    supportsImages: false,
  },
  {
    id: 'xiaomi/mimo-v2.5',
    name: 'Xiaomi: MiMo-V2.5',
    shortName: 'MiMo V2.5',
    description: 'Multimodal model via OpenRouter.',
    provider: 'pi',
    contextWindow: 1_048_576,
    supportsThinking: true,
    supportsImages: true,
  },
  {
    id: DEFAULT_MANAGED_OPENROUTER_MODEL_ID,
    name: 'MiniMax: MiniMax M3',
    shortName: 'MiniMax M3',
    description: 'Default multimodal model via OpenRouter.',
    provider: 'pi',
    contextWindow: 1_048_576,
    supportsThinking: true,
    supportsImages: true,
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    name: 'MoonshotAI: Kimi K2.7 Code',
    shortName: 'Kimi K2.7 Code',
    description: 'Code-focused multimodal model via OpenRouter.',
    provider: 'pi',
    contextWindow: 262_144,
    supportsThinking: true,
    supportsImages: true,
  },
  {
    id: 'qwen/qwen3.7-plus',
    name: 'Qwen: Qwen3.7 Plus',
    shortName: 'Qwen3.7 Plus',
    description: 'General multimodal model via OpenRouter.',
    provider: 'pi',
    contextWindow: 1_000_000,
    supportsThinking: true,
    supportsImages: true,
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: DeepSeek V4 Pro',
    shortName: 'DeepSeek V4 Pro',
    description: 'Long-context text model via OpenRouter.',
    provider: 'pi',
    contextWindow: 1_048_576,
    supportsThinking: true,
    supportsImages: false,
  },
];

const MANAGED_OPENROUTER_MODEL_IDS = new Set(MANAGED_OPENROUTER_MODELS.map(model => model.id));

export function stripManagedOpenRouterPiPrefix(modelId: string): string {
  return modelId.startsWith('pi/') ? modelId.slice(3) : modelId;
}

export function isManagedOpenRouterModelId(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  return MANAGED_OPENROUTER_MODEL_IDS.has(stripManagedOpenRouterPiPrefix(modelId));
}

export function resolveManagedOpenRouterModelId(modelId: string | null | undefined): string {
  if (!modelId) return DEFAULT_MANAGED_OPENROUTER_MODEL_ID;
  const bareModelId = stripManagedOpenRouterPiPrefix(modelId);
  return MANAGED_OPENROUTER_MODEL_IDS.has(bareModelId)
    ? bareModelId
    : DEFAULT_MANAGED_OPENROUTER_MODEL_ID;
}

export function toManagedOpenRouterPiModelId(modelId: string | null | undefined): string {
  return `pi/${resolveManagedOpenRouterModelId(modelId)}`;
}

export function getManagedOpenRouterModels(options?: { piPrefix?: boolean }): ModelDefinition[] {
  const piPrefix = options?.piPrefix === true;
  return MANAGED_OPENROUTER_MODELS.map(model => ({
    ...model,
    id: piPrefix ? `pi/${model.id}` : model.id,
  }));
}
