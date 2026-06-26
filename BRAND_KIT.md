# RealTrack by Ascendyaa — Brand Kit

RealTrack is an **Ascendyaa** product. The app wears Ascendyaa's identity: a dark,
black-luxury aesthetic built on a single purple→blue gradient, with the
ascending "A" mark as the signature. This is the source of truth for the brand
as applied in-app.

## Name & lockup

- **Product name:** RealTrack
- **Parent brand:** Ascendyaa
- **Lockup:** "RealTrack" wordmark (Sora) with a smaller **"by Ascendyaa"** tag.
- The ascending **"A" mark** (`/ascendya-mark.svg`) sits to the left of the
  wordmark. Favicon / tab icon: the "A" mark on a deep-panel tile (`app/icon.svg`).

## Logo

| Asset | File | Use |
| --- | --- | --- |
| Primary mark | `public/ascendya-mark.svg` | Nav, sidebar, auth, footer, in-app lockups |
| App icon / favicon | `app/icon.svg` | Browser tab, PWA, bookmarks |

The mark is always rendered in the brand gradient. Keep clear space around it
equal to the width of the slanted stroke. Never recolor it to a flat fill,
stretch it, or place it on a busy background.

## Color

The brand variable names live in `app/globals.css` (`:root`); `tokens.ts`
resolves to them at paint time, so the whole app themes from there.

| Role | Hex | Notes |
| --- | --- | --- |
| Ink / canvas | `#000000` | Page background — true black |
| Panel | `#0A0A0E` | Cards, sidebar, surfaces |
| Panel 2 | `#101018` | Inputs, raised rows |
| Text | `#F4F4FF` | Primary text (near-white, cool) |
| Muted | `#9A9AB0` | Secondary text |
| Muted dim | `#6C6C82` | Tertiary / labels |
| Line | `rgba(255,255,255,.08)` | Hairline borders |
| Line strong | `rgba(255,255,255,.16)` | Emphasis borders |
| **Purple** | `#6B3FA0` | Gradient start |
| **Blue** | `#3B82F6` | Gradient end / primary solid accent |

**Brand gradient:** `linear-gradient(120deg, #6B3FA0 0%, #3B82F6 100%)` —
primary buttons, the "A" mark, eyebrow rules, gradient text, and active states.

Semantic accents on the dark theme: success/excellent → blue `#3B82F6`,
on-track/mid → amber `#F59E0B`, attention/needs-coaching → rose `#FB7185`.

## Typography

| Role | Family | Weights |
| --- | --- | --- |
| Display / headings | **Sora** | 400 / 600 / 700 / 800 |
| Body / UI | **Manrope** | 400 / 500 / 600 / 700 |
| Mono / metrics | JetBrains Mono | 400 / 700 |

Headings: tight tracking (`-0.02em`), heavy weight. Eyebrows: uppercase, wide
tracking (`0.32em`), muted, preceded by a short gradient rule.

## Voice

- **Tagline:** *Elevate. Evolve. Excel.*
- **Theme:** the climb — steady, deliberate upward growth ("ascending").
- Confident, premium, operator-to-operator. Short lines. No fluff.

## Usage in this app

- Theme is driven entirely by CSS variables in `app/globals.css`. Re-skinning =
  remapping those values; do not hardcode brand colors in components.
- Fonts are wired in `app/layout.tsx` via `next/font` onto the existing CSS-var
  names (`--font-geist-sans` = Manrope, `--font-bricolage`/`--font-display` =
  Sora, `--font-geist-mono` = JetBrains Mono).
