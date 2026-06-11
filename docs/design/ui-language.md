# Conek AI Design Language — "Calm Industrial"

> The codified UI/UX guide. Every new surface follows this. Inspirations researched:
> Linear (rationed accent, warm monochrome, weight-precision typography), simple-ai.dev
> (generous radii, soft depth), Claude Desktop (frameless calm, content-first),
> Notion (sharing model, sidebar tree), Raycast (keyboard-first density).

## 1. Concept

A-SAFE makes industrial safety equipment: **calm, engineered, impossible to misread**.
The interface mirrors the product philosophy — *flexible polymer, not rigid steel*:
soft radii and motion that absorbs, but engineered precision underneath.
Two registers:

- **Zen register** (end users): almost nothing on screen. New Chat, the composer, their work.
- **Operator register** (admins/editors): density allowed, but the same calm bones.

## 2. Color — rationed teal

Linear rations its acid lime to one filled action per screen. We do the same with
Conek teal (sampled from the Conek mark):

| Role | Value | Rule |
|---|---|---|
| Accent | `#3ABFC6` (`--primary`, hsl(183 55% 50%) — exact Conek Rails token) | **One filled teal element per view** — the primary action, the running-pulse dot, or the active badge. Never two. |
| Accent hover | `#2BA6AD` | darker, never lighter |
| Ink | `#0A3438` (`--primary-foreground`, oklch 0.299 0.045 204) | text on teal is always dark teal ink — white on `#3ABFC6` is ~2.2:1 and fails WCAG; the ink hits 6.0:1 |
| Teal as text (light mode) | `#0E7C83` | the readable teal for text on white (4.97:1); raw `#3ABFC6` is decoration-only on light backgrounds |
| Neutrals | warm gray scale (existing tokens) | everything else lives here; borders at 1px, low-alpha |
| Status | green ok / amber waiting / red failed | only inside status pills, never as washes |

Backgrounds get atmosphere from the existing rays + pellet particles — never flat
washes of color, never purple gradients.

## 3. Typography — precise, not loud

- **Body/UI**: `Schibsted Grotesk` — crisp grotesk with warmth; replaces Geist Sans.
  UI weight 500 ("precise but not bold", the Linear trick), body 400.
- **Display** (greetings, page titles, splash, empty states): `Bricolage Grotesque`
  via `--font-display` / `.font-display` — characterful at large sizes, tracking -2%.
- **Mono**: Geist Mono stays (ids, transcripts, cron, code).
- Headlines whisper: prefer weight 500–600 at larger sizes over 700+ at small sizes.

## 4. Shape & depth — simple-ai rounded

- Radius scale: base `--radius: 1rem`; cards `rounded-2xl`, pills/inputs full.
- Depth = 1px inset border + soft shadow (`shadow-sm`), never heavy drop shadows.
- Surfaces stack by *border + 2% tint*, not elevation theater.

## 5. Motion — flex, absorb, reform

The barrier metaphor, literally:
- Interactions compress slightly (`scale(0.98)`) and spring back — `cubic-bezier(0.2, 0.9, 0.3, 1.2)`.
- One orchestrated entrance per page (staggered 40ms fade-up), not scattered micro-noise.
- Long-running things breathe: the teal pulse dot (Runs) is the canonical "alive" signal.
- Durations: 150ms hover, 300ms layout, 500ms entrance. Nothing over 600ms except splash.

## 6. Layout

- Content column max-w-3xl for reading surfaces; admin tables may go wide.
- Generous negative space in the zen register; whitespace IS the hierarchy.
- Empty states: one display-font line, friendly, no illustration clutter
  (e.g. "All clear — nothing needs your sign-off right now.").

## 7. Component rules

- Buttons: one teal primary per view; secondary = ghost/outline neutral.
- Badges/pills: lowercase-calm, tinted bg at 10–15% alpha + readable foreground.
- Tables: row hover tint, no zebra; numeric columns right-aligned, mono for ids/costs.
- Dialogs: rounded-2xl, single clear primary, escape always works.
- Comboboxes over raw selects for anything with >6 options or search (MCP teams pattern).
- Every async surface has skeletons matching final geometry (no spinners-in-space).

## 8. Voice

Calm, specific, no exclamation marks in UI chrome. Cost and consequences stated
plainly before actions ("~$0.40 · charged to Engineering budget").
