/**
 * Trade-specific template seeds for the custom items library.
 * Seeded on first onboarding completion — gives users a starting
 * toolbox instead of an empty item library.
 */

export interface TemplateSeed {
  description: string;
  detail?: string;
  amount: number;
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
};

export const BEAUTY_TEMPLATES: TemplateSeed[] = [
  { description: 'Full set nails', amount: 45 },
  { description: 'Gel polish', amount: 25 },
  { description: 'Lash full set', amount: 65 },
  { description: 'Lash infill', amount: 35 },
  { description: 'Brow wax + shape', amount: 18 },
  { description: 'Manicure', amount: 25 },
  { description: 'Pedicure', amount: 30 },
  { description: 'Tint (lash or brow)', amount: 15 },
  { description: 'Nail art (per nail)', amount: 3 },
  { description: 'Treatment (per hour)', amount: 50 },
];
