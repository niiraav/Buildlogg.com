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

// Go to Settings to test BottomSheet
await page.goto('https://buildlogg.com/app/settings');
await page.waitForTimeout(3000);

// Test 1: Open Card payments sheet — verify X button
console.log('=== Test 1: X button visible ===');
const cardRow = await page.$('text=Card payments');
if (cardRow) {
  await cardRow.click();
  await page.waitForTimeout(1500);
  
  const sheetText = await page.evaluate(() => document.body.innerText);
  console.log('Sheet opened:', sheetText.includes('card payments'));
  
  // Check for X button (aria-label="Close")
  const xButton = await page.$('button[aria-label="Close"]');
  console.log('X button found:', !!xButton);
  
  if (xButton) {
    // Test 2: Tap X to close
    console.log('=== Test 2: Tap X to close ===');
    await xButton.click();
    await page.waitForTimeout(1000);
    const afterClose = await page.evaluate(() => document.body.innerText);
    console.log('Sheet closed (no "Enable card" text):', !afterClose.includes('Enable card payments'));
  }
}

// Test 3: Open another sheet and test backdrop tap
console.log('=== Test 3: Backdrop tap still works ===');
const cardRow2 = await page.$('text=Card payments');
if (cardRow2) {
  await cardRow2.click();
  await page.waitForTimeout(1500);
  // Tap outside the sheet (top of screen)
  await page.mouse.click(195, 100);
  await page.waitForTimeout(1000);
  const afterBackdrop = await page.evaluate(() => document.body.innerText);
  console.log('Backdrop tap closed sheet:', !afterBackdrop.includes('Enable card payments'));
}

// Test 4: Go to Home and open a different sheet
console.log('=== Test 4: Different sheet has X ===');
await page.goto('https://buildlogg.com/app');
await page.waitForTimeout(3000);

// Try to find and open any sheet — look for "More options" or task cards
const moreBtn = await page.$('text=More options');
if (!moreBtn) {
  // Try clicking a job if on Today tab
  const jobCard = await page.$('.cursor-pointer');
  if (jobCard) {
    await jobCard.click();
    await page.waitForTimeout(2000);
    // Look for More options in JobDetail
    const moreBtn2 = await page.$('text=More options');
    if (moreBtn2) {
      await moreBtn2.click();
      await page.waitForTimeout(1500);
      const xBtn = await page.$('button[aria-label="Close"]');
      console.log('More options sheet has X:', !!xBtn);
      if (xBtn) {
        await xBtn.click();
        await page.waitForTimeout(1000);
        console.log('X closed More options sheet');
      }
    }
  }
} else {
  await moreBtn.click();
  await page.waitForTimeout(1500);
  const xBtn = await page.$('button[aria-label="Close"]');
  console.log('More options sheet has X:', !!xBtn);
}

await browser.close();
console.log('\n=== Done ===');
