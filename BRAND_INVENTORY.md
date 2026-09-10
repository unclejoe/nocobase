# Brand Exposure Inventory & Config-Source Definition

> Status: **investigation deliverable** (no code changed yet). Branch `refactor/whitelabel-branding`
> not yet created — see "Open prerequisites" below.
>
> Scope: `packages/core/client`, `packages/core/client-v2`, and the minimal server/env plumbing
> needed to feed both runtimes a single brand config. **License files and source copyright
> headers are explicitly out of scope and must never be touched.**

This document is the first ordered deliverable of the white-label refactor. It defines:

1. The **single brand configuration source** and its fallback chain.
2. The **brand exposure-point inventory** with current source, target source, and per-point
   upstream-merge conflict risk.
3. The **plugin-custom-brand fallback contract** that must be preserved verbatim.

It deliberately does **not** prescribe final code; subsequent slices implement one exposure
point at a time.

---

## 1. Single Brand Config Source (definition)

### 1.1 Fallback chain (priority high → low)

```
process.env.APP_BRAND_*   ──┐
   (operator-set, per-deploy)│   wins
                            ▼
@nocobase/plugin-custom-brand options.{brand,about}
   (DB-backed, admin-edited, commercial plugin — NOT in this repo)
                            ▼
hardcoded defaults baked into core
   ("Powered by NocoBase", nocobase.com URLs)
```

The chain is **env → plugin-custom-brand → default**. This matches the objective's stated
order and keeps the existing plugin fallback contract intact (the plugin continues to win
over the bare default when no env override is present).

### 1.2 Transport (how the config reaches both runtimes)

Three pre-existing channels were audited (`packages/core/server`, `cli-v1`, `plugin-client`).
The config will ride the channel that both runtimes already consume:

| Channel | Where | Used by | Role for brand |
|---|---|---|---|
| `app:getInfo` REST action | `packages/plugins/@nocobase/plugin-client/src/server/server.ts:79-113` | v1 `useCurrentAppInfo` (`client/src/appInfo/CurrentAppInfoProvider.tsx`); v2 `useCurrentAppInfo` (`client-v2/src/hooks/useCurrentAppInfo.ts`) | **Primary.** Both clients already read `version`, `lang`, `theme`, `name` here. Brand rides along as a new `brand` field. The OpenAPI schema is `{ additionalProperties: true }`, so adding the field is non-breaking. |
| v2 pre-boot `<script>` | `packages/core/server/src/gateway/index.ts` `getV2RuntimeConfig` (346-361) | v2 HTML only | Optional synchronous layer only if a pre-React-flash value (e.g. `document.title`) is later required. **Not needed for the first slice.** |
| v1 build-time template | `packages/core/cli-v1/src/util.js` `buildIndexHtml` (436-474) | v1 umi HTML only | Same — optional, deferred. |

**Decision for the first slice:** transport brand via `app:getInfo` only. It is the single
location both runtimes already fetch, it already has the exact `process.env.X`-into-response
pattern (see `EXPORT_LIMIT` at `plugin-client/.../server.ts:99-109`), and it avoids touching
the gateway/cli HTML emitters in slice 1.

### 1.3 Env variable names (proposal, follows existing `APP_*` convention)

| Env var | Replaces | Default |
|---|---|---|
| `APP_BRAND_TITLE` | bare "NocoBase" literals in Help header | `NocoBase` |
| `APP_BRAND_HOMEPAGE_URL` | `https://www.nocobase.com` / `/cn/` footer+help link | locale `nocobase.com` URL |
| `APP_BRAND_DOCS_URL` | `https://docs.nocobase.com/...` help "Handbook" link | `docs.nocobase.com` |
| `APP_BRAND_AGREEMENT_URL` | `https://www.nocobase.com/.../agreement` help "License" link | `nocobase.com/agreement` |

> The first slice touches only **`APP_BRAND_TITLE` + `APP_BRAND_HOMEPAGE_URL`** (what `PoweredBy`
> reads). The remaining vars are added as later slices converge their respective exposure points.
> No env var is introduced until its consumer exists, to keep the change set minimal and
> merge-friendly.

### 1.4 Why this design satisfies the constraints

- **Config-driven, not inline-literal editing** — every consumer reads `appInfo.brand?.…`,
  never a fresh literal. The literals live in exactly one place: the server-side default
  builder, mirroring the existing `EXPORT_LIMIT` pattern.
- **No new abstraction layer / feature flag** — the config is a plain field on an existing,
  already-fetched payload. No new hook/context/provider is introduced beyond what both
  runtimes already use (`useCurrentAppInfo`).
