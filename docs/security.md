# PaperMind 安全与隐私模型

> **Phase 5.5 extension (2026-08-10):** The Phase 1-5 controls below remain in
> force. Zotero, Git/GitHub, VS Code handoffs, Obsidian, AI providers, and future
> agent runtimes are external trust domains. Their authority is defined in
> [data-ownership.md](./data-ownership.md); the target boundary is defined in
> [architecture.md](./architecture.md).

## Phase 5.5 External Adapter and Agent Boundary

- Only Main-process adapters may access the Zotero local API, Git, OS paths,
  external AI endpoints, or any future local Codex/agent service.
- Renderer cannot make arbitrary localhost requests. A localhost origin is not a
  trust boundary and must not be added broadly to CSP `connect-src`.
- Every adapter method is domain-specific, runtime-validated, scoped, bounded,
  cancellable, timed out, and represented in a fixed IPC allowlist.
- Returned external data is untrusted input. Normalize it into bounded DTOs;
  never render unsanitized HTML or treat paper/code text as instructions.
- Agent tools follow least privilege. Arbitrary shell, SQL, filesystem reads,
  URL fetch, raw Git commands, raw Zotero requests, and generic IPC are forbidden.
- Agent tool calls record actor, Workspace, purpose, resource scope, inputs
  redacted as needed, outcome, provenance, and approval when required.
- Read-only operations still enforce item/result/byte/time limits. Mutating,
  destructive, executable, publishing, commit, push, or export actions require
  explicit capability-specific approval in their future phases.
- Cached external data carries source identifiers, observation time, freshness,
  and version/fingerprint when available. Stale snapshots are labeled rather
  than silently presented as current.
- Credentials and session material stay in OS-backed secure storage or the
  owning tool. They never enter Renderer, SQLite plaintext, logs, exports,
  prompts, or agent tool results.

## Phase 6 Zotero Controls

- Zotero Local API origin is compiled into Main as `http://127.0.0.1:23119/api/`.
  Preload and Renderer cannot select protocol, host, port, endpoint, or headers.
- The client sends only `GET` and uses internally generated user/group,
  collection, item, child, and attachment-availability routes.
- Main negotiates API v3 and prefers a valid `Zotero-Server-ID`. Zotero 9 may
  use only the real non-zero user-library ID returned by the API, labeled
  `library_fallback`; PaperMind never fabricates a database ID. Empty legacy
  libraries without either identity fail closed. References are rejected when
  the active native server ID or fallback library ID changes.
- Responses have fixed timeout, byte, page, result, and attachment-probe
  concurrency limits. Invalid status, headers, JSON, keys, or DTO output fail
  closed with redacted structured errors.
- Search/list pagination accepts only an opaque UUID, a non-negative offset,
  and a page size from 1 to 25. Cancellation is a dedicated IPC operation keyed
  by the invoking Renderer and that UUID; it cannot cancel or address arbitrary
  network traffic.
- The attachment file endpoint is an availability probe only. Main discards its
  response body after checking it is non-empty; no file URL or path crosses IPC.
- PaperMind does not read `zotero.sqlite`, enumerate Zotero storage, copy Zotero
  attachments, authenticate writes, or add localhost access to Renderer CSP.

## Phase 7 Workspace Controls

- Workspace operations use only fixed `workspaces:*` IPC channels and the frozen
  `window.paperMind.workspace` preload namespace. Every input and output is
  validated with a strict Zod schema in Main.
- Renderer can submit a Workspace UUID and a normalized `ZoteroItemRef`; it
  cannot submit a URL, protocol, host, port, request headers, SQL, or file path.
- Workspace persistence is reachable only through the Database Worker gateway.
  Renderer and preload never receive SQLite access or table/repository handles.
- Zotero metadata resolution remains a Main-to-Main call from WorkspaceService
  to the read-only ZoteroBridgeService. No raw Zotero payload is persisted.
- Workspace delete requires the literal `DELETE_WORKSPACE` confirmation and can
  delete only Workspace-owned rows. It has no Zotero, PDF, annotation,
  collection, or legacy Paper deletion capability.
