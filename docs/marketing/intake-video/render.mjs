// node render.mjs <work-dir> [fps=30] [t1,t2,...]   renders frames/ (or just the listed times to preview/) from film.html
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const work = process.argv[2], fps = +(process.argv[3] || 30), only = process.argv[4];
const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json')));
const cfg = process.env.FILM_CONFIG ? JSON.parse(process.env.FILM_CONFIG) : {};
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await pg.addInitScript(([t, c]) => { window.TIMELINE = t; window.CONFIG = c; }, [tl, cfg]);
pg.on('pageerror', (e) => console.error('PAGEERR', e.message));
await pg.goto('file://' + path.join(here, 'film.html')); await pg.evaluate(() => document.fonts.ready);
await pg.waitForFunction(() => [...document.images].every((i) => i.complete));
const dir = path.join(work, only ? 'preview' : 'frames'); fs.mkdirSync(dir, { recursive: true });
const times = only ? only.split(',').map(Number) : Array.from({ length: Math.round(tl.total * fps) }, (_, i) => i / fps);
let n = 0;
for (const t of times) {
  await pg.evaluate((t) => window.renderAsync(t), t);
  const f = only ? `t${t.toFixed(2)}.jpg` : `f${String(n).padStart(5, '0')}.jpg`;
  await pg.screenshot({ path: path.join(dir, f), type: 'jpeg', quality: 92 }); n++;
  if (!only && n % 100 === 0) console.log(n, '/', times.length);
}
await b.close();
