import { IMAGE_UPLOAD_MESSAGE, type ImageUploadResult, validateImage } from './image-hosts'

export async function uploadImageViaBackground(file: File): Promise<string> {
  validateImage(file.type, file.size)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }

  let result: ImageUploadResult

  try {
    result = await chrome.runtime.sendMessage<unknown, ImageUploadResult>({
      action: IMAGE_UPLOAD_MESSAGE,
      file: { name: file.name, type: file.type, base64: btoa(binary) },
    })
  }
  catch {
    throw new Error('无法连接插件后台。请刷新 V2EX 页面；更新插件后请重新打开页面。')
  }

  if (!result || !result.ok) {
    throw new Error(result?.error ?? '插件后台未返回上传结果，请刷新页面后重试。')
  }

  return result.url
}
