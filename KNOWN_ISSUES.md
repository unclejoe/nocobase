# Known Issues

Unresolved code-level defects and technical debt, with root cause already located. Each entry is ready to be picked up — no re-investigation needed.

## KI-001: Association dropdowns show IDs instead of names (regrows after data cleanup)

**Status:** Root cause located; code fix deferred (to be done alongside the audit-logger plugin feature branch). Symptom is temporarily mitigated by clearing the bad config rows, but it **recurs** whenever a trigger fires.

**Symptom:** On modern-client (v2) forms, association-field dropdowns (Customer / Category / Owner / Submitter, etc.) render raw numeric IDs instead of the target record's title field (e.g. `Walmart`, `Alice Johnson`). Affected collections include tickets, orders, projects, leads, assets, quotations — essentially any association field whose runtime config got the bad value.

**Reproduction:** UI-troubleshoot skill — open a v2 create form, the dropdown options are numbers; React fiber shows `fieldNames = { value: "id", label: "id" }`.

**Root cause (confirmed by code trace):**

The source is a getter that falls back to the primary key:

- `packages/core/flow-engine/src/data-source/index.ts:797-798` — `Collection.titleCollectionField`
  ```ts
  get titleCollectionField() {
    const titleFieldName = this.options.titleField || this.filterTargetKey; // ← falls back to "id"
    ...
  }
  ```
  When a collection has no explicit `options.titleField`, this resolves to `filterTargetKey` (= `"id"` for almost every collection), so `CollectionField.targetCollectionTitleFieldName` returns `"id"`.

Write paths that persist the bad value (client-side; they bypass the server-side guard):

1. `packages/core/client-v2/src/flow/actions/pattern.tsx:149-167` (**primary regrowth source**) — on readPretty toggle, `resolveAssociationTitleField` falls back to `targetCollectionTitleFieldName` ("id") and writes it into both `props.titleField` **and** `stepParams.editItemSettings.titleField`. The `stepParams` write is what makes the value sticky across reloads.
2. `packages/core/client-v2/src/flow/models/blocks/form/FormItemModel.tsx:450-494` — `defaultParams` + `handler` fall back to `targetCollectionTitleFieldName` and persist via `setProps({ titleField })`.
3. `packages/core/client-v2/src/flow/actions/titleField.tsx:63-68` — `defaultParams` falls back the same way.
4. `packages/core/client-v2/src/flow/models/fields/AssociationFieldModel/recordSelectShared.tsx:56` — `normalizeAssociationFieldNames` has a hard-coded `|| 'id'` fallback that leaks back into persistence via the chain above.

**Server side is NOT the culprit** — `packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/association-title-field.ts` explicitly excludes/throws on `titleField === "id"` (`resolveCollectionSafeTitleField`, `assertFlowSurfaceTitleFieldIsNotId`, `assertNoFlowSurfaceIdTitleFieldSettings`). The bad writes come from client `setProps`/`setStepParams` going through the generic `flowModels` save API, which bypasses that guard.

**Why it's a code bug, not residue:** Cleared all 174 `titleField="id"` nodes to 0; they regrew to 174 on a later check. The majority of nodes (5000+) correctly have empty/real titleField — only a minority get "id", and only via the client write paths above.

**Temporary mitigation (already applied):** Cleared all `props.titleField="id"` from `flowModels.options` so association renderers fall back to the collection's real title field. Backups:
- `.agents/tmp/titlefield-id-backup.csv` (168 rows, first pass)
- `.agents/tmp/titlefield-id-backup-2.csv` (174 rows, second pass — after regrowth)

**Permanent fix (when picked up), in priority order:**
1. `pattern.tsx:23-29` — guard `resolveAssociationTitleField` to skip `targetCollectionTitleFieldName` when it equals the primary key. Highest leverage: it's the only path that also writes `stepParams` (the sticky value).
2. `flow-engine/src/data-source/index.ts:797-798` — `titleCollectionField` should return `undefined` (not the `id` field) when `options.titleField` is absent and `filterTargetKey` is the primary key. This is the root getter feeding all the write paths.
3. `FormItemModel.tsx` and `titleField.tsx` `defaultParams` — filter out `"id"`.
4. `recordSelectShared.tsx:56` — drop the `|| 'id'` literal.

Fixes touch core packages (`flow-engine`, `client-v2`) → must be on a feature branch with tests. Pairs naturally with the audit-logger plugin work (both touch association-field rendering / audit of field config).

**Verification of fix:** after the code change, clearing the bad rows should result in 0 regrowth across multiple form interactions (add field, toggle readPretty, clone page). Use the UI-troubleshoot skill to confirm dropdowns show names.

## KI-002: AI employee buttons fail to render on the modern client (v2) — "Model class 'AIEmployeeButtonModel' not found"

**Status:** Root cause located; v2 runtime port of the AI employee button feature is deferred. Affects only the modern client (`/v/`); the legacy client (`/`) is unaffected.

**Symptom:** On the modern client (v2), any page/block/action group whose persisted FlowModel tree references `use: 'AIEmployeeButtonModel'` renders an error instead of the AI employee avatar button. The on-screen message is:

```
Model class 'AIEmployeeButtonModel' not found. Please register it first.
```

