import { Editor, Element, Node, Path, Text, Transforms, type NodeEntry, type Point, type Range } from 'slate'
import { HistoryEditor } from 'slate-history'
import { ReactEditor } from 'slate-react'
import type { EditorFindMatch, EditorFindOptions, RichEditor, RichElement } from './types'

const revisions = new WeakMap<RichEditor, number>()
export const getEditorRevision = (editor: RichEditor) => revisions.get(editor) ?? 0
export const bumpEditorRevision = (editor: RichEditor) => revisions.set(editor, getEditorRevision(editor) + 1)

type Segment = { start: number; end: number; path: Path }
type Searchable = { kind: 'text'; block: RichElement; path: Path; value: string; segments: Segment[] } | { kind: 'code'; block: Extract<RichElement, { type: 'code-block' }>; path: Path; value: string }

const isInsideVoid = (editor: RichEditor, root: RichElement, relativePath: Path) => {
  for (let depth = 1; depth < relativePath.length; depth++) {
    const ancestor = Node.get(root, relativePath.slice(0, depth))
    if (Element.isElement(ancestor) && editor.isVoid(ancestor)) return true
  }
  return false
}

function searchableEntries(editor: RichEditor, includeCode: boolean): Searchable[] {
  const entries: Searchable[] = []
  for (const [node, path] of Editor.nodes(editor, { at: [], match: value => Element.isElement(value) })) {
    if (!Element.isElement(node) || editor.isVoid(node) || editor.isInline(node)) continue
    const block = node as RichElement
    if (block.type === 'code-block') {
      if (includeCode) entries.push({ kind: 'code', block, path, value: block.code ?? Node.string(block) })
      continue
    }
    if (!block.children.every(child => Text.isText(child) || (Element.isElement(child) && editor.isInline(child)))) continue
    const segments: Segment[] = []; let value = ''
    for (const [leaf, relativePath] of Node.texts(block) as Generator<NodeEntry<Text>>) {
      if (isInsideVoid(editor, block, relativePath)) continue
      const start = value.length; value += leaf.text
      segments.push({ start, end: value.length, path: path.concat(relativePath) })
    }
    if (segments.length) entries.push({ kind: 'text', block, path, value, segments })
  }
  return entries
}

const pointAt = (segments: Segment[], offset: number, edge: 'start' | 'end'): Point | undefined => {
  const segment = edge === 'end'
    ? [...segments].reverse().find(item => offset > item.start && offset <= item.end) ?? segments[0]
    : segments.find(item => offset >= item.start && offset < item.end) ?? segments.at(-1)
  return segment ? { path: segment.path, offset: offset - segment.start } : undefined
}

const rangesIn = (value: string, query: string, caseSensitive: boolean) => {
  const source = caseSensitive ? value : value.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const result: Array<{ start: number; end: number }> = []
  for (let from = 0; from <= source.length - needle.length;) {
    const start = source.indexOf(needle, from)
    if (start < 0) break
    result.push({ start, end: start + needle.length })
    from = start + Math.max(1, needle.length)
  }
  return result
}

export function findEditorText(editor: RichEditor, query: string, options: EditorFindOptions = {}): EditorFindMatch[] {
  if (!query) return []
  const revision = getEditorRevision(editor), caseSensitive = options.caseSensitive ?? false
  const matches: EditorFindMatch[] = []
  for (const entry of searchableEntries(editor, options.includeCode ?? true)) {
    rangesIn(entry.value, query, caseSensitive).forEach(({ start, end }, index) => {
      const base = { id: `${revision}:${entry.block.id}:${entry.kind}:${start}:${end}:${index}`, revision, blockId: entry.block.id, text: entry.value.slice(start, end), start, end }
      if (entry.kind === 'code') matches.push({ ...base, kind: 'code' })
      else {
        const anchor = pointAt(entry.segments, start, 'start'), focus = pointAt(entry.segments, end, 'end')
        if (anchor && focus) matches.push({ ...base, kind: 'text', range: { anchor, focus } })
      }
    })
  }
  return matches
}

const currentCodeEntry = (editor: RichEditor, match: EditorFindMatch) => {
  const entry = Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && node.type === 'code-block' && node.id === match.blockId }).next().value
  return entry as NodeEntry<Extract<RichElement, { type: 'code-block' }>> | undefined
}

const validMatch = (editor: RichEditor, match: EditorFindMatch) => {
  if (match.revision !== getEditorRevision(editor)) return false
  if (match.kind === 'code') {
    const entry = currentCodeEntry(editor, match); const value = entry?.[0].code ?? (entry ? Node.string(entry[0]) : '')
    return Boolean(entry && value.slice(match.start, match.end) === match.text)
  }
  try { return Editor.string(editor, match.range) === match.text } catch { return false }
}

export function revealEditorMatch(editor: RichEditor, match: EditorFindMatch): boolean {
  if (!validMatch(editor, match)) return false
  if (match.kind === 'text') {
    Transforms.select(editor, match.range); ReactEditor.focus(editor)
    if (typeof document !== 'undefined') requestAnimationFrame(() => { try { ReactEditor.toDOMRange(editor, match.range).getBoundingClientRect(); document.getSelection()?.focusNode?.parentElement?.scrollIntoView({ block: 'center' }) } catch { /* Not currently rendered. */ } })
    return true
  }
  if (typeof document === 'undefined') return true
  const target = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(match.blockId)}"]`)
  target?.scrollIntoView({ block: 'center' }); const textarea = target?.querySelector('textarea'); textarea?.focus(); textarea?.setSelectionRange(match.start, match.end)
  return Boolean(target)
}

function replaceValidMatch(editor: RichEditor, match: EditorFindMatch, replacement: string) {
  if (match.kind === 'text') { Transforms.delete(editor, { at: match.range }); if (replacement) Transforms.insertText(editor, replacement, { at: match.range.anchor }); return }
  const entry = currentCodeEntry(editor, match); if (!entry) return
  const value = entry[0].code ?? Node.string(entry[0]); Transforms.setNodes(editor, { code: `${value.slice(0, match.start)}${replacement}${value.slice(match.end)}` }, { at: entry[1] })
}

export function replaceEditorMatch(editor: RichEditor, match: EditorFindMatch, replacement: string, canEdit: () => boolean = () => true): boolean {
  if (!canEdit() || !validMatch(editor, match)) return false
  HistoryEditor.withNewBatch(editor, () => Editor.withoutNormalizing(editor, () => replaceValidMatch(editor, match, replacement)))
  return true
}

export function replaceAllEditorText(editor: RichEditor, query: string, replacement: string, options: EditorFindOptions = {}, canEdit: () => boolean = () => true): number {
  if (!canEdit()) return 0
  const matches = findEditorText(editor, query, options)
  if (!matches.length) return 0
  const ordered = [...matches].sort((a, b) => {
    if (a.kind === 'text' && b.kind === 'text') return Path.compare(b.range.anchor.path, a.range.anchor.path) || b.range.anchor.offset - a.range.anchor.offset
    return b.blockId.localeCompare(a.blockId) || b.start - a.start
  })
  HistoryEditor.withNewBatch(editor, () => Editor.withoutNormalizing(editor, () => ordered.forEach(match => replaceValidMatch(editor, match, replacement))))
  return matches.length
}
