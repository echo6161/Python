# PaperMind 系统架构

- 文档状态：Phase 0 基线草案
- 架构风格：本地优先的 Electron 分层桌面应用

## 1. 架构目标

1. 让文献管理和阅读在无网络、无 AI Key 的情况下可用。
2. 把不可信 UI/PDF 内容与文件系统、数据库、网络和系统命令隔离。
3. 保持领域逻辑与 Electron、OpenAI、Obsidian 和 Git 的具体实现解耦。
4. 为三平台打包、测试、迁移和失败恢复提供明确边界。
5. 在 MVP 中优先完成单论文闭环，避免双向同步和大规模知识图谱复杂度。

## 2. 逻辑视图

```text
┌──────────────── Renderer（不可信、沙箱）────────────────┐
│ React UI │ PDF.js Viewer/Worker │ View Models           │
└───────────────────────┬──────────────────────────────────┘
                        │ window.paperMind（类型化用例 API）
┌──────────────── Preload（最小桥接）──────────────────────┐
│ contextBridge │ 参数/结果类型 │ 事件取消订阅             │
└───────────────────────┬──────────────────────────────────┘
                        │ 白名单 IPC / MessagePort
┌──────────────── Main 信任域 ─────────────────────────────┐
│ IPC Router │ Library │ Reader │ Annotation │ Jobs        │
│ AI Service │ Export Service │ Git Service │ Secret Store│
│ File Store │ Custom Protocol │ OS Dialogs                │
│              SQLite Worker + Repositories                │
└──────────────┬───────────────────────┬────────────────────┘
               │                       │
      本地 Library/Vault         HTTPS AI Provider
      系统 Git/安全存储          （仅用户主动触发）
```

## 3. Electron 进程职责

### 3.1 主进程

主进程是唯一有权协调特权操作的层：

- 管理应用生命周期、窗口、单实例锁、菜单和系统对话框。
- 注册 `papermind-pdf://` 安全自定义协议，按论文 ID 流式读取受管 PDF。
- 持有数据库 Worker、执行迁移、事务、备份和恢复检查。
- 规范化和校验路径，执行导入、哈希、原子写入、回收和导出。
- 调度 PDF 文本提取、切片、嵌入和索引后台任务。
- 从 Secret Store 获取 Key，并发起所有 AI 网络请求。
- 调用系统 Git，限制命令、参数、工作目录和可暂存文件。
- 记录脱敏的结构化日志和可诊断错误。

主进程不得把数据库句柄、API Key、任意文件读取、Shell 或原始 `ipcRenderer` 暴露给渲染层。耗时 CPU/SQLite 工作在受控 Worker 中执行，避免阻塞 Electron 事件循环。

### 3.2 Preload

Preload 是协议适配层，不承载领域逻辑：

- 使用 `contextBridge.exposeInMainWorld` 暴露固定的 `window.paperMind` API。
- 每个方法对应一个具体用例，例如 `papers.importFromDialog()`，不提供 `invoke(channel, payload)`。
- 对来自主进程的事件只暴露返回取消订阅函数的监听方法。
- 不暴露 Node.js 模块、Electron 对象、文件路径操作或任意网络能力。
- 与主进程共享生成或手写审计过的 TypeScript 契约，运行时仍由主进程校验。

### 3.3 渲染进程

渲染进程负责：

- React 页面、组件、路由、可访问性、状态展示和用户交互。
- 使用 PDF.js 展示页面、文本层、搜索匹配和选择区域。
- 将用户意图转换为 preload 用例调用，并处理加载、取消、失败状态。
- 对 AI 结果、引用、同步状态和本地内容作清楚区分。

