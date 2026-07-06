# L2-0：Layer 2 前置准备 — pgvector 环境核对 + 插件脚手架

> 阶段：Layer 2 / 前置 | 工期：~0.5 天 | 分支：`chore/ai-rag-pgvector-bootstrap`（基于 `danai`）
>
> 依赖：无（Layer 2 起点）；与 Layer 1 并行可行

## 推荐执行版（中文，可直接复制）

```text
/goal 为 Layer 2 pgvector RAG 实施做前置准备：核对 pgvector 扩展可用性、确认 LangChain 依赖版本、按现有插件脚手架创建空的 plugin-ai-rag-pgvector 插件骨架，并在文档中记录部署前置条件。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 danai 分支新建并切换到 chore/ai-rag-pgvector-bootstrap（git checkout -b chore/ai-rag-pgvector-bootstrap），随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。

【实施范围】
1. 阅读 docs/rag-knowledge-base-requirements-and-plan.md 的 Layer 2 与"接口契约"章节；阅读一个现有插件（如 plugin-ai）的脚手架结构作为模板。
2. 在 packages/plugins/@nocobase/plugin-ai-rag-pgvector/ 用脚手架创建最小插件骨架：package.json（含 name/version/peerDeps: @nocobase/plugin-ai、@langchain/community、@langchain/textsplitters、@langchain/core）、src/server/plugin.ts（空 load()）、src/server/index.ts、src/client/index.ts、src/client-v2/index.ts、README.md。
3. 在 README.md 中记录部署前置条件：PostgreSQL ≥ 12 + pgvector ≥ 0.5；CREATE EXTENSION vector; 的执行步骤；本地与 Docker 两种部署方式。
4. 依赖版本：与 plugin-ai 的 @langchain/* 对齐，不引入版本冲突；用 yarn workspace 安装。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 chore/ai-rag-pgvector-bootstrap，否则终止；
2. yarn install 成功，无依赖冲突；
3. 插件可被 NocoBase 识别（启动本地 NocoBase，确认 plugin-ai-rag-pgvector 出现在插件列表，状态为 disabled 即可）；
4. yarn eslint --fix 通过（对新文件）；
5. README 中的部署步骤可被独立执行（手动验证 CREATE EXTENSION vector; 在本地 Postgres 成功或明确记录失败原因）。

约束：本阶段不实现任何 Feature 接口、不写向量库代码、不写 collection、不动 plugin-ai 源码（仅作为 peerDep 引用）；不引入与 plugin-ai 冲突的 langchain 版本；插件骨架必须遵循 NocoBase 现有插件目录结构。

边界：仅写入 packages/plugins/@nocobase/plugin-ai-rag-pgvector/ 目录及其 package.json/源码骨架/README；禁止修改 plugin-ai、core/、其他插件、pro-plugins、根 package.json 的依赖锁（yarn.lock 仅由 install 自动更新）、CI 配置。

迭代策略：先确认脚手架结构与 plugin-ai 一致（启动可见），再补 README 部署文档，最后跑 install/eslint；每个聚焦改动后重跑验证；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 chore/ai-rag-pgvector-bootstrap；plugin-ai-rag-pgvector 目录与骨架文件齐全；yarn install 无冲突；本地 NocoBase 插件列表可见该插件；README 含完整部署步骤；eslint 通过。

暂停条件：无法创建功能分支；pgvector 在目标 Postgres 版本不可用且无法绕过；需要修改 plugin-ai 源码；需要修改根 yarn.lock 引入破坏性依赖变更；或需要付费凭证时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Prepare prerequisites for Layer 2 pgvector RAG: verify pgvector availability, confirm LangChain dependency versions, scaffold an empty plugin-ai-rag-pgvector plugin following the existing plugin template, and document deployment prerequisites.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `danai`: `git checkout -b chore/ai-rag-pgvector-bootstrap`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report.

[Scope]
1. Read the Layer 2 and "Interface contract" sections of docs/rag-knowledge-base-requirements-and-plan.md; read an existing plugin (e.g. plugin-ai) scaffold as a template.
2. Create a minimal plugin skeleton at packages/plugins/@nocobase/plugin-ai-rag-pgvector/ following the scaffold: package.json (name/version/peerDeps: @nocobase/plugin-ai, @langchain/community, @langchain/textsplitters, @langchain/core), src/server/plugin.ts (empty load()), src/server/index.ts, src/client/index.ts, src/client-v2/index.ts, README.md.
3. Document deployment prerequisites in README.md: PostgreSQL ≥ 12 + pgvector ≥ 0.5; steps for `CREATE EXTENSION vector;`; both local and Docker deployment.
4. Align dependency versions with plugin-ai's @langchain/* to avoid conflicts; install via yarn workspace.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `chore/ai-rag-pgvector-bootstrap`.
2. `yarn install` succeeds with no dependency conflicts.
3. The plugin is recognized by NocoBase (start local NocoBase; confirm plugin-ai-rag-pgvector appears in the plugin list; disabled is fine).
4. `yarn eslint --fix` passes for new files.
5. The README's deployment steps are independently executable (manually verify `CREATE EXTENSION vector;` succeeds on local Postgres, or clearly document failure reasons).

Constraints: this stage implements NO Feature interface, NO vector-store code, NO collection, and does NOT modify plugin-ai source (only referenced as peerDep); no langchain version conflicts with plugin-ai; the skeleton must follow the existing NocoBase plugin directory layout.

Boundaries: write only under packages/plugins/@nocobase/plugin-ai-rag-pgvector/ (package.json, source skeleton, README); do not modify plugin-ai, core/, other plugins, pro-plugins, the root package.json deps (yarn.lock only auto-updates via install), or CI config.

Iteration policy: confirm scaffold matches plugin-ai's layout first (visible on startup), then add README deployment docs, then run install/eslint; rerun verification after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `chore/ai-rag-pgvector-bootstrap`; the plugin-ai-rag-pgvector directory and skeleton files are complete; yarn install has no conflicts; the plugin is visible in the local NocoBase plugin list; README has complete deployment steps; eslint passes.

Pause if: the feature branch cannot be created; pgvector is unavailable on the target Postgres version with no workaround; plugin-ai source must be modified; a destructive dependency change in the root yarn.lock is required; or paid credentials are needed.
```
