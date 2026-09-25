import { useEditorI18n, translate, zhCN } from '../i18n'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Transforms } from 'slate'
import { isSelectedElement, shouldOpenMediaPreview } from '../media'
import { DOMEditor } from 'slate-dom'
import { useFocused, useSelected, useSlateStatic, useReadOnly } from 'slate-react'
import { Graph, Shape, Cell, type Edge, type EdgeView, type Node } from '@antv/x6'
import { Clipboard } from '@antv/x6-plugin-clipboard'
import { History } from '@antv/x6-plugin-history'
import { Keyboard } from '@antv/x6-plugin-keyboard'
import { MiniMap } from '@antv/x6-plugin-minimap'
import { Selection } from '@antv/x6-plugin-selection'
import { Snapline } from '@antv/x6-plugin-snapline'
import { Transform } from '@antv/x6-plugin-transform'
import { Export } from '@antv/x6-plugin-export'
import { Activity, AlignHorizontalDistributeCenter, ArrowRight, Box, BringToFront, Circle, CircleDot, Clock3, Copy, Database, Diamond, FileInput, Files, FileText, GitBranch, Grid3X3, HardDrive, Hexagon, Layers3, Maximize2, Merge, Minus, Monitor, MousePointer2, Network, NotebookPen, Octagon, Package, Pencil, Redo2, Rows3, Save, SendToBack, Square, StickyNote, Trash2, Type, Undo2, UserRound, Waves, X } from 'lucide-react'
import '@antv/x6/dist/index.css'
import '@antv/x6-plugin-minimap/dist/index.css'
import '@antv/x6-plugin-selection/dist/index.css'
import '@antv/x6-plugin-snapline/dist/index.css'
import '@antv/x6-plugin-transform/dist/index.css'
import { createId } from '../data'
import { diagramPaths } from '../diagramShapes'
import type { DiagramEdge, DiagramEdgeType, DiagramLineStyle, DiagramNode, DiagramNodeType, FlowchartElement } from '../types'
import { MediaDownloadMenu, MediaLightbox } from './MediaLightbox'

