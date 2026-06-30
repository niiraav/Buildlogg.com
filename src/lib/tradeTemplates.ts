/**
 * Trade-specific template seeds for the custom items library.
 * Seeded on first onboarding completion — gives users a starting
 * toolbox instead of an empty item library.
 */

export interface TemplateSeed {
  description: string;
  detail?: string;
  amount: number;
  duration_minutes?: number;
  is_public?: boolean;
}

export const TRADE_TEMPLATES: Record<string, TemplateSeed[]> = {
  plumber: [
    { description: 'Radiator (600×800 double)', amount: 85 },
    { description: 'TRV + lockshield', amount: 35 },
    { description: 'Pipe + fittings (per m)', amount: 12 },
    { description: 'Boiler service', amount: 95 },
    { description: 'Boiler (combi replacement)', amount: 1800 },
    { description: 'Labour (per hour)', amount: 75 },
    { description: 'Callout charge', amount: 75 },
    { description: 'MagnaClean filter', amount: 120 },
    { description: 'Thermostatic radiator valve', amount: 45 },
    { description: 'Powerflush', amount: 350 },
  ],
  electrician: [
    { description: 'Consumer unit (dual RCD)', amount: 450 },
    { description: 'Socket (single)', amount: 35 },
    { description: 'Light switch (1-gang)', amount: 28 },
    { description: 'Light fitting', amount: 45 },
    { description: 'PAT test (per item)', amount: 3 },
    { description: 'EICR certificate', amount: 150 },
    { description: 'Labour (per hour)', amount: 70 },
    { description: 'Downlight (LED)', amount: 25 },
    { description: 'Smoke alarm (mains)', amount: 65 },
    { description: 'EV charger installation', amount: 650 },
  ],
  builder: [
    { description: 'Bricks (per 100)', amount: 85 },
    { description: 'Cement (25kg bag)', amount: 8 },
    { description: 'Labour (per day)', amount: 250 },
    { description: 'Labour (per hour)', amount: 45 },
    { description: 'Plasterboard (8×4 sheet)', amount: 15 },
    { description: 'Skimming (per m²)', amount: 18 },
    { description: 'Lintel (concrete)', amount: 35 },
    { description: 'Insulation (100mm roll)', amount: 25 },
    { description: 'Mortar (per m²)', amount: 12 },
    { description: 'Damp proof course', amount: 120 },
  ],
  other: [
    { description: 'Labour (per hour)', amount: 50 },
    { description: 'Labour (per day)', amount: 300 },
    { description: 'Callout charge', amount: 75 },
  ],
  photographer: [
    { description: 'Wedding package', amount: 1500 },
    { description: 'Portrait session', amount: 250 },
    { description: 'Event coverage', amount: 500 },
    { description: 'Editing (per hour)', amount: 50 },
    { description: 'Print (A4)', amount: 25 },
  ],
  cleaning: [
    { description: 'One-off deep clean', amount: 120 },
    { description: 'Regular weekly clean', amount: 40 },
    { description: 'End of tenancy clean', amount: 250 },
    { description: 'Carpet cleaning', amount: 60 },
    { description: 'Window cleaning', amount: 25 },
  ],
};

export const BEAUTY_TEMPLATES: TemplateSeed[] = [
  { description: 'Full set nails', amount: 45, duration_minutes: 90, is_public: true },
  { description: 'Gel polish', amount: 25, duration_minutes: 30, is_public: true },
  { description: 'Lash full set', amount: 65, duration_minutes: 120, is_public: true },
  { description: 'Lash infill', amount: 35, duration_minutes: 60, is_public: true },
  { description: 'Brow wax + shape', amount: 18, duration_minutes: 15, is_public: true },
  { description: 'Manicure', amount: 25, duration_minutes: 45, is_public: true },
  { description: 'Pedicure', amount: 30, duration_minutes: 45, is_public: true },
  { description: 'Tint (lash or brow)', amount: 15, duration_minutes: 15, is_public: true },
  { description: 'Nail art (per nail)', amount: 3, duration_minutes: 15, is_public: true },
  { description: 'Treatment (per hour)', amount: 50, duration_minutes: 60, is_public: true },
];

export const BARBER_TEMPLATES: TemplateSeed[] = [
  { description: 'Skin fade', amount: 25, duration_minutes: 30, is_public: true },
  { description: 'Beard trim', amount: 15, duration_minutes: 15, is_public: true },
  { description: 'Cut & finish', amount: 30, duration_minutes: 45, is_public: true },
  { description: 'Hot towel shave', amount: 20, duration_minutes: 30, is_public: true },
  { description: 'Kids cut', amount: 15, duration_minutes: 30, is_public: true },
];

export const GROOMING_TEMPLATES: TemplateSeed[] = [
  { description: 'Small dog groom', amount: 45, duration_minutes: 90, is_public: true },
  { description: 'Large dog groom', amount: 65, duration_minutes: 120, is_public: true },
  { description: 'Nail clipping', amount: 15, duration_minutes: 15, is_public: true },
  { description: 'Bath & dry', amount: 30, duration_minutes: 60, is_public: true },
  { description: 'Full groom + extras', amount: 80, duration_minutes: 150, is_public: true },
];

export const MASSAGE_TEMPLATES: TemplateSeed[] = [
  { description: '30-min massage', amount: 35, duration_minutes: 30, is_public: true },
  { description: '60-min massage', amount: 60, duration_minutes: 60, is_public: true },
  { description: '90-min massage', amount: 85, duration_minutes: 90, is_public: true },
  { description: 'Sports massage', amount: 70, duration_minutes: 60, is_public: true },
];

export const TUTORING_TEMPLATES: TemplateSeed[] = [
  { description: '1-hour session', amount: 40, duration_minutes: 60, is_public: true },
  { description: '30-min session', amount: 25, duration_minutes: 30, is_public: true },
  { description: 'Group session', amount: 15, duration_minutes: 60, is_public: true },
  { description: 'Initial assessment', amount: 50, duration_minutes: 90, is_public: true },
];
