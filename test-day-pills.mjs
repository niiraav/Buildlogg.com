import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// Sign in
await page.goto('https://buildlogg.com/app/auth');
await page.waitForTimeout(2000);
await page.fill('#email', 'niravarvinda@hotmail.com');
await page.fill('#password', 'Summer2019');
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(5000);

// Go to booking settings
await page.goto('https://buildlogg.com/app/settings/booking');
await page.waitForTimeout(3000);

// Check if day pills are present and clickable
const pills = await page.$$('button:has-text("M"), button:has-text("T"), button:has-text("W"), button:has-text("F"), button:has-text("S")');
console.log('Day pills found:', pills.length);

// Try clicking the first pill (M = Monday)
if (pills.length > 0) {
  // Get the Monday pill specifically
  const mondayPill = await page.$('button.rounded-full:has-text("M")');
  if (mondayPill) {
    const beforeText = await page.evaluate(() => document.body.innerText);
    console.log('Before click — has "M" active:', beforeText.includes('M'));
    
    // Click it
    await mondayPill.click();
    await page.waitForTimeout(2000);
    
    const afterText = await page.evaluate(() => document.body.innerText);
    console.log('After click — page still has booking settings:', afterText.includes('Working days'));
    
    // Check if profile was updated
    const profileResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('BuildloggDB');
        req.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction(['profiles'], 'readonly');
          const store = tx.objectStore('profiles');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const p = getAll.result[0];
            resolve({
              booking_working_days: p?.booking_working_days,
              stripe_connected: p?.stripe_connected,
            });
          };
        };
      });
    });
    console.log('Profile after click:', JSON.stringify(profileResult));
  } else {
    console.log('Monday pill not found');
  }
} else {
  console.log('No day pills found');
  // Check what's on the page
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page text (last 500):', text.substring(text.length - 500));
}

await browser.close();
