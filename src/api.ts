import { Editor, Element, Range, Transforms } from 'slate'
import { HistoryEditor } from 'slate-history'
import { ReactEditor } from 'slate-react'
import { createId } from './data'
import { createColumnsBlock, executeColumnsCommand } from './columns'
import { createTable } from './table'
import { executeTableCommand, collaborationHistory } from './slateCommands'
import { clearSelectionFormatting, insertBlock, insertLink, isBlockActive, isLinkActive, isMarkActive, toggleBlock, toggleMark, unwrapLink } from './editor'
import type { EditorCommands, EditorQuery, EditorSelectionState, ResourceKind, RichEditor, RichElement, RichText } from './types'
import { fileResourceKind } from './media'

export function createTableBlock(rows: number, columns: number): Extract<RichElement, { type: 'table' }> {
  return createTable(Math.floor(rows), Math.floor(columns), createId, true)
}

export function createEditorCommands(editor: RichEditor, upload?: (kind: ResourceKind, file: File, insert: (node: RichElement) => void) => Promise<void>, canEdit: () => boolean = () => true, cancelUpload?: (blockId: string) => boolean): EditorCommands {
  const insert = (node: RichElement) => insertBlock(editor, node)
  const commands: EditorCommands = {
    focus: () => ReactEditor.focus(editor),
    blur: () => ReactEditor.blur(editor),
    undo: () => HistoryEditor.undo(editor),
    redo: () => HistoryEditor.redo(editor),
    toggleMark: (mark, value = true) => toggleMark(editor, mark, value),
    setFontFamily: family => { if (family?.trim()) Editor.addMark(editor, 'fontFamily', family.trim()); else Editor.removeMark(editor, 'fontFamily') },
    toggleBlock: type => toggleBlock(editor, type),
    clearFormatting: () => clearSelectionFormatting(editor),
    insertLink: (url, label) => insertLink(editor, url, label),
    insertInline: (element, at) => {
      if (!editor.isInline(element)) throw new Error(`Element ${element.type} is not registered as inline`)
      Editor.withoutNormalizing(editor, () => {
        if (at) Transforms.select(editor, at)
        if (editor.selection && Range.isExpanded(editor.selection)) Transforms.delete(editor, { at: editor.selection })
        Transforms.insertNodes(editor, element)
      })
    },
    removeLink: () => unwrapLink(editor),
    insertBlock: insert,
    columns: command => executeColumnsCommand(editor, command),
    insertColumns: count => insert(createColumnsBlock(count)),
    insertTable: (rows, columns) => insert(createTableBlock(rows, columns)),
    table: command => executeTableCommand(editor, command),
    insertImage: resource => insert({ type: 'image', id: createId(), width: 640, ...resource, children: [{ text: '' }] }),
    insertFormula: (source = '') => insert({ type: 'formula', id: createId(), source, children: [{ text: '' }] }),
    insertVideo: resource => insert({ type: 'video', id: createId(), width: 640, ...resource, children: [{ text: '' }] }),
    insertAttachment: resource => insert({ type: 'attachment', id: createId(), ...resource, children: [{ text: '' }] }),
    uploadImage: file => upload ? upload('image', file, insert) : Promise.reject(new Error('resources.uploadImage is not configured')),
    uploadMedia: file => upload ? upload(fileResourceKind(file), file, insert) : Promise.reject(new Error('Resource upload is not configured')),
    uploadAttachment: file => upload ? upload('attachment', file, insert) : Promise.reject(new Error('resources.uploadAttachment is not configured')),
    cancelUpload: blockId => cancelUpload?.(blockId) ?? false,
    selectAll: () => { if (editor.children.length) Transforms.select(editor, { anchor: Editor.start(editor, []), focus: Editor.end(editor, []) }) },
  }
  return new Proxy(commands, { get(target, key: keyof EditorCommands) {
    const action = target[key]
    if (typeof action !== 'function') return action
    return (...args: unknown[]) => {
      if (!['focus', 'blur', 'selectAll', 'cancelUpload'].includes(key) && !canEdit()) {
        if (key === 'uploadImage' || key === 'uploadMedia' || key === 'uploadAttachment') return Promise.reject(new Error('Editor is readonly'))
        return
      }
      return Reflect.apply(action, target, args)
    }
  } })
}

export function createEditorQuery(editor: RichEditor): EditorQuery {
  return {
    isMarkActive: mark => isMarkActive(editor, mark),
    isBlockActive: type => isBlockActive(editor, type),
    isLinkActive: () => isLinkActive(editor),
    canUndo: () => collaborationHistory.get(editor)?.canUndo() ?? editor.history.undos.length > 0,
    canRedo: () => collaborationHistory.get(editor)?.canRedo() ?? editor.history.redos.length > 0,
    getSelection: (): EditorSelectionState | null => {
      if (!editor.selection) return null
      const block = Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) })
      return { marks: (Editor.marks(editor) || {}) as Partial<Omit<RichText, 'text'>>, blockType: block && Element.isElement(block[0]) ? block[0].type : undefined, collapsed: Range.isCollapsed(editor.selection) }
    },
  }
}