- Changed Zotero server/profile identity is reported as `stale_identity`; it is
  never silently repaired by item key, title, DOI, path, or filename.

- 文档状态：Phase 0 基线草案
- 安全目标：限制不可信内容的权限，最小化外发数据，保护凭据，避免破坏用户文件和 Git 历史

## 1. 保护对象

- 用户的 PDF、元数据、阅读进度、高亮、批注、笔记和 AI 对话。
- AI Provider API Key 及其账户配额。
- Obsidian Vault 中 PaperMind 未创建的用户文件。
- Git 仓库工作树、暂存区、提交历史和系统 Git 凭据。
- 本机其他文件、环境变量、系统命令和网络身份。
- 应用更新、安装包和数据库迁移的完整性。

## 2. 威胁假设

### 2.1 主要威胁

- 恶意或损坏 PDF 利用解析器、链接、嵌入脚本或超大对象攻击应用。
- 渲染层 XSS 或第三方依赖被利用后尝试访问 Node.js、文件、Key 或系统命令。
- IPC 参数注入、路径遍历、符号链接或竞态导致越权文件读写。
- 恶意论文文本通过 prompt injection 诱导模型泄露数据或执行动作。
- API Key 出现在 SQLite、日志、崩溃报告、Renderer DevTools、导出文件或 Git 中。
- Git 参数/提交消息注入，错误暂存用户文件，或破坏分支历史。
- AI Provider、网络观察者或日志获得超过完成任务所需的论文内容。
- 未签名或被篡改的安装包、更新包和原生模块执行恶意代码。

### 2.2 信任边界外

- PaperMind 不能保护已解锁且被完全控制的操作系统账户。
- PaperMind 不能保证第三方 AI Provider 如何保留其收到的数据；应用必须透明告知并让用户选择。
- PaperMind 不能替代磁盘加密、系统备份、GitHub 账户 MFA 或 SSH key 管理。
- 用户主动在其他工具中编辑、移动或删除库/Vault 文件可能造成不一致，应用应检测并安全失败。

## 3. 信任分区

| 区域 | 信任级别 | 能力 |
| --- | --- | --- |
| Main 服务 | 高 | 受控文件、数据库、AI 网络、系统 Git、安全存储 |
| SQLite Worker | 高 | 仅指定 library 数据库，无 UI/任意网络职责 |
| Preload | 中间桥接 | 固定 IPC 方法和事件，不持有长期秘密 |
| Renderer/React | 低 | UI 状态和用户输入，无 Node/文件/任意网络 |
| PDF.js Worker/PDF 内容 | 不可信 | 仅解析/渲染已授权 PDF 字节 |
| AI Provider | 外部 | 仅接收用户触发任务的最小上下文 |
| Obsidian Vault/Git hooks | 外部且可能不可信 | 只在明确授权和预检后有限写入/执行 Git |

## 4. Electron 加固

### 4.1 BrowserWindow

必须设置并测试：

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
allowRunningInsecureContent: false
```

- 不使用已废弃的 `remote` 模块。
- 不开启实验性 Web 平台特性或宽泛命令行安全开关。
- 生产 Renderer 从打包资源/安全自定义 scheme 加载，不从远程 URL 加载 UI。
- DevTools 只在开发构建按显式开关开放。

### 4.2 导航和窗口

- `will-navigate` 默认阻止非应用 URL。
- `setWindowOpenHandler` 默认 deny；允许的 `https:` 外链由 Main 校验后调用 `shell.openExternal`。
- 拒绝 `file:`、`javascript:`、`data:`、自定义命令 scheme、包含凭据的 URL 和非 HTTP(S) 外链。
- 外链打开前显示实际主机；高风险操作可要求确认。
- WebContents permission handler 默认拒绝摄像头、麦克风、位置、通知、剪贴板读取等未使用权限。

### 4.3 CSP 和依赖

生产 CSP 基线：

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'none'
```

