# BRAND.md — White-Label Refactor Sync Manual

> Companion to `BRAND_INVENTORY.md`. This document is the **operational manual** for
> keeping the white-label refactor in sync with `nocobase/nocobase` upstream.
> Read this before every upstream merge.

The white-label refactor lives on branch `refactor/whitelabel-branding`. Its single
goal: make every user-visible brand surface read from one config source (env →
plugin-custom-brand → default) so the product can be rebranded without editing code,
**without touching any license or copyright header**.

---

## 1. Fork → merge workflow

### 1.1 One-time setup (do this once)

```bash
# The repo ships with `origin` pointing at upstream nocobase itself. Rename it
# to `upstream`, then add YOUR fork as the new `origin`.
git remote rename origin upstream
git remote add origin https://github.com/<your-account>/nocobase.git

# Verify
git remote -v
# origin    https://github.com/<your-account>/nocobase.git (fetch/push)
# upstream  https://github.com/nocobase/nocobase.git       (fetch/push)
```

> **Status of this workspace:** the fork does not exist yet and `gh` is not
> installed, so this step is deferred (see `BRAND_INVENTORY.md` §6). All work so
> far is on a local `refactor/whitelabel-branding` branch off `origin/main`; nothing
> has been pushed. Complete §1.1 before first push.

### 1.2 Per-sync routine (every time you merge upstream)

```bash
# 1. Fetch the latest upstream.
git fetch upstream

# 2. Make sure you're on the refactor branch.
git checkout refactor/whitelabel-branding

# 3. Merge upstream/main. Use --no-ff so the merge is explicit and visible.
git merge --no-ff upstream/main

# 4. If there are conflicts → resolve them (§4 has a worked example), then:
git mergetool            # or edit by hand
git add <resolved files>
git commit               # completes the merge

# 5. Run the brand verification gate (§3). Fix until green.
yarn eslint --fix <brand files>          # see §2 for the file list
yarn test packages/core/client-v2/src/__tests__/PoweredBy.test.tsx --run
yarn test packages/core/client/src/powered-by/__tests__/PoweredBy.test.tsx --run

# 6. Confirm license/copyright zero-change invariant (§5).
git diff upstream/main...HEAD --name-only | grep -iE 'LICENSE|copyright'   # must be empty

# 7. Push to your fork.
git push origin refactor/whitelabel-branding
```

---

## 2. Brand file list (the surface area to watch on every merge)

These are the files the refactor owns. On every upstream merge, check whether
upstream touched any of them — those are the only merge conflicts that need
brand-specific judgment.

