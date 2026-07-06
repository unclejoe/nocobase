# L2-1：Layer 2 Feature 注册骨架 — 四个 Feature 类 + enableFeatures 调用

> 阶段：Layer 2 / 注册 | 工期：~1 天 | 分支：`feat/ai-rag-pgvector-skeleton`（基于 L2-0）
>
> 依赖：L2-0（插件骨架已存在）

## 推荐执行版（中文，可直接复制）

```text
/goal 为 plugin-ai-rag-pgvector 实现 RAG 四个 Feature 类的骨架（方法暂 throw not impl），并在插件 load() 中通过 app.plugin('@nocobase/plugin-ai').then(p => p.features.enableFeatures(...)) 注册，使 GET /api/aiSettings:isKnowledgeBaseEnabled 返回 { enabled: true }。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 chore/ai-rag-pgvector-bootstrap 分支新建并切换到 feat/ai-rag-pgvector-skeleton，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-0 已合并。

【实施范围】先精读 plugin-ai/src/server/features/ 下四个接口（knowledge-base.ts、vector-store-provider.ts、vector-database-provider.ts、vector-database.ts）、types/knowledge-base.type.ts、manager/ai-feature-manager.ts 的 EEFeatures，以及 plugin-ai 的 plugin.ts 上 features 与 enableFeatures 的暴露方式。然后：
1. 在 plugin-ai-rag-pgvector/src/server/features/ 实现：
   - PgvectorKnowledgeBaseFeature implements KnowledgeBaseFeature（getKnowledgeBase/getKnowledgeBaseGroup/search 暂 throw new Error('not implemented')）
   - PgvectorVectorStoreProvider implements VectorStoreProvider + 对应 Feature
   - PgvectorVectorDatabaseProvider implements VectorDatabaseProvider + 对应 Feature
   - PgvectorVectorDatabaseFeature implements VectorDatabaseFeature
2. 在 plugin.ts 的 load() 中：await app.plugin('@nocobase/plugin-ai')，然后调用 p.features.enableFeatures({ knowledgeBase, vectorStoreProvider, vectorDatabaseProvider, vectorDatabase }) 注入四个实例。
3. 注册顺序容错：plugin-ai 未加载/加载失败时不让本插件 load() 抛错，而是日志告警并降级（不注册）。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-skeleton，否则终止；
2. yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector（如有），新增 enableFeatures 注册成功的最小单测；
3. 启动本地 NocoBase（确保 plugin-ai 与本插件均 enabled），curl GET /api/aiSettings:isKnowledgeBaseEnabled 返回 { enabled: true }；
4. yarn eslint --fix 通过；
5. 触发任一未实现方法（如调用 search）确认抛出 "not implemented"（证明骨架已挂载但实现待补）。

约束：四个 Feature 类必须严格 implements 对应接口（不允许 any 跳过）；不实现真实业务逻辑（throw not implemented 即可，本阶段不接向量库）；不改动 plugin-ai 源码；enableFeatures 调用必须等 plugin-ai 就绪后再执行。

边界：仅写入 plugin-ai-rag-pgvector/src/server/ 下 plugin.ts、features/ 目录、index.ts，以及 __tests__；禁止触碰 plugin-ai 源码、core/、其他插件、pro-plugins、CI 配置；不动 client/、client-v2/（本阶段无 UI）。

迭代策略：先建四个类与接口签名（TS 编译通过），再接 enableFeatures 注册（API 返回 true），再加 plugin-ai 未就绪的容错；每个聚焦改动后重跑验证；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-skeleton；四个 Feature 类文件存在且 TS 类型校验通过；load() 中 enableFeatures 调用存在且有 plugin-ai 未就绪容错；GET /api/aiSettings:isKnowledgeBaseEnabled 返回 { enabled: true }；eslint 通过。

暂停条件：无法创建功能分支；基线 L2-0 未合并；plugin-ai 的 features/enableFeatures 暴露方式与文档预期不符需要修改 plugin-ai；或需要真实向量库凭证时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement the four RAG Feature class skeletons (methods throw "not implemented" for now) in plugin-ai-rag-pgvector and register them via `app.plugin('@nocobase/plugin-ai').then(p => p.features.enableFeatures(...))` in the plugin's load(), so that GET /api/aiSettings:isKnowledgeBaseEnabled returns { enabled: true }.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `chore/ai-rag-pgvector-bootstrap`: `git checkout -b feat/ai-rag-pgvector-skeleton`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-0 has been merged first.

[Scope] First read plugin-ai/src/server/features/ (knowledge-base.ts, vector-store-provider.ts, vector-database-provider.ts, vector-database.ts), types/knowledge-base.type.ts, manager/ai-feature-manager.ts (EEFeatures), and how plugin-ai exposes `features` / `enableFeatures` in its plugin.ts. Then:
1. Under plugin-ai-rag-pgvector/src/server/features/ implement:
   - PgvectorKnowledgeBaseFeature implements KnowledgeBaseFeature (getKnowledgeBase/getKnowledgeBaseGroup/search throw new Error('not implemented'))
   - PgvectorVectorStoreProvider implements VectorStoreProvider + the Feature wrapper
   - PgvectorVectorDatabaseProvider implements VectorDatabaseProvider + the Feature wrapper
   - PgvectorVectorDatabaseFeature implements VectorDatabaseFeature
2. In plugin.ts load(): `await app.plugin('@nocobase/plugin-ai')`, then call `p.features.enableFeatures({ knowledgeBase, vectorStoreProvider, vectorDatabaseProvider, vectorDatabase })` with instances.
3. Order tolerance: if plugin-ai is not loaded / fails to load, this plugin's load() must not throw — log a warning and degrade (skip registration).

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-skeleton`.
2. Run `yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector` (if any); add a minimal unit test that enableFeatures registration succeeds.
3. Start local NocoBase (with plugin-ai and this plugin both enabled); `curl GET /api/aiSettings:isKnowledgeBaseEnabled` returns `{ enabled: true }`.
4. `yarn eslint --fix` passes.
5. Trigger any unimplemented method (e.g. search) and confirm it throws "not implemented" (proves the skeleton is wired but pending).

Constraints: the four Feature classes must strictly `implements` their interfaces (no `any` escape); no real business logic yet (throwing "not implemented" is fine; no vector store in this stage); do not modify plugin-ai source; the enableFeatures call must run only after plugin-ai is ready.

Boundaries: write only plugin-ai-rag-pgvector/src/server/ (plugin.ts, features/, index.ts) and __tests__; do not touch plugin-ai source, core/, other plugins, pro-plugins, or CI config; do not touch client/ or client-v2/ (no UI this stage).

Iteration policy: create the four classes with interface signatures first (TS compiles), then wire enableFeatures (API returns true), then add plugin-ai-not-ready tolerance; rerun verification after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-skeleton`; the four Feature class files exist and TS type-check passes; load() contains enableFeatures with plugin-ai-not-ready tolerance; GET /api/aiSettings:isKnowledgeBaseEnabled returns { enabled: true }; eslint passes.

Pause if: the feature branch cannot be created; L2-0 base is not merged; plugin-ai's features/enableFeatures exposure differs from the documented expectation and requires modifying plugin-ai; or real vector-DB credentials are required.
```
