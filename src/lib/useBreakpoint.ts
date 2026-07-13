/**
 * Responsive layer for the one-codebase-three-platforms build.
 *
 * The website IS the app, so a phone-sized layout stretched to 1440px would look
 * broken. Desktop must get MORE (columns, hover, keyboard focus) — not BIGGER.
 * Every screen reads its shape from here instead of checking Platform.OS.
 */
import { useWindowDimensions } from 'react-native';
import { breakpoints, typeScaleDesktop, text as baseText } from '../theme';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface Layout {
  /** Current breakpoint bucket. */
  bp: Breakpoint;
  width: number;
  /** Phone-shaped: single column, bottom nav. */
  isPhone: boolean;
  /** >= 768: 2-up grids, wider gutters. */
  isTablet: boolean;
  /** >= 1024: multi-column, hover, side nav. */
  isDesktop: boolean;
  /** How many columns a card grid should use at this width. */
  columns: number;
  /** Horizontal page gutter. */
  gutter: number;
}

export function useBreakpoint(): Layout {
  const { width } = useWindowDimensions();

  const bp: Breakpoint =
    width >= breakpoints.xl ? 'xl'
    : width >= breakpoints.lg ? 'lg'
    : width >= breakpoints.md ? 'md'
    : 'sm';

  const isDesktop = bp === 'lg' || bp === 'xl';
  const isTablet = bp === 'md';

  return {
    bp,
    width,
    isPhone: bp === 'sm',
    isTablet,
    isDesktop,
    columns: bp === 'xl' ? 4 : bp === 'lg' ? 3 : bp === 'md' ? 2 : 1,
    gutter: isDesktop ? 48 : isTablet ? 32 : 20,
  };
}

/**
 * Type scale that grows on desktop. Phone sizes live in theme.text; this swaps
 * in the larger desktop sizes so a hero reads at 72px on a monitor and 34px on
 * a phone — from one call site.
 */
export function useType() {
  const { isDesktop } = useBreakpoint();
  if (!isDesktop) return baseText;

  return {
    ...baseText,
    display: { ...baseText.display, fontSize: typeScaleDesktop.display, lineHeight: typeScaleDesktop.display * 1.05 },
    h1: { ...baseText.h1, fontSize: typeScaleDesktop.h1, lineHeight: typeScaleDesktop.h1 * 1.1 },
    h2: { ...baseText.h2, fontSize: typeScaleDesktop.h2, lineHeight: typeScaleDesktop.h2 * 1.2 },
    title: { ...baseText.title, fontSize: typeScaleDesktop.title },
    body: { ...baseText.body, fontSize: typeScaleDesktop.body, lineHeight: typeScaleDesktop.body * 1.55 },
  };
}
