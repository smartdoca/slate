import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { MindMapCanvas } from '../mindmapCanvas'
import { AlignLeft, Bold, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleHelp, CornerDownRight, Download, Focus, GitBranch, ListTree, Maximize2, Minus, Network, Palette, Pencil, Plus, Redo2, Save, Search, Settings2, Trash2, Undo2, X } from 'lucide-react'
import { createId } from '../data'
import { cloneMind, findMind, findMindParent, insertMindParent, mindToOutline, normalizeMind, parseMindClipboard, parseMindOutline, removeMind, reparentMind, reorderMind, setBranchSide, visitVisibleMind, walkMind } from '../mindmap'
import { createMindScene, exportMindSvg, MIND_THEMES } from '../mindmapGraph'
import { useEditorI18n } from '../i18n'
import type { MindMapData, MindMapNode, MindMapNodeStyle } from '../types'

type Editing = { id: string; text: string; left: number; top: number; width: number; height: number }
type Snapshot = MindMapData
type ControlPoint = { left: number; top: number; offset: number }
const controlStyle = ({ left, top, offset }: ControlPoint): CSSProperties => ({ left, top, '--mind-control-offset': `${offset}px` } as CSSProperties)
const copy = (data: Snapshot): Snapshot => ({ ...data, nodeData: cloneMind(data.nodeData) })
const CLIPBOARD_TYPE = 'application/x-slate-kit-mindmap+json'
const styles: Array<MindMapNodeStyle | ''> = ['', 'rounded', 'solid', 'pill', 'square', 'underline']
const styleKeys = ['mindmap.autoStyle', 'ui.roundedCard', 'ui.solidFill', 'ui.pill', 'ui.squareCard', 'mindmap.underline']

