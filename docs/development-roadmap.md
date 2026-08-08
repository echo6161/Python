# PaperMind 开发路线与测试策略

- 文档状态：Phase 0 已确认基线
- 约束：每个阶段只在用户明确批准后开始；不得自动进入下一阶段

## 1. 当前环境基线

Phase 0 检查及决策更新结果（2026-08-08）：

- 工作目录：`D:\code`
- 操作系统：Windows `Microsoft Windows NT 10.0.26200.0`
- Git：`2.55.0.windows.3`
- 当前分支：`main`
- 仓库边界：PaperMind 继续使用现有 Python 仓库，与既有 Python/Jupyter 文件共存。
- 当前远程：名为 `Python`，对应 `https://github.com/echo6161/Python.git`。
- Node.js：未安装或不在 `PATH`。
- npm、pnpm、yarn、corepack：均未安装或不在 `PATH`。
- 当前仓库没有 `package.json`、lockfile 或 README；Phase 0 设计文档位于 `docs/`。
- 当前仓库已有 Python/Jupyter 文件，PaperMind 后续阶段不得删除、覆盖或批量格式化这些文件。

Node.js 环境仍是 Phase 1 前置条件；复用现有仓库和技术组合已经确认。本阶段不安装 Node 依赖。

## 2. 阶段总览

```text
Phase 0 需求与架构
  ↓
Phase 1 安全桌面骨架 + 三平台打包/SQLite 风险验证
  ↓
Phase 2 本地论文库、数据库和文件导入
  ↓
Phase 3 PDF 阅读、搜索、高亮和持久化批注
  ↓
Phase 4 本地元数据、分类、检索和文献组织
  ↓
Phase 5 AI Provider、密钥和选中文本翻译/解释
  ↓
Phase 6 单论文 RAG 与带引用问答
  ↓
Phase 7 结构化笔记与 Obsidian 单向导出
  ↓
Phase 8 受限 Git 提交与 GitHub 推送
  ↓
Phase 9 MVP 加固、三平台签名与发布候选
```

每阶段开始前必须检查代码、Git 状态和项目文档，先给出计划；结束时运行适用的 lint、typecheck、test、build，报告真实结果后停止等待确认。

## 3. 阶段计划

### Phase 0：需求分析与系统架构设计（当前阶段）

交付：

- 产品需求和 MVP 边界。
- Electron 进程、IPC、数据、文件、AI/RAG、Obsidian、Git 和发布架构。
- 数据模型、安全模型、路线和技术栈 ADR。

完成条件：六份文档相互一致，列出待确认决策，不实现业务代码。

### Phase 1：工程与安全骨架

前置：批准 Phase 0；确认仓库归属；安装并固定 Node Active LTS 和 pnpm。

范围：

- Electron + React + TypeScript + Vite + Tailwind 最小工程。
- main/preload/renderer/shared 目录和构建入口。
- 安全 BrowserWindow 配置、CSP、导航/权限拒绝和类型化 IPC 样例。
- ESLint、TypeScript、Vitest、Playwright 基线和 CI。
- `electron-builder` 三平台最小产物。
- `better-sqlite3` Electron ABI 重建、临时数据库测试和打包后加载 spike。
- `.gitignore`、环境变量模板（不含 Key）、秘密扫描基线。

不含论文库业务 UI。若 SQLite 原生模块或打包器在三平台验证失败，暂停并记录新 ADR，不带风险进入数据功能。

完成门禁：lint、typecheck、unit、Electron 启动 E2E、生产 build；CI 至少验证三平台构建或明确记录尚无对应 runner 的阻塞。

### Phase 2：本地论文库与导入

依赖：Phase 1 数据库/打包 spike 通过。

范围：

- library manifest、SQLite 迁移框架和 Repository。
- papers、paper_files、authors、tags、collections、jobs 基础表。
- 系统文件选择、PDF 校验、SHA-256、内容寻址复制、去重和失败恢复。
- 论文列表、详情、元数据编辑和回收流程。
- 库备份、锁和完整性基础检查。

测试重点：迁移、事务中断、重复导入、损坏/加密/超大 PDF、路径边界、Windows/macOS/Linux 路径差异。

### Phase 3：PDF 阅读、搜索与批注

依赖：Phase 2 可稳定打开受管 PDF。

范围：

