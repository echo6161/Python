# PaperMind 数据模型

- 文档状态：Phase 0 基线草案
- 存储引擎：SQLite
- 数据原则：结构化事实进数据库，PDF 进内容寻址文件库，密钥不进数据库

## 1. 设计原则

1. 所有实体使用应用生成的 UUID，避免暴露 SQLite rowid 并便于未来迁移。
2. 时间统一保存为 UTC ISO 8601 文本；UI 按本地时区展示。
3. 数据库启用外键、事务和 WAL，所有 schema 变化通过编号迁移完成。
4. PDF 文件记录不可变；文件内容变化创建新 `paper_file`，不原地替换哈希。
5. AI 生成内容、用户编辑内容和来源引用分开记录，可追溯且可删除。
6. API Key、GitHub Token、密码、Cookie 和私钥不得出现在任何表中。
7. 大型可重建产物可放 `derived/`，但其状态和版本必须在数据库可判断。

## 2. 实体关系概览

```text
papers 1──* paper_files
papers *──* authors       via paper_authors
papers *──* tags          via paper_tags
papers *──* collections   via collection_papers
papers 1──* document_pages 1──* text_chunks 1──* chunk_embeddings
papers 1──1 reading_states
papers 1──* annotations
papers 1──* notes
papers 1──* conversations 1──* messages 1──* message_citations
text_chunks 1──* message_citations
papers 1──* export_records
export_records *──* git_sync_runs via git_sync_items
papers 1──* jobs
```

## 3. 核心表

以下字段是逻辑设计。最终 SQL 类型、索引名和约束在实现迁移时固定，并由数据库测试验证。

### 3.1 `schema_migrations`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `version` | INTEGER | PK，单调递增 |
| `name` | TEXT | NOT NULL |
| `applied_at` | TEXT | NOT NULL，UTC |
| `checksum` | TEXT | NOT NULL，迁移内容哈希 |

应用只能按顺序前向迁移。发现未知的新版本时拒绝用旧应用打开写入。

### 3.2 `papers`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `id` | TEXT | PK，UUID |
| `title` | TEXT | NOT NULL，允许导入时临时使用文件名 |
| `abstract` | TEXT | NULL |
| `year` | INTEGER | NULL，合理范围校验 |
| `doi` | TEXT | NULL，规范化后可建立部分唯一索引 |
| `venue` | TEXT | NULL |
| `language` | TEXT | NULL，BCP 47 值 |
| `status` | TEXT | NOT NULL：importing/ready/failed/trashed |
| `active_file_id` | TEXT | NULL，FK → paper_files，提交后设置 |
| `metadata_source` | TEXT | NOT NULL：manual/pdf/doi/mixed |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `trashed_at` | TEXT | NULL |
| `row_version` | INTEGER | NOT NULL，乐观并发 |

索引：规范化标题、年份、DOI、状态、更新时间。`active_file_id` 必须属于同一 paper，由服务事务保证并用触发器/测试补强。

### 3.3 `paper_files`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NOT NULL，FK → papers |
| `sha256` | TEXT | NOT NULL，64 位十六进制 |
| `relative_path` | TEXT | NOT NULL，仅论文库相对路径 |
| `original_filename` | TEXT | NOT NULL，展示用，不参与路径解析 |
| `byte_size` | INTEGER | NOT NULL，非负 |
| `mime_type` | TEXT | NOT NULL，MVP 仅 application/pdf |
| `pdf_version` | TEXT | NULL |
| `page_count` | INTEGER | NULL，提取后填写 |
| `is_encrypted` | INTEGER | NOT NULL，0/1 |
| `imported_at` | TEXT | NOT NULL |
| `verified_at` | TEXT | NULL |

唯一约束：`sha256`。重复导入同一内容时返回已有 paper 并提示去重，不创建第二个逻辑 paper，也不复制物理 PDF。未来如需让多个逻辑条目共享一个文件，应先拆分独立的 content object 表，不能绕过当前外键关系。

### 3.4 `authors` 与 `paper_authors`

`authors`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `display_name` | TEXT | NOT NULL |
| `normalized_name` | TEXT | NOT NULL，检索用 |
| `orcid` | TEXT | NULL，规范化后唯一 |

`paper_authors`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `paper_id` | TEXT | 复合 PK，FK → papers，级联删除 |
| `author_id` | TEXT | 复合 PK，FK → authors |
| `position` | INTEGER | NOT NULL，作者顺序 |
| `role` | TEXT | NULL |

