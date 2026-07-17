// UA SIM - card data scraper
// Pulls all published Union Arena cards from the exburst.dev public Supabase REST API
// and writes data/cards.json (master) + data/series/<CODE>.json (per series).

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://auth.exburst.dev/rest/v1/ua_cards';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0Zmtkbml3YnZ5b2F5cGp2dWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNzQwMzUsImV4cCI6MjA2Mzk1MDAzNX0.iCCIOIt8durZJg2JtSCBhPuza7j3pFfF8mS_Xj1m7Ic';

const SELECT = [
  'name', 'color', 'traits', 'effect', 'power', 'originalId', 'cardNo', 'rarity',
  'imageLink', 'mainalternate', 'apCost', 'generatedEnergyData', 'energyCost',
  '_trigger', '_triggerText', 'type', 'series', 'raritytype',
].join(',');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Prefer: 'count=exact',
};

async function fetchPage(offset, limit = 1000) {
  const url = `${API}?select=${encodeURIComponent(SELECT)}&published=eq.1&order=cardNo.asc&offset=${offset}&limit=${limit}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const total = Number((res.headers.get('content-range') || '/0').split('/')[1]);
  return { rows: await res.json(), total };
}

const all = [];
let offset = 0;
let total = Infinity;
while (offset < total) {
  const { rows, total: t } = await fetchPage(offset);
  total = t;
  all.push(...rows);
  offset += rows.length;
  console.log(`fetched ${all.length}/${total}`);
  if (rows.length === 0) break;
}

mkdirSync(join(ROOT, 'data', 'series'), { recursive: true });

const bySeries = {};
for (const c of all) {
  const s = (c.series || 'UNKNOWN').trim();
  (bySeries[s] ??= []).push(c);
}

writeFileSync(join(ROOT, 'data', 'cards.json'), JSON.stringify(all));
for (const [s, cards] of Object.entries(bySeries)) {
  writeFileSync(join(ROOT, 'data', 'series', `${s}.json`), JSON.stringify(cards));
}

const summary = Object.fromEntries(Object.entries(bySeries).map(([s, c]) => [s, c.length]).sort((a, b) => b[1] - a[1]));
writeFileSync(join(ROOT, 'data', 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`done: ${all.length} cards, ${Object.keys(bySeries).length} series`);
console.log(summary);
