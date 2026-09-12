// Manual, one-off icon generator — NOT part of the build.
//
// Run by hand whenever the icon mark needs regenerating (from the repo root):
//   npm install puppeteer-core --no-save --prefix /tmp/okane-icon-gen
//   ln -s /tmp/okane-icon-gen/node_modules apps/web/scripts/node_modules
//   node apps/web/scripts/generate-pwa-icons.mjs
//   rm apps/web/scripts/node_modules
//
// The symlink (rather than NODE_PATH) keeps Node's ESM resolver happy and keeps this
// script's own directory as the source of truth for its output path (../public/icons) —
// running it from anywhere else silently writes the icons under the wrong ../public/icons.
//
// Renders the Okane mark (¥ on indigo) with a headless Chrome screenshot instead of an
// SVG rasterizer, since none is installed on this machine and this avoids adding a
// native-binary dependency (e.g. sharp) to the project for a one-time task.
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const AI = '#1f3a5f';
const PAPER = '#f7f4ec';

function markHtml(size, ratio) {
  const fontSize = Math.round(size * ratio * 0.8);
  return `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .frame{width:${size}px;height:${size}px;background:${AI};display:grid;place-items:center}
    .glyph{font-family:'Zen Kaku Gothic New','Hiragino Sans',sans-serif;font-weight:700;
      font-size:${fontSize}px;color:${PAPER};line-height:1}
  </style></head><body>
    <div class="frame"><span class="glyph">¥</span></div>
  </body></html>`;
}

const targets = [
  { file: 'apple-touch-icon-180.png', size: 180, ratio: 0.7 },
  { file: 'icon-192.png', size: 192, ratio: 0.7 },
  { file: 'icon-512.png', size: 512, ratio: 0.7 },
  { file: 'maskable-512.png', size: 512, ratio: 0.55 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new' });
  const page = await browser.newPage();

  for (const { file, size, ratio } of targets) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(markHtml(size, ratio));
    await page.screenshot({ path: path.join(OUT_DIR, file), type: 'png', omitBackground: false });
    console.log(`wrote ${file} (${size}x${size})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
