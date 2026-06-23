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
          primary:     'var(--surface-primary)',
          primaryText: 'var(--surface-primary-text)',
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
          redText:     'var(--color-red-text)',   // WCAG 1.4.3 safe: #B91C1C on redBg
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
        'md':    ['14px', { lineHeight: '1.4',  fontWeight: '500' }],  // merged 15px→14px
        'sm':    ['14px', { lineHeight: '1.4',  fontWeight: '500' }],
        'xs':    ['12px', { lineHeight: '1.2',  fontWeight: '500' }],      // merged 13px→12px
        'xxs':   ['12px', { lineHeight: '1.3',  fontWeight: '500' }],
        'label': ['14px', { lineHeight: '1.3',  fontWeight: '600', letterSpacing: '0.3px' }],
        'micro': ['12px', { lineHeight: '1.2',  fontWeight: '700', letterSpacing: '0.5px' }],
      },
      borderRadius: {
        'xs':   '4px',
        'sm':   '6px',
        'md':   '8px',
        'lg':   'var(--radius-card)',   // 12px — cards, inputs, buttons
        'xl':   'var(--radius-card)',   // 12px — alias for consistency
        '2xl':  'var(--radius-card)',   // 12px — alias for consistency
        'full': 'var(--radius-pill)',   // 9999px — badges, pills, toggles
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
      },
      iconSize: {
        'sm': 'var(--icon-sm)',   // 16px — inline icons
        'md': 'var(--icon-md)',   // 20px — sheet titles, card headers
        'lg': 'var(--icon-lg)',   // 24px — tab bar
      },
    }
  },
  plugins: []
}
