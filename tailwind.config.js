/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './pwa/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        brand: {
          black:       'var(--brand-black)',
          dark:        'var(--brand-dark)',
          mid:         'var(--brand-mid)',
          muted:       'var(--brand-muted)',
          border:      'var(--brand-border)',
          borderLight: 'var(--brand-border-light)',
          surface:     'var(--brand-surface)',
          surfaceCard: 'var(--brand-surface-card)',
          darkBg:      'var(--brand-dark-bg)',
        },
        status: {
          success:     '#10B981',
          green:       '#15803D',
          greenBg:     'var(--color-green-bg)',
          warning:     '#F59E0B',
          amber:       '#B45309',
          amberBg:     'var(--color-amber-bg)',
          amberDark:   '#92400E',
          amberMid:    '#FEF3C7',
          error:       '#EF4444',
          red:         '#DC2626',
          redBg:       'var(--color-red-bg)',
          blue:        '#1D4ED8',
          blueBg:      'var(--color-blue-bg)',
        }
      },
      fontSize: {
        'hero':  ['28px', { lineHeight: '1.15', fontWeight: '800' }],
        'xl':    ['26px', { lineHeight: '1.2',  fontWeight: '800' }],
        'lg':    ['22px', { lineHeight: '1.2',  fontWeight: '800' }],
        'title': ['20px', { lineHeight: '1.3',  fontWeight: '700' }],
        'base':  ['16px', { lineHeight: '1.5',  fontWeight: '500' }],
        'md':    ['15px', { lineHeight: '1.5',  fontWeight: '400' }],
        'sm':    ['14px', { lineHeight: '1.4',  fontWeight: '500' }],
        'xs':    ['13px', { lineHeight: '1.4',  fontWeight: '400' }],
        'xxs':   ['12px', { lineHeight: '1.3',  fontWeight: '500' }],
        'label': ['12px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.5px' }],
        'micro': ['11px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.7px' }],
      },
      borderRadius: {
        'xs':   '4px',
        'sm':   '6px',
        'md':   '8px',
        'lg':   '12px',
        'xl':   '16px',
        'full': '9999px',
      },
      boxShadow: {
        'card':   '0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.08)',
        'sheet':  'var(--shadow-sheet)',
        'active': 'inset 0 1px 3px rgba(0,0,0,.12)',
        'seg':    'var(--shadow-seg)',
      },
      spacing: {
        '11': '44px',
        '11.5': '46px',
        '13': '52px',
        '14': '56px',
      }
    }
  },
  plugins: []
}
