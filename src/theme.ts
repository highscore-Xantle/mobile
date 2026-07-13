/**
 * Xantle Glass — design tokens. THE single source of truth for colour, type,
 * spacing, radius, elevation, motion and breakpoints.
 *
 * ONE codebase → iOS, Android, web. The website IS the app, so these tokens are
 * the only thing keeping the three platforms identical. See ../DESIGN-SYSTEM.md.
 *
 * RULE FOR THE TEAM: never hardcode a hex/duration in a screen. Import from here.
 * If a value you need is missing, add it here with a name — never inline it.
 *
 * Style: "Modern Dark (Cinema Mobile)" — cinematic dark canvas, frosted glass,
 * ambient light, accent glow, spring motion. Contrast values below are MEASURED
 * against bg.base (WCAG 2.1), not estimated.
 */

export const colors = {
  // ---- Canvas — never pure black (#000 smears on OLED and kills depth) ----
  bgTop: '#111827',    // top of the canvas gradient (the "lit" end)
  bg: '#0A0F1A',       // app background / base
  bgDeep: '#05070D',   // bottom of the canvas gradient
  bgElevated: '#121A28', // sheets, modals, raised sections

  // Legacy alias kept so existing screens keep compiling.
  bgBottom: '#05070D',

  // ---- Glass surfaces (translucent over the canvas + blur) ----
  surface: 'rgba(255,255,255,0.05)',       // card fill
  surfaceAlt: 'rgba(255,255,255,0.08)',    // pressed / active card
  hairline: 'rgba(255,255,255,0.08)',      // 1px border on all glass
  highlight: 'rgba(255,255,255,0.14)',     // TOP edge only — the light source

  // Opaque fallback for places that cannot be translucent (e.g. behind blur).
  surfaceSolid: '#161E2C',

  // ---- Brand / default accent (overridden per-game by lib/accent.tsx) ----
  blue: '#3B9DE7',       // 6.53:1 ✅  primary accent
  blueBright: '#6BC9F5', // gradient start / hover
  blueDeep: '#3B6DCF',   // gradient end
  royal: '#4967E0',
  cyan: '#6BC9F5',

  // ---- Text (all verified AA on bg) ----
  text: '#EDF1F8',      // 16.91:1 ✅
  textMuted: '#98A2B3', //  7.44:1 ✅
  textFaint: '#7A8598', //  5.14:1 ✅ (was #667085 = 3.85:1, FAILED AA)
  white: '#FFFFFF',

  // ---- Semantic (verified) ----
  success: '#4ADE80', // 10.99:1 ✅
  danger: '#F87171',  //  6.93:1 ✅
  warning: '#FBBF24', // 11.48:1 ✅
} as const;

/** Two-stop gradients (use with <GradientFill /> / expo-linear-gradient). */
export const gradients = {
  background: ['#111827', '#05070D'] as [string, string], // the cinematic canvas
  button: ['#6BC9F5', '#3B6DCF'] as [string, string],     // primary CTA
  featured: ['#6BC9F5', '#3B9DE7'] as [string, string],   // hero / featured
} as const;

/** Glass recipe — spread onto a card, then put content above it. */
export const glass = {
  blurIntensity: 20,
  tint: 'dark' as const,
  fill: colors.surface,
  border: colors.hairline,
  topHighlight: colors.highlight,
} as const;

/** Corner radius scale. `md` (16) is the default for cards + buttons. */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Spacing scale (4pt-derived). Desktop sections breathe at xxl/xxxl. */
export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 72,
} as const;

/**
 * Responsive breakpoints. Desktop gets MORE (columns, hover, focus) — never a
 * scaled-up phone. Use with useBreakpoint().
 */
export const breakpoints = {
  sm: 0,     // phone
  md: 768,   // tablet
  lg: 1024,  // desktop
  xl: 1440,  // desktop wide
} as const;

/** Max content width on large screens, so text never runs edge-to-edge. */
export const maxContentWidth = 1280;

/**
 * Motion. ONE easing curve for the whole product. Nothing linear, nothing
 * instant, nothing over 400ms.
 */
export const motion = {
  /** cubic-bezier(0.16, 1, 0.3, 1) — the only easing curve we use. */
  easing: [0.16, 1, 0.3, 1] as [number, number, number, number],
  spring: { damping: 20, stiffness: 90 },
  duration: {
    micro: 150,  // press / hover
    base: 250,   // most transitions
    enter: 400,  // screen + section entrance (max)
  },
  /** Stagger between items in an entrance sequence. */
  stagger: 60,
  /** Press feedback: scale down to this, then spring back. */
  pressScale: 0.97,
} as const;

/**
 * Font families. Loaded in src/app/_layout.tsx.
 * - display = Space Grotesk (logo, hero, headings, numerics)
 * - the rest = Inter (all UI text — dense, legible)
 */
export const font = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_700Bold',   // Inter tops out at 700 in our loaded set
  black: 'Inter_700Bold',
} as const;

/** Type scale. Sizes are the PHONE values; scale up on desktop via useType(). */
export const text = {
  logo: { fontFamily: font.display, fontSize: 104, color: colors.text },
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 36, color: colors.text },
  h1: { fontFamily: font.display, fontSize: 28, lineHeight: 31, color: colors.text },
  h2: { fontFamily: font.display, fontSize: 22, lineHeight: 26, color: colors.text },
  title: { fontFamily: font.bold, fontSize: 18, lineHeight: 23, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 23, color: colors.text },
  label: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: colors.textFaint },
  hint: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  caption: { fontFamily: font.regular, fontSize: 11, color: colors.textFaint },
} as const;

/** Desktop multipliers for the display/heading sizes (see useType()). */
export const typeScaleDesktop = {
  display: 72,
  h1: 48,
  h2: 32,
  title: 22,
  body: 16,
} as const;

/**
 * Elevation = light, not a drop shadow. `card` is the resting lift, `glow` is
 * the accent halo under a primary CTA / active nav item.
 */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  /** Accent glow. Pass the live accent colour in at the call site. */
  glow: (accent: string = colors.blue) => ({
    shadowColor: accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  }),
  /** Legacy alias — existing screens still import shadow.blueGlow. */
  blueGlow: {
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;
