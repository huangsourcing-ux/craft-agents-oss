import * as React from 'react'
import {
  AlertCircle,
  Check,
  Download,
  ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  DEFAULT_DESIGN_TEMPLATES,
  createDesignTask,
  downloadDesignAsset,
  fetchDesignAsset,
  getDesignTask,
  listDesignTasks,
  listDesignTemplates,
  regenerateDesignItem,
  type DesignAspectRatio,
  type DesignItem,
  type DesignItemStatus,
  type DesignLanguage,
  type DesignTask,
  type DesignTemplate,
} from '@/lib/design-workbench'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const TASK_STATUS_LABEL: Record<DesignTask['status'], string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  partial: '部分完成',
  failed: '生成失败',
}

const ITEM_STATUS_LABEL: Record<DesignItemStatus, string> = {
  queued: '排队中',
  generating: '生成中',
  done: '已完成',
  failed: '失败',
}

const LANGUAGE_OPTIONS: Array<{ value: DesignLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

const ASPECT_OPTIONS: Array<{ value: DesignAspectRatio; label: string }> = [
  { value: 'smart', label: '智能' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
]

function isRunningTask(task?: DesignTask | null): boolean {
  return task?.status === 'queued' || task?.status === 'running'
}

function formatDateTime(value?: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusBadgeClass(status: DesignTask['status'] | DesignItemStatus): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'partial':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'failed':
      return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    case 'running':
    case 'generating':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    default:
      return 'border-foreground/10 bg-foreground/5 text-muted-foreground'
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败'
}

function readPreviewDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('读取图片失败'))
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function upsertTask(tasks: DesignTask[], task: DesignTask): DesignTask[] {
  const next = [task, ...tasks.filter(existing => existing.id !== task.id)]
  return next.slice(0, 12)
}

function TaskStatusBadge({ task }: { task: DesignTask }) {
  return (
    <Badge variant="outline" className={cn('shrink-0', statusBadgeClass(task.status))}>
      {TASK_STATUS_LABEL[task.status]}
    </Badge>
  )
}

function ItemStatusBadge({ status }: { status: DesignItemStatus }) {
  return (
    <Badge variant="outline" className={cn('shrink-0', statusBadgeClass(status))}>
      {ITEM_STATUS_LABEL[status]}
    </Badge>
  )
}

function AssetImage({ item }: { item: DesignItem }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!item.assetUrl || item.status !== 'done') {
      setSrc(null)
      setFailed(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    fetchDesignAsset(item.assetUrl)
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item.assetUrl, item.status])

  if (item.status === 'done' && src) {
    return <img src={src} alt={item.templateName} className="h-full w-full object-cover" />
  }

  if (item.status === 'done' && failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <span className="text-xs">图片加载失败</span>
      </div>
    )
  }

  if (item.status === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-red-600 dark:text-red-300">
        <AlertCircle className="h-5 w-5" />
        <span className="line-clamp-3 text-xs">{item.error || '生成失败'}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-xs">{ITEM_STATUS_LABEL[item.status]}</span>
    </div>
  )
}

function ResultItemCard({
  item,
  onRegenerate,
  regenerating,
}: {
  item: DesignItem
  onRegenerate: (item: DesignItem) => void
  regenerating: boolean
}) {
  const canDownload = item.status === 'done' && item.assetUrl
  const handleDownload = React.useCallback(async () => {
    if (!item.assetUrl) return
    try {
      await downloadDesignAsset(item.assetUrl, `${item.templateName}-${item.id.slice(0, 8)}.png`)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [item])

  return (
    <article className="flex min-h-[320px] flex-col overflow-hidden rounded-md border border-foreground/10 bg-background">
      <div className="aspect-[4/3] bg-foreground/[0.03]">
        <AssetImage item={item} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{item.templateName}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.model}</p>
          </div>
          <ItemStatusBadge status={item.status} />
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => onRegenerate(item)}
            disabled={regenerating}
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            重试
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleDownload}
            disabled={!canDownload}
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
        </div>
      </div>
    </article>
  )
}

