import { useEditorI18n, translate, zhCN } from '../i18n'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Transforms } from 'slate'
import { shouldOpenMediaPreview } from '../media'
import { DOMEditor } from 'slate-dom'
import { useSelected, useSlateStatic, useReadOnly } from 'slate-react'
import { Graph, Shape, Cell, Point, type Edge, type EdgeView, type Node } from '@antv/x6'
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
import { arrowBendFromPoint, blockArrowGeometry } from '../diagramArrows'
import type { DiagramArrowDirection, DiagramArrowRoute, DiagramCanvasSettings, DiagramMarker, DiagramEdge, DiagramEdgeType, DiagramLineStyle, DiagramNode, DiagramNodeType, FlowchartElement } from '../types'
import { diagramInsertionPosition } from '../diagramPlacement'
import { createDiagramTemplate, type DiagramTemplate } from '../diagramTemplates'
import { DiagramWorkspace, DiagramShapeIcon, DiagramRouteIcon, type DiagramCommand } from './DiagramWorkspace'
import { alignDiagramNodes, distributeDiagramNodes, diagramPageTransform, diagramPageBounds, diagramPaperSize, restoreDiagramParents, cloneDiagramCells, ungroupDiagramNode, captureDiagramGroup, transformDiagramGroup, rotateDiagramNode, diagramSelectionRoots, type DiagramAlignment } from '../diagramWorkspace'
import { MediaDownloadMenu, MediaLightbox } from './MediaLightbox'

export type NodeData = { aspectRatioLocked: boolean; rounded: boolean; shadow: boolean; fontFamily: string; bold: boolean; italic: boolean; underline: boolean; textAlign: 'left' | 'center' | 'right'; diagramShape: DiagramNodeType; arrowDirection: DiagramArrowDirection; arrowRoute: DiagramArrowRoute; arrowThickness: number; arrowHeadSize: number; arrowBend: number; label: string; details?: string; color: string; fillColor: string; textColor: string; lineStyle: DiagramLineStyle; borderWidth: number; fontSize: number; opacity: number }
export type EdgeData = { lineJoin?: 'miter' | 'round' | 'bevel'; lineJump?: 'none' | 'arc' | 'gap' | 'cubic'; jumpSize?: number; sourceArrowSize?: number; targetArrowSize?: number; sourceOffset?: number; targetOffset?: number; sourceArrow?: DiagramMarker; targetArrow?: DiagramMarker; arrowSize?: number; labelPosition?: number; fontFamily?: string; textColor?: string; bold?: boolean; italic?: boolean; underline?: boolean; lineType: DiagramEdgeType; lineStyle: DiagramLineStyle; arrow: 'none' | 'end' | 'both'; color: string; thickness: number; fontSize: number; opacity: number; label?: string }
const FLOW_PREVIEW_VERSION = 9
const SHAPES: Array<{ group: "ui.flowchart" | 'UML' | "ui.general" | 'diagram.basic'; type: DiagramNodeType; label: string; hint: string; icon: typeof Square; preset?: Partial<DiagramNode> }> = [
  { group: 'diagram.basic', type: 'circle', label: 'diagram.circle', hint: 'diagram.circleHint', icon: Square },
  { group: 'diagram.basic', type: 'ellipse', label: 'diagram.ellipse', hint: 'diagram.ellipseHint', icon: Square },
  { group: 'diagram.basic', type: 'triangle', label: 'diagram.triangle', hint: 'diagram.triangleHint', icon: Square },
  { group: 'diagram.basic', type: 'hexagon', label: 'diagram.hexagon', hint: 'diagram.hexagonHint', icon: Square },
  { group: 'diagram.basic', type: 'pentagon', label: 'diagram.pentagon', hint: 'diagram.pentagonHint', icon: Square },
  { group: 'diagram.basic', type: 'octagon', label: 'diagram.octagon', hint: 'diagram.octagonHint', icon: Square },
  { group: 'diagram.basic', type: 'star', label: 'diagram.star', hint: 'diagram.starHint', icon: Square },
  { group: 'diagram.basic', type: 'cross', label: 'diagram.cross', hint: 'diagram.crossHint', icon: Square },
  { group: 'diagram.basic', type: 'cloud', label: 'diagram.cloud', hint: 'diagram.cloudHint', icon: Square },
  { group: 'diagram.basic', type: 'server', label: 'diagram.server', hint: 'diagram.serverHint', icon: Square },
  { group: 'diagram.basic', type: 'browser', label: 'diagram.browser', hint: 'diagram.browserHint', icon: Square },
  { group: 'diagram.basic', type: 'swimlane', label: 'diagram.swimlane', hint: 'diagram.swimlaneHint', icon: Square },
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
  { group: "ui.general", type: 'rectangle', label: 'diagram.rectangle', hint: 'diagram.rectangleHint', icon: Square },
  { group: "ui.general", type: 'block-arrow', label: 'diagram.blockArrow', hint: 'diagram.blockArrowHint', icon: ArrowRight },
  { group: "ui.general", type: 'block-arrow', label: 'diagram.elbowArrow', hint: 'diagram.elbowArrowHint', icon: ArrowRight, preset: { arrowRoute: 'elbow', label: '' } },
  { group: "ui.general", type: 'block-arrow', label: 'diagram.stepArrow', hint: 'diagram.stepArrowHint', icon: ArrowRight, preset: { arrowRoute: 'step', label: '' } },
  { group: "ui.general", type: 'text', label: "ui.freeText", hint: "ui.borderlessText", icon: Type },
]
for (const type of ['cube', 'chevron', 'trapezoid', 'callout', 'folder', 'crescent'] as const) SHAPES.push({ group: 'ui.general', type, label: `diagram.${type}`, hint: `diagram.${type}Hint`, icon: Square })
const ellipse = new Set<DiagramNodeType>(['circle', 'ellipse', 'terminator', 'use-case', 'state', 'activity', 'boundary', 'control', 'entity', 'connector', 'mind-topic'])
const polygons: Partial<Record<DiagramNodeType, string>> = { decision: '0,10 10,0 20,10 10,20', data: '5,0 20,0 15,10 0,10', 'manual-input': '3,3 20,0 20,10 0,10', preparation: '4,0 16,0 20,10 16,20 4,20 0,10', display: '4,0 17,0 20,10 17,20 4,20 0,10', storage: '3,0 20,0 17,10 0,10', 'off-page-connector': '0,0 20,0 20,14 10,20 0,14', merge: '0,0 20,10 0,20', card: '0,4 4,0 20,0 20,20 0,20' }
const portSides = ['top', 'right', 'bottom', 'left'] as const
const ports = {
  groups: Object.fromEntries(portSides.map(position => [position, { position,
    markup: [{ tagName: 'g', selector: 'portBody', attrs: { class: 'x6-port-body' }, children: [{ tagName: 'circle', selector: 'portHit' }, { tagName: 'path', selector: 'portCross' }] }],
    attrs: { portHit: { r: 7, magnet: true, fill: 'transparent', stroke: 'none' }, portCross: { d: 'M -3 0 H 3 M 0 -3 V 3', fill: 'none', stroke: '#4eafe0', strokeWidth: 1, pointerEvents: 'none' } },
  }])),
  items: portSides.flatMap(group => [1, 2, 3].map(index => ({ id: `${group}-${index}`, group }))),
}
const shapeName = (type: DiagramNodeType) => type === 'block-arrow' || diagramPaths[type] ? 'path' : polygons[type] ? 'polygon' : ellipse.has(type) ? 'ellipse' : 'rect'
const defaultDetails = (type: DiagramNodeType, t: (key: string) => string) => type === 'class' ? t('diagram.classExample') : type === 'interface' ? '«interface»\n+ operation()' : undefined
const nodePrefix: Partial<Record<DiagramNodeType, string>> = { interface: '«interface»\n' }
const STYLE_PRESETS = [
  { name: 'diagram.defaultStyle', color: '#000000', fillColor: '#ffffff', textColor: '#000000' },
  { name: 'ui.gray', color: '#666666', fillColor: '#f5f5f5', textColor: '#333333' },
  { name: 'ui.blue', color: '#6c8ebf', fillColor: '#dae8fc', textColor: '#000000' },
  { name: 'ui.green', color: '#82b366', fillColor: '#d5e8d4', textColor: '#000000' },
  { name: 'ui.orange', color: '#d79b00', fillColor: '#ffe6cc', textColor: '#000000' },
  { name: 'diagram.yellow', color: '#d6b656', fillColor: '#fff2cc', textColor: '#000000' },
  { name: 'diagram.red', color: '#b85450', fillColor: '#f8cecc', textColor: '#000000' },
  { name: 'ui.purple', color: '#9673a6', fillColor: '#e1d5e7', textColor: '#000000' },
  { name: 'diagram.solidBlue', color: '#4166d5', fillColor: '#4166d5', textColor: '#ffffff' },
  { name: 'diagram.solidGreen', color: '#218b66', fillColor: '#218b66', textColor: '#ffffff' },
  { name: 'diagram.cyan', color: '#0891b2', fillColor: '#ecfeff', textColor: '#155e75' },
  { name: 'ui.dark', color: '#334155', fillColor: '#334155', textColor: '#ffffff' },
]
const dashArray = (style: DiagramLineStyle) => style === 'dashed' ? '8 5' : style === 'dotted' ? '2 5' : ''
const displayText = (data: NodeData) => `${nodePrefix[data.diagramShape] || ''}${data.label}${data.details ? `\n────────\n${data.details}` : ''}`
const nodeAttrs = (data: NodeData, size: { width: number; height: number } = { width: 220, height: 120 }) => {
  const shape = data.diagramShape
  const radius = shape === 'group' ? 2 : ['class', 'interface'].includes(shape) ? 3 : data.rounded ? 10 : 0
  const arrow = shape === 'block-arrow' ? blockArrowGeometry(size, data) : undefined
  const path = diagramPaths[shape]
  const labelText = displayText(data)
  const arrowFontSize = arrow ? Math.min(data.fontSize, Math.max(8, arrow.label.width / 2), Math.max(8, arrow.label.height / 1.35)) : data.fontSize
  return {
    body: {
      fill: shape === 'text' ? 'transparent' : data.fillColor,
      stroke: shape === 'text' ? 'transparent' : data.color,
      strokeWidth: data.borderWidth,
      strokeDasharray: dashArray(shape === 'interface' && data.lineStyle === 'solid' ? 'dashed' : data.lineStyle),
      opacity: data.opacity, rx: radius, ry: radius, filter: data.shadow ? 'drop-shadow(2px 2px 1px #00000040)' : 'none',
      ...(arrow ? { d: arrow.path, refD: null } : path ? { refD: path } : {}), refPoints: polygons[shape],
    },
    label: {
      text: labelText, fill: data.textColor, opacity: data.opacity,
      fontSize: arrowFontSize, fontFamily: data.fontFamily, fontWeight: data.bold ? 700 : 400, fontStyle: data.italic ? 'italic' : 'normal', textDecoration: data.underline ? 'underline' : 'none', lineHeight: arrowFontSize * 1.2,
      refX2: 0, textAnchor: data.textAlign === 'left' ? 'start' : data.textAlign === 'right' ? 'end' : 'middle',
      ...(data.textAlign === 'left' ? { refX: 8 } : data.textAlign === 'right' ? { refX: '100%', refX2: -8 } : { refX: '50%' }),
      textWrap: { text: labelText, width: -18, height: -12, ellipsis: false },
      ...(arrow ? { refX: arrow.label.x, refY: arrow.label.y, textWrap: { text: labelText, width: Math.max(16, arrow.label.width), height: Math.max(arrowFontSize * 2.7, arrow.label.height), ellipsis: false } } : {}),
      ...(['group', 'swimlane'].includes(shape) ? { refX: 12, refY: 14, textAnchor: 'start', textVerticalAnchor: 'top' } : {}),
    },
  }
}

