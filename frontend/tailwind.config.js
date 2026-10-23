/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Unbounded', 'Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        paper: '#F6F2E8',
        cream: '#FFFDF7',
        ink: '#141414',
        lime: '#C9F24B',
        tangerine: '#FF6B35',
        violet: '#6C4CF1',
        mint: '#5CE0C0',
        coral: '#FF7A9E',
        sun: '#FFD43B',
        sky: '#6FD3FF',
      },
      boxShadow: {
        hard: '8px 8px 0 0 #141414',
        'hard-sm': '4px 4px 0 0 #141414',
        'hard-lg': '12px 12px 0 0 #141414',
        'hard-violet': '8px 8px 0 0 #6C4CF1',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'cube-spin': {
          '0%': { transform: 'rotateX(-24deg) rotateY(0deg)' },
          '100%': { transform: 'rotateX(-24deg) rotateY(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--tw-rotate, 0))' },
          '50%': { transform: 'translateY(-6px) rotate(var(--tw-rotate, 0))' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(.2,.8,.2,1) both',
        marquee: 'marquee 32s linear infinite',
        'cube-spin': 'cube-spin 1.4s linear infinite',
        float: 'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
