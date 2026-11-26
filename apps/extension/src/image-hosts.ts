import type { ImageUploadSettings } from './types'

export const IMAGE_UPLOAD_MESSAGE = 'v2p:image-upload'
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const UPLOAD_TIMEOUT = 25000
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'])

export interface UploadImagePayload {
  name: string
  type: string
  base64: string
}

export type ImageUploadResult = { ok: true, url: string } | { ok: false, error: string }

export function validateImage(type: string, size: number): void {
  if (!IMAGE_TYPES.has(type)) {
    throw new Error('请选择 PNG、JPG、GIF、WebP、BMP 或 TIFF 图片。')
  }

  if (size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new Error('图片不能为空，单张图片最大 10 MB。')
  }
}

function imageUrl(value: unknown, provider: ImageUploadSettings['provider']): string {
  if (typeof value !== 'string') {
    throw new Error('图床未返回图片直链，请稍后重试。')
  }

  let url: URL

  try {
    url = new URL(value)
  }
  catch {
    throw new Error('图床返回了无效的图片直链。')
  }

  const hostname = provider === 'imgbb' ? 'i.ibb.co' : 'i.imgur.com'

  if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) {
    throw new Error('图床返回了无效的图片直链。')
  }

  return url.href
}

interface UploadResponse {
  success?: boolean
  data?: { url?: string, link?: string, error?: string | { message?: string } }
  error?: { message?: string }
}

/** Runs in the extension background, never in the V2EX page origin. */
export async function uploadToImageHost(
  payload: UploadImagePayload,
  settings: ImageUploadSettings,
  imgurClientId: string,
): Promise<string> {
  if (!payload || typeof payload.base64 !== 'string' || typeof payload.name !== 'string'
    || typeof payload.type !== 'string' || payload.name.length > 256
    || payload.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || payload.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(payload.base64)) {
    throw new Error('图片数据无效或超过 10 MB，请重新选择图片。')
  }

  if (settings.provider !== 'imgbb' && settings.provider !== 'imgur') {
    throw new Error('请选择支持的图床。')
  }

  const key = settings.imgbbApiKey?.trim() ?? ''

  if (settings.provider === 'imgbb' && !key) {
    throw new Error('请先打开插件选项 → 图床设置，填写并保存你的 ImgBB API Key。')
  }

  const binary = atob(payload.base64)
  validateImage(payload.type, binary.length)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const form = new FormData()
  form.append('image', new Blob([bytes], { type: payload.type }), payload.name)

  if (settings.provider === 'imgbb') {
    form.append('key', key)
  }

  const providerName = settings.provider === 'imgbb' ? 'ImgBB' : 'Imgur'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT)

  try {
    const response = await fetch(
      settings.provider === 'imgbb' ? 'https://api.imgbb.com/1/upload' : 'https://api.imgur.com/3/upload',
      {
        method: 'POST',
        body: form,
        credentials: 'omit',
        signal: controller.signal,
        ...settings.provider === 'imgur' ? { headers: { Authorization: `Client-ID ${imgurClientId}` } } : {},
      },
    )
    let data: UploadResponse

    try {
      data = await response.json() as UploadResponse
    }
    catch {
      throw new Error(`${providerName} 返回了非 JSON 响应（HTTP ${response.status}），请稍后重试或切换图床。`)
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`${providerName} 返回了无效的上传结果，请稍后重试。`)
    }

    if (!response.ok || data.success !== true) {
      const rawDetail = typeof data.data?.error === 'string'
        ? data.data.error
        : data.data?.error?.message ?? data.error?.message
      const detail = typeof rawDetail === 'string' ? rawDetail : '请求被拒绝，请检查 API Key 或稍后重试。'
      const safeDetail = key ? detail.split(key).join('[已隐藏]') : detail
      throw new Error(`${providerName} 上传失败（HTTP ${response.status}）：${safeDetail.slice(0, 350)}`)
    }

    return imageUrl(settings.provider === 'imgbb' ? data.data?.url : data.data?.link, settings.provider)
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${providerName} 上传超时，请稍后重试。`, { cause: error })
    }

    if (error instanceof TypeError) {
      throw new Error(`无法连接 ${providerName}，请检查网络以及插件的图床访问权限。`, { cause: error })
    }

    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}
