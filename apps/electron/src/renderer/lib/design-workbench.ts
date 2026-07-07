import { authClient } from './auth-client'

export type DesignTaskStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed'
export type DesignItemStatus = 'queued' | 'generating' | 'done' | 'failed'
export type DesignLanguage = 'zh' | 'en'
export type DesignAspectRatio = 'smart' | '1:1' | '3:4' | '16:9'

export interface DesignTemplate {
  id: string
  name: string
  description: string
  sortOrder: number
}

export interface DesignItem {
  id: string
  taskId: string
  templateId: string
  templateName: string
  status: DesignItemStatus
  prompt: string
  model: string
  assetUrl?: string
  error?: string
  retryCount: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface DesignTask {
  id: string
  productDescription: string
  language: DesignLanguage
  aspectRatio: DesignAspectRatio
  model: string
  status: DesignTaskStatus
  totalItems: number
  completedItems: number
  failedItems: number
  sourceImageName?: string
  sourceImageMimeType: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  items: DesignItem[]
}

interface ListTemplatesResponse {
  templates: DesignTemplate[]
}

interface TaskResponse {
  task: DesignTask
}

interface ListTasksResponse {
  tasks: DesignTask[]
}

export const DEFAULT_DESIGN_TEMPLATES: DesignTemplate[] = [
  { id: 'hero-poster', name: '首屏海报图', description: '快速抓住用户注意力，传递产品核心定位。', sortOrder: 10 },
  { id: 'texture-closeup', name: '细节展示图', description: '放大核心细节，直观呈现工艺品质与精致做工。', sortOrder: 20 },
  { id: 'function-overview', name: '功能速览图', description: '集中呈现核心功能，让用户快速理解产品能力。', sortOrder: 30 },
  { id: 'benefit-infographic', name: '核心卖点图', description: '直击产品核心优势，突出购买亮点。', sortOrder: 40 },
  { id: 'spec-parameters', name: '规格参数图', description: '呈现规格参数，清晰展示产品硬核信息。', sortOrder: 50 },
  { id: 'comparison-chart', name: '对比图', description: '通过对比突出产品优势，强化购买决策。', sortOrder: 60 },
  { id: 'lifestyle-scene', name: '场景展示图', description: '展示真实使用场景，直观感受产品价值。', sortOrder: 70 },
  { id: 'white-background', name: '白底图', description: '生成干净规范的白底商品图，突出商品主体。', sortOrder: 80 },
]

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authClient.request(path, init)
  const contentType = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const body = contentType.includes('application/json')
      ? await res.json().catch(() => null) as { error?: string } | null
      : null
    throw new Error(body?.error || `请求失败 (${res.status})`)
  }
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '')
    const preview = text.replace(/\s+/g, ' ').slice(0, 120)
    const isHtml = contentType.includes('text/html') || preview.toLowerCase().startsWith('<!doctype html') || preview.toLowerCase().startsWith('<html')
    throw new Error(
      isHtml
        ? `设计接口请求打到了前端 HTML 页面，不是 auth-gateway。url=${res.url || path}，status=${res.status}，content-type=${contentType || 'unknown'}`
        : `设计服务返回了非 JSON 内容。url=${res.url || path}，status=${res.status}，content-type=${contentType || 'unknown'}，body=${preview || '<empty>'}`
    )
  }
  return await res.json() as T
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToImagePayload(dataUrl: string, fallbackMimeType: string): { imageBase64: string; imageMimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('图片格式无法识别')
  }
  return {
    imageMimeType: match[1] || fallbackMimeType,
    imageBase64: match[2],
  }
}

export async function listDesignTemplates(): Promise<DesignTemplate[]> {
  const body = await requestJson<ListTemplatesResponse>('/api/design/templates')
  return body.templates
}

export async function listDesignTasks(limit = 12): Promise<DesignTask[]> {
  const body = await requestJson<ListTasksResponse>(`/api/design/tasks?limit=${encodeURIComponent(String(limit))}`)
  return body.tasks
}

export async function getDesignTask(taskId: string): Promise<DesignTask> {
  const body = await requestJson<TaskResponse>(`/api/design/tasks/${encodeURIComponent(taskId)}`)
  return body.task
}

export async function createDesignTask(input: {
  file: File
  productDescription: string
  language: DesignLanguage
  aspectRatio: DesignAspectRatio
  templateIds: string[]
}): Promise<DesignTask> {
  const dataUrl = await readFileAsDataUrl(input.file)
  const imagePayload = dataUrlToImagePayload(dataUrl, input.file.type)
  const body = await requestJson<TaskResponse>('/api/design/tasks', {
    method: 'POST',
    body: JSON.stringify({
      ...imagePayload,
      imageName: input.file.name,
      productDescription: input.productDescription,
      language: input.language,
      aspectRatio: input.aspectRatio,
      templateIds: input.templateIds,
    }),
  })
  return body.task
}

export async function regenerateDesignItem(itemId: string): Promise<DesignTask> {
  const body = await requestJson<TaskResponse>(`/api/design/items/${encodeURIComponent(itemId)}/regenerate`, {
    method: 'POST',
  })
  return body.task
}

export async function fetchDesignAsset(assetUrl: string): Promise<Blob> {
  const res = await authClient.request(assetUrl)
  if (!res.ok) {
    throw new Error(`图片获取失败 (${res.status})`)
  }
  return await res.blob()
}

export async function downloadDesignAsset(assetUrl: string, filename: string): Promise<void> {
  const blob = await fetchDesignAsset(assetUrl)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