- **v1→v2 one-way import preserved** — no cross-runtime imports added.
- **Public API names unchanged** — `PoweredBy`, `Help`, `HelpLite`, `usePlugin`,
  `useCurrentAppInfo`, `parseHTML`, `getAppVersionHTML` keep their signatures. The new
  `brand` field on `app:getInfo` is additive (`additionalProperties: true`).
- **plugin-custom-brand fallback preserved** — see §3. The plugin still wins over the bare
  default; env wins over the plugin (operator override), which is the documented chain.

---

## 2. Brand Exposure-Point Inventory

Legend:
- **Current source**: where the brand string comes from *today*.
- **Target source**: where it should come from after the refactor.
- **Conflict risk** (upstream `nocobase/nocobase` sync): `Low` = upstream rarely edits this
  line; `Med` = upstream sometimes edits it; `High` = actively churned.

### 2.1 v1 client (`packages/core/client`, `@nocobase/client`)

> **Signin-footer note:** the `/signin` page (AuthLayout) runs in the auth flow,
> which never populates `appInfo` (`useCurrentAppInfo()` returns `undefined`
> there). `PoweredBy` (both v1 and v2) now performs a one-shot direct
> `app:getInfo` fetch as a fallback when `appInfo` is absent, so the env-driven
> brand reaches the signin footer too. Verified in the running app: the signin
> footer renders `Powered by Acme` → acme.example.com with no NocoBase residual.

| # | file:line | Surface | Current source | Target source | Conflict risk |
|---|---|---|---|---|---|
| v1-1 | `src/user/Help.tsx:42` | Help menu header — product name | hardcoded `NocoBase` | `appInfo.brand?.title ?? 'NocoBase'` | **Done** (slice 2, `f033ea17bc`) |
| v1-2 | `src/user/Help.tsx:43` | Help menu header — version line | `data.data.version` (already data-driven) | unchanged | Low |
| v1-3 | `src/user/Help.tsx:55` | Help menu "Home page" link | hardcoded `nocobase.com` URL | `appInfo.brand?.homepageUrl` | **Done** (slice 2) |
| v1-4 | `src/user/Help.tsx:67` | Help menu "Handbook" link | hardcoded `docs.nocobase.com` URL | `appInfo.brand?.docsUrl` | **Done** (slice 2) |
| v1-5 | `src/user/Help.tsx:79` | Help menu "License" link | hardcoded `nocobase.com/agreement` URL | `appInfo.brand?.agreementUrl` | **Done** (slice 2) |
| v1-6 | `src/user/Help.tsx:126-142` | About popover (custom-brand `about` HTML) | plugin `options.options.about` | unchanged (fallback preserved) | Low |
| v1-7 | `src/powered-by/index.tsx:24-26` | "Powered by" footer URL map | fork default `https://dan.ai` | `appInfo.brand?.homepageUrl` | **Done** (fork default aligned) |
| v1-8 | `src/powered-by/index.tsx:45` | "Powered by" footer default text | hardcoded `Powered by <a…>Dan.AI</a>` (fork default, matches the server `app:getInfo` brand) | built from `appInfo.brand` | **Done** (fork default aligned) |
| v1-9 | `src/powered-by/index.tsx:44` | "Powered by" footer override | plugin `options.options.brand` | unchanged (fallback preserved) | Low |
| v1-10 | `src/document-title/index.tsx:46,68` | browser `document.title` | system-settings `data.title` (already data-driven) | unchanged | Low |
| v1-11 | `src/route-switch/antd/admin-layout/AdminLayoutComponentV1.tsx:78-97` | admin sidebar logo/title | system-settings `logo.url`/`title` (already data-driven) | unchanged | Low |
| v1-12 | `src/schema-component/antd/markdown/Markdown.Void.tsx:97` | Markdown editor "Syntax references" link | hardcoded `docs.nocobase.com` URL | `appInfo.brand?.docsUrl` | **Done** (slice 3) |
| v1-13 | `src/locale/*.json` `FORMULAJS_DOC_URL`, `MATHJS_DOC_URL` (17 files × 2 keys) | formula/math editor help link | i18n string value = `docs.nocobase.com` URL | deferred — i18n keys are frozen by constraint; revisit only if required | Low |

> v1-13 is intentionally **deferred**: the constraint forbids changing i18n keys, and these
> are string *values* inside locale JSON. They are documented here for completeness but are
> out of scope for the first slice and likely for the whole refactor unless the operator
> explicitly wants formula-help links rebranded.

### 2.2 v2 client (`packages/core/client-v2`, `@nocobase/client-v2`)

