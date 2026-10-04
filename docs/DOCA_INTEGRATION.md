# Doca 接入契约（slatetsx 0.4.2 / Yjs schema 3）

本文是 Doca 宿主管理模式的权威接入说明。宿主只接受本文定义的当前 schema；恢复失败时不会静默新建文档。

`0.4.2` 相对 `0.4.1` 增加 Markdown 资源交换约定，不改变 codec/schema、根 Map/Text 名称、结构命令编码、epoch 或 checkpoint；已有 schema 3 的原始 Yjs checkpoint/增量继续直接恢复。详见 [性能说明](./PERFORMANCE.md)。

## 职责边界

slatetsx 负责 Slate/Yjs 模型、编辑命令、撤销重做、模型级查找替换、选区以及评论/光标相对位置。Doca 负责 WebSocket、身份、权限、用户资料、IndexedDB、待确认队列、重连、checkpoint/增量持久化、落库 ACK、保存状态、评论正文和业务通知。

`createYjsCollaborationSession` 不打开连接、不写 IndexedDB、不自动保存、不解释 ACK。Doca 应只创建一个平台会话，并把稳定的 `session.adapter` 注入编辑器。保存状态、用户资料、资源签名 URL 和 `mode` 改变时保持 `session`、`adapter`、`plugins` 引用不变，因此不会重建 Slate editor。

服务端或纯契约代码从 `slatetsx-kit-editor/codec` 导入 `YJS_CODEC`、`YJS_SCHEMA_VERSION`、`ATOMIC_INLINE_PLACEHOLDER`、`AtomicInlinePayload`、`YjsInlineCodec` 和 `createAtomicInlineCodec`。该入口不加载 React、DOM、Prism 或编辑器 UI；需要 Y.Doc/runtime 时再使用 `/yjs`。

Word/Markdown 文件转换从 `slatetsx-kit-editor/conversion` 导入。该入口只在原生编辑器模型与 `.md/.markdown/.docx` 文件之间转换，不挂载 UI、不建立协同连接、不创建平台文档，也不触发浏览器下载；资源必须经 Doca 回调重新绑定。Markdown 是 Doca 调用 exmd 完成 PDF 往返时的富文本桥接格式：图片导出调用 `resolveResource(resource, 'embed')` 做授权，但只写入稳定 `path`；稳定图片导入调用 `importResource({ source: 'embedded', path })`，不自动抓取外部地址。完整契约见 [`IMPORT_EXPORT.md`](./IMPORT_EXPORT.md)。

## v3 数据格式与初始化

- `codec`: 字面量 `slate-kit`（`YJS_CODEC`）。
- `schemaVersion`: 数字 `3`（`YJS_SCHEMA_VERSION`）。
- `epochId`: Doca 生成并持久化的非空字符串，不写进 Y.Doc。checkpoint、增量、ACK 和 presence 必须绑定同一 epoch。
- checkpoint / increment: 原始 `Uint8Array` Yjs update，不是 Slate JSON。
- 根共享类型：`slate-kit:document`（初始结构）、`slate-kit:commands`（稳定 ID 结构命令）、`slate-kit:text:<blockId>`（正文），以及内置字段对应的 `slate-kit:text:<blockId>:<field>`。
- 自定义 inline 在所属文本 Y.Text 中编码为一个 U+FFFC 单元，格式属性 `_inline={type,schemaVersion,id,data}`；`data` 必须结构化可克隆。

新建只能由 Doca 已授权的唯一创建流程传 `initialValue`。恢复必须把 authoritative checkpoint 和同 epoch 的有序未合并增量交给一个全新的 `Y.Doc`；不得先 `initialize`，不得用 JSON 重建。codec/schema/epoch 不匹配或 checkpoint 不含初始化标记时，创建会话会抛错，宿主应显示不可编辑错误。

`ready` 在以下动作完成后兑现：checkpoint 与 increments 已应用、文档初始化标记存在、当前 Slate 投影可以生成。它不代表 WebSocket 已连接、presence 已到齐、待确认队列已清空或服务端已落库。当前构造过程同步完成，所以返回的是已兑现的 Promise，保留 Promise 是为了宿主统一生命周期。

`session.dispose()` 停止编辑器绑定、监听和撤销管理器；不会关闭平台连接、清除队列、销毁 IndexedDB 或调用 `doc.destroy()`。这些由 Doca 按所有权释放。

