import { useEditorI18n } from '../i18n'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Transforms } from 'slate'
import { isSelectedElement, shouldOpenMediaPreview } from '../media'
import { DOMEditor } from 'slate-dom'
import { useFocused, useSelected, useSlateStatic, useReadOnly } from 'slate-react'
import { Graph, type Node } from '@antv/x6'
import { Export } from '@antv/x6-plugin-export'
import { Selection } from '@antv/x6-plugin-selection'
import { CornerDownRight, Maximize2, Palette, Pencil, Plus, Redo2, Save, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import '@antv/x6/dist/index.css'
import '@antv/x6-plugin-selection/dist/index.css'
import { createId } from '../data'
import { mindNodeSize as nodeSize, layoutMindTree, visitVisibleMind, reparentMind, parseMindClipboard } from '../mindmap'
import type { MindMapData, MindMapElement, MindMapNode, MindMapNodeStyle } from '../types'
import { MediaDownloadMenu, MediaLightbox } from './MediaLightbox'

type Side = 'left' | 'right'
type MindNode = MindMapNode
type MindNodeData = { topic: string; root: boolean; side: Side; color: string; nodeStyle: MindMapNodeStyle }

const COLORS = ['#d87963', '#599b8e', '#7394c5', '#a185b8', '#ca9b4b', '#bd7e97']
const EDITOR_WIDTH = 1180
const EDITOR_HEIGHT = 700
const MIND_PREVIEW_VERSION = 5

const textOf = (topic: unknown, fallback: string) => typeof topic === 'string' ? topic : String(topic || fallback)
const cloneMind = (node: MindNode): MindNode => ({ ...node, children: (node.children || []).map(cloneMind) })
const normalizeMind = (node: Partial<MindNode>, root = false, labels = { root: '中心主题', child: '新主题' }): MindNode => ({
  ...node,
  id: node.id || createId(),
  topic: textOf(node.topic || (root ? labels.root : labels.child), labels.child),
  expanded: node.expanded !== false,
  children: (node.children || []).map(child => normalizeMind(child, false, labels)),
}) as MindNode

const walkMind = (node: MindNode, visit: (item: MindNode, parent: MindNode | null, depth: number) => void, parent: MindNode | null = null, depth = 0) => {
  visit(node, parent, depth)
  ;(node.children || []).forEach(child => walkMind(child, visit, node, depth + 1))
}

const findMind = (root: MindNode, id: string): MindNode | null => {
  if (root.id === id) return root
  for (const child of root.children || []) { const found = findMind(child, id); if (found) return found }
  return null
}

const findParent = (root: MindNode, id: string): MindNode | null => {
  for (const child of root.children || []) {
    if (child.id === id) return root
    const found = findParent(child, id); if (found) return found
  }
  return null
}

const setBranchSide = (node: MindNode, side: Side) => {
  node.side = side
  ;(node.children || []).forEach(child => setBranchSide(child, side))
}

const layoutMind = (root: MindNode, force = false) => {
  let missing = false
  visitVisibleMind(root, node => { if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) missing = true })
  if (force || missing) layoutMindTree(root)
}

