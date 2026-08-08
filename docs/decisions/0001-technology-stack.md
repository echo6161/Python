# ADR-0001：PaperMind 技术栈与桌面架构基线

- 状态：已接受
- 日期：2026-08-08
- 决策范围：MVP

## 1. 背景

PaperMind 需要在 Windows、macOS 和 Linux 上提供一致的 PDF 阅读、SQLite 本地存储、AI 网络访问、文件导出和 Git 调用能力。产品要求本地优先、隐私优先，并要求 Renderer 不能直接获得 Node.js 或文件系统权限。

当前仓库尚无 JavaScript/TypeScript 工程。检查时系统可用 Git `2.55.0.windows.3`，但 `node`、`npm`、`pnpm`、`yarn` 和 `corepack` 均不在 `PATH` 中。因此本 ADR 只确定方向，不安装依赖或锁定未经验证的版本。

## 2. 决策

### 2.1 应用框架

- Electron：提供跨平台桌面运行时、窗口生命周期和受控系统能力。
- React + TypeScript：实现 Renderer UI 和静态类型约束。
- Vite：分别构建 Main、Preload 和 Renderer 入口。
- Tailwind CSS：用于设计令牌和组件样式，不以动态类名承载领域逻辑。

### 2.2 PDF

- PDF.js 用于页面渲染、文本层、搜索和文本提取。
- PDF 视为不可信输入，在启用沙箱的 Renderer/Worker 环境解析。
- 持久化引用使用文本选择器和规范化坐标，不依赖 PDF.js 内部对象或 DOM 节点。

### 2.3 本地数据

- SQLite 是元数据、批注、笔记、全文索引和 RAG 元数据的唯一结构化事实源。
- `better-sqlite3` 是候选驱动，在 Main 信任域的专用 Worker 中持有连接；Phase 1 必须验证 Electron ABI 重建和三平台打包。
- SQLite FTS5 提供词法全文检索。
- MVP 将 Float32 嵌入向量保存为 SQLite BLOB，对单篇论文做精确余弦检索；`VectorRepository` 隔离实现，规模扩大后再评估 sqlite-vec 或 ANN。
- API Key 不进入 SQLite。

### 2.4 AI

- 首个正式 Provider 实现为 OpenAI，但领域层只依赖 `AIProvider` 接口。
- AI HTTP 请求只由 Main 的 AI Service 发起。Renderer 只能提交经过验证的任务意图并接收结果流。
- Chat 和 embedding 是分离能力；模型名称、维度和切片版本随向量记录保存。
- MVP 不给模型提供工具调用权限。

### 2.5 安全存储

- 使用 Electron `safeStorage` 加密 API Key，密文写入 `userData` 下权限受限的独立 secrets 文件。
- Linux 若安全后端不可用或退化为 basic-text，则不持久化 Key，改为会话内存保存并提示配置系统 Secret Service。
- 后续可评估原生 Keychain 库，但不得为统一体验降低 Linux 安全基线。

### 2.6 包管理与质量工具

- 采用 pnpm，并在 Phase 1 的 `package.json#packageManager` 中固定确切版本。
- Node.js 采用 Phase 1 安装时的 Active LTS，在 `.node-version` 和 `engines` 中固定；安装前不猜测版本。
- ESLint 负责静态检查，TypeScript 独立执行 `tsc --noEmit`，Vitest 负责单元/集成测试，Playwright 负责 Electron E2E。
- 不用关闭规则、放宽 TypeScript 或删除测试来通过门禁。

### 2.7 打包发布

- `electron-builder` 是候选打包器，输出 Windows NSIS、macOS DMG/ZIP、Linux AppImage，必要时补充 deb。
- SQLite 原生模块针对 Electron ABI 重建，并进入三平台安装包冒烟测试。
- 生产资源放入 ASAR；仅按最小范围解包必要原生模块。
- Windows 使用 Authenticode；macOS 使用 Developer ID 签名和 notarization；凭据只放 CI Secret。
- 发布载体可使用 GitHub Releases，但创建远程仓库、自动更新和发布流水线不属于 Phase 0。

## 3. 进程边界

- Main：窗口、协议、文件、SQLite 服务、AI、Secret Store、Git、导出和系统对话框。
- Preload：通过 `contextBridge` 暴露最小、类型化、按用例设计的 API；不暴露 `ipcRenderer`、路径或通用文件接口。
- Renderer：React 状态和 UI、PDF.js 展示、用户输入；固定 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。

完整职责和 IPC 白名单见 `../architecture.md`。

## 4. 备选方案

### 4.1 Tauri

安装包更小、系统边界较强，但会引入 Rust 工具链和团队双语言维护成本，且与既定 Electron 方向冲突。MVP 不采用。

### 4.2 IndexedDB 作为主数据库

可避免原生 SQLite 驱动，但不利于跨窗口一致性、备份、迁移、FTS 和数据可移植性。仅可用于非关键 UI 缓存。

### 4.3 Renderer 直接访问 SQLite 或 Node.js

实现快但扩大 XSS 和恶意 PDF 的影响范围，违反验收标准，拒绝采用。

### 4.4 独立向量数据库服务

会破坏离线可用性并增加部署、隐私和运维成本。MVP 的单论文规模不需要独立服务。

### 4.5 应用保存 GitHub Personal Access Token

增加高价值密钥的存储和泄漏面。MVP 复用系统 Git Credential Manager、credential helper 或 SSH agent，不采用应用自管 Token。

## 5. 结果与代价

### 5.1 正面结果

- UI 技术统一，三平台共享绝大多数代码。
- 特权能力集中，安全边界可测试和审计。
- 数据无需 PaperMind 云服务即可阅读、备份和迁移。
- AI、向量检索和导出均有接口边界，可在后续替换实现。

### 5.2 代价和风险

- Electron 体积和内存占用高于原生方案。
- `better-sqlite3` 带来 Electron ABI 与三平台原生打包风险，必须在工程骨架阶段优先验证。
- `safeStorage` 的 Linux 安全性依赖桌面 Secret Service，必须检测后端而不是假定安全。
- 精确向量扫描适合单论文，不适合大规模跨库语义搜索；第二阶段需基于基准测试升级。
- 三平台签名、notarization 和发布基础设施需要各平台 CI 与外部证书。

## 6. 决策确认

以下事项已于 2026-08-08 接受：

1. pnpm 作为唯一包管理器。
2. 接受 `better-sqlite3` 原生模块风险，并把三平台打包验证放在业务开发前。
3. `electron-builder` 作为首选打包器；若验证失败，再用 ADR 记录替换方案。
4. Linux 无安全后端时不持久化 API Key，只允许会话内使用。

正式发布仍需确认 Apple Developer 和 Windows 代码签名资源；这些不阻塞 Phase 1 本地开发，但会阻塞 Phase 9 正式发布。