## 平台会话接线

完整可复制示例见 [`examples/doca-host-managed.tsx`](./examples/doca-host-managed.tsx)。核心顺序如下：

```ts
const session = createYjsCollaborationSession({
  doc: new Doc(), epochId: snapshot.epochId,
  codec: YJS_CODEC, schemaVersion: YJS_SCHEMA_VERSION,
  checkpoint: snapshot.checkpoint, increments: snapshot.increments,
  inlineCodecs: [documentReference.codec], presence: platform.presence,
})
await session.ready
const stopLocal = session.onLocalUpdate(update => platform.enqueuePending({
  epochId: session.epochId, codec: session.codec,
  schemaVersion: session.schemaVersion, update,
}))
const stopRemote = platform.onRemoteUpdate(update => session.applyRemoteUpdate(update))
```

正常编辑以及该 runtime 的 `undo()` / `redo()` 都会各触发一次 `onLocalUpdate`。初始化、恢复、`applyRemoteUpdate`、Slate 远端投影、选区、presence、滚动、尺寸、React props 和空闲计时都不会触发。`session.onLocalUpdate` 只是同一 runtime 事件流的受控转发，不会生成第二个 update；宿主只订阅它一次，不要同时监听 `runtime.onLocalUpdate` 或所有 `Y.Doc` update，也不再需要 UndoManager origin 桥接。Doca 以平台生成的 updateId 管理 outbox；仅收到落库 ACK 后删除。重复远端 update 由 Yjs 幂等处理。

低层 `YjsDocument` 提供模型、事务、原始恢复和锚点能力；高层 `createYjsCollaborationSession` 在其上校验 codec/schema/epoch、完成初始化/恢复并创建唯一 adapter。两者不是两套保存通道。平台正常接入只持有 session，需要模型操作时使用 `session.runtime`。

销毁顺序：停止平台订阅 → 停止本地 update 监听 → 卸载编辑器 → `session.dispose()` → Doca 释放 presence/连接/IndexedDB/outbox → `doc.destroy()`。

### 两种 ready

- `await session.ready`：数据 ready，之后才允许挂载可编辑 UI。
- `RichTextEditor.onReady(handle)`：UI ready，仅表示 Slate 实例和公开 handle 已挂载；不表示同步、ACK、上传或 presence ready。

`commands/query`、`retainSelection`、`captureCommentAnchor`、`find/reveal/replace`、`scrollToBlock` 和上传命令都需要 UI ready。`session.applyRemoteUpdate`、`session.onLocalUpdate`、checkpoint 编解码及低层锚点解析不依赖 UI ready；但评论从当前 Slate 选区捕获时需要 UI handle。

## 自定义 inline 原子元素

业务类型必须使用 `custom:*`，推荐结构：

```ts
{
  type: 'custom:document-reference',
  id: 'stable-node-id',
  documentId: 'stable-business-id',
  label: '设计说明',
  children: [{ text: '' }]
}
```

通过 `createAtomicInlineExtension` 一次生成匹配的 Slate plugin 与 Yjs codec。`type` 和 codec `schemaVersion` 是持久协议；`id` 由框架单独保存，`encode` 不应复制或改写它。`decode` 必须返回相同 type/id。平台用 `commands.insertInline(node, retainedRange?)` 插入；不需要、也不应借用普通链接。

原子节点不可拆分，Slate 负责整块删除和撤销；结构复制粘贴保留业务字段并生成新的文档节点 ID；Yjs 双端同步和 checkpoint 恢复保留原 ID 与所有 codec 字段。用户搜索、卡片、权限、跳转、通知与文档标题刷新完全由 Doca 的 `render/onActivate` 实现。该包没有内置 Mention。

## 评论与在线光标

`createYjsCommentAnchorAdapter(runtime)` 接到 `comments.adapter`。`ref.captureCommentAnchor()` 捕获当前同一文本块内的非空选区；Doca Base64 保存 `CommentAnchor.start/end`，并保存 `blockId/quote`。`comments.items` 中未解决的锚点会高亮；`activeId` 控制选中态；点击调用 `onAnchorClick(id)`；清空 `activeId` 即取消选中；`resolved: true` 不绘制。相对位置无法解析、块消失或范围完全变空时 `resolve` 返回 `null`，Doca 显示“原文已删除”。正文与回复不进入文档。