唯一约束：同一 paper 的 `position` 唯一。

### 3.5 `tags`、`paper_tags`、`collections`、`collection_papers`

- `tags(id, name, normalized_name, color, created_at)`；`normalized_name` 唯一。
- `paper_tags(paper_id, tag_id, created_at)`；复合主键。
- `collections(id, name, description, sort_order, created_at, updated_at)`。
- `collection_papers(collection_id, paper_id, added_at)`；复合主键。

MVP 集合仅单层，不设计父子关系或递归查询。

## 4. 文本提取和检索

### 4.1 `document_pages`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_file_id` | TEXT | NOT NULL，FK → paper_files |
| `page_number` | INTEGER | NOT NULL，1-based |
| `width_points` | REAL | NOT NULL |
| `height_points` | REAL | NOT NULL |
| `rotation` | INTEGER | NOT NULL，0/90/180/270 |
| `normalized_text` | TEXT | NOT NULL，可为空字符串 |
| `text_hash` | TEXT | NOT NULL |
| `extractor_version` | TEXT | NOT NULL |
| `extracted_at` | TEXT | NOT NULL |

唯一约束：`(paper_file_id, page_number, extractor_version)`。页内字符偏移均针对该版本的 `normalized_text`。

### 4.2 `text_chunks`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NOT NULL，FK → papers |
| `paper_file_id` | TEXT | NOT NULL，FK → paper_files |
| `ordinal` | INTEGER | NOT NULL，同版本内顺序 |
| `text` | TEXT | NOT NULL |
| `token_count` | INTEGER | NOT NULL |
| `page_start` | INTEGER | NOT NULL |
| `page_end` | INTEGER | NOT NULL |
| `source_spans_json` | TEXT | NOT NULL，见 4.4 |
| `content_hash` | TEXT | NOT NULL |
| `chunker_version` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |

唯一约束：`(paper_file_id, chunker_version, ordinal)`；索引：`paper_id`、`paper_file_id`、页码范围和内容哈希。

### 4.3 FTS5 虚拟表

`text_chunks_fts(text, title, authors, content='text_chunks', content_rowid=...)` 用于正文搜索。因为领域 ID 是 UUID，实现时需要稳定的内部整数映射或独立 FTS row mapping 表，不让 FTS rowid 成为公共 ID。

- 迁移和事务负责保持 FTS 与 chunk 一致。
- 搜索输入不能直接拼接为 SQL；操作符支持范围由 Search service 控制。
- 标题和作者权重高于正文，最终排序结合 BM25 和最近访问等本地信号。

### 4.4 Source span JSON

每个 chunk 可跨页，`source_spans_json` 为有上限的结构化数组：

```json
[
  {
    "pageNumber": 12,
    "start": 418,
    "end": 963,
    "exact": "normalized quoted text",
    "prefix": "up to 32 chars before",
    "suffix": "up to 32 chars after"
  }
]
```

`start/end` 指向对应 `document_pages.normalized_text`，`exact` 用于校验和版本变化时重定位。写入前用 schema 校验，不允许任意深度 JSON。

### 4.5 `embedding_models`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK，应用内部配置 ID |
| `provider_id` | TEXT | NOT NULL，不含凭据 |
| `model_name` | TEXT | NOT NULL |
| `dimensions` | INTEGER | NOT NULL |
| `distance_metric` | TEXT | NOT NULL，MVP 为 cosine |
| `created_at` | TEXT | NOT NULL |

唯一约束：`(provider_id, model_name, dimensions)`。

### 4.6 `chunk_embeddings`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chunk_id` | TEXT | 复合 PK，FK → text_chunks |
| `embedding_model_id` | TEXT | 复合 PK，FK → embedding_models |
| `vector` | BLOB | NOT NULL，little-endian Float32 |
| `dimensions` | INTEGER | NOT NULL，冗余校验 |
| `content_hash` | TEXT | NOT NULL，防止陈旧向量 |
| `created_at` | TEXT | NOT NULL |

读取时验证 BLOB 长度等于 `dimensions * 4`，并确认 content hash 与 chunk 一致。MVP 在数据库 Worker 中分批读取当前 paper 向量，执行精确余弦 Top-K；不把向量发送到 Renderer。

## 5. 阅读和批注

