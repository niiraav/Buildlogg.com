/**
 * Vertical configuration — adapts app terminology, features, and defaults
 * based on the user's business type (trades vs beauty vs other).
 */
import type { TemplateSeed } from './tradeTemplates';
import { TRADE_TEMPLATES, BEAUTY_TEMPLATES } from './tradeTemplates';

export type BusinessType = 'trades' | 'beauty' | 'home_services' | 'professional' | 'other';

export interface VerticalConfig {
  labels: {
    job: string;
    quote: string;
    callout: string;
    customer: string;
    lineItem: string;
    customItems: string;
  };
  features: {
    showMaterials: boolean;
    showCalloutCharge: boolean;
    showLogMissedCall: boolean;
    showServiceMenu: boolean;
    requireDeposit: boolean;
    depositDefaults: number[];
  };
  templates: TemplateSeed[];
  defaultPaymentTerms: 'on_completion' | 'deposit' | 'invoice';
}

const TRADES_CONFIG: VerticalConfig = {
  labels: {
    job: 'Job',
    quote: 'Quote',
    callout: 'Callout charge',
    customer: 'Customer',
    lineItem: 'Line item',
    customItems: 'Custom items',
  },
  features: {
    showMaterials: true,
    showCalloutCharge: true,
    showLogMissedCall: true,
    showServiceMenu: false,
    requireDeposit: false,
    depositDefaults: [50, 100, 200],
  },
  templates: TRADE_TEMPLATES['other'],
  defaultPaymentTerms: 'on_completion',
};

const BEAUTY_CONFIG: VerticalConfig = {
  labels: {
    job: 'Appointment',
    quote: 'Booking',
    callout: 'Booking fee',
    customer: 'Client',
    lineItem: 'Service',
    customItems: 'Service menu',
  },
  features: {
    showMaterials: false,
    showCalloutCharge: false,
    showLogMissedCall: false,
    showServiceMenu: true,
    requireDeposit: true,
    depositDefaults: [15, 25, 50],
  },
  templates: BEAUTY_TEMPLATES,
  defaultPaymentTerms: 'deposit',
};

const BOTH_CONFIG: VerticalConfig = {
  labels: {
    job: 'Job',
    quote: 'Quote',
    callout: 'Booking fee',
    customer: 'Customer',
    lineItem: 'Item',
    customItems: 'Price list',
  },
  features: {
    showMaterials: true,
    showCalloutCharge: false,
    showLogMissedCall: true,
    showServiceMenu: true,
    requireDeposit: true,
    depositDefaults: [15, 25, 50],
  },
  templates: [],
  defaultPaymentTerms: 'deposit',
};

const CONFIGS: Record<string, VerticalConfig> = {
  trades: TRADES_CONFIG,
  beauty: BEAUTY_CONFIG,
  both: BOTH_CONFIG,
  home_services: TRADES_CONFIG,
  professional: TRADES_CONFIG,
  other: TRADES_CONFIG,
};

export function getVerticalConfig(businessType?: string): VerticalConfig {
  if (!businessType || !CONFIGS[businessType]) return TRADES_CONFIG;
  return CONFIGS[businessType];
}

export function getAppModeConfig(appMode?: string): VerticalConfig {
  if (appMode === 'bookings') return BEAUTY_CONFIG;
  if (appMode === 'both') return BOTH_CONFIG;
  return TRADES_CONFIG;
}

export function getVerticalFromUrl(): BusinessType | null {
  const url = window.location.href;
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source');
  if (source === 'beauty-landing' || url.includes('/beauty/')) return 'beauty';
  if (source === 'trades-landing') return 'trades';
  return null;
}

export function getAppModeFromUrl(): 'bookings' | null {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source');
  if (source === 'beauty-landing' || source === 'beauty-micro') return 'bookings';
  return null;
}
