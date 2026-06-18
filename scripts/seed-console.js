// ============================================================
// Buildlogg Demo Data Seeder — Console Version
// Paste this entire block into browser DevTools console, then press Enter
// ============================================================

(async function() {
  const db = window.db;
  if (!db) {
    console.error('❌ window.db not found. Wait for the app to fully load first, then paste again.');
    return;
  }

  const now = () => new Date().toISOString();
  const userId = 'demo-user-001';
  const n = now();

  // ─── 1. PROFILE ───
  await db.profiles.put({
    id: userId, full_name: 'Dave Richards', phone: '+447700900123',
    business_name: 'Dave Plumbing', trade: 'plumber',
    callout_charge: 75, payment_terms: 'on_completion',
    default_labour_description: 'Labour', default_labour_charge: 60,
    quote_valid_days: 30, created_at: n, updated_at: n, _sync_status: 'synced',
  });

  // ─── 2. CUSTOMERS ───
  const customers = [
    { id: 'cust-001', name: 'Sarah Mitchell', phone: '07700 900456', address: '12 Oak Avenue, London SE1 3AB' },
    { id: 'cust-002', name: 'Tom Jenkins', phone: '07700 900789', address: '45 High Street, London E2 7LB' },
    { id: 'cust-003', name: 'Priya Shah', phone: '07700 900234', address: '8 Maple Road, London N1 5RT' },
    { id: 'cust-004', name: 'Mark O\'Connor', phone: '07700 900567', address: '22 Elm Close, London SW4 9XY' },
    { id: 'cust-005', name: 'James Henderson', phone: '07700 900890', address: '156 High Street, London EC1A 4DD' },
    { id: 'cust-006', name: 'Unknown', phone: '07700 900111', address: '' },
    { id: 'cust-007', name: 'Emily Watson', phone: '07700 900222', address: '3 Birch Lane, London W1 4QZ' },
  ];
  for (const c of customers) {
    await db.customers.put({ ...c, user_id: userId, created_at: n, updated_at: n, _sync_status: 'synced' });
  }

  // ─── 3. JOBS ───
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 5);
  const toISO = d => d.toISOString();

  const jobs = [
    { id: 'job-hero', customer_id: 'cust-001', title: 'Boiler Service & Safety Check', status: 'quoted',
      payment_terms: 'on_completion', job_number: 'J-1001', quote_sent_at: toISO(yesterday),
      quote_expires_at: toISO(new Date(yesterday.getTime() + 30 * 86400000)),
      created_at: toISO(lastWeek), updated_at: toISO(yesterday) },
    // Tom — Booked
    { id: 'job-002', customer_id: 'cust-002', title: 'Fuse Box Upgrade', status: 'booked',
      payment_terms: 'on_completion', job_number: 'J-1002', scheduled_start: toISO(tomorrow),
      created_at: toISO(lastWeek), updated_at: toISO(yesterday) },
    // Priya — Awaiting payment
    { id: 'job-003', customer_id: 'cust-003', title: 'Leak Repair', status: 'awaiting_payment',
      payment_terms: 'on_completion', job_number: 'J-1003', invoice_number: 'INV-1001', invoice_sent_at: toISO(today), actual_end: toISO(today), scheduled_start: toISO(today),
      created_at: toISO(lastWeek), updated_at: toISO(today) },
    // Mark — In progress
    { id: 'job-004', customer_id: 'cust-004', title: 'New Radiator Install', status: 'in_progress',
      payment_terms: 'on_completion', job_number: 'J-1004', actual_start: toISO(today), scheduled_start: toISO(today),
      created_at: toISO(lastWeek), updated_at: toISO(today) },
    // James — Enquiry
    { id: 'job-005', customer_id: 'cust-005', title: 'Bathroom Tap Replacement', status: 'enquiry',
      payment_terms: 'on_completion', job_number: 'J-1005', created_at: toISO(yesterday), updated_at: toISO(yesterday) },
    // Emily — Paid
    { id: 'job-007', customer_id: 'cust-007', title: 'Shower Valve Fix', status: 'paid',
      payment_terms: 'on_completion', job_number: 'J-1007', actual_end: toISO(lastWeek), scheduled_start: toISO(lastWeek),
      created_at: toISO(new Date(lastWeek.getTime() - 3 * 86400000)), updated_at: toISO(lastWeek) },
    // Missed call
    { id: 'job-missed', customer_id: 'cust-006', title: 'Missed call enquiry', status: 'enquiry',
      payment_terms: 'on_completion', job_number: 'J-1006', created_at: toISO(new Date(today.getTime() - 30 * 60000)), updated_at: toISO(new Date(today.getTime() - 30 * 60000)) },
  ];
  for (const j of jobs) {
    await db.jobs.put({ ...j, user_id: userId, is_multi_day: false, _sync_status: 'synced' });
  }

  // ─── 4. LINE ITEMS ───
  const lineItems = [
    // Sarah — Boiler Service (hero quote)
    { id: 'li-hero-1', job_id: 'job-hero', description: 'Boiler service', amount: 120, sort_order: 0 },
    { id: 'li-hero-2', job_id: 'job-hero', description: 'Replacement valve', amount: 45, sort_order: 1 },
    { id: 'li-hero-3', job_id: 'job-hero', description: 'Call-out fee', amount: 0, sort_order: 2 },
    // Tom
    { id: 'li-002-1', job_id: 'job-002', description: 'Consumer unit upgrade', amount: 180, sort_order: 0 },
    { id: 'li-002-2', job_id: 'job-002', description: 'Labour', amount: 40, sort_order: 1 },
    // Priya
    { id: 'li-003-1', job_id: 'job-003', description: 'Leak investigation', amount: 85, sort_order: 0 },
    { id: 'li-003-2', job_id: 'job-003', description: 'Replacement part', amount: 32, sort_order: 1 },
    { id: 'li-003-3', job_id: 'job-003', description: 'Labour', amount: 60, sort_order: 2 },
    // Mark
    { id: 'li-004-1', job_id: 'job-004', description: 'Radiator & valves', amount: 280, sort_order: 0 },
    { id: 'li-004-2', job_id: 'job-004', description: 'Labour', amount: 60, sort_order: 1 },
    // Emily
    { id: 'li-007-1', job_id: 'job-007', description: 'Shower valve replacement', amount: 95, sort_order: 0 },
    { id: 'li-007-2', job_id: 'job-007', description: 'Labour', amount: 60, sort_order: 1 },
  ];
  for (const li of lineItems) {
    await db.line_items.put({ ...li, added_on_site: false, created_at: n, _sync_status: 'synced' });
  }

  // ─── 5. WORK LOG ───
  const workLogs = [
    { id: 'wl-hero-1', job_id: 'job-hero', type: 'status_change', description: 'Quote sent via WhatsApp' },
    { id: 'wl-002-1', job_id: 'job-002', type: 'status_change', description: 'Job confirmed by customer' },
    { id: 'wl-003-1', job_id: 'job-003', type: 'status_change', description: 'Job marked as done' },
    { id: 'wl-004-1', job_id: 'job-004', type: 'status_change', description: 'Started on site' },
    { id: 'wl-005-1', job_id: 'job-005', type: 'note', description: 'New enquiry from phone call' },
    { id: 'wl-007-1', job_id: 'job-007', type: 'status_change', description: 'Job completed and paid (Cash)' },
    { id: 'wl-missed', job_id: 'job-missed', type: 'note', description: 'Missed call logged — need to call back' },
  ];
  for (const wl of workLogs) {
    await db.work_log.put({ ...wl, created_at: n, _sync_status: 'synced' });
  }

  // ─── 6. PAYMENTS ───
  await db.payments.put({
    id: 'pay-007', job_id: 'job-007', type: 'full', method: 'cash', amount: 155,
    recorded_at: toISO(lastWeek), created_at: n, _sync_status: 'synced',
  });

  // Set auth state
  localStorage.setItem('tradepad_mock_user', JSON.stringify({ id: userId, phone: '+447700900123' }));
  localStorage.setItem('tradepad_onboarding_complete', 'true');

  console.log('✅ Demo data seeded successfully!');
  console.log('📸 Navigate to these URLs for screenshots:');
  console.log('   Hero Quote Preview: /jobs/job-hero');
  console.log('   Jobs List: /jobs');
  console.log('   Home: /');
  console.log('   Log Missed Call: /quote');
  console.log('🔄 Refresh the page to see all data.');
})();
