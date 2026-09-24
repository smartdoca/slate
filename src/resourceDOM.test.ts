// @vitest-environment jsdom
import { act, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from 'slate'
import { ReactEditor } from 'slate-react'
import { expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextEditorHandle } from './types'

for (const type of ['image', 'attachment', 'video', 'divider'] as const) it(`renders the Slate placeholder DOM for ${type}`, async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), ref = createRef<RichTextEditorHandle>()
  try {
    await act(async () => root.render(createElement(RichTextEditor, {ref, initialValue:[
      {type:'paragraph',id:'title',children:[{text:'Preserved'}]},
      {type,id:'media',path:'',name:'test',children:[{text:''}]} as any,
    ]})))
    expect(() => ReactEditor.toDOMRange(ref.current!.editor, Editor.range(ref.current!.editor,[1]))).not.toThrow()
  } finally { await act(async () => root.unmount()); host.remove() }
})
