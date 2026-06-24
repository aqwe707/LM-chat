const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\57392\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
    headless: false,
    args: ['--no-sandbox', '--start-maximized']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://www.baidu.com');
  await page.waitForTimeout(3000);
  
  // 先截图看看当前状态
  await page.screenshot({ path: 'baidu_initial.png' });
  console.log('Initial screenshot saved.');
  
  // 尝试直接通过 evaluate 来操作
  await page.evaluate(() => {
    const input = document.getElementById('kw');
    if (input) {
      input.value = 'QQ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1000);
  
  // 点击搜索按钮
  await page.evaluate(() => {
    const btn = document.getElementById('su');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'baidu_search_qq.png', fullPage: true });
  console.log('Search done, screenshots saved.');
  await browser.close();
})();
