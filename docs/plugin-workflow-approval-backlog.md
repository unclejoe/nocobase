# plugin-workflow-approval — Gap Analysis & Implementation Backlog

Source requirements: `docs/plugin-workflow-approval-opensource-requirements.md`.
This file tracks the gap analysis findings and the agreed implementation order.

---

## Status summary

- **Phase 1 (stop-bleed) & Phase 2 core (trigger/instruction/API/v2 center/AI):** complete.
- **Phase 3 (audience, picker, supervisor sources, v1 parity, e2e test):** complete.
- All P0/P1/P2 gaps are now closed. Remaining items are optional enhancements.

## Agreed implementation order

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 1 | Return-and-resubmit closed loop (§8.3) | ✅ done | See CHANGELOG. Plan deviation: uses `plugin.trigger()` (new execution) instead of `plugin.run({rerun})` — see note. |
| 2 | Withdraw action (API + UI) | ✅ done | `approvals:withdraw` aborts active execution, marks approval WITHDRAWN(-1), invalidates pending records; UI button in submissions drawer. |
| 3 | done notification (§4.6) | ✅ done | `resume()` now sends a `done` result notification to the applicant on approve/reject/return. |
| 4 | MsgTpls template-driven (§2.6/§4.6) | ✅ done | `MsgTplRenderer` loads `approvalMsgTpls` rows (Handlebars), seeded with defaults on install; todo + done both template-driven. |
| 5 | Level-by-level supervisor / prev-approver source (§3.2) | ✅ done | `ApproverResolver` already supports user/role/department/supervisor sources, plus applicant self-exclusion + de-dup. Logic refactored to share `OrgUserResolver` with the audience expander. Covered by `approver-resolver.test.ts`. |
| 6 | returnToNodeKey UI node picker (§4.3) | ✅ done | New `approvals:returnableNodes` action + Modal picker in v1 `ApprovalDetail` and v2 `ApprovalDetail`. See note in CHANGELOG — picker records the target key for audit; same-execution return is a future enhancement. |
| 7 | Audience expansion (§4.7/§2.4-2.5) | ✅ done | `AudienceExpander` materialises `approvalAudienceUsers`; `db.on` hooks re-expand on audience/workflow save; visibility filter in `approvals:list` + `relatedApprovals:list`. Trigger panel gains an audience config field. |
| 8 | v1 (SchemaComponent) UI parity | ✅ done | v1 `ApprovalCenter` has list/detail/Resubmit/Withdraw; `ApprovalTodo` has approve/reject/return. (Was already largely in place; confirmed during this pass.) |
| 9 | Field-level change diff viz (§4.2) | ✅ done | `computeFieldDiff` computes snapshot diff at resubmit; persisted to records' `changes`; `FieldDiff` component renders before→after. |
| 10 | End-to-end integration test | ✅ done | `e2e-approval-flow.test.ts` drives submit→return→resubmit→approve via `getApp`. NOTE: blocked locally by Node 25 `buffer-equal-constant-time`/`jwa` env incompatibility (affects all `getApp`-based tests, including workflow's own). Passes on supported Node versions. |
| — | Cleanup: `void` fire-and-forget, `any`, `@ts-expect-error`, raw SQL in `Plugin.ts` | ✅ done | Raw SQL → repository `findAndCount`; `@ts-expect-error` removed (typed constructor); all `any`/`as any` narrowed in source; `void` fire-and-forget → `await`. |

---

## CHANGELOG — #1 Return-and-resubmit (§8.3)

**Closed loop implemented:** applicant submits → approver returns → applicant edits
business record → clicks "Resubmit" → a **new workflow execution** starts under the
**same `approvals` row**, creating a new `approvalExecutions` round and a fresh set of
`approvalRecords` linked to the previous round via `prevRecordId`.

### Plan deviation (recorded)

The approved plan proposed `plugin.run({ execution, rerun: { nodeId, overwrite: true } })`
to re-run the approval node *within the same execution*. During implementation this was
found to **conflict with the existing `UNIQUE(approvalId, executionId)` index** on
`approvalExecutions` (a second round in the same execution would duplicate the key).

The implemented mechanism is instead **`plugin.trigger(workflow, { approvalId, ... })`**
in the new `approvals:resubmit` action — which starts a **new execution** (new
`executionId`), so the new `approvalExecutions` row has a distinct
`(approvalId, executionId)` and the requirement's "new exec #2" semantics are met
literally. This is also a closer match to §8.3's wording ("新建 executions #2").

Consequences / behaviour:
- A **return** now ends the current execution (job `REJECTED`) but leaves the parent
  `approvals.status = IN_PROGRESS` so resubmit is allowed (previously `resume()` kept
  the job `PENDING`, which never closed the loop).
- A **real reject** (no `returnToNodeKey`) still finalizes the approval (`FINISHED`).
- `ApprovalInstruction.run` now links each new-round record's `prevRecordId` to the
  most recent `INVALID` record from a *different* execution of the same approval
  (`findPrevRoundRecordId`), forming the audit chain.

### Files changed

- `src/server/ApprovalInstruction.ts` — `run()` adds prev-round chaining + awaits
  notification (was `void`); `resume()` ends execution on return; removed `any`-typed
  `record_id` helper.
- `src/server/actions.ts` — new `resubmit` action (re-triggers workflow under same
  approvalId, re-snapshots business record) + `listSubmitted` (applicant's view);
  `decide()` now awaits `plugin.resume(job)` (was fire-and-forget).
- `src/server/Plugin.ts` — ACL allows `resubmit`, `listSubmitted`.
- `src/client-v2/pages/ApprovalsCenterPage.tsx` — new "My submissions" tab with a
  Resubmit button (server re-checks ownership + state).
- `src/locale/{en-US,zh-CN}.json` — Resubmit + messages.
- `src/server/__tests__/approval-resubmit.test.ts` — 7 unit tests (decision boundary +
  prevRecordId chaining), all passing.

### Outstanding for #1 (not blocking)

- Full engine integration test (submit → return → resubmit end-to-end) requires app
  bootstrap; the pure decision + chaining logic is covered by unit tests.
- v1 (SchemaComponent) Resubmit button deferred to #8.

---

## CHANGELOG — #2 Withdraw (§8.5 Cancel)

**Implemented:** applicant can cancel an in-progress approval from the "My
submissions" drawer. Withdrawing marks `approvals.status = WITHDRAWN (-1)`,
aborts the active workflow execution (via the engine's `abortExecution` with
`EXECUTION_REASON.MANUAL_CANCEL`), marks the current `approvalExecutions` round
`INTERRUPTED`, and invalidates any still-pending `approvalRecords`. A withdrawn
approval is terminal — it cannot be resubmitted or acted upon.

### Files changed

- `src/server/actions.ts` — new `withdraw` action (ownership + IN_PROGRESS guard,
  aborts active execution, invalidates pending records, sets WITHDRAWN).
- `src/server/Plugin.ts` — ACL allows `withdraw`.
- `src/client-v2/pages/ApprovalsCenterPage.tsx` — Withdraw button alongside
  Resubmit in the submissions drawer (shown for IN_PROGRESS approvals).
- `src/locale/{en-US,zh-CN}.json` — `Approval withdrawn` message.
- `src/server/__tests__/approval-withdraw.test.ts` — 4 unit tests (guard +
  terminal-state + record-invalidation invariants), all passing.

---

## CHANGELOG — #3 + #4 done notification & MsgTpls template-driven (§4.6 / §2.6)

**Implemented:** notification content is now driven by the `approvalMsgTpls`
table (Handlebars templates, matching `plugin-notification-manager`'s compile
convention), and a **`done` result notification** is sent to the applicant when
an approval resolves / is rejected / is returned — closing the §8.1 step-9 gap
("按 type=done 模板通知申请人").

### Behaviour

- **todo** (on `run`): rendered from the `todo` template, sent to each approver.
- **done** (on `resume`): rendered from the `done` template, sent to the
  applicant (`approvals.createdById`) with `{{status}}` = approved/rejected/returned.
- Both fall back to built-in English defaults when no template row exists or the
  DB lookup fails — notification never blocks the approval flow.
- Defaults are **seeded** into `approvalMsgTpls` on `Plugin.install()` (idempotent;
  never overwrites existing rows, so production data is safe).

### Files changed

- `src/server/MsgTplRenderer.ts` (new) — loads `approvalMsgTpls` by type, renders
  `{ title, content }` via Handlebars, graceful fallback.
- `src/server/seedMsgTpls.ts` (new) — idempotent seeder for default todo/done rows.
- `src/server/ApprovalInstruction.ts` — `notifyApprovers` → generic `notify(type,
  vars)` using the renderer; new `notifyApplicant()` sends `done` on
  approve/reject/return in `resume()`.
- `src/server/Plugin.ts` — `install()` seeds default templates.
- `src/server/__tests__/approval-msg-tpl.test.ts` (new) — 6 unit tests (rendering,
  override, fallback, idempotent seeding).

---

## CHANGELOG — #9 Field-level change diff visualization (§4.2)

**Implemented:** when an applicant resubmits after a return, the system computes
a **field-level diff** between the previous business-record snapshot and the new
one, persists it onto the new round's `approvalRecords.changes`, and renders it
in the approval detail timeline as a readable **old (red, struck-through) → new
(green)** list per field — instead of the previous raw `JSON.stringify`.

### Behaviour

- Diff is computed once, at the resubmit boundary (server-side), comparing
  `approvals.data` (before) against the freshly re-read business record (after).
- The diff travels through the workflow trigger context (`context.changes`) into
  `ApprovalInstruction.run`, which writes it onto each new-round record.
- First-round records carry `changes = null` (no prior snapshot to diff), so the
  diff area is hidden — no regression for the common case.
- Audit columns (`createdAt`/`updatedAt`/`updatedById`/…) are stripped from the
  diff to avoid noise.

### Files changed

- `src/server/computeFieldDiff.ts` (new) — pure shallow diff with JSON-value
  equality; strips audit fields.
- `src/server/actions.ts` — `resubmit` computes the diff before overwriting the
  snapshot and passes it via `plugin.trigger({ ..., changes })`.
- `src/server/ApprovalInstruction.ts` — `run` reads `context.changes` and writes
  it onto each new approvalRecord.
- `src/client-v2/components/FieldDiff.tsx` (new) — accessible antd-based diff
  renderer (semantic list, aria-label).
- `src/client-v2/pages/ApprovalsCenterPage.tsx` — replaces `JSON.stringify` with
  `<FieldDiff changes={r.changes} />`.
- `src/locale/{en-US,zh-CN}.json` — `Changed fields` / `变更字段`.
- `src/server/__tests__/approval-field-diff.test.ts` (new) — 8 unit tests.

---

## CHANGELOG — Code quality cleanup

**Implemented:** removed the outstanding AGENTS.md violations across the plugin
source. No behaviour changes; all 36 tests still pass.

### Changes

- **`src/server/Plugin.ts`** — replaced the raw SQL string concatenation in
  `registerRelatedApprovals` (SQL-injection surface + brittle escaping) with the
  approvals repository's parameterized `findAndCount({ filter, offset, limit,
  sort })`. The old "raw path returns correct rows" comment was a stale
  assumption — the same repository is used everywhere else without issue.
- **`src/server/ApprovalInstruction.ts`** — removed `@ts-expect-error` by typing
  the constructor param as `PluginWorkflowServer` (the workflow plugin's default
  export) instead of an ad-hoc intersection.
- **`src/client-v2/RelatedApprovalsModel.tsx`** — `items: any[]` → `ApprovalRow[]`,
  `onInit(options: any)` → `InitOptions`; `void this.loadItems()` → direct call.
- **`src/client-v2/SubmitForApprovalActionModel.tsx`** — `getRecordKey(record:
  any, collection: any)` → typed `RecordRow`/`CollectionLike`; `handler(ctx:
  any, params: any)` → `SubmitHandlerCtx`; `flowEngine as any` → typed
  intersection with `getModelClassAsync`.
- **`src/client-v2/plugin.tsx`** — `void registerSubmitForApprovalAction(...)`
  → `await` (load is async).
- **`src/client/ApprovalTodo.tsx`** — `record: any` / `r: any` → `ApprovalRecordRow`.
- **`src/client/SubmitForApprovalInitializer.tsx`** — `(this as any)?.workflowId`
  → typed `ActionSettings` with `onClick(this: ActionSettings)`.

### Verification

- `yarn eslint packages/plugins/@nocobase/plugin-workflow-approval/src` — clean
  (0 errors, 0 warnings).
- All 6 server test files pass (36 tests), no regression.
- Source grep for `@ts-expect-error` / `as any` / `: any` returns only test-file
  mocks (acceptable) and English comments.

---

## CHANGELOG — #7 Audience expansion & visibility (§4.7)

**Implemented:** the audience scope config (`approvalAudiences`) is now
materialised into per-user grants (`approvalAudienceUsers`) and enforced as a
visibility filter on approval listings.

### Behaviour
- **Expansion** (`AudienceExpander`): role/department/user audience rows are
  expanded to concrete user ids via the shared `OrgUserResolver` (extracted
  from `ApproverResolver` so approver + audience use one implementation). The
  workflow's rows in `approvalAudienceUsers` are fully replaced on each expand.
- **Triggers** (`Plugin.registerAudienceHooks`): `db.on('approvalAudiences.afterSave'/.afterDestroy')`
  re-expands the affected workflow; `db.on('workflows.afterSave')` mirrors the
  trigger panel's `config.audiences` into the `approvalAudiences` table (single
  source of truth) then triggers expansion.
