/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: '#0D1821',
        gold: '#B8962E',
        'gold-light': '#D4AF5A',
      },
    },
  },
  plugins: [],
}
