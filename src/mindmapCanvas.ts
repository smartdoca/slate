import { App, DragEvent, Frame, Group, MoveEvent, Path, PointerEvent, Rect, Text, ZoomEvent } from 'leafer-ui'
import '@leafer-in/viewport'
import { MIND_FONT, mindSceneBounds, type MindScene, type MindSceneNode } from './mindmapGraph'

type Handlers = {
  select(id: string): void; edit(id: string): void; menu(id: string, x: number, y: number): void; blank(): void
  moving(id: string, point: { x: number; y: number }): void; moved(id: string): void; viewport(): void
}
/** Same flat Frame/Text/Path scene as aidcanvas. Nodes and paths survive draft edits. */
export class MindMapCanvas {
  readonly app: App
  private frames = new Map<string, Frame>()
  private paths = new Map<string, Path>()
  private content = new Group({ hitSelf: false })
  private halo = new Rect({ fill: 'transparent', stroke: '#3370ff', strokeWidth: 1.5, cornerRadius: 7, hittable: false, visible: false })
  private dropHalo = new Rect({ fill: '#3370ff12', stroke: '#3370ff', strokeWidth: 2, cornerRadius: 7, hittable: false, visible: false })
  private selected = ''
  private scene: MindScene = { nodes: [], edges: [] }
  private width: number
  private height: number
  private disposed = false
  constructor(private host: HTMLDivElement, private handlers: Handlers) {
    this.width = host.clientWidth; this.height = host.clientHeight
    this.app = new App({ view: host, width: this.width, height: this.height, tree: { type: 'viewport' }, wheel: { preventDefault: true }, touch: { preventDefault: true }, pointer: { preventDefaultMenu: true }, zoom: { min: .2, max: 3 } })
    this.app.tree.add(this.content); this.app.tree.add(this.halo); this.app.tree.add(this.dropHalo)
    this.app.tree.on(PointerEvent.TAP, (event: PointerEvent) => { if (event.target === this.app.tree) handlers.blank() })
    this.app.on([MoveEvent.MOVE, ZoomEvent.ZOOM], () => this.notifyViewport())
  }
  sync(scene: MindScene) {
    this.scene = scene
    const ids = new Set(scene.nodes.map(node => node.id)), edgeIds = new Set(scene.edges.map(edge => edge.id))
    this.frames.forEach((frame, id) => { if (!ids.has(id)) { frame.destroy(); this.frames.delete(id) } })
    this.paths.forEach((path, id) => { if (!edgeIds.has(id)) { path.destroy(); this.paths.delete(id) } })
    for (const node of scene.nodes) {
      let frame = this.frames.get(node.id)
      if (!frame) {
        frame = new Frame({ id: node.id, name: 'mind-node', cursor: 'pointer', draggable: true, hitChildren: false, overflow: 'show' })
        frame.add(new Text({ name: 'text', fontFamily: MIND_FONT, textAlign: 'center', verticalAlign: 'middle', textWrap: 'none', lineHeight: { type: 'percent', value: 1.4 } }))
        frame.add(new Path({ name: 'underline', hittable: false }))
        this.bind(frame); this.content.add(frame); this.frames.set(node.id, frame)
      }
      frame.set({ x: node.x, y: node.y, width: node.width, height: node.height, fill: node.fill, stroke: node.underline ? undefined : node.color, strokeWidth: 1, cornerRadius: node.radius })
      ;(frame.children[0] as Text).set({ x: 14, y: 8, width: node.width - 28, height: node.height - 16, text: node.lines.join('\n'), fontSize: node.fontSize, fontWeight: node.fontWeight, fill: node.textColor })
      ;(frame.children[1] as Path).set({ path: `M0 ${node.height - 1}h${node.width}`, stroke: node.color, strokeWidth: 1.5, visible: node.underline })
    }
    for (const edge of scene.edges) {
      let path = this.paths.get(edge.id)
      if (!path) { path = new Path({ id: edge.id, strokeWidth: 2, hittable: false }); this.content.addAt(path, 0); this.paths.set(edge.id, path) }
      path.set({ path: edge.path, stroke: edge.color })
    }
    this.select(this.selected)
  }
  private bind(frame: Frame) {
    const id = frame.id!
    frame.on(PointerEvent.TAP, () => this.handlers.select(id))
    frame.on(PointerEvent.DOUBLE_TAP, () => this.handlers.edit(id))
    frame.on(PointerEvent.MENU, (event: PointerEvent) => { const rect = this.host.getBoundingClientRect(); this.handlers.menu(id, rect.left + event.x, rect.top + event.y) })
    let previous = { x: 0, y: 0 }, descendants = new Set<string>()
    frame.on(DragEvent.START, () => {
      this.handlers.select(id); previous = { x: Number(frame.x), y: Number(frame.y) }; descendants = new Set([id])
      this.scene.nodes.forEach(node => { if (node.parentId && descendants.has(node.parentId)) descendants.add(node.id) })
      this.host.dataset.dragging = 'true'
    })
    frame.on(DragEvent.DRAG, (event: DragEvent) => {
      const dx = Number(frame.x) - previous.x, dy = Number(frame.y) - previous.y
      previous = { x: Number(frame.x), y: Number(frame.y) }
      this.scene.nodes.forEach(node => { if (descendants.has(node.id)) { node.x += dx; node.y += dy; if (node.id !== id) this.frames.get(node.id)?.set({ x: node.x, y: node.y }) } })
      const byId = new Map(this.scene.nodes.map(node => [node.id, node]))
      this.scene.edges.forEach(edge => {
        if (!descendants.has(edge.parentId) && !descendants.has(edge.targetId)) return
        const from = byId.get(edge.parentId)!, to = byId.get(edge.targetId)!, right = to.x + to.width / 2 >= from.x + from.width / 2
        const sx = from.x + (right ? from.width : 0), tx = to.x + (right ? 0 : to.width), sy = from.y + (from.underline ? from.height - 1 : from.height / 2), ty = to.y + (to.underline ? to.height - 1 : to.height / 2), middle = (sx + tx) / 2
        edge.path = `M${sx} ${sy}C${middle} ${sy} ${middle} ${ty} ${tx} ${ty}`; this.paths.get(edge.id)?.set({ path: edge.path })
      })
      this.select(id); this.handlers.moving(id, event.getInnerPoint(this.content))
    })
    frame.on(DragEvent.END, () => { delete this.host.dataset.dragging; this.handlers.moved(id) })
  }
  has(id: string) { return this.frames.has(id) }
  nodes() { return this.scene.nodes }
  private outline(halo: Rect, node?: MindSceneNode) { halo.set(node ? { visible: true, x: node.x - 4, y: node.y - 4, width: node.width + 8, height: node.height + 8 } : { visible: false }) }
  select(id: string) { this.selected = id; this.outline(this.halo, this.scene.nodes.find(node => node.id === id)) }
  highlight(id: string | null) { this.outline(this.dropHalo, this.scene.nodes.find(node => node.id === id)) }
  rect(id: string) {
    const node = this.scene.nodes.find(node => node.id === id); if (!node) return undefined
    const { x, y, scale } = this.viewport()
    return { left: x + node.x * scale, top: y + node.y * scale, width: node.width * scale, height: node.height * scale }
  }
  viewport() { const layer = this.app.tree.zoomLayer; return { x: Number(layer.x), y: Number(layer.y), scale: Number(layer.scaleX) } }
  private notifyViewport() { if (!this.disposed) this.handlers.viewport() }
  translate(x: number, y: number) { this.app.tree.zoomLayer.set({ x, y }); this.notifyViewport() }
  zoomTo(scale: number, point = { x: this.width / 2, y: this.height / 2 }) {
    const current = this.viewport(), next = Math.min(3, Math.max(.2, scale)), ratio = next / current.scale
    this.app.tree.zoomLayer.set({ x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio, scale: next }); this.notifyViewport()
  }
  zoom(delta: number) { this.zoomTo(this.viewport().scale + delta) }
  center(id: string) { const node = this.scene.nodes.find(node => node.id === id); if (node) { const { scale } = this.viewport(); this.translate(this.width / 2 - (node.x + node.width / 2) * scale, this.height / 2 - (node.y + node.height / 2) * scale) } }
  fit(padding = 90, minimum = .2) {
    if (!this.scene.nodes.length) return
    const box = mindSceneBounds(this.scene, 0), ideal = Math.min(1, (this.width - padding * 2) / box.width, (this.height - padding * 2) / box.height), scale = Math.max(minimum, ideal)
    this.app.tree.zoomLayer.set({ scale, x: this.width / 2 - (box.x + box.width / 2) * scale, y: this.height / 2 - (box.y + box.height / 2) * scale }); if (ideal < minimum && minimum > .2) this.center(this.scene.nodes[0].id); else this.notifyViewport()
  }
  resize(width: number, height: number) { const dx = (width - this.width) / 2, dy = (height - this.height) / 2; this.width = width; this.height = height; this.app.resize({ width, height }); const view = this.viewport(); this.translate(view.x + dx, view.y + dy) }
  destroy() { this.disposed = true; this.app.destroy() }
}