function EmptyResults() {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <ImageIcon className="h-7 w-7" />
        <span className="text-sm">上传商品图后开始生成套图</span>
      </div>
    </div>
  )
}

export default function DesignWorkbenchPage() {
  const [templates, setTemplates] = React.useState<DesignTemplate[]>(DEFAULT_DESIGN_TEMPLATES)
  const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<string[]>(DEFAULT_DESIGN_TEMPLATES.map(template => template.id))
  const [tasks, setTasks] = React.useState<DesignTask[]>([])
  const [currentTask, setCurrentTask] = React.useState<DesignTask | null>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [productDescription, setProductDescription] = React.useState('')
  const [language, setLanguage] = React.useState<DesignLanguage>('zh')
  const [aspectRatio, setAspectRatio] = React.useState<DesignAspectRatio>('smart')
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [regeneratingItemId, setRegeneratingItemId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const previewReadIdRef = React.useRef(0)

  const selectedCount = selectedTemplateIds.length
  const currentProgress = currentTask
    ? `${currentTask.completedItems}/${currentTask.totalItems}`
    : `0/${templates.length || DEFAULT_DESIGN_TEMPLATES.length}`

  const refreshTasks = React.useCallback(async () => {
    const nextTasks = await listDesignTasks()
    setTasks(nextTasks)
    if (!currentTask && nextTasks[0]) {
      setCurrentTask(nextTasks[0])
    } else if (currentTask) {
      const latest = nextTasks.find(task => task.id === currentTask.id)
      if (latest) setCurrentTask(latest)
    }
  }, [currentTask])

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      listDesignTemplates().catch(error => {
        if (!cancelled) {
          setError(getErrorMessage(error))
        }
        return DEFAULT_DESIGN_TEMPLATES
      }),
      listDesignTasks().catch(error => {
        if (!cancelled) {
          setError(getErrorMessage(error))
        }
        return [] as DesignTask[]
      }),
    ])
      .then(([nextTemplates, nextTasks]) => {
        if (cancelled) return
        const sortedTemplates = [...nextTemplates].sort((a, b) => a.sortOrder - b.sortOrder)
        setTemplates(sortedTemplates)
        setSelectedTemplateIds(sortedTemplates.map(template => template.id))
        setTasks(nextTasks)
        setCurrentTask(nextTasks[0] ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!isRunningTask(currentTask)) return
    let cancelled = false
    const timer = window.setInterval(() => {
      if (!currentTask) return
      getDesignTask(currentTask.id)
        .then(task => {
          if (cancelled) return
          setCurrentTask(task)
          setTasks(prev => upsertTask(prev, task))
        })
        .catch(error => {
          if (!cancelled) setError(getErrorMessage(error))
        })
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [currentTask?.id, currentTask?.status])

  const handlePickFile = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null
    if (!picked) return
    if (!ACCEPTED_IMAGE_TYPES.includes(picked.type)) {
      toast.error('仅支持 JPG、PNG、WebP')
      event.target.value = ''
      return
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      toast.error('图片不能超过 10MB')
      event.target.value = ''
      return
    }

    const readId = previewReadIdRef.current + 1
    previewReadIdRef.current = readId
    setFile(picked)
    setPreviewUrl(null)
    readPreviewDataUrl(picked)
      .then(url => {
        if (previewReadIdRef.current === readId) setPreviewUrl(url)
      })
      .catch(error => {
        if (previewReadIdRef.current !== readId) return
        setFile(null)
        setPreviewUrl(null)
        toast.error(getErrorMessage(error))
      })
  }, [])

  const toggleTemplate = React.useCallback((templateId: string) => {
    setSelectedTemplateIds(prev => {
      if (prev.includes(templateId)) {
        return prev.length > 1 ? prev.filter(id => id !== templateId) : prev
      }
      return [...prev, templateId]
    })
  }, [])

  const handleSubmit = React.useCallback(async () => {
    if (!file) {
      toast.error('请先选择商品参考图')
      return
    }
    if (selectedTemplateIds.length === 0) {
      toast.error('至少选择一个模板')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const task = await createDesignTask({
        file,
        productDescription,
        language,
        aspectRatio,
        templateIds: selectedTemplateIds,
      })
      setCurrentTask(task)
      setTasks(prev => upsertTask(prev, task))
      toast.success('生成任务已创建')
    } catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [aspectRatio, file, language, productDescription, selectedTemplateIds])

  const handleRegenerate = React.useCallback(async (item: DesignItem) => {
    setRegeneratingItemId(item.id)
    setError(null)
    try {
      const task = await regenerateDesignItem(item.id)
      setCurrentTask(task)
      setTasks(prev => upsertTask(prev, task))
      toast.success('已重新生成')
    } catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(message)
    } finally {
      setRegeneratingItemId(null)
    }
  }, [])

  const handleRefresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await refreshTasks()
    } catch (error) {
      const message = getErrorMessage(error)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [refreshTasks])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PanelHeader
        title="商品套图工作台"
        actions={
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-foreground/10 p-4">
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">参考图</h2>
                <span className="text-xs text-muted-foreground">JPG / PNG / WebP</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'group flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] text-left transition-colors hover:border-foreground/30',
                  previewUrl && 'border-solid bg-black'
                )}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="商品参考图" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UploadCloud className="h-7 w-7" />
                    <span className="text-sm">选择商品图片</span>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={handlePickFile}
              />
              {file && (
                <div className="truncate text-xs text-muted-foreground">
                  {file.name}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">商品说明</h2>
              <Textarea
                value={productDescription}
                onChange={event => setProductDescription(event.target.value.slice(0, 500))}
                placeholder="材质、适用场景、核心卖点、不能改动的包装细节"
                className="min-h-[110px] resize-none text-sm"
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">语言</h2>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGE_OPTIONS.map(option => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={language === option.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 justify-center gap-1.5"
                    onClick={() => setLanguage(option.value)}
                  >
                    {language === option.value && <Check className="h-3.5 w-3.5" />}
                    {option.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">比例</h2>
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_OPTIONS.map(option => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={aspectRatio === option.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 justify-center px-2"
                    onClick={() => setAspectRatio(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">模板</h2>
                <span className="text-xs text-muted-foreground">{selectedCount}/{templates.length}</span>
              </div>
              <div className="space-y-2">
                {templates.map(template => {
                  const selected = selectedTemplateIds.includes(template.id)
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => toggleTemplate(template.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                        selected ? 'border-foreground/25 bg-foreground/[0.04]' : 'border-foreground/10 hover:border-foreground/20'
                      )}
                    >
                      <span className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        selected ? 'border-foreground bg-foreground text-background' : 'border-foreground/25'
                      )}>
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{template.name}</span>
                        <span className="mt-1 line-clamp-3 block text-xs leading-5 text-muted-foreground">{template.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <Button
              type="button"
              className="h-10 w-full gap-2"
              onClick={handleSubmit}
              disabled={submitting || !file || selectedTemplateIds.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              开始生成
            </Button>

            {error && (
              <div className="flex gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-700 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-foreground/10 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">当前任务</h2>
                {currentTask && <TaskStatusBadge task={currentTask} />}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {currentTask ? `${currentTask.sourceImageName || '商品图'} · ${formatDateTime(currentTask.createdAt)} · ${currentProgress}` : '暂无任务'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="border-transparent">
                单模型
              </Badge>
              <Badge variant="secondary" className="border-transparent">
                {currentTask?.model || 'gpt-image-1'}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {currentTask ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {currentTask.items.map(item => (
                    <ResultItemCard
                      key={item.id}
                      item={item}
                      onRegenerate={handleRegenerate}
                      regenerating={regeneratingItemId === item.id}
                    />
                  ))}
                </div>

                {tasks.length > 1 && (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold">最近任务</h2>
                    <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                      {tasks.map(task => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setCurrentTask(task)}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors',
                            currentTask.id === task.id ? 'border-foreground/25 bg-foreground/[0.04]' : 'border-foreground/10 hover:border-foreground/20'
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{task.sourceImageName || '商品图'}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(task.createdAt)} · {task.completedItems}/{task.totalItems}</span>
                          </span>
                          <TaskStatusBadge task={task} />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <EmptyResults />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