不使用 `unsafe-eval`；PDF.js 配置关闭动态代码求值能力。若开发服务器需要放宽 CSP，只限开发配置，不能进入生产包。第三方依赖固定 lockfile，CI 执行审计、许可证检查和高风险更新审阅。

## 5. IPC 安全

- 只注册 `architecture.md` 中的通道白名单。
- Preload 不暴露通用 `send`、`invoke`、`on`、Electron event 或 Node Buffer。
- Main 使用运行时 schema 校验所有输入，不信任 TypeScript 编译期类型。
- 对字符串、数组、Markdown、选择区域、查询结果数和消息流设置大小/速率限制。
- 以 `event.senderFrame`/WebContents 身份确认调用来自应用主 frame；子 frame 不获得特权 API。
- AI、导入、导出和 Git operation ID 绑定发起窗口，防止其他窗口监听或取消。
- 错误返回稳定错误码和安全消息，不返回堆栈、SQL、系统环境或 Key。
- 事件监听在卸载/导航时注销，避免泄漏和重复处理。

新增 IPC 通道必须同时提交：契约、运行时 schema、权限说明、Main handler 测试、Preload 测试和安全审阅。

## 6. 文件系统和路径

### 6.1 授权模型

- 普通 Renderer 从不提交任意绝对路径进行读写。
- 导入源、library root 和 Vault root 由系统文件/目录选择器产生，并由 Main 记录授权作用域。
- Git root 必须从获授权 Vault/目录向上解析得到，并再次让用户确认。
- 重启后仅恢复已保存的根目录授权；路径不存在、设备变化或标识文件不匹配时重新授权。

### 6.2 路径校验

每次特权操作：

1. 规范化并解析 canonical path。
2. 检查目标位于授权根内，使用路径组件比较而非字符串前缀。
3. 拒绝 `..`、NUL、平台保留设备名、alternate data streams 和超长组件。
4. 检查现有父目录和目标的符号链接/junction，避免逃逸。
5. 在最终写入时使用排他创建/安全句柄减少检查与使用竞态。

导出使用同目录临时文件、flush 和原子重命名；MVP 对最终文件使用 create-new 语义，绝不覆盖。删除只作用于数据库关联的受管路径，不能接受 UI 传入的文件路径。

### 6.3 PDF 文件

- 同时检查 `.pdf` 扩展名、文件头和合理大小，不能只信任 MIME。
- 导入时计算 SHA-256；受管文件后续异常变化时暂停解析并提示完整性错误。
- 设置文件大小、页数、对象和提取文本上限，支持取消，防止资源耗尽。
- 加密 PDF 不尝试记录密码；MVP 可提示用户使用外部工具解密后重新导入。

## 7. SQLite 安全与完整性

- 数据库连接只在 Main 信任域的 Worker，不向 Renderer/Preload 暴露 SQL。
- 使用参数绑定；动态排序、字段、FTS 操作符和 pragma 均走白名单。
- `foreign_keys=ON`，写操作用事务，迁移前备份并验证 schema 版本。
- library 锁防止两个应用实例并发写同一数据库。
- 备份含敏感研究内容，UI 明确提示用户使用系统权限和磁盘加密保护。
- 不自动加载数据库扩展；如未来采用 sqlite-vec，只加载随签名应用打包、哈希固定的扩展路径。
- 日志不得包含 SQL 参数中的论文正文、批注全文或对话全文。

SQLite 不加密不等于数据公开上传；但它不能抵抗本机文件读取攻击。数据库静态加密属于后续独立决策，需要密钥恢复与搜索性能设计，不能用硬编码密钥伪装实现。

## 8. API Key 和系统安全存储

### 8.1 保存流程

1. Key 通过专用 preload 方法发送给 Main，不进入 React 全局状态、URL、localStorage 或剪贴板历史。
2. Main 立即用 Electron `safeStorage.encryptString` 加密。
3. 只将密文、Provider ID、后端标识和时间写入 `userData/secrets.v1.json`。
4. 文件权限限制为当前用户；Key 明文变量不记录、不回传，使用后释放引用。
5. UI 只能查询“已配置/未配置”和安全后端状态，不能取回 Key。

