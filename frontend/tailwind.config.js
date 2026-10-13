/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0A',
        surface: '#121212',
        'surface-elevated': '#181818',
        border: '#1F1F1F',
        'border-strong': '#2A2A2A',
        foreground: '#EDEDED',
        muted: '#888888',
        signal: '#EF4444',
        accent: '#3B82F6',
        success: '#10B981',
      },
      fontFamily: {
        sans: ['"Geist Sans"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