安全配置固定为：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
webSecurity = true
allowRunningInsecureContent = false
```

渲染进程不得直接访问 Node.js、SQLite、文件系统、环境变量、系统 Git或 AI Provider。生产环境只加载应用打包资源，不加载远程页面或 CDN 脚本。

### 3.4 PDF 解析 Worker

- PDF 页面渲染和文本提取由 PDF.js Worker 在沙箱渲染域运行，PDF 被视为不可信输入。
- 主进程只按已登记 paper ID 通过自定义协议提供对应 PDF 字节，不接受渲染层提交的任意路径。
- 后台入库提取使用专用沙箱窗口/Worker 通道，只返回有上限的页文本、尺寸和提取状态。
- PDF 内 JavaScript、自动动作、嵌入附件和任意外部导航不执行；链接交给主进程校验后再决定是否用系统浏览器打开。

## 4. 模块边界

| 模块 | 职责 | 主要依赖 |
| --- | --- | --- |
| App Shell | 生命周期、窗口、路由、全局错误 | Electron |
| Library | 论文、作者、标签、集合、导入状态 | Repositories、File Store |
| File Store | SHA-256、托管路径、原子复制、校验、回收 | Node 文件 API |
| Reader | PDF 会话、进度、搜索协调、引用跳转 | PDF.js、Library |
| Annotation | 高亮/批注 CRUD、锚点重定位 | Repositories |
| Ingestion | 文本提取、规范化、切片和作业状态 | PDF Worker、Repositories |
| Search | FTS5 词法搜索和结果定位 | SQLite Worker |
| Retrieval | 嵌入索引、Top-K、邻接扩展和引用组装 | VectorRepository |
| AI Service | Provider 调用、流式事件、取消、用量元数据 | AIProvider、Secret Store |
| Notes | 用户笔记、AI 草稿和引用 | Repositories、AI Service |
| Export | Markdown 渲染、文件名、安全写入和导出记录 | Vault Permission、File Store |
| Git Service | 状态预检、限定暂存、提交和推送 | 系统 Git |
| Settings | 非秘密设置、权限记录、模型偏好 | SQLite、Secret Store |
| Packaging | 三平台构建、签名、产物和更新元数据 | electron-builder、CI |

领域服务通过接口依赖基础设施，React 组件不直接依赖数据库表或 Provider SDK。

## 5. IPC 通信白名单

所有通道均使用 `ipcMain.handle` 或明确的单向事件注册；输入和输出执行运行时 schema 校验、大小限制和错误映射。未列出的通道一律拒绝。通道名将由共享契约常量生成，禁止动态拼接。

### 5.1 请求/响应通道

| 通道 | 方向 | 用途 | 关键限制 |
| --- | --- | --- | --- |
| `app:get-info` | R → M | 获取版本、平台和能力状态 | 不返回环境变量或绝对敏感路径 |
| `dialog:choose-pdfs` | R → M | 选择并导入 PDF | 只能由用户手势触发；扩展名和签名校验 |
| `papers:import-dropped` | R → M | 导入拖入窗口的 PDF | Preload 用 `webUtils.getPathForFile` 解析；Renderer 不获得路径 |
| `dialog:choose-library` | R → M | 选择论文库根目录 | 规范化路径并阻止危险系统目录 |
| `papers:list` | R → M | 分页、过滤论文 | 查询长度和页大小有上限 |
| `papers:get` | R → M | 获取论文详情 | 仅接受 UUID |
| `papers:update-metadata` | R → M | 修改允许的元数据字段 | 字段白名单、长度限制、乐观并发 |
| `papers:remove` | R → M | 从库移除/进入回收 | 需要显式确认令牌，不直接任意删除路径 |
| `papers:get-pdf-url` | R → M | 获取当前会话的协议 URL | 按 paper ID 授权，短期会话令牌 |
| `reader:get-state` | R → M | 获取阅读进度 | 仅 paper ID |
| `reader:save-state` | R → M | 保存页码、缩放和模式 | 节流、值域校验 |
| `search:paper` | R → M | 当前论文全文搜索 | 查询和返回条数有上限 |
| `annotations:list` | R → M | 获取论文批注 | 仅 paper ID |
| `annotations:create` | R → M | 创建高亮/批注 | 锚点 schema、文本和矩形上限 |
| `annotations:update` | R → M | 修改颜色/正文/锚点 | 所有权、版本和字段校验 |
| `annotations:delete` | R → M | 软删除批注 | 仅 annotation ID |
| `notes:list` | R → M | 获取论文笔记 | 仅 paper ID |
| `notes:save` | R → M | 保存用户编辑后的 Markdown | 大小限制、乐观并发 |
| `ai:get-capabilities` | R → M | 获取已配置 Provider/模型能力 | 不返回 Key 或密文 |
| `ai:start-task` | R → M | 翻译、解释、问答、摘要 | 枚举任务类型；paper/selection 范围校验 |
| `ai:cancel-task` | R → M | 取消当前 AI 请求 | request ID 绑定当前窗口 |
| `ai:get-conversation` | R → M | 读取本地会话 | 仅 conversation ID |
| `settings:get` | R → M | 获取非秘密设置 | 设置键白名单 |
| `settings:update` | R → M | 更新非秘密设置 | schema 和枚举校验 |
| `secrets:set-provider-key` | R → M | 安全保存 Key | 值只在调用参数短暂存在，禁止日志 |
| `secrets:delete-provider-key` | R → M | 删除 Key | Provider ID 白名单 |
| `secrets:get-provider-key-state` | R → M | 返回是否配置 | 只返回布尔值和后端状态 |
| `export:choose-vault` | R → M | 选择 Obsidian Vault | 用户手势、目录校验、记录授权根 |
| `export:preview` | R → M | 预览文件名和 Markdown | 不写文件，内容长度限制 |
| `export:create` | R → M | 创建新 Markdown 文件 | 仅授权 Vault、排他创建、禁止覆盖 |
| `git:inspect` | R → M | 获取仓库/分支/远程状态 | 仅授权根，不含凭据 |
| `git:commit-export` | R → M | 暂存并提交导出文件 | 只接受 export record ID 与提交消息 |
| `git:push` | R → M | 推送已有上游 | 禁止 force、URL 参数和任意 refspec |
| `jobs:list` | R → M | 获取解析/嵌入任务状态 | 分页和状态枚举 |
| `jobs:retry` | R → M | 重试允许的失败任务 | job ID 与类型白名单 |

`R → M` 表示渲染进程通过 preload 调用主进程。路径选择通道返回授权句柄/逻辑 ID，UI 不获得可用于任意文件访问的通用接口。

### 5.2 主进程事件

| 通道 | 方向 | 用途 | 限制 |
| --- | --- | --- | --- |
| `events:import-progress` | M → R | 导入进度 | 绑定发起窗口和 operation ID |
| `events:job-progress` | M → R | 提取/嵌入进度 | 无原始 PDF 文本 |
| `events:ai-stream` | M → R | token、引用、完成或错误 | 绑定 request ID；取消后停止 |
| `events:library-changed` | M → R | 通知刷新查询 | 仅实体 ID 和变更类型 |
| `events:git-progress` | M → R | Git 步骤状态 | stdout/stderr 脱敏和长度限制 |

Preload 的每个 `onX` 方法只订阅对应固定通道并返回取消函数。导航、刷新或窗口关闭时自动移除监听器。

## 6. 本地数据和文件存储

### 6.1 路径职责

- `app.getPath('userData')`：仅保存启动配置、论文库位置指针、加密 secrets 文件、应用日志和可重建缓存。
- 论文库根目录：首次启动自动使用 `app.getPath('documents')/PaperMind Library`；用户可随后通过受控迁移流程更改位置。
- SQLite 数据库和受管 PDF 均在论文库根目录，便于用户整体备份；密钥永远不随论文库移动。
- Obsidian Vault 和 Git 仓库是独立、由用户授权的外部根目录，不并入论文库。

### 6.2 论文库目录

```text
PaperMind Library/
├── library.sqlite3
├── papers/
│   └── ab/
│       └── <full-sha256>.pdf
├── derived/
│   └── <paper-id>/
│       └── extraction-v<version>.jsonl.zst   # 可重建缓存，可选
├── backups/
│   └── library-<schema>-<timestamp>.sqlite3
├── trash/
│   └── <paper-id>/...
└── .papermind-library.json
```

- PDF 以内容 SHA-256 寻址，同内容只保留一份物理文件；数据库保存逻辑论文与文件的关系。
- 导入先复制到同卷临时文件，计算哈希并验证 PDF 签名，再原子重命名。
- 数据库只保存相对于论文库根目录的受管路径；解析后必须确认路径仍位于根目录内。
- `derived` 内容可以由 PDF 和数据库重建，不作为唯一事实源。
- 论文库标识文件只包含格式版本和随机 library ID，不含密钥。

## 7. SQLite 数据访问

- SQLite 连接只存在于主进程信任域的专用数据库 Worker；主进程服务通过消息调用 Repository。
- Preload 和 Renderer 不加载 SQLite 驱动，不执行 SQL，不了解表结构。
- 单写连接开启 `foreign_keys=ON`、WAL 和合理的 `busy_timeout`；写入在短事务中完成。
- 所有 schema 变更使用前向、编号迁移；升级前完成一致性检查和备份。
- 查询使用参数绑定，排序字段和 FTS 表达式采用白名单构造。
- 详细实体和关系见 `data-model.md`。

## 8. PDF 阅读、搜索与批注

### 8.1 阅读

- `papermind-pdf://paper/<paper-id>?token=<session-token>` 由主进程解析为受管文件，并支持 Range 请求。
- PDF.js 按需渲染可视页，使用虚拟化限制内存占用。
- 阅读进度以 PDF 页索引（数据库为 1-based page number）、缩放、旋转和布局模式保存。

