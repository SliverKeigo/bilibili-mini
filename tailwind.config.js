/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bilibili: {
          pink: '#fb7299',
          blue: '#00aeec',
          bg: '#f6f7f9',
        }
      }
    },
  },
  plugins: [],
}
