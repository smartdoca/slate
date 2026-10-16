import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Graph, Node, Edge } from '@antv/x6'
import { AlignCenter, AlignHorizontalDistributeCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bold, BringToFront, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, CornerDownRight, Download, Grid3X3, Hand, Italic, Layers, List, Maximize2, MousePointer2, Network, PaintBucket, PanelLeft, PanelRight, Pencil, Plus, Redo2, Save, Search, SendToBack, Square, Trash2, Type, Underline, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEditorI18n } from '../i18n'
import { diagramPaths } from '../diagramShapes'
import { blockArrowGeometry } from '../diagramArrows'
import { diagramTemplates, type DiagramTemplate } from '../diagramTemplates'
import type { DiagramCanvasSettings, DiagramNode, DiagramNodeType, DiagramMarker, DiagramEdgeType } from '../types'
import type { NodeData, EdgeData } from './DiagramBlock'
import { resizeDiagramNode, rotateDiagramNode, diagramSelectionRoots } from '../diagramWorkspace'
import { DiagramArrowSettings } from './DiagramArrowSettings'

export type DiagramShapeEntry = { group: string; type: DiagramNodeType; label: string; hint: string; preset?: Partial<DiagramNode> }
export type DiagramCommand = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete' | 'select-all' | 'front' | 'back' | 'forward' | 'backward' | 'layout' | 'fit' | 'zoom' | 'edge' | 'text' | 'export' | 'edit' | 'group' | 'ungroup' | 'align' | 'distribute' | 'default-style' | 'clear-default' | 'reverse-edge'
type WorkspaceProps = {
  graph: Graph | null; node: Node | null; edge: Edge | null; revision: number; zoom: number
  nodeData?: NodeData; edgeData?: EdgeData; defaultNode: Partial<NodeData>; edgeDefaults: EdgeData
  settings: DiagramCanvasSettings; changeSettings(patch: Partial<DiagramCanvasSettings>): void
  shapes: DiagramShapeEntry[]; presets: Array<{ name: string; color: string; fillColor: string; textColor: string }>
  addShape(type: DiagramNodeType, preset?: Partial<DiagramNode>, connect?: boolean): void
  insertTemplate(type: DiagramTemplate): void; updateNode(patch: Partial<NodeData>): void; updateEdge(patch: Partial<EdgeData>): void
  changeEdgeDefaults(patch: Partial<EdgeData>): void; command(action: DiagramCommand, value?: string | number): void
  save(): void; close(): void; saving: boolean; dirty: boolean; error?: string | null; children: ReactNode
  pan: boolean; setPan(value: boolean): void
}

export function DiagramShapeIcon({ type, preset }: { type: DiagramNodeType; preset?: Partial<DiagramNode> }) {
  const polygons: Partial<Record<DiagramNodeType, string>> = { decision: '50,0 100,30 50,60 0,30', data: '20,0 100,0 80,60 0,60', 'manual-input': '0,14 100,0 100,60 0,60', preparation: '20,0 80,0 100,30 80,60 20,60 0,30', display: '20,0 80,0 100,30 80,60 20,60 0,30', storage: '20,0 100,0 80,60 0,60', 'off-page-connector': '0,0 100,0 100,40 50,60 0,40', merge: '0,0 100,30 0,60', card: '0,15 15,0 100,0 100,60 0,60' }
  const round = ['circle', 'ellipse', 'terminator', 'use-case', 'state', 'activity', 'connector', 'mind-topic'].includes(type)
  return <svg viewBox="-4 -5 108 70" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="miter">
    {['class', 'interface', 'object'].includes(type) ? <><rect width="100" height="60" /><path d="M0 18H100M0 40H100" /></> : ['boundary', 'control', 'entity'].includes(type) ? <><ellipse cx="52" cy="28" rx="24" ry="24" /><path d={type === 'boundary' ? 'M4 0V60M4 28H28' : type === 'entity' ? 'M20 58H83' : 'M40 5L49 -2L51 11'} /></> : type === 'block-arrow' ? <path d={blockArrowGeometry({ width: 100, height: 60 }, { ...preset, arrowThickness: 12, arrowHeadSize: 25 }).path} />
      : diagramPaths[type] ? <path d={diagramPaths[type]} />
        : polygons[type] ? <polygon points={polygons[type]} />
          : round ? <ellipse cx="50" cy="30" rx={type === 'circle' || type === 'connector' ? 29 : 49} ry="29" />
            : type === 'text' ? <text x="50" y="37" stroke="none" fill="currentColor" textAnchor="middle" fontSize="22" fontFamily="Helvetica, Arial">Text</text>
              : <rect x="0" y="0" width="100" height="60" rx={preset?.rounded ? 8 : type === 'process' || type === 'rectangle' ? 0 : 7} />}
  </svg>
}

function NumberField({ label, value, min, max, step = 1, unit, change, disabled }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; disabled?: boolean; change(value: number): void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100)), ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setDraft(String(Math.round(value * 100) / 100)) }, [value])
  const commit = () => {
    const number = Number(draft)
    if (draft.trim() && Number.isFinite(number)) change(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number)))
    else setDraft(String(value))
  }
  return <label className="sk-draw-number"><input ref={ref} type="number" disabled={disabled} aria-label={label} min={min} max={max} step={step} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />{unit && <span>{unit}</span>}</label>
}

