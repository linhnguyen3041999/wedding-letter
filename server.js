const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Cache JS file rewrites to avoid re-processing on every request
const jsCache = new Map();

const DUMP_DIR = path.resolve(__dirname, 'cinelove_dump');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveFile(res, filePath, status = 200) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  [404] File not found: ${filePath}`);
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Not found');
    return false;
  }
  let data = fs.readFileSync(filePath);
  const mime = getMime(filePath);

  // Rewrite CDN URLs trong CSS và JS
  if (mime.includes('text/css') || mime.includes('javascript')) {
    const cached = jsCache.get(filePath);
    if (cached) {
      data = cached;
    } else {
      let text = data.toString('utf8');
      if (text.includes('cinelove.me')) {
        const rewritten = Buffer.from(rewriteCdnUrls(text), 'utf8');
        jsCache.set(filePath, rewritten);
        data = rewritten;
      } else {
        jsCache.set(filePath, data);
      }
    }
  }

  res.writeHead(status, {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(data);
  return true;
}

// Thay thế tất cả CDN URL thành local URL
// Handles both with-slash (URL paths) and without-slash (CDN_URL base variable in JS)
function rewriteCdnUrls(text) {
  // With trailing slash — full path URLs
  text = text.replace(/https?:\/\/assets\.cinelove\.me\//g, '/local-assets/');
  text = text.replace(/https?:\/\/img\.cinelove\.me\//g, '/local-img/');
  text = text.replace(/https?:\/\/api\.cinelove\.me\//g, '/local-api/');
  text = text.replace(/https?:\/\/cdn\.cinelove\.me\//g, '/local-cdn/');
  // Without trailing slash — CDN_URL base value: CDN_URL:"https://assets.cinelove.me"
  text = text.replace(/https?:\/\/assets\.cinelove\.me"/g, '/local-assets"');
  text = text.replace(/https?:\/\/assets\.cinelove\.me'/g, "/local-assets'");
  text = text.replace(/https?:\/\/img\.cinelove\.me"/g, '/local-img"');
  text = text.replace(/https?:\/\/img\.cinelove\.me'/g, "/local-img'");
  text = text.replace(/https?:\/\/api\.cinelove\.me"/g, '/local-api"');
  text = text.replace(/https?:\/\/api\.cinelove\.me'/g, "/local-api'");
  text = text.replace(/https?:\/\/cdn\.cinelove\.me"/g, '/local-cdn"');
  text = text.replace(/https?:\/\/cdn\.cinelove\.me'/g, "/local-cdn'");
  return text;
}

function serveJson(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// Đọc __NEXT_DATA__ từ HTML để dùng cho /_next/data/ endpoint
let cachedNextData = null;
function getNextData() {
  if (cachedNextData) return cachedNextData;
  try {
    const html = fs.readFileSync(path.join(DUMP_DIR, 'final-rendered.html'), 'utf8');
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (match) {
      cachedNextData = JSON.parse(match[1]);
    }
  } catch (e) {
    console.error('Error parsing __NEXT_DATA__:', e.message);
  }
  return cachedNextData;
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Chỉ xử lý GET
  if (req.method !== 'GET') {
    serveJson(res, { success: true });
    return;
  }

  const parsedUrl = url.parse(req.url);
  let pathname;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    pathname = parsedUrl.pathname;
  }

  console.log(`GET ${pathname}`);

  // ── Root redirect ─────────────────────────────────────────────
  if (pathname === '/') {
    res.writeHead(302, { Location: '/template/pc/thiep-cuoi-60' });
    res.end();
    return;
  }

  // ── Trang chính ───────────────────────────────────────────────
  if (pathname === '/template/pc/thiep-cuoi-60') {
    const htmlPath = path.join(DUMP_DIR, 'final-rendered.html');
    if (!fs.existsSync(htmlPath)) {
      res.writeHead(404); res.end('HTML not found'); return;
    }
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = rewriteCdnUrls(html);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(html);
    return;
  }

  // ── /_next/data/ – trả về pageProps đã cache ─────────────────
  if (pathname.startsWith('/_next/data/')) {
    const nextData = getNextData();
    if (nextData) {
      serveJson(res, { pageProps: nextData.props.pageProps, __N_SSP: true });
    } else {
      serveJson(res, { pageProps: {} });
    }
    return;
  }

  // ── /_next/static/ – serve từ local dump ─────────────────────
  if (pathname.startsWith('/_next/static/')) {
    // Use raw (non-decoded) path to preserve URL-encoded chars like %5B %5D in filenames
    const rawRelativePath = parsedUrl.pathname.slice('/_next/static/'.length);
    let staticFilePath = path.join(DUMP_DIR, 'cinelove.me/_next/static', rawRelativePath);
    if (!fs.existsSync(staticFilePath) && rawRelativePath.startsWith('chunks/pages/')) {
      // Page chunks may be stored flat in chunks/pages/ (e.g. %5BtemplateSlug%5D-xxx.js)
      const filename = path.basename(rawRelativePath);
      const flatPath = path.join(DUMP_DIR, 'cinelove.me/_next/static/chunks/pages', filename);
      if (fs.existsSync(flatPath)) staticFilePath = flatPath;
    }
    serveFile(res, staticFilePath);
    return;
  }

  // ── /local-assets/ – serve từ assets.cinelove.me dump ───────
  if (pathname.startsWith('/local-assets/')) {
    const relativePath = pathname.slice('/local-assets/'.length);
    serveFile(res, path.join(DUMP_DIR, 'assets.cinelove.me', relativePath));
    return;
  }

  // ── /local-img/ – serve từ img.cinelove.me dump ─────────────
  if (pathname.startsWith('/local-img/')) {
    const relativePath = pathname.slice('/local-img/'.length);
    serveFile(res, path.join(DUMP_DIR, 'img.cinelove.me', relativePath));
    return;
  }

  // ── /local-cdn/ – cdn.cinelove.me (sample avatars, etc.) ─────
  if (pathname.startsWith('/local-cdn/')) {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  // ── /local-api/ – proxy API calls đã cache ───────────────────
  if (pathname.startsWith('/local-api/')) {
    const apiPath = pathname.slice('/local-api/'.length);
    if (apiPath.includes('likes')) {
      serveJson(res, { success: true, likes: 17 });
    } else if (apiPath.includes('views')) {
      serveJson(res, { success: true, views: 863 });
    } else if (apiPath.startsWith('gifts/animated-gift') || apiPath.endsWith('animated-gift')) {
      try {
        const d = fs.readFileSync(
          path.join(DUMP_DIR, 'api.cinelove.me/gifts/animated-gift_7f7c26a8.txt'), 'utf8'
        );
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(d);
      } catch { serveJson(res, { gifts: [] }); }
    } else if (apiPath.includes('template') && apiPath.includes('views')) {
      serveJson(res, { success: true, views: 863 });
    } else if (apiPath.includes('template') && apiPath.includes('likes')) {
      serveJson(res, { success: true, likes: 17 });
    } else {
      serveJson(res, { success: true });
    }
    return;
  }

  // ── Legacy paths (giữ để tương thích) ────────────────────────
  if (pathname.startsWith('/assets/')) {
    serveFile(res, path.join(DUMP_DIR, 'assets.cinelove.me/assets', pathname.slice('/assets/'.length)));
    return;
  }

  if (pathname.startsWith('/fonts/')) {
    serveFile(res, path.join(DUMP_DIR, 'assets.cinelove.me/fonts', pathname.slice('/fonts/'.length)));
    return;
  }

  if (pathname.startsWith('/resources/')) {
    serveFile(res, path.join(DUMP_DIR, 'assets.cinelove.me/resources', pathname.slice('/resources/'.length)));
    return;
  }

  if (pathname.startsWith('/gifts/')) {
    serveFile(res, path.join(DUMP_DIR, 'assets.cinelove.me/gifts', pathname.slice('/gifts/'.length)));
    return;
  }

  // ── API mock endpoints ────────────────────────────────────────

  // Likes
  if (pathname.match(/\/likes\/?$/)) {
    serveJson(res, { success: true, likes: 17 });
    return;
  }

  // Views
  if (pathname.match(/\/views\/?$/)) {
    serveJson(res, { success: true, views: 863 });
    return;
  }

  // Animated gifts
  if (pathname.includes('/animated-gift') || (pathname.includes('/gifts') && !pathname.includes('/_next'))) {
    try {
      const data = fs.readFileSync(
        path.join(DUMP_DIR, 'api.cinelove.me/gifts/animated-gift_7f7c26a8.txt'),
        'utf8'
      );
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    } catch {
      serveJson(res, { success: true, gifts: [] });
    }
    return;
  }

  // Auth session
  if (pathname === '/api/auth/session') {
    serveJson(res, null);
    return;
  }

  // RSVP submission
  if (pathname.includes('/rsvp')) {
    serveJson(res, { success: true, message: 'Đã nhận được xác nhận của bạn!' });
    return;
  }

  // Blessing/message
  if (pathname.includes('/blessing') || pathname.includes('/message')) {
    serveJson(res, { success: true, data: [] });
    return;
  }

  // ── Favicon ───────────────────────────────────────────────────
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/apple-touch-icon.png' || pathname === '/favicon-32x32.png' || pathname === '/favicon-16x16.png') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/site.webmanifest') {
    serveJson(res, { name: 'CineLove', short_name: 'CineLove', theme_color: '#ffffff' });
    return;
  }

  // ── Fallback 404 ──────────────────────────────────────────────
  console.warn(`  [404] ${pathname}`);
  res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end(`Not found: ${pathname}`);
});

server.listen(PORT, () => {
  console.log('');
  console.log('✅ Local Wedding Page Server đang chạy!');
  console.log(`   http://localhost:${PORT}/template/pc/thiep-cuoi-60`);
  console.log('');
  console.log('Ghi chú:');
  console.log('  - Nội dung thiệp cưới: load từ local (final-rendered.html)');
  console.log('  - JS/CSS static files: load từ local (cinelove_dump/cinelove.me/_next/)');
  console.log('  - Hình ảnh, font, resources: load từ local (cinelove_dump/assets.cinelove.me/)');
  console.log('  - Ảnh upload: load từ local (cinelove_dump/img.cinelove.me/)');
  console.log('  - API động (likes, views, gifts): dùng dữ liệu cached');
  console.log('');
});
