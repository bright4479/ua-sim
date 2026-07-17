// UA SIM - card image downloader
// Downloads sd-size webp images for all main-printing cards into assets/cards/.
// Skips files that already exist, so it can be re-run to resume.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'cards');
mkdirSync(OUT, { recursive: true });

const cards = JSON.parse(readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8'));
const targets = [];
const seen = new Set();
for (const c of cards) {
  if (!c.mainalternate || !c.imageLink) continue;
  const url = c.imageLink.split('?')[0];
  const file = basename(new URL(url).pathname);
  if (seen.has(file)) continue;
  seen.add(file);
  targets.push({ url: c.imageLink, file });
}

const CONCURRENCY = 10;
let done = 0, skipped = 0, failed = 0;
const failures = [];

async function worker(queue) {
  for (;;) {
    const t = queue.pop();
    if (!t) return;
    const dest = join(OUT, t.file);
    if (existsSync(dest) && statSync(dest).size > 0) { skipped++; continue; }
    try {
      const res = await fetch(t.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      done++;
      if ((done + skipped) % 250 === 0) console.log(`progress: ${done + skipped}/${targets.length} (failed ${failed})`);
    } catch (e) {
      failed++;
      failures.push({ ...t, error: String(e.message || e) });
    }
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

writeFileSync(join(ROOT, 'data', 'image-failures.json'), JSON.stringify(failures, null, 1));
console.log(`finished: downloaded ${done}, skipped ${skipped}, failed ${failed} of ${targets.length}`);
