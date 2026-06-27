# LETSSKIPTRACE — Logo Extraction

Logo assets extracted and rebuilt from the **LETSSKIPTRACE Brand Kit** (`index.html`).
The original kit only shipped a raster `assets/logo-white.png` and a CSS-composed
wordmark, so these are clean **vector reconstructions** of the brand's visual
language — scalable, self-contained, and ready to use.

Open **`preview.html`** (or `preview.png`) to see every variant at a glance.

## What's here

Each logo comes in `svg/` (vector source of truth) and `png/` (ready-to-view,
@3×, baked onto the correct background).

### The mark — *the logo itself*
| File | Use |
| --- | --- |
| `mark-gradient.svg` | Primary mark, blue→cyan gradient. Works on dark **or** light. |
| `mark-white.svg` | Reversed/mono mark for dark backgrounds. |
| `mark-black.svg` | Ink mark for light backgrounds / single-colour print. |
| `icon.svg` | App icon / favicon — mark on a rounded dark tile (256×256). |

### Brand name — *the wordmark*
| File | Use |
| --- | --- |
| `wordmark-white.svg` | Name only, white (dark backgrounds). |
| `wordmark-twotone.svg` | `LETSSKIP` white + `TRACE` gradient (dark backgrounds). |
| `wordmark-ink.svg` | Name only, ink (light backgrounds). |

### Logo with brand name — *the lockups*
**Horizontal** (mark left, name right):
| File | Use |
| --- | --- |
| `lockup-horizontal-gradient.svg` | Full-colour, dark backgrounds. |
| `lockup-horizontal-white.svg` | Mono white, dark backgrounds. |
| `lockup-horizontal-ink.svg` | Ink + gradient, light backgrounds. |

**Vertical** (mark on top, name below):
| File | Use |
| --- | --- |
| `lockup-vertical-gradient.svg` | Full-colour, dark backgrounds. |
| `lockup-vertical-white.svg` | Mono white, dark backgrounds. |
| `lockup-vertical-ink.svg` | Ink + gradient, light backgrounds. |

## The mark

A precision **radar / locate target** — concentric rings, a solid centre, and
N + E crosshair ticks. It nods directly to skip tracing (pinpointing a person /
property) and is taken from the kit's own "Logo System" card icon, scaled up
with an added faint outer radar ring.

## Colours

| Role | Hex |
| --- | --- |
| Brand blue (gradient start) | `#4F72FF` |
| Brand cyan (gradient end) | `#00D4FF` |
| Ink / dark canvas | `#0A0C16` |
| Reversed | `#FFFFFF` |

**Brand gradient:** `linear-gradient(135deg, #4F72FF, #00D4FF)`

## Typography

Wordmark set in **Space Grotesk Bold (700)**, all-caps. In the SVGs the text is
**outlined to vector paths**, so the files render identically anywhere with no
font installed. `SpaceGrotesk-Bold.ttf` (SIL Open Font License) is included if
you ever need to re-typeset.

## Usage notes

- Keep clear space around any lockup equal to the mark's ring diameter.
- Don't recolour the gradient to a flat fill, stretch, or rotate the mark.
- Use white/gradient on dark; ink on light. Never put white-on-light.
- SVG is preferred everywhere it's supported; PNGs are @3× for quick drop-in.

## Regenerating

These were produced by the scripts used in the extraction session
(`gen.py` builds the SVGs from the font metrics; `render.py` rasterises the
PNGs via headless Chromium). The mark geometry, colours, and metrics above are
the single source of truth if anything needs to be rebuilt.
