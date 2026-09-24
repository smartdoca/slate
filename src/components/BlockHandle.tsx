import { useInsertMenu } from '../insertMenu'
import { BlockTypeIcon } from './BlockTypeIcon'
import { useEditorI18n } from '../i18n'
import { fileResourceKind, IMAGE_FILE_ACCEPT, MEDIA_FILE_ACCEPT } from '../media'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Editor, Element, Node as SlateNode, Transforms } from 'slate'
import { DOMEditor } from 'slate-dom'
import { useReadOnly, useSlateStatic } from 'slate-react'
import { Sigma, AlignCenter, AlignLeft, AlignRight, ArrowDownCircle, ArrowUpCircle, ChevronRight, Copy, FileText, GripVertical, Image as ImageIcon, List, ListOrdered, Network, Pilcrow, Plus, Quote, SquareCode, Table2, Trash2 } from 'lucide-react'
import { createId } from '../data'
import { createTable as createTableModel } from '../table'
import { getBlockDropDestination } from '../editor'
import { useBlockSelection } from '../blockSelection'
import { cloneBlocksWithFreshIds } from '../clipboard'
import type { RichElement } from '../types'
import { createColumnsBlock } from '../columns'
import { InsertSubmenu } from './InsertSubmenu'
import { TablePickerPopover } from './TablePickerPopover'
import { useResourceRuntime } from '../resources'

const TEXT_TYPES = new Set(['paragraph', 'heading-one', 'heading-two', 'heading-three', 'heading-four', 'heading-five', 'block-quote', 'todo', 'list-item'])
const HOVER_REVEAL_MS = 320
const EMPTY_PARAGRAPH = () => ({ type: 'paragraph' as const, id: createId(), children: [{ text: '' }] })

