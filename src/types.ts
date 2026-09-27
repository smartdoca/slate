import type { BaseEditor, Descendant, Operation, Range } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'
import type { ReactElement } from 'react'
import type { RenderElementProps, RenderLeafProps } from 'slate-react'

export type Align = 'left' | 'center' | 'right'
export type TitleLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
export type ListStyle = 'ul' | 'ol' | 'checkbox'
export type BlockType = 'paragraph' | 'heading-one' | 'heading-two' | 'heading-three' | 'heading-four' | 'heading-five' | 'block-quote' | 'bulleted-list' | 'numbered-list' | 'list-item' | 'todo' | 'code-block' | 'formula' | 'divider' | 'image' | 'video' | 'attachment' | 'card' | 'table' | 'table-row' | 'table-cell' | 'columns' | 'column' | 'flowchart' | 'mindmap' | 'link' | `custom:${string}`

export type RichText = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  fontSize?: number
  fontFamily?: string
  color?: string
  backgroundColor?: string
}

type BaseBlock = { id: string; align?: Align; children: RichNode[] }
export type CustomElement = BaseBlock & { type: `custom:${string}`; [key: string]: unknown }
export type ParagraphElement = BaseBlock & { type: 'paragraph'; title?: TitleLevel; list?: ListStyle; checked?: boolean; quote?: boolean; indentation?: number; listOrder?: number }
export type CodeElement = BaseBlock & { type: 'code-block'; language?: string; code?: string }
export type FormulaElement = BaseBlock & { type: 'formula'; source: string }
export type DividerElement = BaseBlock & { type: 'divider' }
export type ImageElement = BaseBlock & { type: 'image'; path?: string; alt?: string; width?: number; caption?: string; showCaption?: boolean; displayStyle?: 'plain' | 'rounded' | 'bordered' | 'shadow' }
export type VideoElement = BaseBlock & { type: 'video'; path?: string; name?: string; mimeType?: string; width?: number }
export type AttachmentElement = BaseBlock & { type: 'attachment'; name: string; path?: string; size?: number; mimeType?: string }
export type CardElement = BaseBlock & { type: 'card'; color?: string; icon?: string }
export type TableColumn = { id: string; width: number }
export type TableMerge = { id: string; rowIds: string[]; columnIds: string[] }
export type TableCellElement = BaseBlock & { type: 'table-cell'; rowId: string; columnId: string; backgroundColor?: string; verticalAlign?: 'top' | 'middle' | 'bottom' }
export type TableRowElement = BaseBlock & { type: 'table-row'; height?: number }
export type ColumnElement = BaseBlock & { type: 'column'; width?: number }
export type ColumnsElement = Omit<BaseBlock, 'children'> & { type: 'columns'; showDividers?: boolean; children: ColumnElement[] }
export type TableElement = BaseBlock & { type: 'table'; columns: TableColumn[]; merges: TableMerge[] }
export type DiagramNodeType = 'process' | 'decision' | 'terminator' | 'database' | 'document' | 'multiple-documents' | 'data' | 'subprocess' | 'manual-input' | 'preparation' | 'delay' | 'display' | 'storage' | 'connector' | 'off-page-connector' | 'merge' | 'card' | 'paper-tape' | 'actor' | 'use-case' | 'class' | 'object' | 'interface' | 'component' | 'package' | 'state' | 'activity' | 'lifeline' | 'boundary' | 'control' | 'entity' | 'group' | 'note' | 'text' | 'mind-topic'
export type DiagramEdgeType = 'smoothstep' | 'straight' | 'bezier' | 'step'
export type DiagramLineStyle = 'solid' | 'dashed' | 'dotted'
export type DiagramNode = { id: string; label: string; x: number; y: number; parentId?: string; shape?: DiagramNodeType; color?: string; fillColor?: string; textColor?: string; width?: number; height?: number; details?: string; lineStyle?: DiagramLineStyle; borderWidth?: number; fontSize?: number; opacity?: number; zIndex?: number }
export type DiagramEdge = { id: string; source: string; target: string; sourcePort?: string; targetPort?: string; sourcePoint?: { x: number; y: number }; targetPoint?: { x: number; y: number }; label?: string; lineType?: DiagramEdgeType; lineStyle?: DiagramLineStyle; animated?: boolean; color?: string; thickness?: number; fontSize?: number; opacity?: number; arrow?: 'none' | 'end' | 'both'; vertices?: Array<{ x: number; y: number }>; zIndex?: number }
export type MindMapNodeStyle = 'rounded' | 'pill' | 'square' | 'solid'
export type MindMapNode = { id: string; topic: string; expanded?: boolean; children?: MindMapNode[]; x?: number; y?: number; side?: 'left' | 'right'; color?: string; style?: MindMapNodeStyle }
export type MindMapData = { nodeData: MindMapNode; direction?: number }
type DiagramPresentation = { width?: number; aspectRatio?: number; previewSvg?: string; previewVersion?: number; contentWidth?: number; contentHeight?: number }
export type FlowchartElement = BaseBlock & DiagramPresentation & { type: 'flowchart'; nodes: DiagramNode[]; edges: DiagramEdge[] }
export type MindMapElement = BaseBlock & DiagramPresentation & { type: 'mindmap'; mindData: MindMapData }
export type DiagramElement = FlowchartElement | MindMapElement
export type LinkElement = BaseBlock & { type: 'link'; url: string }
export type RichElement = ParagraphElement | CodeElement | FormulaElement | DividerElement | ImageElement | VideoElement | AttachmentElement | CardElement | TableElement | TableRowElement | TableCellElement | ColumnsElement | ColumnElement | DiagramElement | LinkElement | CustomElement
export type RichNode = RichElement | RichText
export type RichEditor = BaseEditor & ReactEditor & HistoryEditor
export type EditorValue = Descendant[]

