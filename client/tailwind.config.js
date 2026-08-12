/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['Work Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        white: '#FFFFFF',
        black: '#000000',
        
        /* Theme-switchable colors */
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-muted': 'var(--color-accent-muted)',
        
        'secondary-accent': 'var(--color-secondary-accent)',
        'secondary-accent-hover': 'var(--color-secondary-accent-hover)',
        'secondary-accent-muted': 'var(--color-secondary-accent-muted)',
        
        'tertiary-accent': 'var(--color-tertiary-accent)',
        'tertiary-accent-hover': 'var(--color-tertiary-accent-hover)',
        'tertiary-accent-muted': 'var(--color-tertiary-accent-muted)',

        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        border: 'var(--border)',
        'border-subtle': 'var(--color-border-subtle)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        tertiary: {
          DEFAULT: 'var(--tertiary)',
          foreground: 'var(--tertiary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      spacing: {
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
        '2xl': 'var(--space-2xl)',
        '3xl': 'var(--space-3xl)',
        '4xl': 'var(--space-4xl)',
      },
    },
  },
  plugins: [],
}
