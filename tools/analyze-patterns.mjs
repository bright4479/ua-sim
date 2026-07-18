// UA SIM - mine the whole card database for common effect-text templates,
// so the generic pattern layer (js/effects/common.js) can be expanded to
// cover as many cards as possible before resorting to per-card scripts.
import { readFileSync, writeFileSync } from 'fs';

const cards = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const withFx = cards.filter(c => c.mainalternate && c.effect && c.effect.trim());

function normalize(clause) {
  return clause
    .trim()
    .replace(/<[^>]+>/g, '<NAME>')
    .replace(/\[Trait:[^\]]+\]/gi, '[TRAIT]')
    .replace(/\byellow\b|\bred\b|\bblue\b|\bgreen\b|\bpurple\b/gi, 'COLOR')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

// cluster by (a) full clause template and (b) first-few-words prefix for coarser grouping
const clauseFreq = new Map();
const prefixFreq = new Map();

for (const c of withFx) {
  const clauses = c.effect.split('@').map(s => s.trim()).filter(Boolean);
  for (const clause of clauses) {
    const norm = normalize(clause);
    clauseFreq.set(norm, (clauseFreq.get(norm) || 0) + 1);
    const prefix = norm.split(' ').slice(0, 6).join(' ');
    if (!prefixFreq.has(prefix)) prefixFreq.set(prefix, { count: 0, examples: new Set() });
    const e = prefixFreq.get(prefix);
    e.count++;
    if (e.examples.size < 3) e.examples.add(clause.slice(0, 140));
  }
}

const topClauses = [...clauseFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
const topPrefixes = [...prefixFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 60);

console.log('=== TOP EXACT (normalized) CLAUSE TEMPLATES ===');
for (const [norm, n] of topClauses) console.log(n, '|', norm);

console.log('\n=== TOP PREFIX GROUPS (6-word, normalized) ===');
for (const [prefix, { count, examples }] of topPrefixes) {
  console.log(count, '|', prefix, '| e.g.:', [...examples][0]);
}

const totalClauseOccurrences = [...clauseFreq.values()].reduce((a, b) => a + b, 0);
console.log('\ntotal cards with effect:', withFx.length, '| total clauses:', totalClauseOccurrences);