export type EditorLanguagePack = Readonly<Record<string, string>>
export type EditorMode = 'edit' | 'readonly'
export type ResourceKind = 'image' | 'video' | 'attachment'
export type ResourceMode = 'preview' | 'download'
export type UploadStatus = 'uploading' | 'error'

export interface ResourceInfo {
  kind: ResourceKind
  path: string
  name?: string
  size?: number
  mimeType?: string
}

export interface UploadResult {
  path: string
  name?: string
  size?: number
  mimeType?: string
  width?: number
  height?: number
}

export interface UploadContext {
  kind: ResourceKind
  signal: AbortSignal
  onProgress(progress: number): void
}

export type ResourceUploadHandler = (file: File, context: UploadContext) => Promise<UploadResult | string>

export interface ResourceConfig {
  uploadImage?: ResourceUploadHandler
  uploadVideo?: ResourceUploadHandler
  uploadAttachment?: ResourceUploadHandler
  resolveUrl?: (path: string, resource: ResourceInfo) => string | Promise<string>
  resolveDownloadUrl?: (path: string, resource: ResourceInfo) => string | Promise<string>
}

export interface ResourceUploadState {
  blockId: string
  kind: ResourceKind
  file: File
  status: UploadStatus
  progress: number
  previewUrl?: string
  error?: unknown
}

export interface DocumentHeading {
  id: string
  index: number
  level: 1 | 2 | 3 | 4 | 5
  text: string
}

export interface EditorSelectionState {
  marks: Partial<Omit<RichText, 'text'>>
  blockType?: RichElement['type']
  collapsed: boolean
}

export interface EditorCommands {
  columns(command: import('./columns').ColumnsCommand): void
  table(command: import('./tableCommands').TableCommand): void
  focus(): void
  blur(): void
  undo(): void
  redo(): void
  toggleMark(mark: keyof Omit<RichText, 'text'>, value?: string | number | boolean): void
  setFontFamily(fontFamily?: string): void
  toggleBlock(type: BlockType): void
  clearFormatting(): void
  insertLink(url: string, label?: string): void
  /** Insert a plugin-registered inline as one node; an expanded range is replaced atomically. */
  insertInline(element: RichElement, at?: Range): void
  removeLink(): void
  insertBlock(block: RichElement): void
  insertColumns(count: 2 | 3 | 4): void
  insertTable(rows: number, columns: number): void
  insertImage(resource: Omit<ImageElement, 'id' | 'type' | 'children'>): void
  insertFormula(source?: string): void
  insertVideo(resource: Omit<VideoElement, 'id' | 'type' | 'children'>): void
  insertAttachment(resource: Omit<AttachmentElement, 'id' | 'type' | 'children'>): void
  uploadImage(file: File): Promise<void>
  uploadMedia(file: File): Promise<void>
  uploadAttachment(file: File): Promise<void>
  cancelUpload(blockId: string): boolean
  selectAll(): void
}

export interface EditorQuery {
  isMarkActive(mark: keyof Omit<RichText, 'text'>): boolean
  isBlockActive(type: BlockType): boolean
  isLinkActive(): boolean
  canUndo(): boolean
  canRedo(): boolean
  getSelection(): EditorSelectionState | null
}

export interface RichTextEditorHandle {
  readonly editor: RichEditor
  readonly commands: EditorCommands
  readonly query: EditorQuery
  getValue(): EditorValue
  setValue(value: EditorValue): void
  getOutline(): DocumentHeading[]
  scrollToBlock(blockId: string, options?: ScrollIntoViewOptions): boolean
  retainSelection(): EditorRangeRef
  captureCommentAnchor(): unknown | null
  clearSelection(): void
  readonly findCapabilities: Readonly<{ literal: true; caseSensitive: true; regex: false; includesCode: true; excludesAtomic: true }>
  find(query: string, options?: EditorFindOptions): EditorFindMatch[]
  reveal(match: EditorFindMatch): boolean
  replace(match: EditorFindMatch, text: string): boolean
  replaceAll(query: string, text: string, options?: EditorFindOptions): number
}

