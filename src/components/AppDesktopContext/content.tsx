export type RouteKey = 'home' | 'jobs' | 'activity' | 'settings';
export type UserState = 'new' | 'returning';

export interface ContextExtra {
  type: 'stats' | 'tip' | 'shortcut' | 'status';
  content: React.ReactNode;
}

export interface ContextVariant {
  headline: string;
  body: string;
  illustration: React.ReactNode;
  extra?: ContextExtra;
}

export interface RouteContext {
  new: ContextVariant;
  returning: ContextVariant;
}

const stroke = 'currentColor';
const strokeWidth = 1.5;
const lineCap = 'round' as const;
const lineJoin = 'round' as const;

const ILLUSTRATIONS: Record<string, React.ReactNode> = {
  homeNew: (
    <svg viewBox="0 0 200 160" className="w-full max-w-[160px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* phone outline */}
        <rect x="60" y="20" width="80" height="120" rx="12" />
        <line x1="60" y1="45" x2="140" y2="45" />
        <circle cx="100" cy="125" r="6" />
        {/* quote card on phone */}
        <rect x="72" y="55" width="56" height="36" rx="4" />
        <line x1="78" y1="65" x2="122" y2="65" />
        <line x1="78" y1="73" x2="110" y2="73" />
        <line x1="78" y1="81" x2="104" y2="81" />
        {/* calendar peeking */}
        <rect x="145" y="55" width="40" height="34" rx="4" />
        <line x1="145" y1="65" x2="185" y2="65" />
        <line x1="153" y1="72" x2="153" y2="72" />
        <line x1="165" y1="72" x2="165" y2="72" />
        <line x1="177" y1="72" x2="177" y2="72" />
        <line x1="153" y1="80" x2="153" y2="80" />
        <line x1="165" y1="80" x2="165" y2="80" />
        <line x1="177" y1="80" x2="177" y2="80" />
        {/* payment card */}
        <rect x="145" y="100" width="48" height="30" rx="4" />
        <line x1="145" y1="110" x2="193" y2="110" />
        <line x1="153" y1="120" x2="170" y2="120" />
      </g>
    </svg>
  ),
  homeReturning: (
    <svg viewBox="0 0 200 80" className="w-full max-w-[160px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* sparkline */}
        <path d="M10 60 L40 50 L70 55 L100 35 L130 40 L160 25 L190 30" />
        {/* calendar strip */}
        <rect x="20" y="10" width="160" height="24" rx="4" />
        <line x1="20" y1="18" x2="180" y2="18" />
        <line x1="45" y1="10" x2="45" y2="34" />
        <line x1="75" y1="10" x2="75" y2="34" />
        <line x1="105" y1="10" x2="105" y2="34" />
        <line x1="135" y1="10" x2="135" y2="34" />
        <line x1="165" y1="10" x2="165" y2="34" />
      </g>
    </svg>
  ),
  jobsNew: (
    <svg viewBox="0 0 240 100" className="w-full max-w-[200px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* lead */}
        <circle cx="20" cy="50" r="12" />
        <text x="20" y="80" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">Lead</text>
        {/* arrow */}
        <line x1="36" y1="50" x2="56" y2="50" />
        <polyline points="50 44 56 50 50 56" />
        {/* quote */}
        <rect x="60" y="38" width="36" height="24" rx="4" />
        <text x="78" y="80" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">Quote</text>
        {/* arrow */}
        <line x1="100" y1="50" x2="120" y2="50" />
        <polyline points="114 44 120 50 114 56" />
        {/* booked */}
        <rect x="124" y="38" width="36" height="24" rx="4" />
        <text x="142" y="80" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">Booked</text>
        {/* arrow */}
        <line x1="164" y1="50" x2="184" y2="50" />
        <polyline points="178 44 184 50 178 56" />
        {/* paid */}
        <circle cx="200" cy="50" r="12" />
        <text x="200" y="80" textAnchor="middle" fontSize="10" fill="currentColor" stroke="none">Paid</text>
      </g>
    </svg>
  ),
  jobsReturning: (
    <svg viewBox="0 0 160 140" className="w-full max-w-[120px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* funnel */}
        <path d="M20 20 L140 20 L100 70 L60 70 Z" />
        <line x1="80" y1="70" x2="80" y2="110" />
        <rect x="60" y="110" width="40" height="16" rx="4" />
      </g>
    </svg>
  ),
  activityNew: (
    <svg viewBox="0 0 200 120" className="w-full max-w-[160px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* timeline line */}
        <line x1="30" y1="20" x2="30" y2="100" />
        {/* note event */}
        <circle cx="30" cy="30" r="6" />
        <rect x="50" y="22" width="120" height="16" rx="4" />
        <line x1="58" y1="28" x2="100" y2="28" />
        {/* payment event */}
        <circle cx="30" cy="60" r="6" />
        <rect x="50" y="52" width="120" height="16" rx="4" />
        <line x1="58" y1="58" x2="90" y2="58" />
        {/* quote sent event */}
        <circle cx="30" cy="90" r="6" />
        <rect x="50" y="82" width="120" height="16" rx="4" />
        <line x1="58" y1="88" x2="110" y2="88" />
      </g>
    </svg>
  ),
  activityReturning: (
    <svg viewBox="0 0 200 100" className="w-full max-w-[160px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* trend line */}
        <path d="M10 80 L40 75 L70 60 L100 65 L130 45 L160 50 L190 30" />
        {/* calendar dots */}
        <rect x="20" y="10" width="160" height="24" rx="4" />
        <line x1="20" y1="18" x2="180" y2="18" />
        <line x1="45" y1="10" x2="45" y2="34" />
        <line x1="75" y1="10" x2="75" y2="34" />
        <circle cx="58" cy="25" r="2" fill="currentColor" stroke="none" />
        <circle cx="88" cy="25" r="2" fill="currentColor" stroke="none" />
        <circle cx="118" cy="25" r="2" fill="currentColor" stroke="none" />
        <circle cx="148" cy="25" r="2" fill="currentColor" stroke="none" />
      </g>
    </svg>
  ),
  settingsNew: (
    <svg viewBox="0 0 160 140" className="w-full max-w-[120px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* checklist */}
        <rect x="20" y="20" width="120" height="100" rx="6" />
        <line x1="20" y1="40" x2="140" y2="40" />
        <circle cx="34" cy="56" r="6" />
        <polyline points="30 56 32 58 38 52" />
        <line x1="48" y1="56" x2="120" y2="56" />
        <circle cx="34" cy="80" r="6" />
        <polyline points="30 80 32 82 38 76" />
        <line x1="48" y1="80" x2="120" y2="80" />
        <circle cx="34" cy="104" r="6" />
        <polyline points="30 104 32 106 38 100" />
        <line x1="48" y1="104" x2="120" y2="104" />
      </g>
    </svg>
  ),
  settingsReturning: (
    <svg viewBox="0 0 140 140" className="w-full max-w-[120px]" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={lineCap} strokeLinejoin={lineJoin}>
        {/* gear */}
        <circle cx="70" cy="70" r="28" />
        <circle cx="70" cy="70" r="12" />
        <line x1="70" y1="14" x2="70" y2="30" />
        <line x1="70" y1="110" x2="70" y2="126" />
        <line x1="14" y1="70" x2="30" y2="70" />
        <line x1="110" y1="70" x2="126" y2="70" />
        <line x1="28" y1="28" x2="39" y2="39" />
        <line x1="101" y1="101" x2="112" y2="112" />
        <line x1="28" y1="112" x2="39" y2="101" />
        <line x1="101" y1="39" x2="112" y2="28" />
        {/* checkmark */}
        <circle cx="105" cy="35" r="14" />
        <polyline points="98 35 103 40 112 29" />
      </g>
    </svg>
  ),
};