### 8.2 平台行为

- Windows 使用操作系统 DPAPI 能力。
- macOS 使用登录 Keychain 能力。
- Linux 依赖可用的 Secret Service/桌面安全存储后端。
- 如果 `safeStorage` 不可用或报告退化为不安全的 basic-text 后端，应用不得持久化 Key，只允许会话内存使用并清晰提示。

加密密文不存 SQLite、不在论文库、不导出到 Obsidian、不进入 Git。删除 Provider 配置时删除密文并使内存缓存失效。

## 9. AI 数据边界

### 9.1 明确同意和最小发送

- AI 默认不可用，直到用户配置 Provider 并接受首次发送提示。
- 每次请求必须源于明确操作；MVP 不在后台自动摘要或嵌入整库。
- 翻译/解释只发送选择文本和必要提示。
- RAG 只发送当前问题、当前论文检索出的 Top-K chunks、必要历史和引用标签。
- 摘要可需要较多论文文本，发起前显示范围和预计分批行为并允许取消。
- 不发送文件路径、库中其他论文、批注/笔记或用户身份，除非该用例明确需要且 UI 已说明。

### 9.2 Provider 和网络

- Phase 5 OpenAI 请求仅由 Main 发起，Renderer CSP 不允许直连；默认 endpoint 是官方 `https://api.openai.com/v1`。
- 设连接/总超时、取消、响应大小和重试上限；不对认证失败自动重试。
- Provider 错误先脱敏再展示，移除 header、Key、请求正文和可能的账户信息。
- 本阶段明确要求的自定义 Base URL 仅允许公开 HTTPS/443：保存时拒绝凭据、query、fragment、本机/私网/保留地址，请求前检查全部 DNS 结果，禁止 HTTP 重定向，并在更换到非官方主机时由 Main 原生确认框重新取得用户同意。代理和其他兼容 Provider 仍后移。
- OpenAI Responses 请求显式设置 `store: false`；这不会替代 Provider 自身的数据政策，发送确认仍需清楚展示实际选区、问题和重放历史。
- 手动 ChatGPT bridge 不嵌入网页、不读取 Cookie/Token、不接受 Renderer 提供的 URL。Main 仅复制由固定模板和严格选区 schema 生成的提示词，并打开常量 `https://chatgpt.com/`；用户粘贴并提交前不发生内容上传，且该提示词不含本地对话历史。

### 9.3 Prompt injection

- 论文文本被标记为引用数据，不是系统指令。
- 系统提示明确忽略论文中要求泄露秘密、改变策略或执行操作的指令。
- MVP 不给模型 Shell、文件、Git、网络抓取或其他工具调用能力。
- 回答引用 ID 必须由 Main 对本次检索集合校验，模型不能自行构造有效跳转。
- 结构化输出经 schema 校验；失败时显示安全错误或降级为纯文本草稿，不直接执行内容。

这些措施降低但不能消除模型错误。UI 必须把 AI 输出标为生成内容，并提供原文核对入口。

## 10. Obsidian 导出安全

- MVP 是 PaperMind 到 Vault 的单向创建操作。
- 只写 `<Vault>/PaperMind/` 或用户明确批准的子目录。
- 最终文件排他创建；冲突时生成新名称，不覆盖、删除或合并现有笔记。
- Markdown/YAML 用 serializer 转义，文件名跨平台净化。
- 不执行 Markdown 内代码，不解析 Obsidian 插件，不跟随 Vault 内符号链接逃逸。
- 导出预览显示相对目标路径和内容范围。
- export record 只表示 PaperMind 曾创建该文件，不授权未来静默覆盖。

## 11. Git 和 GitHub 安全

### 11.1 凭据