function Tool({ label, children, active, ...props }: { label: string; children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-label={label} title={props.title || label} aria-pressed={active} className={`sk-mind-tool ${active ? 'is-active' : ''}`} {...props}>{children}</button>
}

export function MindMapWorkspace({ data, close, commit }: { data: MindMapData; close(): void; commit(data: MindMapData, svg: string, size: { width: number; height: number }): void | Promise<void> }) {
  const { t } = useEditorI18n()
  const tRef = useRef(t); tRef.current = t
  const dialogRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLDivElement>(null), graphRef = useRef<MindMapCanvas | null>(null), controlsRef = useRef<HTMLDivElement>(null)
  const [initialData] = useState<Snapshot>(() => ({ ...data, nodeData: normalizeMind(cloneMind(data.nodeData), true, { root: t('ui.centralTopic'), child: t('ui.newTopic') }) }))
  const dataRef = useRef(initialData)
  const root = () => dataRef.current.nodeData
  const selectionRef = useRef(root().id)
  const [selectedId, setSelectedId] = useState(selectionRef.current)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<'map' | 'outline'>('map'), viewRef = useRef(view); viewRef.current = view
  const [panel, setPanel] = useState<'topic' | 'map' | null>(() => typeof window !== 'undefined' && window.innerWidth <= 740 ? null : 'map')
  const [zen, setZen] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [subtreeStyle, setSubtreeStyle] = useState(false)
  const [quick, setQuick] = useState<ControlPoint>({ left: -100, top: -100, offset: 0 })
  const [folds, setFolds] = useState<Array<ControlPoint & { id: string; collapsed: boolean; count: number }>>([])
  const [editing, setEditing] = useState<Editing | null>(null), editingRef = useRef<Editing | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const [initialHistory] = useState(() => ({ past: [] as Snapshot[], future: [] as Snapshot[], present: copy(initialData) }))
  const history = useRef(initialHistory)
  const baseline = useRef('')
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), busyRef = useRef(false)
  const [error, setError] = useState(''), [confirmClose, setConfirmClose] = useState(false), [help, setHelp] = useState(false)
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null), menuRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState<string | null>(null), searchRef = useRef<HTMLInputElement>(null)
  const [matchIndex, setMatchIndex] = useState(-1)
  const originalFocus = useRef<HTMLElement | null>(null)
  const selected = findMind(root(), selectedId) || root()
  const theme = MIND_THEMES[dataRef.current.theme || 'classic']
  const allNodes = useMemo(() => { const nodes: MindMapNode[] = []; walkMind(root(), node => nodes.push(node)); return nodes }, [revision])
  const nodeById = useMemo(() => new Map(allNodes.map(node => [node.id, node])), [allNodes])
  const matches = search?.trim() ? allNodes.filter(node => node.topic.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : []

  const updateViewport = useCallback(() => {
    const canvas = graphRef.current, controls = controlsRef.current; if (!canvas) return
    const { x, y, scale } = canvas.viewport()
    if (controls) { controls.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; controls.style.setProperty('--mind-inverse-scale', String(1 / scale)) }
    setZoom(Math.round(scale * 100))
  }, [])
  const positionControls = useCallback(() => {
    const graph = graphRef.current; if (!graph) return
    const byId = new Map(graph.nodes().map(node => [node.id, node])), points: typeof folds = []
    visitVisibleMind(dataRef.current.nodeData, node => {
      const rect = byId.get(node.id); if (!rect) return
      const sign = node.side === 'left' ? -1 : 1, edge = rect.x + (sign < 0 ? 0 : rect.width), top = rect.y + rect.height / 2
      if (node.id === selectionRef.current) setQuick({ left: edge, top, offset: sign * (node.children?.length ? 47 : 22) })
      if (node.children?.length) points.push({ id: node.id, left: edge, top, offset: sign * 19, collapsed: node.expanded === false, count: node.children.length })
    })
    setFolds(points); updateViewport()
  }, [updateViewport])
  const select = useCallback((id: string, reveal = false) => {
    const graph = graphRef.current; if (!graph?.has(id)) return
    graph.select(id); selectionRef.current = id; setSelectedId(id)
    if (reveal && viewRef.current === 'map') {
      const rect = graph.rect(id), canvas = canvasRef.current
      if (rect && canvas) {
        const dx = rect.left < 40 ? 40 - rect.left : rect.left + rect.width > canvas.clientWidth - 60 ? canvas.clientWidth - 60 - rect.left - rect.width : 0
        const dy = rect.top < 40 ? 40 - rect.top : rect.top + rect.height > canvas.clientHeight - 60 ? canvas.clientHeight - 60 - rect.top - rect.height : 0
        if (dx || dy) { const { x, y } = graph.viewport(); graph.translate(x + dx, y + dy) }
      }
    }
    positionControls()
  }, [positionControls])
  const redraw = useCallback((id = selectionRef.current, layout = false) => {
    const graph = graphRef.current; if (!graph) return
    graph.sync(createMindScene(dataRef.current.nodeData, layout, dataRef.current))
    select(graph.has(id) ? id : dataRef.current.nodeData.id)
    setRevision(value => value + 1)
  }, [select])
  const record = useCallback(() => {
    const stack = history.current, next = copy(dataRef.current)
    if (JSON.stringify(stack.present) === JSON.stringify(next)) return
    stack.past.push(stack.present); if (stack.past.length > 100) stack.past.shift()
    stack.present = next; stack.future = []
    setDirty(JSON.stringify(next) !== baseline.current); setError(''); setRevision(value => value + 1)
  }, [])
  const updateEditing = (value: Editing | null) => { editingRef.current = value; setEditing(value) }
  const finishEdit = useCallback((cancel = false) => {
    const current = editingRef.current; if (!current) return
    editingRef.current = null; setEditing(null)
    const node = findMind(dataRef.current.nodeData, current.id)
    if (!cancel && node && node.topic !== current.text.trim()) {
      node.topic = current.text.trim() || tRef.current('ui.newTopic'); redraw(node.id, true); record()
    }
  }, [record, redraw])
  const beginEdit = useCallback((id: string, text?: string) => {
    const node = findMind(dataRef.current.nodeData, id); if (!node || busyRef.current) return
    select(id)
    const rect = graphRef.current?.rect(id)
    const next = { id, text: text ?? node.topic, left: rect?.left || 0, top: rect?.top || 0, width: Math.max(100, rect?.width || 120), height: Math.max(42, rect?.height || 42) }
    editingRef.current = next; setEditing(next)
  }, [select])
  const focusCanvas = () => (viewRef.current === 'outline' ? dialogRef.current?.querySelector<HTMLElement>('.sk-mind-outline') : canvasRef.current)?.focus({ preventScroll: true })
  const fit = () => graphRef.current?.fit()
  const toggleFold = (id = selectionRef.current) => {
    finishEdit()
    const node = findMind(root(), id); if (!node?.children?.length) return
    node.expanded = node.expanded === false; redraw(id, true); record(); focusCanvas()
  }
  const add = (sibling = false, before = false) => {
    finishEdit()
    const current = findMind(root(), selectionRef.current) || root()
    const parent = sibling ? findMindParent(root(), current.id) || root() : current
    const children = parent.children || [], right = children.filter(child => child.side !== 'left').length
    const side = dataRef.current.structure && dataRef.current.structure !== 'balanced' ? dataRef.current.structure : sibling && current !== root() ? current.side : parent === root() ? (right > children.length - right ? 'left' : 'right') : parent.side
    const child = normalizeMind({ id: createId(), topic: t('ui.newTopic'), side })
    const index = sibling && current !== root() ? children.indexOf(current) + (before ? 0 : 1) : children.length
    parent.children = [...children.slice(0, index), child, ...children.slice(index)]; parent.expanded = true
    redraw(child.id, true); record(); select(child.id, true); beginEdit(child.id)
  }
  const remove = (keepChildren = false) => { finishEdit(); const id = removeMind(root(), selectionRef.current, keepChildren); if (id) { redraw(id, true); record(); focusCanvas() } }
  const addParent = () => { finishEdit(); const node = insertMindParent(root(), selectionRef.current, t('ui.newTopic')); if (node) { redraw(node.id, true); record(); beginEdit(node.id) } }
  const undo = (redo = false) => {
    finishEdit(); const stack = history.current, source = redo ? stack.future : stack.past, target = redo ? stack.past : stack.future
    const value = source.pop(); if (!value) return
    target.push(stack.present); dataRef.current = copy(value); stack.present = copy(value)
    redraw(); setDirty(JSON.stringify(value) !== baseline.current); setError(''); focusCanvas()
  }
  const changeNode = (patch: Partial<MindMapNode>) => {
    finishEdit(); const node = findMind(root(), selectionRef.current) || root()
    if (subtreeStyle) walkMind(node, item => Object.assign(item, patch)); else Object.assign(node, patch)
    redraw(node.id, true); record()
  }
  const changeMap = (patch: Partial<Omit<MindMapData, 'nodeData'>>) => {
    finishEdit(); Object.assign(dataRef.current, patch)
    if (patch.structure === 'balanced') root().children?.forEach((node, i) => setBranchSide(node, i % 2 ? 'left' : 'right'))
    redraw(selectionRef.current, true); record()
  }
  const expandAll = (expanded: boolean) => { finishEdit(); walkMind(root(), node => { node.expanded = node === root() || expanded }); redraw(root().id, true); record(); fit() }
  const paste = (sources: MindMapNode[]) => {
    const current = findMind(root(), selectionRef.current) || root()
    const children = sources.map(source => { const child = cloneMind(source); walkMind(child, node => { node.id = createId(); delete node.x; delete node.y }); setBranchSide(child, current.side || (dataRef.current.structure === 'left' ? 'left' : 'right')); return child })
    if (!children.length) return
    current.children = [...(current.children || []), ...children]; current.expanded = true; redraw(children[0].id, true); record(); select(children[0].id, true)
  }
  const duplicate = () => {
    const current = findMind(root(), selectionRef.current) || root(), parent = findMindParent(root(), current.id)
    if (!parent?.children) { paste([current]); return }
    const child = cloneMind(current); walkMind(child, node => { node.id = createId(); delete node.x; delete node.y })
    parent.children.splice(parent.children.indexOf(current) + 1, 0, child)
    redraw(child.id, true); record(); focusCanvas()
  }
  const save = async () => {
    if (busyRef.current || !graphRef.current) return
    finishEdit(); busyRef.current = true; setSaving(true); setError('')
    try {
      const result = exportMindSvg(createMindScene(dataRef.current.nodeData, false, dataRef.current))
      await commit(copy(dataRef.current), result.svg, result.size)
    } catch { setError(t('mindmap.saveError')); select(selectionRef.current) }
    finally { busyRef.current = false; setSaving(false) }
  }
  const requestClose = () => {
    if (busyRef.current) return
    finishEdit(); setMenu(null)
    if (JSON.stringify(dataRef.current) !== baseline.current) setConfirmClose(true); else close()
  }
  const exportSvg = async () => {
    if (!graphRef.current) return
    finishEdit()
    try {
      const { svg } = exportMindSvg(createMindScene(dataRef.current.nodeData, false, dataRef.current))
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${root().topic.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'mind-map'}.svg`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('mindmap.exportError')) }
    finally { select(selectionRef.current) }
  }
  const goToMatch = (index: number) => {
    const node = matches[(index + matches.length) % matches.length]; if (!node) return
    let parent = findMindParent(root(), node.id), changed = false
    while (parent) { if (parent.expanded === false) { parent.expanded = true; changed = true }; parent = findMindParent(root(), parent.id) }
    redraw(node.id, changed); if (changed) record()
    graphRef.current?.center(node.id); setMatchIndex((index + matches.length) % matches.length)
  }

  useEffect(() => {
    originalFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    focusCanvas()
    return () => { document.body.style.overflow = overflow; originalFocus.current?.focus({ preventScroll: true }) }
  }, [])
  useLayoutEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    let dropTarget: string | null = null
    const graph = new MindMapCanvas(canvas, {
      select: id => { select(id); setMenu(null); focusCanvas() },
      edit: id => beginEdit(id),
      menu: (id, x, y) => { select(id); setMenu({ left: Math.max(8, Math.min(x, window.innerWidth - 242)), top: Math.max(8, Math.min(y, window.innerHeight - 380)) }) },
      blank: () => { setMenu(null); focusCanvas() },
      moving: (id, point) => {
        const tree = dataRef.current.nodeData, item = findMind(tree, id); if (!item || item === tree) return
        const descendants = new Set<string>(); walkMind(item, node => descendants.add(node.id))
        const target = graph.nodes().find(node => !descendants.has(node.id) && point.x >= node.x && point.x <= node.x + node.width && point.y >= node.y && point.y <= node.y + node.height)
        dropTarget = target && findMindParent(tree, id)?.id !== target.id ? target.id : null
        graph.highlight(dropTarget)
      },
      moved: id => {
        const tree = dataRef.current.nodeData, item = findMind(tree, id), rootRect = graph.nodes().find(node => node.id === tree.id)
        if (!item || !rootRect) return
        const cx = rootRect.x + rootRect.width / 2, cy = rootRect.y + rootRect.height / 2, positions = new Map(graph.nodes().map(node => [node.id, node]))
        walkMind(tree, current => { const rect = positions.get(current.id); if (rect) { current.x = rect.x + rect.width / 2 - cx; current.y = rect.y + rect.height / 2 - cy } })
        const { x, y, scale } = graph.viewport(); graph.translate(x + cx * scale, y + cy * scale)
        let relayout = dropTarget ? reparentMind(tree, id, dropTarget) : false
        dropTarget = null; graph.highlight(null)
        if (findMindParent(tree, id) === tree) { const side = dataRef.current.structure === 'left' || dataRef.current.structure === 'right' ? dataRef.current.structure : (item.x || 0) >= 0 ? 'right' : 'left'; if (side !== item.side) { setBranchSide(item, side); relayout = true } }
        redraw(id, relayout); record()
      },
      viewport: updateViewport,
    })
    graphRef.current = graph
    redraw(dataRef.current.nodeData.id); history.current.present = copy(dataRef.current); baseline.current = JSON.stringify(dataRef.current)
    graph.fit(canvas.clientWidth <= 740 ? 40 : 90, canvas.clientWidth <= 740 ? .85 : .2)
    const observer = new ResizeObserver(() => { if (canvas.clientWidth && canvas.clientHeight) graph.resize(canvas.clientWidth, canvas.clientHeight) }); observer.observe(canvas)
    return () => { observer.disconnect(); graph.destroy(); graphRef.current = null }
  }, [beginEdit, record, redraw, select, updateViewport])
  useEffect(() => {
    if (editing) { editRef.current?.focus({ preventScroll: true }); if (editingRef.current?.text === findMind(root(), editing.id)?.topic) editRef.current?.select() }
  }, [editing?.id, view])
  useEffect(() => { focusCanvas() }, [view, zen])
  useEffect(() => {
    if (view === 'outline') dialogRef.current?.querySelector('.sk-mind-outline-row.is-selected')?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId, view])
  useEffect(() => { if (search !== null) searchRef.current?.focus() }, [search === null])
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as globalThis.Node)) setMenu(null) }
    document.addEventListener('pointerdown', dismiss); return () => document.removeEventListener('pointerdown', dismiss)
  }, [menu])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (JSON.stringify(dataRef.current) !== baseline.current) event.preventDefault() }
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler)
  }, [])
  useEffect(() => {
    if (!confirmClose && !help) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLButtonElement>('.sk-mind-overlay button')?.focus()
    return () => previous?.focus({ preventScroll: true })
  }, [confirmClose, help])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    const modifier = event.metaKey || event.ctrlKey, key = event.key.toLowerCase(), target = event.target as HTMLElement
    if (event.key === 'Tab') {
      const scope = target.closest('.sk-mind-overlay') || (target.closest('button,input,select,textarea,[role="menuitem"]') && dialogRef.current)
      if (scope) {
        const items = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea')).filter(el => el.getClientRects().length)
        if (event.shiftKey && target === items[0]) { event.preventDefault(); items.at(-1)?.focus(); return }
        if (!event.shiftKey && target === items.at(-1)) { event.preventDefault(); items[0]?.focus(); return }
      }
    }
    if (modifier && key === 's') { event.preventDefault(); if (!help) void save(); return }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (editingRef.current) finishEdit(true)
      else if (confirmClose) setConfirmClose(false)
      else if (help) setHelp(false)
      else if (menu) setMenu(null)
      else if (search !== null) setSearch(null)
      else if (zen) setZen(false)
      else requestClose()
      focusCanvas(); return
    }
    if (help || confirmClose || saving) return
    if (modifier && key === 'f') { event.preventDefault(); setSearch(''); setMatchIndex(-1); return }
    if (target.closest('textarea,input,select,[contenteditable="true"]')) return
    if (modifier && key === 'z') { event.preventDefault(); undo(event.shiftKey) }
    else if (modifier && key === 'y') { event.preventDefault(); undo(true) }
    else if (modifier && key === 'b') { event.preventDefault(); changeNode({ bold: !selected.bold }) }
    else if (modifier && event.key === '/') { event.preventDefault(); toggleFold() }
    else if (modifier && ['=', '+', '-', '0'].includes(event.key)) { event.preventDefault(); if (key === '0') fit(); else graphRef.current?.zoom(key === '-' ? -.1 : .1) }
    else if (target.closest('button,[role="menu"]')) return
    else if (modifier && event.key === 'Enter') { event.preventDefault(); addParent() }
    else if (event.key === 'Tab') { event.preventDefault(); if (event.shiftKey) select(findMindParent(root(), selectedId)?.id || root().id, true); else add() }
    else if (event.key === 'Enter') { event.preventDefault(); add(true, event.shiftKey) }
    else if (event.key === 'F2' || event.key === ' ') { event.preventDefault(); beginEdit(selectedId) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(modifier) }
    else if (event.key === 'Home') { event.preventDefault(); select(root().id); graphRef.current?.center(root().id) }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      if (event.altKey && (key === 'arrowup' || key === 'arrowdown')) { if (reorderMind(root(), selectedId, key === 'arrowup' ? -1 : 1)) { redraw(); record() }; return }
      const parent = findMindParent(root(), selectedId)
      if (key === 'arrowup' || key === 'arrowdown') {
        const siblings = view === 'outline' ? (() => { const list: MindMapNode[] = []; visitVisibleMind(root(), n => list.push(n)); return list })() : (parent?.children || []).filter(node => node.side === selected.side)
        const next = siblings[siblings.indexOf(selected) + (key === 'arrowdown' ? 1 : -1)]; if (next) select(next.id, true)
      } else if (selected === root()) {
        const child = selected.children?.find(node => view === 'outline' || node.side === (key === 'arrowleft' ? 'left' : 'right')); if (child && selected.expanded !== false) select(child.id, true)
      } else {
        const outward = key === (view === 'map' && selected.side === 'left' ? 'arrowleft' : 'arrowright')
        if (outward && selected.expanded === false) toggleFold()
        else if (outward && selected.children?.[0]) select(selected.children[0].id, true)
        else if (!outward && parent) select(parent.id, true)
      }
    } else if (!modifier && !event.altKey && event.key.length === 1) { event.preventDefault(); beginEdit(selectedId, event.key) }
  }
  const editTextarea = (outline = false) => editing && <textarea ref={editRef} className={`sk-mind-text-editor ${outline ? 'is-outline' : ''}`} aria-label={t('ui.editText')} style={outline ? undefined : { left: editing.left, top: editing.top, width: editing.width, height: editing.height, fontSize: (findMind(root(), editing.id)?.fontSize || (editing.id === root().id ? 18 : 16)) * zoom / 100 }} value={editing.text} onChange={event => updateEditing({ ...editing, text: event.target.value })} onBlur={() => finishEdit()} onKeyDown={event => {
    event.stopPropagation(); if (event.nativeEvent.isComposing) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
    else if (event.key === 'Escape') { event.preventDefault(); finishEdit(true); focusCanvas() }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEdit(); focusCanvas() }
    else if (event.key === 'Tab') { event.preventDefault(); finishEdit(); if (event.shiftKey) { select(findMindParent(root(), selectionRef.current)?.id || root().id, true); focusCanvas() } else add() }
  }} />
  const outlineNode = (node: MindMapNode, depth = 0): ReactNode => <div key={node.id} role="treeitem" aria-selected={selectedId === node.id} aria-expanded={node.children?.length ? node.expanded !== false : undefined} aria-level={depth + 1}>
    <div className={`sk-mind-outline-row ${selectedId === node.id ? 'is-selected' : ''}`} style={{ '--depth': depth } as CSSProperties} onClick={() => { select(node.id); dialogRef.current?.querySelector<HTMLElement>('.sk-mind-outline')?.focus() }} onDoubleClick={() => beginEdit(node.id)}>
      <button className="sk-mind-outline-fold" aria-label={t(node.expanded === false ? 'mindmap.expand' : 'mindmap.collapse')} disabled={!node.children?.length} onClick={event => { event.stopPropagation(); toggleFold(node.id) }}>{node.expanded === false ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
      {editing?.id === node.id ? editTextarea(true) : <><span className={depth === 0 ? 'is-root' : ''}>{node.topic}</span>{!!node.children?.length && <small>{node.children.length}</small>}</>}
    </div>
    {node.expanded !== false && !!node.children?.length && <div role="group">{node.children.map(child => outlineNode(child, depth + 1))}</div>}
  </div>
  const menuAction = (action: () => void) => { setMenu(null); action() }

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('ui.mindMapEditor')} className={`sk-diagram-dialog sk-mind-dialog ${zen ? 'is-zen' : ''}`} onKeyDown={onKeyDown} onCopy={event => {
    event.stopPropagation(); if (editing || (event.target as HTMLElement).closest('input,textarea,select')) return
    event.preventDefault(); event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(selected)); event.clipboardData.setData('text/plain', mindToOutline(selected))
  }} onCut={event => {
    event.stopPropagation(); if (editing || (event.target as HTMLElement).closest('input,textarea,select')) return
    event.preventDefault(); event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(selected)); event.clipboardData.setData('text/plain', mindToOutline(selected)); remove()
  }} onPaste={event => {
    event.stopPropagation(); if (editing || (event.target as HTMLElement).closest('input,textarea,select')) return
    const raw = event.clipboardData.getData(CLIPBOARD_TYPE), plain = event.clipboardData.getData('text/plain'), source = raw ? parseMindClipboard(raw) : null
    if (source || plain.trim()) { event.preventDefault(); paste(source ? [source] : parseMindOutline(plain)) }
  }}>
    <header className="sk-mind-header">
      <div className="sk-mind-heading"><span className="sk-mind-app-icon"><Network size={19} /></span><div><b>{root().topic}</b><small><span className={dirty ? 'is-dirty' : ''} />{t(saving ? 'mindmap.saving' : dirty ? 'mindmap.unsaved' : 'mindmap.saved')}</small></div></div>
      <div className="sk-mind-view-switch" role="group" aria-label={t('mindmap.view')}><button aria-pressed={view === 'map'} onClick={() => { finishEdit(); setView('map') }}><Network size={15} /><span>{t('ui.mindMap')}</span></button><button aria-pressed={view === 'outline'} onClick={() => { finishEdit(); setView('outline') }}><ListTree size={15} /><span>{t('mindmap.outline')}</span></button></div>
      <div className="sk-mind-header-actions"><Tool label={t('mindmap.exportSvg')} onClick={() => void exportSvg()}><Download size={17} /></Tool><button className="is-primary" disabled={saving} onClick={() => void save()}><Save size={15} /><span>{t(saving ? 'mindmap.saving' : 'ui.saveAndReturn')}</span></button><Tool label={t('ui.closeMindMapEditor')} disabled={saving} onClick={requestClose}><X size={19} /></Tool></div>
    </header>
    <div className="sk-mind-toolbar" role="toolbar" aria-label={t('mindmap.toolbar')}>
      <div className="sk-mind-tool-group"><Tool label={t('ui.undo')} title={`${t('ui.undo')} · Ctrl/⌘ Z`} disabled={!history.current.past.length} onClick={() => undo()}><Undo2 size={18} /></Tool><Tool label={t('ui.redo')} title={`${t('ui.redo')} · Ctrl/⌘ Shift Z`} disabled={!history.current.future.length} onClick={() => undo(true)}><Redo2 size={18} /></Tool></div>
      <i />
      <div className="sk-mind-tool-group"><Tool label={t('ui.addSibling')} title={`${t('ui.addSibling')} · Enter`} onClick={() => add(true)}><Plus size={19} /><span>{t('mindmap.topic')}</span></Tool><Tool label={t('ui.addChild')} title={`${t('ui.addChild')} · Tab`} onClick={() => add()}><CornerDownRight size={19} /><span>{t('mindmap.subtopic')}</span></Tool><Tool label={t('mindmap.addParent')} disabled={selected === root()} onClick={addParent}><GitBranch size={18} /><span>{t('mindmap.parentTopic')}</span></Tool></div>
      <i />
      <div className="sk-mind-tool-group"><Tool label={t('ui.editText')} title={`${t('ui.editText')} · Space / F2`} onClick={() => beginEdit(selectedId)}><Pencil size={17} /><span>{t('mindmap.edit')}</span></Tool><Tool label={t(selected.expanded === false ? 'mindmap.expand' : 'mindmap.collapse')} disabled={!selected.children?.length} onClick={() => toggleFold()}>{selected.expanded === false ? <ChevronsUpDown size={18} /> : <ChevronsDownUp size={18} />}<span>{t(selected.expanded === false ? 'mindmap.expandShort' : 'mindmap.collapseShort')}</span></Tool></div>
      <div className="sk-mind-toolbar-spacer" />
      <Tool label={t('mindmap.find')} active={search !== null} onClick={() => setSearch(search === null ? '' : null)}><Search size={18} /></Tool><Tool label={t('mindmap.zen')} active={zen} onClick={() => setZen(!zen)}><Focus size={18} /></Tool><Tool label={t('mindmap.format')} active={panel !== null} onClick={() => setPanel(panel ? null : 'topic')}><Settings2 size={18} /><span>{t('mindmap.format')}</span></Tool>
    </div>
    <div className="sk-mind-workarea">
      <div className="sk-mind-stage">
        <div className={`sk-mind-editor-shell ${view === 'outline' ? 'is-hidden' : ''} ${dataRef.current.background === 'dots' ? 'has-dots' : ''}`}>
          <div ref={canvasRef} className="sk-mind-leafer-canvas" tabIndex={0} role="application" aria-label={t('mindmap.canvas')} onMouseDown={focusCanvas} onCompositionStart={() => { if (!editingRef.current) beginEdit(selectionRef.current, '') }} />
          <div ref={controlsRef} className="sk-mind-controls" onPointerDown={event => event.stopPropagation()} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}>
          {!editing && <button className="sk-mind-node-add" style={controlStyle(quick)} title={`${t('ui.addChild')} · Tab`} aria-label={t('mindmap.quickAdd')} onClick={() => add()}><Plus size={14} /></button>}
          {!editing && folds.filter(point => zoom >= 85 || point.id === selectedId).map(point => <button key={point.id} className={`sk-mind-node-fold ${point.collapsed ? 'is-collapsed' : ''} ${point.id === selectedId ? 'is-selected' : ''}`} style={controlStyle(point)} aria-label={`${t(point.collapsed ? 'mindmap.expand' : 'mindmap.collapse')}: ${nodeById.get(point.id)?.topic}`} onClick={() => toggleFold(point.id)}>{point.collapsed ? point.count : <Minus size={12} />}</button>)}
          </div>
          {view === 'map' && editTextarea()}
        </div>
        {view === 'outline' && <div className="sk-mind-outline" tabIndex={0} role="tree" aria-label={t('mindmap.outline')}><div className="sk-mind-outline-title"><ListTree size={17} />{t('mindmap.outline')}</div>{outlineNode(root())}</div>}
        {search !== null && <div className="sk-mind-search"><Search size={16} /><input ref={searchRef} aria-label={t('mindmap.find')} placeholder={t('mindmap.findPlaceholder')} value={search} onChange={event => { setSearch(event.target.value); setMatchIndex(-1) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); goToMatch(matchIndex + (event.shiftKey ? -1 : 1)) } }} /><span>{matches.length ? `${Math.max(0, matchIndex + 1)}/${matches.length}` : search ? t('mindmap.noResults') : ''}</span><Tool label={t('mindmap.previousResult')} disabled={!matches.length} onClick={() => goToMatch(matchIndex - 1)}><ChevronLeft size={16} /></Tool><Tool label={t('mindmap.nextResult')} disabled={!matches.length} onClick={() => goToMatch(matchIndex + 1)}><ChevronRight size={16} /></Tool><Tool label={t('mindmap.closeSearch')} onClick={() => { setSearch(null); focusCanvas() }}><X size={16} /></Tool></div>}
        {zen && <button className="sk-mind-exit-zen" onClick={() => setZen(false)}><Focus size={16} />{t('mindmap.exitZen')}<kbd>Esc</kbd></button>}
        {view === 'map' && <div className="sk-mind-navigation"><Tool label={t('mindmap.root')} onClick={() => { select(root().id); graphRef.current?.center(root().id) }}><Focus size={17} /></Tool><i /><Tool label={t('ui.zoomOut')} disabled={zoom <= 20} onClick={() => graphRef.current?.zoom(-.1)}><Minus size={17} /></Tool><button className="sk-mind-zoom-value" title={t('mindmap.actualSize')} onClick={() => graphRef.current?.zoomTo(1)}>{zoom}%</button><Tool label={t('ui.zoomIn')} disabled={zoom >= 300} onClick={() => graphRef.current?.zoom(.1)}><Plus size={17} /></Tool><i /><Tool label={t('ui.fitCanvas')} onClick={fit}><Maximize2 size={16} /></Tool></div>}
      </div>
      <aside className={`sk-mind-inspector ${panel && !zen ? 'is-open' : ''}`} aria-label={t('mindmap.format')} inert={!panel || zen}>
        <div className="sk-mind-inspector-tabs" role="tablist" aria-label={t('mindmap.format')}><button role="tab" id="sk-mind-topic-tab" aria-controls="sk-mind-topic-panel" aria-selected={panel === 'topic'} onClick={() => setPanel('topic')}>{t('mindmap.style')}</button><button role="tab" id="sk-mind-map-tab" aria-controls="sk-mind-map-panel" aria-selected={panel === 'map'} onClick={() => setPanel('map')}>{t('mindmap.map')}</button><Tool label={t('mindmap.closePanel')} onClick={() => setPanel(null)}><X size={15} /></Tool></div>
        <div className="sk-mind-inspector-content" role="tabpanel" id={panel === 'topic' ? 'sk-mind-topic-panel' : 'sk-mind-map-panel'} aria-labelledby={panel === 'topic' ? 'sk-mind-topic-tab' : 'sk-mind-map-tab'}>
          {panel === 'topic' ? <>
            <div className="sk-mind-selection-info"><small>{t('mindmap.selectedTopic')}</small><strong title={selected.topic}>{selected.topic}</strong></div>
            <section><h3>{t('ui.nodeStyle')}</h3><div className="sk-mind-shapes">{styles.map((style, i) => <button key={style} aria-pressed={(selected.style || '') === style} onClick={() => changeNode({ style: style || undefined })}><span className={`sk-mind-shape-sample is-${style || 'auto'}`} style={{ '--branch': selected.color || theme.colors[0] } as CSSProperties}>{style ? 'Aa' : <Network size={22} />}</span><span>{t(styleKeys[i])}</span></button>)}</div></section>
            <section><h3>{t('mindmap.branchColor')}</h3><div className="sk-mind-swatches">{[...theme.colors, '#343b48', '#e2a848', '#c778b1'].map((color, i) => <button key={`${color}-${i}`} className="sk-mind-swatch" style={{ background: color }} title={color} aria-label={t('mindmap.color', { color })} aria-pressed={selected.color === color} onClick={() => changeNode({ color })}>{selected.color === color && <Check size={14} />}</button>)}<label className="sk-mind-custom-color" title={t('mindmap.customColor')}><Plus size={15} /><input type="color" aria-label={t('mindmap.customColor')} value={selected.color || theme.colors[0]} onChange={event => changeNode({ color: event.target.value })} /></label></div><button className="sk-mind-text-button" onClick={() => changeNode({ color: undefined })}>{t('mindmap.resetColor')}</button></section>
            <section><h3>{t('mindmap.text')}</h3><div className="sk-mind-text-controls"><label><span>{t('mindmap.fontSize')}</span><select aria-label={t('mindmap.fontSize')} value={selected.fontSize || (selected === root() ? 18 : 16)} onChange={event => changeNode({ fontSize: Number(event.target.value) })}>{[12, 14, 16, 18, 20, 24, 28, 32, 36].map(size => <option key={size} value={size}>{size}</option>)}</select></label><Tool label={t('ui.bold')} active={selected.bold === true} onClick={() => changeNode({ bold: !selected.bold })}><Bold size={17} /></Tool></div></section>
            <label className="sk-mind-subtree"><input type="checkbox" checked={subtreeStyle} onChange={event => setSubtreeStyle(event.target.checked)} />{t('mindmap.subtreeStyle')}</label>
            <div className="sk-mind-topic-actions"><button onClick={() => beginEdit(selectedId)}><Pencil size={15} />{t('ui.editText')}<kbd>F2</kbd></button><button className="is-danger" disabled={selected === root()} onClick={() => remove()}><Trash2 size={15} />{t('ui.deleteNode')}<kbd>⌫</kbd></button></div>
          </> : <>
            <section><h3>{t('mindmap.structure')}</h3><div className="sk-mind-structures">{(['balanced', 'right', 'left'] as const).map(structure => <button key={structure} aria-pressed={(dataRef.current.structure || 'balanced') === structure} onClick={() => changeMap({ structure })}><span className={`sk-mind-structure-preview is-${structure}`}><i /><i /><i /><i /><i /></span><span>{t(`mindmap.structure.${structure}`)}</span></button>)}</div></section>
            <section><h3>{t('mindmap.colorTheme')}</h3><div className="sk-mind-themes">{(Object.keys(MIND_THEMES) as Array<keyof typeof MIND_THEMES>).map(name => <button key={name} aria-pressed={(dataRef.current.theme || 'classic') === name} onClick={() => changeMap({ theme: name })}><span className="sk-mind-theme-preview" style={{ '--theme-root': MIND_THEMES[name].root } as CSSProperties}><i /><span>{MIND_THEMES[name].colors.slice(0, 4).map(color => <i key={color} style={{ background: color }} />)}</span></span><span>{t(`mindmap.theme.${name}`)}{(dataRef.current.theme || 'classic') === name && <Check size={13} />}</span></button>)}</div></section>
            <section><h3>{t('mindmap.background')}</h3><div className="sk-mind-segmented">{(['plain', 'dots'] as const).map(background => <button key={background} aria-pressed={(dataRef.current.background || 'plain') === background} onClick={() => changeMap({ background })}>{t(`mindmap.background.${background}`)}</button>)}</div></section>
            <section className="sk-mind-layout-actions"><h3>{t('mindmap.branches')}</h3><button onClick={() => { finishEdit(); redraw(selectedId, true); record(); fit() }}><Network size={16} />{t('mindmap.layout')}</button><button onClick={() => expandAll(true)}><ChevronsUpDown size={16} />{t('mindmap.expandAll')}</button><button onClick={() => expandAll(false)}><ChevronsDownUp size={16} />{t('mindmap.collapseAll')}</button></section>
          </>}
        </div>
      </aside>
    </div>
    <footer className="sk-mind-statusbar"><span><Network size={13} />{t('mindmap.topicCount', { count: allNodes.length })}</span><span className="sk-mind-short-hints"><kbd>Tab</kbd>{t('mindmap.subtopic')}<kbd>Enter</kbd>{t('mindmap.topic')}<kbd>Space</kbd>{t('mindmap.edit')}</span><button onClick={() => setHelp(true)}><CircleHelp size={15} /><span>{t('mindmap.keyboardShortcuts')}</span></button></footer>
    {error && <div role="alert" className="sk-mind-error">{error}<button onClick={() => setError('')} aria-label={t('mindmap.dismissError')}><X size={15} /></button></div>}
    {menu && <div ref={menuRef} role="menu" aria-label={t('mindmap.topicActions')} className="sk-mind-context-menu" style={menu} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')), index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() } }}><button role="menuitem" onClick={() => menuAction(() => add(true))}><Plus size={15} />{t('ui.addSibling')}<kbd>Enter</kbd></button><button role="menuitem" onClick={() => menuAction(() => add())}><CornerDownRight size={15} />{t('ui.addChild')}<kbd>Tab</kbd></button><button role="menuitem" disabled={selected === root()} onClick={() => menuAction(addParent)}><GitBranch size={15} />{t('mindmap.addParent')}<kbd>⌘ ↵</kbd></button><hr /><button role="menuitem" onClick={() => menuAction(() => beginEdit(selectedId))}><Pencil size={15} />{t('ui.editText')}<kbd>Space</kbd></button><button role="menuitem" onClick={() => menuAction(() => { duplicate() })}><Plus size={15} />{t('mindmap.duplicate')}</button><button role="menuitem" disabled={!selected.children?.length} onClick={() => menuAction(() => toggleFold())}><ChevronsDownUp size={15} />{t(selected.expanded === false ? 'mindmap.expand' : 'mindmap.collapse')}</button><hr /><button role="menuitem" onClick={() => menuAction(() => setPanel('topic'))}><Palette size={15} />{t('mindmap.format')}</button><button role="menuitem" className="is-danger" disabled={selected === root()} onClick={() => menuAction(() => remove())}><Trash2 size={15} />{t('ui.deleteNode')}<kbd>⌫</kbd></button><button role="menuitem" className="is-danger" disabled={selected === root()} onClick={() => menuAction(() => remove(true))}><AlignLeft size={15} />{t('mindmap.deleteSingle')}</button></div>}
    {(confirmClose || help) && <div className="sk-mind-overlay" onClick={event => { if (event.target === event.currentTarget && help) setHelp(false) }}><div role="dialog" aria-modal="true" aria-label={t(confirmClose ? 'mindmap.closeUnsaved' : 'mindmap.keyboardShortcuts')} className="sk-mind-popup">
      {confirmClose ? <><h2>{t('mindmap.closeUnsaved')}</h2><p>{t('mindmap.discardWarning')}</p><div className="sk-mind-popup-actions"><button onClick={() => setConfirmClose(false)}>{t('mindmap.continueEditing')}</button><button className="is-danger" onClick={close}>{t('mindmap.discard')}</button><button className="is-primary" disabled={saving} onClick={() => void save()}>{t('ui.saveAndReturn')}</button></div></> : <><div className="sk-mind-popup-heading"><h2>{t('mindmap.keyboardShortcuts')}</h2><Tool label={t('mindmap.closeHelp')} onClick={() => setHelp(false)}><X size={18} /></Tool></div><div className="sk-mind-shortcut-list">{[['ui.addChild', 'Tab'], ['ui.addSibling', 'Enter'], ['mindmap.insertBefore', 'Shift Enter'], ['mindmap.addParent', 'Ctrl/⌘ Enter'], ['ui.editText', 'Space / F2'], ['mindmap.newLine', 'Shift Enter'], ['mindmap.navigate', '↑ ↓ ← →'], ['mindmap.reorder', 'Alt ↑ / ↓'], ['mindmap.collapse', 'Ctrl/⌘ /'], ['ui.undo', 'Ctrl/⌘ Z'], ['ui.redo', 'Ctrl/⌘ Shift Z'], ['mindmap.find', 'Ctrl/⌘ F'], ['mindmap.save', 'Ctrl/⌘ S'], ['mindmap.copyPaste', 'Ctrl/⌘ C / V'], ['mindmap.deleteSingle', 'Ctrl/⌘ Delete']].map(([label, keys]) => <div key={label}><span>{t(label)}</span><kbd>{keys}</kbd></div>)}</div><p className="sk-mind-gesture-hint">{t('mindmap.gestureHint')}</p></>}
    </div></div>}
  </div>
}
