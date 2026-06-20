/**
 * Xantle design tokens — THE single source of truth for colours, type, spacing,
 * radius and shadows. Pulled from the approved UI sample (sample-ui.png).
 *
 * RULE FOR THE TEAM: never hardcode a hex value in a screen. Import from here.
 * If a colour you need is missing, add it to this file (with a name) — do not
 * invent a one-off colour inline. See DESIGN-SYSTEM.md.
 */

export const colors = {
  // ---- Backgrounds (the dark slate-navy app canvas) ----
  bg: '#1C222B', // primary app background (59% of the sample)
  bgTop: '#232A36', // top of the subtle background gradient
  bgBottom: '#161B23', // bottom of the background gradient

  // ---- Surfaces (raised cards, icon chips) ----
  surface: '#303747', // card / chip surface (13% of the sample)
  surfaceAlt: '#3A4250', // lighter card edge / pressed state
  hairline: 'rgba(255,255,255,0.06)', // 1px separators / glassy borders

  // ---- Brand blue ----
  blue: '#3B9DE7', // primary accent
  blueBright: '#489AE7', // lighter accent / gradient start
  blueDeep: '#3B6DCF', // royal blue / gradient end
  royal: '#4967E0', // alt deep blue
  cyan: '#6BC9F5', // cyan accent (featured cards)

  // ---- Text ----
  text: '#EAF0FA', // primary text (headings + body on dark)
  textMuted: '#939BA7', // secondary text
  textFaint: '#6086A9', // faint labels / hints (muted blue-grey)
  white: '#FFFFFF',

  // ---- Semantic status ----
  success: '#4ADE80', // available / win / positive
  danger: '#F87171', // error / taken / loss
  warning: '#FBBF24', // caution
} as const;

/** Two-stop gradients (use with <GradientFill />). */
export const gradients = {
  background: ['#232A36', '#161B23'] as [string, string], // app canvas
  button: ['#489AE7', '#3B6DCF'] as [string, string], // primary CTA (light blue -> royal)
  featured: ['#6BC9F5', '#3B9DE7'] as [string, string], // featured / hero cards (cyan -> blue)
} as const;

/** Corner radius scale. */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28, // big cards
  pill: 999,
} as const;

/** Spacing scale (margins, padding, gaps). */
export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Font families. Loaded in src/app/_layout.tsx.
 * - display* = Space Grotesk (logo, big headings)
 * - the rest = Nunito (all UI text)
 */
export const font = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

/** Type scale (size + the family to pair it with). */
export const text = {
  logo: { fontFamily: font.display, fontSize: 104 },
  h1: { fontFamily: font.extrabold, fontSize: 28, color: colors.text },
  h2: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  title: { fontFamily: font.bold, fontSize: 18, color: colors.text },
  body: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  label: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: colors.textFaint },
  hint: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
} as const;

/** Reusable shadows. */
export const shadow = {
  // soft neumorphic drop for cards/chips
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  // blue glow under primary buttons
  blueGlow: {
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    elevation: 16,
  },
} as const;
