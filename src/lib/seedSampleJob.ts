/**
 * Sample Job Onboarding — seeds one realistic sample job into Dexie
 * so new users land on a populated home screen instead of "All clear."
 * Local-only: never synced to Supabase (uses _sync_status: 'synced',
 * no sync queue entries). Auto-archived when the first real job is created.
 */
import { db, type Profile, type Job, type Customer, type LineItem, type WorkLogEntry } from './db';

interface SampleData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  jobTitle: string;
  items: Array<{ description: string; amount: number }>;
}

const SAMPLE_DATA: Record<string, SampleData> = {
  plumber: {
    customerName: "Mark O'Connor",
    customerPhone: '07000000000',
    customerAddress: '22 Elm Close, London SW4',
    jobTitle: 'New radiator install',
    items: [
      { description: 'Radiator (600×800 double)', amount: 85 },
      { description: 'Labour', amount: 0 },
    ],
  },
  electrician: {
    customerName: 'James Patel',
    customerPhone: '07000000000',
    customerAddress: '15 Oak Road, Birmingham B20',
    jobTitle: 'Fuse board replacement',
    items: [
      { description: 'Consumer unit (dual RCD)', amount: 450 },
      { description: 'Labour', amount: 0 },
    ],
  },
  builder: {
    customerName: 'Tom Brennan',
    customerPhone: '07000000000',
    customerAddress: '8 Mill Lane, Manchester M21',
    jobTitle: 'Extension — brickwork',
    items: [
      { description: 'Bricks (per 100)', amount: 340 },
      { description: 'Labour (per day)', amount: 0 },
    ],
  },
  other_trades: {
    customerName: 'Alex Morgan',
    customerPhone: '07000000000',
    customerAddress: '3 Station Rd, Leeds LS1',
    jobTitle: 'General repair work',
    items: [
      { description: 'Materials', amount: 50 },
      { description: 'Labour', amount: 0 },
    ],
  },
  nail_tech: {
    customerName: 'Sarah Mitchell',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Gel full set + soak off',
    items: [
      { description: 'Gel full set', amount: 45 },
      { description: 'Soak off', amount: 15 },
    ],
  },
  lash_tech: {
    customerName: 'Emma Clarke',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Lash infill',
    items: [{ description: 'Classic infill', amount: 35 }],
  },
  salon: {
    customerName: 'Lisa Turner',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Full colour & blow dry',
    items: [
      { description: 'Full colour', amount: 85 },
      { description: 'Blow dry', amount: 35 },
    ],
  },
  barber: {
    customerName: 'Mike Davies',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Skin fade & beard',
    items: [
      { description: 'Skin fade', amount: 25 },
      { description: 'Beard trim', amount: 15 },
    ],
  },
  beauty_other: {
    customerName: 'Sarah Mitchell',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Treatment',
    items: [{ description: 'Treatment', amount: 50 }],
  },
  photographer: {
    customerName: 'Emma Clarke',
    customerPhone: '07000000000',
    customerAddress: '12 Park Ave, London N1',
    jobTitle: 'Wedding — deposit',
    items: [{ description: 'Wedding package', amount: 1500 }],
  },
  cleaning: {
    customerName: 'Sarah Mitchell',
    customerPhone: '07000000000',
    customerAddress: '45 Oak Rd, Birmingham B20',
    jobTitle: 'End of tenancy clean',
    items: [{ description: 'End of tenancy clean', amount: 250 }],
  },
  grooming: {
    customerName: 'Lisa Turner',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'Small dog groom — Bella',
    items: [{ description: 'Small dog groom', amount: 45 }],
  },
  massage: {
    customerName: 'James Wilson',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: '60-min massage',
    items: [{ description: '60-min massage', amount: 60 }],
  },
  tutoring: {
    customerName: 'Priya Sharma',
    customerPhone: '07000000000',
    customerAddress: '',
    jobTitle: 'GCSE maths — 1hr',
    items: [{ description: '1-hour session', amount: 40 }],
  },
};

