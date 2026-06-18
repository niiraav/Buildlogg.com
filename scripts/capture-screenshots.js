const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '../assets/screenshots');
const BASE_URL = 'http://localhost:5173';

// Ensure directory exists
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const SEED_SCRIPT = `
(async function() {
  const db = window.db;
  if (!db) { console.error('window.db not found'); return; }
  const now = () => new Date().toISOString();
  const userId = 'demo-user-001';
  const n = now();

  await db.profiles.put({
    id: userId, full_name: 'Dave Richards', phone: '+447700900123',
    business_name: 'Dave Plumbing', trade: 'plumber',
    callout_charge: 75, payment_terms: 'on_completion',
    default_labour_description: 'Labour', default_labour_charge: 60,
    quote_valid_days: 30, created_at: n, updated_at: n, _sync_status: 'synced',
  });

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
    { id: 'job-002', customer_id: 'cust-002', title: 'Fuse Box Upgrade', status: 'booked',
      payment_terms: 'on_completion', job_number: 'J-1002', scheduled_start: toISO(tomorrow),
      created_at: toISO(lastWeek), updated_at: toISO(yesterday) },
    { id: 'job-003', customer_id: 'cust-003', title: 'Leak Repair', status: 'awaiting_payment',
      payment_terms: 'on_completion', job_number: 'J-1003', invoice_number: 'INV-1001', invoice_sent_at: toISO(today), actual_end: toISO(today), scheduled_start: toISO(today),
      created_at: toISO(lastWeek), updated_at: toISO(today) },
    { id: 'job-004', customer_id: 'cust-004', title: 'New Radiator Install', status: 'in_progress',
      payment_terms: 'on_completion', job_number: 'J-1004', actual_start: toISO(today), scheduled_start: toISO(today),
      created_at: toISO(lastWeek), updated_at: toISO(today) },
    { id: 'job-005', customer_id: 'cust-005', title: 'Bathroom Tap Replacement', status: 'enquiry',
      payment_terms: 'on_completion', job_number: 'J-1005', created_at: toISO(yesterday), updated_at: toISO(yesterday) },
    { id: 'job-007', customer_id: 'cust-007', title: 'Shower Valve Fix', status: 'paid',
      payment_terms: 'on_completion', job_number: 'J-1007', actual_end: toISO(lastWeek), scheduled_start: toISO(lastWeek),
      created_at: toISO(new Date(lastWeek.getTime() - 3 * 86400000)), updated_at: toISO(lastWeek) },
    { id: 'job-missed', customer_id: 'cust-006', title: 'Missed call enquiry', status: 'enquiry',
      payment_terms: 'on_completion', job_number: 'J-1006', created_at: toISO(new Date(today.getTime() - 30 * 60000)), updated_at: toISO(new Date(today.getTime() - 30 * 60000)) },
  ];
  for (const j of jobs) {
    await db.jobs.put({ ...j, user_id: userId, is_multi_day: false, _sync_status: 'synced' });
  }

  const lineItems = [
    { id: 'li-hero-1', job_id: 'job-hero', description: 'Boiler service', amount: 120, sort_order: 0 },
    { id: 'li-hero-2', job_id: 'job-hero', description: 'Replacement valve', amount: 45, sort_order: 1 },
    { id: 'li-hero-3', job_id: 'job-hero', description: 'Call-out fee', amount: 0, sort_order: 2 },
    { id: 'li-002-1', job_id: 'job-002', description: 'Consumer unit upgrade', amount: 180, sort_order: 0 },
    { id: 'li-002-2', job_id: 'job-002', description: 'Labour', amount: 40, sort_order: 1 },
    { id: 'li-003-1', job_id: 'job-003', description: 'Leak investigation', amount: 85, sort_order: 0 },
    { id: 'li-003-2', job_id: 'job-003', description: 'Replacement part', amount: 32, sort_order: 1 },
    { id: 'li-003-3', job_id: 'job-003', description: 'Labour', amount: 60, sort_order: 2 },
    { id: 'li-004-1', job_id: 'job-004', description: 'Radiator & valves', amount: 280, sort_order: 0 },
    { id: 'li-004-2', job_id: 'job-004', description: 'Labour', amount: 60, sort_order: 1 },
    { id: 'li-007-1', job_id: 'job-007', description: 'Shower valve replacement', amount: 95, sort_order: 0 },
    { id: 'li-007-2', job_id: 'job-007', description: 'Labour', amount: 60, sort_order: 1 },
  ];
  for (const li of lineItems) {
    await db.line_items.put({ ...li, added_on_site: false, created_at: n, _sync_status: 'synced' });
  }

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

  await db.payments.put({
    id: 'pay-007', job_id: 'job-007', type: 'full', method: 'cash', amount: 155,
    recorded_at: toISO(lastWeek), created_at: n, _sync_status: 'synced',
  });

  localStorage.setItem('tradepad_mock_user', JSON.stringify({ id: userId, phone: '+447700900123' }));
  localStorage.setItem('tradepad_onboarding_complete', 'true');
  localStorage.setItem('tradepad_dark_mode', 'false');

  console.log('SEED_COMPLETE');
})();
`;

