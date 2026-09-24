import { expect, it } from 'vitest'
import { createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import * as Y from 'yjs'
import { createEditorCommands } from './api'
import { withRichBlocks, getSelectionFormat } from './editor'
import { YjsDocument } from './yjs'
import { FONT_FAMILIES } from './fonts'
import { cloneBlocksWithFreshIds } from './clipboard'
import type { RichElement } from './types'

it('preserves font marks through copy, collaboration, reload and clear formatting', () => {
  const a = new YjsDocument(new Y.Doc()), b = new YjsDocument(new Y.Doc())
  a.initialize([{ type: 'paragraph', id: 'body', children: [{ text: '字体设置' }] }])
  b.applyRemoteUpdate(Y.encodeStateAsUpdate(a.doc))
  const editor = withRichBlocks(withHistory(createEditor())); editor.children = a.getValue()
  const commands = createEditorCommands(editor)
  Transforms.select(editor, Editor.range(editor, [0]))
  const before = editor.children, family = FONT_FAMILIES[2].value
  commands.setFontFamily(family); commands.setFontFamily(family)
  expect(Editor.marks(editor)).toHaveProperty('fontFamily', family)
  expect(getSelectionFormat(editor)?.marks).toHaveProperty('fontFamily', family)
  const copied = cloneBlocksWithFreshIds(editor.children as RichElement[], () => crypto.randomUUID())
  expect(copied[0].children[0]).toHaveProperty('fontFamily', family)
  a.acceptEditorValue(before, editor.children)
  b.editText('body', 4, 0, '!')
  const au = Y.encodeStateAsUpdate(a.doc), bu = Y.encodeStateAsUpdate(b.doc)
  a.applyRemoteUpdate(bu); b.applyRemoteUpdate(au)
  expect(a.getValue()).toEqual(b.getValue())
  const reload = new YjsDocument(new Y.Doc()); reload.applyRemoteUpdate(Y.encodeStateAsUpdate(a.doc))
  expect(reload.getValue()).toEqual(a.getValue())
  createEditorCommands(editor, undefined, () => false).setFontFamily('Arial')
  expect(Editor.marks(editor)).toHaveProperty('fontFamily', family)
  commands.clearFormatting()
  expect(Editor.marks(editor)).not.toHaveProperty('fontFamily')
  a.destroy(); a.doc.destroy(); b.destroy(); b.doc.destroy(); reload.destroy(); reload.doc.destroy()
})