| # | file:line | Surface | Current source | Target source | Conflict risk |
|---|---|---|---|---|---|
| v2-1 | `src/components/PoweredBy.tsx:19-22` | "Powered by" footer URL map (`homePageUrls`) | fork default `https://dan.ai` | `appInfo.brand?.homepageUrl` | **Done** (fork default aligned) |
| v2-2 | `src/components/PoweredBy.tsx:48-58` | "Powered by" footer custom-brand branch | plugin `options.options.brand` | unchanged (fallback preserved) | Low |
| v2-3 | `src/components/PoweredBy.tsx:61-68` | "Powered by" footer default branch | hardcoded `Powered by … Dan.AI` (fork default, matches the server `app:getInfo` brand) | built from `appInfo.brand` | **Done** (fork default aligned) |
| v2-4 | `src/flow/admin-shell/admin-layout/HelpLite.tsx:48` | Help menu header — product name | hardcoded `NocoBase` | `appInfo.brand?.title ?? 'NocoBase'` | **Done** (slice 2, `f033ea17bc`) |
| v2-5 | `src/flow/admin-shell/admin-layout/HelpLite.tsx:61` | Help menu "Home page" link | hardcoded `nocobase.com` URL | `appInfo.brand?.homepageUrl` | **Done** (slice 2) |
| v2-6 | `src/flow/admin-shell/admin-layout/HelpLite.tsx:73` | Help menu "Handbook" link | hardcoded `docs.nocobase.com` URL | `appInfo.brand?.docsUrl` | **Done** (slice 2) |
| v2-7 | `src/flow/admin-shell/admin-layout/HelpLite.tsx:86` | Help menu "License" link | hardcoded `nocobase.com/agreement` URL | `appInfo.brand?.agreementUrl` | **Done** (slice 2) |
| v2-8 | `src/flow/admin-shell/admin-layout/HelpLite.tsx:130-145` | About popover (custom-brand `about` HTML) | plugin `options.options.about` | unchanged (fallback preserved) | Low |
| v2-9 | `src/BaseApplication.tsx:392-409` | favicon (`updateFavicon`) | `this.favicon` else `/favicon/favicon.ico` | deferred — favicon is system-settings/plugin-owned, not a literal "NocoBase" string | Low |

> v2-9 is **deferred**: the favicon default path `/favicon/favicon.ico` is a static asset path,
> not a brand literal, and favicon is owned by system-settings + plugin-custom-brand's `favicon`
> field. It is listed for completeness; the first slice does not touch it.

### 2.3 Server / env / preset

| # | file:line | Surface | Current source | Target source | Conflict risk |
|---|---|---|---|---|---|
| s-1 | `packages/plugins/@nocobase/plugin-client/src/server/server.ts:79-113` | `app:getInfo` response | no brand field | add `brand` block read from `process.env.APP_BRAND_*` (mirrors `EXPORT_LIMIT` pattern at 99-109) | Low |
| s-2 | `.env.example` | env documentation | no brand vars | document `APP_BRAND_TITLE`, `APP_BRAND_HOMEPAGE_URL` (slice 1) | Low |
| s-3 | `packages/core/server/src/gateway/index.ts:346-361` | v2 pre-boot globals | no brand global | deferred (only if pre-React-flash title needed) | Med |
| s-4 | `packages/core/cli-v1/src/util.js:436-474` | v1 build-time HTML | no brand placeholder | deferred (only if pre-React-flash title needed) | Med |

---

## 3. plugin-custom-brand Fallback Contract (must preserve)

The plugin source is **not in this repo** (commercial, `isFree: false`, distributed
separately — confirmed absent under `packages/plugins/@nocobase/`). What lives in-repo is the
**consumer-side contract** core reads off the plugin instance. This contract is load-bearing
and must not change:

| Element | Contract | Read where |
|---|---|---|
| Plugin id | `'@nocobase/plugin-custom-brand'` | v1 `powered-by:21`, `Help:106`; v2 `PoweredBy:34`, `HelpLite:110` |
| Footer key | `customBrandPlugin?.options?.options?.brand` (HTML template) | v1 `powered-by:44`; v2 `PoweredBy:48` |
| Help key | `customBrandPlugin?.options?.options?.about` (HTML template) | v1 `Help:126`; v2 `HelpLite:130` |
| Placeholder | `{{appVersion}}` via `parseHTML` (`packages/core/utils/src/parseHTML.ts`) | all four consumers |
| Version markup | `<span class="nb-app-version">v…</span>` (v2 escapes via `getAppVersionHTML`; v1 does not — pre-existing, do not "fix") | consumers + tests |
| Reserved CSS | `.nb-brand` (footer), `.nb-about` (popover rootClassName), `.nb-app-version` | consumers + `PoweredBy.test.tsx` |
| Fallback | missing plugin/key → "Powered by NocoBase" footer + built-in Help menu | asserted in `PoweredBy.test.tsx:51-60` |

