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

// Go to Settings > Booking
await page.goto('https://buildlogg.com/app/settings/booking');
await page.waitForTimeout(3000);

const text = await page.evaluate(() => document.body.innerText);
console.log('Has "Working days":', text.includes('Working days'));
console.log('Has "Days you work":', text.includes('Days you work'));
console.log('Has "Working hours":', text.includes('Working hours'));
console.log('Has "Blocked dates":', text.includes('Blocked dates'));
console.log('Has "Availability":', text.includes('Availability'));
console.log('Has "Minimum notice":', text.includes('Minimum notice'));
console.log('Has "Privacy":', text.includes('Privacy'));
console.log('---');
console.log('Body text (first 1000):', text.substring(0, 1000));

// Check for the \u00d7 bug
console.log('---');
console.log('Has literal \\u00d7:', text.includes('\\u00d7'));

await browser.close();