export const setNodeText = (cell: Cell, value: string) => {
  const data = cell.getData<NodeData>()
  const structured = data.details !== undefined || data.diagramShape === 'class' || data.diagramShape === 'interface'
  const [label, ...details] = value.split('\n')
  const next = { ...data, label: structured ? label : value, details: structured ? details.join('\n') : undefined }
  cell.replaceData(next); cell.attr(nodeAttrs(next, cell.isNode() ? cell.size() : undefined))
  if (cell.isNode() && data.diagramShape === 'text') {
    const size = cell.size()
    cell.resize(size.width, Math.max(size.height, 42, Math.ceil(value.split('\n').length * next.fontSize * 1.45 + 18)))
  }
}
export function makeNode(type: DiagramNodeType, x: number, y: number, source?: Partial<DiagramNode>, t: (key: string) => string = key => translate(zhCN, key)) {
  const meta = SHAPES.find(item => item.type === type) || { label: 'ui.node' }
  const small = ['circle', 'triangle', 'pentagon', 'octagon', 'star', 'cross'].includes(type)
  const width = source?.width || (type === 'block-arrow' ? 220 : type === 'swimlane' ? 480 : type === 'group' ? 260 : small ? 100 : type === 'class' ? 180 : type === 'cloud' || type === 'browser' ? 160 : type === 'server' ? 110 : 120)
  const height = source?.height || (type === 'block-arrow' ? (source?.arrowRoute && source.arrowRoute !== 'straight' ? 140 : 100) : type === 'swimlane' ? 240 : type === 'group' ? 160 : type === 'class' ? 96 : small || type === 'cloud' || type === 'browser' || type === 'server' ? 100 : type === 'ellipse' || type === 'hexagon' ? 76 : type === 'actor' ? 82 : 60)
  const legacyArrow = type === 'block-arrow' && source?.width && source?.height && source.arrowRoute === undefined
  const transverse = ['up', 'down'].includes(source?.arrowDirection || 'right') ? width : height
  const data: NodeData = {
    aspectRatioLocked: source?.aspectRatioLocked ?? false, rounded: source?.rounded ?? !['process', 'rectangle'].includes(type), shadow: source?.shadow ?? false,
    fontFamily: source?.fontFamily || 'Helvetica', bold: source?.bold ?? false, italic: source?.italic ?? false, underline: source?.underline ?? false, textAlign: source?.textAlign || 'center',
    diagramShape: type, arrowDirection: source?.arrowDirection || 'right', arrowRoute: source?.arrowRoute || 'straight',
    arrowThickness: source?.arrowThickness ?? (legacyArrow ? Math.round(transverse * .46) : 28), arrowHeadSize: source?.arrowHeadSize ?? (legacyArrow ? transverse : 48), arrowBend: source?.arrowBend ?? 50,
    label: source?.label ?? t(meta.label), details: source?.details ?? defaultDetails(type, t),
    color: source?.color || '#000000', fillColor: source?.fillColor || '#ffffff', textColor: source?.textColor || '#000000',
    lineStyle: source?.lineStyle || 'solid', borderWidth: source?.borderWidth ?? 1, fontSize: source?.fontSize || (legacyArrow ? 13 : 12), opacity: source?.opacity ?? 1,
  }
  return { id: source?.id || createId(), shape: shapeName(type), x, y, width, height, angle: source?.angle ?? 0, parent: source?.parentId, attrs: nodeAttrs(data, { width, height }), ports: type === 'text' ? undefined : ports, data, zIndex: source?.zIndex ?? (['group', 'swimlane'].includes(type) ? -1 : 1) }
}

export function serializeDiagramNode(node: Node): DiagramNode {
  const data = node.getData<NodeData>(), position = node.position(), size = node.size()
  return {
    id: node.id, label: data.label, details: data.details, shape: data.diagramShape, parentId: node.getParentId(),
    aspectRatioLocked: data.aspectRatioLocked, rounded: data.rounded, shadow: data.shadow, fontFamily: data.fontFamily, bold: data.bold, italic: data.italic, underline: data.underline, textAlign: data.textAlign,
    ...(data.diagramShape === 'block-arrow' ? { arrowDirection: data.arrowDirection, arrowRoute: data.arrowRoute, arrowThickness: data.arrowThickness, arrowHeadSize: data.arrowHeadSize, arrowBend: data.arrowBend } : {}),
    color: data.color, fillColor: data.fillColor, textColor: data.textColor, lineStyle: data.lineStyle,
    borderWidth: data.borderWidth, fontSize: data.fontSize, opacity: data.opacity, zIndex: node.getZIndex(),
    x: position.x, y: position.y, width: size.width, height: size.height, angle: node.getAngle(),
  }
}

const edgeMarker = (type: DiagramMarker, size: number, color: string) => {
  if (type === 'none') return null
  if (type === 'open') return { name: 'path', d: `M ${size} ${-size / 2} L 0 0 L ${size} ${size / 2}`, fill: 'none', stroke: color, strokeWidth: 1 }
  if (type === 'circle') return { name: 'circle', r: size / 2, fill: color, stroke: color }
  return { name: type, width: size, height: type === 'diamond' ? size : size * .7, fill: color, stroke: color }
}
const edgeAttrs = (data: EdgeData) => ({ wrap: { stroke: 'transparent', strokeWidth: Math.max(14, data.thickness + 12), cursor: 'pointer' }, line: { stroke: data.color, opacity: data.opacity, strokeWidth: data.thickness, strokeDasharray: dashArray(data.lineStyle), strokeLinecap: 'butt', strokeLinejoin: data.lineJoin || (data.lineType === 'smoothstep' ? 'round' : 'miter'), sourceMarker: data.thickness > 0 ? edgeMarker(data.sourceArrow ?? (data.arrow === 'both' ? 'classic' : 'none'), data.sourceArrowSize ?? data.arrowSize ?? 7, data.color) : null, targetMarker: data.thickness > 0 ? edgeMarker(data.targetArrow ?? (data.arrow === 'none' ? 'none' : 'classic'), data.targetArrowSize ?? data.arrowSize ?? 7, data.color) : null } })

const applyEdgeAttrs = (edge: Edge, data: EdgeData) => {
  // X6 merges attrs by default, so a previously rendered marker must be
  // removed explicitly before applying the next arrow preset.
  edge.removeAttrByPath('line/sourceMarker')
  edge.removeAttrByPath('line/targetMarker')
  edge.attr(edgeAttrs(data))
}
const bodyConnectionPoint = { name: 'boundary', args: { selector: 'body', stroked: false } }
const terminalConnectionPoint = (offset = 0) => offset ? { name: 'boundary', args: { ...bodyConnectionPoint.args, offset } } : bodyConnectionPoint
const edgeConnector = (data: EdgeData) => data.lineJump && data.lineJump !== 'none' && data.lineType !== 'bezier'
  ? { name: 'jumpover', args: { type: data.lineJump, size: data.jumpSize ?? 6, radius: data.lineType === 'smoothstep' ? 12 : 0 } }
  : { name: data.lineType === 'bezier' ? 'smooth' : data.lineType === 'smoothstep' ? 'rounded' : 'normal', args: data.lineType === 'smoothstep' ? { radius: 12 } : undefined }
const edgeRouter = (edge: Edge, data: EdgeData) => {
  if (!['step', 'smoothstep'].includes(data.lineType)) return { name: 'normal' }
  if (edge.getData()?.routeMode === 'manual') return { name: 'orth', args: { padding: 8 } }
  return { name: 'manhattan', args: {
    padding: 8, step: 8, perpendicular: false,
    excludeNodes: edge.model?.getNodes().filter(node => ['group', 'swimlane', 'text'].includes(node.getData()?.diagramShape)).map(node => node.id) || [],
  } }
}
export const applyEdgeGeometry = (edge: Edge, data: EdgeData, resetVertices = false, transient = false) => {
  const options = transient ? { ignoreHistory: true } : {}
  if (edge.getSourceCellId()) edge.setSource({ ...edge.getSource(), connectionPoint: terminalConnectionPoint(data.sourceOffset) }, options)
  if (edge.getTargetCellId()) edge.setTarget({ ...edge.getTarget(), connectionPoint: terminalConnectionPoint(data.targetOffset) }, options)
  if (resetVertices || data.lineType === 'straight') {
    edge.setVertices([], options); edge.removeProp('data/routeMode', options)
    if (resetVertices) { edge.removeProp('source/anchor', options); edge.removeProp('target/anchor', options) }
  }
  edge.setRouter(edgeRouter(edge, data), options)
  edge.setConnector(edgeConnector(data), options)
}