### 8.2 搜索

- 当前页面搜索可使用 PDF.js text layer 即时定位。
- 全文搜索使用提取后的规范文本和 SQLite FTS5，结果返回 page number、snippet 和 chunk/字符范围。
- 扫描 PDF 在无 OCR 时明确标记“无可搜索文本”。

### 8.3 批注锚点

持久化锚点由三层信息组成：

1. 文本引用：`exact`、`prefix`、`suffix`，用于内容校验和重新定位。
2. 文本位置：页内规范文本的 `start`/`end` 字符偏移，必要时跨页记录多个 span。
3. 几何位置：每页一个或多个相对 CropBox 的归一化矩形和页面旋转，用于快速回放。

几何位置不是唯一依据。PDF 文件变更或提取算法升级后，先用文本位置，再用 quote 上下文模糊重定位；无法可靠定位时保留批注并标为 orphaned，不能静默移动到错误文本。

## 9. AI Provider 抽象

### 9.1 接口

```ts
interface AIProvider {
  readonly id: string;
  getCapabilities(): ProviderCapabilities;
  validateConfiguration(signal: AbortSignal): Promise<ValidationResult>;
  streamChat(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
  embed(request: EmbeddingRequest, signal: AbortSignal): Promise<EmbeddingResult>;
}
```

