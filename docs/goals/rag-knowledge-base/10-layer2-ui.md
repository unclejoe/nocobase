# L2-6：Layer 2 管理端 UI（v1 + v2 双运行时）

> 阶段：Layer 2 / UI | 工期：~1.5 天 | 分支：`feat/ai-rag-pgvector-ui`（基于 L2-5）
>
> 依赖：L2-5（后端 API 齐全）

## 推荐执行版（中文，可直接复制）

```text
/goal 为 plugin-ai-rag-pgvector 实现管理端 UI（v1 + v2 双运行时）：向量库连接管理（含 testConnection）、知识库 CRUD、文档上传与状态展示，全部复用 NocoBase schema 组件与 plugin-ai 的 client-v2 VectorStorePropField 模式，颜色取自 theme.useToken()，文案走 t()。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-rag-pgvector-search 分支新建并切换到 feat/ai-rag-pgvector-ui，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L2-5 已合并。

【实施范围】先精读 plugin-ai/src/client-v2/features/components.tsx 的 VectorStorePropField 与 EnvVariableInput 模式、plugin-ai 现有 AI 员工管理页 schema；确认 L2-3/L2-4 暴露的资源 API（vectorDatabases、kb、kbDocuments）。然后：
1. v1（src/client/）：
   - 向量库管理页：列表/创建/编辑/删除 + testConnection 按钮（调用 L2-2 action）；
   - 知识库管理页：列表/创建/编辑/删除，表单含 embeddingConfig、chunkConfig、绑定向量库；
   - 文档管理页：知识库详情下的文档列表 + 上传按钮（调 kbDocuments:upload）+ status 展示（pending/parsing/indexed/failed，含失败错误）+ 删除按钮。
2. v2（src/client-v2/）：等价实现，复用 client-v2/features 的 VectorStorePropField、EnvVariableInput；按 FlowEngine/FlowModel 规范组织。
3. API key 字段：用 EnvVariableInput（环境变量引用），禁止明文入库。
4. i18n：所有文案 t()，补 en-US / zh-CN。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-rag-pgvector-ui，否则终止；
2. yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector（顺序执行）；
3. yarn eslint --fix 通过；
4. 启动本地 NocoBase，分别 light/dark 主题，在 v1 与 v2 完成：创建向量库 → testConnection 通过 → 创建知识库 → 上传文档 → 等 indexed → 删除；各步截图；
5. 暗色主题下无颜色失真（参考 docs/dark-mode-theme-guidelines.md）。

约束：颜色全部来自 theme.useToken()，禁止硬编码中性色；语义色可保留固定 hex；不使用 any；不写 fire-and-forget；不引入新 UI 依赖；v2 必须用 client-v2 已有的 VectorStorePropField，不重复造轮子；API key 必须用 EnvVariableInput。

边界：仅写入 plugin-ai-rag-pgvector/src/client/、src/client-v2/、src/locale/；禁止触碰后端（src/server/、src/collections/）、plugin-ai 源码、core/、其他插件、pro-plugins、CI 配置。

迭代策略：先后端联调用的最小 v1（向量库 + 知识库 CRUD，不含文档），再 v1 文档上传 + status，再 v2 等价实现，最后 i18n 与暗色校验；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-rag-pgvector-ui；v1 与 v2 都有向量库/知识库/文档三类管理页；testConnection 在 UI 可用；上传 → indexed → 删除 全链路在两端均跑通（截图证据）；light/dark 无颜色失真；i18n 双语齐全；test 与 eslint 通过。

暂停条件：无法创建功能分支；基线 L2-5 未合并；v2 缺少必要组件需要扩展 plugin-ai/client-v2；或需要产品决策（页面位置/字段必填性）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement the admin UI for plugin-ai-rag-pgvector in both v1 and v2 runtimes: vector-DB connection management (with testConnection), KB CRUD, document upload with status display — all reusing NocoBase schema components and plugin-ai's client-v2 VectorStorePropField pattern; colors from theme.useToken(); copy via t().

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-rag-pgvector-search`: `git checkout -b feat/ai-rag-pgvector-ui`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L2-5 has been merged first.

[Scope] First read plugin-ai/src/client-v2/features/components.tsx (VectorStorePropField & EnvVariableInput patterns), plugin-ai's existing AI-employee admin-page schema; confirm resource APIs exposed by L2-3/L2-4 (vectorDatabases, kb, kbDocuments). Then:
1. v1 (src/client/):
   - Vector-DB admin page: list/create/edit/delete + a testConnection button (calls the L2-2 action);
   - KB admin page: list/create/edit/delete; form includes embeddingConfig, chunkConfig, vector-DB binding;
   - Documents page: under KB detail, a document list + upload button (kbDocuments:upload) + status display (pending/parsing/indexed/failed with error) + delete.
2. v2 (src/client-v2/): equivalent implementation reusing client-v2/features VectorStorePropField & EnvVariableInput; organized per FlowEngine/FlowModel conventions.
3. API-key field: use EnvVariableInput (env-var reference); never store plaintext.
4. i18n: all copy via t() with en-US / zh-CN.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-rag-pgvector-ui`.
2. Run `yarn test packages/plugins/@nocobase/plugin-ai-rag-pgvector` (sequentially).
3. `yarn eslint --fix` passes.
4. Start local NocoBase; in both light/dark themes and both v1/v2 runtimes, complete: create vector DB → testConnection passes → create KB → upload document → wait for indexed → delete; screenshot each step.
5. No color distortion in dark theme (see docs/dark-mode-theme-guidelines.md).

Constraints: all colors from theme.useToken() with no hardcoded neutrals; semantic colors may keep fixed hex; no `any`; no fire-and-forget; no new UI dependencies; v2 MUST reuse client-v2's existing VectorStorePropField — no reinvention; API keys MUST use EnvVariableInput.

Boundaries: write only plugin-ai-rag-pgvector/src/client/, src/client-v2/, src/locale/; do not touch the backend (src/server/, src/collections/), plugin-ai source, core/, other plugins, pro-plugins, or CI config.

Iteration policy: minimal v1 for backend integration first (vector DB + KB CRUD, no documents), then v1 document upload + status, then v2 equivalent, then i18n and dark-mode verification; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-rag-pgvector-ui`; both v1 and v2 have vector-DB/KB/document admin pages; testConnection works in the UI; the full loop upload → indexed → delete works in both runtimes (screenshot evidence); light/dark show no color distortion; i18n is complete in both languages; test and eslint pass.

Pause if: the feature branch cannot be created; L2-5 base is not merged; v2 is missing required components and plugin-ai/client-v2 must be extended; or a product decision (page placement, required-ness) is needed.
```
