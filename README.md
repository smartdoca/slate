# Slate Kit Editor

一套基于 Slate、React 和 TypeScript 的飞书风格富文本编辑器。npm 包只负责文档画布、选区浮层和 Block 交互；产品顶部工具栏、标题导航、网络层与存储层由接入方组合。

## 能力

- 加粗、斜体、下划线、删除线、行内代码、12–32px 字号、文字颜色、文字背景色与链接；选区浮动工具栏在连续操作时锁定原锚点，链接通过内嵌面板输入并在点击后安全地从新窗口打开
- H1–H5 多级标题、引用、有序/无序列表、待办、代码块、分割线
- 文本行支持 Tab/Shift+Tab 逐级缩进；列表回车延续同层项目，空列表行回车退出列表，行首退格按“列表样式 → 缩进层级”依次移除。有序列表按层级循环使用 `1.`、`a.`、`A.`，无序列表按层级切换项目符号
- 支持常用 Markdown 行首快捷输入：`* `、`- `、`+ ` 创建无序列表，`1. ` 创建有序列表，`[] ` / `[ ] ` 创建待办，`# `–`##### ` 创建多级标题，`> ` 创建引用
- 正文采用可组合的属性化 block 模型：同一个 `paragraph` 可同时携带 `title`、`list`、`checked`、`quote`、`align`、`indentation`，切换单项不会清除其他属性
- 相邻引用行使用连续的蓝色左边线和浅色文字，不铺背景；引用可与列表、待办和标题组合。引用边线不参与缩进，内部文字仍可使用 Tab/Shift+Tab 调整层级
- 选区悬浮样式栏（随滚动实时定位）、每个顶层块左侧操作区、`/` 插入菜单
- Block 支持统一的结构化复制粘贴：左侧控制点单击选择，Shift 连续选择，⌘/Ctrl 追加选择；多 Block 可整体复制、粘贴和删除。粘贴会重建节点、连线及合并单元格内部 ID，避免副本相互串联
- 通过 `onOutlineChange`/`getDocumentOutline` 输出 H1–H5 目录数据；目录 UI 由业务渲染
- 左侧每行只有一个控制按钮：空行显示 `+`，非空行显示编辑/拖拽手柄；点击后打开 Block 面板。上方/下方插入使用右侧二级菜单，可选择空白文本、代码、图示、卡片或分割线
- 飞书式表格上下文操作：普通单击只进入文字编辑，不显示单元格背景或表格工具栏；跨单元格拖选或 Shift 扩选后切换为矩形单元格选区，显示紧凑表格格式栏并强制隐藏文字工具栏
- 表格采用固定像素列宽，超宽后内部横向滚动。上沿和左沿每个行列边界（含首尾）都有插入点，悬停变为加号并显示插入位置参考线；点击控制轨选中整行/整列，在统一工具栏中设置内容样式、插入或删除对应行列。单元格右键菜单支持批量增加行列和拆分单元格
- 非文本 Block 被选中时，或焦点位于其左侧 Block 按钮时，按 Enter 可直接在下方插入空白文本行
- 列宽、行高继续由边界线直接拖拽调整；边界控制仅在命中对应线时显现，不再混放增删按钮
- 单元格本身也是富文本 block 容器，可使用标题、列表、待办、引用、代码块、图片、附件、卡片、流程图和思维导图；Block 菜单保留上方/下方插入能力，仅禁止嵌套表格。空单元格轻微拖拽可选中，非空单元格选择全部文字并拖过文字末端可提升为单元格选区
- 矩形选区会覆盖完整合并单元格，工具栏支持合并、拆分、背景色和水平/垂直对齐；表格持久层采用稳定的行、列、单元格 ID 与独立 `merges`，不保存隐藏格、placements 或跨度快照；拆分仅移除合并关系，内容全部保留在锚点，不恢复历史内容
- 图片上传/粘贴、右下角拖拽点等比缩放、对齐，以及无样式、圆角、边框、阴影四种展示样式；工具栏、`/附件` 与 Block 插入菜单均支持附件上传，并按 PDF、文档、表格、演示、压缩包、图片、音视频、代码、文本和通用文件展示不同图标与主题色；卡片图标可点击选择预设 Emoji 或输入自定义内容
- 代码块使用浅色 Prism 语法高亮，支持纯文本、TypeScript/JavaScript、TSX/JSX、HTML/CSS、JSON、Markdown、YAML、Shell、SQL、Python、Java、C/C++/C#、Go、Rust、PHP、Ruby、Kotlin、Swift、Objective-C、Dart、Scala、Lua、R、GraphQL 和 Dockerfile；编辑区随代码行数自动增高，支持稳定的多行输入、中文输入和 Tab 缩进
- 基于 AntV X6 的全屏流程图和 UML 画板；内置流程/UML 图形，支持搜索拖入、框选多选、批量移动、节点缩放、网格吸附、撤销重做、复制粘贴、双击编辑，以及拖动路径点、线段和端点调整连线
- 流程图的图形库与画布使用相同的形状轮廓。支持 `Ctrl/⌘ + A/C/V/X/Z` 全选、复制、粘贴、剪切、撤销，`Ctrl/⌘ + Shift + Z` 重做，`Ctrl/⌘ + D` 创建副本；编辑节点文字时这些快捷键只作用于文字。连线单击选中、双击编辑文字，端点和线段控制点可拖动，连线文字用 Shift+Enter 换行、Enter 完成。
- 思维导图基于 AntV X6，支持子树拖拽、拖到高亮节点上调整父级、一级分支跨越中心切换左右方向、分支折叠、多行编辑、节点/子树样式、复制粘贴、撤销重做和 SVG 导出。滚轮平移，Ctrl/⌘ + 滚轮缩放
- 图示由 X6 按真实画布内容边界导出 SVG，导出时自动清除锚点及编辑控件；普通图片、流程图和思维导图均为单击选中，右上角通过独立放大按钮进入浅色大图预览，并保留右键下载
- 受控/非受控和只读/编辑模式，以及面向 Yjs 等 CRDT 的协作适配器接口
- `EditorPlugin` 可增强 editor、声明 inline/void 行为并覆盖自定义元素/叶子渲染；自定义 Block 使用 `custom:*` 命名空间

## 接入手册目录

项目内部设计请见 [项目架构](./docs/ARCHITECTURE.md)；本页只讲安装、使用、集成契约和注意事项。局部片段依赖同节前面的变量；完整组件/函数可单独保存为对应 `.tsx`/`.ts` 文件。