领域类型只包含消息、结构化输出 schema、模型 ID、用量和错误类别，不泄漏 Provider SDK 对象。Provider Registry 由主进程创建，Key 按请求从 Secret Store 解密到内存，用后释放引用，不进入 Renderer、SQLite 或日志。

### 9.2 请求路径

```text
用户操作
→ Renderer 提交任务意图
→ Preload 固定方法
→ Main IPC schema/权限校验
→ AI Orchestrator 选择本地上下文
→ 用户隐私策略检查
→ Secret Store 解密 Key
→ AIProvider HTTPS 请求
→ 主进程解析/校验流
→ 脱敏事件返回 Renderer
→ 本地保存允许的结果和引用
```

AI 请求只能从主进程 AI Service 发起。MVP 的 OpenAI endpoint 固定为官方 HTTPS 服务；开放自定义 base URL 属第二阶段，需要额外 SSRF 和证书策略。

### 9.3 Key 持久化

- 主进程使用 Electron `safeStorage` 调用操作系统安全存储能力：Windows 对应 DPAPI，macOS 对应 Keychain，Linux 依赖可用的 Secret Service。
- 加密后的密文保存在 `app.getPath('userData')/secrets.v1.json`，与论文库和 SQLite 分离；Renderer 只能查询“是否已配置”，不能取回明文或密文。
- Linux 后端不可用或退化为不安全的 basic-text 时不落盘，只允许本次会话内存使用。完整降级和日志规则见 `security.md`。

