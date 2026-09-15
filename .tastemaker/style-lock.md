# Chekki Lead Gen — style lock

## Revision history
- **v2 (current)**: Superseded v1. User pointed at the real Chekki-AI app
  repo (github.com/Jay02510/Chekki-AI) and asked for something that
  actually looks like it, not just brand-colored. That repo already had
  its own `.tastemaker/style-lock.md` + `DESIGN.md` ("The Warm Console")
  — ported those tokens directly rather than re-deriving a palette from
  chekkiai.com's marketing CSS. Full dark-mode "instrument panel" theme,
  double-bezel cards, orange-only accent, black (not white) text on the
  orange button fill.
- v1 (superseded): light theme, indigo→orange-700 recolor of Tailwind
  defaults, derived from chekkiai.com's own shipped CSS. Kept for
  reference only — not what's live now.

## Screen classification
App shell / data view (dashboard) — same classification Chekki-AI's own
style-lock uses for its director portal / TeacherPage shell. Not a
marketing page — no hero, no scroll narrative, no macrostructure step.

## Source of truth
Ported verbatim from Chekki-AI's own `DESIGN.md` + `.tastemaker/style-lock.md`
(fetched 2026-09-15). Those files record real contrast checks already run
against production tokens — not re-verified here, reused as-is per
tastemaker's Step 0 rule ("this project already has an established style,
reuse those exact tokens, don't re-derive").

## Palette (dark, the mode actually shipped here)
- Background: `#050505` (`--color-brand-dark`) — page base
- Surface: `#0f1014` (`--color-brand-card`) — cards/panels
- Primary/Accent: `#f97316` (`--color-brand-orange`) — the ONE accent:
  CTAs, active states, focus, tinted glows. Never combined with
  purple/pink/indigo (Chekki-AI's "One Accent Rule" — a past drift
  incident there, worth not repeating here either).
- Button label on primary fill: **black**, not white — Chekki-AI's own
  audit found white-on-orange-500 fails WCAG (2.8:1); black passes at
  7.49:1. Copied their verified pairing.
- Text primary: zinc-100 `#f4f4f5`. Text muted: zinc-400/500.
- Border: `border-white/10` hairline throughout.
- Elevated hover tint (reserved for hover-only states on interactive
  cards, not used generally): `#0f0814`

## Shape language
- **Double-bezel construction** on every panel that reads as a discrete
  surface (Search card, Bulk Sweep card, LeadCard, EmailDraftCard):
  outer `rounded-[2rem] border border-white/10 p-1.5`, inner
  `bg-brand-card rounded-[calc(2rem-0.375rem)]` with a
  `shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]` lit top edge. Ambient
  shadow on the outer shell (`shadow-[0_20px_50px_rgba(0,0,0,0.35)]`) —
  soft/large-blur, never a hard drop-shadow, per Chekki-AI's shadow
  vocabulary.
- Buttons: `rounded-full` for primary actions (Search, Run Bulk Sweep,
  Save to Database, Open in Gmail — matches Chekki-AI's "rounded-full for
  primary/pill actions" rule), `rounded-lg`/`rounded-xl` for
  secondary/ghost actions.
- Secondary/ghost buttons: low-opacity orange fill (`bg-orange-500/10
  border-orange-500/30 text-orange-400`) or neutral white-tint
  (`bg-white/5 border-white/10`) for non-accent actions — same pattern
  Chekki-AI uses.
- Nav pills (Search/Database tabs): active = `bg-orange-500/10
  border-orange-500/30 text-orange-500` (their sidebar-active-item
  treatment, ported to a top pill nav here since this app only has 2
  destinations — a full sidebar would be over-building for that).
- `active:scale-[0.97]` press feedback on every pressable element.

## Type
Same as v1: Onest (`--font-sans`) body, Bricolage Grotesque
(`--font-display`) headings, Noto Sans KR added as `--font-korean` utility
(Chekki-AI has this exact token) plus folded into the base sans stack.
`break-keep` applied to Korean-bearing display/title text and the email
draft's Korean body — Chekki-AI's "Break-Keep Rule," so Korean line-wraps
by word/syllable-block, not mid-character.

## Motion
Existing `motion/react` fade/slide entrances, now gated with
`useReducedMotion()` in App.tsx (was a real gap — Chekki-AI's own lock
logs the identical gap in one of their modals as "a real, honestly-logged
gap," so worth actually closing here rather than repeating it).
`audit_motion.py` still flags LeadCard.tsx/EmailDraftCard.tsx for
"missing reduced-motion branch" — false positive, those files only have
a CSS `transition-colors` hover state, no real motion library usage, not
worth gating.

## What this pass did NOT do
- No sidebar restructure — kept the existing top-pill nav, just
  reskinned its active/inactive states to Chekki-AI's tinted-pill
  pattern. A full `<aside>` sidebar (their pattern for 5+ nav items) would
  be over-building for this app's 2 destinations.
- No light-mode companion for this theme — Chekki-AI has one, documented
  in their lock, but wasn't asked for here; dark is the only mode shipped.
- No changes to amber (priority/insight) or emerald (saved/success)
  semantic colors, beyond opacity-tinting them for the dark background
  (`bg-amber-500/10 text-amber-400` etc.) — same colors, dark-mode-safe
  treatment.
