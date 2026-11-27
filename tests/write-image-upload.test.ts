// @vitest-environment happy-dom

import { createRequire } from 'node:module'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getWritePageMatches } from '../apps/extension/shared/write-page'
import { handleWrite } from '../apps/extension/src/contents/write/write'
import { uploadImage } from '../apps/extension/src/services'

vi.mock('../apps/extension/src/runtime', () => ({
  getRuntime: () => ({ isBrowserExtension: true, ui: { openOptions: vi.fn() } }),
}))
vi.mock('../apps/extension/src/services', () => ({ uploadImage: vi.fn() }))
vi.mock('../apps/extension/src/post-task', () => ({ postTask: vi.fn() }))

const requireExtension = createRequire(path.resolve('apps/extension/package.json'))
// Use the extension's existing jQuery dependency in the DOM regression test.
const jquery = requireExtension('jquery')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('compose image upload', () => {
  it('covers bare, query and node compose URLs on allowed hosts', () => {
    const patterns = getWritePageMatches(['www.v2ex.com'])

    expect(patterns).toEqual([
      'https://www.v2ex.com/write',
      'https://www.v2ex.com/write?*',
      'https://www.v2ex.com/write/*',
      'https://www.v2ex.com/new',
      'https://www.v2ex.com/new?*',
      'https://www.v2ex.com/new/*',
    ])
  })

  it('uploads pasted images in the new editor, keeps surrounding text and ignores the title', async () => {
    vi.stubGlobal('$', jquery)
    document.body.innerHTML = '<form><textarea id="topic_title"></textarea><div><textarea id="topic_content"></textarea></div></form>'
    const input = document.querySelector<HTMLTextAreaElement>('#topic_content')!
    const title = document.querySelector<HTMLTextAreaElement>('#topic_title')!
    const changes = vi.fn()
    input.addEventListener('input', changes)
    let finishUpload!: (url: string) => void
    vi.mocked(uploadImage).mockImplementation(() => new Promise((resolve) => {
      finishUpload = resolve
    }))

    // Remove document-level listeners after the test, like navigating away from the page.
    const addListener = document.addEventListener.bind(document)
    type Listener = [
      string,
      EventListenerOrEventListenerObject,
      boolean | AddEventListenerOptions | undefined,
    ]
    const listeners: Listener[] = []
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      listeners.push([type, listener, options])
      addListener(type, listener, options)
    })

    try {
      handleWrite()
      expect(document.querySelector('.v2p-reply-upload-bar')?.textContent).toContain('图床设置')
      const file = new File(['image'], 'screenshot.png', { type: 'image/png' })

      const pasteImage = (target: HTMLTextAreaElement) => {
        const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', { value: {
          items: [{ type: 'image/png', getAsFile: () => file }], files: [file],
        } })
        target.focus()
        target.dispatchEvent(event)

        return event
      }

      expect(pasteImage(title).defaultPrevented).toBe(false)
      expect(uploadImage).not.toHaveBeenCalled()
      input.value = 'before after'
      input.setSelectionRange(7, 7)
      expect(pasteImage(input).defaultPrevented).toBe(true)
      expect(uploadImage).toHaveBeenCalledWith(file)
      expect(input.value).toContain('[上传图片中-')
      input.value += ' still typing'
      finishUpload('https://i.ibb.co/test/screenshot.png')
      await vi.waitFor(() => {
        expect(input.value).toBe('before  ![](https://i.ibb.co/test/screenshot.png) after still typing')
      })
      expect(changes).toHaveBeenCalledTimes(2)
    }
    finally {
      listeners.forEach(([type, listener, options]) => {
        document.removeEventListener(type, listener, options)
      })
    }
  })
})