## 10. 论文 RAG 流程

### 10.1 入库与切片

1. 计算 PDF SHA-256 并创建不可变文件记录。
2. PDF.js 按页提取文本项、页面尺寸和基础元数据。
3. 规范化断行、连字符和 Unicode 空白，同时保留规范文本到页内原始文本项的映射。
4. 优先按标题、段落和句子边界切片；目标约 800 tokens，重叠约 120 tokens。
5. 每个 chunk 保存切片器版本、token 数、页码范围和一个或多个 source span。
6. 通过 Embedding Provider 批量生成向量，保存模型 ID、维度和内容哈希。
7. 对 chunks 建 FTS5 索引，对向量建立 SQLite 本地向量存储。

切片参数是初始默认值，后续应由真实论文基准调整；参数变化创建新版本，不静默复用旧向量。

### 10.2 检索与生成

1. 对问题生成 embedding，同时执行 FTS5 词法检索。
2. 合并向量 Top-K 和词法结果，按 chunk ID 去重并做分数归一化。
3. 可加入相邻 chunk，控制总 token 预算，并避免重复页段。
4. 将每段标记为稳定引用 ID，例如 `[P12-C0042]`，提示模型只能引用提供的来源。
5. 流式解析回答；引用 ID 必须存在于本次上下文，否则标记为无效并不生成跳转。
6. 保存 message、实际使用的 chunk 和 source span，保证会话回放可追溯。

MVP 单论文向量量较小，使用 SQLite 中的 little-endian Float32 BLOB（读取时校验模型维度和 chunk 内容哈希）加应用内精确余弦扫描；这是一种可重复的 flat index。`VectorRepository` 保留替换接口，跨论文规模达到性能阈值后再以基准测试决定 sqlite-vec/ANN 方案。

### 10.3 引用定位

- 引用记录固定到生成时的 `paper_file_id`、`chunk_id`、page number 和 source spans。
- 点击引用后，Reader 先打开页码，再用 text position/quote selector 匹配文本层并高亮。
- 如果 PDF 文件版本或提取版本不一致，显示引用可能过期并尝试只读重定位，不篡改历史记录。
- 引用证明“模型使用了该片段”，不自动证明回答正确；UI 应允许查看原文。

## 11. Obsidian 单向导出

### 11.1 MVP 方向

- 唯一方向是 `PaperMind → Obsidian Vault`。
- 用户通过系统对话框选择 Vault，主进程保存授权根目录。
- 默认写入 `<Vault>/PaperMind/`，文件名为清理后的标题加短 paper ID。
- 内容包括 YAML frontmatter、论文元数据、用户笔记、选定批注、AI 摘要和稳定引用说明。
- 使用临时文件和排他创建；目标存在时生成带时间戳/序号的新文件，不覆盖。
- 不扫描、解析、合并或回写用户已有 Markdown，不监视 Vault，不删除 Vault 文件。

导出记录保存目标相对路径、内容哈希和时间，用于审计和 Git 限定暂存；它不赋予后续自动覆盖权限。若未来允许更新 PaperMind 管理文件，必须新增显式产品决策和冲突策略。

### 11.2 Markdown 安全

- YAML 值使用可靠 serializer 转义，用户内容不通过字符串拼接注入 frontmatter。
- 文件名移除平台保留字符、尾随点/空格和路径分隔符，并处理 Windows 保留名。
- 所有目标路径规范化后必须仍在授权 Vault 内；拒绝通过 `..` 或符号链接逃逸。

## 12. GitHub 同步

MVP 实际边界是“用系统 Git 把 PaperMind 导出文件推送到用户已配置的 GitHub 远程”，不调用 GitHub API，也不创建远程仓库。

### 12.1 认证

- HTTPS：复用系统 Git credential helper / Git Credential Manager。
- SSH：复用系统 SSH agent 和用户已有 key 配置。
- PaperMind 不显示 Token 输入框，不读取 credential helper 输出，不保存 GitHub Token、密码或私钥。

### 12.2 受限流程

