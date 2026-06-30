import { TRADE_TEMPLATES, BEAUTY_TEMPLATES, BARBER_TEMPLATES, GROOMING_TEMPLATES, MASSAGE_TEMPLATES, TUTORING_TEMPLATES, type TemplateSeed } from './tradeTemplates';

export interface MatchResult {
  templates: TemplateSeed[];
  sampleJobKey: string;
  isTrade: boolean;
}

const KEYWORD_MAP: Array<{ keywords: string[]; templates: TemplateSeed[]; sampleJobKey: string; isTrade: boolean }> = [
  { keywords: ['plumb'], templates: TRADE_TEMPLATES['plumber'], sampleJobKey: 'plumber', isTrade: true },
  { keywords: ['elect'], templates: TRADE_TEMPLATES['electrician'], sampleJobKey: 'electrician', isTrade: true },
  { keywords: ['build', 'brick', 'construct'], templates: TRADE_TEMPLATES['builder'], sampleJobKey: 'builder', isTrade: true },
  { keywords: ['paint', 'decor'], templates: TRADE_TEMPLATES['other'], sampleJobKey: 'other_trades', isTrade: true },
  { keywords: ['photo'], templates: TRADE_TEMPLATES['photographer'], sampleJobKey: 'photographer', isTrade: false },
  { keywords: ['clean'], templates: TRADE_TEMPLATES['cleaning'], sampleJobKey: 'cleaning', isTrade: false },
  { keywords: ['nail'], templates: BEAUTY_TEMPLATES, sampleJobKey: 'nail_tech', isTrade: false },
  { keywords: ['lash'], templates: BEAUTY_TEMPLATES, sampleJobKey: 'lash_tech', isTrade: false },
  { keywords: ['salon', 'beauty'], templates: BEAUTY_TEMPLATES, sampleJobKey: 'salon', isTrade: false },
  { keywords: ['barber', 'hair', 'fade'], templates: BARBER_TEMPLATES, sampleJobKey: 'barber', isTrade: false },
  { keywords: ['groom', 'dog'], templates: GROOMING_TEMPLATES, sampleJobKey: 'grooming', isTrade: false },
  { keywords: ['massage', 'therapy', 'spa'], templates: MASSAGE_TEMPLATES, sampleJobKey: 'massage', isTrade: false },
  { keywords: ['tutor', 'teach', 'lesson'], templates: TUTORING_TEMPLATES, sampleJobKey: 'tutoring', isTrade: false },
];

const GENERIC_FALLBACKS: Record<string, { templates: TemplateSeed[]; sampleJobKey: string; isTrade: boolean }> = {
  quotes: { templates: TRADE_TEMPLATES['other'], sampleJobKey: 'other_trades', isTrade: true },
  bookings: { templates: BEAUTY_TEMPLATES, sampleJobKey: 'beauty_other', isTrade: false },
  both: { templates: [...TRADE_TEMPLATES['other'], ...BEAUTY_TEMPLATES], sampleJobKey: 'other_trades', isTrade: true },
};

export function matchTemplates(text: string, appMode: 'quotes' | 'bookings' | 'both'): MatchResult {
  const lower = text.toLowerCase().trim();
  if (!lower) return GENERIC_FALLBACKS[appMode] || GENERIC_FALLBACKS.quotes;

  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return { templates: entry.templates, sampleJobKey: entry.sampleJobKey, isTrade: entry.isTrade };
    }
  }
  return GENERIC_FALLBACKS[appMode] || GENERIC_FALLBACKS.quotes;
}
