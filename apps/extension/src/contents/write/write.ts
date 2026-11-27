import { bindImageUpload } from '../../components/image-upload'
import { postTask } from '../../post-task'

export function handleWrite() {
  // 新版 /new/<node> 使用原生文本框，不再提供 workspace / editor。
  const input = document.querySelector<HTMLTextAreaElement>('#topic_content')

  if (input) {
    const notifyChange = () => input.dispatchEvent(new Event('input', { bubbles: true }))

    bindImageUpload({
      $wrapper: $(input).parent(),
      $input: $(input),
      insertText: (text) => {
        input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end')
        notifyChange()
      },
      replaceText: (find, replace) => {
        const start = input.value.indexOf(find)

        if (start < 0) {
          return
        }

        input.setRangeText(replace ? `![](${replace})` : '', start, start + find.length, 'preserve')
        notifyChange()
      },
    })

    return
  }

  if (!$('#workspace').length) {
    return
  }

  bindImageUpload({
    $wrapper: $('#workspace'),
    insertText: (text: string) => {
      postTask(`editor.getDoc().replaceRange(${JSON.stringify(text)}, editor.getCursor())`)
    },
    replaceText: (find: string, replace: string) => {
      if (replace) {
        const mode = $('input[name=syntax]:checked').val()

        // 特殊处理markdown模式下的图片插入格式。
        if (mode === 'markdown') {
          replace = `![](${replace})`
        }
      }

      postTask(`
      editor.setValue(editor.getValue().replace(${JSON.stringify(find)}, ${JSON.stringify(replace)}));
      const doc = editor.getDoc(); 
      const lastLine = doc.lastLine(); 
      const lastChar = doc.getLine(lastLine).length; 
      doc.setCursor({ line: doc.lastLine(), ch: lastChar });
      `)
    },
  })
}
