import { useInsertMenu } from '../insertMenu'
import { BlockTypeIcon } from './BlockTypeIcon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor, Element, Range, Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useSlate } from 'slate-react'
import { ChevronRight } from 'lucide-react'
import { createId } from '../data'
import { createTable } from '../table'
import { emptyText, insertBlock, toggleBlock } from '../editor'
import type { BlockType, DiagramElement, RichElement } from '../types'
import { TablePickerPopover } from './TablePickerPopover'
import { useResourceRuntime } from '../resources'
import { useEditorI18n } from '../i18n'
import { fileResourceKind, IMAGE_FILE_ACCEPT, MEDIA_FILE_ACCEPT } from '../media'

import { createColumnsBlock } from '../columns'

type Command = { title: string; hint: string; kind: BlockType; run: () => void; keywords: string }

export function SlashMenu() {
  const editor = useSlate()
  const allowed = useInsertMenu()
  const resources = useResourceRuntime()
  const { t } = useEditorI18n()
  const [query, setQuery] = useState<string | null>(null)
  const [point, setPoint] = useState({ left: 0, top: 0 })
  const [active, setActive] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const insideCell = Boolean(editor.selection && Editor.above(editor, { at: editor.selection, match: node => Element.isElement(node) && (node.type === 'table-cell' || node.type === 'column' || node.type === 'card') }))
  const pickFile = (accept: string, callback: (file: File) => void) => { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.onchange = () => input.files?.[0] && callback(input.files[0]); input.click() }
  const selectBlock = (type: BlockType) => { deleteTrigger(); toggleBlock(editor, type); setQuery(null) }
  const insert = (node: RichElement) => { deleteTrigger(); insertBlock(editor, node); setQuery(null) }
  const insertTable = (rows: number, columns: number) => insert(createTable(rows, columns, createId, true))
  const deleteTrigger = () => {
    if (!editor.selection || query === null) return
    const start = Editor.before(editor, editor.selection.anchor, { distance: query.length + 1, unit: 'character' })
    if (start) Transforms.delete(editor, { at: { anchor: start, focus: editor.selection.anchor } })
  }
  const diagram = (type: 'flowchart' | 'mindmap'): DiagramElement => type === 'mindmap' ? ({ type, id: createId(), mindData: { direction: 2, nodeData: { id: createId(), topic: t("ui.centralTopic"), expanded: true, children: [{ id: createId(), topic: t("ui.branchOne") }, { id: createId(), topic: t("ui.branchTwo") }] } }, children: emptyText() }) : ({ type, id: createId(), nodes: [{ id: 'a', label: t("ui.start"), x: 30, y: 60 }, { id: 'b', label: t("ui.process"), x: 240, y: 60 }, { id: 'c', label: t("ui.done"), x: 450, y: 60 }], edges: [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' }], children: emptyText() })
  const commands: Command[] = [
    { title: t('paragraph'), hint: t('paragraphHint'), kind: 'paragraph', keywords: 'text paragraph 正文', run: () => selectBlock('paragraph') },
    { title: t('heading1'), hint: t('heading1Hint'), kind: 'heading-one', keywords: 'h1 标题', run: () => selectBlock('heading-one') },
    { title: t('heading2'), hint: t('heading2Hint'), kind: 'heading-two', keywords: 'h2 标题', run: () => selectBlock('heading-two') },
    { title: t('todo'), hint: t('todoHint'), kind: 'todo', keywords: 'todo task 待办', run: () => selectBlock('todo') },
    { title: t('bulletList'), hint: t('bulletListHint'), kind: 'bulleted-list', keywords: 'ul list 列表', run: () => selectBlock('bulleted-list') },
    { title: t('numberList'), hint: t('numberListHint'), kind: 'numbered-list', keywords: 'ol list 列表', run: () => selectBlock('numbered-list') },
    { title: t('quote'), hint: t('quoteHint'), kind: 'block-quote', keywords: 'quote 引用', run: () => selectBlock('block-quote') },
    { title: t('formula.title'), hint: t('formula.hint'), kind: 'formula', keywords: 'formula math latex 公式 数学', run: () => insert({ type: 'formula', id: createId(), source: '', children: emptyText() }) },
    { title: t('codeBlock'), hint: t('codeBlockHint'), kind: 'code-block', keywords: 'code 代码', run: () => selectBlock('code-block') },
    { title: t('divider'), hint: t('dividerHint'), kind: 'divider', keywords: 'divider hr 分割线', run: () => insert({ type: 'divider', id: createId(), children: emptyText() }) },
    { title: t('table'), hint: t('tableHint'), kind: 'table', keywords: 'table 表格', run: () => undefined },
    ...([2, 3, 4] as const).map(count => ({ title: t('columns.count', { 0: count }), hint: t('columns.hint'), kind: 'columns' as BlockType, keywords: 'columns 分列', run: () => insert(createColumnsBlock(count)) })),
    { title: allowed('video') ? t('media.imageVideo') : t('ui.image'), hint: t('media.hint'), kind: 'image', keywords: 'image video 图片 视频 svg', run: () => pickFile(allowed('video') ? MEDIA_FILE_ACCEPT : IMAGE_FILE_ACCEPT, file => { deleteTrigger(); setQuery(null); void resources.upload(fileResourceKind(file), file, node => insertBlock(editor, node)) }) },
    { title: t('flowchart'), hint: t('flowchartHint'), kind: 'flowchart', keywords: 'flow 流程图', run: () => insert(diagram('flowchart')) },
    { title: t('mindmap'), hint: t('mindmapHint'), kind: 'mindmap', keywords: 'mind map 思维导图', run: () => insert(diagram('mindmap')) },
    { title: t('card'), hint: t('cardHint'), kind: 'card', keywords: 'card 卡片', run: () => insert({ type: 'card', id: createId(), color: '#eef6ff', icon: '💡', children: [{ type: 'paragraph', id: createId(), children: emptyText() }] }) },
    { title: t('attachment'), hint: t('attachmentHint'), kind: 'attachment', keywords: 'file attachment 附件', run: () => pickFile('*/*', file => { deleteTrigger(); setQuery(null); void resources.upload('attachment', file, node => insertBlock(editor, node)) }) },
  ]
  useEffect(() => {
    const onSelection = () => {
      const { selection } = editor
      if (!selection || !Range.isCollapsed(selection)) return setQuery(null)
      const start = Editor.before(editor, selection.anchor, { unit: 'block' }) ?? Editor.start(editor, selection.anchor.path.slice(0, 1))
      const text = Editor.string(editor, { anchor: start, focus: selection.anchor })
      const match = text.match(/(?:^|\s)\/([^\s/]*)$/)
      if (!match) return setQuery(null)
      setQuery(match[1])
      try { const rect = DOMEditor.toDOMRange(editor, selection).getBoundingClientRect(); setPoint({ left: rect.left, top: rect.bottom + 8 }) } catch { /* selection may be transient */ }
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [editor])
  const filtered = useMemo(() => query === null ? [] : commands.filter(c => allowed(c.kind) && (!insideCell || (c.title !== t('table') && c.keywords !== 'columns 分列')) && `${c.title} ${c.keywords}`.toLowerCase().includes(query.toLowerCase())), [query, insideCell, t, allowed])
  useEffect(() => setActive(0), [query])
  useEffect(() => {
    menuRef.current?.querySelectorAll<HTMLElement>(':scope > button, :scope > .sk-table-picker-trigger')[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active])
  useEffect(() => {
    if (query === null) return
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      const target = event.target as HTMLElement
      if (!DOMEditor.toDOMNode(editor, editor).contains(target) || target.closest('textarea,input,select')) return
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.key === 'Escape') { setQuery(null); return }
      if (!filtered.length) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length); return }
      const command = filtered[Math.min(active, filtered.length - 1)]
      if (command.title === t('table')) insertTable(3, 3)
      else command.run()
    }
    document.addEventListener('keydown', keydown, true)
    return () => document.removeEventListener('keydown', keydown, true)
  })
  if (query === null) return null
  return <div ref={menuRef} className="sk-slash-menu" style={{ left: point.left, top: point.top }}>
    <div className="sk-menu-label">{t('blocks')}</div>
    {filtered.length ? filtered.map(({ title, hint, kind, run }, index) => title === t('table') ? <TablePickerPopover className={active === index ? "sk-slash-table-trigger is-active" : "sk-slash-table-trigger"} key={title} onSelect={insertTable}><span className="sk-menu-icon"><BlockTypeIcon type={kind} size={18} /></span><span><b>{title}</b><small>{hint}</small></span><ChevronRight size={15} /></TablePickerPopover> : <button key={title} className={active === index ? "is-active" : ""} onMouseEnter={() => setActive(index)} onMouseDown={e => e.preventDefault()} onClick={run}><span className="sk-menu-icon"><BlockTypeIcon type={kind} size={18} /></span><span><b>{title}</b><small>{hint}</small></span></button>) : <div className="sk-menu-empty">{t('noBlocks')}</div>}
  </div>
}
