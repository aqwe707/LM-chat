const { chromium } = require('playwright');
(async () => {
  // Launch Edge using chromium browser engine but with Edge executable
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: false,
    channel: 'msedge'
  });
  const page = await browser.newPage();
  await page.goto('https://www.bing.com');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'edge_bing.png', fullPage: true });
  console.log('Edge opened successfully!');
  await browser.close();
})();
