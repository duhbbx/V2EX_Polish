import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleImageUpload, isImageUploadSender } from '../apps/extension/src/background/image-upload'
import { defaultOptions, StorageKey } from '../apps/extension/src/constants'
import { MAX_IMAGE_BYTES, type UploadImagePayload, uploadToImageHost, validateImage } from '../apps/extension/src/image-hosts'
import { uploadImageViaBackground } from '../apps/extension/src/image-upload-client'
import { applyRemoteSettings, prepareBackupData } from '../apps/extension/src/utils/remote-backup'

const file: UploadImagePayload = { name: 'screenshot.png', type: 'image/png', base64: 'iVBORw0KGgo=' }
const key = 'test-only-imgbb-key'
const directUrl = 'https://i.ibb.co/example/screenshot.png'
const sender = { id: 'test-extension', url: 'https://www.v2ex.com/new' }

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ success: true, data: { url: directUrl } })))
  vi.stubGlobal('chrome', {
    extension: {},
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test-extension/${path}`,
      sendMessage: vi.fn().mockResolvedValue({ ok: true, url: directUrl }),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ [StorageKey.ImageUpload]: { provider: 'imgbb', imgbbApiKey: key } }),
        set: vi.fn().mockResolvedValue(undefined),
      },
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('configurable image hosts', () => {
  it('uploads a file to ImgBB with its key in the body and returns the full-size direct link', async () => {
    expect(await uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')).toBe(directUrl)
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.imgbb.com/1/upload')
    expect(String(url)).not.toContain(key)
    expect(options?.credentials).toBe('omit')
    const form = options?.body as FormData
    expect(form.get('key')).toBe(key)
    const image = form.get('image') as File
    expect(image.name).toBe(file.name)
    expect(image.type).toBe(file.type)
    expect(image.size).toBe(8)
  })

  it('keeps Imgur as an explicit alternative without sending the ImgBB key', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ success: true, data: { link: 'https://i.imgur.com/test.png' } }))
    expect(await uploadToImageHost(file, { provider: 'imgur', imgbbApiKey: key }, 'public-client')).toBe('https://i.imgur.com/test.png')
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.imgur.com/3/upload')
    expect(options?.headers).toEqual({ Authorization: 'Client-ID public-client' })
    expect((options?.body as FormData).has('key')).toBe(false)
  })

  it('requires a user key before making an ImgBB request', async () => {
    await expect(uploadToImageHost(file, { provider: 'imgbb' }, 'unused')).rejects.toThrow('图床设置')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows an upstream rejection and does not silently fall back to another host', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ success: false, data: { error: 'These actions are forbidden.' } }, 400))
    await expect(uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')).rejects.toThrow('These actions are forbidden.')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('redacts a key echoed by an upstream error', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ success: false, error: { message: `Invalid key: ${key}` } }, 400))

    try {
      await uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')
      expect.unreachable()
    }
    catch (error) {
      expect(String(error)).toContain('[已隐藏]')
      expect(String(error)).not.toContain(key)
    }
  })

  it('explains HTML error pages rather than inserting an invalid image', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 }))
    await expect(uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')).rejects.toThrow('HTTP 503')
  })

  it.each(['javascript:alert(1)', 'https://evil.invalid/test.png', 'not a URL'])(
    'rejects an untrusted image URL: %s', async (url) => {
      vi.mocked(fetch).mockResolvedValue(response({ success: true, data: { url } }))
      await expect(uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')).rejects.toThrow('无效的图片直链')
    },
  )

  it('aborts a stalled upload with an actionable timeout', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const check = expect(uploadToImageHost(file, { provider: 'imgbb', imgbbApiKey: key }, 'unused')).rejects.toThrow('上传超时')
    await vi.advanceTimersByTimeAsync(25000)
    await check
  })

  it('rejects empty, oversized or unsupported images before upload', () => {
    expect(() => validateImage('image/png', 0)).toThrow('不能为空')
    expect(() => validateImage('image/png', MAX_IMAGE_BYTES + 1)).toThrow('10 MB')
    expect(() => validateImage('image/svg+xml', 100)).toThrow('请选择')
  })
})

describe('background bridge and key isolation', () => {
  it('only accepts messages from this extension on HTTPS V2EX or its own pages', () => {
    expect(isImageUploadSender(sender)).toBe(true)
    expect(isImageUploadSender({ id: sender.id, url: 'chrome-extension://test-extension/pages/options.html' })).toBe(true)
    expect(isImageUploadSender({ ...sender, id: 'other-extension' })).toBe(false)
    expect(isImageUploadSender({ ...sender, url: 'https://www.v2ex.com.evil.invalid/' })).toBe(false)
    expect(isImageUploadSender({ ...sender, url: 'http://www.v2ex.com/new' })).toBe(false)
  })

  it('does not access credentials or make requests for an untrusted sender', async () => {
    expect(await handleImageUpload(file, { ...sender, url: 'https://evil.invalid/' })).toEqual({ ok: false, error: '无效的图片上传来源。' })
    expect(chrome.storage.local.get).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gets the provider and key from device-local storage in the background', async () => {
    expect(await handleImageUpload(file, sender)).toEqual({ ok: true, url: directUrl })
    expect(chrome.storage.local.get).toHaveBeenCalledWith(StorageKey.ImageUpload)
    expect(chrome.storage.sync.get).not.toHaveBeenCalled()
  })

  it('sends file data to the background without an API key', async () => {
    const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
    const image = new File([bytes], file.name, { type: file.type })
    expect(await uploadImageViaBackground(image)).toBe(directUrl)
    const message = vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0]
    expect(message).toEqual({ action: 'v2p:image-upload', file })
    expect(JSON.stringify(message)).not.toContain(key)
  })

  it('excludes provider credentials from exported and remote backup settings', () => {
    const result = prepareBackupData({ [StorageKey.Options]: defaultOptions, [StorageKey.ImageUpload]: { provider: 'imgbb', imgbbApiKey: key } })
    expect(result[StorageKey.ImageUpload]).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(key)
  })

  it('does not restore or sync upload credentials from an imported backup', async () => {
    await applyRemoteSettings({ [StorageKey.Options]: defaultOptions, [StorageKey.ImageUpload]: { provider: 'imgbb', imgbbApiKey: key } })
    expect(JSON.stringify(vi.mocked(chrome.storage.sync.set).mock.calls)).not.toContain(key)
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })
})
