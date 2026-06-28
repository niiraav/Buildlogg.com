/**
 * Entitlements — feature map for free vs Pro tiers.
 *
 * Free forever, no volume limits. Pro gates specific features.
 * Adding a new Pro feature = add to Feature type + PRO_FEATURES array.
 */

export type Feature =
  | 'remove_signature'     // Remove "Sent via Buildlogg" from messages
  | 'pdf_quotes'           // Generate PDF quotes/invoices
  | 'pdf_send'             // Attach PDF to WhatsApp/SMS
  | 'pdf_branding'         // Logo on PDFs
  | 'pdf_bank_details'     // Bank details on PDF
  | 'pdf_vat'              // VAT on invoices
  | 'message_templates'    // Use saved message templates
  | 'revenue_dashboard'    // Stats dashboard
  | 'customer_crm_stats'   // Per-customer stats (total spent, job count)
  | 'customer_dedup'       // Find/merge duplicate customers
  | 'google_reviews'       // Post-payment review prompts
  | 'scheduling_conflicts' // Conflict detection on booking
  | 'custom_item_library'  // Saved line items + trade templates
  | 'business_insights'    // Dashboard coaching insights (W3-3)
  | 'branded_emails'        // Branded reminder emails (Sprint 3)

export const PRO_FEATURES: Feature[] = [
  'remove_signature',
  'pdf_quotes',
  'pdf_send',
  'pdf_branding',
  'pdf_bank_details',
  'pdf_vat',
  'message_templates',
  'revenue_dashboard',
  'customer_crm_stats',
  'customer_dedup',
  'google_reviews',
  'scheduling_conflicts',
  'custom_item_library',
  'business_insights',
  'branded_emails',
]

export function isProFeature(feature: Feature): boolean {
  return PRO_FEATURES.includes(feature)
}
