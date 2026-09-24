import { Editor, Element, Node, Text, Transforms, type Path } from 'slate'
import type { EditorValue, RichEditor, RichNode, TableElement } from './types'
import { reduceTableCommand, type TableCommand } from './tableCommands'
import { assertUniqueIds, projectingEditors } from './ids'

export const tableCommandExecutors = new WeakMap<RichEditor, (command: TableCommand) => void>()
export const collaborationHistory = new WeakMap<RichEditor, { canUndo(): boolean; canRedo(): boolean }>()

/** Resolve identity immediately before an operation; paths never leave the local editor. */
export function findBlockPath(editor: RichEditor, id: string): Path | undefined {
  return Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.id === id }).next().value?.[1]
}

export function executeTableCommand(editor: RichEditor, command: TableCommand): void {
  const execute = tableCommandExecutors.get(editor)
  if (execute) { execute(command); return }
  const path = findBlockPath(editor, command.tableId)
  if (!path) throw new Error(`Unknown table: ${command.tableId}`)
  const result = reduceTableCommand(Node.get(editor, path) as TableElement, command)
  if (result) assertUniqueIds(result)
  projectingEditors.add(editor)
  try { Editor.withoutNormalizing(editor, () => {
    if (!result) Transforms.removeNodes(editor, { at: path })
    else reconcileChildren(editor, path.slice(0, -1), (Node.get(editor, path.slice(0, -1)) as { children: RichNode[] }).children.map((node, index) => index === path.at(-1) ? result : node))
  }) } finally { projectingEditors.delete(editor) }
}

/** Patch existing nodes instead of replacing the document, retaining selection path refs. */
export function reconcileChildren(editor: RichEditor, parent: Path, desired: RichNode[]): void {
  for (let index = 0; index < desired.length; index++) {
    const path = parent.concat(index); const target = desired[index]
    let live = (Node.get(editor, parent) as { children: RichNode[] }).children[index]
    if (Element.isElement(target) && (!Element.isElement(live) || live.id !== target.id)) {
      const siblings = (Node.get(editor, parent) as { children: RichNode[] }).children
      const source = siblings.findIndex((node, i) => i > index && Element.isElement(node) && node.id === target.id)
      if (source >= 0) Transforms.moveNodes(editor, { at: parent.concat(source), to: path })
      else Transforms.insertNodes(editor, structuredClone(target), { at: path })
      live = Node.get(editor, path) as RichNode
    }
    if (!live) { Transforms.insertNodes(editor, structuredClone(target), { at: path }); continue }
    if (Text.isText(target) !== Text.isText(live)) {
      Transforms.removeNodes(editor, { at: path }); Transforms.insertNodes(editor, structuredClone(target), { at: path }); continue
    }
    const ignored = new Set(['children', 'text'])
    const before = live as unknown as Record<string, unknown>; const after = target as unknown as Record<string, unknown>
    const unset = Object.keys(before).filter(key => !ignored.has(key) && !(key in after))
    if (unset.length) Transforms.unsetNodes(editor, unset, { at: path })
    const patch = Object.fromEntries(Object.entries(after).filter(([key, value]) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(value)))
    if (Object.keys(patch).length) Transforms.setNodes(editor, patch, { at: path })
    if (Text.isText(target) && Text.isText(live) && live.text !== target.text) {
      let prefix = 0; while (prefix < live.text.length && prefix < target.text.length && live.text[prefix] === target.text[prefix]) prefix++
      let suffix = 0; while (suffix < live.text.length - prefix && suffix < target.text.length - prefix && live.text.at(-1 - suffix) === target.text.at(-1 - suffix)) suffix++
      const removed = live.text.slice(prefix, live.text.length - suffix); const inserted = target.text.slice(prefix, target.text.length - suffix)
      if (removed) editor.apply({ type: 'remove_text', path, offset: prefix, text: removed })
      if (inserted) editor.apply({ type: 'insert_text', path, offset: prefix, text: inserted })
    } else if (Element.isElement(target)) reconcileChildren(editor, path, target.children)
  }
  const children = (Node.get(editor, parent) as { children: RichNode[] }).children
  for (let index = children.length - 1; index >= desired.length; index--) Transforms.removeNodes(editor, { at: parent.concat(index) })
}

export function applyDocumentProjection(editor: RichEditor, value: EditorValue): void {
  assertUniqueIds(value)
  projectingEditors.add(editor)
  try { Editor.withoutNormalizing(editor, () => reconcileChildren(editor, [], value)) } finally { projectingEditors.delete(editor) }
}
