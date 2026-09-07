/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'rgb(var(--rgb-bg-base) / <alpha-value>)',
          surface: 'rgb(var(--rgb-bg-surface) / <alpha-value>)',
          'surface-raised': 'rgb(var(--rgb-bg-surface-raised) / <alpha-value>)',
          'surface-hover': 'rgb(var(--rgb-bg-surface-hover) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--rgb-border) / <alpha-value>)',
          strong: 'rgb(var(--rgb-border-strong) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--rgb-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--rgb-text-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--rgb-text-tertiary) / <alpha-value>)',
        },
        accent: {
          primary: 'rgb(var(--rgb-accent-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--rgb-accent-primary-hover) / <alpha-value>)',
          muted: 'rgb(var(--rgb-accent-muted) / <alpha-value>)',
        },
        status: {
          success: 'rgb(var(--rgb-success) / <alpha-value>)',
          warning: 'rgb(var(--rgb-warning) / <alpha-value>)',
          attention: 'rgb(var(--rgb-attention) / <alpha-value>)',
          error: 'rgb(var(--rgb-error) / <alpha-value>)',
          info: 'rgb(var(--rgb-info) / <alpha-value>)',
        },
        button: {
          primary: 'rgb(var(--rgb-accent-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--rgb-accent-primary-hover) / <alpha-value>)',
          text: 'rgb(var(--rgb-button-text) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        karla: ['var(--font-heading)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        id: ['var(--font-id)', 'sans-serif'],
      },
      fontWeight: {
        normal: 'var(--font-weight-normal)',
        medium: 'var(--font-weight-medium)',
        semibold: 'var(--font-weight-semibold)',
        bold: 'var(--font-weight-bold)',
        extrabold: 'var(--font-weight-extrabold)',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '14px',
        xl: '16px',
      },
      spacing: {
        '18': '4.5rem',
      }
    },
  },
  plugins: [],
};
