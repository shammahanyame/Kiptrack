/**
 * Kiptrack design tokens.
 *
 * Palette and type scale come from the brand sheet (`kiptrack-brand-sheet.png`)
 * and the design notes in `phase1_docs/schemaDiagram.md`.
 *
 * Contrast notes (WCAG AA, vs. the surface they sit on):
 * - ink (#121316) on paper (15.9:1) and pearl (15.1:1) — AA/AAA body text.
 * - clay (#C08A5A) is a *surface/graphic* color: 6.2:1 on ink, 3.0:1 on paper.
 *   Never use it for small text on light surfaces — use `accentText` instead.
 * - accentText (#8A5A32) on paper is 5.9:1 — safe for small text.
 * - accentStrong (#A9703F) on paper is 4.1:1 — safe for icons and large text.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#121316',
    textSecondary: '#5C5F66',
    textTertiary: '#8A8D94',
    background: '#FFFFFF',
    surface: '#F3F3F1',
    surfaceRaised: '#FFFFFF',
    border: '#E6E6E1',
    accent: '#C08A5A',
    accentStrong: '#A9703F',
    accentText: '#8A5A32',
    onAccent: '#121316',
    primary: '#121316',
    onPrimary: '#FFFFFF',
    tabInactive: '#8A8D94',
    tabActive: '#A9703F',
    danger: '#B3261E',
    success: '#2E7D4F',
    skeleton: '#ECECE7',
  },
  dark: {
    text: '#F3F3F1',
    textSecondary: '#B4B7BE',
    textTertiary: '#8A8D94',
    background: '#121316',
    surface: '#1B1C20',
    surfaceRaised: '#24252A',
    border: '#2E2F35',
    accent: '#C08A5A',
    accentStrong: '#D8A374',
    accentText: '#D8A374',
    onAccent: '#121316',
    primary: '#F3F3F1',
    onPrimary: '#121316',
    tabInactive: '#8A8D94',
    tabActive: '#C08A5A',
    danger: '#F27A72',
    success: '#6FCF97',
    skeleton: '#24252A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;
export type ThemeScheme = 'light' | 'dark';

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 22,
  pill: 999,
} as const;

/** iOS HIG minimum 44pt, Android Material minimum 48dp. */
export const TouchTarget = Platform.select({ android: 48, default: 44 }) ?? 44;

/** Gutter used by every screen so the rhythm stays consistent. */
export const ScreenPadding = 20;

/**
 * Type ramp using the platform system font (San Francisco on iOS, Roboto on
 * Android). Sizes are tuned separately per platform where the platforms differ
 * in their default metrics.
 */
export const Type = {
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: Platform.select({ ios: -0.6, default: -0.2 }),
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: Platform.select({ ios: -0.4, default: -0.1 }),
  },
  headline: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 17,
    lineHeight: Platform.select({ ios: 24, default: 26 }),
    fontWeight: '400',
  },
  bodyStrong: {
    fontSize: 17,
    lineHeight: Platform.select({ ios: 24, default: 26 }),
    fontWeight: '600',
  },
  callout: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  price: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