async function seedData(page) {
  console.log('Seeding demo data...');
  await page.evaluate(SEED_SCRIPT);
  await page.waitForTimeout(1000);
  
  // Wait for seed to complete
  let attempts = 0;
  while (attempts < 30) {
    const logs = await page.evaluate(() => {
      const all = [];
      for (let i = 0; i < window.console._logs?.length || 0; i++) {
        all.push(window.console._logs[i]);
      }
      return all;
    });
    const complete = await page.evaluate(() => {
      return localStorage.getItem('tradepad_mock_user') !== null;
    });
    if (complete) {
      console.log('✅ Data seeded');
      break;
    }
    await page.waitForTimeout(200);
    attempts++;
  }
}

async function captureScreenshot(page, filename, url, crop = null) {
  console.log(`Capturing: ${filename}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // Let React render
  
  const screenshotPath = path.join(SCREENSHOTS_DIR, filename);
  
  await page.screenshot({ 
    path: screenshotPath,
    type: 'png', // Playwright doesn't support webp directly, we'll convert
    fullPage: false
  });
  
  // Convert PNG to WebP using cwebp or sharp if available
  try {
    const { execSync } = require('child_process');
    const webpPath = screenshotPath.replace('.png', '.webp');
    execSync(`cwebp -q 90 "${screenshotPath}" -o "${webpPath}" 2>/dev/null || convert "${screenshotPath}" "${webpPath}" 2>/dev/null || mv "${screenshotPath}" "${webpPath}"`, { stdio: 'ignore' });
    if (fs.existsSync(webpPath)) {
      fs.unlinkSync(screenshotPath);
      console.log(`  ✅ ${path.basename(webpPath)}`);
      return webpPath;
    }
  } catch (e) {}
  
  console.log(`  ✅ ${path.basename(screenshotPath)}`);
  return screenshotPath;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });
  
  const page = await context.newPage();
  
  // First, seed data
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await seedData(page);
  
  // Refresh to apply seeded data
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const screenshots = [];
  
  // 1. HERO: Home screen (shows the quote preview / Today view)
  screenshots.push(await captureScreenshot(page, 'hero-home.png', `${BASE_URL}/`));
  
  // 2. Jobs list with mixed statuses
  screenshots.push(await captureScreenshot(page, 'step-3-jobs.png', `${BASE_URL}/jobs`));
  
  // 3. Hero job detail (Quoted - Sarah Mitchell)
  screenshots.push(await captureScreenshot(page, 'hero-quote.png', `${BASE_URL}/jobs/job-hero`));
  
  // 4. Log Missed Call screen
  screenshots.push(await captureScreenshot(page, 'step-1-log.png', `${BASE_URL}/quote`));
  
  // 5. Awaiting Payment job (Priya Shah)
  screenshots.push(await captureScreenshot(page, 'job-awaiting-payment.png', `${BASE_URL}/jobs/job-003`));
  
  // 6. In Progress job (Mark O'Connor)
  screenshots.push(await captureScreenshot(page, 'job-in-progress.png', `${BASE_URL}/jobs/job-004`));
  
  // 7. Booked job (Tom Jenkins)
  screenshots.push(await captureScreenshot(page, 'job-booked.png', `${BASE_URL}/jobs/job-002`));
  
  // 8. Settings
  screenshots.push(await captureScreenshot(page, 'settings.png', `${BASE_URL}/settings`));
  
  await browser.close();
  
  console.log('\n📸 All screenshots captured:');
  screenshots.forEach(s => console.log(`  ${path.basename(s)}`));
  console.log(`\n📁 Location: ${SCREENSHOTS_DIR}`);
})();
