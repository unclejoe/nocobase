# L1-3：Layer 1 文件外挂（P2，可选）— 从目录加载 *.md

> 阶段：Layer 1 / 增强（P2） | 工期：~0.5 天 | 分支：`feat/ai-employee-markdown-kb-filemount`（基于 L1-2）
>
> 依赖：L1-2（已合并）

## 推荐执行版（中文，可直接复制）

```text
/goal 为 NocoBase AI 员工 Layer 1 增加"文件外挂"模式：当设置环境变量 NOCOBASE_AI_KB_DIR 时，启动时与定期同步（默认 5 分钟）从该目录加载所有 *.md 文件，按文件名聚合成 markdownKnowledge 注入对应 AI 员工（按文件名前缀匹配 AI 员工 username）。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-employee-markdown-kb-ui 分支新建并切换到 feat/ai-employee-markdown-kb-filemount，随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告。如基线分支不存在，先确认 L1-2 已合并。

【实施范围】先精读 L1-1 注入逻辑所在文件；再设计文件名约定：<aiEmployeeUsername>__<任意标题>.md（双下划线分隔），未匹配 username 的文件忽略并日志告警。然后：
1. 在 plugin-ai server plugin.ts 的 load() 中注册 FileMountService，环境变量未设置时整体跳过（零行为变化）。
2. FileMountService.start()：启动时扫描目录 → 解析文件名 → 写入内存缓存 → 与 L1-1 注入逻辑对接（缓存优先于数据库字段，二者取并集或缓存覆盖，需在文档中明确选择并加注释）。
3. 定时同步：默认 5 分钟轮询 mtime 增量加载；提供 stop() 在 plugin unload 时清理定时器，避免泄漏。
4. 错误处理：目录不存在/无读权限时启动告警但不抛出；单文件解析失败不影响其他文件。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-employee-markdown-kb-filemount，否则终止；
2. yarn test packages/plugins/@nocobase/plugin-ai（顺序执行），新增 FileMountService 单测（目录扫描、文件名解析、mtime 增量、缺目录容错）；
3. 对改动文件运行 yarn eslint --fix；
4. 手动验证：设置环境变量 + 放 2 个 .md 文件 → 启动 → 对应 AI 员工提问命中文件内容；修改文件 → 等待同步周期 → 命中新内容；未设环境变量 → 行为与无本特性一致。

约束：环境变量未设置时零行为变化（向后兼容）；不引入新依赖；不使用 any、不写 fire-and-forget、不用 async IIFE；不在生产环境默认启用（仅环境变量触发）；定时器必须在 unload 时清理。

边界：仅写入 plugin-ai/src/server/ 下与 FileMountService 直接相关的文件（建议新建 src/server/ai-employees/file-mount-service.ts）与 plugin.ts 的注册处，以及 __tests__；禁止触碰前端、Layer 2、其他插件、core/ai、pro-plugins、CI 配置。

迭代策略：先做启动时全量加载（含文件名约定与单测），再做定时增量同步，最后做错误容错；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-employee-markdown-kb-filemount；FileMountService 单测全部通过；手动验证三类场景均有截图/日志证据；环境变量未设时行为与基线一致；test 与 eslint 通过。

暂停条件：无法创建功能分支；基线 L1-2 未合并；缓存与数据库字段的合并策略需要产品决策；或需要修改 L1-1 注入逻辑的契约（缓存/字段优先级）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Add a "file mount" mode to NocoBase AI employees' Layer 1: when the env var NOCOBASE_AI_KB_DIR is set, load all *.md files from that directory at startup and on a periodic sync (default 5 min), aggregate them by filename prefix matching the AI employee username, and inject as markdownKnowledge.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-employee-markdown-kb-ui`: `git checkout -b feat/ai-employee-markdown-kb-filemount`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L1-2 has been merged first.

[Scope] First read the L1-1 injection-logic files; then design the filename convention: `<aiEmployeeUsername>__<any title>.md` (double underscore separator); files whose prefix does not match any username are ignored with a log warning. Then:
1. Register a FileMountService in plugin-ai server's plugin.ts load(); skip entirely when the env var is unset (zero behavior change).
2. FileMountService.start(): scan dir at startup → parse filenames → populate in-memory cache → feed into the L1-1 injection path (cache takes precedence over the DB field, or union — pick one, document it, and add a comment).
3. Periodic sync: default 5-min polling by mtime for incremental loading; provide stop() to clear timers on plugin unload and avoid leaks.
4. Error handling: missing dir / no read permission → warn but do not throw; a single file parse failure must not affect others.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-employee-markdown-kb-filemount`.
2. Run `yarn test packages/plugins/@nocobase/plugin-ai` (sequentially); add unit tests for FileMountService (dir scan, filename parsing, mtime incremental, missing-dir tolerance).
3. Run `yarn eslint --fix` on touched files.
4. Manual: set the env var + place 2 .md files → start → ask the matching AI employee a question and confirm the file content is used; modify a file → wait for the sync cycle → confirm the new content is used; unset the env var → behavior is identical to the baseline.

Constraints: zero behavior change when the env var is unset (backward compatible); no new dependencies; no `any`, no fire-and-forget, no async IIFE; do not enable by default in production (env-var-gated only); timers must be cleaned up on unload.

Boundaries: write only files directly related to FileMountService under plugin-ai/src/server/ (suggest src/server/ai-employees/file-mount-service.ts) plus the registration point in plugin.ts and __tests__; do not touch the frontend, Layer 2, other plugins, core/ai, pro-plugins, or CI config.

Iteration policy: startup full-load first (with filename convention + unit tests), then periodic incremental sync, then error tolerance; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-employee-markdown-kb-filemount`; all FileMountService unit tests pass; the three manual scenarios have screenshot/log evidence; behavior with env var unset matches the baseline; test and eslint pass.

Pause if: the feature branch cannot be created; L1-2 base is not merged; the cache-vs-DB merge strategy requires a product decision; or modifying the L1-1 injection contract (cache/field precedence) is required.
```