const edgeToolNames = (lineType: DiagramEdgeType) => [
  ...(lineType === 'straight' ? [] : [
    { name: 'vertices', args: { addable: true, modifiers: ['alt'], attrs: { r: 3.5, fill: '#4eafe0', stroke: '#fff', 'stroke-width': 1 } } },
    ...(lineType === 'bezier' ? [] : [{ name: 'segments', args: { threshold: 16, attrs: { width: 7, height: 7, x: -3.5, y: -3.5, rx: 3.5, ry: 3.5, fill: '#4eafe0', stroke: '#fff', 'stroke-width': 1 } } }]),
  ]),
  ...['source-arrowhead', 'target-arrowhead'].map(name => ({ name, args: { attrs: { d: 'M -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0', fill: '#ffffff', stroke: '#3b9acb', 'stroke-width': 2 } } })),
]
// The segment tool works with model vertices, not the router's display points.
// Keep an untouched automatic route temporary while its handles are shown.
const routeDrafts = new WeakMap<Edge, { vertices: ReturnType<Edge['getVertices']>; router: ReturnType<Edge['getRouter']>; dirty?: boolean }>()
const prepareEdgeTools = (graph: Graph, edge: Edge) => {
  if (edge.hasTools()) return
  const type = edge.getData<EdgeData>()?.lineType || 'smoothstep'
  if (['step', 'smoothstep'].includes(type)) {
    const view = graph.findViewByCell(edge) as EdgeView | null
    if (view) {
      routeDrafts.set(edge, { vertices: edge.getVertices(), router: edge.getRouter() })
      edge.setVertices(view.routePoints.map(point => ({ x: point.x, y: point.y })), { ignoreHistory: true })
      edge.setRouter('normal', {}, { ignoreHistory: true })
    }
  }
  edge.addTools(edgeToolNames(type))
}
const clearEdgeTools = (edge: Edge) => {
  edge.removeTools()
  const draft = routeDrafts.get(edge)
  if (draft && !draft.dirty) {
    edge.setVertices(draft.vertices, { ignoreHistory: true })
    if (draft.router) edge.setRouter(draft.router, { ignoreHistory: true })
  } else if (draft) edge.setRouter(edgeRouter(edge, edge.getData<EdgeData>()), { ignoreHistory: true })
  routeDrafts.delete(edge)
}
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
const edgeLabels = (data: Pick<EdgeData, 'label' | 'fontSize' | 'opacity' | 'fontFamily' | 'textColor' | 'bold' | 'italic' | 'underline' | 'labelPosition'>) => data.label ? [{ position: data.labelPosition ?? .5, attrs: { label: { text: data.label, fill: data.textColor || '#000000', opacity: data.opacity, fontSize: data.fontSize, fontFamily: data.fontFamily || 'Helvetica', fontWeight: data.bold ? 700 : 400, fontStyle: data.italic ? 'italic' : 'normal', textDecoration: data.underline ? 'underline' : 'none' }, body: { fill: '#fff', fillOpacity: data.opacity, stroke: 'none', refWidth: '120%', refHeight: '120%', refX: '-10%', refY: '-10%' } } }] : []
const fitGraphToCanvas = (graph: Graph, container: HTMLElement | null, pageHeight?: number) => {
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
  if (pageHeight) {
    const translation = graph.translate(), pageTop = Math.floor(bounds.y / pageHeight) * pageHeight
    graph.translate(translation.tx, Math.min(translation.ty, 24 - pageTop * scale))
  }
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
export function makeEdge(edge: Partial<DiagramEdge> & { source: string; target: string }, defaults?: Partial<EdgeData>) {
  const data: EdgeData & { routeMode?: 'manual' } = { lineJoin: edge.lineJoin ?? defaults?.lineJoin ?? 'miter', lineJump: edge.lineJump ?? defaults?.lineJump ?? 'none', jumpSize: edge.jumpSize ?? defaults?.jumpSize ?? 6, sourceArrowSize: edge.sourceArrowSize ?? defaults?.sourceArrowSize, targetArrowSize: edge.targetArrowSize ?? defaults?.targetArrowSize, sourceOffset: edge.sourceOffset ?? defaults?.sourceOffset, targetOffset: edge.targetOffset ?? defaults?.targetOffset, sourceArrow: edge.sourceArrow ?? (edge.arrow === 'both' ? 'classic' : defaults?.sourceArrow ?? 'none'), targetArrow: edge.targetArrow ?? (edge.arrow === 'none' ? 'none' : defaults?.targetArrow ?? 'classic'), arrowSize: edge.arrowSize ?? defaults?.arrowSize ?? 7, labelPosition: edge.labelPosition ?? .5, fontFamily: edge.fontFamily || 'Helvetica', textColor: edge.textColor || '#000000', bold: edge.bold ?? false, italic: edge.italic ?? false, underline: edge.underline ?? false, routeMode: edge.lineType === 'straight' ? undefined : edge.routeMode || (edge.vertices?.length ? 'manual' : undefined), lineType: edge.lineType || defaults?.lineType || 'step', lineStyle: edge.lineStyle || defaults?.lineStyle || 'solid', arrow: edge.arrow || defaults?.arrow || 'end', color: edge.color || defaults?.color || '#000000', thickness: edge.thickness ?? defaults?.thickness ?? 1, fontSize: edge.fontSize || defaults?.fontSize || 12, opacity: edge.opacity ?? defaults?.opacity ?? 1, label: edge.label }
  const routed = data.lineType === 'step' || data.lineType === 'smoothstep'
  const source = edge.source ? { cell: edge.source, anchor: edge.sourceAnchor, connectionPoint: terminalConnectionPoint(data.sourceOffset), ...(edge.sourcePort ? { port: edge.sourcePort } : {}) } : edge.sourcePoint
  const target = edge.target ? { cell: edge.target, anchor: edge.targetAnchor, connectionPoint: terminalConnectionPoint(data.targetOffset), ...(edge.targetPort ? { port: edge.targetPort } : {}) } : edge.targetPoint
  return { id: edge.id || createId(), shape: 'edge', parent: edge.parentId, source, target, vertices: data.lineType === 'straight' ? [] : edge.vertices, router: routed ? data.routeMode === 'manual' ? { name: 'orth', args: { padding: 8 } } : { name: 'manhattan', args: { padding: 8, step: 8, perpendicular: false } } : { name: 'normal' }, connector: edgeConnector(data), attrs: edgeAttrs(data), labels: edgeLabels(data), data, zIndex: edge.zIndex ?? 0 }
}

function X6Editor({ element, close, commit }: { element: FlowchartElement; close(): void; commit(nodes: DiagramNode[], edges: DiagramEdge[], previewSvg: string, size: { width: number; height: number }, settings: DiagramCanvasSettings): void }) {
  const { t } = useEditorI18n()

  const canvasRef = useRef<HTMLDivElement>(null); const minimapRef = useRef<HTMLDivElement>(null); const graphRef = useRef<Graph | null>(null)
  const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  type TextEditor = { kind: 'node' | 'edge'; id: string; x: number; y: number; width: number; fontSize: number; value: string }
  const [textEditor, setTextEditorState] = useState<TextEditor | null>(null)
  const textEditorRef = useRef<TextEditor | null>(null)
  const setTextEditor = (value: TextEditor | null) => { textEditorRef.current = value; setTextEditorState(value) }
  const arrowDrag = useRef<string | null>(null)
  type QuickDirection = 'top' | 'right' | 'bottom' | 'left'
  const [quickMenu, setQuickMenu] = useState<{ direction: QuickDirection; x: number; y: number } | null>(null)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  const quickDrag = useRef<{ source: Node; direction: QuickDirection; x: number; y: number; edge?: Edge; target?: Node } | null>(null)
  const [settings, setSettings] = useState<DiagramCanvasSettings>(() => ({ grid: true, gridSize: 10, pageView: true, paper: 'a4', landscape: false, backgroundColor: '#ffffff', connectionArrows: true, connectionPoints: true, guides: true, minimap: false, ...element.canvasSettings }))
  const settingsRef = useRef(settings); settingsRef.current = settings
  const fitCanvas = (current: Graph) => fitGraphToCanvas(current, canvasRef.current, settingsRef.current.pageView ? diagramPaperSize(settingsRef.current).height : undefined)
  const [settingsDirty, setSettingsDirty] = useState(false), [pan, setPan] = useState(false), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState<string | null>(null)
  const [defaultNode, setDefaultNode] = useState<Partial<NodeData>>({ color: '#000000', fillColor: '#ffffff', textColor: '#000000', borderWidth: 1, fontSize: 12, fontFamily: 'Helvetica' })
  const paperRef = useRef<HTMLDivElement>(null), refreshFrame = useRef<number | null>(null), spaceDown = useRef(false)
  const rotatePress = useRef<{ node: Node; angle: number; x: number; y: number; moved: boolean } | null>(null)
  const panDrag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const commandRef = useRef<(command: DiagramCommand, value?: string | number) => void>(() => {})
  const saveRef = useRef<() => void>(() => {})
  const editRef = useRef<(cell: Cell, text?: string) => void>(() => {})
  const scheduleRefresh = () => { if (refreshFrame.current === null) refreshFrame.current = requestAnimationFrame(() => { refreshFrame.current = null; setRevision(value => value + 1) }) }
  const syncPaper = (graph: Graph) => { const paper = paperRef.current; if (paper) paper.style.transform = `${diagramPageTransform(graph.zoom(), graph.translate())} translate(${paper.dataset.pageX || 0}px, ${paper.dataset.pageY || 0}px)` }
  const changeSettings = (patch: Partial<DiagramCanvasSettings>) => { setSettings(value => ({ ...value, ...patch })); setSettingsDirty(true) }
  const [zoomPercent, setZoomPercent] = useState(100)
  const [edgeDefaults, setEdgeDefaults] = useState<EdgeData>({ lineType: 'step', lineStyle: 'solid', arrow: 'end', color: '#000000', thickness: 1, fontSize: 12, opacity: 1 })
  const edgeDefaultsRef = useRef(edgeDefaults)
  edgeDefaultsRef.current = edgeDefaults
  useEffect(() => {
    if (!canvasRef.current || !minimapRef.current) return
    // Segment handles must read the route produced by the current model update.
    const graph = new Graph({ container: canvasRef.current, autoResize: true, async: false, magnetThreshold: 2, background: { color: 'transparent' }, grid: { visible: false, type: 'doubleMesh', size: settings.gridSize, args: [{ color: '#f1f1f1', thickness: 1 }, { color: '#dfdfdf', thickness: 1, factor: 5 }] }, mousewheel: { enabled: true, zoomAtMousePosition: true, modifiers: ['ctrl', 'meta'], minScale: .1, maxScale: 4 }, panning: { enabled: true, eventTypes: ['mouseWheel'] }, connecting: { snap: { radius: 14 }, allowBlank: true, allowNode: true, allowLoop: false, allowEdge: false, highlight: true, connectionPoint: bodyConnectionPoint, router: { name: 'manhattan', args: { padding: 8, step: 8, perpendicular: false } }, connector: { name: 'rounded', args: { radius: 12 } }, createEdge: () => new Shape.Edge(makeEdge({ source: '', target: '' }, edgeDefaultsRef.current)) } })
    graph.use(new Selection({ enabled: true, multiple: true, rubberband: true, rubberEdge: true, strict: true, movable: true, modifiers: null, multipleSelectionModifiers: ['shift', 'ctrl', 'meta'], showNodeSelectionBox: false })); graph.use(new Transform({ resizing: { enabled: true, minWidth: 20, minHeight: 20, orthogonal: true, preserveAspectRatio: node => node.getData<NodeData>().diagramShape === 'circle' || node.getData<NodeData>().aspectRatioLocked }, rotating: { enabled: true, grid: 1 } })); graph.use(new Snapline({ enabled: true, sharp: true })); graph.use(new History({ enabled: true, beforeAddCommand: (_event, args) => !args || (!("options" in args && args.options?.ignoreHistory) && !("key" in args && args.key === 'tools')) })); graph.use(new Clipboard({ enabled: true, useLocalStorage: false })); graph.use(new Keyboard({ enabled: true, global: true, guard: event => { const target = event.target as HTMLElement | null; const editable = target?.closest('input, textarea, select, [contenteditable="true"]'); return !editable?.closest('.sk-diagram-dialog') } })); graph.use(new MiniMap({ container: minimapRef.current, width: 168, height: 106, padding: 8 })); graph.use(new Export())
    graph.on('scale', ({ sx }) => setZoomPercent(Math.round(sx * 100)))
    graph.on('translate', () => { syncPaper(graph); scheduleRefresh() })
    graph.on('scale', () => { syncPaper(graph); scheduleRefresh() })
    graph.on('node:change:position', scheduleRefresh)
    graph.on('node:change:angle', scheduleRefresh)
    graph.on('history:change', scheduleRefresh)
    let groupTransform: { id: string; geometry: ReturnType<typeof captureDiagramGroup> } | null = null
    graph.on('node:resize', ({ node }) => { if (node.getChildren()?.length) groupTransform = { id: node.id, geometry: captureDiagramGroup(node) } })
    graph.on('node:resizing', ({ node }) => { if (groupTransform?.id === node.id) transformDiagramGroup(node, groupTransform.geometry, 'resize') })
    graph.on('node:rotate', ({ node }) => { if (node.getChildren()?.length) groupTransform = { id: node.id, geometry: captureDiagramGroup(node) } })
    graph.on('node:rotating', ({ node }) => { if (groupTransform?.id === node.id) transformDiagramGroup(node, groupTransform.geometry, 'rotate') })
    graph.on('node:resized', () => { groupTransform = null }); graph.on('node:rotated', () => { groupTransform = null })
    graph.on('node:change:size', ({ node }) => {
      if (node.getData<NodeData>().diagramShape === 'block-arrow') node.attr(nodeAttrs(node.getData<NodeData>(), node.size()), { ignoreHistory: true })
      setRevision(value => value + 1)
    })
    graph.fromJSON({ nodes: element.nodes.map(node => makeNode(node.shape || 'process', node.x, node.y, node)), edges: element.edges.map(edge => makeEdge(edge)) }); requestAnimationFrame(() => {
      if (graphRef.current !== graph) return
      const view = settingsRef.current.view
      if (view && [view.zoom, view.x, view.y].every(Number.isFinite)) { graph.zoomTo(Math.min(4, Math.max(.1, view.zoom))); graph.centerPoint(view.x, view.y) }
      else if (graph.getCells().length) fitCanvas(graph)
      else graph.translate(Math.max(32, ((canvasRef.current?.clientWidth || 900) - 827) / 2), 32)
      syncPaper(graph); canvasRef.current?.focus({ preventScroll: true })
    })
    graph.getEdges().forEach(edge => applyEdgeGeometry(edge, edge.getData<EdgeData>()))
    restoreDiagramParents(graph)
    graph.cleanHistory()
    graph.on('edge:connected', ({ edge }) => applyEdgeGeometry(edge, edge.getData<EdgeData>(), false, true))
    graph.on('edge:added', ({ edge }) => applyEdgeGeometry(edge, edge.getData<EdgeData>(), false, true))
    graph.on('node:added', () => graph.getEdges().forEach(edge => { clearEdgeTools(edge); applyEdgeGeometry(edge, edge.getData<EdgeData>(), false, true) }))
    const refreshHistory = () => {
      graph.getEdges().forEach(edge => { clearEdgeTools(edge); applyEdgeGeometry(edge, edge.getData<EdgeData>(), false, true) })
      requestAnimationFrame(() => graph.getSelectedCells().filter(cell => cell.isEdge()).forEach(cell => prepareEdgeTools(graph, cell as Edge)))
      setRevision(value => value + 1)
    }
    graph.on('history:undo', refreshHistory); graph.on('history:redo', refreshHistory)
    graph.on('edge:change:labels', ({ edge, options }) => {
      if (!options.ui) return
      const position = edge.getLabelAt(0)?.position
      const distance = typeof position === 'number' ? position : position?.distance
      if (typeof distance === 'number') edge.setData({ labelPosition: distance })
    })
    graph.on('edge:change:vertices', ({ edge, options }) => {
      // Preserve the active tool ID: rebuilding its handle during a drag removes
      // the document mouseup listener before it can restore canvas events.
      if (options.ui) {
        const draft = routeDrafts.get(edge); if (draft) draft.dirty = true
        edge.setData({ routeMode: 'manual' }, options); edge.setRouter('normal', {}, options)
      }
    })
    const showEdgeTools = (edge: Edge) => {
      graph.getPlugin<Transform>('transform')?.clearWidgets()
      graph.getEdges().filter(item => item !== edge).forEach(clearEdgeTools)
      prepareEdgeTools(graph, edge)
    }
    const selectEdge = (edge: Edge, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => { if (event.shiftKey || event.ctrlKey || event.metaKey) graph.select(edge); else if (!graph.isSelected(edge)) graph.resetSelection(edge); showEdgeTools(edge); setSelected({ kind: 'edge', id: edge.id }); setRevision(value => value + 1) }
    let draggingGroup: { root: Node; wasSelected: boolean; shift: boolean; x: number; y: number } | null = null
    graph.on('node:mousedown', ({ node, e }) => {
      graph.getEdges().forEach(clearEdgeTools)
      const parents = node.getAncestors().filter(parent => parent.isNode()) as Node[]
      if (!parents.length) return
      if (e.ctrlKey || e.metaKey) { graph.resetSelection(node); return }
      const root = parents.at(-1)!, position = root.position()
      draggingGroup = { root, wasSelected: graph.isSelected(root), shift: e.shiftKey, ...position }
      if (e.shiftKey) graph.select([root, node]); else graph.resetSelection([root, node])
    })
    graph.on('node:mouseup', () => {
      if (!draggingGroup) return
      const { root, wasSelected, shift, x, y } = draggingGroup
      const roots = diagramSelectionRoots(graph.getSelectedCells())
      graph.resetSelection(shift && wasSelected && root.position().x === x && root.position().y === y ? roots.filter(cell => cell !== root) : roots)
      draggingGroup = null
    })
    graph.on('node:click', ({ node, e }) => {
      graph.getEdges().forEach(clearEdgeTools); setContextMenu(null); setQuickMenu(null); setTextEditor(null)
      const root = e.ctrlKey || e.metaKey ? node : node.getAncestors().filter(parent => parent.isNode()).at(-1) || node
      // Group mouseup already applies Shift toggling; selecting it again here
      // would immediately undo the user's deselection.
      if ((root !== node || node.getParentId()) && !e.shiftKey) graph.resetSelection(root)
      setSelected(graph.isSelected(root) ? { kind: 'node', id: root.id } : null)
    })
    editRef.current = (cell, text) => {
      const data = cell.getData<NodeData & EdgeData>(), center = graph.localToClient(cell.getBBox().getCenter())
      const value = text ?? (data.details !== undefined ? `${data.label}\n${data.details}` : data.label || '')
      setTextEditor({ kind: cell.isNode() ? 'node' : 'edge', id: cell.id, x: center.x, y: center.y, width: cell.isNode() ? Math.max(40, Math.min(600, (cell as Node).size().width * graph.zoom() - 12)) : 140, fontSize: (data.fontSize || 12) * graph.zoom(), value })
    }
    graph.on('node:dblclick', ({ node, e }) => { e.stopPropagation(); graph.resetSelection(node); setSelected({ kind: 'node', id: node.id }); editRef.current(node) })
    graph.on('blank:dblclick', ({ e }) => {
      const point = graph.clientToLocal(e.clientX, e.clientY), node = graph.addNode(makeNode('text', point.x - 60, point.y - 15, { width: 120, height: 30, label: '' }, t))
      graph.resetSelection(node); editRef.current(node)
    })
    graph.on('edge:click', ({ edge, e }) => { setContextMenu(null); selectEdge(edge, e) })
    graph.on('edge:dblclick', ({ edge, e }) => {
      e.stopPropagation(); selectEdge(edge, e)
      const data = edge.getData<EdgeData>()
      setTextEditor({ kind: 'edge', id: edge.id, x: e.clientX, y: e.clientY, width: 160, fontSize: data?.fontSize || 12, value: data?.label || '' })
    })
    graph.on('blank:click', () => { setQuickMenu(null); graph.getEdges().forEach(clearEdgeTools); setContextMenu(null); setTextEditor(null); setSelected(null) })
    graph.on('selection:changed', ({ selected: cells }) => { setQuickMenu(null);
      graph.getEdges().filter(edge => !graph.isSelected(edge)).forEach(clearEdgeTools)
      setRevision(value => value + 1)
      if (cells.length === 1) {
        if (cells[0].isEdge()) showEdgeTools(cells[0] as Edge)
        else graph.getPlugin<Transform>('transform')?.createWidget(cells[0] as Node)
        setSelected({ kind: cells[0].isNode() ? 'node' : 'edge', id: cells[0].id })
      } else { graph.getPlugin<Transform>('transform')?.clearWidgets(); setSelected(null) }
    })
    graph.on('cell:removed', ({ cell }) => setSelected(value => value?.id === cell.id ? null : value))
    graph.on('cell:contextmenu', ({ cell, e }) => {
      e.preventDefault(); setTextEditor(null)
      if (!graph.isSelected(cell)) graph.resetSelection(cell)
      setSelected({ kind: cell.isNode() ? 'node' : 'edge', id: cell.id })
      setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 154), y: Math.min(e.clientY, window.innerHeight - 148) })
      setRevision(value => value + 1)
    })
    const deleteSelected = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editable = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (editable?.closest('.sk-diagram-dialog')) return
      if (target?.closest('[role=menu], .sk-draw-library-modal')) return
      if (target?.closest('button, a, summary') && ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && ['c', 'x', 'v'].includes(key)) { graph.copy(graph.getSelectedCells(), { deep: true }); return }
      if (mod && ['a', 'z', 'y', 'd'].includes(key)) {
        event.preventDefault(); event.stopPropagation()
        if (key === 'a') graph.resetSelection(graph.getCells().filter(cell => !cell.getParentId()))
        if (key === 'c' || key === 'x' || key === 'd') graph.copy(graph.getSelectedCells(), { deep: true })
        if (key === 'x') graph.batchUpdate('cut', () => removeCellsPreservingEdges(graph, graph.getSelectedCells().map(cell => cell.id)))
        if (key === 'v' || key === 'd') graph.resetSelection(graph.paste({ offset: 28 }))
        if (key === 'z') { if (event.shiftKey) graph.redo(); else graph.undo() }
        if (key === 'y') graph.redo()
        setRevision(value => value + 1)
        return
      }
      if (mod && key === 's') { event.preventDefault(); event.stopPropagation(); saveRef.current(); return }
      if (mod && key === 'g') { event.preventDefault(); commandRef.current(event.shiftKey ? 'ungroup' : 'group'); return }
      if (event.code === 'Space') { event.preventDefault(); spaceDown.current = true; canvasRef.current?.classList.add('is-panning'); return }
      const currentCell = graph.getSelectedCells().length === 1 ? graph.getSelectedCells()[0] : null
      if (currentCell && (event.key === 'F2' || event.key === 'Enter')) { event.preventDefault(); editRef.current(currentCell); return }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && graph.getSelectedCells().length) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const selected = graph.getSelectedCells(), ids = new Set(selected.map(cell => cell.id))
        graph.batchUpdate('nudge', () => selected.filter(cell => !cell.getAncestors().some(parent => ids.has(parent.id))).forEach(cell => cell.translate(dx, dy)))
        scheduleRefresh(); return
      }
      if (currentCell && !mod && !event.altKey && event.key.length === 1 && !event.isComposing) { event.preventDefault(); editRef.current(currentCell, event.key); return }
      if (event.key === 'Escape') { graph.cleanSelection(); setTextEditor(null); setSelected(null); return }
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
    const stopSpacePan = (event?: KeyboardEvent) => { if (!event || event.code === 'Space') { spaceDown.current = false; canvasRef.current?.classList.remove('is-panning') } }
    document.addEventListener('keyup', stopSpacePan); const stopBlurPan = () => stopSpacePan(); window.addEventListener('blur', stopBlurPan)
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
            if (item.shape === 'edge') return graph.createEdge(makeEdge({ ...item.data, id: item.id, parentId: item.parent, source: item.source?.cell || '', target: item.target?.cell || '', sourcePort: item.source?.port, targetPort: item.target?.port, sourceAnchor: item.source?.anchor, targetAnchor: item.target?.anchor, sourcePoint: item.source, targetPoint: item.target, routeMode: item.data?.routeMode, vertices: item.vertices }))
            if (!SHAPES.some(shape => shape.type === item.data?.diagramShape)) throw new Error('Unsupported shape')
            return graph.createNode(makeNode(item.data.diagramShape, item.position?.x || 0, item.position?.y || 0, { ...item.data, id: item.id, width: item.size?.width, height: item.size?.height, angle: item.angle, parentId: item.parent }, t))
          })
          const copies = cloneDiagramCells(cells)
          graph.batchUpdate('paste', () => { graph.addCell(copies); restoreDiagramParents(graph) })
          graph.resetSelection(diagramSelectionRoots(copies))
        } catch { return }
      } else {
        const selected = graph.model.getSubGraph(graph.getSelectedCells(), { deep: true })
        if (!selected.length) return
        event.clipboardData.setData(mime, JSON.stringify(selected.map(cell => { const json = cell.toJSON(); delete json.tools; return json })))
        event.clipboardData.setData('text/plain', selected.map(cell => cell.getData()?.label || '').join('\n'))
        graph.copy(selected, { deep: true })
        if (event.type === 'cut') graph.batchUpdate('cut', () => removeCellsPreservingEdges(graph, selected.map(cell => cell.id)))
      }
      event.preventDefault(); event.stopPropagation(); setRevision(value => value + 1)
    }
    for (const type of ['copy', 'cut', 'paste']) document.addEventListener(type, clipboardEvent as EventListener, true)
    graphRef.current = graph; setRevision(value => value + 1)
    return () => { if (quickDrag.current?.edge) graph.stopBatch('draw-connector'); quickDrag.current = null; document.removeEventListener('keydown', deleteSelected, true); document.removeEventListener('keyup', stopSpacePan); window.removeEventListener('blur', stopBlurPan); if (refreshFrame.current !== null) cancelAnimationFrame(refreshFrame.current); for (const type of ['copy', 'cut', 'paste']) document.removeEventListener(type, clipboardEvent as EventListener, true); graph.dispose(); graphRef.current = null }
  }, [])
  useEffect(() => {
    const current = graphRef.current; if (!current) return
    const plugin = current.getPlugin<Snapline>('snapline'); if (settings.guides) plugin?.enable(); else plugin?.disable()
    current.setGridSize(settings.gridSize)
    if (!settings.pageView && settings.grid) current.showGrid(); else current.hideGrid()
    syncPaper(current)
  }, [settings])
  useEffect(() => {
    if (!quickMenu) return
    quickMenuRef.current?.querySelector<HTMLElement>('button')?.focus()
    const dismiss = (event: globalThis.PointerEvent) => { if (!quickMenuRef.current?.contains(event.target as globalThis.Node) && !(event.target as HTMLElement).closest('.sk-draw-quick-connect')) setQuickMenu(null) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [quickMenu])
  const graph = graphRef.current; const selectedCells = diagramSelectionRoots(graph?.getSelectedCells() || []); const selectedCount = selectedCells.length; const cell = selectedCount === 1 ? selectedCells[0] : null; const node = cell?.isNode() ? cell as Node : null; const edge = cell?.isEdge() ? cell as Edge : null; const nodeData = node?.getData<NodeData>(); const edgeData = edge?.getData<EdgeData>()
  const refresh = () => setRevision(value => value + 1)
  const insertionPosition = (current: Graph, canvas: HTMLElement, size: { width: number; height: number }) => {
    const rect = canvas.getBoundingClientRect(), origin = current.clientToLocal(rect.left, rect.top)
    const occupied = current.getNodes().filter(node => !['group', 'swimlane', 'text'].includes(node.getData<NodeData>().diagramShape)).map(node => ({ ...node.position(), ...node.size() }))
    return diagramInsertionPosition({ x: origin.x, y: origin.y, width: rect.width / current.zoom(), height: rect.height / current.zoom() }, size, occupied)
  }
  const addShape = (type: DiagramNodeType, position?: { x: number; y: number }, preset?: Partial<DiagramNode>) => {
    const current = graphRef.current, canvas = canvasRef.current
    if (!current || !canvas) return
    const metadata = makeNode(type, 0, 0, { ...defaultNode, label: type === 'text' ? t('ui.textLabel') : '', ...preset }, t)
    const point = position || insertionPosition(current, canvas, metadata)
    const added = current.addNode({ ...metadata, x: point.x, y: point.y })
    current.resetSelection(added); canvas.focus({ preventScroll: true }); setSelected({ kind: 'node', id: added.id }); refresh()
  }

  const insertTemplate = (type: DiagramTemplate) => {
    const current = graphRef.current, canvas = canvasRef.current
    if (!current || !canvas) return
    const template = createDiagramTemplate(type, t)
    const position = insertionPosition(current, canvas, template)
    const added: Cell[] = []
    current.batchUpdate('insert-template', () => {
      template.nodes.forEach(node => added.push(current.addNode(makeNode(node.shape || 'process', node.x + position.x, node.y + position.y, node, t))))
      template.edges.forEach(edge => added.push(current.addEdge(makeEdge(edge))))
    })
    current.resetSelection(added); setSelected(null); refresh()
    fitCanvas(current)
  }
  const addIndependentEdge = (position?: { x: number; y: number }) => { const current = graphRef.current; const container = canvasRef.current; if (!current || !container) return; const empty = position ? undefined : insertionPosition(current, container, { width: 180, height: 24 }); const center = position || { x: empty!.x + 90, y: empty!.y + 12 }; const added = current.addEdge(makeEdge({ source: '', target: '', sourcePoint: { x: center.x - 90, y: center.y }, targetPoint: { x: center.x + 90, y: center.y } }, edgeDefaults)); current.getEdges().forEach(clearEdgeTools); prepareEdgeTools(current, added); current.resetSelection(added); setSelected({ kind: 'edge', id: added.id }); refresh() }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); const current = graphRef.current; if (!current) return; const point = current.clientToLocal(event.clientX, event.clientY); if (event.dataTransfer.getData('application/slate-kit-x6-edge')) { addIndependentEdge(point); return } const type = event.dataTransfer.getData('application/slate-kit-x6') as DiagramNodeType; if (SHAPES.some(item => item.type === type)) { const route = event.dataTransfer.getData('application/slate-kit-x6-arrow-route'); addShape(type, point, { label: '', ...(event.dataTransfer.getData('application/slate-kit-x6-rounded') === 'true' ? { rounded: true } : {}), ...(type === 'block-arrow' && ['elbow', 'step'].includes(route) ? { arrowRoute: route as DiagramArrowRoute } : {}) }) } }
  const remove = () => { const current = graphRef.current; if (!current) return; const ids = [...current.getSelectedCells()].map(item => item.id); current.cleanSelection(); removeCellsPreservingEdges(current, ids); setSelected(null); setContextMenu(null); refresh() }
  const duplicate = () => { const current = graphRef.current; if (!current) return; current.copy(current.getSelectedCells(), { deep: true }); current.resetSelection(current.paste({ offset: 28 })); refresh() }
  const updateNodes = (patch: Partial<NodeData>) => {
    const current = graphRef.current
    if (!current) return
    if (!current.getSelectedCells().some(cell => cell.isNode())) { setDefaultNode(value => ({ ...value, ...patch })); return }
    current.batchUpdate('node-style', () => current.getSelectedCells().filter(item => item.isNode()).forEach(item => {
      const data = { ...item.getData<NodeData>(), ...patch }
      item.replaceData(data); item.attr(nodeAttrs(data, (item as Node).size()))
      if (patch.aspectRatioLocked !== undefined) { current.getPlugin<Transform>('transform')?.clearWidgets(); if (current.getSelectedCells().length === 1) current.getPlugin<Transform>('transform')?.createWidget(item as Node) }
    }))
    refresh()
  }
  const updateEdges = (patch: Partial<EdgeData>) => {
    const current = graphRef.current
    if (!current) return
    current.batchUpdate('edge-style', () => current.getSelectedCells().filter(item => item.isEdge()).forEach(item => {
      const itemEdge = item as Edge, data = { ...(item.getData<EdgeData>() || edgeDefaults), ...patch }
      if (patch.arrow !== undefined) { data.sourceArrow = patch.arrow === 'both' ? 'classic' : 'none'; data.targetArrow = patch.arrow === 'none' ? 'none' : 'classic' }
      if (patch.sourceArrow !== undefined || patch.targetArrow !== undefined) data.arrow = data.targetArrow === 'none' ? 'none' : data.sourceArrow && data.sourceArrow !== 'none' ? 'both' : 'end'
      const hadTools = itemEdge.hasTools()
      clearEdgeTools(itemEdge); item.replaceData(data); applyEdgeAttrs(itemEdge, data); itemEdge.setLabels(edgeLabels(data))
      applyEdgeGeometry(itemEdge, data, patch.lineType !== undefined)
      if (hadTools) requestAnimationFrame(() => prepareEdgeTools(current, itemEdge))
    }))
    refresh()
  }
  const updateNode = (patch: Partial<NodeData>) => {
    const current = graphRef.current
    if (!current) return
    current.batchUpdate('selection-style', () => {
      updateNodes(patch)
      const common: Partial<EdgeData> = {}
      if (patch.color !== undefined) common.color = patch.color
      if (patch.borderWidth !== undefined) common.thickness = patch.borderWidth
      if (patch.lineStyle !== undefined) common.lineStyle = patch.lineStyle
      if (patch.opacity !== undefined) common.opacity = patch.opacity
      if (patch.fontSize !== undefined) common.fontSize = patch.fontSize
      if (patch.fontFamily !== undefined) common.fontFamily = patch.fontFamily
      if (patch.textColor !== undefined) common.textColor = patch.textColor
      if (patch.bold !== undefined) common.bold = patch.bold
      if (patch.italic !== undefined) common.italic = patch.italic
      if (patch.underline !== undefined) common.underline = patch.underline
      if (Object.keys(common).length && current.getSelectedCells().some(cell => cell.isEdge())) updateEdges(common)
    })
  }
  const updateEdge = (patch: Partial<EdgeData>) => updateEdges(patch)
  const updateCommon = (patch: { color?: string; lineStyle?: DiagramLineStyle; thickness?: number; fontSize?: number; opacity?: number }) => { const nodePatch: Partial<NodeData> = {}; if (patch.color !== undefined) nodePatch.color = patch.color; if (patch.lineStyle !== undefined) nodePatch.lineStyle = patch.lineStyle; if (patch.thickness !== undefined) nodePatch.borderWidth = patch.thickness; if (patch.fontSize !== undefined) nodePatch.fontSize = patch.fontSize; if (patch.opacity !== undefined) nodePatch.opacity = patch.opacity; updateNodes(nodePatch); updateEdges(patch) }
  const moveLayer = (action: 'front' | 'forward' | 'backward' | 'back') => { const cells = graphRef.current?.getSelectedCells() || []; cells.forEach(item => { if (action === 'front') item.toFront(); else if (action === 'back') item.toBack(); else item.setZIndex((item.getZIndex() || 0) + (action === 'forward' ? 1 : -1)) }); setContextMenu(null); refresh() }
  const commitText = () => {
    const editing = textEditorRef.current
    if (!editing) return
    const item = graphRef.current?.getCellById(editing.id)
    graphRef.current?.batchUpdate('edit-text', () => {
      if (item?.isNode()) setNodeText(item, editing.value)
      else if (item?.isEdge()) {
        const data = { ...item.getData<EdgeData>(), label: editing.value || undefined }
        item.replaceData(data); item.setLabels(edgeLabels(data))
      }
    })
    setTextEditor(null); refresh()
  }
  const resetEdgePath = () => {
    if (!edge || !graph) return
    graph.batchUpdate('reset-path', () => { clearEdgeTools(edge); applyEdgeGeometry(edge, edge.getData<EdgeData>(), true) })
    requestAnimationFrame(() => prepareEdgeTools(graph, edge)); refresh()
  }
  const arrowGeometry = node && nodeData?.diagramShape === 'block-arrow' ? blockArrowGeometry(node.size(), nodeData) : null
  const arrowHandle = node && arrowGeometry?.handle && graph ? graph.localToClient(new Point(node.position().x + arrowGeometry.handle.x, node.position().y + arrowGeometry.handle.y).rotate(-node.getAngle(), node.getBBox().getCenter())) : null
  const finishArrowDrag = () => {
    if (arrowDrag.current) graphRef.current?.stopBatch('arrow-bend')
    arrowDrag.current = null
  }
  const dragArrowBend = (event: PointerEvent<HTMLButtonElement>) => {
    const current = graphRef.current, id = arrowDrag.current
    if (!current || !id) return
    const item = current.getCellById(id)
    if (!item?.isNode()) return
    const data = item.getData<NodeData>(), point = current.clientToLocal(event.clientX, event.clientY).rotate(item.getAngle(), item.getBBox().getCenter()), position = item.position()
    const next = { ...data, arrowBend: arrowBendFromPoint(item.size(), data.arrowDirection, data.arrowRoute, { x: point.x - position.x, y: point.y - position.y }) }
    item.replaceData(next); item.attr(nodeAttrs(next, item.size())); refresh()
  }
  const handleCanvasMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    // The second press can hit a newly displayed midpoint handle rather than
    // the edge. Capture it before X6 starts dragging the handle.
    if (event.detail !== 2) return
    const target = event.target as globalThis.Element
    const id = target.closest('.x6-edge, .x6-edge-tool-segments')?.getAttribute('data-cell-id')
    const edge = id && graphRef.current?.getCellById(id)
    if (!edge || !edge.isEdge()) return
    event.preventDefault(); event.stopPropagation()
    const data = edge.getData<EdgeData>()
    setTextEditor({ kind: 'edge', id: edge.id, x: event.clientX, y: event.clientY, width: 160, fontSize: data.fontSize || 12, value: data.label || '' })
  }
  const autoLayout = () => {
    const current = graphRef.current; if (!current) return
    const nodes = current.getNodes().filter(node => !node.getParentId())
    const rootId = (id: string) => current.getCellById(id)?.getAncestors().filter(cell => cell.isNode()).at(-1)?.id || id
    const nodeIds = new Set(nodes.map(item => item.id)); const incoming = new Map<string, string[]>(); const outgoing = new Map<string, string[]>()
    nodes.forEach(item => { incoming.set(item.id, []); outgoing.set(item.id, []) })
    current.getEdges().forEach(item => { const source = rootId(item.getSourceCellId()); const target = rootId(item.getTargetCellId()); if (source === target || !nodeIds.has(source) || !nodeIds.has(target)) return; outgoing.get(source)?.push(target); incoming.get(target)?.push(source) })
    const roots = nodes.filter(item => (incoming.get(item.id)?.length || 0) === 0); const queue = [...(roots.length ? roots : nodes.slice(0, 1))]; const depths = new Map<string, number>(queue.map(item => [item.id, 0])); let cursor = 0
    while (cursor < queue.length) { const source = queue[cursor++]; const nextDepth = (depths.get(source.id) || 0) + 1; (outgoing.get(source.id) || []).forEach(targetId => { if (depths.has(targetId)) return; depths.set(targetId, nextDepth); const target = current.getCellById(targetId); if (target?.isNode()) queue.push(target) }) }
    let disconnectedDepth = Math.max(0, ...depths.values()) + 1; nodes.forEach(item => { if (!depths.has(item.id)) depths.set(item.id, disconnectedDepth++) })
    const layers = new Map<number, Node[]>(); nodes.forEach(item => { const depth = depths.get(item.id) || 0; layers.set(depth, [...(layers.get(depth) || []), item]) }); const largestLayer = Math.max(1, ...[...layers.values()].map(items => items.length))
    ;[...layers.entries()].sort(([a], [b]) => a - b).forEach(([depth, items]) => { items.sort((a, b) => { const average = (item: Node) => { const parents = incoming.get(item.id) || []; return parents.length ? parents.reduce((sum, id) => sum + ((current.getCellById(id) as Node | null)?.position().y || 0), 0) / parents.length : item.position().y }; return average(a) - average(b) }); items.forEach((item, index) => { const size = item.size(); item.position(80 + depth * 230, 68 + (index + (largestLayer - items.length) / 2) * 118 - Math.max(0, size.height - 52) / 2, { deep: true }) }) })
    current.getEdges().forEach(item => { if (rootId(item.getSourceCellId()) === rootId(item.getTargetCellId())) return; clearEdgeTools(item); item.setVertices([]); item.removeProp('data/routeMode'); applyEdgeGeometry(item, item.getData<EdgeData>()) })
    requestAnimationFrame(() => fitCanvas(current))
  }
  const save = async () => {
    const current = graphRef.current; if (!current || saving) return
    setSaving(true); setSaveError(null)
    try {
    commitText(); current.getEdges().forEach(clearEdgeTools); current.getNodes().forEach(item => item.removeTools()); current.cleanSelection()
    current.getEdges().forEach(item => applyEdgeGeometry(item, item.getData<EdgeData>() || edgeDefaults))
    // X6 updates routed paths asynchronously. Export only after the live editor has
    // painted twice so the document preview contains exactly the path the user saw.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (graphRef.current !== current) return
    const nodes = current.getNodes().map(serializeDiagramNode)
    const edges = current.getEdges().map(item => { const data = item.getData<EdgeData>() || edgeDefaults; const source = item.getSourceCellId(); const target = item.getTargetCellId(); const sourcePoint = item.getSourcePoint(); const targetPoint = item.getTargetPoint(); return { id: item.id, parentId: item.getParentId(), source, target, sourcePort: item.getSourcePortId(), targetPort: item.getTargetPortId(), sourceAnchor: (item.getSource() as Edge.TerminalCellData).anchor as DiagramEdge['sourceAnchor'], targetAnchor: (item.getTarget() as Edge.TerminalCellData).anchor as DiagramEdge['targetAnchor'], ...(!source ? { sourcePoint: { x: sourcePoint.x, y: sourcePoint.y } } : {}), ...(!target ? { targetPoint: { x: targetPoint.x, y: targetPoint.y } } : {}), label: data.label, lineJoin: data.lineJoin, lineJump: data.lineJump, jumpSize: data.jumpSize, sourceArrowSize: data.sourceArrowSize, targetArrowSize: data.targetArrowSize, sourceOffset: data.sourceOffset, targetOffset: data.targetOffset, sourceArrow: data.sourceArrow, targetArrow: data.targetArrow, arrowSize: data.arrowSize, labelPosition: data.labelPosition, fontFamily: data.fontFamily, textColor: data.textColor, bold: data.bold, italic: data.italic, underline: data.underline, lineType: data.lineType, lineStyle: data.lineStyle, arrow: data.arrow, color: data.color, thickness: data.thickness, fontSize: data.fontSize, opacity: data.opacity, zIndex: item.getZIndex(), routeMode: item.getData()?.routeMode, vertices: data.lineType === 'straight' ? [] : item.getVertices().map(point => ({ x: point.x, y: point.y })) } })
    const box = current.getContentBBox().inflate(28)
    const edgeIds = edges.map(edge => edge.id)
    const rect = canvasRef.current!.getBoundingClientRect(), center = current.clientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2)
    current.toSVG(svg => { if (graphRef.current !== current) return; try { commit(nodes, edges, withoutEditorControls(svg, edgeIds), { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) }, { ...settings, view: { zoom: current.zoom(), x: center.x, y: center.y } }) } catch { setSaveError(t('diagram.saveError')) } finally { setSaving(false) } }, { viewBox: box, preserveDimensions: { width: box.width, height: box.height }, copyStyles: false, serializeImages: true })
    } catch { setSaving(false); setSaveError(t('diagram.saveError')) }
  }
  const quickConnect = (direction: QuickDirection, preset?: Partial<DiagramNode>, connect = true) => {
    const current = graphRef.current
    if (!current || !node) return
    const size = node.size(), position = node.position(), data = serializeDiagramNode(node)
    const destination = { x: position.x + (direction === 'right' ? size.width + 80 : direction === 'left' ? -size.width - 80 : 0), y: position.y + (direction === 'bottom' ? size.height + 80 : direction === 'top' ? -size.height - 80 : 0) }
    const opposite = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[direction]
    current.batchUpdate('quick-connect', () => {
      let clone: Node
      if (node.getChildren()?.length && !preset?.shape) {
        const cells = current.model.cloneSubGraph([node], { deep: true }); clone = cells[node.id] as Node
        current.addCell(Object.values(cells)); clone.position(destination.x, destination.y, { deep: true })
      } else clone = current.addNode(makeNode(preset?.shape || data.shape || 'process', destination.x, destination.y, { ...data, id: createId(), parentId: undefined, ...preset }, t))
      if (connect) current.addEdge(makeEdge({ source: node.id, target: clone.id, sourcePort: `${direction}-2`, targetPort: `${opposite}-2` }, edgeDefaults))
      current.resetSelection(clone)
    }); canvasRef.current?.focus({ preventScroll: true }); refresh()
  }
  const dragQuickConnector = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = quickDrag.current, current = graphRef.current
    if (!drag || !current || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4 && !drag.edge) return
    const point = current.clientToLocal(event.clientX, event.clientY)
    if (!drag.edge) {
      setQuickMenu(null); current.startBatch('draw-connector')
      drag.edge = current.addEdge(makeEdge({ source: drag.source.id, target: '', sourcePort: `${drag.direction}-2`, targetPoint: point }, edgeDefaults))
    }
    const target = [...current.getNodes()].reverse().find(candidate => candidate !== drag.source && !['group', 'swimlane', 'text'].includes(candidate.getData<NodeData>().diagramShape) && candidate.getBBox().bbox(candidate.getAngle()).containsPoint(point))
    if (drag.target !== target) {
      if (drag.target) current.findViewByCell(drag.target)?.removeClass('sk-draw-connection-target')
      drag.target = target; if (target) current.findViewByCell(target)?.addClass('sk-draw-connection-target')
    }
    drag.edge.setTarget(target ? { cell: target.id, connectionPoint: bodyConnectionPoint } : { x: point.x, y: point.y })
  }
  const finishQuickConnector = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = quickDrag.current, current = graphRef.current; quickDrag.current = null
    if (!drag || !current) return
    if (drag.target) current.findViewByCell(drag.target)?.removeClass('sk-draw-connection-target')
    if (drag.edge) {
      if (cancel) current.removeCell(drag.edge)
      else current.resetSelection(drag.edge)
      current.stopBatch('draw-connector')
    } else if (!cancel) {
      if (event.ctrlKey || event.metaKey) quickConnect(drag.direction, undefined, false)
      else if (event.shiftKey) {
        const size = drag.source.size(), position = drag.source.position(), center = { x: position.x + size.width / 2, y: position.y + size.height / 2 }
        const point = { x: center.x + (drag.direction === 'right' ? size.width / 2 + 100 : drag.direction === 'left' ? -size.width / 2 - 100 : 0), y: center.y + (drag.direction === 'bottom' ? size.height / 2 + 100 : drag.direction === 'top' ? -size.height / 2 - 100 : 0) }
        const edge = current.addEdge(makeEdge({ source: drag.source.id, target: '', sourcePort: `${drag.direction}-2`, targetPoint: point }, edgeDefaults)); current.resetSelection(edge)
      } else setQuickMenu({ direction: drag.direction, x: Math.max(10, Math.min(event.clientX + 12, window.innerWidth - 185)), y: Math.max(105, Math.min(event.clientY - 22, window.innerHeight - 190)) })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    refresh()
  }
  const runCommand = (action: DiagramCommand, value?: string | number) => {
    const current = graphRef.current
    if (!current) return
    switch (action) {
      case 'undo': current.undo(); break
      case 'redo': current.redo(); break
      case 'delete': remove(); break
      case 'copy': current.copy(current.getSelectedCells(), { deep: true }); break
      case 'cut': current.copy(current.getSelectedCells(), { deep: true }); current.batchUpdate('cut', remove); break
      case 'paste': current.batchUpdate('paste', () => current.resetSelection(current.paste({ offset: 20 }))); break
      case 'duplicate': duplicate(); break
      case 'select-all': current.resetSelection(current.getCells().filter(cell => !cell.getParentId())); break
      case 'front': case 'back': case 'forward': case 'backward': current.batchUpdate('layer', () => moveLayer(action)); break
      case 'layout': current.batchUpdate('layout', autoLayout); break
      case 'fit': if (current.getCells().length) fitCanvas(current); else { current.zoomTo(1); current.translate(Math.max(24, ((canvasRef.current?.clientWidth || 900) - 827) / 2), 24) } break
      case 'zoom': current.zoomTo(Math.max(.1, Math.min(4, Number(value) || 1))); break
      case 'edge': addIndependentEdge(); break
      case 'text': addShape('text'); break
      case 'edit': if (current.getSelectedCells().length === 1) editRef.current(current.getSelectedCells()[0]); break
      case 'reverse-edge': current.batchUpdate('reverse-edge', () => current.getSelectedCells().filter(cell => cell.isEdge()).forEach(cell => { const item = cell as Edge, source = item.getSource(), target = item.getTarget(); clearEdgeTools(item); item.setSource(target); item.setTarget(source); item.setVertices(item.getVertices().reverse()); applyEdgeGeometry(item, item.getData<EdgeData>()); prepareEdgeTools(current, item) })); break
      case 'align': if (value === 'reset-edge') resetEdgePath(); else alignDiagramNodes(current, value as DiagramAlignment); break
      case 'distribute': distributeDiagramNodes(current, value as 'horizontal' | 'vertical'); break
      case 'default-style': { const first = selectedCells[0]; if (first?.isNode()) { const { label, details, diagramShape, ...style } = first.getData<NodeData>(); setDefaultNode(style) } else if (first?.isEdge()) { const { label, labelPosition, routeMode, ...style } = first.getData<EdgeData & { routeMode?: string }>(); setEdgeDefaults(style) } break }
      case 'clear-default': setDefaultNode({ color: '#000000', fillColor: '#ffffff', textColor: '#000000', borderWidth: 1, fontSize: 12, fontFamily: 'Helvetica', bold: false, italic: false, underline: false, textAlign: 'center' }); setEdgeDefaults({ lineType: 'step', lineStyle: 'solid', arrow: 'end', color: '#000000', thickness: 1, fontSize: 12, opacity: 1 }); break
      case 'group': {
        const nodes = diagramSelectionRoots(current.getSelectedCells()).filter(cell => cell.isNode()) as Node[]
        if (nodes.length < 2) break
        const box = current.getCellsBBox(nodes)!
        current.batchUpdate('group', () => {
          const group = current.addNode(makeNode('group', box.x - 20, box.y - 20, { width: box.width + 40, height: box.height + 40, label: '', color: '#999999', fillColor: 'transparent', borderWidth: 0, zIndex: Math.min(...nodes.map(node => node.getZIndex() || 1)) - 1 }, t))
          const ids = new Set(nodes.flatMap(node => [node.id, ...node.getDescendants({ deep: true }).map(child => child.id)]))
          nodes.forEach(node => group.addChild(node)); current.getEdges().filter(edge => ids.has(edge.getSourceCellId()) && ids.has(edge.getTargetCellId())).forEach(edge => group.addChild(edge)); current.resetSelection(group)
        }); break
      }
      case 'ungroup': if (node?.getChildren()?.length) current.batchUpdate('ungroup', () => { const children = ungroupDiagramNode(node); current.removeCell(node); current.resetSelection(children) }); break
      case 'export': {
        const box = current.getContentBBox().inflate(20)
        current.getEdges().forEach(clearEdgeTools)
        current.toSVG(svg => {
          const url = URL.createObjectURL(new Blob([withoutEditorControls(svg)], { type: 'image/svg+xml' })), link = document.createElement('a')
          link.href = url; link.download = 'diagram.svg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        }, { viewBox: box, copyStyles: false }); break
      }
    }
    canvasRef.current?.focus({ preventScroll: true }); refresh()
  }
  commandRef.current = runCommand; saveRef.current = save
  const commonTypes: DiagramNodeType[] = ['rectangle', 'process', 'text', 'ellipse', 'circle', 'subprocess', 'decision', 'data', 'hexagon', 'triangle', 'database', 'cloud', 'document', 'swimlane', 'cube', 'chevron', 'trapezoid', 'paper-tape', 'note', 'folder', 'callout', 'actor', 'crescent', 'delay', 'display', 'multiple-documents', 'block-arrow', 'server', 'browser', 'star', 'cross', 'group']
  const generalShapes = commonTypes.map(type => ({ ...SHAPES.find(shape => shape.type === type)!, group: 'ui.general', ...(type === 'process' ? { label: 'diagram.roundedRectangle', hint: 'diagram.roundedRectangleHint', preset: { rounded: true } } : {}) }))
  const shapes = [...SHAPES.filter(shape => shape.group !== 'ui.general'), ...generalShapes, ...SHAPES.filter(shape => shape.group === 'ui.general' && shape.preset)]
  const paperSize = diagramPaperSize(settings)
  const pageBounds = diagramPageBounds(paperSize, graph?.getCellsBBox(graph.getCells()))
  const paperStyle = { width: pageBounds.width, height: pageBounds.height, backgroundColor: settings.backgroundColor, '--draw-grid': `${settings.gridSize}px`, '--draw-major-grid': `${settings.gridSize * 5}px`, transform: graph ? `${diagramPageTransform(graph.zoom(), graph.translate())} translate(${pageBounds.x}px, ${pageBounds.y}px)` : undefined } as CSSProperties
  const bounds = node?.getBBox().bbox(node.getAngle())
  const edgePoint = edge && graph ? (graph.findViewByCell(edge) as EdgeView | null)?.getPointAtRatio(.5) || edge.getBBox().getCenter() : null
  const edgeToolbarPoint = edgePoint && graph?.localToClient(edgePoint)
  const canvasBounds = canvasRef.current?.getBoundingClientRect()
  const edgeView = edge && graph?.findViewByCell(edge) as EdgeView | null
  const beforeEdge = edgeView?.getPointAtRatio(.45), afterEdge = edgeView?.getPointAtRatio(.55)
  const edgeIsVertical = beforeEdge && afterEdge && Math.abs(afterEdge.y - beforeEdge.y) > Math.abs(afterEdge.x - beforeEdge.x)
  const quickButtons = bounds && graph && settings.connectionArrows ? (['top', 'right', 'bottom', 'left'] as const).map(direction => {
    const point = graph.localToClient(direction === 'left' ? bounds.x : direction === 'right' ? bounds.right : bounds.center.x, direction === 'top' ? bounds.y : direction === 'bottom' ? bounds.bottom : bounds.center.y)
    const canvasBox = canvasRef.current?.getBoundingClientRect()
    if (canvasBox && (point.x < canvasBox.left + 35 || point.x > canvasBox.right - 35 || point.y < canvasBox.top + 35 || point.y > canvasBox.bottom - 35)) return null
    return <button key={direction} className={`sk-draw-quick-connect is-${direction}`} aria-label={t(`diagram.quickConnect.${direction}`)} title={t('diagram.quickConnectHint')} style={{ left: point.x, top: point.y }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); quickDrag.current = { source: node!, direction, x: event.clientX, y: event.clientY } }}
      onPointerMove={dragQuickConnector} onPointerUp={event => finishQuickConnector(event)} onPointerCancel={event => finishQuickConnector(event, true)}
      onClick={event => { if (event.detail === 0) setQuickMenu({ direction, x: Math.min(point.x + 12, window.innerWidth - 185), y: Math.max(105, Math.min(point.y, window.innerHeight - 190)) }) }}
    ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 23V10H3L12 1L21 10H15V23Z" /></svg></button>
  }) : null
  return <DiagramWorkspace graph={graph} node={node} edge={edge} nodeData={nodeData} edgeData={edgeData} defaultNode={defaultNode} edgeDefaults={edgeDefaults} revision={revision} zoom={zoomPercent} settings={settings} changeSettings={changeSettings} shapes={shapes} presets={STYLE_PRESETS} addShape={(type, preset, connect) => { if (connect && node) quickConnect('right', { ...preset, shape: type, label: '' }); else addShape(type, undefined, preset) }} insertTemplate={insertTemplate} updateNode={updateNode} updateEdge={updateEdge} changeEdgeDefaults={patch => setEdgeDefaults(value => ({ ...value, ...patch }))} command={runCommand} save={save} close={close} saving={saving} error={saveError} dirty={settingsDirty || Boolean(graph?.canUndo())} pan={pan} setPan={setPan}>
    <div className={`sk-x6-stage ${pan ? 'is-pan-tool' : ''}`} style={{ background: settings.pageView ? '#ececec' : settings.backgroundColor }} onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
      <div ref={paperRef} data-page-x={pageBounds.x} data-page-y={pageBounds.y} className={`sk-draw-paper ${settings.grid ? 'has-grid' : ''}`} hidden={!settings.pageView} style={paperStyle} />
      <div ref={canvasRef} className={`sk-x6-canvas ${pan ? 'is-pan-tool' : ''}`} tabIndex={0} onMouseDownCapture={handleCanvasMouseDown} onMouseDown={() => canvasRef.current?.focus({ preventScroll: true })}
        onClickCapture={event => {
          const rotation = rotatePress.current; rotatePress.current = null
          if (rotation && !rotation.moved) { event.stopPropagation(); graphRef.current?.batchUpdate('rotate', () => rotateDiagramNode(rotation.node, (rotation.angle + 90) % 360)) }
        }}
        onPointerDownCapture={event => {
          if ((event.target as HTMLElement).closest('.x6-widget-transform-rotate') && node) rotatePress.current = { node, angle: node.getAngle(), x: event.clientX, y: event.clientY, moved: false }
          if (!pan && !spaceDown.current && event.button !== 1) return
          const current = graphRef.current; if (!current) return
          event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
          panDrag.current = { x: event.clientX, y: event.clientY, ...current.translate() }; event.currentTarget.classList.add('is-panning')
        }}
        onPointerMoveCapture={event => { if (rotatePress.current && Math.hypot(event.clientX - rotatePress.current.x, event.clientY - rotatePress.current.y) > 3) rotatePress.current.moved = true; const drag = panDrag.current; if (!drag) return; event.preventDefault(); event.stopPropagation(); graphRef.current?.translate(drag.tx + event.clientX - drag.x, drag.ty + event.clientY - drag.y) }}
        onPointerUpCapture={event => { if (!panDrag.current) return; event.stopPropagation(); panDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); event.currentTarget.classList.remove('is-panning') }}
        onPointerCancel={() => { panDrag.current = null; canvasRef.current?.classList.remove('is-panning') }} />
      <div ref={minimapRef} className="sk-x6-minimap" />
    </div>
    {quickButtons}
    {edge && edgeToolbarPoint && canvasBounds && !textEditor && <div className="sk-draw-edge-toolbar" role="toolbar" aria-label={t('diagram.connectorActions')} style={{ left: Math.max(canvasBounds.left + 58, Math.min(canvasBounds.right - 58, edgeToolbarPoint.x + (edgeIsVertical ? edgeToolbarPoint.x + 132 < canvasBounds.right ? 74 : -74 : 0))), top: Math.max(canvasBounds.top + 10, Math.min(canvasBounds.bottom - 44, edgeToolbarPoint.y - (edgeIsVertical ? 14 : 44))) }}>
      {(['straight', 'step', 'smoothstep'] as const).map(type => <button key={type} aria-label={t(type === 'step' ? 'ui.orthogonal' : type === 'smoothstep' ? 'ui.roundedEdge' : 'ui.straight')} title={t(type === 'step' ? 'ui.orthogonal' : type === 'smoothstep' ? 'ui.roundedEdge' : 'ui.straight')} aria-pressed={edgeData?.lineType === type} onClick={() => updateEdge({ lineType: type })}><DiagramRouteIcon type={type} /></button>)}<button aria-label={t('diagram.reverseEdge')} title={t('diagram.reverseEdge')} onClick={() => runCommand('reverse-edge')}><ArrowRight size={16} style={{ transform: 'scaleX(-1)' }} /></button>
    </div>}
    {quickMenu && node && <div ref={quickMenuRef} className="sk-draw-quick-picker" role="menu" aria-label={t('diagram.chooseConnectedShape')} style={{ left: quickMenu.x, top: quickMenu.y }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { setQuickMenu(null); canvasRef.current?.focus(); return }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')), index = items.indexOf(document.activeElement as HTMLButtonElement), delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -4 : 4
      items[(index + delta + items.length) % items.length]?.focus()
    }}><button role="menuitem" title={t('diagram.cloneCurrentShape')} aria-label={t('diagram.cloneCurrentShape')} onClick={() => quickConnect(quickMenu.direction)}><DiagramShapeIcon type={nodeData?.diagramShape || 'rectangle'} /></button>{(['rectangle', 'process', 'ellipse', 'decision', 'data', 'hexagon', 'triangle', 'database', 'cloud', 'document', 'note'] as const).map(type => <button role="menuitem" key={type} aria-label={t(SHAPES.find(shape => shape.type === type)!.label)} title={t(SHAPES.find(shape => shape.type === type)!.label)} onClick={() => quickConnect(quickMenu.direction, { shape: type, label: '' })}><DiagramShapeIcon type={type} /></button>)}</div>}
    {arrowHandle && node && <button className="sk-arrow-bend-handle" aria-label={t('diagram.dragArrowBend')} title={t('diagram.arrowBendHint')} style={{ left: arrowHandle.x, top: arrowHandle.y }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); graphRef.current?.startBatch('arrow-bend'); arrowDrag.current = node.id }} onPointerMove={dragArrowBend} onPointerUp={finishArrowDrag} onPointerCancel={finishArrowDrag} />}
    {contextMenu && <div className="sk-flow-context-menu sk-draw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={event => event.preventDefault()}><button onClick={() => runCommand('edit')}>{t('diagram.editLabel')}<kbd>F2</kbd></button><button onClick={() => { duplicate(); setContextMenu(null) }}>{t('diagram.duplicate')}<kbd>⌘/Ctrl+D</kbd></button><button onClick={remove}>{t('ui.delete')}<kbd>Delete</kbd></button><hr /><button onClick={() => moveLayer('front')}>{t('ui.bringToFront')}</button><button onClick={() => moveLayer('back')}>{t('ui.sendToBack')}</button><hr /><button onClick={() => { runCommand(selectedCount > 1 ? 'group' : 'ungroup'); setContextMenu(null) }}>{t(selectedCount > 1 ? 'diagram.group' : 'diagram.ungroup')}</button></div>}
    {textEditor && <textarea key={`${textEditor.kind}:${textEditor.id}`} className={`sk-diagram-inline-editor sk-draw-inline-editor is-${textEditor.kind}`} autoFocus rows={Math.max(1, textEditor.value.split('\n').length)} value={textEditor.value} style={{ width: textEditor.width, fontSize: textEditor.fontSize, left: textEditor.x, top: textEditor.y, fontFamily: nodeData?.fontFamily || 'Helvetica', fontWeight: nodeData?.bold ? 700 : 400, fontStyle: nodeData?.italic ? 'italic' : 'normal', color: nodeData?.textColor || '#000000', textAlign: nodeData?.textAlign || 'center' }} aria-label={t(textEditor.kind === 'edge' ? 'ui.edgeText' : 'diagram.nodeText')} onMouseDown={event => event.stopPropagation()} onChange={event => setTextEditor({ ...textEditor, value: event.target.value })} onBlur={commitText} onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { event.preventDefault(); setTextEditor(null) } }} />}
  </DiagramWorkspace>
}