### 5.1 `reading_states`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `paper_id` | TEXT | PK，FK → papers |
| `page_number` | INTEGER | NOT NULL，1-based |
| `scale` | REAL | NOT NULL，限制合理范围 |
| `rotation` | INTEGER | NOT NULL |
| `layout_mode` | TEXT | NOT NULL：continuous/single |
| `scroll_offset` | REAL | NULL，恢复辅助 |
| `updated_at` | TEXT | NOT NULL |

### 5.2 `annotations`

| 字段 | 类型 | 约束/说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NOT NULL，FK → papers |
| `paper_file_id` | TEXT | NOT NULL，创建时文件版本 |
| `kind` | TEXT | NOT NULL：highlight/note |
| `color` | TEXT | NOT NULL，受控色板 token |
| `body_markdown` | TEXT | NULL，大小限制 |
| `exact_text` | TEXT | NOT NULL |
| `prefix_text` | TEXT | NULL |
| `suffix_text` | TEXT | NULL |
| `page_start` | INTEGER | NOT NULL |
| `page_end` | INTEGER | NOT NULL |
| `text_spans_json` | TEXT | NOT NULL |
| `rects_json` | TEXT | NOT NULL |
| `anchor_status` | TEXT | NOT NULL：valid/reanchored/orphaned |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | NULL，软删除 |
| `row_version` | INTEGER | NOT NULL |

`text_spans_json` 使用 page/start/end/quote 结构。`rects_json` 示例：

```json
[
  {
    "pageNumber": 12,
    "rotation": 0,
    "rects": [{ "x": 0.114, "y": 0.321, "width": 0.552, "height": 0.026 }]
  }
]
```

坐标相对于 PDF CropBox 归一化到 `[0,1]`。每个批注的页数、矩形数量和文本大小均有限制。跨页选择使用多个 page item，不创建隐式连续大范围。

## 6. 笔记和 AI 对话

### 6.1 `notes`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NOT NULL，FK → papers |
| `kind` | TEXT | NOT NULL：freeform/summary/structured/translation/explanation |
| `title` | TEXT | NOT NULL |
| `body_markdown` | TEXT | NOT NULL |
| `origin` | TEXT | NOT NULL：user/ai/ai_edited |
| `generator_metadata_json` | TEXT | NULL，Provider、模型、prompt template version，不含 Key |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `row_version` | INTEGER | NOT NULL |

AI 草稿一旦被用户编辑，将 `origin` 变为 `ai_edited`，但保留生成元数据以便追溯。

### 6.2 `conversations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NOT NULL，MVP 一次只绑定一篇论文 |
| `title` | TEXT | NOT NULL |
| `provider_id` | TEXT | NOT NULL |
| `model_name` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | NULL |

### 6.3 `messages`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `conversation_id` | TEXT | NOT NULL，FK → conversations |
| `role` | TEXT | NOT NULL：user/assistant/system_record |
| `content_markdown` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL：streaming/complete/failed/cancelled |
| `provider_request_id` | TEXT | NULL，诊断用，非凭据 |
| `input_tokens` | INTEGER | NULL |
| `output_tokens` | INTEGER | NULL |
| `created_at` | TEXT | NOT NULL |

不保存包含 API Key 的请求头或 SDK 原始响应。是否保存会话由本地设置和本次会话选项控制。

### 6.4 `message_citations`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `message_id` | TEXT | NOT NULL，FK → messages |
| `chunk_id` | TEXT | NOT NULL，FK → text_chunks |
| `label` | TEXT | NOT NULL，例如 P12-C0042 |
| `page_number` | INTEGER | NOT NULL |
| `source_spans_json` | TEXT | NOT NULL，生成时快照 |
| `ordinal` | INTEGER | NOT NULL，回答中顺序 |

同时保存 `chunk_id` 和 span 快照，确保 chunk 重建后仍能说明历史回答引用了什么位置。

## 7. 作业、导出和 Git

### 7.1 `jobs`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `paper_id` | TEXT | NULL，FK → papers |
| `type` | TEXT | NOT NULL：import/extract/chunk/embed/reindex |
| `status` | TEXT | NOT NULL：queued/running/succeeded/failed/cancelled |
| `progress_current` | INTEGER | NULL |
| `progress_total` | INTEGER | NULL |
| `attempt_count` | INTEGER | NOT NULL |
| `input_version` | TEXT | NULL，幂等键组成部分 |
| `error_code` | TEXT | NULL，稳定错误分类 |
| `error_detail` | TEXT | NULL，脱敏且限长 |
| `created_at` | TEXT | NOT NULL |
| `started_at` | TEXT | NULL |
| `finished_at` | TEXT | NULL |

