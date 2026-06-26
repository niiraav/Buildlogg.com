/**
 * Cold email templates for Buildlogg outreach.
 * Product-led, human tone, plain text.
 *
 * A/B testing: each step has subject variants. The send script
 * alternates between them so we can compare open rates.
 */

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  subcategory: string;
  score?: number;
  phone?: string;
}

export interface SubjectVariant {
  label: string;       // 'A', 'B', 'C' — for analytics tagging
  subject: string | ((lead: Lead) => string);
}

export interface EmailTemplate {
  /** Original subject (kept for backward compat) */
  subject: string | ((lead: Lead) => string);
  /** A/B test subject variants */
  subjectVariants: SubjectVariant[];
  body: (lead: Lead) => string;
}

export const LANDING_PAGE_URL = 'https://buildlogg.com';
export const DEMO_URL = 'https://https://buildlogg.com/#how';
export const BEAUTY_LANDING_PAGE_URL = 'https://buildlogg.com/beauty/';

// Vertical type — determines which template set and landing page to use
export type Vertical = 'trades' | 'beauty';

/* ─── Beauty category label helper ─── */

export function beautyLabel(subcategory: string): string {
  if (!subcategory) return 'salon';
  const s = subcategory.toLowerCase();
  if (s.includes('nail')) return 'nail';
  if (s.includes('beauty')) return 'beauty';
  if (s.includes('hair')) return 'hair';
  if (s.includes('tattoo')) return 'tattoo';
  if (s.includes('barber')) return 'barber';
  if (s.includes('spa')) return 'spa';
  if (s.includes('massage')) return 'massage';
  if (s.includes('thread')) return 'threading';
  if (s.includes('lash')) return 'lash';
  if (s.includes('brow')) return 'brow';
  if (s.includes('wax')) return 'waxing';
  if (s.includes('facial')) return 'facial';
  if (s.includes('makeup')) return 'makeup';
  if (s.includes('nail_tech')) return 'nail tech';
  return 'salon';
}

/* ─── Get template set for a vertical ─── */

export function getTemplates(vertical: Vertical): Record<string, EmailTemplate> {
  return vertical === 'beauty' ? beautyTemplates : templates;
}

/* ─── Get landing page URL for a vertical ─── */

export function getLandingUrl(vertical: Vertical): string {
  return vertical === 'beauty' ? BEAUTY_LANDING_PAGE_URL : LANDING_PAGE_URL;
}

/* ─── Helpers ─── */