**Refactor invariant:** env-driven brand config is a *third tier that sits above the plugin*,
not a replacement for it. Concretely, in `PoweredBy` (both runtimes) the resolution becomes:

```
customBrand (plugin)  →  used if present
else appInfo.brand    →  used if present   ← NEW tier, fed by env via app:getInfo
else hardcoded default                     ← unchanged
```

> Open question (needs confirmation during slice 1): should env brand *override* the plugin, or
> only fill in when the plugin is absent? The objective states "env 优先" (env first), which
> means **env > plugin > default**. The first slice will implement env-above-plugin and add a
> test asserting an env-set brand wins even when the plugin is installed. If this breaks a real
> downstream deployment, the order is a one-line flip — but the objective's wording is explicit.

### CSS-class asymmetry to preserve

`PoweredBy.test.tsx:56-59` asserts `.nb-brand` is **absent** in the v2 default branch and
**present** only in the custom branch (v1 applies it in both — pre-existing divergence). The
new env-brand tier must respect this: render `.nb-brand` only when the *plugin* branch is
taken, not when the env tier renders, so the existing test's class assertion still holds.

---

## 4. First Slice Definition (PoweredBy, v1 + v2)

Per the objective, the first slice unifies `PoweredBy` across both runtimes onto the env config
source. Concrete scope:

1. **Server**: add `brand` to `app:getInfo` in `plugin-client/src/server/server.ts`, read from
   `process.env.APP_BRAND_TITLE` and `APP_BRAND_HOMEPAGE_URL` (defaults to `undefined`, meaning
   "use client default"). Add the two vars to `.env.example`.
2. **v2 client**: `PoweredBy.tsx` default branch reads `appInfo.brand` when present before
   falling back to the hardcoded literal. Plugin branch unchanged.
3. **v1 client**: `powered-by/index.tsx` default branch mirrors the same resolution.
4. **Tests**: extend `client-v2/__tests__/PoweredBy.test.tsx` with (a) env-brand override wins,
   (b) env absent → default still "Powered by NocoBase", (c) plugin still wins over env? — see
   open question above. Add a new `client/src/user/__tests__/Help.test.tsx` and a brand-config
   regression test for v1 `powered-by`.
5. **Lint**: `yarn eslint --fix` on every touched file.
6. **Proof**: local boot with sample env brand config; screenshots of footer / Help menu /
   browser title / login page showing the custom brand and no "NocoBase" residual.
7. **Upstream-sync rehearsal**: `git merge` one recent upstream commit; confirm brand-file
   conflicts resolve in one round.

---

## 5. Upstream-Sync Conflict Risk Summary

Aggregate risk for the planned change set, to inform sync cadence:

- **Low risk (most of the work)**: `PoweredBy.tsx` (both), `powered-by/index.tsx`,
  `app:getInfo` handler, `.env.example`. These files are stable upstream; conflicts will be
  rare and mechanical.
- **Medium risk**: `Help.tsx` / `HelpLite.tsx` — these churn more (menu items, styling). Any
  slice touching them should keep edits *additive* (read brand from `appInfo`, leave
  surrounding JSX untouched) so an upstream change to the menu merges cleanly.
- **Structural mitigation**: the refactor centralizes literals into the `app:getInfo` default
  builder. The fewer literal sites we leave in client components, the fewer places upstream
  can conflict with. This is the core reason the design is config-driven rather than
  inline-literal editing.

---

## 6. Open Prerequisites (blocking branch creation)

The objective's first step is "fork nocobase/nocobase, rename origin→upstream, add fork as
origin, branch `refactor/whitelabel-branding` from `upstream/main`". This cannot be completed
autonomously because:

- `origin` currently points at `https://github.com/nocobase/nocobase.git` (upstream itself),
  i.e. **no fork exists yet** in this workspace.
- `gh` CLI is not installed (`command not found: gh`), so the fork cannot be created from here.
- Creating a GitHub fork / changing the `origin` remote is an outward-facing, hard-to-reverse
  action that needs the operator's fork URL or explicit go-ahead.

**Needed from operator (one of):**
1. The fork's git URL (e.g. `https://github.com/<you>/nocobase.git`) so I can
   `git remote rename origin upstream && git remote add origin <fork>`, OR
2. Permission to install/use `gh` to create the fork, OR
3. Confirmation to proceed on a local branch (`refactor/whitelabel-branding`) without the
   remote reorg, deferring fork wiring until push time.

Until one of these is resolved, code changes stay uncommitted in the working tree and this
inventory stands as the deliverable. No `main` or `feat/workflow-webhook` commits will be made.