- 安全自定义 PDF 协议和 Range 读取。
- PDF.js 虚拟化阅读器、页码、缩放、布局和进度恢复。
- PDF.js 文本提取、论文内搜索和结果跳转。
- 文本选择、quote/text-position/rect 锚点、高亮、下划线和评论。
- 批注编辑、软删除、列表跳转和 Markdown/JSON 导出。
- 无文本层、损坏和加密状态；不实现 OCR。

测试重点：标准 PDF fixtures、跨页文本、不同旋转/页面尺寸、搜索定位、内存上限、恶意链接和 Worker 失败。

### Phase 4：本地元数据与文献组织

依赖：Phase 2 导入事务与 Phase 3 PDF.js 文本提取稳定。

范围：

- 标准 PDF Metadata 与首页标题、作者、摘要、DOI 候选提取。
- 字段级来源、置信度、待确认状态和人工覆盖保护；不联网补全 DOI。
- 作者、标签、单层 Collection、收藏和阅读状态管理。
- 标题、作者、年份、标签、Collection、阅读状态和本地全文过滤。
- 白名单排序，以及批量添加标签和修改阅读状态。

测试重点：有/无标准 Metadata、低置信候选、识别失败、人工确认、迁移、组合筛选、FTS、批量事务和重启持久化。

### Phase 5：AI Provider 与选择文本工具

依赖：Phase 1 安全边界；Phase 3 文本选择；批准 Provider 产品决策。

范围：

- `AIProvider`、OpenAI adapter、超时/取消/流式错误模型。
- `safeStorage` Secret Store 和 Linux 后端降级行为。
- AI 隐私同意、Provider/模型设置和最小发送预览。
- 选择文本翻译、解释及结果保存为本地笔记。
- Mock Provider；自动测试绝不调用真实 AI API。

测试重点：Key 不泄漏、Renderer 无 Key、流式取消、限流/认证错误、日志脱敏、prompt injection 边界。

### Phase 6：单论文 RAG 助手

依赖：Phase 3 chunks；Phase 5 chat/embedding Provider。

范围：

- embedding_models/chunk_embeddings、版本和幂等后台作业。
- 当前论文的精确向量检索 + FTS5 混合检索。
- token 预算、邻接 chunk、引用 ID 和 citation 校验。
- 对话、本地历史、引用跳转和删除。
- 使用固定离线 embeddings/Mock Provider 的确定性测试。

测试重点：检索相关性基准集、陈旧向量、错误维度、引用伪造、无答案、模型取消和失败恢复。若单论文精确扫描超出性能预算，再做向量扩展 spike，不提前引入独立服务。

### Phase 7：结构化笔记与 Obsidian 导出

依赖：Phase 3 annotations；Phase 5 AI；Phase 6 citations。

范围：

- 摘要/方法/贡献/局限模板、结构化输出校验和本地编辑。
- Markdown/YAML 渲染和导出预览。
- Vault 授权、`PaperMind/` 子目录、排他创建和冲突改名。
- export_targets/export_records 和内容哈希。

测试重点：YAML/Markdown 转义、跨平台文件名、路径遍历、符号链接、目标已存在、写入中断、证明已有用户笔记不被覆盖。

### Phase 8：Git 与 GitHub 推送

依赖：Phase 7 有可信 export records；系统安装 Git；确认 hooks 策略。

范围：

- Git 能力检测、仓库/分支/远程/上游检查。
- 只暂存 export record 文件的 add/commit。
- 使用系统 Git credential helper 或 SSH agent 推送已有上游。
- 认证、hooks、已有暂存变更、冲突、非快进的安全失败 UI。
- 不创建远程 GitHub 仓库，不保存 Token，不 pull/merge/rebase/force。

测试重点：参数注入、带空格路径、无上游、detached HEAD、已有 index 内容、hook 提示、非快进和凭据错误脱敏。自动测试使用本地 bare remote，不访问 GitHub。

### Phase 9：MVP 加固与发布候选

依赖：Phase 2-8 通过各自门禁；具备所需签名账户/证书。

范围：

- 性能、内存、无障碍、数据恢复和安全回归。
- 三平台安装包、签名/notarization、SBOM/许可证和校验值。
- 全新安装、升级迁移、卸载不删除 library、发布/回滚演练。
- 用户隐私说明、备份说明和已知限制。

完成条件：三平台真实安装包的核心流程冒烟通过；未签名或未 notarize 的产物不能标为正式发布。