export function firstName(name: string): string {
  if (!name || name.length < 2) return 'there';

  name = name.replace(/\d+$/, '');

  const honorifics = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sir', 'Lady', 'Lord', 'Miss'];
  for (const h of honorifics) {
    if (name.toLowerCase().startsWith(h.toLowerCase() + ' ')) {
      name = name.slice(h.length).trim();
      break;
    }
  }

  if (name.length > 2 && name === name.toUpperCase()) {
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  if (name.includes(' ')) {
    const first = name.split(' ')[0];
    if (first && first.length >= 2 && /^[A-Za-z]/.test(first)) return first;
    return 'there';
  }

  const businessWords = [
    'builders', 'construction', 'contractors', 'electrical', 'plumbing', 'roofing',
    'flooring', 'glazing', 'carpets', 'carpentry', 'landscaping', 'painting',
    'kitchen', 'bathroom', 'windows', 'aggregate', 'concrete', 'driveway',
    'cleaning', 'waste', 'recycling', 'heating', 'dry', 'accounts', 'sales',
  ];
  const lowerName = name.toLowerCase();
  if (businessWords.some(w => lowerName.includes(w))) {
    return 'there';
  }

  if (name.length >= 12 && !name.includes('-')) {
    return 'there';
  }

  if (/^[a-z]/.test(name)) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  if (name.length >= 2 && name.length < 20) {
    return name;
  }

  return 'there';
}

/**
 * Capitalize the first letter of a trade label for subject lines.
 * "plumbing" → "Plumbing", "waste management" → "Waste management"
 */
function capFirst(s: string): string {
  if (!s) return 'Trades';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Maps CSV subcategory to a natural trade label.
 * Returns a plural form for use in sentences.
 */
export function tradeLabel(subcategory: string): string {
  if (!subcategory) return 'trades';

  const exact: Record<string, string> = {
    plumbing: 'plumbing',
    electrical: 'electrical',
    electrician: 'electrical',
    flooring: 'flooring',
    waste_management: 'waste management',
    cleaning_service: 'cleaning',
    cleaning_services: 'cleaning',
    cleaning: 'cleaning',
    cleaners: 'cleaning',
    commercial_cleaning: 'cleaning',
    domestic_cleaning: 'cleaning',
    dry_cleaning: 'dry cleaning',
    dry_cleaners: 'dry cleaning',
    drycleaning: 'dry cleaning',
    dry_cleaning_laundry: 'dry cleaning',
    laundry_dry_cleaning: 'dry cleaning',
    landscaping: 'landscaping',
    landscapers: 'landscaping',
    landscape: 'landscaping',
    landscape_design: 'landscaping',
    landscape_gardening: 'landscaping',
    gardening: 'gardening',
    gardeners: 'gardening',
    garden_design: 'gardening',
    garden_maintenance: 'gardening',
    garden_services: 'gardening',
    roofing: 'roofing',
    roofing_contractor: 'roofing',
    glazing: 'glazing',
    glass_glazing: 'glazing',
    double_glazing: 'glazing',
    secondary_glazing: 'glazing',
    architectural_glazing: 'glazing',
    glazing_contractors: 'glazing',
    kitchen_design: 'kitchen design',
    home_improvement: 'home improvement',
    home_improvements: 'home improvement',
    home_renovation: 'home renovation',
    home_renovations: 'home renovation',
    renovation: 'renovation',
    renovations: 'renovation',
    renovation_service: 'renovation',
    construction: 'building',
    building: 'building',
    builder: 'building',
    builders: 'building',
    building_contractor: 'building',
    building_contractors: 'building',
    building_services: 'building',
    building_maintenance: 'building maintenance',
    building_repair: 'building repair',
    building_repairs: 'building repair',
    building_renovations: 'renovation',
    building_materials: 'building supplies',
    builders_merchant: 'builders merchant',
    builders_merchants: 'builders merchant',
    builder_merchant: 'builders merchant',
    building_supplies: 'building supplies',
    building_supply: 'building supplies',
    window_installation: 'window installation',
    window_installations: 'window installation',
    windows: 'window installation',
    windows_installation: 'window installation',
    windows_doors: 'window and door installation',
    windows_and_doors: 'window and door installation',
    doors_and_windows: 'window and door installation',
    doors_windows: 'window and door installation',
    window_treatments: 'window treatments',
    window_treatment: 'window treatments',
    window_blinds: 'window treatments',
    window_furnishings: 'window treatments',
    window_fashions: 'window treatments',
    window_shutters: 'window treatments',
    window_films: 'window tinting',
    window_tinting: 'window tinting',
    window_film: 'window tinting',
    heating_specialist: 'heating',
    heating: 'heating',
    heating_engineer: 'heating',
    heating_engineers: 'heating',
    heating_services: 'heating',
    heating_service: 'heating',
    heating_gas: 'heating',
    heating_plumbing: 'heating and plumbing',
    plumbing_heating: 'heating and plumbing',
    plumbing_heating_gas: 'heating and plumbing',
    central_heating: 'heating',
    boiler_installation: 'boiler installation',
    boiler_repair: 'boiler repair',
    boiler_service: 'boiler servicing',
    boiler_maintenance: 'boiler servicing',
    gas_engineer: 'gas engineering',
    gas_services: 'gas services',
    gas_service: 'gas services',
    gas_installation: 'gas installation',
    gas_heating: 'heating',
    hvac: 'HVAC',
    carpentry: 'carpentry',
    joinery: 'joinery',
    joinery_services: 'joinery',
    brickwork: 'brickwork',
    bricklaying: 'bricklaying',
    brickworks: 'brickwork',
    plastering: 'plastering',
    tiling: 'tiling',
    tiling_contractor: 'tiling',
    tiling_flooring: 'tiling and flooring',
    painting: 'painting and decorating',
    painting_and_decorating: 'painting and decorating',
    painting_decorating: 'painting and decorating',
    decorating: 'decorating',
    decorator: 'decorating',
    decorating_service: 'decorating',
    driveway: 'driveway installation',
    driveway_installation: 'driveway installation',
    driveway_services: 'driveway installation',
    paving: 'paving',
    paving_contractor: 'paving',
    patio: 'patio installation',
    decking: 'decking',
    fencing: 'fencing',
    fencing_contractor: 'fencing',
    fencing_services: 'fencing',
    gates_and_fencing: 'fencing',
    garden_fencing: 'fencing',
    loft_conversion: 'loft conversion',
    loft_conversions: 'loft conversion',
    loft_installation: 'loft conversion',
    conservatory_installation: 'conservatory installation',
    insulation: 'insulation',
    insulation_services: 'insulation',
    insulation_specialist: 'insulation',
    damp_proofing: 'damp proofing',
    damp_control: 'damp proofing',
    drainage: 'drainage',
    drainage_service: 'drainage',
    drainage_services: 'drainage',
    drainage_plumbing: 'drainage',
    drain_services: 'drainage',
    drain_clearance: 'drainage',
    gutter_cleaning: 'gutter cleaning',
    guttering: 'guttering',
    chimney: 'chimney services',
    chimney_repair: 'chimney repair',
    chimney_service: 'chimney services',
    chimney_services: 'chimney services',
    chimney_sweep: 'chimney sweeping',
    chimney_sweeping: 'chimney sweeping',
    chimney_sweeps: 'chimney sweeping',
    scaffolding: 'scaffolding',
    demolition_contractors: 'demolition',
    skip_hire: 'skip hire',
    waste_removal: 'waste removal',
    waste_clearance: 'waste removal',
    waste_disposal: 'waste disposal',
    waste_control: 'waste management',
    construction_waste_removal: 'waste removal',
    junk_removal: 'waste removal',
    house_clearance: 'house clearance',
    pest_control: 'pest control',
    locksmith: 'locksmith services',
    handyman: 'handyman',
    handyman_service: 'handyman',
    property_maintenance: 'property maintenance',
    property_repair: 'property repair',
    property_services: 'property services',
    facilities_maintenance: 'facilities maintenance',
    home_maintenance: 'home maintenance',
    grounds_maintenance: 'grounds maintenance',
    lawn_maintenance: 'lawn maintenance',
    pool_maintenance: 'pool maintenance',
    plant_maintenance: 'plant maintenance',
    fleet_maintenance: 'fleet maintenance',
    concrete: 'concrete',
    concrete_contractor: 'concrete',
    concrete_pumping: 'concrete pumping',
    concrete_services: 'concrete services',
    concrete_specialists: 'concrete',
    agri_contractors: 'agricultural contracting',
    agri_repairs: 'agricultural repairs',
    bathroom_fitter: 'bathroom fitting',
    bathroom_fitters: 'bathroom fitting',
    bathroom_fitting: 'bathroom fitting',
    bathroom_installation: 'bathroom fitting',
    bathroom_renovation: 'bathroom renovation',
    bathroom_renovations: 'bathroom renovation',
    bathroom_design: 'bathroom design',
    kitchen_fitter: 'kitchen fitting',
    kitchen_fitting: 'kitchen fitting',
    kitchen_installation: 'kitchen fitting',
    kitchen_bathroom: 'kitchen and bathroom fitting',
    kitchen_bathroom_installation: 'kitchen and bathroom fitting',
    kitchen_bathroom_fitters: 'kitchen and bathroom fitting',
    bathroom_kitchen: 'kitchen and bathroom fitting',
    bathroom_kitchen_installation: 'kitchen and bathroom fitting',
    bathroom_kitchens: 'kitchen and bathroom fitting',
    bath_renovation: 'bathroom renovation',
    bath_repair: 'bathroom repair',
    extension: 'extensions',
    garage_door: 'garage door installation',
    garage_door_installation: 'garage door installation',
    garage_doors: 'garage door installation',
    security_fencing: 'security fencing',
    earthworks_contractor: 'earthworks',
    haulage_contractor: 'haulage',
    haulage_contractors: 'haulage',
    general_contractor: 'general contracting',
    general_repairs: 'general repairs',
    repairs: 'repairs',
    repair_service: 'repair services',
    contractor: 'contracting',
    contractors: 'contracting',
    specialist_contractor: 'specialist contracting',
    maintenance: 'maintenance',
    maintenance_service: 'maintenance',
    maintenance_services: 'maintenance',
    timber_and_fencing: 'timber and fencing',
    contractor_vetting: 'contractor vetting',
    swimming_pool_contractor: 'swimming pool installation',
    landscaping_equipment: 'landscaping equipment supply',
    landscaping_supplies: 'landscaping supplies',
    pointing: 'pointing and repointing',
    pressure_washing: 'pressure washing',
    fencing_supplies: 'fencing supplies',
    fencing_supplier: 'fencing supplies',
    tiling_supplies: 'tiling supplies',
    carpet_fitter: 'carpet fitting',
    maritime_contractor: 'maritime contracting',
    furniture_contractor: 'furniture manufacturing',
    decking_supplier: 'decking supplies',
  };

  if (exact[subcategory]) return exact[subcategory];

  const s = subcategory.toLowerCase();

  if (s.includes('plumb')) return 'plumbing';
  if (s.includes('electr')) return 'electrical';
  if (s.includes('roof')) return 'roofing';
  if (s.includes('floor')) return 'flooring';
  if (s.includes('glaz') || s.includes('glass')) return 'glazing';
  if (s.includes('window')) return 'window installation';
  if (s.includes('door')) return 'door installation';
  if (s.includes('kitchen')) return 'kitchen fitting';
  if (s.includes('bathroom')) return 'bathroom fitting';
  if (s.includes('clean')) return 'cleaning';
  if (s.includes('waste') || s.includes('skip') || s.includes('clearance')) return 'waste removal';
  if (s.includes('heat') || s.includes('boiler')) return 'heating';
  if (s.includes('gas')) return 'gas services';
  if (s.includes('build') || s.includes('construct')) return 'building';
  if (s.includes('paint') || s.includes('decor')) return 'painting and decorating';
  if (s.includes('brick')) return 'brickwork';
  if (s.includes('plaster')) return 'plastering';
  if (s.includes('tile')) return 'tiling';
  if (s.includes('carpen') || s.includes('join')) return 'carpentry';
  if (s.includes('landscape') || s.includes('garden')) return 'landscaping';
  if (s.includes('fence')) return 'fencing';
  if (s.includes('driveway') || s.includes('paving') || s.includes('patio')) return 'driveway installation';
  if (s.includes('loft')) return 'loft conversion';
  if (s.includes('insulat')) return 'insulation';
  if (s.includes('damp') || s.includes('waterproof')) return 'damp proofing';
  if (s.includes('drain') || s.includes('gutter')) return 'drainage';
  if (s.includes('chimney')) return 'chimney services';
  if (s.includes('scaffold')) return 'scaffolding';
  if (s.includes('concrete')) return 'concrete';
  if (s.includes('demolition')) return 'demolition';
  if (s.includes('handyman') || s.includes('handy')) return 'handyman';
  if (s.includes('maintenance') || s.includes('repair') || s.includes('service')) return 'maintenance and repair';
  if (s.includes('renovat') || s.includes('improvement')) return 'home improvement';
  if (s.includes('timber')) return 'timber and fencing';
  if (s.includes('swimming') || s.includes('pool')) return 'swimming pool installation';
  if (s.includes('pointing')) return 'pointing and repointing';
  if (s.includes('vetting')) return 'contractor vetting';
  if (s.includes('pressure') || s.includes('jet_wash') || s.includes('jetwash')) return 'pressure washing';
  if (s.includes('carpet')) return 'carpet fitting';
  if (s.includes('maritime') || s.includes('marine')) return 'maritime contracting';
  if (s.includes('furniture')) return 'furniture manufacturing';
  if (s.includes('decking')) return 'decking';
  if (s.includes('supplies') || s.includes('supplier')) return 'trade supplies';

  return 'trades';
}

/* ─── Generic email detection (for filtering) ─── */

const GENERIC_PREFIXES = [
  'info@', 'sales@', 'enquiries@', 'accounts@', 'admin@', 'office@',
  'contact@', 'hello@', 'mail@', 'enquiry@', 'general@', 'support@',
  'help@', 'team@', 'reception@', 'booking@', 'bookings@', 'orders@',
  'customer@', 'service@', 'services@', 'marketing@', 'noreply@',
  'no-reply@', 'donotreply@', 'postmaster@', 'webmaster@',
];

export function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  return GENERIC_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/* ─── 4-Email Sequence with A/B subject variants ─── */

export const templates: Record<string, EmailTemplate> = {
  email1: {
    subject: 'The admin you do at 9pm',
    subjectVariants: [
      { label: 'A', subject: 'The admin you do at 9pm' },
      { label: 'B', subject: 'Quick question about your quotes' },
      { label: 'C', subject: (lead: Lead) => `${capFirst(tradeLabel(lead.subcategory))} quotes from your phone?` },
    ],
    body: (lead: Lead) => {
      const trade = tradeLabel(lead.subcategory);
      const company = lead.company || 'your business';
      return `Hi ${firstName(lead.name)},

${company} — most ${trade} businesses we talk to are still doing quotes and invoices from the sofa at 9pm.

We built Buildlogg to fix that. It's live now — send a professional quote from your phone in about a minute. Customer approves, books the slot, pays. No laptop, no spreadsheet, no chasing.

If that sounds useful: https://buildlogg.com

James
Buildlogg`;
    },
  },

  email2: {
    subject: 'How do you send quotes right now?',
    subjectVariants: [
      { label: 'A', subject: 'How do you send quotes right now?' },
      { label: 'B', subject: 'The quote-to-payment flow' },
    ],
    body: (lead: Lead) => {
      return `Hi ${firstName(lead.name)},

Following up on my last email — quick question.

When a customer asks for a quote, what does that actually look like for you? Word doc? WhatsApp? A text with a number?

Buildlogg does it from your phone in about a minute — quote, booking, payment, all in one flow. No laptop, no spreadsheet, no chasing.

Here's what it looks like in practice: https://buildlogg.com/#how

James
Buildlogg`;
    },
  },

  email3: {
    subject: 'Probably already got this sorted',
    subjectVariants: [
      { label: 'A', subject: 'Probably already got this sorted' },
      { label: 'B', subject: 'When the spreadsheet stops working' },
    ],
    body: (lead: Lead) => {
      return `Hi ${firstName(lead.name)},

I get it — you've probably already got a system. Most tradespeople I talk to use a mix of WhatsApp, a notebook, and a spreadsheet (or three).

The thing is, those systems work fine until you're juggling five jobs and someone's chasing an invoice you forgot to send.

Buildlogg just puts it all in one place on your phone. Quotes, scheduling, invoices, payments — even offline if you're in a basement with no signal.

Here's what it looks like: https://buildlogg.com/#how

James
Buildlogg`;
    },
  },

  email4: {
    subject: 'Shall I leave you to it?',
    subjectVariants: [
      { label: 'A', subject: 'Shall I leave you to it?' },
      { label: 'B', subject: 'Last one from me' },
    ],
    body: (lead: Lead) => {
      return `Hi ${firstName(lead.name)},

I'll stop emailing after this — don't want to be a nuisance.

If any of this sounds useful, the app's live here: https://buildlogg.com

If not, no worries. Reply "no" and I won't bother you again.

James
Buildlogg`;
    },
  },
};

/* ─── Beauty Vertical: 4-Email Sequence ─── */
/* Pain angle: no-shows, late cancellations, lost revenue from empty chairs   */
/* Landing page: buildlogg.com/beauty/                                        */

export const beautyTemplates: Record<string, EmailTemplate> = {
  email1: {
    subject: 'Quick question about your bookings',
    subjectVariants: [
      { label: 'A', subject: 'Quick question about your bookings' },
      { label: 'B', subject: 'Your empty chair is costing you' },
      { label: 'C', subject: (lead: Lead) => `${lead.company || 'Your salon'} — deposits for no-shows?` },
    ],
    body: (lead: Lead) => {
      const label = beautyLabel(lead.subcategory);
      const company = lead.company || 'your salon';
      return `Hi ${firstName(lead.name)},

${company} — every ${label} business we talk to loses money to no-shows. A client books a slot, doesn't turn up, and that chair sits empty for an hour.

Buildlogg fixes that. Take deposits at booking, send automatic reminders, and auto-charge for late cancellations — all from your phone. No more chasing, no more lost revenue.

If that sounds useful: https://buildlogg.com/beauty

James
Buildlogg`;
    },
  },

  email2: {
    subject: 'What happens when a client doesn\'t show?',
    subjectVariants: [
      { label: 'A', subject: 'What happens when a client doesn\'t show?' },
      { label: 'B', subject: 'The booking-to-deposit flow' },
    ],
    body: (lead: Lead) => {
      const label = beautyLabel(lead.subcategory);
      return `Hi ${firstName(lead.name)},

Following up on my last email - quick question.

When a ${label} client doesn't show up, what does that actually cost you? The chair time, the product, the preparation — it adds up. Most ${label} businesses we talk to just absorb it.

Buildlogg lets you take a deposit at booking. Client pays in advance, gets a reminder 24 hours before, and if they cancel late — the deposit stays with you. All from your phone.

Here's how it works: https://buildlogg.com/beauty

James
Buildlogg`;
    },
  },

  email3: {
    subject: 'Probably already got this sorted',
    subjectVariants: [
      { label: 'A', subject: 'Probably already got this sorted' },
      { label: 'B', subject: 'When the booking book stops working' },
    ],
    body: (lead: Lead) => {
      return `Hi ${firstName(lead.name)},

I get it — you've probably already got a system. Most salon owners I talk to use a mix of Instagram DMs, a paper booking book, and a payment terminal.

The thing is, those systems work fine until a client no-shows and you're left with an empty chair and no deposit.

Buildlogg just puts it all in one place on your phone. Bookings, deposits, reminders, cancellations — even offline if you're in a basement room with no signal.

Here's what it looks like: https://buildlogg.com/beauty

James
Buildlogg`;
    },
  },

  email4: {
    subject: 'Shall I leave you to it?',
    subjectVariants: [
      { label: 'A', subject: 'Shall I leave you to it?' },
      { label: 'B', subject: 'Last one from me' },
    ],
    body: (lead: Lead) => {
      return `Hi ${firstName(lead.name)},

I'll stop emailing after this — don't want to be a nuisance.

If the no-show thing is a real problem for you, the app's live here: https://buildlogg.com/beauty

If not, no worries. Reply "no" and I won't bother you again.

James
Buildlogg`;
    },
  },
};
