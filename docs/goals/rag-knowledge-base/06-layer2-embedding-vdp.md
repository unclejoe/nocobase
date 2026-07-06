# L2-2：Layer 2 Embedding 工厂 + 向量库 Provider

> 阶段：Layer 2 / 向量库连接 | 工期：~1 天 | 分支：`feat/ai-rag-pgvector-embedding`（基于 L2-1）
>
> 依赖：L2-1（Feature 骨架已注册）

## 推荐执行版（中文，可直接复制）

```text
/goal 在 plugin-ai-rag-pgvector 中实现 EmbeddingsFactory（按 embeddingConfig 构造 LangChain Embeddings，OpenAI 兼容）和 PgvectorVectorDatabaseProvider（validateConnectParams/testConnection/beforeCreate/createVectorStore），并把 PgvectorVectorStoreProvider.createVectorStoreService 包装成 VectorStoreService（getVectorStore + search）。L2-1 中 throw not implemented 的相关方法替换为真实实现。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-skeleton 分支新建并切换到 feat/ai-rag-pgvector-embedding，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-1 已合并。

【实施范围】先精读 plugin-ai/src/server/features/vector-database-provider.ts 与 vector-store-provider.ts 接口契约；确认 @langchain/community 的 PGVectorStore 用法与版本。然后：
1. EmbeddingsFactory：输入 { provider, model, baseUrl, apiKeyEnv, dimensions }，返回 LangChain Embeddings（OpenAI 兼容；apiKey 必须从环境变量读取，禁止入库明文）。
2. PgvectorVectorDatabaseProvider：
   - validateConnectParams：校验 schema/table/dimension 必填且类型正确；
   - testConnection：执行 SELECT 1 + 检查 pgvector 扩展存在（SELECT extname FROM pg_extension WHERE extname='vector'），返回 { success, error? }；
   - beforeCreate：建 schema/table（IF NOT EXISTS），返回 { status, message? }；
   - createVectorStore：用 Embeddings + connectParams 构造 PGVectorStore 实例返回；
   - listProviders：返回 pgvector provider info。
3. PgvectorVectorStoreProvider.createVectorStoreService：包装成 VectorStoreService，getVectorStore 返回 PGVectorStore，search 调用 similaritySearchWithScore 并按 score 阈值过滤、转换为 DocumentSegmentedWithScore[]。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-embedding，否则终止；
2. yarn test 新增单测：validateConnectParams 校验逻辑、testConnection 成功/失败路径、score 阈值过滤；
3. 启动本地 Postgres + pgvector，手动调用 testConnection 返回 success；用测试文本走完 embed → createVectorStore → search 闭环（需要可用 Embedding 端点，缺失时用 mock 并明确标注）；
4. yarn eslint --fix 通过。

约束：API key 只能从环境变量读，禁止入库；不引入与 plugin-ai 冲突的 langchain 版本；不使用 any（用 LangChain 提供的类型）；不写 fire-and-forget；testConnection 不能有副作用（不建表）；beforeCreate 才允许建表。

边界：仅写入 plugin-ai-rag-pgvector/src/server/ 下 Embeddings 工厂与 Provider 相关文件、L2-1 骨架中需要替换为真实实现的方法，以及 __tests__；禁止触碰 plugin-ai 源码、KnowledgeBaseFeature（L2-3 处理）、core/、其他插件、pro-plugins、CI 配置。

迭代策略：先 EmbeddingsFactory（含单测，可用 mock），再 VectorDatabaseProvider（testConnection → beforeCreate → createVectorStore），最后 VectorStoreProvider 包装；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-embedding；EmbeddingsFactory 与三个 Provider 方法均有真实实现；单测通过；testConnection 手动验证 success；search 闭环（mock 或真实 Embedding）能返回带 score 的结果；eslint 通过。

暂停条件：无法创建功能分支；基线 L2-1 未合并；需要真实付费 Embedding API key；需要修改 plugin-ai 源码；或 pgvector 扩展无法在本地安装时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement EmbeddingsFactory (build LangChain Embeddings from embeddingConfig, OpenAI-compatible) and PgvectorVectorDatabaseProvider (validateConnectParams/testConnection/beforeCreate/createVectorStore) in plugin-ai-rag-pgvector, and wrap PgvectorVectorStoreProvider.createVectorStoreService into a VectorStoreService (getVectorStore + search). Replace the relevant "throw not implemented" stubs from L2-1 with real implementations.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-skeleton`: `git checkout -b feat/ai-rag-pgvector-embedding`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-1 has been merged first.

[Scope] First read plugin-ai/src/server/features/vector-database-provider.ts and vector-store-provider.ts; confirm @langchain/community's PGVectorStore usage and version. Then:
1. EmbeddingsFactory: input { provider, model, baseUrl, apiKeyEnv, dimensions }; return a LangChain Embeddings (OpenAI-compatible); apiKey MUST be read from env vars, never stored in plaintext.
2. PgvectorVectorDatabaseProvider:
   - validateConnectParams: ensure schema/table/dimension are present and correctly typed;
   - testConnection: `SELECT 1` + check pgvector extension exists (`SELECT extname FROM pg_extension WHERE extname='vector'`); return { success, error? };
   - beforeCreate: create schema/table (IF NOT EXISTS); return { status, message? };
   - createVectorStore: build a PGVectorStore from Embeddings + connectParams;
   - listProviders: return the pgvector provider info.
3. PgvectorVectorStoreProvider.createVectorStoreService: wrap as VectorStoreService; getVectorStore returns the PGVectorStore; search calls similaritySearchWithScore, filters by score threshold, and maps to DocumentSegmentedWithScore[].

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-embedding`.
2. `yarn test` with new unit tests: validateConnectParams logic, testConnection success/failure paths, score-threshold filtering.
3. Start local Postgres + pgvector; manually call testConnection and confirm success; run the full loop embed → createVectorStore → search with test text (use a mock Embeddings endpoint if real one is unavailable, clearly noted).
4. `yarn eslint --fix` passes.

Constraints: API key must come from env vars, never stored; no langchain version conflict with plugin-ai; no `any` (use LangChain types); no fire-and-forget; testConnection must have no side effects (no table creation); only beforeCreate may create tables.

Boundaries: write only Embeddings-factory and Provider files under plugin-ai-rag-pgvector/src/server/, the L2-1 stub methods being replaced with real implementations, and __tests__; do not touch plugin-ai source, KnowledgeBaseFeature (handled in L2-3), core/, other plugins, pro-plugins, or CI config.

Iteration policy: EmbeddingsFactory first (with unit tests, mockable), then VectorDatabaseProvider (testConnection → beforeCreate → createVectorStore), then VectorStoreProvider wrapping; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-embedding`; EmbeddingsFactory and the three Provider methods have real implementations; unit tests pass; testConnection is manually verified as success; the search loop (mock or real Embeddings) returns scored results; eslint passes.

Pause if: the feature branch cannot be created; L2-1 base is not merged; a real paid Embedding API key is required; plugin-ai source must be modified; or pgvector cannot be installed locally.
```
