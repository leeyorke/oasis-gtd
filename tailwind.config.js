/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,jsx,ts,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        canvas: '#B6B0AA',
        'sheet-main': '#EBE7E0',
        'sheet-blue': '#6A809C',
        'sheet-white': '#F4F3EF',
        'ink-primary': '#141C3A',
        'ink-secondary': 'rgba(20, 28, 58, 0.5)',
      },
      fontFamily: {
        display: ['Cormorant', 'serif'],
        sans: ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
