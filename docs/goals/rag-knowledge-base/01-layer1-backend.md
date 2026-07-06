# L1-1：Layer 1 后端 — Markdown 知识注入（集合字段 + system prompt 拼装）

> 阶段：Layer 1 / 后端 | 工期：~1 天 | 分支：`feat/ai-employee-markdown-kb-backend`（基于 `danai`）
>
> 依赖：无（Layer 1 起点）

## 推荐执行版（中文，可直接复制）

```text
/goal 为 NocoBase AI 员工实现 Layer 1 Markdown 知识注入的后端：扩展 aiEmployees 集合增加 markdownKnowledge / markdownKnowledgeEnabled 字段，并在 system prompt 拼装处加上 <markdownKnowledge> 块注入逻辑与 token 预算控制。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 danai 分支新建并切换到 feat/ai-employee-markdown-kb-backend（git checkout -b feat/ai-employee-markdown-kb-backend），随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告，不得继续任何代码改动。

【实施范围】先精读 docs/rag-knowledge-base-requirements-and-plan.md 中 Layer 1 与 6.0 章节；再精读 packages/plugins/@nocobase/plugin-ai/src/collections/ai-employees.ts 与 src/server/ai-employees/ai-employee.ts 中 system prompt 拼装处、prompts.ts。然后：
1. 在 aiEmployees 集合追加字段：markdownKnowledge (text)、markdownKnowledgeEnabled (boolean, default false)。
2. 在 system prompt 拼装处，当 markdownKnowledgeEnabled && markdownKnowledge 非空时，追加 "<markdownKnowledge>\n{内容}\n</markdownKnowledge>" 块；位置与现有 <knowledgeBase> 块并列。
3. token 预算控制：默认阈值 8k tokens，超阈值截断并在日志告警；阈值提取为常量便于后续配置化。

验证：
1. 先执行 git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-employee-markdown-kb-backend，否则终止；
2. yarn nocobase upgrade 触发集合字段自动 sync，确认新字段在数据库中存在；
3. yarn test packages/plugins/@nocobase/plugin-ai（顺序执行，不并行）；
4. 对改动文件运行 yarn eslint --fix；
5. 单元测试：覆盖"开启注入 → system prompt 含 <markdownKnowledge> 块""关闭 → 不含""超阈值 → 截断 + 告警"三种场景。

约束：不改动 KnowledgeBaseFeature 接口、KnowledgeBaseManager.retrievePrompt、knowledge-base-retrieve 工具、Layer 2 调用链；不引入向量库/embedding/切块；不使用 any、不写 fire-and-forget、不用 async IIFE；token 估算优先用项目已有工具，无则用 langchain 或 tiktoken 的轻量估算并加注释。

边界：仅写入 packages/plugins/@nocobase/plugin-ai/src/collections/ai-employees.ts、src/server/ai-employees/ai-employee.ts、src/server/ai-employees/prompts.ts（如需）、以及对应 __tests__ 目录下的测试文件；禁止触碰 client/、client-v2/、Layer 2 插件、core/ai、其他插件、pro-plugins、CI 配置。

迭代策略：先加字段（确认 sync 通过），再加注入逻辑（最小可行），再加 token 预算；每个聚焦改动后重跑 test 与 eslint；失败时先读测试输出再换策略；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支确为 feat/ai-employee-markdown-kb-backend 且改动仅限此分支；aiEmployees 含两个新字段且 sync 成功；system prompt 在开启时包含 <markdownKnowledge> 块；token 截断逻辑单测通过；yarn test 与 eslint 通过。

暂停条件：无法创建功能分支；需要修改 Layer 2 接口契约；需要真实 OpenAI/付费凭证；需要生产数据；需要破坏性 schema 迁移；或需要产品决策（token 预算阈值是否可配置）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Implement the backend of Layer 1 Markdown knowledge injection for NocoBase AI employees: extend the aiEmployees collection with markdownKnowledge / markdownKnowledgeEnabled fields, and wire a <markdownKnowledge> block injection into the system-prompt assembly with token-budget control.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `danai`: `git checkout -b feat/ai-employee-markdown-kb-backend`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report — do not proceed with any code change.

[Scope] First read the Layer 1 and 6.0 sections of docs/rag-knowledge-base-requirements-and-plan.md, then read packages/plugins/@nocobase/plugin-ai/src/collections/ai-employees.ts, src/server/ai-employees/ai-employee.ts (system-prompt assembly), and prompts.ts. Then:
1. Add fields to aiEmployees: markdownKnowledge (text), markdownKnowledgeEnabled (boolean, default false).
2. In the system-prompt assembly, when markdownKnowledgeEnabled && markdownKnowledge is non-empty, append a "<markdownKnowledge>\n{content}\n</markdownKnowledge>" block; place it alongside the existing <knowledgeBase> block.
3. Token budget control: default threshold 8k tokens; truncate above threshold with a log warning; expose the threshold as a constant for future configurability.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-employee-markdown-kb-backend`.
2. Run `yarn nocobase upgrade` to trigger collection auto-sync; confirm the new fields exist in the database.
3. Run `yarn test packages/plugins/@nocobase/plugin-ai` (sequentially, not in parallel).
4. Run `yarn eslint --fix` on touched files.
5. Unit tests covering three cases: enabled → system prompt contains <markdownKnowledge> block; disabled → absent; over-threshold → truncated + warning logged.

Constraints: do not modify the KnowledgeBaseFeature interface, KnowledgeBaseManager.retrievePrompt, the knowledge-base-retrieve tool, or any Layer 2 call chain; no vector store / embedding / chunking; no `any`, no fire-and-forget, no async IIFE; prefer an existing token estimator in the repo, else use a lightweight langchain/tiktoken estimate with a comment.

Boundaries: write only packages/plugins/@nocobase/plugin-ai/src/collections/ai-employees.ts, src/server/ai-employees/ai-employee.ts, src/server/ai-employees/prompts.ts (if needed), and corresponding __tests__ files; do not touch client/, client-v2/, Layer 2 plugin, core/ai, other plugins, pro-plugins, or CI config.

Iteration policy: add fields first (confirm sync passes), then minimal injection logic, then token budget; rerun test and eslint after each focused change; on failure read test output before switching strategy; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is confirmed `feat/ai-employee-markdown-kb-backend` with all changes confined to it; aiEmployees has the two new fields and sync succeeds; the system prompt contains a <markdownKnowledge> block when enabled; token-truncation unit tests pass; yarn test and eslint pass.

Pause if: the feature branch cannot be created; a Layer 2 interface contract change, real OpenAI/paid credentials, production data, a destructive schema migration, or a product decision (e.g. token-budget configurability) is required.
```
