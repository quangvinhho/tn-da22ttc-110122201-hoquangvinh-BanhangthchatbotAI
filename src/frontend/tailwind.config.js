/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./components/*.html",
    "./*.js",
  ],
  theme: {
    extend: {
      colors: {
        'red-main': '#d91e23',
        'red-dark': '#b01117',
        'red-light': '#ffe5e6',
      },
      fontFamily: {
        'roboto': ['Roboto', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
        'montserrat': ['Montserrat', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 0.5s ease-in-out',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'scale-in': 'scaleIn 0.3s ease-in-out',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        }
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      }
    },
  },
  plugins: [],
}

