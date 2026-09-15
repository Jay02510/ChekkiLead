# Chekki Lead Gen — style lock

## Screen classification
App shell / data view (dashboard). Not a marketing page — no hero,
no scroll narrative, no macrostructure/diversification rules apply.
Skip Step 2.5 and heavy Step 3 asset curation on future passes here.

## Source of truth
Brand tokens extracted directly from chekkiai.com's own shipped CSS
(`main-D1SZnYrh.css`) and meta tags — not an image extraction, the real
values. Re-fetch if chekkiai.com rebrands before reusing these.

## Palette (light mode, Tailwind default scales — no custom color config needed)
- text: zinc-900 `#18181b`
- bg: white `#ffffff`
- surface: zinc-50 `#fafafa`
- border: zinc-200 `#e4e4e7`
- primary (buttons, active tab, links, focus): orange-700 `#c2410c`
  - NOT orange-600/500 for text or button fills — see Color contract below.
- primary tint (badge bg): orange-50 `#fff7ed`, text orange-700
- accent/success: emerald (Tailwind default emerald-500/700/50) — already
  matches chekkiai.com's #10b981/#009767 almost exactly, no override needed
- brand mark (logo tile only): custom `--color-brand: #fe6e00` in
  src/index.css — chekkiai.com's exact hero orange, decorative/logo-exempt
  use only, fails the 3:1 non-text floor against white so never use it for
  buttons, links, or icons that carry meaning
- amber (priority=3 badge, Fit Reason/Agent Notes panel in LeadCard): left
  unchanged, deliberately not remapped to brand orange — keeps "insight/
  warning" visually distinct from "brand action" now that primary is orange

## Color contract (from check_contrast.py --matrix, text=#18181b bg=#ffffff surface=#fafafa primary=#c2410c accent=#009767 border=#e4e4e7 on-primary=#ffffff)
- Text-safe (>=4.5, use for body/links/button labels): text/bg, text/on-primary,
  text/surface, text/border, bg/primary, primary/on-primary, surface/primary,
  text/accent
- UI-safe (>=3.0, large text/icons/state borders only): primary/border,
  bg/accent, accent/on-primary, surface/accent, text/primary
- Decorative (<3.0, hairlines only, never the sole state indicator):
  accent/border, primary/accent, bg/border, border/on-primary, surface/border

Key gotcha this project already hit: orange-600 (`#ea580c`) as text-on-white
or button-fill-with-white-text is only 3.56:1 — fails. Always use orange-700
for anything text-bearing; orange-500/600 stay fine for icons, focus rings,
and other non-text decoration only.

## Type
- `--font-sans`: "Onest", "Noto Sans KR", ui-sans-serif, system-ui, sans-serif
  — Noto Sans KR is in the base sans stack, not just display, because this
  app's UI and generated content (search queries, email drafts) is
  bilingual EN/KR throughout, not just headings.
- `--font-display`: "Bricolage Grotesque", "Noto Sans KR", ui-sans-serif, sans-serif
  — applied via `font-display` class on section h2/h3 headings and the
  LeadCard institution name (the card's visual anchor). NOT applied to
  small uppercase eyebrow labels (h4s like "Contact Info", "Subject Line")
  — a display face reads wrong at that size/weight.
- `--font-mono`: unchanged (JetBrains Mono, used for Naver IDs / raw data)

## Radius / spacing
Unchanged — app already used rounded-xl/2xl (12px/16px), which already
matches chekkiai.com's `--radius-xl`/`--radius-2xl` tokens. No changes made.

## Dark mode
Not implemented. chekkiai.com itself is dark-mode-first, but this is a
long-session data-dense internal tool (search results, lead tables, email
drafts) — defaulted to light for scan-ability, matching the app's pre-
existing light-only design. Revisit only if explicitly requested.

## Assets / motion
No new assets sourced (no photos/illustrations needed for a dashboard).
Icons: kept the existing lucide-react set already used throughout — no
reason to introduce a second icon library. Motion: kept the app's existing
`motion/react` fade/slide transitions; fixed two pre-existing `transition-all`
instances (App.tsx) to named `transition-colors` while in the area, per the
anti-slop motion gate.

## What changed vs. pre-existing design
Indigo → orange-700 (buttons/active-tab/links, hover states orange-800,
decorative uses orange-600, tints orange-50/100/200/300). Slate → zinc
(1:1 rename, same lightness scale, brand uses zinc not slate). Everything
else (amber priority/insight color, emerald saved/success color, layout,
spacing, component structure) left as-is — this was a rebrand pass, not a
redesign.