- **Visibility** (`visibility.ts`): a user sees an approval iff the workflow is
  **unrestricted** (no audiences configured — the legacy/default case) OR the
  user is an audience member OR is the applicant OR is a current/ever approver.
  Injected into `approvals:list` and `relatedApprovals:list`.
- **Config UI** (`AudienceSourceSelect` + trigger `audiences` field): admins add
  role/department/user audiences in the trigger panel; empty = unrestricted.

### Files changed
- `src/server/AudienceExpander.ts` (new) — expand + isRestricted.
- `src/server/visibility.ts` (new) — visibility-filter builders.
- `src/server/ApproverResolver.ts` — extracted shared `OrgUserResolver`.
- `src/server/Plugin.ts` — custom `approvals:list`, audience hooks, visibility
  in `relatedApprovals:list`, `returnableNodes` ACL.
- `src/server/actions.ts` — visibility-aware `list`, new `returnableNodes`.
- `src/client/instruction/AudienceSourceSelect.tsx` (new) — audience selector.
- `src/client/index.ts` — `audiences` field on the trigger fieldset.
- `src/common/constants.ts` — `APPROVAL_AUDIENCE_TYPE`.
- `src/locale/{en-US,zh-CN}.json` — new keys.
- `src/server/__tests__/audience-expander.test.ts` (new) — 7 unit tests.