type NodeData = { diagramShape: DiagramNodeType; label: string; details?: string; color: string; fillColor: string; textColor: string; lineStyle: DiagramLineStyle; borderWidth: number; fontSize: number; opacity: number }
type EdgeData = { lineType: DiagramEdgeType; lineStyle: DiagramLineStyle; arrow: 'none' | 'end' | 'both'; color: string; thickness: number; fontSize: number; opacity: number; label?: string }
const FLOW_PREVIEW_VERSION = 6
const SHAPES: Array<{ group: "ui.flowchart" | 'UML' | "ui.general"; type: DiagramNodeType; label: string; hint: string; icon: typeof Square }> = [
  { group: "ui.flowchart", type: 'process', label: "ui.process", hint: "ui.processStep", icon: Square }, { group: "ui.flowchart", type: 'decision', label: "ui.decision", hint: "ui.conditionsAndBranches", icon: Diamond },
  { group: "ui.flowchart", type: 'terminator', label: "ui.startEnd", hint: "ui.startOrEndOfAProcess", icon: CircleDot }, { group: "ui.flowchart", type: 'subprocess', label: "ui.subprocess", hint: "ui.reusableProcess", icon: Layers3 },
  { group: "ui.flowchart", type: 'database', label: "ui.database", hint: "ui.dataStorage", icon: Database }, { group: "ui.flowchart", type: 'document', label: "diagram.document", hint: "ui.documentOrOutput", icon: FileText },
  { group: "ui.flowchart", type: 'multiple-documents', label: "ui.documents", hint: "ui.multipleDocumentsOrOutputs", icon: Files },
  { group: "ui.flowchart", type: 'data', label: "ui.data", hint: "ui.inputOrOutput", icon: GitBranch }, { group: "ui.flowchart", type: 'manual-input', label: "ui.manualInput", hint: "ui.manualInputStep", icon: FileInput },
  { group: "ui.flowchart", type: 'preparation', label: "ui.preparation", hint: "ui.preparationOrInitialization", icon: Hexagon }, { group: "ui.flowchart", type: 'delay', label: "ui.delay", hint: "ui.waitOrDelay", icon: Clock3 },
  { group: "ui.flowchart", type: 'display', label: "ui.display", hint: "ui.screenOutput", icon: Monitor }, { group: "ui.flowchart", type: 'storage', label: "ui.storage", hint: "ui.internalStorage", icon: HardDrive },
  { group: "ui.flowchart", type: 'connector', label: "ui.connector", hint: "ui.onPageConnector", icon: Circle }, { group: "ui.flowchart", type: 'off-page-connector', label: "ui.offPageConnector", hint: "ui.offPageProcessConnection", icon: Octagon },
  { group: "ui.flowchart", type: 'merge', label: "ui.merge", hint: "ui.mergeProcesses", icon: Merge }, { group: "ui.flowchart", type: 'card', label: "ui.card", hint: "ui.cardOrPunchCard", icon: StickyNote },
  { group: "ui.flowchart", type: 'paper-tape', label: "ui.paperTape", hint: "ui.continuousInputOrOutput", icon: Waves }, { group: 'UML', type: 'actor', label: "ui.actor", hint: 'UML Actor', icon: UserRound },
  { group: 'UML', type: 'use-case', label: "ui.useCase", hint: 'UML Use Case', icon: CircleDot }, { group: 'UML', type: 'class', label: "ui.class", hint: "ui.propertiesAndMethods", icon: Box },
  { group: 'UML', type: 'object', label: "ui.object", hint: "ui.umlObjectInstance", icon: Square },
  { group: 'UML', type: 'interface', label: "ui.interface", hint: 'Interface', icon: Network }, { group: 'UML', type: 'component', label: "ui.component", hint: 'UML Component', icon: Layers3 },
  { group: 'UML', type: 'package', label: "ui.package", hint: 'UML Package', icon: Package }, { group: 'UML', type: 'state', label: "ui.state", hint: "ui.stateMachineNode", icon: CircleDot },
  { group: 'UML', type: 'activity', label: "ui.activity", hint: "ui.activityNode", icon: Activity }, { group: 'UML', type: 'lifeline', label: "ui.lifeline", hint: "ui.sequenceDiagramLifeline", icon: Rows3 },
  { group: 'UML', type: 'boundary', label: "ui.boundary", hint: "ui.boundaryObject", icon: Circle }, { group: 'UML', type: 'control', label: "ui.control", hint: "ui.controlObject", icon: CircleDot },
  { group: 'UML', type: 'entity', label: "ui.entity", hint: "ui.entityObject", icon: Database },
  { group: "ui.general", type: 'group', label: "ui.group", hint: "ui.containerOrGroup", icon: Box }, { group: "ui.general", type: 'note', label: "ui.note", hint: "ui.additionalInformation", icon: NotebookPen },
  { group: "ui.general", type: 'text', label: "ui.freeText", hint: "ui.borderlessText", icon: Type },
]
const ellipse = new Set<DiagramNodeType>(['terminator', 'use-case', 'state', 'activity', 'boundary', 'control', 'entity', 'connector', 'mind-topic'])
const polygons: Partial<Record<DiagramNodeType, string>> = { decision: '0,10 10,0 20,10 10,20', data: '5,0 20,0 15,10 0,10', 'manual-input': '3,3 20,0 20,10 0,10', preparation: '4,0 16,0 20,10 16,20 4,20 0,10', display: '4,0 17,0 20,10 17,20 4,20 0,10', storage: '3,0 20,0 17,10 0,10', 'off-page-connector': '0,0 20,0 20,14 10,20 0,14', merge: '0,0 20,10 0,20', card: '0,4 4,0 20,0 20,20 0,20' }
const portSides = ['top', 'right', 'bottom', 'left'] as const
const ports = {
  groups: Object.fromEntries(portSides.map(position => [position, { position, attrs: { circle: { r: 4, magnet: true, stroke: '#3370ff', strokeWidth: 1.5, fill: '#fff' } } }])),
  items: portSides.flatMap(group => [1, 2, 3].map(index => ({ id: `${group}-${index}`, group }))),
}
const shapeName = (type: DiagramNodeType) => diagramPaths[type] ? 'path' : polygons[type] ? 'polygon' : ellipse.has(type) ? 'ellipse' : 'rect'
const defaultDetails = (type: DiagramNodeType, t: (key: string) => string) => type === 'class' ? t('diagram.classExample') : type === 'interface' ? '«interface»\n+ operation()' : undefined
const nodePrefix: Partial<Record<DiagramNodeType, string>> = { interface: '«interface»\n' }
const STYLE_PRESETS = [
  { name: "ui.blue", color: '#5b73e8', fillColor: '#f4f6ff', textColor: '#25314d' }, { name: "ui.green", color: '#28a47a', fillColor: '#effaf6', textColor: '#195c48' },
  { name: "ui.orange", color: '#d58a29', fillColor: '#fff8ec', textColor: '#734611' }, { name: "ui.purple", color: '#9b6bd6', fillColor: '#faf5ff', textColor: '#553275' },
  { name: "ui.gray", color: '#64748b', fillColor: '#f8fafc', textColor: '#334155' }, { name: "ui.dark", color: '#334155', fillColor: '#334155', textColor: '#ffffff' },
]
const dashArray = (style: DiagramLineStyle) => style === 'dashed' ? '8 5' : style === 'dotted' ? '2 5' : ''
const displayText = (data: NodeData) => `${nodePrefix[data.diagramShape] || ''}${data.label}${data.details ? `\n────────\n${data.details}` : ''}`
const nodeAttrs = (data: NodeData) => ({ body: { fill: data.diagramShape === 'text' ? 'transparent' : data.fillColor, stroke: data.diagramShape === 'text' ? 'transparent' : data.color, strokeWidth: data.borderWidth, strokeDasharray: dashArray(data.diagramShape === 'interface' && data.lineStyle === 'solid' ? 'dashed' : data.lineStyle), opacity: data.opacity, rx: data.diagramShape === 'class' || data.diagramShape === 'interface' ? 3 : data.diagramShape === 'group' ? 2 : 10, ry: data.diagramShape === 'class' || data.diagramShape === 'interface' ? 3 : data.diagramShape === 'group' ? 2 : 10, ...(diagramPaths[data.diagramShape] ? { refD: diagramPaths[data.diagramShape] } : {}), refPoints: polygons[data.diagramShape] }, label: { text: displayText(data), fill: data.textColor, opacity: data.opacity, fontSize: data.fontSize, fontWeight: 500, lineHeight: data.fontSize * 1.35, textWrap: { width: -18, height: -12, ellipsis: false } } })
const setNodeText = (cell: Cell, value: string | null) => { const data = cell.getData<NodeData>(); const next = { ...data, label: value || '', details: undefined }; cell.setData(next); cell.attr(nodeAttrs(next)); if (cell.isNode() && data.diagramShape === 'text') { const lines = Math.max(1, (value || '').split('\n').length); const size = cell.size(); cell.resize(size.width, Math.max(size.height, 42, Math.ceil(lines * next.fontSize * 1.45 + 18))) } }
export function makeNode(type: DiagramNodeType, x: number, y: number, source?: Partial<DiagramNode>, t: (key: string) => string = key => translate(zhCN, key)) {
  const meta = SHAPES.find(item => item.type === type) || { label: "ui.node" }; const data: NodeData = { diagramShape: type, label: source?.label ?? t(meta.label), details: source?.details ?? defaultDetails(type, t), color: source?.color || '#000000', fillColor: source?.fillColor || '#ffffff', textColor: source?.textColor || '#25314d', lineStyle: source?.lineStyle || 'solid', borderWidth: source?.borderWidth ?? 1, fontSize: source?.fontSize || 13, opacity: source?.opacity ?? 1 }
  return { id: source?.id || createId(), shape: shapeName(type), x, y, width: source?.width || (type === 'class' ? 180 : type === 'group' ? 260 : type === 'text' ? 150 : 132), height: source?.height || (type === 'class' ? 96 : type === 'actor' ? 82 : type === 'group' ? 160 : 52), attrs: nodeAttrs(data), ports: (type === 'text') ? undefined : ports, data, zIndex: source?.zIndex ?? (type === 'group' ? -1 : 1) }
}
const edgeAttrs = (data: EdgeData) => ({ wrap: { stroke: 'transparent', strokeWidth: Math.max(22, data.thickness + 16), cursor: 'move' }, line: { stroke: data.color, opacity: data.opacity, strokeWidth: data.thickness, strokeDasharray: dashArray(data.lineStyle), strokeLinecap: 'round', strokeLinejoin: 'round', sourceMarker: data.arrow === 'both' ? { name: 'classic', width: 9, height: 7 } : null, targetMarker: data.arrow === 'none' ? null : { name: 'classic', width: 9, height: 7 } } })
const applyEdgeAttrs = (edge: Edge, data: EdgeData) => {
  // X6 merges attrs by default, so a previously rendered marker must be
  // removed explicitly before applying the next arrow preset.
  edge.removeAttrByPath('line/sourceMarker')
  edge.removeAttrByPath('line/targetMarker')
  edge.attr(edgeAttrs(data))
}
const applyEdgeGeometry = (edge: Edge, data: EdgeData, resetVertices = false) => {
  const routed = data.lineType === 'step' || data.lineType === 'smoothstep'
  // A straight edge is defined by its two endpoints only. Persisted vertices
  // from an earlier routed style would otherwise turn it back into a polyline
  // when the editor is reopened.
  if (resetVertices || data.lineType === 'straight') edge.setVertices([])
  edge.setRouter(routed ? { name: 'manhattan', args: { padding: 18, step: 12 } } : { name: 'normal' })
  edge.setConnector({ name: data.lineType === 'bezier' ? 'smooth' : data.lineType === 'smoothstep' ? 'rounded' : 'normal', args: data.lineType === 'smoothstep' ? { radius: 12 } : undefined })
}
const edgeToolNames = (lineType: DiagramEdgeType) => [...(lineType === 'straight' ? [] : [{ name: 'vertices', args: { addable: false, attrs: { r: 5, fill: '#25b5ed', stroke: '#fff', strokeWidth: 2 } } }, ...(lineType === 'bezier' ? [] : [{ name: 'segments', args: { threshold: 16, attrs: { width: 10, height: 10, rx: 5, ry: 5, fill: '#25b5ed', stroke: '#fff', strokeWidth: 2 } } }])]), ...['source-arrowhead', 'target-arrowhead'].map(name => ({ name, args: { attrs: { d: 'M -6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0', fill: '#25b5ed', stroke: '#fff', strokeWidth: 2 } } }))]
const removeCellsPreservingEdges = (graph: Graph, ids: string[]) => {
  ids.forEach(id => {
    const cell = graph.getCellById(id)
    if (!cell) return
    if (cell.isNode()) {
      graph.getConnectedEdges(cell).forEach(edge => {
        const edgeView = graph.findViewByCell(edge) as EdgeView | null
        const sourcePoint = edgeView?.sourcePoint || edge.getSourcePoint(); const targetPoint = edgeView?.targetPoint || edge.getTargetPoint()
        const detachSource = edge.getSourceCellId() === cell.id; const detachTarget = edge.getTargetCellId() === cell.id
        if (detachSource) edge.setSource({ x: sourcePoint.x, y: sourcePoint.y })
        if (detachTarget) edge.setTarget({ x: targetPoint.x, y: targetPoint.y })
      })
    }
    graph.removeCell(cell)
  })
}
const edgeLabels = (data: Pick<EdgeData, 'label' | 'fontSize' | 'opacity'>) => data.label ? [{ attrs: { label: { text: data.label, fill: '#4e5969', opacity: data.opacity, fontSize: data.fontSize, fontWeight: 500 }, body: { fill: '#fff', fillOpacity: data.opacity, stroke: '#dfe3e8', strokeWidth: 1, rx: 5, ry: 5, refWidth: '140%', refHeight: '170%', refX: '-20%', refY: '-35%' } } }] : []
const fitGraphToCanvas = (graph: Graph, container: HTMLElement | null) => {
  if (!container) return
  const bounds = graph.getCellsBBox(graph.getCells())
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
  const padding = 56
  const availableWidth = Math.max(1, container.clientWidth - padding * 2)
  const availableHeight = Math.max(1, container.clientHeight - padding * 2)
  const scale = Math.max(.16, Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height))
  graph.scale(scale, scale)
  const center = bounds.getCenter()
  graph.centerPoint(center.x, center.y)
}
const withoutEditorControls = (svg: string, validEdgeIds?: readonly string[]) => {
  if (!svg || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return svg
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
  document.querySelectorAll('.x6-port, .x6-widget-transform, .x6-widget-selection-box, .x6-edge-tool, .x6-node-tool, .x6-cell-tool-editor').forEach(element => element.remove())
  const valid = validEdgeIds ? new Set(validEdgeIds) : null
  document.querySelectorAll<SVGGElement>('.x6-edge').forEach(group => {
    const id = group.getAttribute('data-cell-id')
    // Connecting previews and other transient X6 edges are not graph cells.
    if (!id || (valid && !valid.has(id))) { group.remove(); return }
    const directPaths = Array.from(group.children).filter((child): child is SVGPathElement => child.tagName.toLowerCase() === 'path')
    const visiblePaths = directPaths.filter(path => path.getAttribute('stroke') !== 'transparent' && path.getAttribute('data-selector') !== 'wrap')
    // A real X6 edge has one display path. Keep the final display path only, so
    // even a stale route left in the view cannot leak into the document image.
    const displayPath = visiblePaths.at(-1)
    directPaths.forEach(path => { if (path !== displayPath) path.remove() })
  })
  return new XMLSerializer().serializeToString(document.documentElement)
}
function makeEdge(edge: Partial<DiagramEdge> & { source: string; target: string }, defaults?: Partial<EdgeData>) {
  const data: EdgeData = { lineType: edge.lineType || defaults?.lineType || 'smoothstep', lineStyle: edge.lineStyle || defaults?.lineStyle || 'solid', arrow: edge.arrow || defaults?.arrow || 'end', color: edge.color || defaults?.color || '#64748b', thickness: edge.thickness || defaults?.thickness || 2, fontSize: edge.fontSize || defaults?.fontSize || 12, opacity: edge.opacity ?? defaults?.opacity ?? 1, label: edge.label }
  const routed = data.lineType === 'step' || data.lineType === 'smoothstep'
  const source = edge.source ? { cell: edge.source, ...(edge.sourcePort ? { port: edge.sourcePort } : {}) } : edge.sourcePoint
  const target = edge.target ? { cell: edge.target, ...(edge.targetPort ? { port: edge.targetPort } : {}) } : edge.targetPoint
  return { id: edge.id || createId(), shape: 'edge', source, target, vertices: data.lineType === 'straight' ? [] : edge.vertices, router: routed ? { name: 'manhattan', args: { padding: 18, step: 12 } } : { name: 'normal' }, connector: { name: data.lineType === 'bezier' ? 'smooth' : data.lineType === 'smoothstep' ? 'rounded' : 'normal', args: data.lineType === 'smoothstep' ? { radius: 12 } : undefined }, attrs: edgeAttrs(data), labels: edgeLabels(data), data, zIndex: edge.zIndex ?? 0 }
}

function X6Editor({ element, close, commit }: { element: FlowchartElement; close(): void; commit(nodes: DiagramNode[], edges: DiagramEdge[], previewSvg: string, size: { width: number; height: number }): void }) {
  const { t } = useEditorI18n()

  const canvasRef = useRef<HTMLDivElement>(null); const minimapRef = useRef<HTMLDivElement>(null); const graphRef = useRef<Graph | null>(null)
  const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null); const [query, setQuery] = useState(''); const [snap, setSnap] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [edgeTextEditor, setEdgeTextEditor] = useState<{ id: string; x: number; y: number; value: string } | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [edgeDefaults, setEdgeDefaults] = useState<EdgeData>({ lineType: 'smoothstep', lineStyle: 'solid', arrow: 'end', color: '#64748b', thickness: 2, fontSize: 12, opacity: 1 })
  useEffect(() => {
    if (!canvasRef.current || !minimapRef.current) return
    const graph = new Graph({ container: canvasRef.current, autoResize: true, async: true, magnetThreshold: 2, background: { color: '#fff' }, grid: { visible: true, type: 'dot', size: 16, args: { color: '#d9e2f2', thickness: 1 } }, mousewheel: { enabled: true, zoomAtMousePosition: true, modifiers: ['ctrl', 'meta'], minScale: .2, maxScale: 3 }, panning: { enabled: true, eventTypes: ['mouseWheel'] }, connecting: { snap: { radius: 14 }, allowBlank: true, allowLoop: false, allowEdge: false, highlight: true, router: { name: 'manhattan', args: { padding: 18 } }, connector: { name: 'rounded', args: { radius: 12 } }, createEdge: () => new Shape.Edge(makeEdge({ source: '', target: '' }, edgeDefaults)) } })
    graph.use(new Selection({ enabled: true, multiple: true, rubberband: true, rubberEdge: true, strict: false, movable: true, modifiers: null, multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], showNodeSelectionBox: false })); graph.use(new Transform({ resizing: { enabled: true, minWidth: 72, minHeight: 38, orthogonal: false }, rotating: false })); graph.use(new Snapline({ enabled: true, sharp: true })); graph.use(new History({ enabled: true })); graph.use(new Clipboard({ enabled: true })); graph.use(new Keyboard({ enabled: true, global: true, guard: event => { const target = event.target as HTMLElement | null; const editable = target?.closest('input, textarea, select, [contenteditable="true"]'); return !editable?.closest('.sk-diagram-dialog') } })); graph.use(new MiniMap({ container: minimapRef.current, width: 168, height: 106, padding: 8 })); graph.use(new Export())
    graph.on('scale', ({ sx }) => setZoomPercent(Math.round(sx * 100)))
    graph.fromJSON({ nodes: element.nodes.map(node => makeNode(node.shape || 'process', node.x, node.y, node)), edges: element.edges.map(edge => makeEdge(edge)) }); requestAnimationFrame(() => fitGraphToCanvas(graph, canvasRef.current))
    const nodeEditor = { name: 'node-editor', args: { attrs: { fontSize: 13, fontFamily: 'inherit', color: '#1f2329', backgroundColor: '#fff' }, getText: ({ cell }: { cell: Cell }) => [cell.getData<NodeData>().label, cell.getData<NodeData>().details].filter(Boolean).join('\n'), setText: ({ cell, value }: { cell: Cell; value: string | null }) => { setNodeText(cell, value); setRevision(current => current + 1) } } }
    graph.getNodes().forEach(node => node.addTools(nodeEditor))
    graph.on('node:added', ({ node }) => {
      node.addTools(nodeEditor)
    })
    const showEdgeTools = (edge: Edge) => {
      if (edge.hasTools()) return
      graph.getEdges().forEach(item => item.removeTools())
      const lineType = edge.getData<EdgeData>()?.lineType || 'smoothstep'
      edge.addTools(edgeToolNames(lineType))
    }
    const selectEdge = (edge: Edge, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => { if (event.shiftKey || event.ctrlKey || event.metaKey) graph.select(edge); else if (!graph.isSelected(edge)) graph.resetSelection(edge); showEdgeTools(edge); setSelected({ kind: 'edge', id: edge.id }); setRevision(value => value + 1) }
    graph.on('node:click', ({ node }) => { graph.getEdges().forEach(item => item.removeTools()); setContextMenu(null); setEdgeTextEditor(null); setSelected({ kind: 'node', id: node.id }) }); graph.on('node:dblclick', ({ node }) => setSelected({ kind: 'node', id: node.id })); graph.on('edge:click', ({ edge, e }) => { setContextMenu(null); selectEdge(edge, e) }); graph.on('edge:dblclick', ({ edge, e }) => { e.stopPropagation(); selectEdge(edge, e); const data = edge.getData<EdgeData>(); setEdgeTextEditor({ id: edge.id, x: e.clientX, y: e.clientY, value: data?.label || '' }) }); graph.on('blank:click', () => { graph.getEdges().forEach(item => item.removeTools()); setContextMenu(null); setEdgeTextEditor(null); setSelected(null) }); graph.on('selection:changed', ({ selected: cells }) => { setRevision(value => value + 1); if (cells.length === 1) { if (cells[0].isEdge()) showEdgeTools(cells[0] as Edge); setSelected({ kind: cells[0].isNode() ? 'node' : 'edge', id: cells[0].id }) } else setSelected(null) }); graph.on('cell:removed', ({ cell }) => setSelected(value => value?.id === cell.id ? null : value)); graph.on('cell:contextmenu', ({ cell, e }) => { e.preventDefault(); setEdgeTextEditor(null); if (!graph.isSelected(cell)) graph.resetSelection(cell); setSelected({ kind: cell.isNode() ? 'node' : 'edge', id: cell.id }); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 154), y: Math.min(e.clientY, window.innerHeight - 148) }); setRevision(value => value + 1) })
    const deleteSelected = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editable = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (editable?.closest('.sk-diagram-dialog')) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && ['a', 'c', 'v', 'x', 'z', 'y', 'd'].includes(key)) {
        event.preventDefault(); event.stopPropagation()
        if (key === 'a') graph.resetSelection(graph.getCells())
        if (key === 'c' || key === 'x' || key === 'd') graph.copy(graph.getSelectedCells())
        if (key === 'x') graph.batchUpdate('cut', () => removeCellsPreservingEdges(graph, graph.getSelectedCells().map(cell => cell.id)))
        if (key === 'v' || key === 'd') graph.resetSelection(graph.paste({ offset: 28 }))
        if (key === 'z') { if (event.shiftKey) graph.redo(); else graph.undo() }
        if (key === 'y') graph.redo()
        setRevision(value => value + 1)
        return
      }
      if (event.key === 'Escape') { graph.cleanSelection(); setEdgeTextEditor(null); setSelected(null); return }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      const ids = [...graph.getSelectedCells()].map(item => item.id)
      if (!ids.length) return
      event.preventDefault()
      event.stopPropagation()
      graph.cleanSelection()
      graph.batchUpdate('delete-selection', () => removeCellsPreservingEdges(graph, ids))
      setSelected(null); setContextMenu(null); setRevision(value => value + 1)
    }
    document.addEventListener('keydown', deleteSelected, true)
    const clipboardEvent = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')?.closest('.sk-diagram-dialog')) return
      if (!event.clipboardData) return
      const mime = 'application/x-slate-kit-diagram'
      if (event.type === 'paste') {
        const raw = event.clipboardData.getData(mime)
        if (!raw) return
        try {
          const json = JSON.parse(raw)
          if (!Array.isArray(json) || json.length > 5000) return
          const cells = json.map(item => {
            if (item.shape === 'edge') return graph.createEdge(makeEdge({ ...item.data, id: item.id, source: item.source?.cell || '', target: item.target?.cell || '', sourcePort: item.source?.port, targetPort: item.target?.port, sourcePoint: item.source, targetPoint: item.target, vertices: item.vertices }))
            if (!SHAPES.some(shape => shape.type === item.data?.diagramShape)) throw new Error('Unsupported shape')
            return graph.createNode(makeNode(item.data.diagramShape, item.position?.x || 0, item.position?.y || 0, { ...item.data, id: item.id, width: item.size?.width, height: item.size?.height }, t))
          })
          const copies = Object.values(Cell.cloneCells(cells))
          copies.forEach(cell => { cell.removeTools(); cell.translate(28, 28) })
          graph.batchUpdate('paste', () => graph.addCell(copies))
          graph.resetSelection(copies)
        } catch { return }
      } else {
        const selected = graph.getSelectedCells()
        if (!selected.length) return
        event.clipboardData.setData(mime, JSON.stringify(selected.map(cell => { const json = cell.toJSON(); delete json.tools; return json })))
        event.clipboardData.setData('text/plain', selected.map(cell => cell.getData()?.label || '').join('\n'))
        graph.copy(selected)
        if (event.type === 'cut') graph.batchUpdate('cut', () => removeCellsPreservingEdges(graph, selected.map(cell => cell.id)))
      }
      event.preventDefault(); event.stopPropagation(); setRevision(value => value + 1)
    }
    for (const type of ['copy', 'cut', 'paste']) document.addEventListener(type, clipboardEvent as EventListener, true)
    graphRef.current = graph; setRevision(value => value + 1)
    return () => { document.removeEventListener('keydown', deleteSelected, true); for (const type of ['copy', 'cut', 'paste']) document.removeEventListener(type, clipboardEvent as EventListener, true); graph.dispose(); graphRef.current = null }
  }, [])
  useEffect(() => { const plugin = graphRef.current?.getPlugin<Snapline>('snapline'); if (snap) plugin?.enable(); else plugin?.disable() }, [revision, snap])
  const graph = graphRef.current; const selectedCount = graph?.getSelectedCells().length || 0; const cell = selected ? graph?.getCellById(selected.id) : null; const node = cell?.isNode() ? cell as Node : null; const edge = cell?.isEdge() ? cell as Edge : null; const nodeData = node?.getData<NodeData>(); const edgeData = edge?.getData<EdgeData>()
  const refresh = () => setRevision(value => value + 1)
  const addShape = (type: DiagramNodeType, position?: { x: number; y: number }) => { const current = graphRef.current; if (!current) return; const point = position || { x: 140 + current.getNodes().length % 4 * 42, y: 80 + current.getNodes().length % 5 * 48 }; const added = current.addNode(makeNode(type, point.x, point.y, undefined, t)); current.resetSelection(added); setSelected({ kind: 'node', id: added.id }); refresh() }
  const addIndependentEdge = (position?: { x: number; y: number }) => { const current = graphRef.current; const container = canvasRef.current; if (!current || !container) return; const rect = container.getBoundingClientRect(); const center = position || current.clientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2); const added = current.addEdge(makeEdge({ source: '', target: '', sourcePoint: { x: center.x - 90, y: center.y }, targetPoint: { x: center.x + 90, y: center.y } }, edgeDefaults)); current.getEdges().forEach(item => item.removeTools()); added.addTools(['vertices', 'segments', 'source-arrowhead', 'target-arrowhead']); current.resetSelection(added); setSelected({ kind: 'edge', id: added.id }); refresh() }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); const current = graphRef.current; if (!current) return; const point = current.clientToLocal(event.clientX, event.clientY); if (event.dataTransfer.getData('application/slate-kit-x6-edge')) { addIndependentEdge(point); return } const type = event.dataTransfer.getData('application/slate-kit-x6') as DiagramNodeType; if (SHAPES.some(item => item.type === type)) addShape(type, point) }
  const remove = () => { const current = graphRef.current; if (!current) return; const ids = [...current.getSelectedCells()].map(item => item.id); current.cleanSelection(); removeCellsPreservingEdges(current, ids); setSelected(null); setContextMenu(null); refresh() }
  const duplicate = () => { const current = graphRef.current; if (!current) return; current.copy(current.getSelectedCells()); current.resetSelection(current.paste({ offset: 28 })); refresh() }
  const updateNodes = (patch: Partial<NodeData>) => { const current = graphRef.current; if (!current) return; current.getSelectedCells().filter(item => item.isNode()).forEach(item => { const data = { ...(item.getData<NodeData>() || {}), ...patch }; item.setData(data); item.attr(nodeAttrs(data)) }); refresh() }
  const updateEdges = (patch: Partial<EdgeData>) => { const current = graphRef.current; if (!current) return; current.getSelectedCells().filter(item => item.isEdge()).forEach(item => { const itemEdge = item as Edge; const data = { ...(item.getData<EdgeData>() || edgeDefaults), ...patch }; const hadTools = itemEdge.hasTools(); item.setData(data); applyEdgeAttrs(itemEdge, data); itemEdge.setLabels(edgeLabels(data)); applyEdgeGeometry(itemEdge, data, patch.lineType !== undefined); if (hadTools) { itemEdge.removeTools(); itemEdge.addTools(edgeToolNames(data.lineType)) } }); refresh() }
  const updateNode = (patch: Partial<NodeData>) => updateNodes(patch)
  const updateEdge = (patch: Partial<EdgeData>) => updateEdges(patch)
  const updateCommon = (patch: { color?: string; lineStyle?: DiagramLineStyle; thickness?: number; fontSize?: number; opacity?: number }) => { const nodePatch: Partial<NodeData> = {}; if (patch.color !== undefined) nodePatch.color = patch.color; if (patch.lineStyle !== undefined) nodePatch.lineStyle = patch.lineStyle; if (patch.thickness !== undefined) nodePatch.borderWidth = patch.thickness; if (patch.fontSize !== undefined) nodePatch.fontSize = patch.fontSize; if (patch.opacity !== undefined) nodePatch.opacity = patch.opacity; updateNodes(nodePatch); updateEdges(patch) }
  const moveLayer = (action: 'front' | 'forward' | 'backward' | 'back') => { const cells = graphRef.current?.getSelectedCells() || []; cells.forEach(item => { if (action === 'front') item.toFront(); else if (action === 'back') item.toBack(); else item.setZIndex((item.getZIndex() || 0) + (action === 'forward' ? 1 : -1)) }); setContextMenu(null); refresh() }
  const commitEdgeText = () => { if (!edgeTextEditor) return; const item = graphRef.current?.getCellById(edgeTextEditor.id); if (item?.isEdge()) { const data = { ...item.getData<EdgeData>(), label: edgeTextEditor.value || undefined }; item.setData(data); item.setLabels(edgeLabels(data)) } setEdgeTextEditor(null); refresh() }
  const autoLayout = () => {
    const current = graphRef.current; if (!current) return
    const nodes = current.getNodes()
    const nodeIds = new Set(nodes.map(item => item.id)); const incoming = new Map<string, string[]>(); const outgoing = new Map<string, string[]>()
    nodes.forEach(item => { incoming.set(item.id, []); outgoing.set(item.id, []) })
    current.getEdges().forEach(item => { const source = item.getSourceCellId(); const target = item.getTargetCellId(); if (!nodeIds.has(source) || !nodeIds.has(target)) return; outgoing.get(source)?.push(target); incoming.get(target)?.push(source) })
    const roots = nodes.filter(item => (incoming.get(item.id)?.length || 0) === 0); const queue = [...(roots.length ? roots : nodes.slice(0, 1))]; const depths = new Map<string, number>(queue.map(item => [item.id, 0])); let cursor = 0
    while (cursor < queue.length) { const source = queue[cursor++]; const nextDepth = (depths.get(source.id) || 0) + 1; (outgoing.get(source.id) || []).forEach(targetId => { if (depths.has(targetId)) return; depths.set(targetId, nextDepth); const target = current.getCellById(targetId); if (target?.isNode()) queue.push(target) }) }
    let disconnectedDepth = Math.max(0, ...depths.values()) + 1; nodes.forEach(item => { if (!depths.has(item.id)) depths.set(item.id, disconnectedDepth++) })
    const layers = new Map<number, Node[]>(); nodes.forEach(item => { const depth = depths.get(item.id) || 0; layers.set(depth, [...(layers.get(depth) || []), item]) }); const largestLayer = Math.max(1, ...[...layers.values()].map(items => items.length))
    ;[...layers.entries()].sort(([a], [b]) => a - b).forEach(([depth, items]) => { items.sort((a, b) => { const average = (item: Node) => { const parents = incoming.get(item.id) || []; return parents.length ? parents.reduce((sum, id) => sum + ((current.getCellById(id) as Node | null)?.position().y || 0), 0) / parents.length : item.position().y }; return average(a) - average(b) }); items.forEach((item, index) => { const size = item.size(); item.position(80 + depth * 230, 68 + (index + (largestLayer - items.length) / 2) * 118 - Math.max(0, size.height - 52) / 2) }) })
    current.getEdges().forEach(item => { item.setVertices([]); const data = item.getData<EdgeData>(); if (data?.lineType === 'step' || data?.lineType === 'smoothstep') item.setRouter({ name: 'manhattan', args: { padding: 18, step: 12 } }) })
    requestAnimationFrame(() => fitGraphToCanvas(current, canvasRef.current))
  }
  const save = async () => {
    const current = graphRef.current; if (!current) return
    current.getEdges().forEach(item => item.removeTools()); current.getNodes().forEach(item => item.removeTools()); current.cleanSelection()
    current.getEdges().forEach(item => applyEdgeGeometry(item, item.getData<EdgeData>() || edgeDefaults))
    // X6 updates routed paths asynchronously. Export only after the live editor has
    // painted twice so the document preview contains exactly the path the user saw.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const nodes = current.getNodes().map(item => { const data = item.getData<NodeData>(); const position = item.position(); const size = item.size(); return { id: item.id, label: data.label, details: data.details, shape: data.diagramShape, color: data.color, fillColor: data.fillColor, textColor: data.textColor, lineStyle: data.lineStyle, borderWidth: data.borderWidth, fontSize: data.fontSize, opacity: data.opacity, zIndex: item.getZIndex(), x: position.x, y: position.y, width: size.width, height: size.height } })
    const edges = current.getEdges().map(item => { const data = item.getData<EdgeData>() || edgeDefaults; const source = item.getSourceCellId(); const target = item.getTargetCellId(); const sourcePoint = item.getSourcePoint(); const targetPoint = item.getTargetPoint(); return { id: item.id, source, target, sourcePort: item.getSourcePortId(), targetPort: item.getTargetPortId(), ...(!source ? { sourcePoint: { x: sourcePoint.x, y: sourcePoint.y } } : {}), ...(!target ? { targetPoint: { x: targetPoint.x, y: targetPoint.y } } : {}), label: data.label, lineType: data.lineType, lineStyle: data.lineStyle, arrow: data.arrow, color: data.color, thickness: data.thickness, fontSize: data.fontSize, opacity: data.opacity, zIndex: item.getZIndex(), vertices: data.lineType === 'straight' ? [] : item.getVertices().map(point => ({ x: point.x, y: point.y })) } })
    const box = current.getContentBBox().inflate(28)
    const edgeIds = edges.map(edge => edge.id)
    current.toSVG(svg => commit(nodes, edges, withoutEditorControls(svg, edgeIds), { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) }), { viewBox: box, preserveDimensions: { width: box.width, height: box.height }, copyStyles: false, serializeImages: true })
  }
  const shapes = SHAPES.filter(item => `${t(item.label)} ${t(item.hint)} ${item.label}`.toLowerCase().includes(query.toLowerCase()))
  const changeZoom = (delta: number) => {
    const current = graphRef.current
    if (!current) return
    current.zoomTo(delta === 0 ? 1 : Math.max(.2, Math.min(3, current.zoom() + delta)))
    setZoomPercent(Math.round(current.zoom() * 100))
  }
  return <div className="sk-diagram-dialog" onKeyDown={event => event.stopPropagation()} onDragStart={event => event.stopPropagation()} onDragEnd={event => event.stopPropagation()} onDragOver={event => { event.preventDefault(); event.stopPropagation() }} onDrop={event => { event.preventDefault(); event.stopPropagation() }}><header><div><b>{t("ui.flowchartUmlEditor")}</b><small>{t("ui.dragShapesSelectMultipleElementsDoubleClick")}</small></div><div><label className="sk-edge-select"><GitBranch size={15} /><select value={edgeDefaults.lineType} onChange={event => setEdgeDefaults(value => ({ ...value, lineType: event.target.value as DiagramEdgeType }))}><option value="smoothstep">{t("ui.roundedEdge")}</option><option value="straight">{t("ui.straight")}</option><option value="bezier">{t("ui.curve")}</option><option value="step">{t("ui.orthogonal")}</option></select></label><button className={edgeDefaults.lineStyle === 'dashed' ? 'is-active' : ''} onClick={() => setEdgeDefaults(value => ({ ...value, lineStyle: value.lineStyle === 'dashed' ? 'solid' : 'dashed' }))}><Minus size={16} /> {t("ui.dashed")}</button><button className="is-primary" onClick={save}><Save size={16} /> {t("ui.saveAndReturn")}</button><button className="is-icon" aria-label={t("ui.closeDiagramEditor")} onClick={close}><X size={19} /></button></div></header><div className="sk-flow-workspace">
    <aside className="sk-flow-palette"><div className="sk-flow-palette-title"><strong>{t("ui.shapes")}</strong><small>{t("ui.dragOntoCanvas")}</small></div><input className="sk-flow-search" aria-label={t("ui.searchShapes")} placeholder={t("ui.searchShapes")} value={query} onChange={event => setQuery(event.target.value)} />{(["ui.flowchart", 'UML', "ui.general"] as const).map(group => <section key={group}><strong>{t(group)}</strong><div>{shapes.filter(item => item.group === group).map(({ type, label, hint }) => <button key={type} aria-label={t(label)} draggable onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/slate-kit-x6', type) }} onDragEnd={event => event.stopPropagation()} onDoubleClick={() => addShape(type)} title={t("diagram.shapeHint", { 0: t(label), 1: t(hint) })}><svg viewBox="-4 -4 108 68" aria-hidden="true" style={{ width: 28, height: 24 }} fill="none" stroke="currentColor" strokeWidth="4">{diagramPaths[type] ? <path d={diagramPaths[type]} /> : polygons[type] ? <polygon points={polygons[type]} transform="scale(5 3)" vectorEffect="non-scaling-stroke" strokeWidth="1" /> : ellipse.has(type) ? <ellipse cx="50" cy="30" rx="48" ry="28" /> : (type === 'text') ? <text x="35" y="48" stroke="none" fill="currentColor" fontSize="54">T</text> : <rect width="100" height="60" rx="8" />}</svg></button>)}{group === "ui.general" && <button aria-label={t("ui.arrow")} draggable onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/slate-kit-x6-edge', 'edge') }} onDragEnd={event => event.stopPropagation()} onDoubleClick={() => addIndependentEdge()} title={t("ui.independentArrowDragOrDoubleClickTo")}><ArrowRight size={21} /></button>}</div></section>)}</aside>
    <div className="sk-flow-stage"><div className="sk-flow-canvas-toolbar"><button title={t("ui.zoomOut")} aria-label={t("ui.zoomOut")} onClick={() => changeZoom(-.1)}>−</button><button title={t("ui.resetZoom")} onClick={() => changeZoom(0)}>{zoomPercent}%</button><button title={t("ui.zoomIn")} aria-label={t("ui.zoomIn")} onClick={() => changeZoom(.1)}>+</button><i /><span><MousePointer2 size={15} /> {t("ui.select")}</span><button onClick={() => graphRef.current?.undo()}><Undo2 size={15} /> {t("ui.undo")}</button><button onClick={() => graphRef.current?.redo()}><Redo2 size={15} /> {t("ui.redo")}</button><button onClick={duplicate}><Copy size={15} /> {t("ui.copy")}</button><button onClick={remove}><Trash2 size={15} /> {t("ui.delete")}</button><button onClick={() => addIndependentEdge()}><GitBranch size={15} /> {t("ui.independentEdge")}</button><i /><button onClick={autoLayout}><AlignHorizontalDistributeCenter size={15} /> {t("ui.autoLayout")}</button><button onClick={() => { const current = graphRef.current; if (current) fitGraphToCanvas(current, canvasRef.current) }}><Maximize2 size={15} /> {t("ui.fitCanvas")}</button><button className={snap ? 'is-active' : ''} onClick={() => setSnap(value => !value)}><Grid3X3 size={15} /> {t("ui.snapToAlign")}</button></div><div className="sk-x6-stage" onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}><div ref={canvasRef} className="sk-x6-canvas" tabIndex={-1} onMouseDown={() => canvasRef.current?.focus({ preventScroll: true })} /><div ref={minimapRef} className="sk-x6-minimap" /></div></div>
    <aside className="sk-flow-inspector"><header><b>{selectedCount > 1 ? t("diagram.sharedStyleCount", { 0: selectedCount }) : nodeData?.diagramShape === 'text' ? t("ui.textStyle") : node ? t("ui.shapeStyle") : edge ? t("ui.edgeStyle") : t("ui.properties")}</b>{selectedCount > 0 && <button aria-label={t("ui.closeProperties")} onClick={() => { graphRef.current?.getEdges().forEach(item => item.removeTools()); graphRef.current?.cleanSelection(); setSelected(null); refresh() }}><X size={16} /></button>}</header>
      {selectedCount === 0 && <div className="sk-inspector-empty"><MousePointer2 size={24} /><b>{t("ui.selectAnElement")}</b><span>{t("ui.dragToSelectShiftClickToExtend")}</span></div>}
      {selectedCount > 1 && <><div className="sk-edge-drag-hint">{t("ui.applyTheseStylesToAllSelectedNodes")}</div><label>{t("ui.stroke")}<select defaultValue="solid" onChange={event => updateCommon({ lineStyle: event.target.value as DiagramLineStyle })}><option value="solid">{t("ui.solid")}</option><option value="dashed">{t("ui.dashed")}</option><option value="dotted">{t("ui.dotted")}</option></select></label><label>{t("ui.strokeWidth")}<input type="range" min="1" max="8" step=".5" defaultValue="2" onChange={event => updateCommon({ thickness: Number(event.target.value) })} /></label><label>{t("ui.fontSize")}<input type="range" min="10" max="32" step="1" defaultValue="13" onChange={event => updateCommon({ fontSize: Number(event.target.value) })} /></label><label>{t("ui.opacity")}<input type="range" min="0.15" max="1" step=".05" defaultValue="1" onChange={event => updateCommon({ opacity: Number(event.target.value) })} /></label><label>{t("ui.strokeColor")}<input type="color" defaultValue="#5b73e8" onChange={event => updateCommon({ color: event.target.value })} /></label><button className="is-danger" onClick={remove}><Trash2 size={15} /> {t("ui.deleteSelectedElements")}</button></>}
      {selectedCount === 1 && node && nodeData && (nodeData.diagramShape === 'text' ? <><small className="sk-inspector-help">{t("ui.doubleClickToEditEnterForA")}</small><label>{t("ui.textColor")}<input type="color" value={nodeData.textColor} onChange={event => updateNode({ textColor: event.target.value })} /></label><label>{t("ui.fontSize")}<input type="range" min="10" max="48" value={nodeData.fontSize} onChange={event => updateNode({ fontSize: Number(event.target.value) })} /></label><label>{t("ui.opacity")}<input type="range" min="0.15" max="1" step=".05" value={nodeData.opacity} onChange={event => updateNode({ opacity: Number(event.target.value) })} /></label><button className="is-danger" onClick={remove}><Trash2 size={15} /> {t("ui.deleteText")}</button></> : <><small className="sk-inspector-help">{t("ui.doubleClickToEditTextDragHandles")}</small><div className="sk-style-presets">{STYLE_PRESETS.map(preset => <button key={preset.name} title={t(preset.name)} aria-label={t(preset.name)} style={{ '--preset-border': preset.color, '--preset-fill': preset.fillColor } as CSSProperties} onClick={() => updateNode(preset)} />)}</div><div className="sk-inspector-colors"><label>{t("ui.border")}<input type="color" value={nodeData.color} onChange={event => updateNode({ color: event.target.value })} /></label><label>{t("ui.fill")}<input type="color" value={nodeData.fillColor} onChange={event => updateNode({ fillColor: event.target.value })} /></label><label>{t("ui.textLabel")}<input type="color" value={nodeData.textColor} onChange={event => updateNode({ textColor: event.target.value })} /></label></div><label>{t("ui.stroke")}<select value={nodeData.lineStyle} onChange={event => updateNode({ lineStyle: event.target.value as DiagramLineStyle })}><option value="solid">{t("ui.solid")}</option><option value="dashed">{t("ui.dashed")}</option><option value="dotted">{t("ui.dotted")}</option></select></label><label>{t("ui.borderWidth")}<input type="range" min="0" max="8" step=".5" value={nodeData.borderWidth} onChange={event => updateNode({ borderWidth: Number(event.target.value) })} /></label><label>{t("ui.fontSize")}<input type="range" min="10" max="32" value={nodeData.fontSize} onChange={event => updateNode({ fontSize: Number(event.target.value) })} /></label><label>{t("ui.opacity")}<input type="range" min="0.15" max="1" step=".05" value={nodeData.opacity} onChange={event => updateNode({ opacity: Number(event.target.value) })} /></label><button className="is-danger" onClick={remove}><Trash2 size={15} /> {t("ui.deleteShape")}</button></>)}
      {selectedCount === 1 && edge && edgeData && <><div className="sk-edge-drag-hint">{t("ui.doubleClickToEditEdgeTextDrag")}</div><label>{t("ui.edgeType")}<select value={edgeData.lineType} onChange={event => updateEdge({ lineType: event.target.value as DiagramEdgeType })}><option value="smoothstep">{t("ui.roundedEdge")}</option><option value="straight">{t("ui.straight")}</option><option value="bezier">{t("ui.curve")}</option><option value="step">{t("ui.orthogonal")}</option></select></label><label>{t("ui.arrow")}<select value={edgeData.arrow} onChange={event => updateEdge({ arrow: event.target.value as EdgeData['arrow'] })}><option value="end">{t("ui.endArrow")}</option><option value="both">{t("ui.bothArrows")}</option><option value="none">{t("ui.noArrow")}</option></select></label><label>{t("ui.stroke")}<select value={edgeData.lineStyle} onChange={event => updateEdge({ lineStyle: event.target.value as DiagramLineStyle })}><option value="solid">{t("ui.solid")}</option><option value="dashed">{t("ui.dashed")}</option><option value="dotted">{t("ui.dotted")}</option></select></label><label>{t("ui.strokeWidth")}<input type="range" min="1" max="8" step=".5" value={edgeData.thickness} onChange={event => updateEdge({ thickness: Number(event.target.value) })} /></label><label>{t("ui.fontSize")}<input type="range" min="10" max="32" value={edgeData.fontSize} onChange={event => updateEdge({ fontSize: Number(event.target.value) })} /></label><label>{t("ui.opacity")}<input type="range" min="0.15" max="1" step=".05" value={edgeData.opacity} onChange={event => updateEdge({ opacity: Number(event.target.value) })} /></label><label>{t("ui.color")}<input type="color" value={edgeData.color} onChange={event => updateEdge({ color: event.target.value })} /></label><button className="is-danger" onClick={remove}><Trash2 size={15} /> {t("ui.deleteEdge")}</button></>}
    </aside>
    {contextMenu && <div className="sk-flow-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={event => event.preventDefault()}><button onClick={() => moveLayer('front')}><BringToFront size={15} /> {t("ui.bringToFront")}</button><button onClick={() => moveLayer('forward')}>{t("ui.bringForward")}</button><button onClick={() => moveLayer('backward')}>{t("ui.sendBackward")}</button><button onClick={() => moveLayer('back')}><SendToBack size={15} /> {t("ui.sendToBack")}</button></div>}
    {edgeTextEditor && <textarea className="sk-edge-inline-editor" autoFocus value={edgeTextEditor.value} style={{ left: Math.max(130, Math.min(edgeTextEditor.x, window.innerWidth - 130)), top: Math.max(50, Math.min(edgeTextEditor.y, window.innerHeight - 50)) }} aria-label={t("ui.edgeText")} placeholder={t("ui.enterEdgeText")} onMouseDown={event => event.stopPropagation()} onChange={event => setEdgeTextEditor(value => value ? { ...value, value: event.target.value } : value)} onBlur={commitEdgeText} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) event.currentTarget.blur(); if (event.key === 'Escape') setEdgeTextEditor(null) }} />}
  </div></div>
}