| File | Role | Conflict risk | If upstream changes it |
|---|---|---|---|
| `packages/core/client-v2/src/components/PoweredBy.tsx` | v2 footer brand resolution (env > plugin > default) | **Low** — the refactor keeps the `brandStyle` block and plugin branch unchanged; it only *adds* an env branch. Upstream edits to unrelated lines auto-merge (proven in §4.1). | Resolve by keeping the env branch; apply upstream's other edits verbatim. |
| `packages/core/client/src/powered-by/index.tsx` | v1 footer brand resolution | **Low** — same additive pattern. | Same. |
| `packages/core/client/src/appInfo/CurrentAppInfoProvider.tsx` | v1 `useCurrentAppInfo` type now has optional `brand` field | **Low** — additive optional field. | Keep the `brand?` field; merge upstream's other type changes. |
| `packages/plugins/@nocobase/plugin-client/src/server/server.ts` | `app:getInfo` now emits a `brand` block from `APP_BRAND_*` env | **Med** — upstream actively edits this handler (the `EXPORT_*` env pattern sits right next to the brand block). Adjacent edits conflict textually (worked example in §4.2). | Keep both blocks; the brand block reads `APP_BRAND_*`, upstream's reads its own var. One-round resolution. |
| `packages/core/test/setup/client.ts` | Guarded localStorage polyfill for vitest+jsdom | **Low** — upstream rarely edits test setup; the polyfill is a guarded no-op. | If upstream rewrites the setup, re-add the guarded polyfill block (it's self-contained). |
| `.env.example` | Documents `APP_BRAND_TITLE` / `APP_BRAND_HOMEPAGE_URL` | **Low** — additive section at end of a stable file. | Keep the white-label section; merge upstream's other vars. |

### Files the refactor does NOT own (leave to upstream)

- `packages/core/client/src/user/Help.tsx` and
  `packages/core/client-v2/src/flow/admin-shell/admin-layout/HelpLite.tsx` —
  listed in `BRAND_INVENTORY.md` as future slices (Help menu header name +
  links). **Not yet refactored in slice 1.** If upstream changes them, merge
  upstream's version untouched; the Help convergence is a later slice.
- Locale files (`src/locale/*.json` `FORMULAJS_DOC_URL`, `MATHJS_DOC_URL`) —
  frozen by constraint (i18n keys must not change). Deferred indefinitely.
- `packages/core/server/src/gateway/index.ts`, `packages/core/cli-v1/src/util.js`
  — optional pre-boot HTML injection layer; deferred (only needed if a
  pre-React-flash `document.title` is later required).

---

## 3. Per-sync verification gate (run after every merge)

Every item must pass before the merge is considered done.

1. **Lint** — `yarn eslint --fix` on every file in §2. Exit 0, no warnings.
2. **Unit tests (client, non-parallel-safe to run together but each file sequential):**
   - `packages/core/client-v2/src/__tests__/PoweredBy.test.tsx` — must be 7/7.
     Covers: default brand, env-brand override, env-over-plugin precedence,
     title-only fallback, custom-brand HTML + appVersion, undefined-version,
     appVersion HTML-escaping.
   - `packages/core/client/src/powered-by/__tests__/PoweredBy.test.tsx` — must be 3/3.
     Covers: default brand, env-brand override, title-only fallback.
3. **Regression spot-check** — run the appInfo provider test that the refactor's
   shared-setup polyfill fixed:
   `packages/core/client/src/appInfo/__tests__/CurrentAppInfoProvider.test.tsx` — 1/1.
4. **License/copyright invariant** (§5) — `git diff` must contain zero
   LICENSE/copyright-header changes.
5. **No hardcoded brand regression** — grep the two PoweredBy files for a stray
   literal that bypassed the config:
   ```bash
   # The only literal 'NocoBase' / 'nocobase.com' allowed is the *default* fallback
   # inside the resolution chain. Confirm no NEW literals appeared outside it.
   grep -nE "NocoBase|nocobase\.com" packages/core/client-v2/src/components/PoweredBy.tsx \
     packages/core/client/src/powered-by/index.tsx
   ```
   Acceptable: the `homePageUrls` map and the `NocoBase` default-fallback literal.
   Anything else is a regression.

---

## 4. Conflict-resolution examples (from the rehearsal)

The refactor's design rule — **add an env branch, never rewrite existing lines** —
is what keeps merges cheap. The rehearsal (`refactor/whitelabel-branding` against
synthetic upstream commits) confirmed both conflict shapes resolve in one round.

### 4.1 Clean auto-merge (most common)

**Scenario:** upstream adds `padding: 8px 0;` to the `brandStyle` CSS block in
`PoweredBy.tsx`.

**Result:** `git merge` auto-merged with **no conflict**. The refactor kept the
`brandStyle` block byte-for-byte identical to upstream's base, so git's 3-way
merge applied the padding line cleanly while the env branch (added elsewhere in
the file) was untouched.

**Lesson:** never reformat or reorder existing lines in the brand files. Add new
branches/lines only. That preserves auto-mergeability.

### 4.2 Adjacent-edit conflict (one-round resolution)

**Scenario:** upstream adds a new `APP_MAX_UPLOAD_SIZE` env block immediately
before `ctx.body = info` in `server.ts` — exactly where the refactor's `brand`
block lives.

**Conflict:**
```
          if (process.env['EXPORT_ATTACHMENTS_AUTO_MODE_THRESHOLD']) {
            info.exportAttachmentsAutoModeThreshold = parseInt(process.env['EXPORT_ATTACHMENTS_AUTO_MODE_THRESHOLD']);
          }

<<<<<<< HEAD
          // Operator-set white-label brand config. ...
          const brandTitle = process.env['APP_BRAND_TITLE'];
          const brandHomepageUrl = process.env['APP_BRAND_HOMEPAGE_URL'];
          if (brandTitle || brandHomepageUrl) {
            info.brand = {
              ...(brandTitle ? { title: brandTitle } : {}),
              ...(brandHomepageUrl ? { homepageUrl: brandHomepageUrl } : {}),
            };
=======
          if (process.env['APP_MAX_UPLOAD_SIZE']) {
            info.maxUploadSize = parseInt(process.env['APP_MAX_UPLOAD_SIZE']);
>>>>>>> tmp/upstream-hard
          }

          ctx.body = info;
```

**Resolution (one round):** keep **both** blocks — they are independent env reads.
Remove the markers:
```ts
          if (process.env['APP_MAX_UPLOAD_SIZE']) {
            info.maxUploadSize = parseInt(process.env['APP_MAX_UPLOAD_SIZE']);
          }

          // Operator-set white-label brand config. ...
          const brandTitle = process.env['APP_BRAND_TITLE'];
          const brandHomepageUrl = process.env['APP_BRAND_HOMEPAGE_URL'];
          if (brandTitle || brandHomepageUrl) {
            info.brand = {
              ...(brandTitle ? { title: brandTitle } : {}),
              ...(brandHomepageUrl ? { homepageUrl: brandHomepageUrl } : {}),
            };
          }

          ctx.body = info;
```
Then `git add`, `git commit`, re-lint, re-test. Confirmed clean (no markers,
eslint exit 0) in the rehearsal.

**Lesson:** the `app:getInfo` handler is the highest-risk file because upstream
keeps adding `process.env.X` reads there. Resolution is always "keep both blocks"
— the brand block is self-contained and order-independent relative to the other
env reads.

---

## 5. License / copyright zero-change invariant (HARD CONSTRAINT)

This is non-negotiable and must be verified on every merge:

```bash
# After merging upstream, confirm NO license or copyright-header file changed
# as a result of the merge resolution.
git diff upstream/main...HEAD --name-only | grep -iE 'LICENSE|copyright'
# Expected: empty output.
```

The white-label refactor touches **only user-visible brand surfaces**. It must
never:
- modify `LICENSE.txt` or `LICENSE-APACHE.txt`,
- modify any source file's `Copyright (c) ... NocoBase Co., Ltd.` header,
- replace, append to, or delete copyright header lines.

If an upstream merge ever produces a conflict in a license/copyright file,
**stop and request explicit authorization** — do not resolve it unilaterally.
(Pause condition per the objective.)

---

## 6. Slice roadmap (what's done, what's next)

| Slice | Scope | Status |
|---|---|---|
| **1** | `PoweredBy` (v1 + v2) unified onto env config source; `app:getInfo` emits `brand`; env.example; tests; shared-setup polyfill | **Done** — commit `3d898674a3`, 7+3 tests green, lint clean, sync rehearsal passed. |
| 2 | `Help.tsx` (v1) + `HelpLite.tsx` (v2): header name + Home/Handbook/License links read from `appInfo.brand` (new env keys `APP_BRAND_DOCS_URL`, `APP_BRAND_AGREEMENT_URL`) | Planned. Medium conflict risk — keep edits additive (read brand from `appInfo`, leave menu JSX intact). |
| 3 | `Markdown.Void.tsx` syntax-reference link → `appInfo.brand.docsUrl` | Planned. Low risk. |
| — | Locale `FORMULAJS_DOC_URL` / `MATHJS_DOC_URL` | **Deferred** — i18n keys are frozen by constraint. |

Each slice follows the same loop: converge one exposure point → lint → run its
tests → commit → run §3 gate. Never batch multiple exposure points in one commit.

---

## 7. Quick reference: the resolution chain

```
┌─ app:getInfo `brand` ──────────────┐
│  set by APP_BRAND_TITLE             │   WINS (operator override)
│  + APP_BRAND_HOMEPAGE_URL (env)     │
└─────────────────────────────────────┘
               │  (absent)
               ▼
┌─ @nocobase/plugin-custom-brand ─────┐
│  options.options.brand / .about     │   commercial plugin (not in this repo)
└─────────────────────────────────────┘
               │  (absent)
               ▼
┌─ hardcoded default ─────────────────┐
│  "Powered by NocoBase" +            │   the only literal that may remain
│  nocobase.com URL map               │
└─────────────────────────────────────┘
```

Env keys (slice 1): `APP_BRAND_TITLE`, `APP_BRAND_HOMEPAGE_URL`.
Future slices add: `APP_BRAND_DOCS_URL`, `APP_BRAND_AGREEMENT_URL`.