This surfaces wherever a collection/record/form action group was configured (in v1 or via API) to include the "AI employees" action — i.e. the avatar button that triggers an AI employee task.

**Reproduction:** Open the modern client at `http://localhost:13000/v/`, navigate to a page whose action group includes the AI employees action (or any block persisting `use: 'AIEmployeeButtonModel'`). The button area shows the error message above; React fiber shows the model instance is an `ErrorFlowModel`.

**Root cause (confirmed by code trace):**

The AI employee button is a FlowModel that must be registered with the FlowEngine at plugin load. The v1 client registers it; the v2 client does not.

- v1 (works) — `packages/plugins/@nocobase/plugin-ai/src/client/index.tsx:95-99`
  ```ts
  this.flowEngine.registerModels({
    AIEmployeeShortcutListModel,
    AIEmployeeShortcutModel,
    AIEmployeeButtonModel,
  });
  ```
  plus `AIEmployeeActionModel` registered into the four action groups (`CollectionActionGroupModel`, `RecordActionGroupModel`, `FormActionGroupModel`, `PopupSubTableFormActionGroupModel`) in `src/client/ai-employees/flow/models/AIEmployeeActionModel.tsx:70-84`. `AIEmployeeActionModel.defineChildren` emits the child models with `use: 'AIEmployeeButtonModel'`.

- v2 (missing) — `packages/plugins/@nocobase/plugin-ai/src/client-v2/index.tsx:19-29` (`PluginAIClientV2.load()`) only sets up `aiConfigRepository`; it calls **no** `registerModels` and **no** `registerActionModels`. The entire `client-v2/` directory contains zero `registerModels` / `ActionModel` / `defineChildren` calls (verified by grep). So when the v2 FlowEngine encounters `use: 'AIEmployeeButtonModel'`, it has no class to instantiate.

- The error is raised in `packages/core/flow-engine/src/flowEngine.ts:954-956`: when no class resolves for the requested `use`, an `ErrorFlowModel` is created with message `Model class '<name>' not found. Please register it first.`

- The v2 contract that *expects* this model to exist is evidenced by `packages/plugins/@nocobase/plugin-kanban/src/client-v2/__tests__/KanbanCollectionActionGroupModel.test.ts:25` — kanban's v2 action group emits `use: 'AIEmployeeButtonModel'`, which is meant to be supplied by plugin-ai's v2 registration.

**Why the v1 classes can't be imported directly into v2:** the v1 models (`AIEmployeeActionModel`, the action-group registrations) depend on v1-only base classes and exports from `@nocobase/client` (`ActionModel`, `CollectionActionGroupModel`, `FormActionGroupModel`, `RecordActionGroupModel`, `PopupSubTableFormActionGroupModel`) and on a formily-based `registerFlow` settings UI (`AIEmployeeShortcutModel.tsx` `registerFlow({ key: 'shortcutSettings', ... })`). Import direction is one-way (v1 may import from v2, never the reverse, per AGENTS.md). The v2 runtime exposes equivalent bases under `@nocobase/client-v2`, and a v2-native `AIEmployeeShortcut` component + chatbox stores already exist under `src/client-v2/ai-employees/`, so the port is feasible but non-trivial.

**Scope of the port (when picked up):**
1. Create v2 model classes under `src/client-v2/ai-employees/flow/models/` (or analogous location), built on `FlowModel` / `ActionModel` / `ActionSceneEnum` from `@nocobase/client-v2` and `@nocobase/flow-engine`: `AIEmployeeShortcutListModel`, `AIEmployeeShortcutModel`, `AIEmployeeButtonModel`, `AIEmployeeActionModel`.
2. Reuse the existing v2 `AIEmployeeShortcut` component (`src/client-v2/ai-employees/AIEmployeeShortcut.tsx`) for the button render, and the v2 chatbox stores/hooks for task triggering.
3. Register the models in `PluginAIClientV2.load()` via `this.app.flowEngine.registerModels({ ... })`, and register `AIEmployeeActionModel` into the v2 action groups (`CollectionActionGroupModel`, `RecordActionGroupModel`, `FormActionGroupModel`, `PopupSubTableFormActionGroupModel` from `@nocobase/client-v2`).
4. Port or replace the `registerFlow({ key: 'shortcutSettings' })` task-settings UI (the v1 one is formily/x-component based and v1-specific).
5. Add v2 unit tests modeled on the existing `__tests__` FlowModel tests (e.g. `KanbanCollectionActionGroupModel.test.ts`).

**Quick mitigation options (not yet applied):**
- Minimal stop-gap: register an empty `AIEmployeeButtonModel` (subclass of v2 `FlowModel`, `render()` returns `null`) in `PluginAIClientV2.load()` so FlowEngine stops throwing and pages open — but the AI employee button will be absent/non-functional.
- Hide the AI employees action from v2 action groups until the port lands.

**Verification of fix:** on the modern client (`/v/`), pages with an AI employees action render the avatar button without the "not found" error; clicking it opens the task picker / triggers the AI employee as on v1. Add a v2 unit test asserting `engine.registerModels({ AIEmployeeButtonModel, AIEmployeeActionModel, ... })` and that `AIEmployeeActionModel.defineChildren` emits children resolvable to `AIEmployeeButtonModel`.
