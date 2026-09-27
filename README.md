# @smartdoca/slate

[中文](README.zh-CN.md)

Embeddable collaborative rich text editor for React, built with Slate. The package owns the document canvas, selection, and block behavior. The host owns the toolbar, identity, assets, permissions, and network.

Licensed under [AGPL-3.0-only](LICENSE).

## Install

```sh
npm install @smartdoca/slate react react-dom slate slate-dom slate-history slate-react
```

`katex` is an optional peer. Import the stylesheet once:

```tsx
import { RichTextEditor } from "@smartdoca/slate";
import "@smartdoca/slate/style.css";

export function Editor() {
  return <RichTextEditor ariaLabel="Document" onChange={(value) => console.log(value)} />;
}
```

## Props

`RichTextEditor` accepts `RichTextEditorProps`.

| Prop | Type | Role |
|---|---|---|
| `insertMenu` | `readonly BlockType[]` | Limits slash and block insert menus. Omitted means every block. It does not restrict the schema or clipboard. |
| `ariaLabel` | `string` | Accessible name of the editable surface. |
| `firstLineTitle` | `boolean` | Keeps the first block as a title. Enter then creates a paragraph. |
| `titlePlaceholder`, `bodyPlaceholder`, `placeholder` | `string` | Empty-state copy. |
| `initialValue` | `EditorValue` | Value used when the editor mounts. |
| `value` | `EditorValue` | Controlled value. |
| `onChange` | `(value) => void` | Local document changes. |
| `mode` | `EditorMode` | `readonly` stops editing. |
| `autoFocus` | `boolean` | Focus the surface on mount. |
| `className` | `string` | Class on the editor root. |
| `largeDocumentThreshold` | `number \| false` | Enables rendering isolation after this many top-level blocks. `false` disables it. |
| `collaboration` | `CollaborationAdapter` | Host bridge for local operations, remote updates, and presence. |
| `resources` | `ResourceConfig` | Host upload and URL resolution. |
| `comments` | `EditorComments` | Host-owned comment UI. |
| `formulaRenderer` | `FormulaRenderer` | Renders formula blocks. |
| `locale` | `string` | `zh` and omitted stay Chinese. Any other code shows English. |
| `messages` | `Record<string, string>` | Replaces individual dictionary keys. |
| `language` | `EditorLanguagePack` | Replaces the catalog selected by `locale`. |
| `onOutlineChange` | `(headings) => void` | Heading outline updates. |
| `onReady` | `(handle) => void` | Receives `RichTextEditorHandle` once. |
| `onUploadStateChange` | `(states) => void` | Resource upload progress. |
| `plugins` | `EditorPlugin[]` | Slate element, leaf, inline, and void extensions. |

Changing these props must not remount the editor or create a new document.

## Collaboration

Pass `collaboration` instead of opening a second socket or autosave path.

- `onLocalChange` receives local Slate operations. Translate those into the host Yjs transaction.
- Apply remote updates through `subscribe` or `subscribeOperations`. Do not echo them back through `onLocalChange`.
- `mode="readonly"` does not publish edits.
- `collaboration.presence` publishes the selection for this browser tab. The host assigns session id, name, and color. Two tabs of the same account are two sessions.
- Comment anchors are stored by the host. They are not presence coordinates.

Other entry points:

| Import | Use |
|---|---|
| `@smartdoca/slate/yjs` | Yjs document helpers for the rich-text codec. |
| `@smartdoca/slate/conversion` | Import and export. |
| `@smartdoca/slate/headless` | Read and create a document without mounting React. |
| `@smartdoca/slate/codec` | Codec and schema identifiers. |
| `@smartdoca/slate/katex` | Formula rendering. |
| `@smartdoca/slate/languages` | Syntax highlighting languages. |
