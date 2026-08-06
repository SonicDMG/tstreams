import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Map existing tstreams CSS variables to Tailwind tokens
        background: 'var(--bg)',
        surface:    'var(--surface)',
        card:       'var(--card)',
        border:     'var(--border)',
        border2:    'var(--border2)',
        foreground: 'var(--text)',
        muted:      'var(--muted)',
        green:      'var(--green)',
        cyan:       'var(--cyan)',
        red:        'var(--red)',
        yellow:     'var(--yellow)',
        blue:       'var(--blue)',
        purple:     'var(--purple)',
        accent:     'var(--accent)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
    },
  },
  plugins: [],
}

export default config
