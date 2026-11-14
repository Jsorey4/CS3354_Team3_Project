/*
 * @author Tyler Gaines (themes & accessibility)
 * @description Tailwind design tokens taken from the ProjectForge Design System in the 15 HTML mockups
 *   (Midnight #0F1424, card #1C2340, periwinkle #8FA8FF, purple #A78BFA, gold #F5B942, Inter). Every semantic
 *   color reads a CSS variable, so light / dark theme and the color-blindness palettes swap the whole app at
 *   once, using only standard CSS custom properties that Chrome, Edge, Firefox and Safari all support.
 * @traces SE-FR-14, SE-FR-15, SE-NFR-05
 */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        field: v('field'),
        line: v('line'),
        'line-strong': v('line-strong'),
        ink: v('ink'),
        body: v('body'),
        muted: v('muted'),
        nav: v('nav'),
        brand: v('brand'),
        'brand-ink': v('brand-ink'),
        accent: v('accent'),
        'accent-tint': v('accent-tint'),
        'accent-deep': v('accent-deep'),
        gold: v('gold'),
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        info: v('info'),
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        btn: '10px',
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.12)',
        pop: '0 24px 48px rgb(0 0 0 / 0.35)',
      },
      keyframes: {
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
      },
      animation: { shake: 'shake 0.3s ease-in-out 2' },
    },
  },
  plugins: [],
};