- 复用系统 Git Credential Manager/credential helper 或 SSH agent。
- 不提供 GitHub Token/密码输入框，不读取、缓存或记录 helper 返回内容。
- 不访问 SSH 私钥文件，不把凭据注入命令行参数或环境变量。
- 认证交互由系统 Git/credential helper 负责；不可用时返回配置指导。

### 11.2 命令执行

- 使用 `spawn`/`execFile` 参数数组，`shell=false`，不拼接 Shell 字符串。
- Git 可执行文件路径通过可信系统查找或用户明确选择后校验，不从仓库配置执行任意 executable。
- 命令和 flags 固定白名单；禁止 force、reset、clean、checkout、rebase、merge、任意 alias 和任意 refspec。
- 仓库目录必须 canonicalize 并在授权范围内。
- 只暂存有效 export records 的路径，参数前使用 `--`。
- 若目标文件已有暂存变更、存在冲突、HEAD detached、无上游或 push 非快进，则停止。
- stdout/stderr 限长脱敏，不记录含凭据 URL；展示远程 URL 时移除 userinfo。

### 11.3 Git hooks

`git commit` 可能触发用户仓库 hooks，它们拥有用户权限并可能执行任意代码。MVP 不使用 `--no-verify` 绕过用户仓库策略；如仓库存在 hooks，每次提交前展示风险并要求本次确认，确认后才执行。应用不得静默执行未知 hooks。

## 12. 日志、诊断和遥测

- 默认只记录事件类型、稳定 ID、时长、错误码、版本和平台。
- 禁止记录 Key、Token、Authorization header、Cookie、完整 prompt、论文正文、批注/笔记全文、绝对私有路径和 Git credential 输出。
- 路径用 library-relative path 或不可逆短哈希表示；Provider request ID 按需且限期保存。
- 日志轮转、有大小和保留期上限，用户可查看和清除。
- MVP 不含远程遥测和自动崩溃上传。未来加入必须默认关闭、展示字段清单并单独选择加入。

## 13. 供应链、构建和发布

- lockfile 必须提交；依赖升级单独审阅 release notes、权限和原生代码变化。
- CI 运行 lint、typecheck、unit/integration、Electron E2E、依赖审计和产物冒烟测试。
- 构建脚本不得从未固定 URL 下载并执行代码。
- Windows 和 macOS 生产产物签名，macOS notarize；发布 SHA-256 校验值。
- CI 密钥使用平台 Secret，限制分支和环境权限，不在 PR 日志中展开。
- 原生 SQLite 模块需来自锁定依赖并针对目标 Electron ABI 重建。
- 自动更新只有在签名校验、渠道、失败回滚和数据库降级策略完成后启用。

## 14. 安全测试清单

- Renderer 中 `require`、`process`、文件 API 和原始 `ipcRenderer` 不可用。
- 未列入白名单的 IPC、错误 schema、超大 payload 和子 frame 调用被拒绝。
- 路径遍历、junction/symlink 逃逸、Windows 保留名和覆盖现有文件测试。
- 恶意 PDF、损坏 PDF、超大 PDF、加密 PDF 和外部链接测试。
- CSP、导航、窗口打开和 Web permission 拒绝测试。
- secrets 文件不含明文；SQLite、日志、导出和 Git diff 扫描无测试 Key。
- Linux 不安全安全存储后端时拒绝持久化测试。
- AI 引用伪造、prompt injection、取消、超时、错误脱敏测试。
- Git 参数注入、冲突、已有暂存文件、无上游、非快进和含凭据 remote URL 测试。
- 安装包签名、ASAR 内容、原生模块、全新安装和升级迁移测试。

## 15. 安全决策状态

已确认：

1. Git hooks 每次提示，用户确认后执行，不静默绕过或运行。
2. AI 对话默认仅在本地保存，并提供“不保存本次会话”和一键删除。
3. Linux 无安全存储后端时允许会话内 Key，但不持久化。

尚未纳入 MVP 的决策：论文库数据库静态加密。当前设计依赖操作系统账户权限和磁盘加密，并在产品中清楚说明；如需应用层静态加密，必须单独设计密钥恢复、迁移和搜索性能方案。
