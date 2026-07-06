# L2-3：Layer 2 知识库 CRUD + 数据模型

> 阶段：Layer 2 / 数据模型 | 工期：~1 天 | 分支：`feat/ai-rag-pgvector-kb-crud`（基于 L2-2）
>
> 依赖：L2-2（向量库 Provider 已就绪）

## 推荐执行版（中文，可直接复制）

```text
/goal 在 plugin-ai-rag-pgvector 中定义 Layer 2 的 4 个 collection（vectorDatabases / knowledgeBases / knowledgeBaseDocuments / knowledgeBaseSegments），实现 KnowledgeBaseFeature.getKnowledgeBase / getKnowledgeBaseGroup，并提供知识库 CRUD 资源 API（kb:create/list/update/destroy），权限沿用 ACL。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-embedding 分支新建并切换到 feat/ai-rag-pgvector-kb-crud，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-2 已合并。

【实施范围】先精读 docs/rag-knowledge-base-requirements-and-plan.md 第六章数据模型；精读 plugin-ai 现有 collection 写法作为模板。然后：
1. 在 src/collections/ 定义 4 个 collection（字段严格按文档 6.1–6.4），外键关系正确，索引合理；新增 collection/字段会在 yarn nocobase upgrade 时自动 sync，无需手写迁移。
2. 实现 PgvectorKnowledgeBaseFeature.getKnowledgeBase(knowledgeBaseKeys)：从 knowledgeBases 表按 key 查询，映射为 KnowledgeBase[]（注意 KnowledgeBaseType/vectorStoreProvider/vectorStoreProps 等字段映射）。
3. 实现 getKnowledgeBaseGroup(knowledgeBaseKeys)：按 vectorStoreConfig 分组返回 KnowledgeBaseGroup[]。
4. 资源 API：在 src/server/resources/ 实现 kb.ts，提供 create/list/update/destroy action；定义_acl_ 或沿用插件级 ACL；list 支持分页与过滤。
5. 知识库创建时自动生成唯一 key（如 nanoid 或 slug）。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-kb-crud，否则终止；
2. yarn nocobase upgrade 触发 4 张表自动建表，确认表结构与字段一致；
3. yarn test 新增单测：getKnowledgeBase 映射正确性、CRUD 各 action 的成功/失败路径；
4. 启动本地 NocoBase，通过 API 完成 知识库的增删改查一轮；用 plugin-ai 的 list aiEmployees 验证 missingKnowledgeBaseKeys 字段在配置后不再缺失；
5. yarn eslint --fix 通过。

约束：collection 字段命名与文档严格一致；不使用 any；不写 fire-and-forget；不实现 search（L2-5 处理，本阶段 throw not implemented 即可）；不实现文档上传（L2-4）；权限沿用 ACL，不绕过；外键删除策略明确（如 document 删除时 segments 级联）。

边界：仅写入 plugin-ai-rag-pgvector/src/collections/、src/server/features/pgvector-knowledge-base-feature.ts（仅 getKnowledgeBase/getKnowledgeBaseGroup 部分）、src/server/resources/kb.ts、__tests__；禁止触碰 plugin-ai 源码、core/、其他插件、pro-plugins、CI 配置；不动 Embedding/Provider 实现（L2-2 已完成）。

迭代策略：先建 collection（sync 通过），再 getKnowledgeBase（单测映射），再 CRUD action（含权限），最后 getKnowledgeBaseGroup；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-kb-crud；4 张表 sync 成功且结构正确；getKnowledgeBase/getKnowledgeBaseGroup 实现并有单测；CRUD API 可完成一轮增删改查；missingKnowledgeBaseKeys 集成验证通过；eslint 通过。

暂停条件：无法创建功能分支；基线 L2-2 未合并；需要修改 plugin-ai 源码（如 aiEmployees resource）；需要破坏性 schema 变更；或需要产品决策（如 key 生成规则、级联策略）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Define the four Layer 2 collections (vectorDatabases / knowledgeBases / knowledgeBaseDocuments / knowledgeBaseSegments) in plugin-ai-rag-pgvector, implement KnowledgeBaseFeature.getKnowledgeBase / getKnowledgeBaseGroup, and provide KB CRUD resource API (kb:create/list/update/destroy) with ACL inherited.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-embedding`: `git checkout -b feat/ai-rag-pgvector-kb-crud`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-2 has been merged first.

[Scope] First read section 6 (Data Model) of docs/rag-knowledge-base-requirements-and-plan.md; read existing collections in plugin-ai as a template. Then:
1. Define 4 collections under src/collections/ (fields strictly per docs 6.1–6.4); correct FK relations and sensible indexes; new collections/fields auto-sync on `yarn nocobase upgrade` — no hand-written migration.
2. Implement PgvectorKnowledgeBaseFeature.getKnowledgeBase(knowledgeBaseKeys): query knowledgeBases by key, map to KnowledgeBase[] (mind KnowledgeBaseType/vectorStoreProvider/vectorStoreProps mapping).
3. Implement getKnowledgeBaseGroup(knowledgeBaseKeys): group by vectorStoreConfig into KnowledgeBaseGroup[].
4. Resource API: implement kb.ts under src/server/resources/ with create/list/update/destroy actions; define_acl_ or inherit plugin-level ACL; list supports pagination and filtering.
5. Auto-generate a unique key on KB creation (e.g. nanoid or slug).

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-kb-crud`.
2. `yarn nocobase upgrade` triggers auto-creation of the 4 tables; confirm the schema matches.
3. `yarn test` with new unit tests: getKnowledgeBase mapping correctness, CRUD success/failure paths.
4. Start local NocoBase; complete one full CRUD round via the API; verify plugin-ai's `list aiEmployees` no longer reports missingKnowledgeBaseKeys after configuration.
5. `yarn eslint --fix` passes.

Constraints: collection field names must strictly match the doc; no `any`; no fire-and-forget; do NOT implement search (handled in L2-5 — throw not implemented here); do NOT implement document upload (L2-4); ACL must be inherited, not bypassed; FK delete strategy must be explicit (e.g. cascade segments when a document is deleted).

Boundaries: write only plugin-ai-rag-pgvector/src/collections/, src/server/features/pgvector-knowledge-base-feature.ts (only getKnowledgeBase/getKnowledgeBaseGroup), src/server/resources/kb.ts, and __tests__; do not touch plugin-ai source, core/, other plugins, pro-plugins, or CI config; do not modify Embedding/Provider implementations (completed in L2-2).

Iteration policy: collections first (sync passes), then getKnowledgeBase (with mapping unit tests), then CRUD actions (with ACL), then getKnowledgeBaseGroup; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-kb-crud`; the 4 tables sync successfully with correct schema; getKnowledgeBase/getKnowledgeBaseGroup are implemented with unit tests; CRUD API completes a full round; missingKnowledgeBaseKeys integration verified; eslint passes.

Pause if: the feature branch cannot be created; L2-2 base is not merged; plugin-ai source must be modified (e.g. aiEmployees resource); a destructive schema change is required; or a product decision (key generation rule, cascade strategy) is needed.
```
