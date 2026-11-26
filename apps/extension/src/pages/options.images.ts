import { StorageKey } from '../constants'
import type { ImageUploadSettings } from '../types'

/** Separate local-only form: never save the key into the synced Options object. */
export async function initImageHostOptions(): Promise<void> {
  const stored = await chrome.storage.local.get(StorageKey.ImageUpload)
  const settings = (stored[StorageKey.ImageUpload] ?? { provider: 'imgbb' }) as ImageUploadSettings
  $('#image-host-provider').val(settings.provider)
  $('#imgbb-api-key').val(settings.imgbbApiKey ?? '')

  const updateFields = () => {
    $('#imgbb-key-field').toggle($('#image-host-provider').val() === 'imgbb')
  }

  updateFields()
  $('#image-host-provider').on('change', updateFields)
  $('#image-host-form').on('submit', (event) => {
    event.preventDefault()

    void (async () => {
      const $status = $('#image-host-status')
      const provider = $('#image-host-provider').val()
      const imgbbApiKey = String($('#imgbb-api-key').val() ?? '').trim()

      if (provider !== 'imgbb' && provider !== 'imgur') {
        return
      }

      if (provider === 'imgbb' && (!imgbbApiKey || /\s/.test(imgbbApiKey))) {
        $status.text('请填写有效的 ImgBB API Key。')

        return
      }

      try {
        await chrome.storage.local.set({ [StorageKey.ImageUpload]: { provider, imgbbApiKey } })
        $status.text('已保存。回到 V2EX 页面即可上传，无需登录 Imgur。')
      }
      catch {
        $status.text('保存失败，请重新打开插件选项后重试。')
      }
    })()
  })
  $('#image-host-clear-key').on('click', () => {
    void (async () => {
      const current = await chrome.storage.local.get(StorageKey.ImageUpload)
      const value = current[StorageKey.ImageUpload] as ImageUploadSettings | undefined
      await chrome.storage.local.set({ [StorageKey.ImageUpload]: { provider: value?.provider ?? 'imgbb' } })
      $('#imgbb-api-key').val('')
      $('#image-host-status').text('已清除本机保存的 API Key。')
    })()
  })
}
