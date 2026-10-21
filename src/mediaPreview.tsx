import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Editor, Element } from 'slate'
import { useSlateStatic } from 'slate-react'
import { useEditorI18n } from './i18n'
import { useResourceRuntime } from './resources'
import type { DiagramElement, ImageElement, MediaPreviewEvent, MediaPreviewItem, RichEditor } from './types'

type MediaElement = ImageElement | DiagramElement
type Projection = { src: string; width?: number; height?: number }
const MediaPreviewContext = createContext<{
  register(element: MediaElement, projection: Projection): () => void
  open(element: MediaElement): boolean
} | null>(null)

export function MediaPreviewProvider({ editor, onPreview, children }: { editor: RichEditor; onPreview?: (event: MediaPreviewEvent) => void; children: ReactNode }) {
  const runtime = useResourceRuntime(), { t } = useEditorI18n()
  // Keys are immutable Slate nodes. Editing a diagram cannot reuse an old projection.
  const projections = useRef(new WeakMap<MediaElement, Projection>())
  const register = useCallback((element: MediaElement, projection: Projection) => {
    projections.current.set(element, projection)
    return () => { if (projections.current.get(element) === projection) projections.current.delete(element) }
  }, [])
  const open = useCallback((element: MediaElement) => {
    if (!onPreview) return false
    const items: MediaPreviewItem[] = []
    for (const [node] of Editor.nodes(editor, { at: [], match: node => Element.isElement(node) && ['image', 'flowchart', 'mindmap'].includes(node.type) })) {
      const media = node as MediaElement
      if (media.type === 'image' && (!media.path || runtime.stateFor(media.id))) continue
      const projection = projections.current.get(media)
      const name = media.type === 'image' ? media.alt || t('ui.image') : t(media.type === 'flowchart' ? 'diagram.downloadFilename' : 'mindmap.downloadFilename')
      const alt = media.type === 'image' ? media.alt || '' : t(media.type === 'flowchart' ? 'ui.flowchart' : 'ui.mindMap')
      let pending: Promise<string> | undefined
      items.push({
        id: media.id, type: media.type, name, alt,
        ...(media.type === 'image' ? { path: media.path, caption: media.caption } : {}),
        width: projection?.width ?? media.width,
        height: projection?.height,
        src: projection?.src,
        resolveUrl: () => {
          // Signed asset URLs can expire while the host viewer stays open.
          // Re-authorize each image opening instead of caching a successful URL.
          if (media.type === 'image') return runtime.resolve({ kind: 'image', path: media.path!, name: media.alt })
          if (pending) return pending
          pending = (async () => {
            if (projection?.src) return projection.src
            if (media.type === 'flowchart') {
              const { createFlowchartPreview } = await import('./components/DiagramBlock')
              const { svg } = await createFlowchartPreview(media)
              return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
            }
            const [{ normalizeMind }, { createMindScene, exportMindSvg }] = await Promise.all([import('./mindmap'), import('./mindmapGraph')])
            const data = structuredClone(media.mindData)
            const root = normalizeMind(data.nodeData, true, { root: t('ui.centralTopic'), child: t('ui.newTopic') })
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportMindSvg(createMindScene(root, false, data)).svg)}`
          })()
          // A failed authorization/render can be retried explicitly by the host.
          pending.catch(() => { pending = undefined })
          return pending
        },
      })
    }
    const index = items.findIndex(item => item.id === element.id)
    // Upload placeholders never enter the host's gallery.
    if (index >= 0) onPreview({ currentId: element.id, index, items })
    return true
  }, [editor, onPreview, runtime, t])
  const value = useMemo(() => ({ register, open }), [register, open])
  return <MediaPreviewContext.Provider value={value}>{children}</MediaPreviewContext.Provider>
}

export function useMediaPreview(element: MediaElement, projection: Projection, fallback: () => void) {
  const context = useContext(MediaPreviewContext)
  const editor = useSlateStatic()
  useLayoutEffect(() => projection.src ? context?.register(element, projection) : undefined, [context?.register, element, projection.src, projection.width, projection.height])
  return () => {
    // Ignore late UI events on a deleted node, without repairing the document.
    if (!Editor.nodes(editor, { at: [], match: node => node === element }).next().value) return
    if (!context?.open(element)) fallback()
  }
}
