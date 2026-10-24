/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'mv-bg': '#0a0a0a',
        'mv-surface': '#141414',
        'mv-elevated': '#1e1e1e',
        'mv-hover': '#2a2a2a',
        'mv-accent': '#8b5cf6',
        'mv-accent-hover': '#7c3aed',
        'mv-text': '#f5f5f5',
        'mv-text-secondary': '#a3a3a3',
        'mv-text-muted': '#666666',
        'mv-favorite': '#ef4444',
        'mv-border': '#262626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