- [安装与导出入口](#安装与导出入口)
- [Word 与 Markdown 导入导出](#word-与-markdown-导入导出)
- [最小可运行示例](#最小可运行示例)
- [加载、保存与只读](#加载保存与只读)
- [组件属性](#组件属性)
- [外部工具栏与控制方法](#外部工具栏与控制方法)
- [标题目录](#标题目录)
- [图片附件上传与 CDN](#图片附件上传与-cdn)
- [国际化](#国际化)
- [文档结构与 Block 创建](#文档结构与-block-创建)
- [表格命令](#表格命令)
- [自定义组件与插件](#自定义组件与插件)
- [Yjs 协同接入](#yjs-协同接入)
- [后端与 Agent](#后端与-agent)
- [评论与在线状态](#评论与在线状态)
- [性能、安全与常见问题](#性能安全与常见问题)
- [开发与打包](#开发与打包)

## 安装与导出入口

当前项目版本为 `0.4.2`。仓库中的包配置不代表已经发布到公共 npm；未发布时请使用本地 tarball 或内部 registry。

```bash
# 在本项目生成安装包
npm run build:lib
npm pack

# 在消费项目安装上一步生成的文件（路径按实际位置修改）
npm install /absolute/path/slatetsx-kit-editor-0.4.2.tgz

# 本仓库使用的 React / Slate 版本组合
npm install react@19.1.1 react-dom@19.1.1 slate@0.118.1 slate-dom@0.118.1 slate-react@0.118.2 slate-history@0.113.1
```

发布到有权限访问的 registry 后，可以使用 `npm install slatetsx-kit-editor@0.4.2`。React/Slate 是 peer dependencies；已有应用不要盲目覆盖 React 版本。包声明支持 React ≥18.2，但不代表所有 Slate 版本组合均经过验证，建议先使用上述组合集成测试，再锁定 lockfile。

`0.4.2` 增强 Markdown 交换：富文本基础结构可往返，图片只携带稳定资源 path，外部图片不自动下载，并为业务节点、HTML、Mermaid 和公式提供降级 warning；不改变 Yjs schema 3 或 checkpoint 格式。性能证据和 Doca 接入注意事项见 [大文档性能说明](./docs/PERFORMANCE.md)。

| 导入路径 | 用途 |
| --- | --- |
| `slatetsx-kit-editor` | React 编辑器、命令、查询、类型、schema、表格工具、资源 hooks、语言包 |
| `slatetsx-kit-editor/style.css` | 编辑器与内置浮层样式，消费项目显式引入 |
| `slatetsx-kit-editor/headless` | 无 UI/CSS 的文档、ID、目录与表格 reducer 工具 |
| `slatetsx-kit-editor/yjs` | 宿主注入的 Yjs 会话、绑定、相对选区、评论锚点和可选低级协议工具 |
| `slatetsx-kit-editor/codec` | 无 React/DOM/Prism 的纯 codec 常量、原子 schema 类型与构造器，适合 Node 服务端 |
| `slatetsx-kit-editor/conversion` | 不依赖编辑器挂载的 Markdown/DOCX 导入导出、资源回调、warnings 和类型化错误 |
| `slatetsx-kit-editor/languages` | 独立 `zhCN` / `enUS` 字典 |

提供 ESM、CommonJS 和 TypeScript 声明。React 编辑器依赖浏览器 DOM；Next.js 等项目请在客户端组件中使用，必要时关闭该组件的 SSR。后端不要导入带样式的主入口。

## Word 与 Markdown 导入导出

`slatetsx-kit-editor/conversion` 提供不依赖编辑器挂载的模型级转换：导入 `.md/.markdown/.docx`，导出 `.md/.docx`。旧二进制 `.doc` 与 JSON 文件导入导出均不支持。转换器只返回初始模型、资源清单、warnings 或带类型的 Blob；它不创建 Doca 文档、不打开协同连接、不修改编辑器、也不直接下载文件。图片与附件必须通过宿主资源回调重新上传或授权读取。

Markdown 交换是 Doca 的富文本/PDF 桥接边界：`富文本 -> slatetsx exportDocument({ format: 'markdown' }) -> exmd -> PDF`，以及 `PDF -> exmd -> slatetsx importDocument -> 富文本`。导出图片会调用 `resolveResource(resource, 'embed')`，但 Markdown 只写入模型中的稳定 `path`，不会写入 blob、data 或临时签名 URL；导入稳定图片 path 会以 `source: 'embedded'` 交给 `importResource` 重新绑定。HTTP/HTTPS/blob/FTP 图片不自动请求，返回 `external-resource` warning。

可读文本降级并产生 warning 的内容包括 `custom:*`/业务原子节点、公式、Mermaid/Flow/DOT 图、复杂或不规则表格、未支持的 HTML，以及 columns、flowchart、mindmap、video、attachment 等不能由 Markdown 原生表达的节点。图片资源回调失败时保留 `[Image: …]`，不会静默丢失后续正文。完整资源字段、错误结构和兼容性矩阵见 [Word/Markdown 导入导出契约](./docs/IMPORT_EXPORT.md)。

完整 API、格式降级规则、取消/大小限制、资源边界、示例和实际文件测试见 [Word/Markdown 导入导出契约](./docs/IMPORT_EXPORT.md)。

导入采用“尽量保留内容”策略：不支持的内容转为可读文字或占位；单张图片读取、上传失败保留说明或 `[Image: …]`，继续导入其余内容并在 `warnings` 中返回提示。业务侧应展示警告，**不要因为 `warnings.length > 0` 把导入当作失败**。只有文件无法解析、格式不支持、安全限制超限等不可继续的情况才拒绝 Promise；用户取消也会终止导入。

## 最小可运行示例

标题与正文占位提示可分别配置；仅在编辑模式的对应空行展示，不保存进文档数据。传空字符串可隐藏该提示：

```tsx
<RichTextEditor
  firstLineTitle
  titlePlaceholder="请输入标题"
  bodyPlaceholder="请输入正文"
/>
```

开启 `firstLineTitle` 时，空文档自动保留标题和正文两行。未传入提示词时使用中英语言包中的 `document.titlePlaceholder` / `document.bodyPlaceholder`；正文也兼容原有 `placeholder` 属性（`bodyPlaceholder` 优先）。

需要固定首行为文档标题时，传入 `<RichTextEditor firstLineTitle />`（默认 `false`）。首个文本 Block 会规范为 `paragraph + title: 'h1'`，已有文字和 ID 保留；若首个 Block 是图片、表格等非文本内容，则在其前面补一个空标题，不破坏原内容。标题行回车后新行是正文，对齐和标题信息仍保存在文档中。关闭配置不会主动清除已有标题样式。

这是文档结构约束，不是单纯的 CSS：协同接入时所有编辑端应使用相同配置，并在初始化共享文档时预置首个标题 Block。上方/下方创建的类型列表以独立侧边子菜单展示，不占主菜单高度。

将下面组件放进已有 React + TypeScript 应用即可使用。这个例子采用手动保存到浏览器的方式，不依赖业务接口；浏览器存储仅用于演示，不应作为生产备份。

```tsx
import { useRef, useState } from 'react'
import {
  RichTextEditor, createEditorDocument, readEditorDocument,
  type EditorValue, type RichTextEditorHandle,
} from 'slatetsx-kit-editor'
import 'slatetsx-kit-editor/style.css'

const storageKey = 'slate-kit-demo-document'
const emptyValue: EditorValue = [
  { id: 'welcome', type: 'paragraph', children: [{ text: '' }] },
]

export function DocumentPage() {
  const editor = useRef<RichTextEditorHandle>(null)
  const [readonly, setReadonly] = useState(false)
  const [message, setMessage] = useState('')
  const [initialValue] = useState<EditorValue>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? readEditorDocument(JSON.parse(raw)).children : emptyValue
    } catch { return emptyValue } // 生产环境应展示错误，不要静默覆盖损坏文档。
  })

  function save() {
    if (!editor.current) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(createEditorDocument(editor.current.getValue())))
      setMessage('已保存')
    } catch { setMessage('保存失败，请检查存储空间') }
  }

  return <main>
    <header>
      <button onClick={() => setReadonly(value => !value)}>{readonly ? '编辑' : '只读'}</button>
      <button disabled={readonly} onMouseDown={event => event.preventDefault()}
        onClick={() => editor.current?.commands.toggleMark('bold')}>加粗</button>
      <button onClick={save}>保存</button>
      <span role="status">{message}</span>
    </header>
    <RichTextEditor ref={editor} initialValue={initialValue}
      mode={readonly ? 'readonly' : 'edit'} placeholder="开始写作…" />
  </main>
}
```

不传 `initialValue` 时会使用包内示例文档，并非空文档；新建空白文档请显式传入至少一个空段落。上面的固定 ID 只用于单个示例文档，动态创建请使用 `createId()`。

## 加载、保存与只读

**非协同模式推荐非受控接入**：先加载数据，再挂载 `<RichTextEditor initialValue={loaded.children} />`。`initialValue` 只在初始化时读取；切换文档建议以业务 documentId 作为 React `key` 重新挂载。

- `createEditorDocument(value)` 返回 `{ schemaVersion: 2, children }`，用于普通 JSON 持久化。
- `readEditorDocument(snapshot)` 校验版本并准备当前结构；不提供旧版表格迁移，也不是完整的不可信 JSON 安全校验器。
- `ensureStableIds(value)` 补齐缺失 ID，重复 ID 会报错；`assertUniqueIds(value)` 可单独检查唯一性。
- `onChange(value)` 可用于保存草稿、刷新外部工具栏；选区变化也可能触发，请防抖、去重，避免每次回调立即全量保存。
- `getValue()` 返回当前树，业务不要原地修改它。需要独立副本时使用 `structuredClone()`。
- `setValue(value)` 是整篇替换，会清空本地撤销历史；不用于逐字更新或协同远端增量。

如确有受控需求：

```tsx
const [value, setValue] = useState<EditorValue>(initialDocument.children);
<RichTextEditor value={value} onChange={setValue} />
```

不要每次渲染都深拷贝 `value`，也不要把延迟保存返回的旧快照重新灌入正在编辑的文档。协同模式让 Yjs 适配器管理内容，不同时使用受控 `value` 或反复调用 `setValue`。

`mode="readonly"` 可实时切换：隐藏编辑控制，保留文字选择、链接、附件下载和大图查看。`commands` 的修改操作在只读时不执行，上传命令拒绝；切换到只读会中止在途上传，晚到的上传结果不会写回文档。`setValue`、底层 `editor`、插件和 `YjsDocument` 属于程序能力，不是权限屏障；只读用户的写权限仍必须在服务端校验。

## 组件属性

| 属性 | 类型 / 默认值 | 说明 |
| --- | --- | --- |
| `initialValue` | `EditorValue` / 示例文档 | 非受控初值 |
| `value` | `EditorValue` | 受控内容；外部不同内容将整篇替换 |
| `onChange` | `(value: EditorValue) => void` | 内容或选区变化回调 |
| `mode` | `'edit' \| 'readonly'` / `'edit'` | 编辑模式 |
| `placeholder` | `string` / 语言包默认文案 | 空白提示 |
| `autoFocus` | `boolean` / `false` | 自动聚焦 |
| `className` | `string` / `''` | 根容器附加类名 |
| `largeDocumentThreshold` | `number \| false` / `300` | 大文档渲染优化阈值；不是加载分页，`false` 关闭 |
| `resources` | `ResourceConfig` | 上传与地址解析，见下文 |
| `language` | `EditorLanguagePack` / `zhCN` | 文案映射 |
| `plugins` | `EditorPlugin[]` / `[]` | 保持引用稳定，变化会重建 editor |
| `collaboration` | `CollaborationAdapter` | 推荐通过 `createYjsAdapter` 生成并保持稳定 |
| `onOutlineChange` | `(headings: DocumentHeading[]) => void` | 输出目录数据；可能重复返回相同内容 |
| `onReady` | `(handle: RichTextEditorHandle) => void` | 取得控制实例；并非上传运行时或网络同步完成通知 |
| `onUploadStateChange` | `(states: readonly ResourceUploadState[]) => void` | 上传与错误状态；成功项目从列表移除 |
| `ref` | `Ref<RichTextEditorHandle>` | 命令、查询及内容读写入口 |

## 外部工具栏与控制方法

包只含文档画布及内部 Block、单元格、选中文字浮层；**不渲染产品顶部工具栏、目录侧栏或业务导航**。业务按钮调用 `ref.current.commands`，无需放在 Slate context 中。

样式按钮使用 `onMouseDown={event => event.preventDefault()}` 保住原选区，再在 `onClick` 调命令。需要输入内容的链接框不要对输入框阻止默认事件；自行保存/恢复选区或使用内置链接浮层。不要先 `blur()` 再改选中文字。

| `commands` 方法 | 参数 / 行为 |
| --- | --- |
| `focus()` / `blur()` | 聚焦 / 失焦 |
| `undo()` / `redo()` | 本地撤销 / 重做；Yjs 绑定后使用协同撤销管理器 |
| `toggleMark(mark, value?)` | mark 为 `bold/italic/underline/strikethrough/code/fontSize/color/backgroundColor`；默认值 `true`，已有同值时取消 |
| `toggleBlock(type)` | 切换段落、标题、列表、待办、引用等；如 `heading-one`、`numbered-list`、`todo`、`block-quote` |
| `clearFormatting()` | 清除所选文字基础样式 |
| `setFontFamily(fontFamily?)` | 设置选中文字或后续输入的字体；省略或空字符串恢复默认字体 |
| `insertLink(url, label?)` / `removeLink()` | 添加 / 取消链接；链接在新窗口打开 |
| `insertInline(element, retainedRange?)` | 插入已注册的 `custom:*` 原子 inline；可使用 `retainSelection()` 返回的范围 |
| `insertBlock(block)` | 插入完整 `RichElement` |
| `insertTable(rows, columns)` | 创建表格 |
| `table(command)` | 按 ID 执行表格命令，详见下一节 |
| `insertImage(resource)` | `{ path, alt?, width?, displayStyle?, align? }`，不上传 |
| `insertVideo(resource)` | `{ path, name?, mimeType?, width?, align? }`，插入原生视频播放器，不上传 |
| `insertAttachment(resource)` | `{ path, name, size?, mimeType? }`，不上传 |
| `uploadImage(file)` / `uploadAttachment(file)` | `Promise<void>`；调用资源回调并显示占位 |
| `uploadMedia(file)` | `Promise<void>`；按 MIME（缺失时按扩展名）自动识别图片/视频，其他文件按附件上传 |
| `cancelUpload(blockId)` | 按上传状态中的稳定占位 ID 取消，返回是否找到在途任务 |
| `selectAll()` | 选择文档 |

除上传外上述命令均返回 `void`。颜色示例：`toggleMark('color', '#1677ff')`；字号：`toggleMark('fontSize', 20)`。`clearFormatting` 不是清空内容，也不是清除所有 Block 属性。当前没有独立的公开 `commands.formatPainter` 方法，格式刷可使用内置选区工具栏。

选中文字后的工具栏提供默认字体、黑体、宋体、楷体、等宽字体。SDK 导出 `FONT_FAMILIES`（`key` 和 CSS `value`），外部工具栏可调用 `commands.setFontFamily(FONT_FAMILIES[2].value)`，恢复默认调用 `commands.setFontFamily()`。字体存储在文字的 `fontFamily` mark 中，支持内部复制、格式刷、清除格式和现有 Yjs 协同/checkpoint；不需要新增保存接口。Markdown 等外部格式不保证保留字体。

字体使用本机已安装字体及回退字体，不额外下载或打包字体文件；不同系统显示可能略有差异。宿主可自行加载字体，再传入 CSS font-family 字符串。仅调整整个编辑器默认外观时，可在编辑器容器设置 `--sk-document-font: "PingFang SC", sans-serif`（此 CSS 配置不作为文档内容保存）。默认正文 16px、行高 1.75，正文标题 H1–H5 为 28/24/20/18/16px；开启 `firstLineTitle` 时首行标题为 34px。

`query` 是即时查询而非 React 状态订阅：

- `isMarkActive(mark)`、`isBlockActive(type)`、`isLinkActive()`、`canUndo()`、`canRedo()` 返回布尔值。
- `getSelection()` 返回 `{ marks, blockType?, collapsed } | null`，不是可恢复的完整 Slate Range。
- 外部按钮高亮可在 `onChange` 中读取这些值并更新业务状态；防止只读一次后永不刷新。

实例还提供 `getValue()`、`setValue(value)`、`getOutline()`、`scrollToBlock(id, options?)`、`retainSelection()`、`captureCommentAnchor()` 和 `clearSelection()`。`retainSelection()` 返回可随编辑变换的 range ref，用完必须 `dispose()`；`scrollToBlock` 接受标准 `ScrollIntoViewOptions`，找不到 DOM 时返回 `false`。`handle.editor` 是低级 Slate 实例，直接修改可能绕过只读和协同命令校验，优先使用公开命令。

### 模型级查找替换

搜索面板、快捷键和权限由宿主实现，编辑器实例提供模型操作：

```ts
const matches = editor.current?.find('关键词', { caseSensitive: false, includeCode: true }) ?? []
editor.current?.reveal(matches[0])
editor.current?.replace(matches[0], '新文字')
const count = editor.current?.replaceAll('旧文字', '新文字') ?? 0
```

- `find` 是字面量搜索，默认不区分大小写并包含代码块；不支持正则。
- 普通文字可跨多个不同格式的 leaf 匹配；宿主声明为 void 的原子节点不参与搜索。
- match 与当前文档修订绑定。正文发生本地或远端变化后，旧 match 的 `reveal/replace` 返回 `false`，宿主应重新查询。
- `replaceAll` 从后向前应用，并合并成一个撤销批次；只读模式返回 `0`，不会修改内容。
- 替换通过正常 Slate transaction 进入协同适配器，不应再由宿主发送另一条保存请求。
- `findCapabilities` 明确报告当前支持 literal、大小写选项、代码块和原子节点排除；当前 `regex` 为 `false`。

`EditorFindMatch` 是判别联合：普通文字为 `{ kind: 'text', blockId, text, start, end, range, revision, id }`，代码块为 `{ kind: 'code', blockId, text, start, end, revision, id }`。`range` 是包内定位数据，不应持久化或跨文档复用；宿主可以用 `id` 管理当前结果列表。`replace` 成功返回 `true`，只读、目标已变化或范围失效时返回 `false`；`replaceAll` 返回实际替换数量。空查询返回空数组，匹配不重叠。

Doca 接入时应使用 handle 的模型能力替代直接遍历 Slate/DOM 的搜索实现。宿主仍负责搜索框、当前结果序号、CSS Highlight 和快捷键；收到正文 `onChange` 后重新调用 `find`。不要把 `find` 结果写入文档、业务历史或协同 presence。

## 标题目录

`DocumentHeading` 为 `{ id: string, index: number, level: 1|2|3|4|5, text: string }`。当前只收集**顶层非空标题**，不包含表格内标题；返回扁平列表，缩进由 `level` 决定。`index` 是当时的顶层数组位置，跳转应使用稳定 `id`。

```tsx
const [headings, setHeadings] = useState<DocumentHeading[]>([]);
// DocumentHeading、RichTextEditorHandle 从 slatetsx-kit-editor 导入。
<>
  <nav aria-label="文档目录">
    {headings.map(heading => <button key={heading.id}
      style={{ paddingLeft: (heading.level - 1) * 16 }}
      onClick={() => editor.current?.scrollToBlock(heading.id)}>{heading.text}</button>)}
  </nav>
  <RichTextEditor ref={editor} className="business-document" onOutlineChange={setHeadings} />
</>
```

有吸顶导航时，业务需要设置滚动偏移，例如：

```css
.business-document [data-block-id] { scroll-margin-top: 96px; }
```

当前章节高亮由业务计算：根据滚动容器和吸顶偏移，选出距参考线最近的**一个**标题 ID；不要把所有进入视口的标题都设为 active。同页面多个编辑器请避免跨实例复用相同 Block ID，因为当前跳转按页面 DOM 查找。

## 图片附件上传与 CDN

支持直接粘贴截图、复制的图片、视频以及剪贴板中的文件（可一次混合粘贴多个）。图片调用 `resources.uploadImage`，视频调用 `resources.uploadVideo`（未提供时复用 `uploadAttachment`），其他文件调用 `resources.uploadAttachment`，无需额外配置粘贴事件。每个文件会立即插入独立占位，图片/视频显示本地预览；上传方法调用 `onProgress(0～1)` 更新百分比，失败显示失败状态，成功按节点 ID 填入资源 path，不会因上传完成顺序不同而打乱顺序。`onUploadStateChange` 同样能获取这些任务。

浏览器必须实际提供剪贴板 `File` 数据；仅复制文件路径、网页图片 URL 或不暴露文件的系统剪贴板不等同于文件上传。编辑器内复制已上传的图片/附件会复用资源 path，不会重复上传。未配置对应上传方法会显示失败占位；删除失败占位后可重新粘贴。只读模式不执行粘贴上传。

文档只保存长期稳定的资源 `path` 和元信息。上传时可以有 `path: ''` 的占位节点；临时 blob 预览、File、进度和错误在运行时，不应序列化进文档。离线或刷新后不会自动恢复上传任务。

```ts
import type { ResourceConfig, ResourceUploadHandler, UploadResult } from 'slatetsx-kit-editor'

// 示例服务约定：POST /api/resources 接受 multipart，返回 JSON { path, name?, size?, mimeType?, width? }。
// 这是业务需要实现的接口，不是包内提供的服务。
const upload: ResourceUploadHandler = (file, { signal, onProgress, kind }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/resources')
    xhr.responseType = 'json'
    const abort = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onerror = () => { cleanup(); reject(new Error('上传网络错误')) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    xhr.onload = () => {
      cleanup()
      const result = xhr.response as UploadResult | null
      if (xhr.status < 200 || xhr.status >= 300 || !result || typeof result.path !== 'string' || !result.path) {
        reject(new Error('上传失败或返回值无效')); return
      }
      resolve(result)
    }
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    xhr.send(form)
  })

export const resources: ResourceConfig = {
  uploadImage: upload,
  uploadVideo: upload,
  uploadAttachment: upload,
  resolveUrl: path => `https://cdn.example.com/${path.split('/').map(encodeURIComponent).join('/')}`,
  resolveDownloadUrl: path => `/api/download?path=${encodeURIComponent(path)}`,
}
```

将 `resources` 传入编辑器；内置上传入口和 `commands.upload*` 共用此配置。自定义文件按钮：

```tsx
<>
<input type="file" accept="image/*,video/*" disabled={readonly} onChange={async event => {
  const file = event.currentTarget.files?.[0]
  event.currentTarget.value = ''
  if (file) {
    try { await editor.current?.commands.uploadMedia(file) }
    catch (error) { console.error('无法开始上传', error) }
  }
}} />
<RichTextEditor ref={editor} resources={resources} onUploadStateChange={states => {
  // status: uploading | error，progress: 0–1；成功后对应项目被移除。
  // 上传进行中的服务端失败在这里报告，不能只依赖上面 catch。
  const failed = states.filter(state => state.status === 'error')
  if (failed.length) console.error('上传失败', failed.map(state => state.error))
}} />
</>
```

接入注意：

- 内置入口统一为“图片/视频”，根据文件类型生成 `image` 或 `video` 节点。视频持久化 `{ type: 'video', id, path, name?, mimeType?, width?, children: [{ text: '' }] }`；复制粘贴、JSON 和 Yjs 均保留此节点。资源回调的 `kind` 新增 `video`，业务的类型判断需包含它。
- 视频采用原生 HTML5 `<video controls playsInline preload="metadata">`，可播放、拖动进度、调音量、全屏（具体控件由浏览器提供）；不自动播放、不包含视频剪辑或转码。可拖拽右下角调整展示宽度。只读也可播放。浏览器不支持的编码显示错误提示及下载入口；上传端需自行限制体积、校验格式和提供适配浏览器的编码，CDN 应正确返回 Content-Type 并支持 Range 请求。
- 粘贴完整的 `http://`、`https://` 或 `www.` URL 时，自动插入新窗口打开的超链接；选中同一段落内文字时将其转为该链接。已有链接不会嵌套。普通文字、混合多行内容、代码块及危险协议不会自动转换；单纯粘贴视频 URL 也是链接，不会自动拉取或上传视频。

- 回调可返回 `string` 或 `UploadResult`；拒绝空 path、`blob:`、`data:`。请返回 `documents/xxx/image.png` 这类资源 key，不要返回短期签名 URL。包不会自动剥离完整 URL 的域名。
- `onProgress` 接受 0–1，不是 0–100；HTTP 字节上传到 100% 不代表服务端已处理完成，回调 resolve 后才替换占位。
- 未配置上传函数、编辑器只读或运行时未就绪会拒绝命令；上传函数执行过程的错误被保存到 `ResourceUploadState.error`，当前上传 Promise 不会把这些错误继续抛出。
- `ResourceUploadState` 包括 `blockId/kind/file/status/progress/previewUrl?/error?`。成功项目移除；不要将这个列表保存为文档。
- `commands.cancelUpload(blockId)` 可取消指定上传；切换只读和卸载也会发出 abort，晚到结果不会写回。暂不支持断点续传或原位重试；业务可移除失败占位后重新上传，服务端需处理未被文档引用的资源。
- resolver 支持同步字符串或 Promise。下载未配置时依次回退到预览 resolver、原 path。签名过期刷新策略由业务负责，建议让 resolver 稳定且可靠。
- 更换 CDN 只需改 resolver，不需要改文档。上传鉴权、大小/MIME 校验、病毒扫描、CORS 和下载 `Content-Disposition` 由业务服务实现。
- 点击附件只选中，通过下载按钮下载；图片单击或点击放大按钮均可打开大图，Shift/⌘/Ctrl 点击保留多选，不打开预览；流程图/思维导图点击选中，通过放大按钮预览，并提供右键下载交互。视频下方提供独立的“全屏播放”按钮，保留播放进度，支持原生全屏及 Safari 视频全屏；浏览器拒绝时会显示提示。iframe 接入需由宿主授予 `allow="fullscreen"` / `allowFullScreen`，不能通过 SDK 绕过权限。

## 国际化

```tsx
import { RichTextEditor, type EditorLanguagePack } from 'slatetsx-kit-editor'
import { zhCN, enUS } from 'slatetsx-kit-editor/languages'

const french: EditorLanguagePack = {
  ...enUS,
  placeholder: 'Écrivez ici…',
  cancel: 'Annuler',
  'resource.downloadFile': 'Télécharger {0}',
}
// 直接替换 language 即可切换，不需要注册语言名称。
export const EnglishEditor = () => <RichTextEditor language={enUS} />
export const FrenchEditor = () => <RichTextEditor language={french} />
```

语言包类型为 `Readonly<Record<string, string>>`；可复制预设字典作为完整模板。字典只使用稳定英文标识（如 `cancel`、`resource.downloadFile`），不使用中文原文作为 key，参数使用 `{0}`、`{1}`。缺失键回退到键本身，不是自动回退到中文；展开 `enUS` 可提供英文回退。自定义组件内使用 `useEditorI18n().t(key, parameters)`。语言切换只影响界面，不翻译文档内容或业务外部工具栏。

自定义 key 建议使用 `模块.操作` 的英文 camelCase 命名，例如 `resource.downloadFile`；显示文案修改时不改 key。此版本已移除中文 key，不保留旧别名；已有自定义字典请按预设字典更新。`{0}` 等插值占位符保持不变，例如 `t('resource.downloadFile', { 0: 'report.pdf' })`。这只调整界面语言包，不迁移或改写已保存的中文文档内容。

## 文档结构与 Block 创建

`EditorValue` 是 Slate 后代节点数组，元素使用稳定 `id`，叶子使用 `{ text, ...marks }`。持久化普通文档时包一层 `schemaVersion: 2`。禁止把 Slate path 当作跨端身份；path 只是当前投影中的瞬时位置。

文本推荐使用可组合段落：

```ts
import { createId, type RichElement } from 'slatetsx-kit-editor'
const paragraph: RichElement = {
  id: createId(), type: 'paragraph', title: 'h2', list: 'ol',
  quote: true, indentation: 1, align: 'left',
  children: [{ text: '同一行可以同时有标题、列表和引用', bold: true }],
}
```

动态插入示例（`editor` 为前面的 React ref）：

```ts
editor.current?.commands.insertBlock({
  id: createId(), type: 'code-block', language: 'typescript',
  code: 'const answer = 42\nconsole.log(answer)', children: [{ text: '' }],
})
editor.current?.commands.insertBlock({
  id: createId(), type: 'card', icon: '💡', color: '#eff6ff',
  children: [{ type: 'paragraph', id: createId(), children: [{ text: '卡片内容' }] }],
})
editor.current?.commands.insertBlock({ id: createId(), type: 'divider', children: [{ text: '' }] })
editor.current?.commands.insertImage({ path: 'images/example.png', alt: '示例', width: 480, displayStyle: 'rounded' })
editor.current?.commands.insertAttachment({ path: 'files/report.pdf', name: '报告.pdf', mimeType: 'application/pdf', size: 1024 })
editor.current?.commands.insertBlock({ id: createId(), type: 'flowchart', nodes: [], edges: [], children: [{ text: '' }] })
editor.current?.commands.insertBlock({
  id: createId(), type: 'mindmap', children: [{ text: '' }],
  mindData: { nodeData: { id: createId(), topic: '中心主题', children: [] } },
})
```

代码保存在 `code`；卡片内容保存在 `children` 富文本块中，不使用独立标题/描述字段。图示节点、连线及展示字段的完整类型为 `DiagramNode/DiagramEdge/FlowchartElement/MindMapElement`，已随主入口导出。

所有 Block、表格行/列/格/合并区必须保持文档内唯一身份。创建时使用 `createId()`；复制粘贴由 SDK 生成新身份。不要在每次渲染或远端更新时重建 ID，也不要直接复用一份带 ID 的模板多次插入。

### 思维导图交互

- 默认使用自动层级样式：中心主题深色填充、一级主题浅色卡片、二级及以下主题文字加分支细线。同一分支继承配色，主干与支线使用不同粗细。手动指定节点样式优先；选择“自动层级样式”恢复默认，也可勾选“应用到子树”批量恢复。编辑与 SVG 预览共用渲染规则。
- 选中节点后 `Tab` 新建子主题、`Enter` 新建同级主题、`Shift+Tab` 选择父节点；方向键在父子/同级节点间导航，`Home` 回到中心。
- 双击节点或按 `F2` 就地编辑。`Shift+Enter` 换行，`Enter` 确认，`Esc` 取消本次文字修改；中文输入法确认候选词不会误触发节点操作。
- `Ctrl/⌘+C/X/V` 复制、剪切、粘贴整棵子树（粘贴到所选节点下）；内部格式保留结构和样式，粘贴时重新生成全部节点 ID。也支持粘贴普通文字为一个多行主题。跨应用复制时，如目标应用未保留自定义剪贴板格式，仅保留主题文字。
- 拖动节点时子树跟随；拖到其他节点上，目标高亮，松手后成为其子主题。禁止拖到自己或自己的后代中。一级分支越过中心会切换左右方向；拖动根节点则平移整张图。
- 折叠只隐藏后代，不删除内容；样式默认只应用所选节点，勾选“应用到子树”可批量修改。
- 滚轮平移，`Shift+滚轮` 横向平移，`Ctrl/⌘+滚轮` 缩放；“适应画布”只调整视角，“整理布局”重新排布节点。创建、删除、换父级、切换方向、折叠/展开及修改文字时自动整理布局，因此这些操作会重新计算手动坐标。
- `Ctrl/⌘+Z` 撤销，`Ctrl/⌘+Shift+Z` 或 `Ctrl+Y` 重做，最多保留当前编辑会话的 100 步；历史与树数据一起更新。保存后结束该会话，重新打开不会保留内部撤销栈。
- “保存并返回文档”提交树数据和同源渲染的 SVG 预览；关闭按钮放弃本次编辑。折叠状态会保存在 `expanded`，并反映在文档预览中。没有新增依赖。

## 表格命令

持久化只保留一套结构：`table.columns[]`（列 ID、宽度）、`table.children[]`（行 ID、高度、单元格）、单元格的 `id/rowId/columnId/children`、`table.merges[]`（`id/rowIds/columnIds`）。跨度、隐藏格是投影结果，不是持久化字段；没有 `placements` 或拆分还原副本。

合并时将内容移动到左上锚点，拆分只解除关系，内容留在锚点，其余格不恢复历史内容。并发新增内容不会因为拆分而被历史副本覆盖。

三种执行方式：

- React：`handle.commands.table(command)`，自动进入当前协同或非协同路径。
- 纯数据：`reduceTableCommand(table, command)` 返回新表格，删除整表返回 `null`；不修改输入、不广播，不自动生成 Yjs update。
- Yjs / 后端 / Agent：`runtime.execute(command)` 返回已应用到本地副本的二进制 update。

所有命令带 `tableId: string`：

| `type` | 其余参数 |
| --- | --- |
| `insertRows` / `insertColumns` | `count`、`referenceId?`、`side?: 'before'|'after'`；无参考 ID 追加 |
| `deleteRows` / `deleteColumns` | `ids: string[]`，行或列 ID |
| `merge` | `rowIds: string[]`、`columnIds: string[]`，取覆盖矩形 |
| `split` | `mergeIds: string[]`，不是 cell ID |
| `resizeRow` / `resizeColumn` | `id: string`、`size: number`（像素；最小行高 24、列宽 72） |
| `setCellStyle` | `cellIds`、`style: { align?, verticalAlign?, backgroundColor? }` |
| `setTextStyle` | `cellIds`、`style: Partial<Omit<RichText,'text'>>`、`unset?: mark[]` |
| `clearCells` | `cellIds`，删除格内内容但保留格子 |
| `setCellContent` | `cellId`、`children: RichNode[]` |
| `paste` | `rowId`、`columnId`、`payload: TableClipboardPayload`，必要时扩容 |
| `deleteTable` | 无 |

```ts
import { createTableBlock, reduceTableCommand, type TableRowElement } from 'slatetsx-kit-editor/headless'
let table = createTableBlock(3, 4)
table = reduceTableCommand(table, {
  type: 'insertRows', tableId: table.id, referenceId: (table.children[0] as TableRowElement).id,
  side: 'after', count: 2,
})!
table = reduceTableCommand(table, {
  type: 'merge', tableId: table.id,
  rowIds: [(table.children[0] as TableRowElement).id], columnIds: table.columns.slice(0, 2).map(column => column.id),
})!
table = reduceTableCommand(table, { type: 'split', tableId: table.id, mergeIds: [table.merges[0].id] })!
```

React 中先 `insertBlock(table)` 插入新建表格，后续取当前值中的行列 ID 执行 `commands.table`，不要使用已经过期的 table 快照。单次批量新增限 1–1000，业务仍需限制总行列数、内容体积和权限。嵌套表格不支持。

工具函数包括 `tableCellAt`、`tableMergeAt`、`tableCellAnchorAt`、`tableCellPresentationAt`、`mergedTableRegionAt`、`rectangularSelectionBounds`、`tableClipboardPayload`、`tableFromClipboard`、`parseTableClipboard`、`TABLE_CLIPBOARD_MIME`。这些为低级数据 API，确切参数以导出的 `.d.ts` 为准；普通接入直接使用 UI 和命令即可。使用结构命令时已完成规整，不需要输入每个字符都调用 `normalizeTableAt/normalizeTableById`。

## 自定义组件与插件

自定义类型使用 `custom:*`。可编辑 Block 可直接实现 `EditorPlugin`；不可拆分的业务 inline 应使用 `createAtomicInlineExtension` 同时注册 Slate 行为和 Yjs codec，不能借用超链接保存业务节点：

```tsx
import { createAtomicInlineExtension, createId } from 'slatetsx-kit-editor'
const reference = createAtomicInlineExtension({
  type: 'custom:document-reference', schemaVersion: 1,
  encode: element => ({ documentId: element.documentId, label: element.label }),
  decode: (data, { id }) => ({ type: 'custom:document-reference', id, ...data, children: [{ text: '' }] }),
  render: element => <span>📄 {String(element.label)}</span>,
  onActivate: element => openDocument(String(element.documentId)),
})
const plugins = [reference.plugin] // 保持数组引用稳定
// Yjs 会话传 inlineCodecs: [reference.codec]
// editor.current?.commands.insertInline({ type: 'custom:document-reference',
//   id: createId(), documentId: 'doc-42', label: '设计说明', children: [{ text: '' }] })
```

| 插件能力 | 用法 |
| --- | --- |
| `key` | 稳定唯一名称 |
| `withEditor(editor)` | 增强并返回 editor；覆盖方法时保留原行为，不能绕过只读/协同约束 |
| `renderElement(props)` | 返回 ReactElement；不处理时 `undefined`，按插件顺序取第一个结果 |
| `renderLeaf(props)` | 自定义文字渲染，同样需要透传 `attributes` 和 `children` |
| `isInline(element)` / `isVoid(element)` | 返回 `true` 增加 inline/void 类型；当前不能用 `false` 覆盖内置类型 |

可编辑 Block 必须渲染 Slate 的 `children`，按钮/输入控件隔离事件，防止删除键误删外层 Block。插件不能任意存 ReactNode、函数、DOM 或循环引用；持久属性需可序列化。自定义组件位于编辑器内部时，可使用 `useEditorI18n`、`useResolvedResource` 和 `useResourceRuntime`。自定义复杂字段的并发语义不是自动提供的，必须评估与 Yjs 绑定的兼容性。

## Yjs 协同接入

**Doca 接入以 [Doca 接入契约](./docs/DOCA_INTEGRATION.md) 和其中的[完整宿主示例](./docs/examples/doca-host-managed.tsx)为准。** 当前格式固定为 `codec: 'slate-kit'`、`schemaVersion: 3`，必须提供非空 `epochId`；恢复输入是原始 Yjs checkpoint 加同 epoch 增量。项目未上线，本版本不兼容旧 schema、不迁移旧 Mention、不提供静默 JSON 重建。

Doca 使用 `createYjsCollaborationSession`，由平台持有网络、身份、权限、IndexedDB、outbox 和落库 ACK。组件本身不会开启 WebSocket、自动保存或本地存储。下面的 `connectYjsTransport`/`persistYjsDocument` 内容仅说明包的**独立低级模式**，Doca 宿主管理模式禁止叠加调用。

### 独立低级模式（非 Doca 接入）

这是可选低级能力，不是 Doca 接入路径。普通模式不需要 Yjs runtime、服务端或 IndexedDB。

协同模式中，浏览器和后端都可用 `YjsDocument` 生成 update。本地表格操作立即显示，不必等待后端执行；后端负责鉴权、应用、可靠存储和同步。内部模型和表格收敛原理见 [项目架构](./docs/ARCHITECTURE.md#协同数据流)。

**协同必须存 Yjs 二进制状态及增量，不能只存 Slate JSON 再重新 initialize。** 后者会丢失 CRDT 身份、历史及评论锚点。`initialize(value)` 只由一个授权的新文档创建流程调用一次，客户端不能因“暂时没收到数据”自行初始化。

### 先同步再挂载

以下函数可直接放到业务会话层。`transport` 由下一节的业务网络适配器提供；认证失败、同步超时和重试 UI 由业务管理。

```ts
import {
  Doc, YjsDocument, createYjsAdapter, persistYjsDocument, connectYjsTransport,
  type YjsTransport,
} from 'slatetsx-kit-editor/yjs'

export async function openDocumentSession(
  documentId: string,
  transport: YjsTransport,
  onStatus: (status: 'offline' | 'syncing' | 'synced') => void,
) {
  const doc = new Doc()
  const runtime = new YjsDocument(doc)
  let persistence: Awaited<ReturnType<typeof persistYjsDocument>> | undefined
  let binding: ReturnType<typeof connectYjsTransport> | undefined
  let stopReady: (() => void) | undefined
  let rejectReady: ((reason: Error) => void) | undefined
  let synced = false
  try {
    // 本地缓存命名空间应包含租户/账号，避免跨用户读取。
    persistence = await persistYjsDocument(documentId, doc)
    const ready = new Promise<void>((resolve, reject) => {
      rejectReady = reject
      const check = () => {
        if (runtime.initialized && (synced || !transport.connected)) resolve()
      }
      stopReady = runtime.subscribe(check)
      binding = connectYjsTransport(doc, transport, {
        room: documentId,
        codec: 'slate-kit',
        schemaVersion: 3,
        onStateChange: state => {
        synced = state.connection === 'ready'
        onStatus(state.connection === 'ready' ? 'synced' : state.connection === 'disconnected' ? 'offline' : 'syncing')
        check()
        },
      })
      check() // 已有缓存且离线：可开始编辑；空缓存离线：继续等待。
    })
    return {
      runtime, ready,
      // 等 ready 后调用一次，保持返回的 adapter 引用稳定。
      createAdapter: () => createYjsAdapter(runtime),
      destroy() {
        rejectReady?.(new Error('Document session closed'))
        stopReady?.(); binding?.dispose(); runtime.destroy()
        void persistence?.destroy(); doc.destroy()
      },
    }
  } catch (error) {
    stopReady?.(); binding?.dispose(); runtime.destroy()
    void persistence?.destroy(); doc.destroy()
    throw error
  }
}
```

React 页面示例，`transport` 应是当前房间的稳定对象：

```tsx
import { useEffect, useState } from 'react'
import { RichTextEditor, type CollaborationAdapter, type EditorValue } from 'slatetsx-kit-editor'
import type { YjsTransport } from 'slatetsx-kit-editor/yjs'
import { openDocumentSession } from './session'

export function CollaborativePage({ documentId, transport }: { documentId: string; transport: YjsTransport }) {
  const [binding, setBinding] = useState<{ initialValue: EditorValue; collaboration: CollaborationAdapter }>()
  const [status, setStatus] = useState('syncing')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let session: Awaited<ReturnType<typeof openDocumentSession>> | undefined
    setBinding(undefined); setError('')
    void (async () => {
      try {
        session = await openDocumentSession(documentId, transport, state => { if (!cancelled) setStatus(state) })
        // 同时监听 ready 的拒绝，销毁会话不会产生未处理 Promise。
        const ready = session.ready
        if (cancelled) session.destroy()
        await ready
        if (!cancelled) setBinding({ initialValue: session.runtime.getValue(), collaboration: session.createAdapter() })
      } catch (reason) { if (!cancelled) setError(String(reason)) }
    })()
    return () => { cancelled = true; session?.destroy() }
  }, [documentId, transport])
  if (error) return <p role="alert">{error}</p>
  return <>
    <p role="status">{status === 'synced' ? '已完成本轮同步' : status === 'offline' ? '离线' : '同步中'}</p>
    {binding ? <RichTextEditor key={documentId} {...binding} /> : <p>等待文档同步…</p>}
  </>
}
```

实际应用切换房间建议外层 `key={documentId}`，会话销毁时也要关闭业务 socket。IndexedDB 不可用时应明确提示或由业务选择无离线能力的接入，不要默默承诺离线安全。

### 网络传输契约

`connectYjsTransport(doc, transport, options)` 返回带 `dispose()`、`getState()` 和 `getPendingUpdates()` 的绑定。`options` 必须提供 `room`、`codec`、`schemaVersion`，可提供已知 `epochId`；`onStateChange` 分别报告连接状态和保存状态。`YjsTransport` 需要：

| 成员 | 契约 |
| --- | --- |
| `connected: boolean` | 当前连接是否可发送；初始连接也会触发握手 |
| `send(message: YjsMessage): void` | 发送到当前文档房间 |
| `onMessage(callback): () => void` | 订阅已经解码并验证的消息，返回解绑 |
| `onConnection(callback): () => void` | 连接/断开/重连通知，布尔值；返回解绑 |

公共信封固定包含 `protocolVersion: 1`、`type`、`id` 和 `room`。客户端发送 `join`；服务端返回带 `epochId`、codec/schema、序号和原子基线 update 的 `sync-response`。内容 `update` 必须带 epoch；服务端只在数据库提交后返回相同 ID 的 `ack`。二进制字段均为 `Uint8Array`，JSON 线路必须显式 Base64。

```ts
import type { YjsMessage, YjsTransport } from 'slatetsx-kit-editor/yjs'
// 浏览器 JSON 线路编码；服务端可用 Buffer 的 base64 编解码。
const toBase64 = (bytes: Uint8Array) => {
  let result = ''
  for (const byte of bytes) result += String.fromCharCode(byte)
  return btoa(result)
}
export function encodeMessage(message: YjsMessage): string {
  return JSON.stringify({ ...message, ...('vector' in message ? { vector: toBase64(message.vector) } : {}), ...('update' in message ? { update: toBase64(message.update) } : {}) })
}

export function decodeMessage(raw: string): YjsMessage {
  // 示例限额；生产应同时在代理层/服务端限制真实字节数。
  if (raw.length > 8 * 1024 * 1024) throw new Error('消息过大')
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('无效消息')
  const message = value as Record<string, unknown>
  const bytes = (input: unknown) => {
    if (typeof input !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) throw new Error('无效二进制字段')
    return Uint8Array.from(atob(input), character => character.charCodeAt(0))
  }
  if (message.protocolVersion !== 1 || typeof message.id !== 'string' || typeof message.room !== 'string') throw new Error('无效信封')
  if (message.type === 'join') return { ...message, vector: bytes(message.vector) } as YjsMessage
  if (message.type === 'sync-response') return { ...message, vector: bytes(message.vector), update: bytes(message.update) } as YjsMessage
  if (message.type === 'update') return { ...message, update: bytes(message.update) } as YjsMessage
  if (message.type === 'ack' || message.type === 'error') return message as unknown as YjsMessage
  throw new Error('未知消息类型')
}

// 浏览器示例：服务端必须实现相同的 JSON 协议和房间鉴权。
// getUrl 可异步刷新连接地址，但不要把长期密钥放在 URL 中。
export function createSocketTransport(
  getUrl: () => Promise<string>,
  onError: (error: unknown) => void,
): YjsTransport & { close(): void } {
  const messages = new Set<(message: YjsMessage) => void>()
  const connections = new Set<(online: boolean) => void>()
  let socket: WebSocket | undefined
  let closed = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const notify = (online: boolean) => connections.forEach(callback => callback(online))
  const retry = () => {
    if (closed) return
    clearTimeout(timer)
    const delay = Math.min(30000, 500 * 2 ** Math.min(attempt++, 6)) + Math.random() * 300
    timer = setTimeout(() => { void connect() }, delay)
  }
  async function connect() {
    try {
      const url = await getUrl()
      if (closed) return
      const current = new WebSocket(url)
      socket = current
      current.onopen = () => { attempt = 0; notify(true) }
      current.onmessage = event => {
        try {
          if (typeof event.data !== 'string') throw new Error('本示例只接受 JSON 文本帧')
          const message = decodeMessage(event.data)
          messages.forEach(callback => callback(message))
        } catch (error) { onError(error); current.close(1008, 'Invalid message') }
      }
      current.onerror = () => onError(new Error('WebSocket 连接失败'))
      current.onclose = event => {
        notify(false)
        // 权限/协议错误不无限重试。业务恢复权限后创建新的 transport。
        if (event.code === 1008) { onError(new Error('连接被拒绝或协议无效')); return }
        retry()
      }
    } catch (error) { onError(error); retry() }
  }
  void connect()
  return {
    get connected() { return socket?.readyState === WebSocket.OPEN },
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(encodeMessage(message))
      // binding 在内存 outbox 中保留未确认 update；此层不能自行丢弃或改写。
    },
    onMessage(callback) { messages.add(callback); return () => { messages.delete(callback) } },
    onConnection(callback) { connections.add(callback); return () => { connections.delete(callback) } },
    close() { closed = true; clearTimeout(timer); socket?.close(); messages.clear(); connections.clear() },
  }
}
```

将以上代码保存为业务 `transport.ts`，将会话函数保存为 `session.ts`，协同页面导入 `openDocumentSession`。在页面外层为每个 documentId 创建一次 transport，再作为属性传入：

```tsx
import { useEffect, useState } from 'react'
import { createSocketTransport } from './transport'
import { CollaborativePage } from './CollaborativePage'

export function CollaborativeDocument({ documentId }: { documentId: string }) {
  const [transport, setTransport] = useState<ReturnType<typeof createSocketTransport>>()
  const [connectionError, setConnectionError] = useState('')
  useEffect(() => {
    const current = createSocketTransport(async () => {
      const url = new URL(`/api/documents/${encodeURIComponent(documentId)}/sync`, location.origin)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      return url.href // 示例由同源安全 Cookie 鉴权，服务端校验 Origin 和房间权限。
    }, error => setConnectionError(String(error)))
    setTransport(current)
    return () => current.close()
  }, [documentId])
  return <>
    {connectionError && <p role="alert">{connectionError}</p>}
    {transport && <CollaborativePage documentId={documentId} transport={transport} />}
  </>
}
// 切换文档时：<CollaborativeDocument key={documentId} documentId={documentId} />
```

上例包含前端连接、解码、重连、离线缓存和挂载流程，但 `/sync` 不是开箱即用的包内服务，必须接入下面约定的后端。生产还应加入心跳、send 缓冲限额、同步超时、用户可重试入口、ACK 状态和更严格的输入验证。

收包要校验 type、必需字段、Base64、最大消息大小，再解码交给 callback；WebSocket 建立/重连时通知 `onConnection(true)`，断开时通知 `false`。该协议**不是 y-websocket 的原生二进制协议**，不能直接接到任意 y-websocket 服务而不做适配。SDK 不提供 WebSocket 服务、重连退避、token 刷新或应用层落盘 ACK。

首次握手双向交换 state vector 并补差，不要求 HTTP 拉全量。`synced` 仅表示该轮握手完成，不保证后续所有更新均已到达或服务端已经落盘。生产“已保存”状态需要业务服务的持久化 ACK。

服务端每个房间可持有一个 Y.Doc，对每个连接绑定同一房间 Doc 的 `connectYjsTransport`；来自一个连接的更新会通过其他绑定传播。不要再叠加第二条重复广播通道。多实例可粘性路由或使用房间消息总线，但初始化唯一性、恢复顺序、访问权限和持久化仍由业务保障。

### 离线、表格冲突与撤销边界

- 有本地缓存可离线编辑，重连后同步增量；第一次打开且无缓存、无网络时无法凭空加载文档。
- IndexedDB 异步写入不是可靠备份，浏览器清理数据或页面突然关闭可能丢失未持久化部分。
- 并发增删行列、重叠合并和拆分按统一命令顺序规整；无效目标可能成为无操作，不自动复活已删除身份。
- SDK 投影合法矩形，不需要业务生成额外“修复版本”。但不能删除尚被离线端依赖的历史命令，目前无安全在线日志压缩 API。
- 撤销只跟踪当前 runtime 的 origin，不撤销别人输入；`runtime.undoManager.stopCapturing()` 可分隔撤销组。
- 所有副本必须使用一致 schema 和 reducer 版本。复杂图示整体属性、自定义字段的并发体验需要独立验证，不等同于每个内部图形都有字符级 CRDT 能力。
- 已有并发和断线自动化测试；多浏览器 IME、长期离线、长日志和超大文档协同仍需生产前压测。

若已有自己的 CRDT 框架，可实现 `CollaborationAdapter` 的 `connect`、`onLocalChange`、`subscribeOperations`、`subscribe`。`subscribeOperations` 接受已正确重定位的 Slate operations，不是网络原始 path 协议；`subscribe` 整篇替换仅用于初始化/恢复。不要与 `createYjsAdapter` 重复处理同一变更。

中文等输入法组合输入期间，编辑器暂缓 `onChange`、`onOutlineChange` 和 `onLocalChange`，确认后提交最终内容，避免通过这些回调广播候选拼音。内置 Yjs 适配器同时暂缓远端内容投影，并基于组合开始时的 CRDT 副本生成最终更新，保留期间收到的远端修改。自定义适配器应实现可选的 `setComposing(boolean)`，保护组合期间的本地选区，并在提交时正确合并远端修改；不要直接广播缓存操作中的临时拼音，也不要绕过此流程监听 DOM 输入进行同步。

## 后端与 Agent

### 房间服务接入顺序

1. 连接升级前验证用户、租户、文档权限和 Origin；只读成员不能发送内容更新。二进制 update 不能仅靠检查命令名称实现细粒度权限。
2. 按 documentId 取得房间，等待 checkpoint 和后续增量全部恢复。新文档在有唯一性保障的创建流程中 initialize，一般连接流程禁止初始化空文档。
3. 服务端校验 join 的 protocol/codec/schema，原子读取同一 epoch 的 checkpoint 与后续增量，返回 `sync-response`。`connectYjsTransport` 是客户端绑定，不应在服务端反向复用。
4. 对 update 再次校验权限、room 和 epoch，幂等应用并依次落库；数据库提交后才发送相同消息 ID 的 ACK，再向其他仍有权限的会话广播。存储失败不能报告已保存。
5. 关闭连接先解绑它的同步绑定，再释放 socket。最后一条连接关闭时，先等待存储队列完成，再按业务空闲回收策略销毁房间 runtime/doc。
6. 多实例的消息总线需要去重/避免回声、可靠恢复与一致的 schema 版本；不要让两个实例独立创建同一个新文档。

此顺序是服务契约，不假设 Express、Nest、数据库或某个 WebSocket 库。业务须实现存储与 transport；下面示例验证 SDK 在 Node 中的创建、执行和恢复能力，不是完整生产服务器。

后端/Agent 从 `/yjs` 和 `/headless` 导入，无需挂载 React。下面是一个不依赖网络服务的可执行 TypeScript 示例：

```ts
import { Doc, YjsDocument, applyUpdate, encodeStateAsUpdate } from 'slatetsx-kit-editor/yjs'
import { createId, createTableBlock } from 'slatetsx-kit-editor/headless'

const doc = new Doc()
const runtime = new YjsDocument(doc)
const paragraphId = createId()
// 仅新文档授权创建时调用；已有文档先 applyUpdate(doc, storedState)。
runtime.initialize([{ id: paragraphId, type: 'paragraph', children: [{ text: 'Hello' }] }])
const table = createTableBlock(3, 4)
runtime.execute({ type: 'insertBlock', afterId: paragraphId, block: table })
runtime.execute({ type: 'insertRows', tableId: table.id, count: 2 })
runtime.editText(paragraphId, 5, 0, ' world')

const persistedState = encodeStateAsUpdate(doc)
const replica = new Doc()
applyUpdate(replica, persistedState)
const restored = new YjsDocument(replica)
console.log(restored.getValue())
restored.destroy(); replica.destroy(); runtime.destroy(); doc.destroy()
```

生产服务先加载完整 checkpoint + 后续增量，再开放房间。监听 `doc.on('update', handler)`，由业务顺序持久化并处理失败，或使用 `execute` 返回值发送；**二者只选一套发送路径**。`doc.on` 不会等待 async handler 完成，必须自己维护落盘队列和 ACK，不要把异步回调返回当作存储成功。

| Runtime 方法 | 行为 |
| --- | --- |
| `new YjsDocument(doc)` | 绑定已有 Y.Doc，调用方拥有 Doc 生命周期 |
| `initialize(value)` / `initialized` | 新文档初始化 / 判断是否已有初始状态 |
| `getValue()` | 返回当前 Slate 投影，不直接修改返回树 |
| `execute(command)` | 先校验执行，再返回本次 `Uint8Array` update；无效参数可能抛错 |
| `editText(blockId, index, deleteCount, insert = '')` | 修改文本并返回 update，索引按当前副本 UTF-16 偏移，必须校验范围 |
| `subscribe(listener)` | 订阅变化，返回解绑函数 |
| `undo()` / `redo()` / `undoManager` | 本地 origin 撤销与分组 |
| `createCommentAnchor` / `resolveCommentAnchor` | 评论相对位置，见下节 |
| `destroy()` | 解绑 runtime；另行销毁 transport、persistence 和 doc |

`DocumentCommand` 包括全部表格命令及：

| 命令 | 参数 |
| --- | --- |
| `insertBlock` | `block`、`parentId?`、`afterId?` |
| `deleteBlock` | `blockId` |
| `moveBlock` | `blockId`、`parentId?`、`afterId?` |
| `setBlock` | `blockId`、`properties`、`unset?: string[]`；不可修改 id/children |

Agent tool 应接受这些稳定 ID 和结构化参数，服务端先做身份、文档权限、参数/schema 校验与配额，再执行。不要把任意 JSON 或代码执行权限直接暴露给 Agent。`editText` 的数字偏移只对当前副本有效，跨请求保存文字定位应采用相对锚点或重新解析，而不是依赖旧下标。

## @用户等业务扩展

包内不实现 @用户、用户搜索、用户卡片、权限判断、跳转或通知。Doca 使用 `createAtomicInlineExtension` 自行实现这些交互；不存在旧 Mention 兼容层。

SDK 不再内置 @用户的数据结构、搜索菜单、用户卡片、跳转或通知逻辑。这些行为依赖组织权限、路由、用户目录和产品交互，应由使用者通过 `EditorPlugin` 的 `withEditor`、`renderElement`、`isInline`、`isVoid` 等扩展点实现。

业务自定义节点请使用 `custom:` 前缀；原子 inline 通过 `createAtomicInlineExtension` 注册匹配的编辑器插件和显式 Yjs codec，codec 中列出的业务字段会参与复制、协同和 checkpoint 恢复。候选浮层、键盘交互、权限、详情跳转和通知仍属于业务层。

### 富文本卡片

卡片是带图标和背景的内容容器，没有独立的 `title`、`description` 字段。内容统一放在 `children` 中，使用普通 Slate 富文本块，支持多段落、文字样式、链接和列表；编辑、复制粘贴、撤销及协同同步与正文共用机制。图标和背景色仍可修改，只读模式禁止编辑。

```ts
const card = {
  type: 'card', id: crypto.randomUUID(), icon: '💡', color: '#eef6ff',
  children: [{
    type: 'paragraph', id: crypto.randomUUID(),
    children: [{ text: '提示：', bold: true }, { text: '这里可以继续输入富文本。' }],
  }],
} satisfies RichElement
editorRef.current?.commands.insertBlock(card)
```

卡片及内部各块必须有文档内唯一 ID；表格、分列仍只能放在文档第一级，不能插入卡片内部。此结构不兼容旧版卡片数据，接入方应直接使用新结构。协同时文本由内部块 ID 定位，无需再同步卡片标题/描述字段。

## 评论与在线状态

评论正文、threadId、作者、权限和解决状态保存在业务数据库。包正式提供锚点捕获/解析、未解决范围高亮、`activeId` 选中态、取消选中和点击事件，但不提供评论边栏、正文、回复或评论服务。Doca 的完整接法见 [Doca 接入契约](./docs/DOCA_INTEGRATION.md#评论与在线光标)。

```ts
// runtime 是已经初始化/同步的 YjsDocument；blockId 是目标文本 Block。
const anchor = runtime.createCommentAnchor(blockId, 2, 8)
// 保存 { threadId, blockId: anchor.blockId, quote: anchor.quote,
//        start: Base64(anchor.start), end: Base64(anchor.end) }。
// 加载后先解码为 Uint8Array，再解析：
const location = runtime.resolveCommentAnchor(anchor)
if (location.orphaned) {
  // 目标被删除/范围变空：显示“原文已删除”，不要自动关联其他文字。
} else {
  // location.blockId / start / end 为当前文本范围，用于高亮与定位。
}
```

范围内部插入/删除会改变相对位置；两端边界采用包内 association 规则，不应假设刚好在边界插入的文字一定归入评论。索引是 UTF-16，不能直接拿 DOM 偏移跨多个 leaf 使用。需先把 Slate 选区转成该文本 Block 内的偏移；`query.getSelection()` 不提供这种精确范围转换。

当前单个锚点对应一个文本 Block；跨 Block 评论需组合多个锚点。段落拆分/跨 Block 移动的评论语义需要业务测试，不能仅凭相对锚点宣称所有结构变化都无损。`comments` 属性接受 `EditorComments`，`createYjsCommentAnchorAdapter(runtime)` 提供 Yjs 实现；引用范围完全删除后解析为失效。

只读仍允许选择文字和查找，但不发布或绘制编辑光标。远端光标通过宿主注入的 `YjsPresenceBridge` 接入，以 `sessionId` 而非 `userId` 去重，因此同账号两个页面相互可见。用户资料、失联清理和 presence 传输由平台实现，且不应持久化为文档内容。

## 性能、安全与常见问题

**大文档**：默认 300 顶层块触发渲染优化，但不等于完整虚拟化。保持 `plugins`、`collaboration`、`resources` 引用稳定；避免每次选区变化全量 stringify、深拷贝、发网路快照。普通保存应防抖并处理请求乱序，协同使用 update。历史基准见 [PERFORMANCE.md](./PERFORMANCE.md)，不代表消费项目机器或长期协同日志的保证。

**安全**：只读界面不是鉴权；服务端还需限制资源大小、文档大小、命令数、消息速率和允许属性。不要将任意外部 HTML/SVG/URL 当可信内容，自定义渲染不要直接 `dangerouslySetInnerHTML`。业务 JSON 和网络包要先安全校验，导出 TypeScript 类型不替代运行时校验。

| 问题 | 排查方式 |
| --- | --- |
| 文档没有样式 | 引入 `slatetsx-kit-editor/style.css`，检查业务全局 CSS 冲突 |
| 默认出现示例内容 | 显式传入一个空段落，不要省略 initialValue |
| 点击顶部按钮后选区丢失 | 按钮阻止 mousedown 默认聚焦；输入框需另行保存/恢复范围 |
| 保存后撤销突然失效 | 检查是否反复 setValue/受控整篇替换或重建 plugins 数组 |
| 图片无法上传 | 配置上传函数，检查只读状态、返回 path 和 onUploadStateChange.error |
| Promise 成功但上传失败 | 当前上传过程错误通过状态报告，见资源章节 |
| 更换 CDN 后资源失效 | path 应是稳定 key；resolver 管域名/签名，服务端配 CORS |
| 合并格拆分后内容未恢复 | 设计如此：所有原内容留在合并锚点，不恢复历史副本 |
| 目录跳转被遮挡 | 设置 scroll-margin-top；业务只高亮最近一个标题 |
| 多端重复出现初始内容 | 只能唯一初始化，已有房间加载 Yjs 状态，不重复 initialize |
| 网络显示 synced 但服务端未存完 | synced 是握手状态，可靠保存需要业务持久化 ACK |
| 刷新后评论锚点丢失 | 协同不能只持久化 Slate JSON，需保留原 Yjs 状态 |

## 开发与打包

```bash
yarn install
yarn dev --host 127.0.0.1 --port 4173 --strictPort
yarn typecheck
yarn test
yarn build:lib
npm pack --dry-run
npm pack
```

`yarn build` 构建 Demo；`yarn build:lib` 构建 npm 的 dist 及声明文件。先构建再打包，消费应用应测试生成的 tarball，不仅测试源码 Demo。发布前确认包名/scope 权限、registry、版本和 peer dependencies；`npm publish --access public` 是实际公共发布操作，请由维护者确认后执行。

本 README 是统一接入入口；内部设计见 [项目架构](./docs/ARCHITECTURE.md)，历史测试结果见 [性能报告](./PERFORMANCE.md)。如果文档与版本不匹配，以安装包中导出的类型和同版本源码为准，并报告差异。

### 上线验收清单

- 使用实际打包 tarball 在消费应用验证构建、样式、peer dependencies 和客户端挂载。
- 普通模式验证首次加载、切换文档、保存失败/乱序、只读切换、撤销与目录偏移。
- 上传验证大文件、断网、取消页面、服务端错误、过期签名、CDN 切换、下载鉴权；未完成上传不要当作已保存资源。
- 协同至少两浏览器验证同段输入、中文输入、表格交叉增删/合并/拆分、离线后重连、撤销、权限撤回以及重复/乱序消息。
- 验证服务重启后从 Yjs checkpoint + 增量恢复、评论锚点仍可解析，且同一文档没有重复 initialize。
- 在预计最大文档和最长离线时间上压测；监控日志大小、投影耗时、输入延迟、内存与消息队列，不只看首次渲染。
- 对自定义 Block、复杂图示并发、跨 Block 评论单独验收；当前未提供的能力由业务明确降级，不隐含承诺。
# 可选数学公式（KaTeX）

公式是独立的文档 Block，也能放在表格内，不属于流程图。核心包不强制安装 KaTeX；未配置渲染器时安全显示公式源码。

```sh
npm install katex@^0.18.7
```

```tsx
import { RichTextEditor } from 'slatetsx-kit-editor'
import { renderKatex } from 'slatetsx-kit-editor/katex'
import 'slatetsx-kit-editor/style.css'

<RichTextEditor formulaRenderer={renderKatex} />
// 外部工具栏也可以调用：
editorRef.current?.commands.insertFormula(String.raw`E = mc^2`)
```

`renderKatex` 首次渲染非空公式才动态加载 KaTeX 和其 CSS，字体由浏览器按需请求。不要额外全局导入 KaTeX CSS，否则会提前加载样式。业务构建工具需要支持动态 CSS 导入和字体资源（Vite 支持）；字体资源需正常部署，CSP 的 `font-src` 必须允许字体所在域名。KaTeX 作为可选 peer dependency，由业务安装，SDK 不复制其代码和字体。懒加载降低普通文档开销，不代表公式模块总量低于 100 KB。

交互：从 `/` 菜单或 Block 菜单插入数学公式；双击公式或点击左上角铅笔打开编辑弹窗；多行 LaTeX 实时预览、实时保存。⌘/Ctrl+Enter、Escape 或完成按钮关闭弹窗（不是取消修改）。公式展示按内容宽度自适应，超长公式在内容区域内滚动；左侧数学公式 Block 菜单支持左对齐、居中、右对齐，编辑弹窗不包含对齐设置，对齐值保存到 Block 的 `align`。模板按钮替换当前公式，请先保留需要的内容。只读模式仅展示公式。公式作为完整 Block 参与复制、粘贴、删除和撤销。

持久化结构：`{ type: 'formula', id: '稳定且唯一的ID', source: 'E = mc^2', children: [{ text: '' }] }`。不保存 HTML、字体或临时编辑状态。Yjs 适配器将 `source` 存为独立 Y.Text，支持并发编辑；服务端/Agent 可通过通用 `insertBlock` 命令插入公式。

渲染默认禁用不可信命令（`trust: false`），限制宏展开、尺寸和源码长度；无效输入保留源码并显示提示。支持范围以 [KaTeX 官方列表](https://katex.org/docs/supported) 为准，并非完整 LaTeX。

也可传入自定义 `formulaRenderer: (source: string) => Promise<string>`。返回值必须是可信、安全的 HTML，**不能直接返回用户输入**；异步旧结果会被忽略。核心包不依赖具体公式引擎。

## 分列布局（2～4 列）

空白块菜单的「分列布局」、上方/下方插入菜单、`/` 菜单均可创建。每列可独立插入文字、图片/视频、代码块、卡片、流程图等普通块。布局无表格边框，按文档可用宽度分配列宽，不提供布局横向滚动。悬浮或聚焦时显示列间手柄；拖拽调整相邻两列，松开后保存，也可聚焦手柄后用左右键微调。只读模式隐藏操作控件。

```tsx
import { createColumnsBlock } from 'slatetsx-kit-editor'

editorRef.current?.commands.insertColumns(4)
// 也可以构建初始数据；Node / Agent 从 /headless 导入同名工厂。
const layout = createColumnsBlock(2)
layout.children[0].children = [
  { type: 'paragraph', id: crypto.randomUUID(), children: [{ text: '左列内容' }] },
]
editorRef.current?.commands.insertBlock(layout)
```

结构为 `columns → column → 普通 Block`，所有层都有稳定 ID；每个 `column.width` 是相对权重，默认均分。编辑每列正文走现有文字同步，列宽作为列属性同步；不单独存像素宽度或拖拽中间状态。列顶部按钮打开前方加列、删除列、后方加列菜单，不改变文本选区；最少 2 列、最多 4 列。删除列会删除该列内容，可撤销。

SDK 使用 `commands.columns({ type: 'insertColumn', layoutId, columnId, side: 'after' })` 或 `commands.columns({ type: 'deleteColumn', layoutId, columnId })`。Yjs/Agent 可向 `runtime.execute` 传入相同命令，重放时也执行列数限制。不要通过通用 `deleteBlock` 删除内部列。`columns.showDividers` 控制分割线，默认 `false`，也可以在布局左侧菜单切换。

图片支持 `showCaption?: boolean` 和 `caption?: string`：默认隐藏说明；开启后图片下方显示灰色可编辑说明，只读模式显示纯文字。隐藏说明不清除原文字；Yjs 将说明存为独立文本字段。图片左侧菜单提供开关，SDK 插入图片时也可设置这两个字段。

**表格与分列都只能处于文档顶层**，不能互相嵌套，也不能同类嵌套。列内/单元格内不显示这些创建入口，SDK 在布局内部调用 `insertTable` / `insertColumns` 不执行插入；文档导入与 headless 结构命令会拒绝非法嵌套。Slate 粘贴等底层操作产生的嵌套容器会整体移到顶层，保留其内容。业务不要直接拼接非法的 `children`。
