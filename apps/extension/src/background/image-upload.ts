import { imgurClientIdPool, StorageKey, V2EX_DOMAINS } from '../constants'
import { IMAGE_UPLOAD_MESSAGE, type ImageUploadResult, type UploadImagePayload, uploadToImageHost } from '../image-hosts'
import type { ImageUploadSettings } from '../types'

export function isImageUploadSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) {
    return false
  }

  if (sender.url.startsWith(chrome.runtime.getURL(''))) {
    return true
  }

  try {
    const url = new URL(sender.url)

    return url.protocol === 'https:' && V2EX_DOMAINS.includes(url.hostname)
  }
  catch {
    return false
  }
}

export async function handleImageUpload(
  payload: UploadImagePayload,
  sender: chrome.runtime.MessageSender,
): Promise<ImageUploadResult> {
  if (!isImageUploadSender(sender)) {
    return { ok: false, error: '无效的图片上传来源。' }
  }

  try {
    const stored = await chrome.storage.local.get(StorageKey.ImageUpload)
    const settings = (stored[StorageKey.ImageUpload] ?? { provider: 'imgbb' }) as ImageUploadSettings
    const clientId = imgurClientIdPool[Math.floor(Math.random() * imgurClientIdPool.length)]

    return { ok: true, url: await uploadToImageHost(payload, settings, clientId) }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '图片上传失败，请重试。' }
  }
}

export function registerImageUploadHandler(): void {
  type UploadMessage = { action?: string, file?: UploadImagePayload }
  chrome.runtime.onMessage.addListener((message: UploadMessage, sender, respond) => {
    if (message?.action !== IMAGE_UPLOAD_MESSAGE) {
      return false
    }

    void handleImageUpload(message.file as UploadImagePayload, sender).then(respond)

    return true
  })
}
