# FinatriX Design System

The shared visual language every page uses. Source of truth: **`src/styles/tokens.css`**
(loaded first in `main.tsx`). Everything below already matches what the app renders — adopting
tokens is a refactor, not a redesign.

---

## 1. Design tokens (`src/styles/tokens.css`)

All tokens are CSS custom properties on `:root`. The tools/careers layer (`.fx-tools`) now
**references** these instead of declaring its own copies, so there is one source of truth.

### Surfaces (elevation ladder)
`--surface-base` `#060607` (app) · `--surface-1` `#0A0A0A` (tools canvas) ·
`--surface-2` `#121214` (card) · `--surface-3` `#141416` (dialogs) · `--surface-footer` `#070707`.

### Ink (text)
`--ink` `#F5F5F0` · `--ink-2` `#9c9c96` · `--ink-3` `#8b8b90` (muted, WCAG-AA on dark) ·
`--ink-inverse` `#0A0A0A` (on gold).

### Accent & status
`--accent` `#D4AF37` · `--accent-strong` `#F1C40F` · `--accent-soft` `#F0D779` · `--accent-bg`.
Status/data: `--status-info` `--status-success` `--status-warn` `--status-danger` `--data-purple` `--data-teal`.
Gold gradient stops: `--gold-grad-1…4`.

### Structure
Hairlines `--hairline` / `--hairline-2`. Radius `--radius-sm|md|lg|xl|2xl|pill` (8→24px, 980px).
Spacing `--space-1…16` (4px grid). Elevation `--shadow-1|2|3|gold`.

### Motion
Easings `--ease-standard` (default), `--ease-out`, `--ease-spring`.
Durations `--dur-fast` 200ms · `--dur-med` 420ms · `--dur-slow` 680ms.

### Focus & z-index
`--focus-ring-width|color|offset` (color = accent). `--z-header|dropdown|modal|toast`.

---

## 2. Tailwind mapping

Named Tailwind colours mirror the tokens (in `tailwind.config.js`): `app` `void` `surface` `gold`
`gold-bright` `dim` `offwhite`. **Migration guide** — replace hardcoded arbitrary values with the
named token (identical output):

| Old (arbitrary) | New (token) |
|---|---|
| `text-[#D4AF37]` | `text-gold` |
| `bg-[#D4AF37]` / `border-[#D4AF37]` | `bg-gold` / `border-gold` |
| `bg-[#F1C40F]` | `bg-gold-bright` |
| `text-[#F5F5F0]` | `text-offwhite` |
| `text-[#8A8A8A]` | `text-dim` |
| `bg-[#060607]` | `bg-app` |

Do these incrementally, per component, verifying visually — never a blind repo-wide sweep.

---

## 3. Accessibility foundation (`src/index.css`)

- **Focus-visible:** a token-driven 2px accent ring on every focusable element (`*:focus-visible`).
- **Reduced motion:** a global `@media (prefers-reduced-motion: reduce)` safety net near-zeroes all
  animation/transition durations, on top of per-effect opt-outs. (WCAG 2.2 SC 2.3.3.)
- **High contrast:** `@media (prefers-contrast: more)` lifts muted inks (`--ink-2/-3`) and hairlines
  toward AAA. Because tools/careers inherit the canonical tokens, this one block covers the whole app.
- Contrast: body text ≥ 4.5:1 (AA); muted `--ink-3` verified ≥ 4.5:1 on dark surfaces.

---

## 4. Primitives

Composition-first: a variant contributes its canonical class; `className` is appended verbatim, so
call sites migrate with **byte-identical output**.

### `Button` (`src/components/Button.tsx`)
`variant`: `gold` (primary → `fx-btn-gold`) · `ghost` (`fx-btn-ghost`) · `subtle` · `plain`.
Always a real `<button>` with explicit `type="button"` default. Forwards all button/aria props.
```tsx
<Button variant="gold" onClick={save}>Save</Button>
<Button variant="ghost" className="w-full">Cancel</Button>
```

### `Badge` (`src/components/Badge.tsx`)
`tone`: `neutral` · `gold` · `success` · `info` · `warn` · `danger` (token-driven colours).
Decorative by default; pass `role="status"` for live state.
```tsx
<Badge tone="gold">New</Badge>
<Badge tone="success" role="status">Saved</Badge>
```

Both are covered by `src/test/primitives.test.tsx`.

---

## 5. State conventions

- **Loading:** branded `RouteFallback` (route chunks) + `.fx-tools` skeletons; `role="status"`,
  motion-safe.
- **Empty:** clear one-line guidance (e.g. Expense Tracker "Nothing logged yet"); prefer a small icon.
- **Error:** `ErrorBoundary` (graceful fallback + privacy-safe telemetry); inline form errors via a
  custom styled message layer, not native tooltips.
- **Success:** toast (`src/tools/ui/Toast.tsx`) / inline confirmation.

---

## 6. Adoption policy

New and refactored components consume tokens (`var(--…)` or the Tailwind names) and the primitives —
never new hardcoded hex. This phase built the **system**; call-site migration is incremental and
visually verified, one surface at a time. No page-by-page redesign is implied here.
