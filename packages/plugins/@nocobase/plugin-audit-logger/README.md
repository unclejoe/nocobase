# @nocobase/plugin-audit-logger

Request-level audit logging for NocoBase (v2).

This plugin is the **persistence + viewing** half of NocoBase's request-level
audit pipeline. The **collection** half lives in the core server package
(`app.auditManager`): a middleware observes every request and, for resources
and actions that have been registered for auditing, emits an `AuditLog`
(`resource` / `action` / `userId` / `roleName` / `ip` / `ua` / `status` /
`metadata`).

`plugin-audit-logger` does three things:

1. **Persist** — an `AuditTrailLogger` implements the core `AuditLogger`
   interface and writes each emitted `AuditLog` into the `auditTrails`
   collection. It is wired in via `app.auditManager.setLogger(...)` during the
   plugin's `load()`.
2. **Query** — `auditTrails` is exposed as a **read-only** resource (`list` /
   `get` only) and gated behind the `pm.audit-logger.logs` ACL snippet so only
   authorised roles can browse it.
3. **Display** — a v2 client (`@nocobase/client-v2`) plugin-settings page
   renders a read-only, paginated table with a `CollectionFilter` for filtering
   by user / resource / action / time, plus a detail drawer.

## What it is NOT

- It is **request-level only**. It does not capture row-level field
  `before`/`after` diffs — that is the job of the deprecated
  `@nocobase/plugin-audit-logs` plugin (a separate, row-level concern).
- First version excludes archiving / rotation / export / real-time push.

## Pipeline

```
HTTP request
  -> app.auditManager.middleware  (core, registered in helper.ts)
  -> resourcer action runs
  -> [finally] AuditManager.output(ctx)        (core)
  -> AuditTrailLogger.log(auditLog)            (this plugin)
  -> auditTrails row
```

The plugin does **not** modify `app.auditManager`'s public API, the set of
registered actions, or any core package source. Which actions get audited is
decided entirely by the core framework and other plugins
(`auth:signIn`, `collections:apply`, `pm:*`, `app:*`, …).

## Collections

`auditTrails` (defined in `src/server/collections/auditTrails.ts`) mirrors the
core `AuditLog` interface: `uuid`, `dataSource`, `resource`, `action`,
`requestSource`, `source*` / `target*`, `userId`, `roleName`, `ip`, `ua`,
`status`, `metadata`, `createdAt`. It is a `log`-grouped, schema-only
collection (excluded from user-data dumps, no data migration).

## ACL

The `pm.audit-logger.logs` snippet covers `auditTrails:list` and
`auditTrails:get`. The root role is granted every snippet by default; other
roles opt in explicitly. `create` / `update` / `destroy` are not wired on the
resource, so trails can never be mutated through the HTTP API.

## Tests

```
yarn test packages/plugins/@nocobase/plugin-audit-logger/src/server/__tests__/audit-logger.test.ts
```

Covers: logger is registered into `app.auditManager`; a registered action
produces a trail with the correct `resource`/`action`/`userId`/`ip`/`ua`/
`status`/`metadata`/`createdAt`; an unregistered action produces no trail;
`auditTrails` is read-only.