const renderMindGraph = (graph: Graph, root: MindNode, forceLayout = false) => {
  layoutMind(root, forceLayout)
  graph.clearCells()
  const origin = { x: EDITOR_WIDTH / 2, y: EDITOR_HEIGHT / 2 }
  const parentById = new Map<string, MindNode>()
  visitVisibleMind(root, (node, parent) => { if (parent) parentById.set(node.id, parent) })
  const topBranches = root.children || []
  const branchColor = (node: MindNode) => {
    let branch = node
    while (parentById.get(branch.id) && parentById.get(branch.id)?.id !== root.id) branch = parentById.get(branch.id) as MindNode
    const index = Math.max(0, topBranches.findIndex(item => item.id === branch.id))
    return branch.color || COLORS[index % COLORS.length]
  }
  visitVisibleMind(root, (item, _parent, depth) => {
    const rootNode = item.id === root.id
    const size = nodeSize(item, root)
    const color = item.color || (rootNode ? '#344b63' : branchColor(item))
    const nodeStyle = item.style || (rootNode ? 'solid' : 'rounded')
    const plain = depth > 1 && !item.style
    const solid = !plain && nodeStyle === 'solid'
    const radius = nodeStyle === 'pill' ? size.height / 2 : nodeStyle === 'square' ? 3 : rootNode ? 14 : 9
    const tint = /^#[\da-f]{6}$/i.test(color) ? `${color}12` : '#fff'
    graph.addNode({
      id: item.id, shape: 'rect', x: origin.x + (item.x || 0) - size.width / 2, y: origin.y + (item.y || 0) - size.height / 2,
      width: size.width, height: size.height, zIndex: 2,
      markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'line', selector: 'underline' }, { tagName: 'text', selector: 'label' }],
      data: { topic: textOf(item.topic), root: rootNode, side: item.side || 'right', color, nodeStyle } satisfies MindNodeData,
      attrs: {
        body: { fill: plain ? 'transparent' : solid ? color : !item.style ? tint : '#fff', stroke: plain ? 'none' : color, strokeWidth: solid ? 0 : 1.5, rx: radius, ry: radius },
        underline: { x1: 0, y1: size.height - 2, x2: size.width, y2: size.height - 2, stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', display: plain ? 'block' : 'none', pointerEvents: 'none' },
        label: { text: textOf(item.topic), fill: solid ? '#fff' : '#344054', fontSize: rootNode ? 23 : depth === 1 ? 17 : 15, fontWeight: rootNode ? 650 : depth === 1 ? 600 : 400, textWrap: { width: -24, height: -14, ellipsis: true } },
      },
    })
  })
  // X6 embedding gives the mind-map real tree semantics: moving a parent moves
  // every descendant while each node still keeps an absolute canvas position.
  visitVisibleMind(root, (item, parent) => { if (parent) (graph.getCellById(parent.id) as Node).addChild(graph.getCellById(item.id) as Node) })
  visitVisibleMind(root, (item, parent) => {
    if (!parent) return
    const side = item.side || 'right'; const color = (graph.getCellById(item.id) as Node).getData<MindNodeData>().color
    const plain = !item.style && parent.id !== root.id
    const parentPlain = !parent.style && parent.id !== root.id && parentById.get(parent.id)?.id !== root.id
    graph.addEdge({ id: `mind-edge-${parent.id}-${item.id}`, source: { cell: parent.id, anchor: { name: side === 'right' ? 'right' : 'left', args: { dy: parentPlain ? nodeSize(parent, root).height / 2 - 2 : 0 } }, connectionPoint: 'anchor' }, target: { cell: item.id, anchor: { name: side === 'right' ? 'left' : 'right', args: { dy: plain ? nodeSize(item, root).height / 2 - 2 : 0 } }, connectionPoint: 'anchor' }, zIndex: 1, connector: { name: 'smooth' }, attrs: { line: { stroke: color, strokeWidth: parent.id === root.id ? 3 : 1.5, strokeLinecap: 'round', targetMarker: null } } })
  })
}

const exportGraphSvg = async (graph: Graph) => {
  graph.cleanSelection(); graph.getNodes().forEach(node => node.removeTools())
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const box = graph.getContentBBox().inflate(34)
  return await new Promise<{ svg: string; size: { width: number; height: number } }>(resolve => graph.toSVG(svg => resolve({ svg, size: { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) } }), { viewBox: box, preserveDimensions: { width: box.width, height: box.height }, copyStyles: true, serializeImages: true }))
}