export async function seedSampleJob(
  userId: string,
  profile: Profile | null,
  sampleJobKey: string,
  appMode: string,
): Promise<void> {
  // Guard: skip if a sample job already exists
  const existing = await db.jobs.where('user_id').equals(userId).toArray();
  if (existing.some((j) => j.is_sample)) return;

  const key = SAMPLE_DATA[sampleJobKey] ? sampleJobKey : (appMode === 'bookings' ? 'beauty_other' : 'other_trades');
  const data = SAMPLE_DATA[key];
  if (!data) return;

  const now = new Date();
  // Use a realistic 8:30 AM start time instead of Date.now() (which could be any time)
  const today830 = new Date(now);
  today830.setHours(8, 30, 0, 0);
  // If 8:30 AM has already passed today, use it; otherwise use yesterday's 8:30 AM
  if (today830 > now) today830.setDate(today830.getDate() - 1);
  const twoHoursAgo = today830.toISOString();
  const firstName = data.customerName.split(' ')[0] || 'there';
  const businessName = profile?.business_name || profile?.full_name || 'Your business';
  const defaultLabour = profile?.default_labour_charge || 75;
  const paymentTerms = profile?.payment_terms || 'on_completion';

  // 1. Create sample customer
  const customerId = crypto.randomUUID();
  const customer: Customer = {
    id: customerId,
    user_id: userId,
    name: data.customerName,
    phone: data.customerPhone,
    address: data.customerAddress || undefined,
    is_sample: true,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    _sync_status: 'synced',
  };
  await db.customers.add(customer);

  // 2. Create sample job
  const jobId = crypto.randomUUID();
  const validUntil = new Date(now.getTime() + (profile?.quote_valid_days || 30) * 86400000).toISOString();
  const quoteSentAt = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
  const bookedAt = new Date(now.getTime() - 2.5 * 60 * 60 * 1000).toISOString(); // 2.5h ago

  const job: Job = {
    id: jobId,
    user_id: userId,
    customer_id: customerId,
    title: data.jobTitle,
    job_number: 'J-SAMPLE',
    status: 'in_progress',
    scheduled_start: twoHoursAgo,
    is_multi_day: false,
    payment_terms: paymentTerms,
    quote_sent_at: quoteSentAt,
    quote_send_method: 'whatsapp',
    quote_expires_at: validUntil,
    actual_start: twoHoursAgo,
    is_sample: true,
    created_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago
    updated_at: twoHoursAgo,
    _sync_status: 'synced',
  };
  await db.jobs.add(job);

  // 3. Create line items (replace amount 0 with default labour charge)
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const amount = item.amount === 0 ? defaultLabour : item.amount;
    const lineItem: LineItem = {
      id: crypto.randomUUID(),
      job_id: jobId,
      description: item.description,
      amount,
      sort_order: i,
      added_on_site: false,
      is_sample: true,
      created_at: quoteSentAt,
      _sync_status: 'synced',
    };
    await db.line_items.add(lineItem);
  }

  // 4. Create work log entries (sequenced to tell the flow story)
  const log1: WorkLogEntry = {
    id: crypto.randomUUID(),
    job_id: jobId,
    type: 'quote_sent',
    description: `[Quote sent via WhatsApp] Hi ${firstName}, here's your quote for ${data.jobTitle}. Total: £${data.items.reduce((s, i) => s + (i.amount === 0 ? defaultLabour : i.amount), 0).toFixed(2)}. Let me know if you'd like to book. — ${businessName}`,
    created_at: quoteSentAt,
    is_sample: true,
    _sync_status: 'synced',
  };
  await db.work_log.add(log1);

  const log2: WorkLogEntry = {
    id: crypto.randomUUID(),
    job_id: jobId,
    type: 'status_change',
    description: 'Marked as booked',
    created_at: bookedAt,
    is_sample: true,
    _sync_status: 'synced',
  };
  await db.work_log.add(log2);

  const log3: WorkLogEntry = {
    id: crypto.randomUUID(),
    job_id: jobId,
    type: 'status_change',
    description: 'Job started',
    created_at: twoHoursAgo,
    is_sample: true,
    _sync_status: 'synced',
  };
  await db.work_log.add(log3);
}

export async function archiveSampleJobs(userId: string): Promise<number> {
  const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
  const samples = allJobs.filter((j) => j.is_sample === true);

  for (const job of samples) {
    // Delete line items
    await db.line_items.where('job_id').equals(job.id).delete();
    // Delete work log entries
    await db.work_log.where('job_id').equals(job.id).delete();
    // Delete the job
    await db.jobs.delete(job.id);
    // Delete the sample customer (only if it's a sample)
    if (job.customer_id) {
      const customer = await db.customers.get(job.customer_id);
      if (customer?.is_sample) {
        await db.customers.delete(job.customer_id);
      }
    }
  }

  // Clear the exploration flag
  localStorage.removeItem('buildlogg_sample_explored');

  return samples.length;
}