export function DiagramBlock({ element }: { element: FlowchartElement }) {
  const { t } = useEditorI18n()

  const readOnly = useReadOnly(); const editor = useSlateStatic(); const selected = useSelected(); const focused = useFocused(); const [open, setOpen] = useState(false); const [viewing, setViewing] = useState(false); const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null); const resizeStart = useRef({ x: 0, width: 0 }); const [resizing, setResizing] = useState(false)
  const [previewSvg, setPreviewSvg] = useState(() => element.previewVersion === FLOW_PREVIEW_VERSION ? withoutEditorControls(element.previewSvg || '') : ''); const [contentSize, setContentSize] = useState({ width: element.contentWidth || 680, height: element.contentHeight || 300 })
  const width = element.width || Math.min(680, contentSize.width); const aspectRatio = contentSize.width / Math.max(1, contentSize.height)
  useEffect(() => {
    if (element.previewSvg && element.previewVersion === FLOW_PREVIEW_VERSION) { setPreviewSvg(withoutEditorControls(element.previewSvg)); setContentSize({ width: element.contentWidth || 680, height: element.contentHeight || 300 }); return }
    const container = document.createElement('div'); container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1200px;height:800px'; document.body.appendChild(container)
    const graph = new Graph({ container, width: 1200, height: 800, async: true, magnetThreshold: 2, background: { color: '#fff' }, grid: { visible: true, type: 'dot', size: 16, args: { color: '#d9e2f2', thickness: 1 } } }); graph.use(new Export())
    let disposed = false
    let ready = false
    let exported = false
    const exportPreview = () => {
      if (!ready || exported || disposed || graph.getCells().some(cell => !graph.findViewByCell(cell))) return
      exported = true
      if (disposed) return
      const box = graph.getContentBBox().inflate(28)
      graph.toSVG(svg => { if (!disposed) { setPreviewSvg(withoutEditorControls(svg, element.edges.map(edge => edge.id))); setContentSize({ width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) }) } }, { viewBox: box, preserveDimensions: { width: box.width, height: box.height }, copyStyles: false, serializeImages: true })
    }
    graph.on('render:done', () => requestAnimationFrame(() => requestAnimationFrame(exportPreview)))
    const populate = () => {
      if (disposed) return
      ready = true
      graph.fromJSON({ nodes: element.nodes.map(node => makeNode(node.shape || 'process', node.x, node.y, node)), edges: element.edges.map(edge => makeEdge(edge)) })
    }
    populate()
    const fallback = window.setTimeout(exportPreview, 300)
    return () => { disposed = true; window.clearTimeout(fallback); graph.dispose(); container.remove() }
  }, [element.previewSvg, element.previewVersion, element.nodes, element.edges, element.type, element.contentWidth, element.contentHeight])
  const commit = useCallback((nodes: DiagramNode[], edges: DiagramEdge[], svg: string, size: { width: number; height: number }) => { const preview = withoutEditorControls(svg); Transforms.setNodes(editor, { nodes, edges, previewSvg: preview, previewVersion: FLOW_PREVIEW_VERSION, contentWidth: size.width, contentHeight: size.height, aspectRatio: size.width / size.height }, { at: DOMEditor.findPath(editor, element) }); setPreviewSvg(preview); setContentSize(size); setOpen(false) }, [editor, element])
  const resize = (event: PointerEvent<HTMLButtonElement>) => { if (readOnly || !resizing) return; const next = Math.max(260, Math.min(960, resizeStart.current.width + event.clientX - resizeStart.current.x)); Transforms.setNodes(editor, { width: Math.round(next) }, { at: DOMEditor.findPath(editor, element) }) }
  const previewOnClick = useRef(false)
  const selectImage = (event: { preventDefault(): void }) => {
    event.preventDefault()
    previewOnClick.current = readOnly || (selected && focused) || isSelectedElement(editor, element)
    if (readOnly) return
    Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor)
  }
  const openEditor = () => { if (readOnly) return; Transforms.deselect(editor); setOpen(true) }
  const previewUrl = previewSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}` : ''
  return <><figure className={`sk-diagram-figure ${selected ? 'is-selected' : ''}`} contentEditable={false} style={{ width, aspectRatio, marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} onMouseDown={selectImage}><div className="sk-diagram-preview" role="img" aria-label={t("ui.flowchartPreview")} title={t(readOnly ? 'media.clickToPreview' : 'media.clickToSelectThenPreview')} onClick={event => { if (previewUrl && shouldOpenMediaPreview(readOnly, previewOnClick.current, event)) setViewing(true) }} onContextMenu={event => { if (!previewUrl) return; event.preventDefault(); setDownloadMenu({ x: event.clientX, y: event.clientY }) }}>{previewSvg ? <img src={previewUrl} alt={t("ui.flowchartPreview")} /> : <span className="sk-diagram-loading">{t("ui.generatingPreview")}</span>}</div><div className="sk-media-corner-actions"><button aria-label={t("ui.previewFlowchart")} title={t("ui.preview")} onMouseDown={event => event.stopPropagation()} onClick={() => previewUrl && setViewing(true)}><Maximize2 size={15} /></button><button hidden={readOnly} aria-label={t("ui.editFlowchart")} title={t("ui.editFlowchart")} onMouseDown={event => event.stopPropagation()} onClick={openEditor}><Pencil size={15} /></button></div><button hidden={readOnly} className="sk-diagram-resizer" aria-label={t("ui.resizeDiagramProportionally")} onClick={event => event.stopPropagation()} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; setResizing(true) }} onPointerMove={resize} onPointerUp={() => setResizing(false)} /></figure>{downloadMenu && previewUrl && <MediaDownloadMenu src={previewUrl} downloadName={t("diagram.downloadFilename")} position={downloadMenu} close={() => setDownloadMenu(null)} />}{viewing && previewUrl && <MediaLightbox src={previewUrl} alt={t("ui.flowchart")} downloadName={t("diagram.downloadFilename")} close={() => setViewing(false)} />}{!readOnly && open && typeof document !== 'undefined' && createPortal(<div className="sk-diagram-modal" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }} contentEditable={false} onMouseDown={event => event.stopPropagation()}><X6Editor element={element} close={() => setOpen(false)} commit={commit} /></div>, document.body)}</>
}