## 4. MVP 后路线

### 第二阶段

建议顺序：

1. OCR spike 与扫描 PDF 数据模型扩展。
2. DOI/开放元数据补全和 BibTeX/RIS。
3. 本地 embedding Provider 与兼容 API 的独立安全设计。
4. 跨论文语义搜索和向量索引基准升级。
5. 可审阅的 Git 拉取状态与冲突指导。
6. PaperMind 管理导出文件的显式增量更新。

### 远期

双向 Obsidian、知识图谱、跨设备同步、协作和 Agent 能力分别需要独立需求、数据迁移、权限和威胁模型，不共享一个“大同步”阶段。

## 5. 测试策略

### 5.1 测试层级

| 层级 | 工具 | 覆盖重点 |
| --- | --- | --- |
| 静态门禁 | ESLint、TypeScript | 代码规则、跨进程契约、不可达类型错误 |
| 单元 | Vitest | Domain、切片、锚点、路径策略、Markdown、错误映射 |
| 数据集成 | Vitest + 临时 SQLite | 迁移、Repository、事务、FTS、向量编码、不变量 |
| Main/Preload 集成 | Vitest/受控 Electron | IPC schema、权限、Secret/Git/File adapters |
| Electron E2E | Playwright | 真实窗口、导入、阅读、批注、AI mock、导出、重启持久化 |
| 安装包冒烟 | 平台 CI/VM | 安装、启动、原生模块、迁移、卸载不丢数据 |
| 安全测试 | 单元 + E2E + 脚本 | CSP、导航、IPC、路径逃逸、Key/日志扫描、Git 注入 |

### 5.2 测试数据

- 仓库只提交许可清晰、小型、去身份化的 PDF fixtures。
- 覆盖文本 PDF、双栏、旋转页、跨页选择、损坏、加密、无文本层和恶意链接。
- AI 测试使用可编程 Mock Provider 和固定向量，不需要真实 Key 或网络。
- Git 测试在临时目录和本地 bare remote 运行，不创建或访问 GitHub 仓库。
- 测试 Key 使用明显的假值，并在测试后扫描 SQLite、日志、导出和 Git diff。

### 5.3 每阶段质量门禁

每个实现阶段至少执行：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及 Electron 行为时增加 E2E；涉及打包/原生模块时增加 package 和安装包冒烟。命令名称在 Phase 1 固定。失败必须修复或如实报告阻塞，不能关闭 TypeScript、删测试、忽略错误或伪造成功。

文档阶段不应为了“有命令可跑”而创建空工程；采用 Markdown 结构/链接/内容审查和 Git diff 校验。

### 5.4 CI 策略

- PR 快速门禁：lint、typecheck、unit、数据集成、关键 Electron E2E。
- main/nightly：三平台 E2E、打包、安装包冒烟、依赖审计。
- release：签名、notarization、校验值、升级/回滚和人工发布审批。
- 使用并发取消避免陈旧任务，缓存不能包含 Key、论文或签名密钥。

## 6. 开发规则

- 每个阶段只实现获批范围；新需求先更新文档和阶段边界。
- 数据迁移与代码同阶段提交，并包含升级测试。
- IPC、Provider、导出模板等公共契约版本化。
- 不在源代码、示例、测试 snapshot 或 `.env` 中放真实密钥。
- 不提交 `.env`；只允许不含秘密的 `.env.example`，且是否需要由 Phase 1 决定。
- 不使用破坏性 Git 命令，不覆盖用户未关联的文件或修改。
- 架构冲突、安全风险或产品决策不明确时暂停并请求确认。

## 7. Phase 1 前置状态

已确认：

1. 继续使用现有 Python 仓库，并保护其中已有文件。
2. 使用 pnpm、`better-sqlite3` 和 `electron-builder` 优先组合。
3. Linux 无安全存储后端时 Key 仅保存在会话内存。
4. Obsidian 重复导出始终创建新文件。
5. Git MVP 仅支持已有仓库、远程和上游；hooks 逐次提示后执行。

仍需在 Phase 1 开始前完成：

1. 安装并固定 Node.js Active LTS 和 pnpm。
2. 用户明确下达 Phase 1 开始指令并允许安装开发依赖。

正式发布前还需确认 Windows/macOS 签名资源；不阻塞本地开发，但阻塞 Phase 9 正式发布。
