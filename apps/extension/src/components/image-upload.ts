import { getRuntime } from '../runtime'
import { uploadImage } from '../services'

interface ImageUploadProps {
  $wrapper: JQuery
  $input?: JQuery
  /** 向文本输入框中插入占位文本。 */
  insertText: (text: string) => void
  /** 替换占位文本，当 replace 为非空字符串时，表示图片上传成功，参数值为图片链接。 */
  replaceText: (find: string, replace: string) => void
}

const uploadTip = '选择、粘贴、拖放上传图片。'

interface ImageUploadControl {
  uploadBar: JQuery
}

export function bindImageUpload(props: ImageUploadProps): ImageUploadControl {
  const { $wrapper, $input, insertText, replaceText } = props

  const $uploadBar = $('<div class="v2p-reply-upload-bar"></div>')
  const $status = $('<span></span>').text(uploadTip).appendTo($uploadBar)
  let uploading = false

  if (getRuntime().isBrowserExtension) {
    $('<button type="button" class="v2p-image-host-settings">图床设置</button>')
      .on('click', (event) => {
        event.stopPropagation()
        getRuntime().ui.openOptions('images')
      })
      .appendTo($uploadBar)
  }

  const handleUploadImage = (file: File) => {
    if (uploading) {
      return
    }

    uploading = true
    const placeholder = `[上传图片中-${Date.now()}]`
    insertText(` ${placeholder} `)
    $uploadBar.addClass('v2p-reply-upload-bar-disabled')
    $status.text('正在上传图片...')

    uploadImage(file)
      .then((imgLink) => {
        replaceText(placeholder, imgLink)
      })
      .catch((error: unknown) => {
        replaceText(placeholder, '')
        window.alert(error instanceof Error ? error.message : '图片上传失败，请稍后重试。')
      })
      .finally(() => {
        uploading = false
        $uploadBar.removeClass('v2p-reply-upload-bar-disabled')
        $status.text(uploadTip)
      })
  }

  const handleClickUploadImage = () => {
    const imgInput = document.createElement('input')

    imgInput.style.display = 'none'
    imgInput.type = 'file'
    imgInput.accept = 'image/*'

    imgInput.addEventListener('change', () => {
      const selectedFile = imgInput.files?.[0]

      if (selectedFile) {
        handleUploadImage(selectedFile)
      }
    })

    imgInput.click()
  }

  // 粘贴图片并上传的功能。
  document.addEventListener('paste', (ev) => {
    if (!(ev instanceof ClipboardEvent)) {
      return
    }

    if ($input && !$input.get(0)?.matches(':focus')) {
      return
    }

    const items = ev.clipboardData?.items

    if (!items) {
      return
    }

    // 查找属于图像类型的数据项。
    const imageItem = Array.from(items).find((item) => item.type.includes('image'))

    if (imageItem) {
      const file = imageItem.getAsFile()

      if (file) {
        ev.preventDefault()
        ev.stopImmediatePropagation()
        handleUploadImage(file)
      }
    }
  }, true)

  $wrapper.get(0)?.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault()
    }
  })

  $wrapper.get(0)?.addEventListener('drop', (ev) => {
    ev.preventDefault()

    if (!(ev instanceof DragEvent)) {
      return
    }

    const file = ev.dataTransfer?.files[0]

    if (file) {
      ev.stopImmediatePropagation()
      handleUploadImage(file)
    }
  }, true)

  $('.flex-one-row:last-of-type > .gray').text('')

  $uploadBar.on('click', () => {
    if (!$uploadBar.hasClass('v2p-reply-upload-bar-disabled')) {
      handleClickUploadImage()
    }
  })

  $wrapper.append($uploadBar)

  return {
    uploadBar: $uploadBar,
  }
}