export function DiagramBlock({ element }: { element: FlowchartElement }) {
  const { t } = useEditorI18n()

  const readOnly = useReadOnly(); const editor = useSlateStatic(); const selected = useSelected(); const [open, setOpen] = useState(false); const [viewing, setViewing] = useState(false); const [downloadMenu, setDownloadMenu] = useState<{ x: number; y: number } | null>(null); const resizeStart = useRef({ x: 0, width: 0 }); const [resizing, setResizing] = useState(false)
  const [previewSvg, setPreviewSvg] = useState(() => element.previewVersion === FLOW_PREVIEW_VERSION ? withoutEditorControls(element.previewSvg || '') : ''); const [contentSize, setContentSize] = useState({ width: element.contentWidth || 680, height: element.contentHeight || 300 })
  const width = element.width || Math.min(680, contentSize.width); const aspectRatio = contentSize.width / Math.max(1, contentSize.height)
  useEffect(() => {
    if (element.previewSvg && element.previewVersion === FLOW_PREVIEW_VERSION) { setPreviewSvg(withoutEditorControls(element.previewSvg)); setContentSize({ width: element.contentWidth || 680, height: element.contentHeight || 300 }); return }
    const container = document.createElement('div'); container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1200px;height:800px'; document.body.appendChild(container)
    const graph = new Graph({ container, width: 1200, height: 800, async: true, magnetThreshold: 2, background: { color: '#fff' }, grid: { visible: true, type: 'mesh', size: 16, args: { color: '#d9e2f2', thickness: 1 } } }); graph.use(new Export())
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
      graph.getEdges().forEach(edge => applyEdgeGeometry(edge, edge.getData<EdgeData>()))
    }
    populate()
    const fallback = window.setTimeout(exportPreview, 300)
    return () => { disposed = true; window.clearTimeout(fallback); graph.dispose(); container.remove() }
  }, [element.previewSvg, element.previewVersion, element.nodes, element.edges, element.type, element.contentWidth, element.contentHeight])
  const commit = useCallback((nodes: DiagramNode[], edges: DiagramEdge[], svg: string, size: { width: number; height: number }, canvasSettings: DiagramCanvasSettings) => { const preview = withoutEditorControls(svg); Transforms.setNodes(editor, { nodes, edges, canvasSettings, previewSvg: preview, previewVersion: FLOW_PREVIEW_VERSION, contentWidth: size.width, contentHeight: size.height, aspectRatio: size.width / size.height }, { at: DOMEditor.findPath(editor, element) }); setPreviewSvg(preview); setContentSize(size); setOpen(false) }, [editor, element])
  const resize = (event: PointerEvent<HTMLButtonElement>) => { if (readOnly || !resizing) return; const next = Math.max(260, Math.min(960, resizeStart.current.width + event.clientX - resizeStart.current.x)); Transforms.setNodes(editor, { width: Math.round(next) }, { at: DOMEditor.findPath(editor, element) }) }
  const selectImage = (event: { preventDefault(): void }) => {
    event.preventDefault()
    if (readOnly) return
    Transforms.select(editor, DOMEditor.findPath(editor, element)); DOMEditor.focus(editor)
  }
  const openEditor = () => { if (readOnly) return; Transforms.deselect(editor); setOpen(true) }
  const previewUrl = previewSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}` : ''
  return <><figure className={`sk-diagram-figure ${selected ? 'is-selected' : ''}`} contentEditable={false} style={{ width, aspectRatio, marginLeft: element.align === 'center' || element.align === 'right' ? 'auto' : 0, marginRight: element.align === 'center' ? 'auto' : 0 }} onMouseDown={selectImage}><div className="sk-diagram-preview" role="img" aria-label={t("ui.flowchartPreview")} title={t(readOnly ? 'media.clickToPreview' : 'media.clickToSelectThenPreview')} onClick={event => { if (previewUrl && shouldOpenMediaPreview(readOnly, false, event)) setViewing(true) }} onContextMenu={event => { if (!previewUrl) return; event.preventDefault(); setDownloadMenu({ x: event.clientX, y: event.clientY }) }}>{previewSvg ? <img src={previewUrl} alt={t("ui.flowchartPreview")} /> : <span className="sk-diagram-loading">{t("ui.generatingPreview")}</span>}</div><div className="sk-media-corner-actions"><button aria-label={t("ui.previewFlowchart")} title={t("ui.preview")} onMouseDown={event => event.stopPropagation()} onClick={() => previewUrl && setViewing(true)}><Maximize2 size={15} /></button><button hidden={readOnly} aria-label={t("ui.editFlowchart")} title={t("ui.editFlowchart")} onMouseDown={event => event.stopPropagation()} onClick={openEditor}><Pencil size={15} /></button></div><button hidden={readOnly} className="sk-diagram-resizer" aria-label={t("ui.resizeDiagramProportionally")} onClick={event => event.stopPropagation()} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; setResizing(true) }} onPointerMove={resize} onPointerUp={() => setResizing(false)} /></figure>{downloadMenu && previewUrl && <MediaDownloadMenu src={previewUrl} downloadName={t("diagram.downloadFilename")} position={downloadMenu} close={() => setDownloadMenu(null)} />}{viewing && previewUrl && <MediaLightbox src={previewUrl} alt={t("ui.flowchart")} downloadName={t("diagram.downloadFilename")} close={() => setViewing(false)} />}{!readOnly && open && typeof document !== 'undefined' && createPortal(<div className="sk-diagram-modal" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }} contentEditable={false} onMouseDown={event => event.stopPropagation()}><X6Editor element={element} close={() => setOpen(false)} commit={commit} /></div>, document.body)}</>
}
