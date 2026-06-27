# LETSSKIPTRACE — Logo Kit

Logo variants extracted from the real LETSSKIPTRACE brand assets (Google Drive
`assets/` folder + `css/`). Open **`preview.html`** / `preview.png` to see
everything at once.

Each logo is in `svg/` (scalable, self-contained) and `png/` (@3×, on its
intended background).

## The mark (the logo itself)
The real mark: a bold **"L" document shape with a magnifying glass** (containing
the LST monogram) — "trace / locate." It was vectorized from the brand's 512px
master with potrace (the brand's own `.svg` files are just PNGs wrapped in
`<image>`, so no true vector master existed).

| File | Use |
| --- | --- |
| `mark-white.svg` | White mark, for dark backgrounds. |
| `mark-black.svg` | Black mark, for light backgrounds. |
| `icon.svg` | App icon / favicon — white mark on a rounded `#0F0F0F` tile. |

## Brand name (wordmark)
Reproduced exactly from `style.css`: **Inter**, all-caps, letter-spacing
`-0.02em`, with `LETSSKIP` in **Inter SemiBold `#8A8A8A`** and `TRACE` in
**Inter Bold** (white on dark / black on light). Text is outlined to vector
paths, so the files need no font installed.

| File | Use |
| --- | --- |
| `wordmark-white.svg` | Dark backgrounds. |
| `wordmark-ink.svg` | Light backgrounds. |

## Logo with brand name (lockups)
Built to the real `.lockup` spec (mark height : wordmark size = 2 : 1, gap
`0.8×`).

| Orientation | Dark bg | Light bg |
| --- | --- | --- |
| **Horizontal** (mark left, name right) | `lockup-horizontal-white.svg` | `lockup-horizontal-ink.svg` |
| **Vertical** (mark on top, name below) | `lockup-vertical-white.svg` | `lockup-vertical-ink.svg` |

The horizontal lockup matches the brand's nav. The vertical lockup is
constructed in the same spirit (the brand kit didn't ship one).

## Colors (from `variables.css`)
| Role | Hex |
| --- | --- |
| Canvas | `#000000` |
| Surface (icon tile) | `#0F0F0F` |
| Text primary (TRACE) | `#FFFFFF` |
| Text secondary (LETSSKIP) | `#8A8A8A` |
| Accent blue | `#4F72FF` |
| Accent cyan | `#00D4FF` |
| Accent violet | `#7C3AED` |

The accents are used elsewhere in the brand (buttons, labels) — **not** in the
wordmark itself, which is white/grey only.

## Regenerating (`src/`)
- `logo-white.png` (283×356) and `logo-icon-512.png` — original raster masters.
- `mark_tight_d.txt` / `icon_trace_d.txt` — vectorized mark paths (potrace).
- `Inter-SemiBold.ttf` / `Inter-Bold.ttf` — wordmark font (SIL OFL).
- `gen_real.py` builds the SVGs; `render_real.py` rasterizes the PNGs.

> Note: the mark is vectorized from a raster, so at extreme sizes curves are an
> approximation of the original. For print at very large scale, request the
> original vector from the designer if one exists.