export function BlockFrame({ element, children, attributes }: { element: RichElement; children: ReactNode; attributes: Record<string, unknown> }) {
  const { t } = useEditorI18n()

  const editor = useSlateStatic()
  const allowed = useInsertMenu()
  const readOnly = useReadOnly()
  const resources = useResourceRuntime()
  const blockSelection = useBlockSelection()
  const [open, setOpen] = useState(false)
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 })
  const gripRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keepMenu = () => clearTimeout(menuTimer.current)
  const leaveMenu = () => { keepMenu(); menuTimer.current = setTimeout(() => { setOpen(false); setCellGrip(null) }, 320) }
  const hoverMenu = () => { keepMenu(); if (!open) menuTimer.current = setTimeout(openMenu, 180) }
  useEffect(() => () => clearTimeout(menuTimer.current), [])
  const [cellGrip, setCellGrip] = useState<{ left: number; top: number } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const hideGripTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revealGripTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelRevealGrip = () => clearTimeout(revealGripTimer.current)
  const keepCellGrip = () => clearTimeout(hideGripTimer.current)
  const hideCellGrip = () => { keepCellGrip(); cancelRevealGrip(); if (!open) hideGripTimer.current = setTimeout(() => setCellGrip(null), 240) }
  const placeCellGrip = (position: { left: number; top: number }) => {
    keepCellGrip()
    cancelRevealGrip()
    if (cellGrip) { setCellGrip(position); return }
    revealGripTimer.current = setTimeout(() => setCellGrip(position), HOVER_REVEAL_MS)
  }
  useEffect(() => () => { clearTimeout(hideGripTimer.current); cancelRevealGrip() }, [])
  useEffect(() => {
    if (!cellGrip) return
    const hide = (event: Event) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return
      setCellGrip(null); setOpen(false)
    }
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [Boolean(cellGrip), open])
  const path = () => DOMEditor.findPath(editor, element)
  const isCellBlock = (() => { const current = path(); if (current.length < 2) return false; const parent = SlateNode.get(editor, current.slice(0, -1)); return Element.isElement(parent) && parent.type === 'table-cell' })()
  const isColumnBlock = (() => { const current = path(); return current.length > 1 && (SlateNode.get(editor, current.slice(0, -1)) as RichElement).type === 'column' })()
  const isCardBlock = (() => { const current = path(); return current.length > 1 && (SlateNode.get(editor, current.slice(0, -1)) as RichElement).type === 'card' })()
  const isNestedBlock = isCellBlock || isColumnBlock || isCardBlock
  useLayoutEffect(() => {
    if (!isCellBlock || !cellGrip) return
    if (frameRef.current?.closest('td.is-cell-selected')) setCellGrip(null)
  })
  const topPath = () => isNestedBlock ? path() : [path()[0]]
  const update = (patch: Partial<RichElement>) => Transforms.setNodes(editor, patch, { at: path() })
  const insertNode = (node: RichElement, after: boolean) => {
    const current = topPath(); const at = current.slice(0, -1).concat(current[current.length - 1] + (after ? 1 : 0))
    Transforms.insertNodes(editor, node, { at })
    if (!editor.isVoid(node)) Transforms.select(editor, Editor.start(editor, at))
    setOpen(false)
  }
  const insertEmpty = (after: boolean) => insertNode(EMPTY_PARAGRAPH(), after)
  const setTextProperty = (key: 'title' | 'list' | 'quote', value: string | boolean, active: boolean) => {
    if (active) Transforms.unsetNodes(editor, key, { at: path() })
    else Transforms.setNodes(editor, { type: 'paragraph', [key]: value } as Partial<RichElement>, { at: path() })
  }
  const transform = (type: 'paragraph' | 'heading-one' | 'heading-two' | 'heading-three' | 'heading-four' | 'heading-five' | 'todo' | 'block-quote') => {
    const titles = { 'heading-one': 'h1', 'heading-two': 'h2', 'heading-three': 'h3', 'heading-four': 'h4', 'heading-five': 'h5' }
    if (type in titles) { const value = titles[type as keyof typeof titles]; setTextProperty('title', value, activeTitle === value) }
    else if (type === 'todo') { if (activeList === 'checkbox') Transforms.unsetNodes(editor, ['list', 'checked', 'listOrder'], { at: path() }); else { Transforms.unsetNodes(editor, 'listOrder', { at: path() }); Transforms.setNodes(editor, { type: 'paragraph', list: 'checkbox', checked: false } as Partial<RichElement>, { at: path() }) } }
    else if (type === 'block-quote') {
      const active = Boolean(property?.quote || element.type === 'block-quote')
      if (active) Transforms.unsetNodes(editor, 'quote', { at: path() })
      else Transforms.setNodes(editor, { type: 'paragraph', quote: true } as Partial<RichElement>, { at: path() })
    }
    else { Transforms.unsetNodes(editor, ['title', 'list', 'quote', 'checked', 'listOrder'], { at: path() }); Transforms.setNodes(editor, { type: 'paragraph' }, { at: path() }) }
  }
  const transformList = (type: 'bulleted-list' | 'numbered-list') => { const value = type === 'bulleted-list' ? 'ul' : 'ol'; if (activeList === value) Transforms.unsetNodes(editor, ['list', 'checked', 'listOrder'], { at: path() }); else { Transforms.unsetNodes(editor, value === 'ol' ? ['checked'] : ['checked', 'listOrder'], { at: path() }); Transforms.setNodes(editor, { type: 'paragraph', list: value } as Partial<RichElement>, { at: path() }) } }
  const remove = () => { Transforms.removeNodes(editor, { at: topPath() }); setOpen(false) }
  const resetLine = () => {
    const at = topPath(); Transforms.removeNodes(editor, { at }); Transforms.insertNodes(editor, EMPTY_PARAGRAPH(), { at }); Transforms.select(editor, Editor.start(editor, at)); setOpen(false)
  }
  const replaceCurrent = (node: RichElement) => {
    const at = topPath(); Editor.withoutNormalizing(editor, () => { Transforms.removeNodes(editor, { at }); Transforms.insertNodes(editor, node, { at }) }); setOpen(false)
  }
  const pickImage = (insert: (node: RichElement) => void) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = allowed('video') ? MEDIA_FILE_ACCEPT : IMAGE_FILE_ACCEPT
    input.onchange = () => { const file = input.files?.[0]; if (file) void resources.upload(fileResourceKind(file), file, insert) }
    input.click()
  }
  const pickAttachment = (insert: (node: RichElement) => void) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '*/*'
    input.onchange = () => { const file = input.files?.[0]; if (file) void resources.upload('attachment', file, insert) }
    input.click()
  }
  const createTable = (rows = 3, columns = 3): RichElement => createTableModel(rows, columns, createId, true)
  const createDiagram = (type: 'flowchart' | 'mindmap'): RichElement => type === 'mindmap' ? ({ type, id: createId(), mindData: { direction: 2, nodeData: { id: createId(), topic: t("ui.centralTopic"), expanded: true, children: [{ id: createId(), topic: t("ui.branchOne") }, { id: createId(), topic: t("ui.branchTwo") }] } }, width: 680, children: [{ text: '' }] }) : ({ type, id: createId(), nodes: [{ id: 'start', label: t("ui.start"), shape: 'terminator', x: 70, y: 110 }, { id: 'process', label: t("ui.process"), shape: 'process', x: 285, y: 110 }, { id: 'done', label: t("ui.done"), shape: 'terminator', x: 500, y: 110 }], edges: [{ id: 'a-b', source: 'start', target: 'process' }, { id: 'b-c', source: 'process', target: 'done' }], width: 680, children: [{ text: '' }] })
  const duplicate = () => { const [clone] = cloneBlocksWithFreshIds([element], createId); const current = topPath(); Transforms.insertNodes(editor, clone, { at: current.slice(0, -1).concat(current[current.length - 1] + 1) }); setOpen(false) }
  const align = (value: 'left' | 'center' | 'right') => update({ align: value })
  const isText = TEXT_TYPES.has(element.type)
  const isEmpty = isText && SlateNode.string(element).trim().length === 0
  const property = element.type === 'paragraph' ? element : undefined
  const activeTitle = property?.title ?? ({ 'heading-one': 'h1', 'heading-two': 'h2', 'heading-three': 'h3', 'heading-four': 'h4', 'heading-five': 'h5' } as Record<string, string>)[element.type]
  const activeList = property?.list ?? (element.type === 'bulleted-list' ? 'ul' : element.type === 'numbered-list' ? 'ol' : element.type === 'todo' ? 'checkbox' : undefined)
  const isListBlock = Boolean(activeList || element.type === 'list-item')
  const updateMenuPosition = useCallback(() => {
    const trigger = gripRef.current; if (!trigger) return
    const rect = trigger.getBoundingClientRect(); const menuWidth = menuRef.current?.offsetWidth || 236; const menuHeight = menuRef.current?.offsetHeight || 390
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) { setOpen(false); return }
    const left = rect.left >= menuWidth + 14 ? rect.left - menuWidth - 10 : Math.min(window.innerWidth - menuWidth - 8, rect.right + 10)
    const top = rect.top - 6 + menuHeight <= window.innerHeight - 8 ? rect.top - 6 : rect.bottom - menuHeight + 6
    setMenuPosition({ left, top })
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOther = (event: Event) => { if ((event as CustomEvent<string>).detail !== element.id) setOpen(false) }
    const closeOutside = (event: PointerEvent) => { const target = event.target as globalThis.Node | null; if (target && !menuRef.current?.contains(target) && !gripRef.current?.contains(target)) setOpen(false) }
    const reposition = () => requestAnimationFrame(updateMenuPosition)
    document.addEventListener('sk:block-menu-open', closeOther)
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition)
    return () => { document.removeEventListener('sk:block-menu-open', closeOther); document.removeEventListener('pointerdown', closeOutside); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition) }
  }, [element.id, open, updateMenuPosition])
  useLayoutEffect(() => { if (open) updateMenuPosition() }, [open, updateMenuPosition])

  const contextualMenu = () => {
    if (isText) return <>
      <div className="sk-block-menu-label">{isEmpty ? t("ui.createTextBlock") : t("ui.textProperties")}</div>
      <div className="sk-heading-grid">
        {(['heading-one', 'heading-two', 'heading-three', 'heading-four', 'heading-five'] as const).map((type, index) => <button className={activeTitle === `h${index + 1}` ? 'is-active' : ''} key={type} title={t("heading.level", { 0: index + 1 })} onMouseDown={e => { e.preventDefault(); transform(type) }}>H{index + 1}</button>)}
      </div>
      <div className="sk-quick-grid">
        <button className={!activeTitle && !activeList && !property?.quote && element.type === 'paragraph' ? 'is-active' : ''} title={t("paragraph")} onMouseDown={e => { e.preventDefault(); transform('paragraph') }}><Pilcrow size={16} /></button>
        <button className={activeList === 'ul' ? 'is-active' : ''} title={t("ui.bulletedList")} onMouseDown={e => { e.preventDefault(); transformList('bulleted-list') }}><List size={16} /></button>
        <button className={activeList === 'ol' ? 'is-active' : ''} title={t("ui.numberedList")} onMouseDown={e => { e.preventDefault(); transformList('numbered-list') }}><ListOrdered size={16} /></button>
        <button className={activeList === 'checkbox' ? 'is-active' : ''} title={t("ui.toDo")} onMouseDown={e => { e.preventDefault(); transform('todo') }}><BlockTypeIcon type="todo" size={16} /></button>
        <button className={property?.quote || element.type === 'block-quote' ? 'is-active' : ''} title={t("ui.quote")} onMouseDown={e => { e.preventDefault(); transform('block-quote') }}><Quote size={16} /></button>
      </div>
      <div className="sk-block-menu-label sk-property-label">{t("ui.alignment")}</div><div className="sk-quick-grid sk-align-grid">
        <button className={!element.align || element.align === 'left' ? 'is-active' : ''} title={t("ui.alignLeft")} onMouseDown={e => { e.preventDefault(); align('left') }}><AlignLeft size={16} /></button>
        <button className={element.align === 'center' ? 'is-active' : ''} title={t("ui.center")} onMouseDown={e => { e.preventDefault(); align('center') }}><AlignCenter size={16} /></button>
        <button className={element.align === 'right' ? 'is-active' : ''} title={t("ui.alignRight")} onMouseDown={e => { e.preventDefault(); align('right') }}><AlignRight size={16} /></button>
      </div>
      {isEmpty && <><div className="sk-block-menu-rule" /><div className="sk-block-menu-label">{t("ui.insertContent")}</div><div className="sk-create-blocks">
        {allowed('image') && <button onMouseDown={e => { e.preventDefault(); pickImage(replaceCurrent) }}><BlockTypeIcon type="image" size={17} /><span><b>{allowed('video') ? t('media.imageVideo') : t('ui.image')}</b><small>{t('media.hint')}</small></span></button>}
        {allowed('code-block') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent({ type: 'code-block', id: createId(), language: 'typescript', children: [{ text: '' }] }) }}><BlockTypeIcon type="code-block" size={17} /><span><b>{t("ui.codeBlock")}</b><small>{t("ui.withLanguageSelection")}</small></span></button>}
        {!isNestedBlock && allowed('table') && <TablePickerPopover className="sk-create-table-trigger" onSelect={(rows, columns) => replaceCurrent(createTable(rows, columns))}><BlockTypeIcon type="table" size={17} /><span><b>{t("ui.table")}</b><small>{t("ui.chooseRowsAndColumns")}</small></span><ChevronRight size={14} /></TablePickerPopover>}
        {allowed('card') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent({ type: 'card', id: createId(), color: '#eef6ff', icon: '💡', children: [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }] }) }}><BlockTypeIcon type="card" size={17} /><span><b>{t("ui.card")}</b><small>{t("ui.highlightInformation")}</small></span></button>}
        {allowed('divider') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent({ type: 'divider', id: createId(), children: [{ text: '' }] }) }}><BlockTypeIcon type="divider" size={17} /><span><b>{t("ui.divider")}</b><small>{t("ui.separateContent")}</small></span></button>}
        {allowed('attachment') && <button onMouseDown={e => { e.preventDefault(); pickAttachment(replaceCurrent) }}><BlockTypeIcon type="attachment" size={17} /><span><b>{t("ui.attachment")}</b><small>{t("ui.uploadAnyFile")}</small></span></button>}
        {allowed('flowchart') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent(createDiagram('flowchart')) }}><BlockTypeIcon type="flowchart" size={17} /><span><b>{t("ui.flowchart")}</b><small>{t("ui.openDiagramEditor")}</small></span></button>}
        {allowed('mindmap') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent(createDiagram('mindmap')) }}><BlockTypeIcon type="mindmap" size={17} /><span><b>{t("ui.mindMap")}</b><small>{t("ui.openDiagramEditor")}</small></span></button>}
        {!isNestedBlock && allowed('columns') && <InsertSubmenu label={t('columns.title')} icon={<BlockTypeIcon type="columns" size={17} />}>{([2, 3, 4] as const).map(count => <button key={count} onMouseDown={e => { e.preventDefault(); replaceCurrent(createColumnsBlock(count)) }}>{t('columns.count', { 0: count })}</button>)}</InsertSubmenu>}
        {allowed('formula') && <button onMouseDown={e => { e.preventDefault(); replaceCurrent({ type: 'formula', id: createId(), source: '', children: [{ text: '' }] }) }}><BlockTypeIcon type="formula" size={17} /><span><b>{t('formula.title')}</b><small>{t('formula.hint')}</small></span></button>}
      </div></>}
    </>
    if (element.type === 'image') return <>
      <button aria-pressed={Boolean(element.showCaption)} onMouseDown={e => { e.preventDefault(); update({ showCaption: !element.showCaption }) }}>{t('image.showCaption')}</button>
      <div className="sk-context-title"><ImageIcon size={17} /><span><b>{t("ui.image")}</b><small>{t("ui.dragTheBottomRightHandleToResize")}</small></span></div>
      <div className="sk-block-menu-label">{t("ui.imageStyle")}</div><div className="sk-image-style-options">{(['plain', 'rounded', 'bordered', 'shadow'] as const).map((style, index) => <button className={(element.displayStyle || 'rounded') === style ? 'is-active' : ''} key={style} onMouseDown={e => { e.preventDefault(); update({ displayStyle: style } as Partial<RichElement>) }}>{[t("ui.plain"), t("ui.rounded"), t("ui.border"), t("ui.shadow")][index]}</button>)}</div>
      <div className="sk-quick-grid sk-align-grid">
        <button title={t("ui.alignLeft")} onMouseDown={e => { e.preventDefault(); align('left') }}><AlignLeft size={16} /></button>
        <button title={t("ui.center")} onMouseDown={e => { e.preventDefault(); align('center') }}><AlignCenter size={16} /></button>
        <button title={t("ui.alignRight")} onMouseDown={e => { e.preventDefault(); align('right') }}><AlignRight size={16} /></button>
      </div>
    </>
    if (element.type === 'formula') return <>
      <div className="sk-context-title"><Sigma size={17} /><span><b>{t('formula.title')}</b></span></div>
      <div className="sk-block-menu-label">{t('ui.alignment')}</div>
      <div className="sk-quick-grid sk-align-grid">{(['left', 'center', 'right'] as const).map((value, index) => {
        const Icon = [AlignLeft, AlignCenter, AlignRight][index]
        const label = t(['ui.alignLeft', 'ui.center', 'ui.alignRight'][index])
        const active = (element.align || 'left') === value
        return <button key={value} title={label} aria-label={label} aria-pressed={active} className={active ? 'is-active' : ''} onMouseDown={event => { event.preventDefault(); align(value) }}><Icon size={16} /></button>
      })}</div>
    </>
    if (element.type === 'card') return <>
      <div className="sk-context-title"><Quote size={17} /><span><b>{t("ui.informationCard")}</b><small>{t("ui.chooseCardColor")}</small></span></div>
      <div className="sk-card-colors">{['#eef6ff', '#f0f9eb', '#fff7e6', '#fef0f0', '#f5f0ff'].map(color => <button key={color} aria-label={t("card.colorValue", { 0: color })} style={{ background: color }} onMouseDown={e => { e.preventDefault(); update({ color } as Partial<RichElement>) }} />)}</div>
    </>
    if (element.type === 'table') return <>
      <div className="sk-context-title"><Table2 size={17} /><span><b>{t("ui.table")}</b><small>{t("ui.selectCellsToUseTheTableToolbar")}</small></span></div>
      <div className="sk-context-hint">{t("ui.dragBordersToResizeUseAxisControls")}</div>
    </>
    if (element.type === 'columns') return <><button aria-pressed={Boolean(element.showDividers)} onMouseDown={e => { e.preventDefault(); update({ showDividers: !element.showDividers }) }}>{t('columns.dividers')}</button><div className="sk-context-title"><Table2 size={17} /><span><b>{t('columns.title')}</b><small>{t('columns.hint')}</small></span></div></>
    if (element.type === 'code-block') return <div className="sk-context-title"><SquareCode size={17} /><span><b>{t("ui.codeBlock")}</b><small>{t("ui.chooseALanguageAboveTheCode")}</small></span></div>
    if (element.type === 'flowchart' || element.type === 'mindmap') return <div className="sk-context-title"><Network size={17} /><span><b>{element.type === 'flowchart' ? t("ui.flowchart") : t("ui.mindMap")}</b><small>{t("ui.hoverOverThePreviewToEdit")}</small></span></div>
    if (element.type === 'video') return <div className="sk-context-title"><ImageIcon size={17} /><span><b>{t('media.video')}</b><small>{element.name}</small></span></div>
    if (element.type === 'attachment') return <div className="sk-context-title"><FileText size={17} /><span><b>{t("ui.attachment")}</b><small>{element.name}</small></span></div>
    if (element.type === 'divider') return <div className="sk-context-title"><Pilcrow size={17} /><span><b>{t("ui.divider")}</b><small>{t("ui.separateSections")}</small></span></div>
    return <div className="sk-context-title"><Pilcrow size={17} /><span><b>{t("ui.block")}</b><small>{t("ui.type")}{element.type}</small></span></div>
  }

  const openMenu = () => { keepMenu(); if (!open) document.dispatchEvent(new CustomEvent('sk:block-menu-open', { detail: element.id })); setOpen(true) }
  const insertionItems = (after: boolean) => <>
    {!isNestedBlock && allowed('columns') && ([2, 3, 4] as const).map(count => <button key={count} onMouseDown={e => { e.preventDefault(); insertNode(createColumnsBlock(count), after) }}><BlockTypeIcon type="columns" size={15} />{t('columns.count', { 0: count })}</button>)}
    <button onMouseDown={e => { e.preventDefault(); insertEmpty(after) }}><Pilcrow size={15} /> {t("ui.emptyTextBlock")}</button>
    {allowed('code-block') && <button onMouseDown={e => { e.preventDefault(); insertNode({ type: 'code-block', id: createId(), language: 'typescript', children: [{ text: '' }] }, after) }}><BlockTypeIcon type="code-block" size={15} /> {t("ui.codeBlock")}</button>}
    {allowed('image') && <button onMouseDown={e => { e.preventDefault(); pickImage(node => insertNode(node, after)) }}><BlockTypeIcon type="image" size={15} /> {allowed('video') ? t('media.imageVideo') : t('ui.image')}</button>}
    {allowed('attachment') && <button onMouseDown={e => { e.preventDefault(); pickAttachment(node => insertNode(node, after)) }}><BlockTypeIcon type="attachment" size={15} /> {t("ui.attachment")}</button>}
    {!isNestedBlock && allowed('table') && <TablePickerPopover className="sk-create-table-trigger" onSelect={(rows, columns) => insertNode(createTable(rows, columns), after)}><BlockTypeIcon type="table" size={15} /> {t("ui.table")}<ChevronRight className="sk-menu-chevron" size={14} /></TablePickerPopover>}
    {allowed('flowchart') && <button onMouseDown={e => { e.preventDefault(); insertNode(createDiagram('flowchart'), after) }}><BlockTypeIcon type="flowchart" size={15} /> {t("ui.flowchart")}</button>}
    {allowed('mindmap') && <button onMouseDown={e => { e.preventDefault(); insertNode(createDiagram('mindmap'), after) }}><BlockTypeIcon type="mindmap" size={15} /> {t("ui.mindMap")}</button>}
    {allowed('card') && <button onMouseDown={e => { e.preventDefault(); insertNode({ type: 'card', id: createId(), color: '#eef6ff', icon: '💡', children: [{ type: 'paragraph', id: createId(), children: [{ text: '' }] }] }, after) }}><BlockTypeIcon type="card" size={15} /> {t("ui.card")}</button>}
    {allowed('formula') && <button onMouseDown={e => { e.preventDefault(); insertNode({ type: 'formula', id: createId(), source: '', children: [{ text: '' }] }, after) }}><BlockTypeIcon type="formula" size={15} /> {t('formula.title')}</button>}
    {allowed('divider') && <button onMouseDown={e => { e.preventDefault(); insertNode({ type: 'divider', id: createId(), children: [{ text: '' }] }, after) }}><BlockTypeIcon type="divider" size={15} /> {t("ui.divider")}</button>}
  </>
  const menu = open ? createPortal(<div ref={menuRef} className="sk-block-menu sk-block-menu-portal" role="menu" contentEditable={false} style={menuPosition} onMouseEnter={keepMenu} onMouseLeave={leaveMenu} onKeyDown={event => { if (event.key === 'Escape') { keepMenu(); setOpen(false) } }}>
    {contextualMenu()}
    {isEmpty && <><div className="sk-block-menu-rule" /><button className="is-danger" onMouseDown={e => { e.preventDefault(); remove() }}><Trash2 size={15} /> {t("ui.deleteEmptyBlock")}</button></>}
    {!isEmpty && <><div className="sk-block-menu-rule" /><button onMouseDown={e => { e.preventDefault(); duplicate() }}><Copy size={15} /> {t("ui.duplicate")}</button><button className="is-danger" onMouseDown={e => { e.preventDefault(); isText ? resetLine() : remove() }}><Trash2 size={15} /> {isText ? t("ui.clearBlock") : t("ui.deleteBlock")}</button><div className="sk-block-menu-rule" />{([['before', false, ArrowUpCircle, t("block.insertAbove")], ['after', true, ArrowDownCircle, t("block.insertBelow")]] as const).map(([key, after, Icon, label]) => <InsertSubmenu key={key} label={label} icon={<Icon size={15} />}>{insertionItems(after)}</InsertSubmenu>)}</>}
  </div>, document.body) : null

  const currentTopPath = topPath()
  const topNode = SlateNode.get(editor, currentTopPath) as RichElement
  const blockId = topNode.id || `block-${currentTopPath[0]}`
  const blockSelected = !isNestedBlock && blockSelection.selectedIds.includes(blockId)
  const selectFromEvent = (event: React.MouseEvent, openBlockMenu = false) => {
    if (isNestedBlock) return
    const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'single'
    blockSelection.select(currentTopPath[0], blockId, mode)
    if (openBlockMenu && mode === 'single') openMenu()
  }

  const gutter = !readOnly && <div className={cellGrip && isNestedBlock ? "sk-block-gutter sk-cell-floating-grip" : "sk-block-gutter"} contentEditable={false} style={cellGrip && isNestedBlock ? { position: "fixed", left: cellGrip.left, top: cellGrip.top, right: "auto", opacity: 1, zIndex: 85 } : undefined} onMouseEnter={() => { keepCellGrip(); hoverMenu() }} onMouseLeave={() => { hideCellGrip(); leaveMenu() }}>
      <button ref={gripRef} data-tooltip={isEmpty ? t("ui.addBlock") : t("ui.clickToEditShiftForRangeCtrl")} className={`sk-grip sk-single-block-control ${isEmpty ? 'is-empty' : ''}`} title={isEmpty ? t("ui.addBlock") : t("ui.editBlockShiftForRangeCtrlTo")} aria-label={isEmpty ? t("ui.addBlock") : t("ui.dragToReorderOrClickToEdit")} aria-haspopup="menu" aria-expanded={open} draggable={!isEmpty} onDragStart={e => { keepMenu(); if (isEmpty) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/slate-block-path', JSON.stringify(topPath())); setOpen(false) }} onKeyDown={event => { if (event.key !== 'Enter' || isText) return; event.preventDefault(); event.stopPropagation(); insertEmpty(true); requestAnimationFrame(() => DOMEditor.focus(editor)) }} onClick={event => { keepMenu(); if (event.shiftKey || event.metaKey || event.ctrlKey) { selectFromEvent(event); setOpen(false); return } selectFromEvent(event); openMenu() }}>{isEmpty ? <Plus size={17} /> : <GripVertical size={17} />}</button>
    </div>

  const { ref: slateRef, ...frameAttributes } = attributes
  const setFrameNode = (node: HTMLDivElement | null) => {
    frameRef.current = node
    if (typeof slateRef === 'function') slateRef(node)
    else if (slateRef && typeof slateRef === 'object' && 'current' in slateRef) (slateRef as { current: HTMLDivElement | null }).current = node
  }
  return <div {...frameAttributes} ref={setFrameNode} onMouseEnter={event => {
    if (!isNestedBlock || readOnly) return
    if (isCellBlock && event.currentTarget.closest('td')?.classList.contains('is-cell-selected')) { cancelRevealGrip(); setCellGrip(null); return }
    const rect = event.currentTarget.getBoundingClientRect()
    if (isColumnBlock || isCardBlock) { placeCellGrip({ left: isCardBlock ? (event.currentTarget.closest('.sk-card')?.getBoundingClientRect().left ?? rect.left) - 34 : rect.left - 56, top: rect.top }); return }
    const viewport = event.currentTarget.closest(".sk-table-scroll")?.getBoundingClientRect()
    if (!viewport || rect.right <= viewport.left || rect.left >= viewport.right) return
    const firstVisible = rect.left < viewport.left + 20
    placeCellGrip({ left: firstVisible ? viewport.left - 60 : rect.left - 36, top: rect.top })
  }} onMouseLeave={hideCellGrip} data-block-id={element.id || (!isCellBlock ? blockId : undefined)} data-block-index={!isCellBlock ? currentTopPath[0] : undefined} className={`sk-block-frame sk-block-${element.type} ${activeTitle ? 'is-heading-block' : ''} ${(element.type === 'paragraph' && element.quote) || element.type === 'block-quote' ? 'is-quote-block' : ''} ${isListBlock ? 'is-list-block' : ''} ${isCellBlock ? 'is-cell-block' : ''} ${blockSelected ? 'is-block-selected' : ''} ${open ? 'is-menu-open' : ''} ${dropSide ? `is-drop-${dropSide}` : ''}`} style={{ textAlign: element.align }} onMouseDownCapture={event => {
    if (isNestedBlock || (event.target as HTMLElement).closest('.sk-block-gutter')) return
    const selectableMedia = new Set(['formula', 'image', 'video', 'flowchart', 'mindmap', 'attachment', 'divider']).has(element.type)
    if (event.shiftKey || event.metaKey || event.ctrlKey) { event.preventDefault(); selectFromEvent(event); return }
    if (selectableMedia) selectFromEvent(event)
    else blockSelection.clear()
  }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDropSide(null) }} onDragOver={e => { if (e.dataTransfer.types.includes('text/slate-block-path')) { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setDropSide(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after') } }} onDrop={e => {
    const raw = e.dataTransfer.getData('text/slate-block-path'); if (!raw) return
    e.preventDefault(); const source = JSON.parse(raw) as number[]; const target = topPath(); const side = dropSide || 'before'; setDropSide(null)
    if (source.length !== target.length || !source.slice(0, -1).every((value, index) => value === target[index])) return
    const destination = getBlockDropDestination(source[source.length - 1], target[target.length - 1], side); const to = target.slice(0, -1).concat(destination)
    if (source[source.length - 1] !== destination) Transforms.moveNodes(editor, { at: source, to })
  }}>
    {isCardBlock ? (cellGrip ? createPortal(gutter, document.body) : null) : cellGrip && isNestedBlock ? createPortal(gutter, document.body) : gutter}
    {children}
    {menu}
  </div>
}
