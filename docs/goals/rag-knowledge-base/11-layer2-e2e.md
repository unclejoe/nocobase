# L2-7：Layer 2 端到端集成与测试

> 阶段：Layer 2 / 收尾 | 工期：~1 天 | 分支：`feat/ai-rag-pgvector-e2e`（基于 L2-6）
>
> 依赖：L2-6（UI 与全链路就绪）；建议 Layer 1 已合并以验证两层共存

## 推荐执行版（中文，可直接复制）

```text
/goal 对 plugin-ai-rag-pgvector 做端到端集成验证与补测：上传文档 → AI 员工开启知识库 → 提问命中已上传内容 → knowledge-base-retrieve 工具返回相关内容；补齐单测覆盖 EmbeddingsFactory/切块/score 阈值；输出部署与配置文档；如 Layer 1 已合并，额外验证两层同时开启互不干扰。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-ui 分支新建并切换到 feat/ai-rag-pgvector-e2e，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-6 已合并。

【实施范围】
1. 端到端用例（手动 + 自动化可行的部分）：
   a. 准备一份测试文档（如 NocoBase 公开文档片段或合成 PDF/MD）；
   b. UI 创建向量库 → testConnection → 创建知识库 → 上传文档 → 等 indexed；
   c. 配置一名 AI 员工开启知识库（绑定该知识库、topK/score）；
   d. 通过对话接口提问文档相关内容，确认回复引用了文档要点（截图/日志）；
   e. 调用 knowledge-base-retrieve 工具，确认返回相关段落；
   f. 删除文档后再次提问，确认不再命中。
2. 补测：覆盖 EmbeddingsFactory（mock Embedding）、切块参数、score 阈值过滤、destroy 级联（L2-4 已有的基础上查漏补缺）。
3. 文档：在 plugin-ai-rag-pgvector/README.md 补完整部署（pgvector 安装 + CREATE EXTENSION）、配置（Embedding baseUrl/apiKey env）、API 一览、故障排查（testConnection 失败、status=failed 等）。
4. 两层共存验证（条件性）：若 Layer 1 已合并到主开发分支，验证同一 AI 员工同时开启 markdownKnowledge 与向量知识库时 system prompt 同时含 <markdownKnowledge> 与 <knowledgeBase> 块且互不干扰。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-e2e，否则终止；
2. yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector（顺序执行，不并行）全部通过；
3. yarn test packages/plugins/@nocobase/plugin-ai（确认未回归）；
4. yarn eslint --fix 通过；
5. 端到端步骤 a–f 全部有截图/日志/返回值证据；
6. 两层共存验证（若适用）有 system prompt 拼接证据。

约束：本阶段不新增功能，只补测、补文档、修小 bug；任何超出"小修"范围的改动必须触发暂停条件；不使用 any；不写 fire-and-forget；不引入新依赖；测试不依赖外部真实付费 API（用 mock 或可配置 stub）。

边界：仅写入 plugin-ai-rag-pgvector 的 __tests__/、README.md、以及小修范围内的源码（如纯 bug fix）；禁止触碰 plugin-ai 源码（除非发现 L1 集成问题触发暂停条件）、core/、其他插件、pro-plugins、CI 配置。

迭代策略：先跑端到端用例定位问题，再补测覆盖，再修小 bug，最后补文档；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-e2e；端到端步骤 a–f 全部通过并有证据；单测全部通过且覆盖率较前提升；README 完整；eslint 通过；如有 Layer 1 共存场景已验证。

暂停条件：无法创建功能分支；基线 L2-6 未合并；端到端发现需要修改 plugin-ai 源码的集成问题；需要真实付费 Embedding API；发现需要破坏性 schema 变更；或需要产品决策时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Run end-to-end integration validation and backfill tests for plugin-ai-rag-pgvector: upload a document → enable KB for an AI employee → ask a question that hits the uploaded content → confirm the knowledge-base-retrieve tool returns relevant chunks; backfill unit tests for EmbeddingsFactory/chunking/score threshold; produce deployment & configuration docs; if Layer 1 is already merged, additionally verify the two layers coexist without interference.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-ui`: `git checkout -b feat/ai-rag-pgvector-e2e`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-6 has been merged first.

[Scope]
1. End-to-end cases (manual + automated where feasible):
   a. Prepare a test document (e.g. a NocoBase public-doc snippet or a synthetic PDF/MD);
   b. UI: create vector DB → testConnection → create KB → upload document → wait for indexed;
   c. Configure an AI employee with KB enabled (bind the KB, set topK/score);
   d. Ask a document-related question via the conversation API; confirm the reply references document points (screenshot/log);
   e. Call the knowledge-base-retrieve tool; confirm relevant chunks are returned;
   f. Delete the document and re-ask; confirm no hits.
2. Backfill tests: EmbeddingsFactory (mock Embeddings), chunking params, score-threshold filtering, destroy cascade (close gaps on top of L2-4).
3. Docs: complete plugin-ai-rag-pgvector/README.md with deployment (pgvector install + CREATE EXTENSION), configuration (Embedding baseUrl/apiKey env), API overview, troubleshooting (testConnection failure, status=failed, etc.).
4. Two-layer coexistence (conditional): if Layer 1 is already merged into the dev branch, verify that when the same AI employee has both markdownKnowledge and vector KB enabled, the system prompt contains both <markdownKnowledge> and <knowledgeBase> blocks without interference.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-e2e`.
2. `yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector` (sequentially, not in parallel) all pass.
3. `yarn test packages/plugins/@nocobase/plugin-ai` (confirm no regression).
4. `yarn eslint --fix` passes.
5. End-to-end steps a–f all have screenshot/log/return-value evidence.
6. Two-layer coexistence (if applicable) has system-prompt assembly evidence.

Constraints: this stage adds NO new features — only tests, docs, and small bug fixes; any change beyond a "small fix" must trigger the Pause condition; no `any`; no fire-and-forget; no new dependencies; tests MUST NOT depend on real paid external APIs (use mocks or configurable stubs).

Boundaries: write only plugin-ai-rag-pgvector's __tests__/, README.md, and small-fix-scope source (e.g. pure bug fixes); do not touch plugin-ai source (unless an L1 integration issue is found that triggers the Pause condition), core/, other plugins, pro-plugins, or CI config.

Iteration policy: run E2E cases first to locate issues, then backfill tests, then fix small bugs, then docs; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-e2e`; E2E steps a–f all pass with evidence; all unit tests pass with improved coverage; README is complete; eslint passes; the Layer 1 coexistence scenario is verified if applicable.

Pause if: the feature branch cannot be created; L2-6 base is not merged; E2E reveals an integration issue requiring plugin-ai source changes; a real paid Embedding API is required; a destructive schema change is required; or a product decision is needed.
```
