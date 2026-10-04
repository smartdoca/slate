# @smartdoca/slate

[English](README.md)

可嵌入的 React 协同富文本编辑器，基于 Slate。包负责文档画布、选区和块行为。宿主负责工具栏、身份、资源、权限和网络。

许可证为 [MIT](LICENSE)。

## 安装

```sh
npm install @smartdoca/slate react react-dom slate slate-dom slate-history slate-react
```

`katex` 是可选 peer。样式引入一次：

```tsx
import { RichTextEditor } from "@smartdoca/slate";
import "@smartdoca/slate/style.css";

export function Editor() {
  return <RichTextEditor ariaLabel="文档" onChange={(value) => console.log(value)} />;
}
```

## Props

`RichTextEditor` 接收 `RichTextEditorProps`。

| Prop | 类型 | 作用 |
|---|---|---|
| `insertMenu` | `readonly BlockType[]` | 限制斜杠菜单和块菜单。省略时包含全部块。不限制 schema 或剪贴板。 |
| `ariaLabel` | `string` | 编辑区的无障碍名称。 |
| `firstLineTitle` | `boolean` | 首块保持为标题，回车后新建段落。 |
| `titlePlaceholder`、`bodyPlaceholder`、`placeholder` | `string` | 空文档提示。 |
| `initialValue` | `EditorValue` | 挂载时的初始值。 |
| `value` | `EditorValue` | 受控值。 |
| `onChange` | `(value) => void` | 本地文档变更。 |
| `mode` | `EditorMode` | `readonly` 时停止编辑。 |
| `autoFocus` | `boolean` | 挂载后聚焦。 |
| `className` | `string` | 根节点类名。 |
| `largeDocumentThreshold` | `number \| false` | 顶层块超过该数量后启用渲染隔离。`false` 关闭。 |
| `collaboration` | `CollaborationAdapter` | 本地操作、远端更新和在线选区的宿主桥。 |
| `resources` | `ResourceConfig` | 宿主上传和 URL 解析。 |
| `onAttachmentPreview` | `(attachment: AttachmentElement) => void` | 宿主实现附件预览，接收稳定 path 和元信息。编辑时先选中、再次点击预览；只读时单击预览。 |
| `comments` | `EditorComments` | 宿主拥有的评论界面。 |
| `formulaRenderer` | `FormulaRenderer` | 公式块渲染。 |
| `locale` | `string` | `zh` 和省略为中文，其他代码为英文。 |
| `messages` | `Record<string, string>` | 替换单个文案键。 |
| `language` | `EditorLanguagePack` | 替换 `locale` 选中的整本词典。 |
| `onOutlineChange` | `(headings) => void` | 标题大纲更新。 |
| `onReady` | `(handle) => void` | 得到一次 `RichTextEditorHandle`。 |
| `onUploadStateChange` | `(states) => void` | 资源上传进度。 |
| `plugins` | `EditorPlugin[]` | Slate 元素、叶子、行内和 void 扩展。 |

修改这些 props 不能重建编辑器，也不能新建文档。

## 协同

传入 `collaboration`，不要再开第二条 socket 或自动保存通道。

- `onLocalChange` 收到本地 Slate 操作，由宿主写入 Yjs。
- 远端更新走 `subscribe` 或 `subscribeOperations`，不能再从 `onLocalChange` 回声。
- `mode="readonly"` 不发布编辑。
- `collaboration.presence` 发布当前浏览器标签的选区。会话编号、姓名和颜色由宿主分配。同一账号的两个标签是两个会话。
- 评论锚点由宿主保存，不是在线选区坐标。

其他入口：

| 引入 | 用途 |
|---|---|
| `@smartdoca/slate/yjs` | 富文本 Yjs 辅助函数。 |
| `@smartdoca/slate/conversion` | 导入和导出。 |
| `@smartdoca/slate/headless` | 不挂载 React 时读写文档。 |
| `@smartdoca/slate/codec` | codec 和 schema 标识。 |
| `@smartdoca/slate/katex` | 公式渲染。 |
| `@smartdoca/slate/languages` | 代码高亮语言。 |