export const CONTEXT_CONTENT: Record<RouteKey, RouteContext> = {
  home: {
    new: {
      headline: 'Your workday, in one place',
      body: 'Track today\'s jobs, send quotes, and record payments as you move between sites.',
      illustration: ILLUSTRATIONS.homeNew,
    },
    returning: {
      headline: 'Today\'s snapshot',
      body: 'Active jobs and anything that needs a nudge show up here.',
      illustration: ILLUSTRATIONS.homeReturning,
      extra: {
        type: 'stats',
        content: null, // populated by component with real data
      },
    },
  },
  jobs: {
    new: {
      headline: 'A job is a customer journey',
      body: 'Move jobs through each stage so you always know what\'s quoted, booked, or waiting to be paid.',
      illustration: ILLUSTRATIONS.jobsNew,
    },
    returning: {
      headline: 'Pipeline view',
      body: 'Use the tabs to zoom in on active or unpaid work.',
      illustration: ILLUSTRATIONS.jobsReturning,
      extra: {
        type: 'tip',
        content: 'Pro tip: tap a status group to expand or collapse it.',
      },
    },
  },
  activity: {
    new: {
      headline: 'Everything you did, recorded',
      body: 'Activity automatically logs quotes sent, payments, and status changes so you can look back later.',
      illustration: ILLUSTRATIONS.activityNew,
    },
    returning: {
      headline: 'Recent highlights',
      body: 'Patterns from the last 30 days appear here.',
      illustration: ILLUSTRATIONS.activityReturning,
      extra: {
        type: 'stats',
        content: null, // populated by component with real data
      },
    },
  },
  settings: {
    new: {
      headline: 'Set up once, save time every quote',
      body: 'Add your business name, trade, and default payment terms so quotes look professional.',
      illustration: ILLUSTRATIONS.settingsNew,
      extra: {
        type: 'shortcut',
        content: 'Start with business name →',
      },
    },
    returning: {
      headline: 'Your defaults',
      body: 'These details appear on every quote you send.',
      illustration: ILLUSTRATIONS.settingsReturning,
      extra: {
        type: 'status',
        content: null, // populated by component with real profile status
      },
    },
  },
};
