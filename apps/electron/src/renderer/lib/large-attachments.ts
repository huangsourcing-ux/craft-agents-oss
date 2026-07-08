import type { StoredAttachment, TransportConnectionState } from '../../shared/types'
import type { FileAttachment } from '@craft-agent/shared/protocol'

// [FORK] Large local files should travel through the agent as filesystem paths
// instead of freezing the renderer while being base64-encoded.
export const LARGE_ATTACHMENT_PATH_ONLY_THRESHOLD = 20 * 1024 * 1024

const OFFICE_EXTENSION_MIME: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'html', 'xml',
  'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'sql', 'csv', 'log', 'ini', 'cfg',
])

const AUDIO_EXTENSIONS = new Set(['ogg', 'opus', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'weba', 'webm'])

export function isAbsoluteAttachmentPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

export function isLocalhostTransportUrl(url?: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '::1'
  } catch {
    return false
  }
}

export function canUsePathOnlyAttachment(
  state: Pick<TransportConnectionState, 'mode' | 'url'> | null | undefined,
): boolean {
  if (!state) return false
  return state.mode === 'local' || isLocalhostTransportUrl(state.url)
}

export function getAttachmentExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/)
  return match?.[1] ?? ''
}

export function getAttachmentType(fileName: string, mimeType = ''): FileAttachment['type'] {
  const lowerMime = mimeType.toLowerCase()
  const ext = getAttachmentExtension(fileName)

  if (lowerMime.startsWith('image/')) return 'image'
  if (lowerMime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (lowerMime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (lowerMime.includes('officedocument') || ext in OFFICE_EXTENSION_MIME) return 'office'
  if (lowerMime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text'

  return 'unknown'
}

export function getAttachmentMimeType(fileName: string, mimeType = ''): string {
  if (mimeType) return mimeType
  const ext = getAttachmentExtension(fileName)
  if (ext === 'pdf') return 'application/pdf'
  return OFFICE_EXTENSION_MIME[ext] ?? (TEXT_EXTENSIONS.has(ext) ? 'text/plain' : 'application/octet-stream')
}

export function createPathOnlyAttachment(input: {
  path: string
  name: string
  mimeType?: string
  size: number
}): FileAttachment {
  const mimeType = getAttachmentMimeType(input.name, input.mimeType)
  return {
    type: getAttachmentType(input.name, mimeType),
    path: input.path,
    name: input.name,
    mimeType,
    size: input.size,
  }
}

export function isPathOnlyAttachment(attachment: FileAttachment): boolean {
  return isAbsoluteAttachmentPath(attachment.path)
    && attachment.base64 === undefined
    && attachment.text === undefined
}

export function createPathOnlyStoredAttachment(
  attachment: FileAttachment,
  id: string,
): StoredAttachment {
  return {
    id,
    type: attachment.type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    storedPath: attachment.path,
  }
}