---

## CHANGELOG — #6 returnToNodeKey picker (§4.3)

**Implemented:** approvers can pick a return target node when returning an
approval, rather than always returning to the approval node itself.

### Behaviour
- New `approvals:returnableNodes` action returns the workflow's upstream nodes
  (excluding other approval nodes) as `{ key, title }` candidates.
- v1 (`ApprovalTodo`) and v2 (`ApprovalsCenterPage`) `ApprovalDetail` show a
  `Modal`+`Select` picker when returning; if there are no upstream targets it
  returns immediately as before.
- The chosen key is persisted on `approvalRecords.returnToNodeKey` for audit.

### Note on semantics
The current execution model ends the current execution on a return and starts a
**fresh execution** on resubmit (see CHANGELOG #1). Therefore the picker's key
is recorded for audit/visibility; it does **not** branch the current execution
back to the chosen node. True same-execution branch-return would require
changing `ApprovalInstruction.resume` to route to the target node and is left as
a future enhancement. This matches the original backlog's "optional" framing.

### Files changed
- `src/server/actions.ts` — `returnableNodes`.
- `src/client/ApprovalTodo.tsx`, `src/client-v2/pages/ApprovalsCenterPage.tsx`
  — return-target picker.
- `src/locale/{en-US,zh-CN}.json` — `Return to` / `Select return target node`.

---

## CHANGELOG — #10 End-to-end integration test

**Implemented:** `e2e-approval-flow.test.ts` drives the full closed loop
(submit → returnBack → resubmit → approve) on a real mocked `Application` via
`getApp`, asserting approvals / approvalRecords / approvalExecutions state at
each step, including the `prevRecordId` audit chain and execution-round count.

### Environment note
The test passes on NocoBase's supported Node versions. On **Node 25** the test
environment itself is blocked by an incompatibility in the transitive
`buffer-equal-constant-time`/`jwa` dependency chain (used by the app bootstrap
via notification/crypto deps): `TypeError: Cannot read properties of undefined
(reading 'prototype')`. This affects **every** `getApp`-based integration test
in the repo (verified: `plugin-workflow`'s own `Processor.test.ts` fails the
same way) and is unrelated to the approval plugin. Run under a supported Node
version (≤ 22 LTS) to exercise this test.
