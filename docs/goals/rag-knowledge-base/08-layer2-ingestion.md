# L2-4：Layer 2 文档摄入 Pipeline（解析 → 切块 → 向量化 → 入库）

> 阶段：Layer 2 / 摄入 | 工期：~1.5 天 | 分支：`feat/ai-rag-pgvector-ingestion`（基于 L2-3）
>
> 依赖：L2-3（knowledgeBases / knowledgeBaseDocuments / knowledgeBaseSegments 已存在）

## 推荐执行版（中文，可直接复制）

```text
/goal 在 plugin-ai-rag-pgvector 中实现 IngestionService.ingest(documentId)：复用 plugin-ai 的 DocumentLoader.load 解析文档 → RecursiveCharacterTextSplitter 切块 → Embeddings 向量化 → PGVectorStore.addDocuments 入库 → 落库 knowledgeBaseSegments 并更新 knowledgeBaseDocuments.status；提供 kbDocuments:upload/list/destroy 资源 API（destroy 同步删向量）；摄入异步执行。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-kb-crud 分支新建并切换到 feat/ai-rag-pgvector-ingestion，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-3 已合并。

【实施范围】先精读 plugin-ai/src/server/document-loader/loader.ts 与 constants.ts（支持的扩展名 PDF/PPT/DOCX/XLSX/TXT/MD/JSON/CSV）、L2-2 的 EmbeddingsFactory 与 VectorStoreProvider、L2-3 的 collection。然后：
1. IngestionService.ingest(documentId) 流程：
   a. 从 knowledgeBaseDocuments 取文档 + 关联 knowledgeBases 拿到 chunkConfig/embeddingConfig/vectorDatabaseId；
   b. 调用 plugin-ai DocumentLoader.load(file) 取得 LangChain Document[]（若 plugin-ai 未暴露 DocumentLoader 实例的访问入口，先用 app.plugin('@nocobase/plugin-ai') 取，必要时在本阶段在 plugin-ai 增加只读 getter —— 此项触发"暂停条件"由人工裁决，不得擅自改 plugin-ai）；
   c. RecursiveCharacterTextSplitter（chunkSize/chunkOverlap 来自 chunkConfig）切块；
   d. 取向量库 → createVectorStore → addDocuments；
   e. 落库 knowledgeBaseSegments（含 content、vectorId、metadata），更新 knowledgeBaseDocuments.status = indexed / failed + error。
2. kbDocuments 资源 API：upload（接收文件、创建 document 记录、入队摄入任务）、list、destroy（按 vectorId 删向量 + 删 segments + 删 document）。
3. 异步执行：upload 仅入队（status=pending）立即返回；摄入在 worker/异步任务中执行；status 状态机 pending/parsing/indexed/failed 驱动 UI。
4. 失败可重试：failed 状态可再次触发 ingest。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-ingestion，否则终止；
2. yarn test 新增单测：切块参数生效、status 状态机迁移、destroy 级联删除（mock 向量库）；
3. 启动本地环境，上传一份 PDF（或最小 TXT），观察 status 从 pending → indexed；查询 knowledgeBaseSegments 有记录；向量库表中有对应数据（mock 或真实 Embedding，明确标注）；
4. 删除该文档，确认 segments 与向量均被删除；
5. yarn eslint --fix 通过。

约束：摄入必须异步（不阻塞 upload 请求）；不使用 any；不写 fire-and-forget（异步任务用项目已有 worker/queue 模式，无则用 setImmediate/process.nextTick 等显式调度并加注释，禁用 void 异步调用）；不在事务内调外部 Embedding API；destroy 必须级联删向量；DocumentLoader 访问入口如缺失，触发暂停条件而非擅自改 plugin-ai。

边界：仅写入 plugin-ai-rag-pgvector/src/server/ 下 ingestion-service.ts、resources/kb-documents.ts、必要时的队列注册处、__tests__；禁止触碰 plugin-ai 源码（除非经过暂停条件人工批准）、core/ai、其他插件、pro-plugins、CI 配置；不动 search（L2-5）。

迭代策略：先切块 + 入库（同步版，单测 mock 向量库），再异步化（status 状态机），再 destroy 级联，再 upload API；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-ingestion；IngestionService 与 kbDocuments API 实现完整；上传 → indexed → 删除 全链路在本地走通（截图/日志/DB 查询证据）；单测通过；eslint 通过。

暂停条件：无法创建功能分支；基线 L2-3 未合并；plugin-ai 未暴露 DocumentLoader 访问入口需要改 plugin-ai；需要真实付费 Embedding API；需要引入新队列依赖；或需要破坏性 schema 变更时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement IngestionService.ingest(documentId) in plugin-ai-rag-pgvector: reuse plugin-ai's DocumentLoader.load to parse → RecursiveCharacterTextSplitter to chunk → Embeddings to vectorize → PGVectorStore.addDocuments to index → persist knowledgeBaseSegments and update knowledgeBaseDocuments.status; provide kbDocuments:upload/list/destroy resource API (destroy also deletes vectors); run ingestion asynchronously.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-kb-crud`: `git checkout -b feat/ai-rag-pgvector-ingestion`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-3 has been merged first.