禁止把完整 PDF 内容、prompt、Key 或 Provider 原始错误写入 `error_detail`。

### 7.2 `export_targets`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `kind` | TEXT | NOT NULL，MVP 为 obsidian |
| `display_name` | TEXT | NOT NULL |
| `canonical_root` | TEXT | NOT NULL，本机路径，不属于秘密但不导出 |
| `subdirectory` | TEXT | NOT NULL，默认 PaperMind |
| `created_at` | TEXT | NOT NULL |
| `last_validated_at` | TEXT | NULL |

### 7.3 `export_records`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | PK |
| `target_id` | TEXT | NOT NULL，FK → export_targets |
| `paper_id` | TEXT | NOT NULL，FK → papers |
| `relative_path` | TEXT | NOT NULL，目标根内路径 |
| `content_hash` | TEXT | NOT NULL |
| `template_version` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL：created/failed/missing |
| `created_at` | TEXT | NOT NULL |
| `error_code` | TEXT | NULL |

MVP 每次成功导出产生新记录和新文件。唯一约束 `(target_id, relative_path)` 防止应用把两个导出记录指向同一文件。

### 7.4 `git_sync_runs` 与 `git_sync_items`

`git_sync_runs` 保存：`id`、授权 repo root、branch、remote name、head_before、commit_after、status、脱敏 error code、开始/结束时间。

`git_sync_items` 保存：`git_sync_run_id`、`export_record_id`、repo 内相对路径和状态。该关系确保 Git Service 只能暂存有效导出记录对应的文件。

不保存远程凭据、credential helper 输出、SSH key 路径内容或环境 Token。

## 8. 非秘密设置与密钥分离

### 8.1 `settings`

`settings(key, value_json, updated_at)` 只允许注册表中的键，例如 UI 语言、主题、默认翻译语言、默认 Provider ID、默认模型、会话保存偏好和库行为。每个键都有独立 schema 和默认值。

以下内容明确禁止进入 `settings`：

- API Key、OAuth token、密码和 Cookie。
- GitHub Token、Git credential、SSH 私钥。
- `safeStorage` 解密后的任何值。

### 8.2 Secret Store 文件

加密密文位于 `app.getPath('userData')/secrets.v1.json`，仅包含 secret ID、Provider ID、ciphertext、创建/更新时间和加密后端标识。文件权限尽量限制为当前用户。该文件不在论文库内，也不通过导出或 Git 同步。

## 9. 删除、保留和恢复

- 移除论文先设置 `trashed_at` 并移动独占文件到 `trash/`；存在共享内容哈希引用时不移动物理文件。
- 永久删除按外键顺序在事务中删除结构化数据，再异步清理无引用文件。
- 用户可单独删除 AI 对话、生成笔记、向量和 Provider Key，不影响 PDF 与人工批注。
- 数据库备份不包含 Key，但包含本地论文文本和笔记，UI 和文档应提醒用户妥善保护备份。
- 恢复后进行 `foreign_key_check`、文件存在性和 SHA-256 抽样/按需校验。

## 10. 迁移与兼容

1. 启动时以文件锁防止两个 PaperMind 实例同时写同一 library。
2. 读取 schema 版本并拒绝降级写入。
3. 迁移前用 SQLite backup API 创建同卷备份并校验完成。
4. 在单事务内应用可事务迁移；涉及文件布局时使用可恢复分步作业。
5. 迁移成功后更新 manifest 格式版本；失败时保留备份并进入只读恢复界面。

切片器、提取器、导出模板和 embedding model 分别版本化，不能用数据库 schema 版本代替内容版本。

## 11. 关键不变量

- 每个 ready paper 必须有属于自己的 active paper file。
- 受管 `relative_path` 解析后必须位于当前 library root 内。
- annotation 和 citation 的 paper file、页码必须与关联 paper 一致。
- embedding 的内容哈希和维度必须与 chunk/model 匹配。
- export record 只能指向授权 target 下由 PaperMind 成功创建的文件。
- Git sync item 只能引用有效 export record，不能接受任意用户路径。
- 任何表、日志、备份或导出内容都不能包含 API Key 或 GitHub Token。

这些不变量由数据库约束、领域服务校验和集成测试共同保证，不能只依赖 UI。