function MindMapEditor({ data, close, commit }: { data: MindMapData; close(): void; commit(data: MindMapData, svg: string, size: { width: number; height: number }): void }) {
  const { t } = useEditorI18n()
  const canvasRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const topicLabels = { root: t('ui.centralTopic'), child: t('ui.newTopic') }
  const rootRef = useRef(normalizeMind(structuredClone(data.nodeData), true, topicLabels))
  const selectionRef = useRef(rootRef.current.id)
  const [selectedId, setSelectedId] = useState(rootRef.current.id)
  const [quick, setQuick] = useState({ left: 0, top: 0 })
  const [editing, setEditing] = useState<{ id: string; text: string; left: number; top: number; width: number; height: number } | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const history = useRef({ past: [] as MindNode[], future: [] as MindNode[], present: cloneMind(rootRef.current) })
  const [, refresh] = useState(0)
  const [subtreeStyle, setSubtreeStyle] = useState(false)
  const [saving, setSaving] = useState(false)
  const positionQuick = useCallback((graph: Graph, id: string) => {
    const view = graph.findViewByCell(id), shell = canvasRef.current?.getBoundingClientRect()
    if (!view || !shell) return
    const rect = view.container.getBoundingClientRect()
    const side = findMind(rootRef.current, id)?.side
    setQuick({ left: (side === 'left' ? rect.left - 18 : rect.right + 18) - shell.left, top: rect.top + rect.height / 2 - shell.top })
  }, [])
  const select = useCallback((id: string) => {
    const graph = graphRef.current; if (!graph?.getCellById(id)) return
    graph.cleanSelection(); graph.select(id); selectionRef.current = id; setSelectedId(id); positionQuick(graph, id)
  }, [positionQuick])
  const redraw = useCallback((id = selectionRef.current, layout = false) => {
    const graph = graphRef.current; if (!graph) return
    renderMindGraph(graph, rootRef.current, layout)
    select(graph.getCellById(id) ? id : rootRef.current.id)
  }, [select])
  const record = useCallback(() => {
    const stack = history.current, next = cloneMind(rootRef.current)
    if (JSON.stringify(stack.present) === JSON.stringify(next)) return
    stack.past.push(stack.present); if (stack.past.length > 100) stack.past.shift()
    stack.present = next; stack.future = []; refresh(value => value + 1)
  }, [])
  const beginEdit = useCallback((id: string) => {
    const graph = graphRef.current, item = findMind(rootRef.current, id)
    const view = graph?.findViewByCell(id), shell = canvasRef.current?.getBoundingClientRect()
    if (!item || !view || !shell) return
    select(id)
    const rect = view.container.getBoundingClientRect()
    setEditing({ id, text: item.topic, left: rect.left - shell.left, top: rect.top - shell.top, width: Math.max(120, rect.width), height: Math.max(60, rect.height) })
  }, [select])
  useEffect(() => { if (editing) { editRef.current?.focus(); editRef.current?.select() } }, [editing?.id])
  const finishEdit = (cancel = false) => {
    if (!editing) return
    const item = findMind(rootRef.current, editing.id)
    if (!cancel && item) { item.topic = editing.text.trim() || t('ui.newTopic'); redraw(item.id, true); record() }
    setEditing(null); canvasRef.current?.focus()
  }
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const graph = new Graph({ container: canvas, width: canvas.clientWidth, height: canvas.clientHeight, background: { color: '#f8faff' }, grid: { visible: true, size: 18, type: 'dot', args: { color: '#dce5f6', thickness: 1 } }, panning: true, mousewheel: { enabled: true, guard: event => event.ctrlKey || event.metaKey, minScale: .2, maxScale: 3, factor: 1.12 }, interacting: { edgeMovable: false }, async: false })
    // Keep the selection outline visual: X6's default overlay intercepts node
    // double-clicks and bypasses the subtree drag handlers.
    graph.use(new Selection({ enabled: true, multiple: false, rubberband: false, showNodeSelectionBox: true, pointerEvents: 'none' })); graph.use(new Export())
    graphRef.current = graph
    redraw(rootRef.current.id)
    history.current.present = cloneMind(rootRef.current)
    graph.zoomToFit({ padding: 64, maxScale: 1 }); positionQuick(graph, selectionRef.current)
    graph.on('node:click', ({ node }) => select(node.id))
    graph.on('node:dblclick', ({ node }) => beginEdit(node.id))
    let dropTarget: string | null = null
    const clearTarget = () => { if (dropTarget) graph.findViewByCell(dropTarget)?.container.classList.remove('sk-mind-drop-target'); dropTarget = null }
    graph.on('node:moving', ({ node, e }) => {
      clearTarget()
      const item = findMind(rootRef.current, node.id); if (!item || item.id === rootRef.current.id) return
      const point = graph.clientToLocal(e.clientX, e.clientY)
      const target = graph.getNodes().find(candidate => !findMind(item, candidate.id) && candidate.getBBox().containsPoint(point))
      if (target && findParent(rootRef.current, item.id)?.id !== target.id) { dropTarget = target.id; graph.findViewByCell(target)?.container.classList.add('sk-mind-drop-target') }
      positionQuick(graph, node.id)
    })
    graph.on('node:moved', ({ node }) => {
      const item = findMind(rootRef.current, node.id), rootCell = graph.getCellById(rootRef.current.id) as Node
      if (!item) return
      const rootBox = rootCell.getBBox()
      if (item.id === rootRef.current.id) {
        // Moving the root pans the map, rather than snapping it back on redraw.
        const { tx, ty } = graph.translate(), scale = graph.zoom()
        graph.translate(tx + (rootBox.center.x - EDITOR_WIDTH / 2) * scale, ty + (rootBox.center.y - EDITOR_HEIGHT / 2) * scale)
        redraw(node.id); return
      }
      walkMind(rootRef.current, current => { const cell = graph.getCellById(current.id) as Node | null; if (cell) { current.x = cell.getBBox().center.x - rootBox.center.x; current.y = cell.getBBox().center.y - rootBox.center.y } })
      let relayout = false
      if (dropTarget) relayout = reparentMind(rootRef.current, node.id, dropTarget)
      clearTarget()
      if (findParent(rootRef.current, node.id)?.id === rootRef.current.id) {
        const side: Side = (item.x || 0) >= 0 ? 'right' : 'left'
        if (side !== item.side) { setBranchSide(item, side); relayout = true }
      }
      // Rebuild only once the drag is over; embedding moves the whole subtree.
      redraw(node.id, relayout); record()
    })
    graph.on('scale', () => positionQuick(graph, selectionRef.current)); graph.on('translate', () => positionQuick(graph, selectionRef.current))
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1
      const { tx, ty } = graph.translate()
      graph.translate(tx - (event.shiftKey ? event.deltaY : event.deltaX) * factor, ty - (event.shiftKey ? 0 : event.deltaY) * factor)
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    const observer = new ResizeObserver(() => { graph.resize(canvas.clientWidth, canvas.clientHeight); positionQuick(graph, selectionRef.current) })
    observer.observe(canvas)
    return () => { observer.disconnect(); canvas.removeEventListener('wheel', wheel); graph.dispose(); graphRef.current = null }
  }, [beginEdit, positionQuick, record, redraw, select])
  const selected = findMind(rootRef.current, selectedId) || rootRef.current
  const add = (sibling = false) => {
    const parent = sibling ? findParent(rootRef.current, selectedId) || rootRef.current : selected
    const children = parent.children || []
    const right = children.filter(child => child.side !== 'left').length
    const side = sibling && selected !== rootRef.current ? selected.side : parent === rootRef.current ? (right > children.length - right ? 'left' : 'right') : parent.side
    const child = normalizeMind({ id: createId(), topic: t('ui.newTopic'), side })
    const index = sibling ? children.findIndex(item => item.id === selectedId) + 1 : children.length
    parent.children = [...children.slice(0, index), child, ...children.slice(index)]; parent.expanded = true
    redraw(child.id, true); record(); beginEdit(child.id)
  }
  const remove = () => { const parent = findParent(rootRef.current, selectedId); if (!parent) return; parent.children = parent.children?.filter(item => item.id !== selectedId); redraw(parent.id, true); record() }
  const changeStyle = (style: MindMapNodeStyle | undefined) => { if (subtreeStyle) walkMind(selected, node => { node.style = style }); else selected.style = style; redraw(); record() }
  const fold = () => { selected.expanded = selected.expanded === false; redraw(selectedId, true); record() }
  const undo = (redo = false) => {
    const stack = history.current, source = redo ? stack.future : stack.past, target = redo ? stack.past : stack.future
    const value = source.pop(); if (!value) return
    target.push(stack.present); rootRef.current = cloneMind(value); stack.present = cloneMind(value); redraw(); refresh(value => value + 1)
  }
  const paste = (source: MindNode) => {
    const child = cloneMind(source); walkMind(child, node => { node.id = createId(); delete node.x; delete node.y }); setBranchSide(child, selected.side || 'right')
    selected.children = [...(selected.children || []), child]; selected.expanded = true; redraw(child.id, true); record()
  }
  const save = async () => {
    const graph = graphRef.current; if (!graph || saving) return
    setSaving(true)
    try { const result = await exportGraphSvg(graph); commit({ ...data, nodeData: cloneMind(rootRef.current), direction: 2 }, result.svg, result.size) }
    finally { setSaving(false) }
  }
  return <div className="sk-diagram-dialog sk-mind-dialog" onCopy={event => {
    event.stopPropagation(); if (editing) return
    event.preventDefault(); event.clipboardData.setData('application/x-slate-kit-mindmap+json', JSON.stringify(selected)); event.clipboardData.setData('text/plain', selected.topic)
  }} onCut={event => {
    event.stopPropagation(); if (editing) return
    event.preventDefault(); event.clipboardData.setData('application/x-slate-kit-mindmap+json', JSON.stringify(selected)); event.clipboardData.setData('text/plain', selected.topic); remove()
  }} onPaste={event => {
    event.stopPropagation(); if (editing) return
    const raw = event.clipboardData.getData('application/x-slate-kit-mindmap+json')
    const plain = event.clipboardData.getData('text/plain')
    const source = raw ? parseMindClipboard(raw) : plain.trim() ? normalizeMind({ topic: plain.slice(0, 100000) }, false, topicLabels) : null
    if (source) { event.preventDefault(); paste(source) }
  }} onKeyDown={event => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing || (event.target as HTMLElement).closest('textarea,input,select,[contenteditable="true"]')) return
    if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).closest('button')) return
    const modifier = event.metaKey || event.ctrlKey, key = event.key.toLowerCase()
    if (modifier && key === 'z') { event.preventDefault(); undo(event.shiftKey) }
    else if (modifier && key === 'y') { event.preventDefault(); undo(true) }
    else if (event.key === 'Tab') { event.preventDefault(); if (event.shiftKey) select(findParent(rootRef.current, selectedId)?.id || rootRef.current.id); else add() }
    else if (event.key === 'Enter') { event.preventDefault(); add(true) }
    else if (event.key === 'F2') { event.preventDefault(); beginEdit(selectedId) }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
    else if (event.key === 'Home') { event.preventDefault(); select(rootRef.current.id); graphRef.current?.centerCell(graphRef.current.getCellById(rootRef.current.id)) }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      const parent = findParent(rootRef.current, selectedId)
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const siblings = (parent?.children || []).filter(node => node.side === selected.side)
        const index = siblings.findIndex(node => node.id === selectedId) + (event.key === 'ArrowDown' ? 1 : -1)
        if (siblings[index]) select(siblings[index].id)
      } else {
        const outward = event.key === (selected.side === 'left' ? 'ArrowLeft' : 'ArrowRight')
        if (selected === rootRef.current) { const child = selected.children?.find(node => node.side === (event.key === 'ArrowLeft' ? 'left' : 'right')); if (child && selected.expanded !== false) select(child.id) }
        else if (outward && selected.expanded !== false && selected.children?.[0]) select(selected.children[0].id)
        else if (!outward && parent) select(parent.id)
      }
    }
  }}>
    <header><div><b>{t('ui.mindMapEditor')}</b><small>{t('mindmap.shortcuts')}</small></div><div><button className="is-primary" disabled={saving} onClick={save}><Save size={16} />{t('ui.saveAndReturn')}</button><button className="is-icon" aria-label={t('ui.closeMindMapEditor')} onClick={close}><X size={19} /></button></div></header>
    <div className="sk-mind-toolbar">
      <button onClick={() => add(true)} title="Enter"><Plus size={15} />{t('ui.addSibling')}</button><button onClick={() => add()} title="Tab"><CornerDownRight size={15} />{t('ui.addChild')}</button><button onClick={() => beginEdit(selectedId)} title="F2"><Pencil size={15} />{t('ui.editText')}</button>
      <button onClick={fold} disabled={!selected.children?.length}>{t(selected.expanded === false ? 'mindmap.expand' : 'mindmap.collapse')}</button>
      <label className="sk-mind-style-select"><Palette size={15} /><select aria-label={t('ui.nodeStyle')} value={selected.style || ''} onChange={event => changeStyle(event.target.value ? event.target.value as MindMapNodeStyle : undefined)}><option value="">{t('mindmap.autoStyle')}</option><option value="rounded">{t('ui.roundedCard')}</option><option value="pill">{t('ui.pill')}</option><option value="square">{t('ui.squareCard')}</option><option value="solid">{t('ui.solidFill')}</option></select></label>
      <label className="sk-mind-style-select"><input type="checkbox" checked={subtreeStyle} onChange={event => setSubtreeStyle(event.target.checked)} />{t('mindmap.subtreeStyle')}</label>
      <button onClick={() => { redraw(selectedId, true); record() }}>{t('mindmap.layout')}</button>
      <button title={t('ui.zoomIn')} aria-label={t('ui.zoomIn')} onClick={() => graphRef.current?.zoom(.15)}><ZoomIn size={15} /></button><button title={t('ui.zoomOut')} aria-label={t('ui.zoomOut')} onClick={() => graphRef.current?.zoom(-.15)}><ZoomOut size={15} /></button>
      <button onClick={() => graphRef.current?.zoomToFit({ padding: 54, maxScale: 1 })}><Maximize2 size={15} />{t('ui.fitCanvas')}</button>
      <button onClick={() => { select(rootRef.current.id); graphRef.current?.centerCell(graphRef.current.getCellById(rootRef.current.id)) }}>{t('mindmap.root')}</button>
      <button disabled={!history.current.past.length} onClick={() => undo()}><Undo2 size={15} />{t('ui.undo')}</button><button disabled={!history.current.future.length} onClick={() => undo(true)}><Redo2 size={15} />{t('ui.redo')}</button><button className="is-danger" disabled={selected === rootRef.current} onClick={remove}><Trash2 size={15} />{t('ui.deleteNode')}</button>
    </div>
    <div className="sk-mind-editor-shell">
      <div ref={canvasRef} className="sk-mind-x6-canvas" tabIndex={0} onMouseDown={() => canvasRef.current?.focus({ preventScroll: true })} />
      {!editing && <button className="sk-mind-node-add" style={quick} title={t('ui.addChild')} aria-label={t('ui.addChild')} onClick={() => add()}><Plus size={15} /></button>}
      {editing && <textarea ref={editRef} className="sk-mind-text-editor" aria-label={t('ui.editText')} style={{ left: editing.left, top: editing.top, width: editing.width, height: editing.height }} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} onBlur={() => finishEdit()} onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); finishEdit(true) } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finishEdit() } }} />}
    </div>
  </div>
}

