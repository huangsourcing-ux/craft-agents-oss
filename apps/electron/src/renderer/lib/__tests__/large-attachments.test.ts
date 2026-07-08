import { describe, expect, it } from 'bun:test'
import type { TransportConnectionState } from '../../../shared/types'
import {
  canUsePathOnlyAttachment,
  createPathOnlyAttachment,
  createPathOnlyStoredAttachment,
  getAttachmentType,
  isPathOnlyAttachment,
  LARGE_ATTACHMENT_PATH_ONLY_THRESHOLD,
} from '../large-attachments'

function state(overrides: Partial<TransportConnectionState>): TransportConnectionState {
  return {
    mode: 'local',
    status: 'connected',
    url: 'ws://127.0.0.1:9000',
    attempt: 0,
    updatedAt: 1,
    ...overrides,
  }
}

describe('large attachment path-only helpers', () => {
  it('creates path-only metadata for large xlsx files without inline content', () => {
    const attachment = createPathOnlyAttachment({
      path: '/Users/me/Downloads/big.xlsx',
      name: 'big.xlsx',
      size: LARGE_ATTACHMENT_PATH_ONLY_THRESHOLD + 1,
    })

    expect(attachment.type).toBe('office')
    expect(attachment.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(attachment.base64).toBeUndefined()
    expect(attachment.text).toBeUndefined()
    expect(isPathOnlyAttachment(attachment)).toBe(true)
  })

  it('rejects non-localhost remote transports for path-only local files', () => {
    expect(canUsePathOnlyAttachment(state({ mode: 'remote', url: 'wss://agents.example.com' }))).toBe(false)
    expect(canUsePathOnlyAttachment(state({ mode: 'remote', url: 'ws://127.0.0.1:9090' }))).toBe(true)
    expect(canUsePathOnlyAttachment(state({ mode: 'local', url: 'ws://192.168.1.10:9090' }))).toBe(true)
  })

  it('turns path-only attachments into stored metadata that points at the original path', () => {
    const attachment = createPathOnlyAttachment({
      path: '/Users/me/Downloads/big.xls',
      name: 'big.xls',
      size: LARGE_ATTACHMENT_PATH_ONLY_THRESHOLD + 1,
    })

    expect(createPathOnlyStoredAttachment(attachment, 'att-1')).toEqual({
      id: 'att-1',
      type: 'office',
      name: 'big.xls',
      mimeType: 'application/vnd.ms-excel',
      size: LARGE_ATTACHMENT_PATH_ONLY_THRESHOLD + 1,
      storedPath: '/Users/me/Downloads/big.xls',
    })
  })

  it('detects xls and xlsx names as office files even when the OS MIME type is empty', () => {
    expect(getAttachmentType('report.xls', '')).toBe('office')
    expect(getAttachmentType('report.xlsx', '')).toBe('office')
  })
})