function FormatSection({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="sk-draw-format-section" open={open}><summary>{title}</summary><div>{children}</div></details>
}

export function DiagramRouteIcon({ type }: { type: DiagramEdgeType }) {
  return <svg viewBox="0 0 46 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={type === 'step' ? 'M4 14H21V4H42' : type === 'smoothstep' ? 'M4 14H17Q21 14 21 10V8Q21 4 25 4H42' : type === 'bezier' ? 'M4 14C25 14 20 4 42 4' : 'M4 14L42 4'} /></svg>
}
export function DiagramMarkerIcon({ marker, source = false }: { marker: DiagramMarker; source?: boolean }) {
  return <svg viewBox="0 0 46 18" aria-hidden="true" stroke="currentColor" strokeWidth="1.5"><g transform={source ? 'translate(46 0) scale(-1 1)' : undefined}><path d="M5 9H37" fill="none" />{marker === 'circle' ? <circle cx="33" cy="9" r="4" fill="currentColor" /> : marker !== 'none' && <path fill={marker === 'open' ? 'none' : 'currentColor'} d={marker === 'classic' ? 'M37 9L29 5L31 9L29 13Z' : marker === 'diamond' ? 'M37 9L32 5L27 9L32 13Z' : marker === 'open' ? 'M29 5L37 9L29 13' : 'M37 9L29 5V13Z'} />}</g></svg>
}
function PreviewSelect({ label, value, options, change, iconOnly = false }: { label: string; value: string; options: Array<{ value: string; label: string; icon: ReactNode }>; change(value: string): void; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null)
  const active = options.find(option => option.value === value) || options[0]
  useEffect(() => {
    if (!open) return
    const close = (event: globalThis.PointerEvent) => { if (!root.current?.contains(event.target as globalThis.Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <div className="sk-draw-preview-select" ref={root}><button aria-label={label} title={`${label}: ${active.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>{active.icon}{!iconOnly && <span>{active.label}</span>}<ChevronDown size={11} /></button>{open && <div role="menu" aria-label={label} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus() }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')), index = items.indexOf(document.activeElement as HTMLButtonElement)
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }}>{options.map(option => <button role="menuitemradio" aria-checked={option.value === value} key={option.value} onClick={() => { change(option.value); setOpen(false); root.current?.querySelector('button')?.focus() }}>{option.icon}<span>{option.label}</span>{option.value === value && <Check size={12} />}</button>)}</div>}</div>
}

export function DiagramWorkspace(props: WorkspaceProps) {
  const { t } = useEditorI18n()
  const { graph, node, nodeData, edgeData, settings, command, updateNode, updateEdge } = props
  const [query, setQuery] = useState(''), [menu, setMenu] = useState<string | null>(null)
  const [leftVisible, setLeftVisible] = useState(true), [rightVisible, setRightVisible] = useState(true)
  const [formatTab, setFormatTab] = useState('style'), [canvasTab, setCanvasTab] = useState('drawing')
  const [expanded, setExpanded] = useState(new Set(['ui.general']))
  const [libraries, setLibraries] = useState(new Set(['templates', 'ui.flowchart', 'UML', 'ui.general', 'diagram.basic']))
  const [chooseLibraries, setChooseLibraries] = useState(false), [swatchPage, setSwatchPage] = useState(0)
  const [confirmClose, setConfirmClose] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const root = useRef<HTMLDivElement>(null), menus = useRef<HTMLDivElement>(null)
  const selected = diagramSelectionRoots(graph?.getSelectedCells() || []), count = selected.length, hasSelection = count > 0
  const edge = props.edge || (count > 1 && selected.every(cell => cell.isEdge()) ? selected[0] as Edge : null)
  const style = nodeData || selected.find(cell => cell.isNode())?.getData<NodeData>() || props.defaultNode, edgeStyle = edgeData || edge?.getData<EdgeData>() || props.edgeDefaults
  const matching = props.shapes.filter(shape => `${t(shape.label)} ${t(shape.hint)}`.toLowerCase().includes(query.toLowerCase()))
  const requestClose = () => props.dirty ? setConfirmClose(true) : props.close()
  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [])
  useEffect(() => {
    if (chooseLibraries || confirmClose) root.current?.querySelector<HTMLElement>('.sk-draw-library-modal button')?.focus()
  }, [chooseLibraries, confirmClose])
  useLayoutEffect(() => {
    if (!menu) return
    const anchor = root.current?.querySelector<HTMLElement>(`[data-draw-menu="${menu}"]`)
    if (anchor) { const box = anchor.getBoundingClientRect(); setMenuPosition({ left: Math.max(6, Math.min(box.left, window.innerWidth - (menu === 'help' ? 330 : 270))), top: box.bottom }) }
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const dismiss = (event: globalThis.PointerEvent) => { if (!menus.current?.contains(event.target as globalThis.Node) && !(event.target as HTMLElement).closest('[data-draw-menu]')) setMenu(null) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(null); root.current?.querySelector<HTMLElement>(`[data-draw-menu="${menu}"]`)?.focus() } }
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key)
    menus.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key) }
  }, [menu])
  const fire = (action: DiagramCommand, value?: string | number) => { setMenu(null); command(action, value) }
  const iconButton = (label: string, icon: ReactNode, action: () => void, disabled = false, active?: boolean) => <button type="button" title={label} aria-label={label} aria-pressed={active} className={active ? 'is-active' : undefined} disabled={disabled} onClick={action}>{icon}</button>
  const menuItem = (label: string, action: () => void, shortcut?: string, disabled = false, checked?: boolean) => <button role="menuitem" disabled={disabled} onClick={() => { setMenu(null); action() }}><span className="sk-draw-menu-check">{checked && <Check size={13} />}</span><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>
  const toggleMenu = (name: string) => setMenu(value => value === name ? null : name)
  const textStyle = edge ? edgeStyle : style
  const updateText = (patch: Partial<NodeData>) => edge ? updateEdge(patch) : updateNode(patch)
  const geometry = (key: 'width' | 'height' | 'x' | 'y' | 'angle', value: number) => {
    if (!graph || !node) return
    graph.batchUpdate('geometry', () => {
      if (key === 'angle') rotateDiagramNode(node, value)
      else if (key === 'x' || key === 'y') node.position(key === 'x' ? value : node.position().x, key === 'y' ? value : node.position().y, { deep: true })
      else {
        const size = node.size(), locked = nodeData?.aspectRatioLocked || nodeData?.diagramShape === 'circle'
        resizeDiagramNode(node, key === 'width' ? value : locked ? size.width * value / size.height : size.width, key === 'height' ? value : locked ? size.height * value / size.width : size.height)
      }
    })
  }
  const swatchPages = Math.ceil(props.presets.length / 8)
  const styleSwatches = <div className="sk-draw-presets">{props.presets.slice(swatchPage * 8, swatchPage * 8 + 8).map(preset => <button key={preset.name} title={t(preset.name)} aria-label={t(preset.name)} style={{ background: preset.fillColor, borderColor: preset.color }} onClick={() => updateNode(preset)} />)}{swatchPages > 1 && <div className="sk-draw-preset-navigation"><button className="sk-draw-preset-arrow" aria-label={t('diagram.previousStyles')} title={t('diagram.previousStyles')} onClick={() => setSwatchPage(page => (page - 1 + swatchPages) % swatchPages)}><ChevronLeft size={16} /></button><div className="sk-draw-preset-pages">{Array.from({ length: swatchPages }, (_, index) => <button key={index} aria-label={t('diagram.stylePage', { page: index + 1 })} aria-pressed={swatchPage === index} onClick={() => setSwatchPage(index)} />)}</div><button className="sk-draw-preset-arrow" aria-label={t('diagram.nextStyles')} title={t('diagram.nextStyles')} onClick={() => setSwatchPage(page => (page + 1) % swatchPages)}><ChevronRight size={16} /></button></div>}</div>
  return <div ref={root} className="sk-diagram-dialog sk-drawio-editor" data-multiple-selection={count > 1} role="dialog" aria-modal="true" aria-label={t('diagram.workspace')} onMouseDownCapture={event => {
    if (!(event.target instanceof Element) || !event.target.closest('.sk-x6-canvas')) return
    const active = document.activeElement
    // X6 prevents the default mouse press, so the browser does not blur fields.
    // Commit while the original selection still owns the property panel.
    if (active instanceof HTMLElement && root.current?.contains(active) && active.matches('input,textarea,select')) active.blur()
  }} onKeyDownCapture={event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's' || event.nativeEvent.isComposing) return
    event.preventDefault(); event.stopPropagation()
    if (event.repeat || props.saving) return
    // Commit property drafts and inline labels before exporting the graph.
    if (document.activeElement instanceof HTMLElement && root.current?.contains(document.activeElement)) document.activeElement.blur()
    props.save()
  }} onKeyDown={event => {
    event.stopPropagation()
    if (event.key !== 'Tab') return
    const scope = root.current?.querySelector('.sk-draw-library-modal') || root.current
    const items = Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,[tabindex="0"]') || []).filter(item => item.getClientRects().length && !item.closest('[hidden]'))
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) { event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus() }
  }} onDragStart={event => event.stopPropagation()} onDragEnd={event => event.stopPropagation()}>
    <header className="sk-draw-header"><div className="sk-draw-heading"><nav aria-label={t('diagram.menuBar')}>
      {['file', 'edit', 'view', 'arrange', 'other', 'help'].map(name => <button data-draw-menu={name} aria-haspopup="menu" aria-expanded={menu === name} key={name} onClick={() => toggleMenu(name)}>{t(`diagram.menu.${name}`)}</button>)}
      <span className={`sk-draw-save-status ${props.dirty ? 'is-dirty' : ''}`}>{props.dirty ? t('diagram.unsaved') : ''}</span>{props.error && <span className="sk-draw-save-error" role="alert">{props.error}</span>}
    </nav></div><div className="sk-draw-header-actions"><button className="sk-draw-save" aria-keyshortcuts="Control+S Meta+S" title="Ctrl+S / ⌘S" disabled={props.saving} onClick={props.save}><Save size={15} />{t(props.saving ? 'diagram.saving' : 'ui.saveAndReturn')}</button>{iconButton(t('ui.closeDiagramEditor'), <X size={19} />, requestClose)}</div></header>
    <div className="sk-draw-toolbar" role="toolbar" aria-label={t('diagram.toolbar')}>
      {iconButton(t('diagram.toggleShapes'), <PanelLeft />, () => setLeftVisible(value => !value), false, leftVisible)}<i />
      <button className="sk-draw-zoom" data-draw-menu="zoom" aria-label={t('diagram.zoom')} aria-haspopup="menu" aria-expanded={menu === 'zoom'} onClick={() => toggleMenu('zoom')}>{props.zoom}% <ChevronDown size={12} /></button><i />
      {iconButton(t('ui.zoomIn'), <ZoomIn />, () => command('zoom', Math.min(4, props.zoom / 100 + .1)))}
      {iconButton(t('ui.zoomOut'), <ZoomOut />, () => command('zoom', Math.max(.1, props.zoom / 100 - .1)))}<i />
      {iconButton(t('ui.undo'), <Undo2 />, () => command('undo'), !graph?.canUndo())}{iconButton(t('ui.redo'), <Redo2 />, () => command('redo'), !graph?.canRedo())}<i />
      {iconButton(t('ui.delete'), <Trash2 />, () => command('delete'), !hasSelection)}<i />
      {iconButton(t('ui.bringToFront'), <BringToFront />, () => command('front'), !hasSelection)}{iconButton(t('ui.sendToBack'), <SendToBack />, () => command('back'), !hasSelection)}<i />
      <label className="sk-draw-color-tool" title={t('ui.fill')}><PaintBucket size={18} /><input type="color" aria-label={t('ui.fill')} value={style.fillColor === 'transparent' ? '#ffffff' : style.fillColor || '#ffffff'} onChange={event => updateNode({ fillColor: event.target.value })} /><span style={{ background: style.fillColor || '#ffffff' }} /></label>
      <label className="sk-draw-color-tool" title={t('ui.strokeColor')}><Pencil size={18} /><input type="color" aria-label={t('ui.strokeColor')} value={edge ? edgeStyle.color : style.color || '#000000'} onChange={event => edge ? updateEdge({ color: event.target.value }) : updateNode({ color: event.target.value })} /><span style={{ background: edge ? edgeStyle.color : style.color || '#000000' }} /></label><i />
      {iconButton(t('ui.independentEdge'), <ArrowRight />, () => command('edge'))}
      <button data-draw-menu="connection" data-line-type={edgeStyle.lineType} aria-label={t('ui.edgeType')} title={t(edgeStyle.lineType === 'step' ? 'ui.orthogonal' : edgeStyle.lineType === 'smoothstep' ? 'ui.roundedEdge' : edgeStyle.lineType === 'straight' ? 'ui.straight' : 'ui.curve')} aria-haspopup="menu" aria-expanded={menu === 'connection'} onClick={() => toggleMenu('connection')}><DiagramRouteIcon type={edgeStyle.lineType} /><ChevronDown size={10} /></button><i />
      {iconButton(t('ui.freeText'), <Type />, () => command('text'))}{iconButton(t('ui.copy'), <Copy />, () => command('duplicate'), !hasSelection)}
      {iconButton(t('ui.autoLayout'), <Network />, () => command('layout'), !graph?.getNodes().length)}<i />
      {iconButton(t('diagram.panTool'), <Hand />, () => props.setPan(!props.pan), false, props.pan)}{iconButton(t('diagram.selectTool'), <MousePointer2 />, () => props.setPan(false), false, !props.pan)}
      <span className="sk-draw-toolbar-spacer" />{iconButton(t('ui.fitCanvas'), <Maximize2 />, () => command('fit'))}{iconButton(t('diagram.toggleFormat'), <PanelRight />, () => setRightVisible(value => !value), false, rightVisible)}
    </div>
    {menu && <div ref={menus} className={`sk-draw-menu is-${menu}`} role="menu" style={menuPosition} aria-label={t(`diagram.menu.${menu}`)} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault(); const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const index = items.indexOf(document.activeElement as HTMLButtonElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }}>
      {menu === 'file' && <>{menuItem(t('ui.saveAndReturn'), props.save, '⌘/Ctrl+S')}{menuItem(t('diagram.exportSvg'), () => fire('export'))}<hr />{menuItem(t('ui.closeDiagramEditor'), requestClose)}</>}
      {menu === 'edit' && <>{menuItem(t('ui.undo'), () => fire('undo'), '⌘/Ctrl+Z', !graph?.canUndo())}{menuItem(t('ui.redo'), () => fire('redo'), '⌘/Ctrl+Shift+Z', !graph?.canRedo())}<hr />{menuItem(t('diagram.cut'), () => fire('cut'), '⌘/Ctrl+X', !hasSelection)}{menuItem(t('ui.copy'), () => fire('copy'), '⌘/Ctrl+C', !hasSelection)}{menuItem(t('diagram.paste'), () => fire('paste'), '⌘/Ctrl+V', graph?.isClipboardEmpty())}{menuItem(t('diagram.duplicate'), () => fire('duplicate'), '⌘/Ctrl+D', !hasSelection)}{menuItem(t('ui.delete'), () => fire('delete'), 'Delete', !hasSelection)}<hr />{menuItem(t('diagram.selectAll'), () => fire('select-all'), '⌘/Ctrl+A')}{menuItem(t('diagram.editLabel'), () => fire('edit'), 'F2 / Enter', !hasSelection)}</>}
      {menu === 'view' && <>{menuItem(t('diagram.grid'), () => props.changeSettings({ grid: !settings.grid }), undefined, false, settings.grid)}{menuItem(t('diagram.pageView'), () => props.changeSettings({ pageView: !settings.pageView }), undefined, false, settings.pageView)}{menuItem(t('diagram.guides'), () => props.changeSettings({ guides: !settings.guides }), undefined, false, settings.guides)}{menuItem(t('diagram.connectionPoints'), () => props.changeSettings({ connectionPoints: !settings.connectionPoints }), undefined, false, settings.connectionPoints)}{menuItem(t('diagram.connectionArrows'), () => props.changeSettings({ connectionArrows: !settings.connectionArrows }), undefined, false, settings.connectionArrows)}{menuItem(t('diagram.minimap'), () => props.changeSettings({ minimap: !settings.minimap }), undefined, false, settings.minimap)}<hr />{menuItem(t('ui.fitCanvas'), () => fire('fit'))}</>}
      {menu === 'arrange' && <>{menuItem(t('ui.bringToFront'), () => fire('front'), undefined, !hasSelection)}{menuItem(t('ui.sendToBack'), () => fire('back'), undefined, !hasSelection)}<hr />{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(value => <div key={value}>{menuItem(t(`diagram.align.${value}`), () => fire('align', value), undefined, count < 2)}</div>)}<hr />{menuItem(t('diagram.distributeHorizontal'), () => fire('distribute', 'horizontal'), undefined, count < 3)}{menuItem(t('diagram.distributeVertical'), () => fire('distribute', 'vertical'), undefined, count < 3)}<hr />{menuItem(t('diagram.group'), () => fire('group'), '⌘/Ctrl+G', count < 2)}{menuItem(t('diagram.ungroup'), () => fire('ungroup'), '⌘/Ctrl+Shift+G', !node?.getChildren()?.length)}{menuItem(t('ui.autoLayout'), () => fire('layout'))}</>}
      {menu === 'zoom' && <>{[.25, .5, .75, 1, 1.25, 1.5, 2].map(value => <div key={value}>{menuItem(`${value * 100}%`, () => fire('zoom', value), undefined, false, props.zoom === value * 100)}</div>)}<hr />{menuItem(t('ui.fitCanvas'), () => fire('fit'))}</>}
      {menu === 'connection' && <>{(['step', 'smoothstep', 'straight', 'bezier'] as const).map(value => <div key={value}>{menuItem(t(value === 'step' ? 'ui.orthogonal' : value === 'smoothstep' ? 'ui.roundedEdge' : value === 'straight' ? 'ui.straight' : 'ui.curve'), () => edge ? updateEdge({ lineType: value }) : props.changeEdgeDefaults({ lineType: value }), undefined, false, edgeStyle.lineType === value)}</div>)}</>}
      {menu === 'other' && <>{menuItem(t('diagram.clearDefaultStyle'), () => fire('clear-default'))}{menuItem(t('diagram.setDefaultStyle'), () => fire('default-style'), undefined, !hasSelection)}<hr />{menuItem(t('diagram.minimap'), () => props.changeSettings({ minimap: !settings.minimap }), undefined, false, settings.minimap)}</>}
      {menu === 'help' && <div className="sk-draw-shortcuts"><strong>{t('diagram.shortcuts')}</strong>{[['diagram.panHint', 'Space + Drag'], ['diagram.zoomHint', 'Ctrl/⌘ + Wheel'], ['diagram.editLabel', 'F2 / Enter'], ['diagram.multiselect', 'Shift + Click'], ['diagram.moveSelection', '↑ ↓ ← →'], ['diagram.moveSelectionFast', 'Shift + ↑ ↓ ← →'], ['diagram.duplicate', 'Ctrl/⌘ + D'], ['diagram.saveHint', 'Ctrl/⌘ + S']].map(([key, shortcut]) => <p key={key}><span>{t(key)}</span><kbd>{shortcut}</kbd></p>)}</div>}
    </div>}
    <div className="sk-flow-workspace" data-ports={settings.connectionPoints} data-minimap={settings.minimap}>
      {leftVisible && <aside className="sk-flow-palette" aria-label={t('ui.shapes')}><div className="sk-draw-search"><Search size={14} /><input aria-label={t('ui.searchShapes')} placeholder={t('diagram.searchPlaceholder')} value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label={t('diagram.clearSearch')} onClick={() => setQuery('')}><X size={13} /></button>}</div><div className="sk-draw-libraries">
        {libraries.has('templates') && <details className="sk-draw-library sk-flow-templates" open={Boolean(query)}><summary>{t('diagram.templates')}</summary><div className="sk-draw-templates">{diagramTemplates.filter(template => `${t(template.label)} ${t(template.hint)}`.toLowerCase().includes(query.toLowerCase())).map(template => <button key={template.type} aria-label={t(template.label)} title={t(template.hint)} onClick={() => props.insertTemplate(template.type)}><svg viewBox="0 0 100 38" aria-hidden="true"><path d="M26 19H40M64 19H78" stroke="#777" /><rect x="2" y="9" width="24" height="20" rx="6" fill="none" stroke="#555" /><path d={template.type === 'branch' ? 'M52 7L65 19L52 31L39 19Z' : 'M40 9H64V29H40Z'} fill="none" stroke="#555" /><rect x="78" y="9" width="20" height="20" fill="none" stroke="#555" /></svg><span>{t(template.label)}</span></button>)}</div></details>}
        {['ui.flowchart', 'UML', 'ui.general', 'diagram.basic'].filter(group => libraries.has(group)).map(group => <details className="sk-draw-library" key={group} open={Boolean(query) || expanded.has(group)} onToggle={event => { const isOpen = event.currentTarget.open; setExpanded(old => { if (old.has(group) === isOpen) return old; const next = new Set(old); if (isOpen) next.add(group); else next.delete(group); return next }) }}><summary>{t(group)}</summary><div className="sk-draw-shapes">{matching.filter(shape => shape.group === group).map(shape => <button key={shape.label} aria-label={t(shape.label)} title={t('diagram.shapeHint', { 0: t(shape.label), 1: t(shape.hint) })} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/slate-kit-x6', shape.type); if (shape.preset?.arrowRoute) event.dataTransfer.setData('application/slate-kit-x6-arrow-route', shape.preset.arrowRoute); if (shape.preset?.rounded) event.dataTransfer.setData('application/slate-kit-x6-rounded', 'true') }} onClick={event => { if (event.detail < 2) props.addShape(shape.type, shape.preset, event.altKey) }}><DiagramShapeIcon type={shape.type} preset={shape.preset} /></button>)}{group === 'ui.general' && <button aria-label={t('ui.independentEdge')} title={t('ui.independentEdge')} onClick={() => command('edge')} draggable onDragStart={event => event.dataTransfer.setData('application/slate-kit-x6-edge', 'edge')}><ArrowRight size={31} /></button>}</div></details>)}
        {query && matching.length === 0 && <p className="sk-draw-no-results">{t('diagram.noShapes')}</p>}
      </div><div className="sk-draw-library-footer"><button onClick={() => setChooseLibraries(true)}><Plus size={15} />{t('diagram.moreShapes')}</button></div></aside>}
      <main className="sk-flow-stage" aria-label={t('diagram.canvas')}>{props.children}</main>
      {rightVisible && <aside className="sk-flow-inspector" aria-label={t('diagram.formatPanel')}><div className="sk-draw-format-tabs" role="tablist" aria-label={t('diagram.formatPanel')}>
        {(hasSelection ? ['style', 'text', 'arrange'] : ['drawing', 'style']).map(tab => <button key={tab} role="tab" aria-selected={(hasSelection ? formatTab : canvasTab) === tab} onClick={() => hasSelection ? setFormatTab(tab) : setCanvasTab(tab)}>{t(`diagram.tab.${tab}`)}</button>)}
      </div><div className="sk-draw-format-content" role="tabpanel">
        {!hasSelection && canvasTab === 'drawing' && <>
          <FormatSection title={t('diagram.view')}><div className="sk-draw-option-row"><label><input type="checkbox" checked={settings.grid} onChange={event => props.changeSettings({ grid: event.target.checked })} />{t('diagram.gridShort')}</label><NumberField label={t('diagram.gridSize')} value={settings.gridSize} min={2} max={100} unit="pt" change={gridSize => props.changeSettings({ gridSize })} /></div><label className="sk-draw-check"><input type="checkbox" checked={settings.pageView} onChange={event => props.changeSettings({ pageView: event.target.checked })} />{t('diagram.pageView')}</label><div className="sk-draw-option-row"><span>{t('diagram.background')}</span><input type="color" aria-label={t('diagram.background')} value={settings.backgroundColor} onChange={event => props.changeSettings({ backgroundColor: event.target.value })} /></div></FormatSection>
          <FormatSection title={t('diagram.options')}>{(['connectionArrows', 'connectionPoints', 'guides'] as const).map(key => <label className="sk-draw-check" key={key}><input type="checkbox" checked={settings[key]} onChange={event => props.changeSettings({ [key]: event.target.checked })} />{t(`diagram.${key}`)}</label>)}</FormatSection>
          <FormatSection title={t('diagram.paperSize')} open={false}><select aria-label={t('diagram.paperSize')} value={settings.paper} onChange={event => props.changeSettings({ paper: event.target.value as DiagramCanvasSettings['paper'] })}><option value="a4">A4 (210 × 297 mm)</option><option value="a3">A3 (297 × 420 mm)</option><option value="letter">Letter (8.5 × 11 in)</option></select><label className="sk-draw-check"><input type="checkbox" checked={settings.landscape} onChange={event => props.changeSettings({ landscape: event.target.checked })} />{t('diagram.landscape')}</label></FormatSection>
          <div className="sk-draw-panel-buttons"><button onClick={() => command('clear-default')}>{t('diagram.clearDefaultStyle')}</button></div>
        </>}
        {((hasSelection && formatTab === 'style') || (!hasSelection && canvasTab === 'style')) && <>
          {!edge && styleSwatches}
          {nodeData?.diagramShape === 'block-arrow' && node && <FormatSection title={t('diagram.blockArrow')}><DiagramArrowSettings value={nodeData} size={node.size()} change={updateNode} /></FormatSection>}
          {!edge && <FormatSection title={t('diagram.fill')}><div className="sk-draw-option-row"><label><input type="checkbox" checked={style.fillColor !== 'transparent'} onChange={event => updateNode({ fillColor: event.target.checked ? '#ffffff' : 'transparent' })} />{t('diagram.fill')}</label><input aria-label={t('diagram.fillColor')} type="color" value={style.fillColor === 'transparent' ? '#ffffff' : style.fillColor || '#ffffff'} onChange={event => updateNode({ fillColor: event.target.value })} /></div></FormatSection>}
          <FormatSection title={t('diagram.line')}><div className="sk-draw-option-row"><label><input type="checkbox" checked={edge ? edgeStyle.thickness > 0 : (style.borderWidth ?? 1) > 0} onChange={event => edge ? updateEdge({ thickness: event.target.checked ? 1 : 0 }) : updateNode({ borderWidth: event.target.checked ? 1 : 0 })} />{t('diagram.line')}</label><input aria-label={t('diagram.lineColor')} type="color" value={edge ? edgeStyle.color : style.color || '#000000'} onChange={event => edge ? updateEdge({ color: event.target.value }) : updateNode({ color: event.target.value })} /></div><div className="sk-draw-option-row"><select aria-label={t('ui.stroke')} value={edge ? edgeStyle.lineStyle : style.lineStyle || 'solid'} onChange={event => edge ? updateEdge({ lineStyle: event.target.value as EdgeData['lineStyle'] }) : updateNode({ lineStyle: event.target.value as NodeData['lineStyle'] })}>{['solid', 'dashed', 'dotted'].map(value => <option key={value} value={value}>{t(`ui.${value}`)}</option>)}</select><NumberField label={t('ui.strokeWidth')} value={edge ? edgeStyle.thickness : style.borderWidth ?? 1} min={0} max={20} step={.5} unit="pt" change={value => edge ? updateEdge({ thickness: value }) : updateNode({ borderWidth: value })} /></div>
            {edge && <><select aria-label={t('diagram.lineJoin')} value={edgeStyle.lineJoin || 'miter'} onChange={event => updateEdge({ lineJoin: event.target.value as EdgeData['lineJoin'] })}>{['miter', 'round', 'bevel'].map(value => <option key={value} value={value}>{t(`diagram.join.${value}`)}</option>)}</select><PreviewSelect label={t('ui.edgeType')} value={edgeStyle.lineType} options={(['step', 'smoothstep', 'straight', 'bezier'] as const).map(value => ({ value, label: t(value === 'step' ? 'ui.orthogonal' : value === 'smoothstep' ? 'ui.roundedEdge' : value === 'straight' ? 'ui.straight' : 'ui.curve'), icon: <DiagramRouteIcon type={value} /> }))} change={value => updateEdge({ lineType: value as DiagramEdgeType })} /><div className="sk-draw-terminals"><span /><span>{t('diagram.sourceArrow')}</span><span>{t('diagram.targetArrow')}</span><span>{t('diagram.endpointMarker')}</span>{(['source', 'target'] as const).map(end => <PreviewSelect key={end} label={t(`diagram.${end}Arrow`)} value={edgeStyle[`${end}Arrow`] || (end === 'source' ? 'none' : 'classic')} iconOnly options={(['none', 'classic', 'block', 'open', 'diamond', 'circle'] as const).map(value => ({ value, label: t(`diagram.marker.${value}`), icon: <DiagramMarkerIcon marker={value} source={end === 'source'} /> }))} change={value => updateEdge({ [`${end}Arrow`]: value })} />)}<span>{t('diagram.arrowHeadSize')}</span>{(['source', 'target'] as const).map(end => <NumberField key={end} label={t(`diagram.${end}ArrowSize`)} value={edgeStyle[`${end}ArrowSize`] ?? edgeStyle.arrowSize ?? 7} min={3} max={32} unit="pt" change={value => updateEdge({ [`${end}ArrowSize`]: value })} />)}<span>{t('diagram.endpointOffset')}</span>{(['source', 'target'] as const).map(end => <NumberField key={end} label={t(`diagram.${end}Offset`)} disabled={!(end === 'source' ? edge.getSourceCellId() : edge.getTargetCellId())} value={edgeStyle[`${end}Offset`] ?? 0} min={0} max={100} unit="pt" change={value => updateEdge({ [`${end}Offset`]: value })} />)}</div><div className="sk-draw-option-row"><span>{t('diagram.lineJump')}</span><select aria-label={t('diagram.lineJump')} title={edgeStyle.lineType === 'bezier' ? t('diagram.jumpCurveHint') : undefined} disabled={edgeStyle.lineType === 'bezier'} value={edgeStyle.lineJump || 'none'} onChange={event => updateEdge({ lineJump: event.target.value as EdgeData['lineJump'] })}>{['none', 'arc', 'gap', 'cubic'].map(value => <option key={value} value={value}>{t(`diagram.jump.${value}`)}</option>)}</select><NumberField label={t('diagram.jumpSize')} value={edgeStyle.jumpSize ?? 6} min={2} max={32} unit="pt" disabled={edgeStyle.lineType === 'bezier' || !edgeStyle.lineJump || edgeStyle.lineJump === 'none'} change={jumpSize => updateEdge({ jumpSize })} /></div><button className="sk-draw-wide-button" onClick={() => command('edit')}>{t('diagram.editLabel')}</button><button className="sk-draw-wide-button" onClick={() => command('align', 'reset-edge')}>{t('diagram.resetPath')}</button></>}

          </FormatSection><div className="sk-draw-opacity"><div className="sk-draw-option-row"><span>{t('ui.opacity')}</span><NumberField label={t('ui.opacity')} value={(edge ? edgeStyle.opacity : style.opacity ?? 1) * 100} min={0} max={100} unit="%" change={value => edge ? updateEdge({ opacity: value / 100 }) : updateNode({ opacity: value / 100 })} /></div></div>
          {!edge && <FormatSection title={t('diagram.effects')}><label className="sk-draw-check"><input type="checkbox" checked={Boolean(style.rounded)} onChange={event => updateNode({ rounded: event.target.checked })} />{t('diagram.rounded')}</label><label className="sk-draw-check"><input type="checkbox" checked={Boolean(style.shadow)} onChange={event => updateNode({ shadow: event.target.checked })} />{t('diagram.shadow')}</label></FormatSection>}
          {hasSelection && <div className="sk-draw-panel-buttons"><button onClick={() => command('default-style')}>{t('diagram.setDefaultStyle')}</button></div>}
        </>}
        {hasSelection && formatTab === 'text' && <><FormatSection title={t('diagram.font')}><select aria-label={t('diagram.fontFamily')} value={textStyle.fontFamily || 'Helvetica'} onChange={event => updateText({ fontFamily: event.target.value })}>{['Helvetica', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'].map(font => <option key={font}>{font}</option>)}</select><div className="sk-draw-text-tools"><NumberField label={t('ui.fontSize')} value={edge ? edgeStyle.fontSize : style.fontSize || 12} min={6} max={144} change={fontSize => edge ? updateEdge({ fontSize }) : updateText({ fontSize })} />{iconButton(t('diagram.bold'), <Bold size={15} />, () => updateText({ bold: !textStyle.bold }), false, textStyle.bold)}{iconButton(t('diagram.italic'), <Italic size={15} />, () => updateText({ italic: !textStyle.italic }), false, textStyle.italic)}{iconButton(t('diagram.underline'), <Underline size={15} />, () => updateText({ underline: !textStyle.underline }), false, textStyle.underline)}</div>{!edge && <div className="sk-draw-text-tools">{(['left', 'center', 'right'] as const).map((value, index) => <span key={value}>{iconButton(t(`diagram.align.${value}`), [<AlignLeft key="l" />, <AlignCenter key="c" />, <AlignRight key="r" />][index], () => updateText({ textAlign: value }), false, (style.textAlign || 'center') === value)}</span>)}<input type="color" aria-label={t('ui.textColor')} value={style.textColor || '#000000'} onChange={event => updateText({ textColor: event.target.value })} /></div>}{edge && <div className="sk-draw-option-row"><span>{t('ui.textColor')}</span><input type="color" aria-label={t('ui.textColor')} value={edgeStyle.textColor || '#000000'} onChange={event => updateEdge({ textColor: event.target.value })} /></div>}</FormatSection>{edge && <FormatSection title={t('diagram.labelPosition')}><NumberField label={t('diagram.labelPosition')} value={(edgeStyle.labelPosition ?? .5) * 100} min={0} max={100} unit="%" change={value => updateEdge({ labelPosition: value / 100 })} /></FormatSection>}<div className="sk-draw-panel-buttons"><button onClick={() => command('edit')}>{t('diagram.editLabel')}</button></div></>}
        {hasSelection && formatTab === 'arrange' && <><div className="sk-draw-layer-tools">{iconButton(t('ui.bringToFront'), <BringToFront />, () => command('front'))}{iconButton(t('ui.sendToBack'), <SendToBack />, () => command('back'))}{iconButton(t('diagram.forward'), <Layers />, () => command('forward'))}{iconButton(t('diagram.backward'), <Layers />, () => command('backward'))}</div>{node && <><FormatSection title={t('diagram.size')}><div className="sk-draw-option-row"><NumberField label={t('diagram.width')} value={node.size().width} min={20} max={10000} unit="pt" change={value => geometry('width', value)} /><NumberField label={t('diagram.height')} value={node.size().height} min={20} max={10000} unit="pt" change={value => geometry('height', value)} /></div><div className="sk-draw-field-captions"><span>{t('diagram.width')}</span><span>{t('diagram.height')}</span></div><label className="sk-draw-check"><input type="checkbox" checked={Boolean(nodeData?.aspectRatioLocked) || nodeData?.diagramShape === 'circle'} disabled={nodeData?.diagramShape === 'circle'} onChange={event => updateNode({ aspectRatioLocked: event.target.checked })} />{t('diagram.lockAspect')}</label></FormatSection><FormatSection title={t('diagram.position')}><div className="sk-draw-option-row"><NumberField label={t('diagram.left')} value={node.position().x} change={value => geometry('x', value)} /><NumberField label={t('diagram.top')} value={node.position().y} change={value => geometry('y', value)} /></div><div className="sk-draw-field-captions"><span>{t('diagram.left')}</span><span>{t('diagram.top')}</span></div></FormatSection><FormatSection title={t('diagram.rotation')}><NumberField label={t('diagram.rotation')} value={node.getAngle()} min={0} max={360} unit="°" change={value => geometry('angle', value)} /></FormatSection></>}
          <FormatSection title={t('diagram.align')}><div className="sk-draw-align-tools">{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((value, index) => <span key={value}>{iconButton(t(`diagram.align.${value}`), [<AlignLeft key="l" />, <AlignCenter key="c" />, <AlignRight key="r" />, <ArrowUp key="u" />, <List key="m" />, <ArrowDown key="d" />][index], () => command('align', value), count < 2)}</span>)}</div><div className="sk-draw-option-row"><button disabled={count < 3} title={t('diagram.distributeHorizontal')} aria-label={t('diagram.distributeHorizontal')} onClick={() => command('distribute', 'horizontal')}><AlignHorizontalDistributeCenter size={18} /></button><button disabled={count < 3} title={t('diagram.distributeVertical')} aria-label={t('diagram.distributeVertical')} onClick={() => command('distribute', 'vertical')}><AlignHorizontalDistributeCenter size={18} style={{ transform: 'rotate(90deg)' }} /></button></div></FormatSection><div className="sk-draw-panel-buttons"><button disabled={count < 2} onClick={() => command('group')}>{t('diagram.group')}</button><button disabled={!node?.getChildren()?.length} onClick={() => command('ungroup')}>{t('diagram.ungroup')}</button></div>
        </>}
      </div></aside>}
    </div>
    <footer className="sk-draw-footer"><span className="sk-draw-page-tab">{t('diagram.pageOne')}</span><span className="sk-draw-canvas-hint">{t('diagram.canvasHint')}</span><span className="sk-draw-selection-status">{hasSelection ? t('diagram.selectedCount', { count }) : ''}</span></footer>
    {confirmClose && <div className="sk-draw-library-modal" onKeyDown={event => { if (event.key === 'Escape') setConfirmClose(false) }}><div role="alertdialog" aria-modal="true" aria-label={t('diagram.closeUnsaved')}><strong>{t('diagram.closeUnsaved')}</strong><p>{t('diagram.discardWarning')}</p><div className="sk-draw-exit-actions"><button onClick={() => setConfirmClose(false)}>{t('diagram.continueEditing')}</button><button onClick={props.close}>{t('diagram.discard')}</button><button className="sk-draw-save" disabled={props.saving} onClick={() => { setConfirmClose(false); props.save() }}>{t('ui.saveAndReturn')}</button></div></div></div>}
    {chooseLibraries && <div className="sk-draw-library-modal" onKeyDown={event => { if (event.key === 'Escape') setChooseLibraries(false) }}><div role="dialog" aria-modal="true" aria-label={t('diagram.moreShapes')}><header><strong>{t('diagram.moreShapes')}</strong><button aria-label={t('ui.close')} onClick={() => setChooseLibraries(false)}><X size={18} /></button></header>{['templates', 'ui.flowchart', 'UML', 'ui.general', 'diagram.basic'].map(group => <label key={group}><input type="checkbox" checked={libraries.has(group)} onChange={event => setLibraries(old => { const next = new Set(old); if (event.target.checked) next.add(group); else next.delete(group); return next })} />{t(group === 'templates' ? 'diagram.templates' : group)}</label>)}<button className="sk-draw-save" onClick={() => setChooseLibraries(false)}>{t('diagram.apply')}</button></div></div>}
  </div>
}
