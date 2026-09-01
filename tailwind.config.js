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
          base: 'var(--color-bg-base)',
          surface: 'var(--color-bg-surface)',
          'surface-raised': 'var(--color-bg-surface-raised)',
          'surface-hover': 'var(--color-bg-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          'primary-hover': 'var(--color-accent-primary-hover)',
          muted: 'var(--color-accent-muted)',
        },
        status: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          error: 'var(--color-error)',
          info: 'var(--color-info)',
        },
        button: {
          primary: 'var(--color-button-primary)',
          'primary-hover': 'var(--color-button-primary-hover)',
          text: 'var(--color-button-text)',
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
        sm: '6px',
        md: '10px',
      },
      spacing: {
        '18': '4.5rem',
      }
    },
  },
  plugins: [],
};