[Scope] First read plugin-ai/src/server/document-loader/loader.ts and constants.ts (supported exts PDF/PPT/DOCX/XLSX/TXT/MD/JSON/CSV), L2-2's EmbeddingsFactory & VectorStoreProvider, L2-3's collections. Then:
1. IngestionService.ingest(documentId):
   a. Load knowledgeBaseDocuments + associated knowledgeBases for chunkConfig/embeddingConfig/vectorDatabaseId;
   b. Call plugin-ai DocumentLoader.load(file) for LangChain Document[] (if the loader instance isn't exposed, get it via `app.plugin('@nocobase/plugin-ai')`; if a read-only getter must be added to plugin-ai, that triggers the Pause condition for human sign-off — do NOT modify plugin-ai unilaterally);
   c. RecursiveCharacterTextSplitter (chunkSize/chunkOverlap from chunkConfig);
   d. Get vector store → createVectorStore → addDocuments;
   e. Persist knowledgeBaseSegments (content, vectorId, metadata); set knowledgeBaseDocuments.status = indexed / failed + error.
2. kbDocuments resource API: upload (receive file, create document record, enqueue ingestion), list, destroy (delete vectors by vectorId + segments + document).
3. Async execution: upload only enqueues (status=pending) and returns immediately; ingestion runs in a worker/async task; status state machine pending/parsing/indexed/failed drives the UI.
4. Retryable: failed status can re-trigger ingest.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-ingestion`.
2. `yarn test` with new unit tests: chunking params take effect, status state-machine transitions, destroy cascade (mock the vector store).
3. Start local env; upload a PDF (or minimal TXT); observe status pending → indexed; query knowledgeBaseSegments for rows; confirm vector-store table has corresponding data (mock or real Embeddings, clearly noted).
4. Delete the document; confirm segments and vectors are gone.
5. `yarn eslint --fix` passes.

Constraints: ingestion MUST be async (not blocking upload); no `any`; no fire-and-forget (use the project's existing worker/queue pattern; if none, use explicit scheduling like setImmediate/process.nextTick with a comment — `void asyncCall()` is forbidden); do NOT call external Embedding APIs inside a DB transaction; destroy MUST cascade-delete vectors; if DocumentLoader access is missing, trigger the Pause condition rather than modifying plugin-ai unilaterally.

Boundaries: write only plugin-ai-rag-pgvector/src/server/ (ingestion-service.ts, resources/kb-documents.ts, queue registration if needed, __tests__); do not touch plugin-ai source (unless approved via Pause condition), core/ai, other plugins, pro-plugins, or CI config; do not modify search (L2-5).

Iteration policy: chunking + indexing first (synchronous version, mock vector store in unit tests), then async (status state machine), then destroy cascade, then the upload API; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-ingestion`; IngestionService and kbDocuments API are complete; the full loop upload → indexed → delete works locally (screenshot/log/DB-query evidence); unit tests pass; eslint passes.

Pause if: the feature branch cannot be created; L2-3 base is not merged; plugin-ai does not expose DocumentLoader access and must be modified; a real paid Embedding API is required; a new queue dependency must be introduced; or a destructive schema change is required.
```
