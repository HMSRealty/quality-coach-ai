// Design tokens for inline styles. These resolve to CSS custom properties so
// they automatically flip in dark mode (via [data-theme="dark"] in globals.css).
//
// Usage:  style={{ color: T.text1, background: T.surface3 }}
//
// Why strings and not raw hex? Inline `style` accepts `var(--x)` as a string
// value. The browser resolves it at paint time, so dark mode "just works".

export const T = {
  // ── Text ──
  text1: "var(--text-1)",       // primary text (navy in light, warm-white in dark)
  text2: "var(--text-2)",       // secondary
  text3: "var(--text-3)",       // tertiary / muted
  text4: "var(--text-4)",       // disabled

  // ── Surfaces ──
  canvas:   "var(--canvas)",
  surface1: "var(--surface-1)",
  surface2: "var(--surface-2)",
  surface3: "var(--surface-3)",
  surface4: "var(--surface-4)",
  surface5: "var(--surface-5)",

  // ── Brand ──
  navy:      "var(--navy)",       // legacy alias → midnight
  navy2:     "var(--navy-2)",
  navy3:     "var(--navy-3)",
  navyLight: "var(--navy-light)",
  midnight:  "var(--midnight)",   // sidebar / dark chrome base
  midnight2: "var(--midnight-2)",
  midnight3: "var(--midnight-3)",
  midnightLine: "var(--midnight-line)",
  magenta:   "var(--magenta)",    // primary accent (Gong pink)
  magenta2:  "var(--magenta-2)",
  magenta3:  "var(--magenta-3)",
  magentaGlow: "var(--magenta-glow)",
  magentaDim:  "var(--magenta-dim)",
  violet:    "var(--violet)",
  violet2:   "var(--violet-2)",
  gradPrimary: "var(--grad-primary)",
  gradChrome:  "var(--grad-chrome)",
  // Back-compat for code that says T.teal — points at the new accent.
  teal:      "var(--magenta)",
  teal2:     "var(--magenta-3)",
  tealLight: "var(--magenta-dim)",
  slate:     "var(--slate)",
  slate2:    "var(--slate-2)",
  slate3:    "var(--slate-3)",

  // ── Semantic ──
  emerald:   "var(--emerald)",
  emeraldBg: "var(--emerald-bg)",
  amber:     "var(--amber)",
  amberBg:   "var(--amber-bg)",
  rose:      "var(--rose)",
  roseBg:    "var(--rose-bg)",
  violetBg:  "var(--violet-bg)",

  // ── Borders ──
  border1: "var(--border-1)",
  border2: "var(--border-2)",
  border3: "var(--border-3)",
  border4: "var(--border-4)",

  // ── Shadows ──
  shadowSm: "var(--shadow-sm)",
  shadowMd: "var(--shadow-md)",
  shadowLg: "var(--shadow-lg)",

  // ── Radius ──
  rSm:  "var(--r-sm)",
  rMd:  "var(--r-md)",
  rLg:  "var(--r-lg)",
  rXl:  "var(--r-xl)",
  r2xl: "var(--r-2xl)",
} as const;
