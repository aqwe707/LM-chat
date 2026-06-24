const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('C:\\Users\\57392\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default', {
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: false,
    args: ['--no-sandbox']
  });
  const page = browser.pages()[0];
  await page.goto('https://www.microsoft.com');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'edge_test.png', fullPage: true });
  console.log('Edge opened successfully!');
  await browser.close();
})();