1. 以 `git rev-parse` 确认用户授权目录属于仓库，并记录仓库 canonical root。
2. 检查当前分支、上游、远程 URL 和工作树状态。
3. 只对本次有效 export record 对应的相对路径执行 `git add -- <paths>`。
4. 用固定作者环境/用户现有 Git 配置执行 `git commit -m <validated-message> -- <paths>`。
5. 只执行等价于 `git push` 的已有上游推送，不接受用户构造 refspec 或命令参数。
6. 认证、非快进、hooks 或网络失败即停止，展示脱敏错误，不自动 pull/merge/rebase，不 force push。

所有调用使用 `spawn/execFile` 参数数组且 `shell=false`。如果仓库已有与导出文件重叠的暂存变更，MVP 停止并要求用户自行处理，避免修改用户索引状态。

## 13. 后台任务与故障恢复

- 导入、文本提取、嵌入和大型导出使用持久化 `jobs` 状态机：queued、running、succeeded、failed、cancelled。
- 每步必须幂等，应用崩溃后 running 任务转回可重试状态。
- 先提交文件再提交数据库引用或使用补偿清理，避免悬空记录。
- Provider rate limit 使用有上限的指数退避；用户取消优先于重试。
- Git 操作不自动重试认证或非快进错误。

## 14. 打包和发布

### 14.1 构建

- Vite 分别构建 main、preload 和 renderer；生产环境生成 source map 时不得公开发布含敏感路径的 map。
- `electron-builder` 生成 Windows NSIS、macOS DMG/ZIP 和 Linux AppImage；是否增加 deb 由用户分布确认。
- `better-sqlite3` 使用锁定版本随包提供的 Node-API 平台二进制；CI 必须在实际 Electron 和安装包中加载驱动并执行迁移，不能只用系统 Node 验证。
- 打包校验 ASAR 内容、CSP、原生模块解包清单、license 和产物 SHA-256。

### 14.2 发布

- CI 使用 Windows、macOS、Linux 原生 runner 构建，不能用单平台结果替代三平台验证。
- Windows 生产包需 Authenticode；macOS 需 Developer ID 签名、hardened runtime 和 notarization。
- 签名证书、notarization 凭据只存在 CI Secret/系统 Keychain，不写入仓库。
- 发布候选先通过安装/升级/卸载不丢库、导入、打开 PDF、数据库迁移的冒烟测试。
- GitHub Releases 可作为分发源；自动更新在签名和回滚策略完成后再启用，不属于首个开发切片。

## 15. 依赖方向

```text
Renderer UI → Preload Contract → Main Use Cases → Domain Interfaces
                                           ↓
                   SQLite / File / AI / Git / Export Adapters
```

- Domain 不依赖 React、Electron、Provider SDK 或 SQL 表。
- Infrastructure 实现 Domain 接口。
- IPC DTO 与数据库实体分离，避免表字段成为公共 API。
- 模块之间通过稳定 ID 和用例接口协作，不跨模块直接修改表。

## 16. 建议代码布局（Phase 1 以后）

```text
src/
├── main/
│   ├── ipc/
│   ├── services/
│   ├── workers/
│   └── infrastructure/
├── preload/
├── renderer/
│   ├── app/
│   ├── features/
│   └── components/
└── shared/
    ├── contracts/
    ├── domain/
    └── validation/
```

该布局仅是后续实现约束，本阶段不创建业务源码。

## 17. 架构验收检查

- [x] 主进程、preload、渲染进程职责明确。
- [x] IPC 请求和事件采用白名单。
- [x] SQLite 仅在主进程信任域的 Worker 访问。
- [x] PDF 位于用户可备份的论文库内容寻址目录。
- [x] AI 请求仅从主进程发起。
- [x] API Key 通过系统安全存储能力加密，密文与论文库分离。
- [x] Obsidian 首版仅单向创建，不覆盖已有笔记。
- [x] GitHub 首版复用系统 Git 凭据，不保存 Token。
- [x] RAG 切片、向量存储和引用定位有明确方案。
- [x] 三平台构建、签名和发布路径明确。
