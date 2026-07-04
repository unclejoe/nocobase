# Dark Mode / Theme Guidelines

This document explains how to write theme-aware UI in NocoBase so that components
render correctly in **light, dark, and compact-dark** themes. It exists because a
large batch of JSBlockModel cards and two framework components hardcoded
light-mode colors and were unreadable in dark mode.

## TL;DR — The One Rule

> **Never hardcode colors. Always derive surface/text colors from antd design
> tokens via `theme.useToken()` (React components) or `token` (cssinjs style hooks).**

If you write `#ffffff`, `#f0f0f0`, `rgb(0,0,0,0.85)`, `'white'`, or a light
`linear-gradient(...)`, it will look wrong in dark mode. Use the matching token
instead.

---

## Why this matters

NocoBase ships three built-in themes (Light, Dark, Compact Dark) and users can
create custom themes. Themes work by swapping antd **design tokens** —
`token.colorBgContainer`, `token.colorText`, `token.colorBorderSecondary`, etc.
**Any component that reads these tokens re-renders automatically when the theme
changes.** Any component that hardcodes a hex value is frozen on that color
regardless of theme, producing white-on-white or dark-on-dark messes.

---

## For JSBlockModel (user-authored JS code blocks)

JSBlockModels run user-authored JS stored in the `flowModels` table. To make a
JSBlock card theme-aware:

### 1. Pull `theme` from antd

```js
const { Button, Card, Tag, Typography, theme } = ctx.libs.antd;
//                                                ^^^^^
```

### 2. Call `theme.useToken()` inside the component body

`useToken()` is a React hook — it must run inside a React component function,
and it returns the reactive token object:

```js
function MyCard({ items }) {
  const { token } = theme.useToken();
  // token.colorBgContainer, token.colorText, token.colorBorderSecondary, ...
  return <Card style={{ background: token.colorBgContainer }}>...</Card>;
}
```

For blocks that use top-level `await` + direct `ctx.render(<JSX/>)` (no
component wrapper), wrap the JSX in a small inline component:

```js
const { theme } = ctx.libs.antd;
const MySurface = () => {
  const { token } = theme.useToken();
  return <div style={{ color: token.colorText }}>...</div>;
};
ctx.render(<MySurface />);
```

### 3. Replace every hardcoded color with the matching token

| Hardcoded (light-only) | Token | Common use |
|---|---|---|
| `'#ffffff'`, `'white'`, `'rgb(255,255,255)'` | `token.colorBgContainer` | card background |
| `'#fafafa'`, `'#f5f5f5'` | `token.colorFillQuaternary` | subtle sub-card / table header fill |
| `'#f0f0f0'`, `'#e5e7eb'`, `'#dbe7f3'` | `token.colorBorderSecondary` | borders |
| `'#0f172a'`, `'#334155'`, `'rgb(0,0,0,0.85)'` | `token.colorText` | primary text |
| `'#64748b'`, `'rgb(0,0,0,0.45)'` | `token.colorTextSecondary` | secondary text |
| `'#94a3b8'`, `'rgb(0,0,0,0.35)'` | `token.colorTextTertiary` | tertiary/label text |
| `borderRadius: 20` / `14` | `token.borderRadiusLG` | card radius |
| light shadow `rgba(15,23,42,0.04)` | `token.boxShadowCard` | card shadow |

**Semantic colors that carry meaning (status: green/blue/red, priority tags,
progress bars) should NOT be tokenized** — those stay as fixed hex values so
"completed = green" means the same thing in every theme. Only neutral surface
and text colors should become tokens.

### 4. Colors embedded in larger strings

When a color sits inside a CSS shorthand, use a template literal so the token
value interpolates rather than becoming literal text:

```js
// WRONG — produces the literal string "token.colorBorderSecondary"
border: '1px solid token.colorBorderSecondary',

// RIGHT — template literal interpolates the value
border: `1px solid ${token.colorBorderSecondary}`,

// RIGHT — gradient
background: `linear-gradient(180deg, ${token.colorBgElevated} 0%, ${token.colorBgContainer} 100%)`,
```

---

## For framework / plugin source code (`.tsx`, `.ts`)

The same rule applies. Use `theme.useToken()` inside React components, or read
the `token` parameter inside `genStyleHook` style hooks. The `useGlobalTheme()`
hook (`packages/core/client-v2/src/theme/index.tsx`) exposes `isDarkTheme` for
cases where you must pass a theme name to a third-party library:

```ts
import { useGlobalTheme } from '../../../theme';
const { isDarkTheme } = useGlobalTheme();
// e.g. Vditor editor needs an explicit 'dark'/'classic' theme string
new Vditor(el, { theme: isDarkTheme ? 'dark' : 'classic', ... });
```

For cssinjs style hooks (`genStyleHook`), the `token` is already the first arg:

```ts
export default genStyleHook('nb-my-component', (token) => ({
  '.my-header': { backgroundColor: token.colorFillQuaternary },  // not '#f6f8fa'
}));
```

---

## Quick self-check before shipping a UI

1. Search your code/JS for `#`, `rgb(`, `rgba(`, `'white'`, `linear-gradient`.
2. For each hit, ask: is this a **semantic** color (status, brand) or a
   **neutral surface/text** color?
3. Every neutral surface/text color must come from a token. If it doesn't,
   refactor it.
4. Open the page in both Light and Dark themes and confirm readability.

---

## Replaying the dark-mode fixes after a DB restore

The JSBlockModel fixes live in the database, not in git. If you restore a
database backup from before the fixes were applied, the hardcoded colors return.

To re-apply all fixes:

```bash
PGPASSWORD=nocobase python3 scripts/theme-replay/replay-jsblock-darkmode-fixes.py
```

The script is **idempotent** — it skips nodes that already contain `useToken`.
It restores fixed code for 123 nodes across these component families:
OverdueTicketPanel, MiniCard, PagedListPanel, LeadLifecycleCard,
QuotationLifecycleCard, OrderWorkflowCard, QuotationDetailPreview,
OrderDetailPreview, QuotationConfigurator (Add quotation page),
Quotation table summary and Orders table summary (TableBlockModel
runJs renderers), the Invoices table summary, the Projects table
summary (status / priority / budget / progress renderer), the project
header / milestone timeline wrappers, and the Orders Guide panel.

The **source-level** fixes (plugin-comments cssinjs + Markdown Vditor dark theme)
are in git (commits `37387829cb`, `fea0e28885`) and do not need replaying.

See `scripts/theme-replay/replay-jsblock-darkmode-fixes.py` for details.
