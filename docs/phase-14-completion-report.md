# PaperMind Phase 14 Completion Report

阶段：Phase 14 - Research Chat & Context Builder

完成状态：已完成；自动化验收通过，未调用真实收费 API。

## 本阶段实现

- Workspace 级、可选绑定 Research Question 的持久化 Research Chat。
- Main-only bounded ContextBuilder：固定 source scope、12 个来源、12,000 字符、去重、截断、检索版本和十分钟 owner-bound preview。
- 精确保存每次实际发送的 bounded source snapshot、预算和 provenance；retry 复用原 context，不重新检索。
- OpenAI/Mock Provider streaming、cancel、retry、timeout、错误映射和启动中断恢复。
- citation alias 只绑定本次实际 context source；模型生成的未知 alias 显示为 unsupported，不能导航。
- typed preload、固定 IPC channel、严格 Zod 输入/输出校验和受控 Phase 13 citation navigation。
- 高密度 Chat 页面、source scope/review、Workspace/Question 上下文、宽屏 source rail、窄屏 drawer、provider unavailable 和 streaming/cancel 状态。
- deterministic Mock 流程、持久化/迁移/安全/UI/E2E 测试和四张截图矩阵。

## 新增文件

- `src/shared/contracts/research-chat.ts`
- `src/main/research-chat/citation-binding.ts`
- `src/main/research-chat/context-builder.ts`
- `src/main/research-chat/research-chat-data-gateway.ts`
- `src/main/research-chat/research-chat-prompts.ts`
- `src/main/research-chat/research-chat-service.ts`
- `src/main/ipc/research-chat-ipc.ts`
- `src/main/ipc/research-chat-schemas.ts`
- `src/main/database/research-chat-repository.ts`
- `src/main/database/migrations/0010-research-chat.ts`
- `src/renderer/components/workspace/research-chat/use-research-chat-controller.ts`
- `src/renderer/components/workspace/research-chat/WorkspaceResearchChatPage.tsx`
- `tests/unit/research-chat-context.test.ts`
- `tests/unit/research-chat-schemas.test.ts`
- `tests/unit/workspace-research-chat-page.test.tsx`
- `tests/integration/research-chat.test.ts`
- `docs/research-chat-context-builder.md`
- `docs/phase-14-screenshot-matrix.md`
- `docs/screenshots/phase-14/*.png`

## 修改文件

- Main composition/AI reuse: `src/main/index.ts`, `src/main/ai/ai-assistant-service.ts`, `src/main/ai/mock-provider.ts`
- Database worker: `src/main/database/{database-worker-client,library-database,worker-protocol,worker}.ts`, migration registry
- IPC/preload/contracts: Knowledge provenance schema export, `src/preload/index.ts`, app API contract
- Workspace UI: tab types/navigation, window minimum width, direct Research Chat CSS
- Tests/docs: IPC contract, migration regression, Electron E2E, database schema

## 数据库变更

- 新增 forward-only migration `0010-research-chat.ts`。
- 新增 `research_chat_conversations`、`research_chat_messages`、`research_chat_contexts`、`research_chat_context_sources`。
- 未修改 migrations 0001-0009；migration upgrade/reopen 测试通过。
- 未删除或迁移 legacy Paper/PDF、legacy AI、Zotero、Repository、Question、Link 或 Knowledge 数据。

## 执行命令

- `npm run format`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- Phase 14 定向 Vitest/Playwright、Git diff/status、旧 migration diff 和敏感信息扫描。

## 验证结果

- format：通过；全部匹配 Prettier。
- lint：通过；ESLint 0 warnings/errors。
- typecheck：通过；Main、Renderer、Tests 三套 TypeScript 配置通过。
- test：通过；52 files / 203 tests。
- build：通过；Vite 1849 modules；应用主 bundle 233.77 kB，PDF chunk 427.34 kB，无默认 chunk-size warning。
- E2E：通过；8/8 Electron Playwright tests，包含 Research Chat streaming/citation/1536/1280/1024 响应式矩阵。
- 手动验证：已逐张目视检查最终截图；1024 显示 `Sources 2` drawer 入口且默认收起，回答/citation/composer 同屏。真实 OpenAI/Zotero/Git 外部跳转未调用；自动测试使用本地 fixture 与 Mock Provider。

## 未完成事项

- 未做真实 OpenAI API 最小调用；本阶段遵守“不未经明确授权调用收费 API”。
- 未使用用户真实 Zotero Library 或真实 repository 做 citation 外部跳转；领域导航和 Workspace 校验由既有 Phase 13 服务与自动测试覆盖。

## 风险和技术债

- 对话和每次实际发送的 bounded source snapshot 是本地 SQLite 明文研究内容；API key 仍不在数据库中。
- 生产环境未配置 EmbeddingProvider 时继续使用 Phase 13 keyword retrieval。
- 真实模型可能输出 unsupported citation；UI 会明确标记且禁止导航，不自动修复为近似来源。

## 建议的下一阶段

- 停止在 Phase 14；等待用户独立验收和下一阶段明确指令，不进入 Phase 15。

## Git 状态

- 当前分支：`main`
- 最新提交：`2b593da phase13`
- 工作区是否干净：否；仅保留未提交的 Phase 14 源码、测试、文档和截图。
- 分支关系：`main...Python/main [ahead 1]`
