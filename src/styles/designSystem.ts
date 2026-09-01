/**
 * Universal Design System Tokens & Style Presets for Reevolt Track
 * Adheres strictly to the Nordic/Japandi aesthetic rules:
 * Warm neutrals, 8px grid, Karla typography, muted accents.
 */

export const DESIGN_TOKENS = {
  colors: {
    bgBase: '#F7F3EC',
    bgSurface: '#EFE8DC',
    bgSurfaceHover: '#E7DECE',
    border: '#DDD3C0',
    textPrimary: '#3A342C',
    textSecondary: '#726A5C',
    textTertiary: '#A69C89',
    accentPrimary: '#B5654A',
    accentPrimaryHover: '#9C5540',
    accentSecondary: '#7C8B6F',
    statusSuccess: '#7C8B6F',
    statusWarning: '#C7963E',
    statusError: '#B24C3E',
    statusInfo: '#6E8299',
  },
  typography: {
    fontBody: "var(--font-sans)",
    fontHeading: "var(--font-heading)",
    fontId: "var(--font-id)",
    fontMono: "var(--font-mono)",
  },
  classes: {
    btnPrimary: 'btn-primary',
    btnSecondary: 'btn-secondary',
    btnGhost: 'btn-ghost',
    inputField: 'input-field',
    selectField: 'select-field',
    cardBase: 'card-base',
    headingPage: 'heading-page',
    headingSection: 'heading-section',
    badgeNeutral: 'badge-neutral',
    badgeSuccess: 'badge-success',
    badgeWarning: 'badge-warning',
    badgeError: 'badge-error',
  }
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