presence 必须由 Doca 注入 `YjsPresenceBridge`。身份键是随机且每标签页唯一的 `sessionId`，`userId` 仅是资料字段，因此同账号双页不会互相过滤。编辑器只过滤自己的 sessionId。只读模式立即发布 `null`、取消订阅绘制；blur/unmount 也发布 `null`。Doca 负责断线超时清理、颜色和用户资料更新，资料变化不得重建 adapter。

评论锚点限制为单个文本块；包内不提供跨块评论、评论边栏/正文/回复或锚点跨结构拆分。presence 不持久化，也不走内容 update。

## 工具栏、查找和布局

固定工具栏和内置悬浮工具栏调用同一个 `RichTextEditorHandle.commands/query`。普通按钮在 `onMouseDown` 阻止默认聚焦；需要弹窗时先调用 `retainSelection()`，完成命令后 `dispose()`。保存状态变化只更新宿主 UI。

`find/reveal/replace/replaceAll/findCapabilities` 是正式模型接口。只读可查找/定位，替换返回 `false` 或 `0`。替换走普通 Slate→Yjs 本地事务，可撤销并同步。任意本地或远端正文修订后旧 match 失效，宿主必须重新 `find`。当前支持字面量、大小写选项和 code block，不支持正则，原子 void 不参与。

`.sk-page` 是可点击补空行的边界；只在直接点击页面内、`Editable` 之外的尾部留白时复用/添加末尾段落。宿主可用 `className` 调整 `.sk-page-shell/.sk-page` 的宽度、min-height、padding，例如：

```css
.doca-editor .sk-page { width: 100%; min-height: calc(100vh - 56px); }
```

只读时尾部留白不会补行。

## 资源

文档节点只保存稳定 `path` 和名称/MIME/尺寸等元信息。预览走 `resolveUrl(path, info)`，下载走 `resolveDownloadUrl(path, info)`；临时签名 URL、File、blob URL、进度和错误不入文档。上传回调接收 `AbortSignal` 与进度；返回空路径、`blob:` 或 `data:` 会失败。`commands.cancelUpload(blockId)` 可由宿主取消指定占位；切只读或卸载也会 abort，晚到结果不会落入节点。失败/取消通过 `onUploadStateChange` 报告，失败占位由宿主决定删除或重新上传。

附件卡片点击后显示蓝色选中框并聚焦编辑器，可复制整个附件节点、粘贴为新节点、Backspace/Delete 删除和撤销。只读允许选中、复制和预览，不能删除。编辑模式首次点击选中、再次点击预览；只读模式单击预览，也可直接点击卡片上的预览按钮。下载按钮独立执行下载，不触发预览。

宿主通过 `RichTextEditor.onAttachmentPreview(attachment: AttachmentElement)` 打开附件预览。回调接收节点的稳定 `id/path/name/size/mimeType`，Doca 在调用时检查资源权限、解析可访问地址并实现预览 UI；编辑器不把解析后的 URL 保存进节点。上传中、失败或空路径附件不会触发预览；未传回调时不显示预览按钮。更新回调不重建 editor、adapter 或文档。

```tsx
<RichTextEditor
  resources={platform.resources}
  onAttachmentPreview={attachment => platform.previewAttachment(attachment)}
/>
```

## 已验证与能力限制

源码测试覆盖：v3 严格初始化、原始 checkpoint+增量恢复、原子字段/ID、整块删除、复制、撤销/重做、edit/undo/redo 各一次本地 update、60 秒空闲零提交、远端无回声、同账号不同 session 光标、只读停止光标、评论高亮/点击/解决/失效、IME 期间远端更新后本地中文不丢字、上传取消/失败/只读中止、模型查找替换和只读限制。构建后还直接用 Node ESM 导入主入口与纯 `/codec` 入口。

平台 WebSocket、IndexedDB、outbox、断线重连和落库 ACK 不由本包实现；需要用 Doca 注入会话联合验收。包内保留的低级 `connectYjsTransport`/IndexedDB 辅助入口是独立模式工具，Doca 宿主管理模式禁止调用。Excel 不在本仓库中，因此没有 Excel 选区、远端标记、mutation 来源、日志压缩或行列锚点能力，不能用本文档宣称 Excel 已支持。
