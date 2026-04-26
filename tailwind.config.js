/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0a0a0f',
        'dark-surface': 'rgba(23, 23, 33, 0.7)',
        'dark-border': 'rgba(255, 255, 255, 0.1)',
        'primary-blue': '#3b82f6',
        'primary-teal': '#14b8a6',
        'primary-purple': '#8b5cf6',
        'gray-subtext': '#94a3b8',
        'glass-white': 'rgba(255, 255, 255, 0.03)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)',
        'glow-conic': 'conic-gradient(from 180deg at 50% 50%, #3b82f6 0deg, #14b8a6 120deg, #8b5cf6 240deg, #3b82f6 360deg)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