export interface EditorRangeRef { readonly current: Range | null; dispose(): void }

export interface EditorFindOptions { caseSensitive?: boolean; includeCode?: boolean }
export type EditorFindMatch =
  | { id: string; revision: number; blockId: string; kind: 'text'; text: string; start: number; end: number; range: Range }
  | { id: string; revision: number; blockId: string; kind: 'code'; text: string; start: number; end: number }

export interface CollaborationAdapter {
  /** Suspend remote projection during native IME composition; local commit arrives before false. */
  setComposing?(composing: boolean): void
  /** Called once when the editor mounts. Return an optional cleanup function. */
  connect?(editor: RichEditor): void | (() => void) | Promise<void | (() => void)>
  /** Receives local Slate operations, suitable for translating to Yjs transactions. */
  onLocalChange?(value: EditorValue, operations: readonly Operation[]): void
  /** Subscribe to remote Slate operations. Prefer this over snapshots for large collaborative documents. */
  subscribeOperations?(callback: (operations: readonly Operation[]) => void): void | (() => void)
  /** Subscribe to a remote snapshot. The callback must not echo the change back. */
  subscribe?(callback: (value: EditorValue) => void): void | (() => void)
  awareness?: {
    setLocalState(state: Record<string, unknown>): void
    subscribe?(callback: (states: readonly Record<string, unknown>[]) => void): void | (() => void)
  }
  presence?: CollaborationPresenceAdapter
  /** Optional lifecycle signal exposed by Yjs providers. */
  getStatus?(): 'connecting' | 'syncing' | 'synced' | 'offline' | 'error'
}

export interface RemoteEditorSelection<TSelection = unknown> { sessionId: string; userId: string; name: string; color: string; selection: TSelection | null }
export interface CollaborationPresenceAdapter<TSelection = unknown> {
  sessionId: string
  capture(editor: RichEditor): TSelection | null
  resolve(editor: RichEditor, selection: TSelection): Range | null
  publish(selection: TSelection | null): void
  subscribe(callback: (selections: readonly RemoteEditorSelection<TSelection>[]) => void): void | (() => void)
}

/** Opaque relative positions are created/resolved by the external CRDT adapter. */
export interface CommentAnchorAdapter<TAnchor = unknown> {
  create(editor: RichEditor): TAnchor | null
  resolve(editor: RichEditor, anchor: TAnchor): import('slate').Range | null
}
export interface EditorComment<TAnchor = unknown> { id: string; anchor: TAnchor; resolved?: boolean }
export interface EditorComments<TAnchor = unknown> {
  adapter: CommentAnchorAdapter<TAnchor>
  items: readonly EditorComment<TAnchor>[]
  activeId?: string
  onAnchorClick?(id: string): void
}

export interface RichTextEditorProps {
  /** Optional insertion-menu allowlist (slash and block menus). Omit for all blocks.
   * This configures UI, not clipboard validation or a document schema restriction. */
  insertMenu?: readonly BlockType[]
  /** Accessible name for the editable surface. */
  ariaLabel?: string
  /** Keep the first block as H1; Enter creates a normal paragraph. */
  firstLineTitle?: boolean
  titlePlaceholder?: string
  bodyPlaceholder?: string
  initialValue?: EditorValue
  value?: EditorValue
  onChange?: (value: EditorValue) => void
  placeholder?: string
  mode?: EditorMode
  autoFocus?: boolean
  className?: string
  /** Enable browser rendering isolation after this many top-level blocks. Set false to disable it. */
  largeDocumentThreshold?: number | false
  collaboration?: CollaborationAdapter
  resources?: ResourceConfig
  comments?: EditorComments
  formulaRenderer?: import('./formula').FormulaRenderer
  /** Interface language. `zh` and omitted both show Chinese. Any other code shows English. */
  locale?: string
  /** Replaces individual dictionary keys. Does not replace the whole catalog. */
  messages?: Record<string, string>
  /** Full dictionary. When set, it replaces the catalog selected by `locale`. */
  language?: EditorLanguagePack
  onOutlineChange?: (headings: DocumentHeading[]) => void
  onReady?: (handle: RichTextEditorHandle) => void
  onUploadStateChange?: (states: readonly ResourceUploadState[]) => void
  plugins?: EditorPlugin[]
}

export interface EditorPlugin {
  key: string
  withEditor?: (editor: RichEditor) => RichEditor
  renderElement?: (props: RenderElementProps) => ReactElement | undefined
  renderLeaf?: (props: RenderLeafProps) => ReactElement | undefined
  isInline?: (element: RichElement) => boolean | undefined
  isVoid?: (element: RichElement) => boolean | undefined
}

declare module 'slate' {
  interface CustomTypes {
    Editor: RichEditor
    Element: RichElement
    Text: RichText
  }
}