export function MindMapBlock({ element }: { element: MindMapElement }) {
  const { t } = useEditorI18n()

  const readOnly = useReadOnly(); const editor = useSlateStatic(); const selected = useSelected(); const focused = useFocused(); const [open, setOpen] = useState(false); const [viewing, setViewing] = useState(false); const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null); const resizeStart = useRef({ x: 0, width: 0 }); const [resizing, setResizing] = useState(false)
  const topicLabels = { root: t('ui.centralTopic'), child: t('ui.newTopic') }
  const data = useMemo(() => ({ ...structuredClone(element.mindData!), nodeData: normalizeMind(structuredClone(element.mindData!.nodeData) as MindNode, true, topicLabels) }), [element.mindData, topicLabels.root, topicLabels.child])
  const [previewSvg, setPreviewSvg] = useState(element.previewVersion === MIND_PREVIEW_VERSION ? element.previewSvg || '' : ''); const [contentSize, setContentSize] = useState({ width: element.contentWidth || 680, height: element.contentHeight || 360 })
  const width = element.width || Math.min(680, contentSize.width); const aspectRatio = contentSize.width / Math.max(1, contentSize.height)
  useEffect(() => {
    if (element.previewSvg && element.previewVersion === MIND_PREVIEW_VERSION) { setPreviewSvg(element.previewSvg); setContentSize({ width: element.contentWidth || 680, height: element.contentHeight || 360 }); return }
    const host = document.createElement('div'); host.style.cssText = `position:fixed;left:-12000px;top:-12000px;width:${EDITOR_WIDTH}px;height:${EDITOR_HEIGHT}px`; document.body.appendChild(host)
    const graph = new Graph({ container: host, width: EDITOR_WIDTH, height: EDITOR_HEIGHT, async: false, background: { color: '#fff' } }); graph.use(new Export())
    const root = normalizeMind(structuredClone(data.nodeData) as MindNode, true, topicLabels); renderMindGraph(graph, root)
    let disposed = false; requestAnimationFrame(() => requestAnimationFrame(async () => { if (disposed) return; const result = await exportGraphSvg(graph); if (!disposed) { setPreviewSvg(result.svg); setContentSize(result.size) } }))
    return () => { disposed = true; graph.dispose(); host.remove() }
  }, [data, element.previewSvg, element.previewVersion, element.contentWidth, element.contentHeight])
  const commit = useCallback((mindData: MindMapData, svg: string, size: { width: number; height: number }) => { Transforms.setNodes(editor, { mindData, previewSvg: svg, previewVersion: MIND_PREVIEW_VERSION, contentWidth: size.width, contentHeight: size.height, aspectRatio: size.width / size.height }, { at: DOMEditor.findPath(editor, element) }); setPreviewSvg(svg); setContentSize(size); setOpen(false) }, [editor, element])
  const resize = (event: PointerEvent<HTMLButtonElement>) => { if (readOnly || !resizing) return; const next = Math.max(260, Math.min(960, resizeStart.current.width + event.clientX - resizeStart.current.x)); Transforms.setNodes(editor, { width: Math.round(next) }, { at: DOMEditor.findPath(editor, element) }) }
  const previewOnClick = useRef(false)
  const selectImage = (event: { preventDefault(): void }) => {
    event.preventDefault()
    previewOnClick.current = readOnly || (selected && focused) || isSelectedElement(editor, element)
    if (readOnly) return
    Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor)
  }
  const previewUrl = previewSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}` : ''
  return <><figure className={`sk-diagram-figure sk-mind-figure ${selected ? 'is-selected' : ''}`} contentEditable={false} style={{ width, aspectRatio, marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} onMouseDown={selectImage}><div className="sk-diagram-preview" role="img" aria-label={t("ui.mindMapPreview")} title={t(readOnly ? 'media.clickToPreview' : 'media.clickToSelectThenPreview')} onClick={event => { if (previewUrl && shouldOpenMediaPreview(readOnly, previewOnClick.current, event)) setViewing(true) }} onContextMenu={event => { if (!previewUrl) return; event.preventDefault(); setDownloadMenu({ x: event.clientX, y: event.clientY }) }}>{previewSvg ? <img src={previewUrl} alt={t("ui.mindMapPreview")} /> : <span className="sk-diagram-loading">{t("ui.generatingMindMapPreview")}</span>}</div><div className="sk-media-corner-actions"><button aria-label={t("ui.previewMindMap")} title={t("ui.preview")} onMouseDown={event => event.stopPropagation()} onClick={() => previewUrl && setViewing(true)}><Maximize2 size={15} /></button><button hidden={readOnly} aria-label={t("ui.editMindMap")} title={t("ui.editMindMap")} onMouseDown={event => event.stopPropagation()} onClick={() => { if (readOnly) return; Transforms.deselect(editor); setOpen(true) }}><Pencil size={15} /></button></div><button hidden={readOnly} className="sk-diagram-resizer" aria-label={t("ui.resizeMindMapProportionally")} onClick={event => event.stopPropagation()} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; setResizing(true) }} onPointerMove={resize} onPointerUp={() => setResizing(false)} /></figure>{downloadMenu && previewUrl && <MediaDownloadMenu src={previewUrl} downloadName={t("mindmap.downloadFilename")} position={downloadMenu} close={() => setDownloadMenu(null)} />}{viewing && previewUrl && <MediaLightbox src={previewUrl} alt={t("ui.mindMap")} downloadName={t("mindmap.downloadFilename")} close={() => setViewing(false)} />}{!readOnly && open && typeof document !== 'undefined' && createPortal(<div className="sk-diagram-modal" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }} contentEditable={false} onMouseDown={event => event.stopPropagation()}><MindMapEditor data={data} close={() => setOpen(false)} commit={commit} /></div>, document.body)}</>
}
