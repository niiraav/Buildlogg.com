/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        brand: {
          black:       '#111827',
          dark:        '#374151',
          mid:         '#6B7280',
          muted:       '#9CA3AF',
          border:      '#E5E7EB',
          borderLight: '#F3F4F6',
          surface:     '#F9FAFB',
          surfaceCard: '#F5F5F5',
          darkBg:      '#101010',
        },
        status: {
          success:     '#10B981',
          green:       '#15803D',
          greenBg:     '#F0FDF4',
          warning:     '#F59E0B',
          amber:       '#B45309',
          amberBg:     '#FFFBEB',
          amberDark:   '#92400E',
          amberMid:    '#FEF3C7',
          error:       '#EF4444',
          red:         '#DC2626',
          redBg:       '#FEF2F2',
          blue:        '#1D4ED8',
          blueBg:      '#EFF6FF',
        }
      },
      fontSize: {
        'hero':  ['28px', { lineHeight: '1.15', fontWeight: '800' }],
        'xl':    ['26px', { lineHeight: '1.2',  fontWeight: '800' }],
        'title': ['20px', { lineHeight: '1.3',  fontWeight: '700' }],
        'label': ['11px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.5px' }],
        'micro': ['10px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.7px' }],
        'xxs':   ['12px', { lineHeight: '1.3',  fontWeight: '500' }],
        'xs':    ['13px', { lineHeight: '1.4',  fontWeight: '400' }],
        'md':    ['15px', { lineHeight: '1.5',  fontWeight: '400' }],
        'lg':    ['22px', { lineHeight: '1.2',  fontWeight: '800' }],
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
        'sheet':  '0 -4px 12px rgba(0,0,0,.06)',
        'active': 'inset 0 1px 3px rgba(0,0,0,.12)',
        'seg':    '0 1px 3px rgba(0,0,0,.10)',
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
