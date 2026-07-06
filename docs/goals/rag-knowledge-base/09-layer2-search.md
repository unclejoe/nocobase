# L2-5：Layer 2 检索（KnowledgeBaseFeature.search）

> 阶段：Layer 2 / 检索 | 工期：~0.5 天 | 分支：`feat/ai-rag-pgvector-search`（基于 L2-4）
>
> 依赖：L2-4（摄入链路就绪，库内有数据）

## 推荐执行版（中文，可直接复制）

```text
/goal 在 plugin-ai-rag-pgvector 中实现 PgvectorKnowledgeBaseFeature.search(options)：按 knowledgeBaseKeys 找到知识库与绑定向量库，调用 VectorStoreService.search(query, { topK, score }) 做相似度 + 阈值过滤，返回 DocumentSegmentedWithScore[]，并在 metadata 中填充 matchedQuestions（如有）。补齐 KnowledgeBaseManager.retrievePrompt 的端到端检索能力。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-ingestion 分支新建并切换到 feat/ai-rag-pgvector-search，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-4 已合并。

【实施范围】先精读 plugin-ai/src/server/ai-employees/ai-knowledge-base.ts 中 retrievePrompt 对 search 的调用契约（topK/score 来自员工 jsonb，类型可能 string/number 混用），L2-2 的 VectorStoreService.search 已实现的过滤逻辑。然后：
1. 实现 search(options)：
   a. 入参容错：topK = Number(options.topK ?? 3)，score = Number(options.score ?? 0.6)，knowledgeBaseKeys 为空时返回 []；
   b. 按 knowledgeBaseKeys 调 getKnowledgeBase 取知识库，聚合各自的 vectorDatabaseId；
   c. 对每个知识库取 VectorStoreService，并行/串行 search（默认串行，避免连接池压力）；
   d. 合并结果、按 score 排序、按 topK 截断；
   e. 填充 metadata.matchedQuestions（若 segments 表 metadata 中存在）。
2. 类型安全：返回值严格匹配 DocumentSegmentedWithScore，禁止 any。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-search，否则终止；
2. yarn test 新增单测：topK/score 字符串/数字兼容、空 keys 返回 []、score 阈值过滤、多知识库结果合并排序；
3. 端到端：先上传一份文档（L2-4 链路）入库，再用 search 查询相关关键词，确认返回带 score 的相关段落；
4. 触发 plugin-ai 的 knowledge-base-retrieve 工具或 retrievePrompt，确认返回非空字符串（系统提示词注入路径打通）；
5. yarn eslint --fix 通过。

约束：search 必须容错（topK/score 类型混用、空 keys、向量库不可达时不抛错给上层，返回 [] 或日志告警）；不使用 any；不写 fire-and-forget；不修改 plugin-ai 的 retrievePrompt 调用契约；score 语义明确（cosine similarity 还是 distance，与 L2-2 实现一致并加注释）。

边界：仅写入 plugin-ai-rag-pgvector/src/server/features/pgvector-knowledge-base-feature.ts 的 search 方法、可能的小工具函数、__tests__；禁止触碰 plugin-ai 源码（除非验证 retrievePrompt 调用）、core/、其他插件、pro-plugins、CI 配置；不动摄入链路。

迭代策略：先单知识库 search（含容错与单测），再多知识库合并排序，最后 matchedQuestions 填充；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-search；search 实现含完整容错；单测通过；端到端从文档上传 → search → retrievePrompt 注入路径打通（日志/返回值证据）；eslint 通过。

暂停条件：无法创建功能分支；基线 L2-4 未合并；需要修改 plugin-ai 的 retrievePrompt 调用契约；需要真实付费 Embedding；或 score 语义需要产品决策（如是否对结果做归一化）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement PgvectorKnowledgeBaseFeature.search(options) in plugin-ai-rag-pgvector: resolve knowledge bases and their bound vector DB by knowledgeBaseKeys, call VectorStoreService.search(query, { topK, score }) for similarity + threshold filtering, return DocumentSegmentedWithScore[], and populate metadata.matchedQuestions when present. Complete the end-to-end retrieval capability consumed by KnowledgeBaseManager.retrievePrompt.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-ingestion`: `git checkout -b feat/ai-rag-pgvector-search`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-4 has been merged first.

[Scope] First read plugin-ai/src/server/ai-employees/ai-knowledge-base.ts (the retrievePrompt → search contract; topK/score come from the employee jsonb and may be string/number mixed), and L2-2's VectorStoreService.search filtering. Then:
1. Implement search(options):
   a. Input tolerance: topK = Number(options.topK ?? 3), score = Number(options.score ?? 0.6); return [] when knowledgeBaseKeys is empty;
   b. Resolve knowledge bases by keys via getKnowledgeBase; aggregate their vectorDatabaseId;
   c. For each KB get a VectorStoreService and run search (default serial to avoid connection pressure);
   d. Merge results, sort by score, truncate by topK;
   e. Populate metadata.matchedQuestions if present in the segments metadata.
2. Type safety: the return MUST strictly match DocumentSegmentedWithScore; no `any`.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-search`.
2. `yarn test` with new unit tests: topK/score string/number tolerance, empty keys returns [], score-threshold filtering, multi-KB merge & sort.
3. End-to-end: upload a document (L2-4 pipeline) into the store, then call search with a relevant keyword; confirm scored relevant chunks are returned.
4. Trigger plugin-ai's knowledge-base-retrieve tool or retrievePrompt; confirm a non-empty string is returned (system-prompt injection path is wired).
5. `yarn eslint --fix` passes.

Constraints: search MUST be tolerant (mixed topK/score types, empty keys, unreachable vector DB → return [] or log a warning, never throw to the caller); no `any`; no fire-and-forget; do NOT modify plugin-ai's retrievePrompt contract; score semantics must be explicit (cosine similarity vs distance, consistent with L2-2 and commented).

Boundaries: write only the search method in plugin-ai-rag-pgvector/src/server/features/pgvector-knowledge-base-feature.ts, small helpers, and __tests__; do not touch plugin-ai source (except to verify the retrievePrompt call), core/, other plugins, pro-plugins, or CI config; do not modify the ingestion pipeline.

Iteration policy: single-KB search first (with tolerance + unit tests), then multi-KB merge & sort, then matchedQuestions population; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-search`; search is implemented with full tolerance; unit tests pass; the end-to-end path document upload → search → retrievePrompt injection is wired (log/return-value evidence); eslint passes.

Pause if: the feature branch cannot be created; L2-4 base is not merged; plugin-ai's retrievePrompt contract must be modified; a real paid Embedding is required; or a product decision on score semantics (e.g. normalization) is needed.
```
