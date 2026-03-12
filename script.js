const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_URL = 'https://cinelove.me/template/pc/thiep-cuoi-60';
const OUTPUT_DIR = path.resolve(__dirname, 'cinelove_dump');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFileName(url) {
  const u = new URL(url);
  let pathname = u.pathname;

  if (pathname.endsWith('/')) pathname += 'index.html';
  if (pathname === '') pathname = 'index.html';

  const ext = path.extname(pathname);
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);

  let filePath = path.join(
    OUTPUT_DIR,
    u.hostname,
    pathname.replace(/^\/+/, '')
  );

  if (!ext) {
    filePath += `_${hash}.txt`;
  }

  ensureDir(path.dirname(filePath));
  return filePath;
}

(async () => {
  ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 3000 }
  });

  const page = await context.newPage();

  // Lưu toàn bộ response tải được
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();

      if (status >= 400) return;

      const contentType = response.headers()['content-type'] || '';

      // Chỉ lưu resource hữu ích
      if (
        contentType.includes('text/html') ||
        contentType.includes('text/css') ||
        contentType.includes('javascript') ||
        contentType.includes('json') ||
        contentType.includes('image/') ||
        contentType.includes('font/') ||
        contentType.includes('application/octet-stream')
      ) {
        const buffer = await response.body();
        const filePath = safeFileName(url);
        fs.writeFileSync(filePath, buffer);
        console.log(`Saved: ${url} -> ${filePath}`);
      }
    } catch (err) {
      console.error('Save response error:', err.message);
    }
  });

  await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Chờ JS ban đầu ổn định
  await page.waitForTimeout(3000);

  // Scroll từ từ để trigger lazy load
  let previousHeight = 0;
  let stableCount = 0;

  while (stableCount < 3) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });

    await page.waitForTimeout(1500);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === previousHeight || newHeight === currentHeight) {
      stableCount++;
    } else {
      stableCount = 0;
    }

    previousHeight = newHeight;
    console.log(`ScrollHeight: ${newHeight}, stableCount: ${stableCount}`);
  }

  // Scroll lại lên đầu để một số site remount section đầu
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(3000);

  // Lưu HTML hiện tại
  const html = await page.content();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'final-rendered.html'), html, 'utf8');

  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'fullpage.png'),
    fullPage: true
  });

  await browser.close();
})();