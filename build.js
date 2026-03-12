/**
 * build.js — Static site builder for GitHub Pages deployment
 *
 * Reads the crawled cinelove_dump/ and produces a self-contained dist/ folder
 * that can be served as a plain static site (no Node.js server required).
 *
 * Usage:
 *   node build.js
 *   BASE_PATH=/wedding-letter node build.js   # for project-pages subpath
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DUMP_DIR = path.resolve(__dirname, 'cinelove_dump');
const DIST_DIR = path.resolve(__dirname, 'dist');

// BASE_PATH: e.g. '/wedding-letter' for github.io/wedding-letter, '' for custom domain / org page
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

console.log(`\nBuilding static site...`);
console.log(`  DUMP_DIR  : ${DUMP_DIR}`);
console.log(`  DIST_DIR  : ${DIST_DIR}`);
console.log(`  BASE_PATH : "${BASE_PATH}"\n`);

// ── URL Rewriting ─────────────────────────────────────────────────────────────────

/**
 * Rewrites all cinelove CDN URLs to local paths.
 * Handles both:
 *   - base values  e.g.  CDN_URL:"https://assets.cinelove.me"
 *   - full paths   e.g.  https://assets.cinelove.me/fonts/...
 */
function rewriteCdnUrls(text) {
  const b = BASE_PATH;
  // Without trailing slash (CDN_URL base variable value)
  text = text.replace(/https?:\/\/assets\.cinelove\.me"/g,  `${b}/local-assets"`);
  text = text.replace(/https?:\/\/assets\.cinelove\.me'/g,  `${b}/local-assets'`);
  text = text.replace(/https?:\/\/img\.cinelove\.me"/g,     `${b}/local-img"`);
  text = text.replace(/https?:\/\/img\.cinelove\.me'/g,     `${b}/local-img'`);
  text = text.replace(/https?:\/\/api\.cinelove\.me"/g,     `${b}/local-api"`);
  text = text.replace(/https?:\/\/api\.cinelove\.me'/g,     `${b}/local-api'`);
  text = text.replace(/https?:\/\/cdn\.cinelove\.me"/g,     `${b}/local-cdn"`);
  text = text.replace(/https?:\/\/cdn\.cinelove\.me'/g,     `${b}/local-cdn'`);
  // With trailing slash (full URL paths)
  text = text.replace(/https?:\/\/assets\.cinelove\.me\//g, `${b}/local-assets/`);
  text = text.replace(/https?:\/\/img\.cinelove\.me\//g,    `${b}/local-img/`);
  text = text.replace(/https?:\/\/api\.cinelove\.me\//g,    `${b}/local-api/`);
  text = text.replace(/https?:\/\/cdn\.cinelove\.me\//g,    `${b}/local-cdn/`);
  return text;
}

// Rewrites absolute /_next/ and /local-assets/ /local-img/ paths in HTML
// to include the BASE_PATH prefix. (No-op when BASE_PATH is empty.)
function rewriteHtmlPaths(html) {
  if (!BASE_PATH) return html;
  const b = BASE_PATH;
  // href/src attributes
  html = html.replace(/(href|src)="\/_next\//g,        `$1="${b}/_next/`);
  html = html.replace(/(href|src)="\/local-assets\//g, `$1="${b}/local-assets/`);
  html = html.replace(/(href|src)="\/local-img\//g,    `$1="${b}/local-img/`);
  // CSS url() in inline styles
  html = html.replace(/url\("\/_next\//g,        `url("${b}/_next/`);
  html = html.replace(/url\('\/local-assets\//g, `url('${b}/local-assets/`);
  html = html.replace(/url\("\/local-assets\//g, `url("${b}/local-assets/`);
  html = html.replace(/url\('\/local-img\//g,    `url('${b}/local-img/`);
  html = html.replace(/url\("\/local-img\//g,    `url("${b}/local-img/`);
  return html;
}

/**
 * Patches __NEXT_DATA__ JSON to set assetPrefix = BASE_PATH,
 * which makes the Next.js webpack runtime load chunks from the right base.
 */
function patchNextData(html) {
  return html.replace(
    /(<script id="__NEXT_DATA__" type="application\/json">)([\s\S]*?)(<\/script>)/,
    (match, open, json, close) => {
      try {
        const data = JSON.parse(json);
        data.assetPrefix = BASE_PATH;
        return `${open}${JSON.stringify(data)}${close}`;
      } catch {
        return match;
      }
    }
  );
}

// ── API Mock ──────────────────────────────────────────────────────────────────────

/**
 * Builds an inline <script> that intercepts fetch() calls to /local-api/
 * and returns cached API responses without needing a server.
 */
function buildApiMockScript() {
  let giftsJson = '{"gifts":[]}';
  try {
    const raw = fs.readFileSync(
      path.join(DUMP_DIR, 'api.cinelove.me/gifts/animated-gift_7f7c26a8.txt'),
      'utf8'
    ).trim();
    giftsJson = raw;
  } catch { /* gifts data not available */ }

  return `<script>
/* API mock for static deployment — intercepts /local-api/ fetch calls */
(function(){
  var GIFTS=${giftsJson};
  var LIKES={"success":true,"likes":17};
  var VIEWS={"success":true,"views":863};
  var orig=window.fetch;
  window.fetch=function(u,o){
    var s=String(u);
    if(s.indexOf('local-api')!==-1||s.indexOf('api.cinelove')!==-1){
      var d;
      if(s.indexOf('animated-gift')!==-1||s.indexOf('/gifts')!==-1) d=GIFTS;
      else if(s.indexOf('likes')!==-1) d=LIKES;
      else if(s.indexOf('views')!==-1) d=VIEWS;
      else d={success:true};
      return Promise.resolve(new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json'}}));
    }
    return orig.apply(this,arguments);
  };
})();
</script>`;
}

// ── File Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively copies a directory. If rewrite=true, rewrites CDN URLs in .js and .css files.
 */
function copyDirSync(src, dest, { rewrite = false } = {}) {
  if (!fs.existsSync(src)) {
    console.warn(`  SKIP (not found): ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, { rewrite });
    } else if (rewrite) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.js' || ext === '.css') {
        let text = fs.readFileSync(srcPath, 'utf8');
        if (text.includes('cinelove.me')) text = rewriteCdnUrls(text);
        fs.writeFileSync(destPath, text, 'utf8');
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively renames any file with URL-encoded characters (%XX) to its decoded name.
 * e.g. template/pc/%5BtemplateSlug%5D-xxx.js → template/pc/[templateSlug]-xxx.js
 * Needed because the Playwright crawler saved filenames URL-encoded,
 * but browsers request them decoded.
 */
function fixUrlEncodedFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixUrlEncodedFiles(srcPath);
    } else if (entry.name.includes('%')) {
      const decoded = decodeURIComponent(entry.name);
      if (decoded !== entry.name) {
        const destPath = path.join(dir, decoded);
        fs.renameSync(srcPath, destPath);
        console.log(`  Renamed: ${entry.name} → ${decoded}`);
      }
    }
  }
}

// ── Main Build ────────────────────────────────────────────────────────────────────

function build() {
  // 1. Clean output
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 2. Process index.html
  console.log('Processing HTML...');
  let html = fs.readFileSync(path.join(DUMP_DIR, 'final-rendered.html'), 'utf8');
  html = rewriteCdnUrls(html);      // replace all remote CDN URLs
  html = rewriteHtmlPaths(html);    // prepend BASE_PATH to absolute local paths
  html = patchNextData(html);       // set assetPrefix in __NEXT_DATA__

  // Inject API mock before </head> so fetch is intercepted before React hydrates
  html = html.replace('</head>', buildApiMockScript() + '\n</head>');

  // Write as index.html (root) and also at the original canonical path
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
  fs.mkdirSync(path.join(DIST_DIR, 'template/pc'), { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'template/pc/thiep-cuoi-60.html'), html, 'utf8');

  // GitHub Pages SPA fallback: serve index.html for unknown routes
  fs.writeFileSync(path.join(DIST_DIR, '404.html'), html, 'utf8');

  // 3. Copy _next/static (with CDN URL rewriting in JS/CSS)
  console.log('Copying _next/static...');
  copyDirSync(
    path.join(DUMP_DIR, 'cinelove.me/_next/static'),
    path.join(DIST_DIR, '_next/static'),
    { rewrite: true }
  );

  // Fix URL-encoded chunk filenames (e.g. %5BtemplateSlug%5D → [templateSlug])
  fixUrlEncodedFiles(path.join(DIST_DIR, '_next/static/chunks'));

  // 4. Copy local CDN assets (no rewriting needed — these are binary/image files)
  console.log('Copying local-assets (assets.cinelove.me)...');
  copyDirSync(
    path.join(DUMP_DIR, 'assets.cinelove.me'),
    path.join(DIST_DIR, 'local-assets')
  );

  console.log('Copying local-img (img.cinelove.me)...');
  copyDirSync(
    path.join(DUMP_DIR, 'img.cinelove.me'),
    path.join(DIST_DIR, 'local-img')
  );

  // 5. .nojekyll — required so GitHub Pages doesn't ignore _next/ folder (Jekyll skips _* dirs)
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  // 6. Summary
  const count = countFiles(DIST_DIR);
  console.log(`\nBuild complete!  ${count} files written to dist/`);
  console.log(`Deploy dist/ to GitHub Pages (root) or set BASE_PATH if using a subpath.\n`);
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
}

build();
