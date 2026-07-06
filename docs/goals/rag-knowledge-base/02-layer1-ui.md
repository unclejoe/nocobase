# L1-2：Layer 1 UI — Markdown 知识编辑器（v1 + v2 双运行时）

> 阶段：Layer 1 / UI | 工期：~1 天 | 分支：`feat/ai-employee-markdown-kb-ui`（基于 L1-1）
>
> 依赖：L1-1（需要后端字段已存在）

## 推荐执行版（中文，可直接复制）

```text
/goal 为 NocoBase AI 员工编辑页增加 Markdown 知识编辑入口（v1 + v2 双运行时），复用项目已有 vditor 编辑器，含预览，使管理员可编辑并保存 markdownKnowledge / markdownKnowledgeEnabled 字段。

【硬性前置要求 - 必须最先执行，违反即终止】开工第一动作必须是基于 feat/ai-employee-markdown-kb-backend 分支新建并切换到 feat/ai-employee-markdown-kb-ui（git checkout -b feat/ai-employee-markdown-kb-ui），随后所有改动只能落在此分支；严禁在 main、danai 或任何他人分支上直接提交。若创建分支失败，立即停止并报告，不得继续任何代码改动。如基线分支不存在，先确认 L1-1 已合并。

【实施范围】先精读 plugin-field-markdown-vditor 插件了解项目内 vditor 用法（含 dark mode 适配，参考最近 commit 834f3ed716）；再精读 plugin-ai 的 client/ 与 client-v2/ 下 AI 员工编辑页 schema 与组件结构。然后：
1. v1（src/client/）：在 AI 员工编辑表单 schema 增加 markdownKnowledgeEnabled 开关 + markdownKnowledge markdown 编辑字段；编辑器复用 vditor，支持暗色主题（dark/compact-dark 主题下传 dark theme）。
2. v2（src/client-v2/）：同上，按 v2 组件规范（FlowEngine/FlowModel）实现等价入口。
3. 字段联动：开关关闭时隐藏 markdown 编辑器。
4. i18n：所有新增 UI 文案走 t()，补 en-US / zh-CN 两个语言包。

验证：
1. git rev-parse --abbrev-ref HEAD 确认分支为 feat/ai-employee-markdown-kb-ui，否则终止；
2. yarn test packages/plugins/@nocobase/plugin-ai（顺序执行）；
3. 对改动文件运行 yarn eslint --fix；
4. 启动本地 NocoBase，分别切换 light / dark 主题，在 v1 与 v2 编辑页：开关关闭时编辑器隐藏 / 开启时显示 / 输入 markdown 保存后重新打开仍存在 / 预览正常渲染；各截一张图。

约束：颜色全部来自 theme.useToken()，禁止硬编码任何中性色（#ffffff/#f0f0f0/white/light gradient 等，参考 AGENTS.md 与 docs/dark-mode-theme-guidelines.md）；语义色（如开关、状态）可保留固定 hex；不改动 L1-1 已完成的后端字段与注入逻辑；不引入新的 markdown 编辑器依赖（必须用 vditor）。

边界：仅写入 plugin-ai 的 src/client/ 与 src/client-v2/ 下 AI 员工编辑页相关文件，以及 src/locale/ 下的语言包；禁止触碰后端（src/server/、src/collections/）、其他插件、core/、pro-plugins、CI 配置。

迭代策略：先 v1（确认开关联动 + 暗色适配），再 v2（同等待遇），再 i18n；每个聚焦改动后重跑 test 与 eslint；最多 3 轮聚焦改进后报告剩余风险。

完成条件：当前分支为 feat/ai-employee-markdown-kb-ui；v1 与 v2 编辑页都有可用的 markdown 编辑入口；light / dark 截图均无颜色失真；开关联动正确；i18n 双语齐全；test 与 eslint 通过。

暂停条件：无法创建功能分支；基线 L1-1 未合并；vditor 与 v2 运行时不兼容需要架构调整；或需要产品决策（编辑器位置/字段必填性）时暂停。
```

## Goal Draft (English-compatible)

```text
/goal Add a Markdown knowledge editing entry to the NocoBase AI employee edit page in both v1 and v2 runtimes, reusing the project's existing vditor editor with preview, so admins can edit and save markdownKnowledge / markdownKnowledgeEnabled.

[HARD PREREQUISITE — MUST run first; violation aborts] The very first action must be creating and switching to a new branch off `feat/ai-employee-markdown-kb-backend`: `git checkout -b feat/ai-employee-markdown-kb-ui`. All subsequent changes must land ONLY on this branch. NEVER commit on `main`, `danai`, or anyone else's branch. If branch creation fails, stop immediately and report. If the base branch does not exist, confirm L1-1 has been merged first.

[Scope] First read the plugin-field-markdown-vditor plugin to learn the project's vditor usage (including dark-mode adaptation; see recent commit 834f3ed716), then read the AI employee edit-page schema/components under plugin-ai's client/ and client-v2/. Then:
1. v1 (src/client/): add a markdownKnowledgeEnabled switch and a markdownKnowledge markdown editor field to the AI employee edit form; reuse vditor; pass dark theme under dark/compact-dark themes.
2. v2 (src/client-v2/): equivalent entry following v2 conventions (FlowEngine/FlowModel).
3. Field coupling: hide the markdown editor when the switch is off.
4. i18n: all new UI copy via t() with en-US and zh-CN.

Verification:
1. Run `git rev-parse --abbrev-ref HEAD`; abort if not `feat/ai-employee-markdown-kb-ui`.
2. Run `yarn test packages/plugins/@nocobase/plugin-ai` (sequentially).
3. Run `yarn eslint --fix` on touched files.
4. Start local NocoBase, switch between light/dark themes, and in both v1 and v2 edit pages verify: editor hidden when switch off / shown when on / markdown persists after save / preview renders correctly; capture a screenshot of each.

Constraints: all colors must come from theme.useToken() with no hardcoded neutrals (see AGENTS.md and docs/dark-mode-theme-guidelines.md); semantic colors (switches, status) may keep fixed hex; do not modify the backend fields or injection logic completed in L1-1; do not introduce a new markdown editor dependency (vditor is required).

Boundaries: write only AI-employee edit-page files under plugin-ai's src/client/ and src/client-v2/, plus locale files under src/locale/; do not touch the backend (src/server/, src/collections/), other plugins, core/, pro-plugins, or CI config.

Iteration policy: v1 first (confirm switch coupling + dark-mode), then v2 (same treatment), then i18n; rerun test and eslint after each focused change; at most 3 focused improvement rounds before reporting residual risk.

Stop when: the current branch is `feat/ai-employee-markdown-kb-ui`; both v1 and v2 edit pages have a working markdown editor entry; light/dark screenshots show no color distortion; switch coupling is correct; i18n is complete in both languages; test and eslint pass.

Pause if: the feature branch cannot be created; L1-1 base is not merged; vditor is incompatible with the v2 runtime and requires architectural changes; or a product decision (editor placement, required-ness) is needed.
```
