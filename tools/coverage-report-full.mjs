// UA SIM - full per-series coverage report (all series, not just the worst 15), plus a
// breakdown of what kind of cards remain uncovered in each series (Character/Field/Event,
// and how many are "Raid boss" cards — i.e. carry their own [Raid] keyword).
import { readFileSync } from 'fs';

global.window = globalThis;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: { appendChild() {}, removeChild() {} } };
global.DeckBuilder = { toast: () => {} };

const src = ['data/cards.js', 'js/data.js', 'js/game/engine.js', 'js/game/bot.js',
             'js/effects/common.js', 'js/effects/mcr.js', 'js/effects/eva.js', 'js/effects/htr.js', 'js/effects/ark.js', 'js/effects/cgh.js', 'js/effects/and.js', 'js/effects/slg.js', 'js/effects/jjk.js', 'js/effects/blc.js', 'js/effects/tsk.js', 'js/effects/kmy.js', 'js/effects/kgr.js', 'js/effects/smd.js', 'js/effects/gmr.js', 'js/effects/blk.js', 'js/effects/kmr.js', 'js/effects/opm.js']
  .map(p => readFileSync(p, 'utf8')).join('\n;\n') +
  '\n;globalThis.UAData = UAData; globalThis.Engine = Engine; globalThis.Effects = Effects;';
(0, eval)(src);

let uidSeq = 1;
function fakeUnit(no) {
  const c = UAData.byNo.get(no);
  return { uid: uidSeq++, no, card: c, rested: false, under: [], counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempGen: 0, tempDmg: 0, kw: Engine.parseKeywords(c) };
}
function fakePlayer() {
  return {
    name: 'x', hand: ['DUMMY'], deck: ['DUMMY', 'DUMMY', 'DUMMY', 'DUMMY', 'DUMMY', 'DUMMY'],
    sideline: [], removal: [], front: [fakeUnit('DUMMY2'), fakeUnit('DUMMY3')], energy: [fakeUnit('DUMMY2')], apTotal: 3, apRested: 1,
    controller: {
      isBot: true,
      async chooseOption(p, t, opts) { return opts[0]?.value; },
      async chooseOwnCharacter(p, units) { return units[0]?.uid; },
      async chooseEnemyCharacter(p, units) { return units[0]?.uid; },
      async chooseCardFromHand() { return 0; },
      async chooseCardsFromHand(p, n) { return p.hand.map((_, i) => i).slice(0, n); },
      async chooseCardFromRemoval() { return null; },
      async chooseCardFromSideline() { return null; },
      async chooseRevealPick(p, revealed, t, pred, max) {
        const idxs = revealed.map((no, i) => i).filter(i => !pred || pred(UAData.byNo.get(no)));
        return idxs.slice(0, max);
      },
      notify() {},
    },
  };
}
UAData.byNo.set('DUMMY', { no: 'DUMMY', name: 'Dummy', type: 'Character', color: 'Red', need: 0, ap: 0, bp: 1000 });
UAData.byNo.set('DUMMY2', { no: 'DUMMY2', name: 'Dummy Other', type: 'Character', color: 'Red', need: 0, ap: 0, bp: 1000, effect: '' });
UAData.byNo.set('DUMMY3', { no: 'DUMMY3', name: 'Dummy High-BP', type: 'Character', color: 'Red', need: 0, ap: 0, bp: 5000, effect: '' });

// see uncovered-in-series.mjs for rationale: gives each tested card a same-named ally on its own
// front line so "if there is a <NAME> on your area, ..." self-conditions can actually fire.
function addNamedAlly(c, p) {
  const m = (c.effect || '').match(/<(?!Trait:)([^>]+)>/);
  if (!m) return;
  const dno = 'DUMMY_NAMED';
  UAData.byNo.set(dno, { no: dno, name: m[1].trim(), type: 'Character', color: 'Red', need: 0, ap: 0, bp: 3000, effect: '' });
  p.front.push(fakeUnit(dno));
}

const PASSIVE_TEXT_RE = /if this character is active, increase|generates \d* ?addition\w*|reduce the required energy|reduce the energy requirement|reduce this card'?s required energy|energy requirement is reduced|reduce the AP cost of this card|if this (?:character|card) is active,? it gains \[?\w*\]? energy generation/i;
function hasKeywordOnly(c) {
  const kw = Engine.parseKeywords(c);
  return kw.step || kw.snipe || kw.doubleAttack || kw.doubleBlock || kw.nullifyImpact || kw.impact || kw.dmg !== 1 ||
    kw.raidTargets.length || kw.entersActive || kw.entersActiveIf || kw.unblockableBP != null || kw.unblockableBPMin != null || kw.alsoTreatedAs.length ||
    kw.frontGen || kw.untargetable || kw.cannotBlock || kw.cannotAttack || kw.unblockableByRaided || kw.cannotMove || PASSIVE_TEXT_RE.test(c.effect || '') || Engine.hasTextCostDiscount?.(c) || Effects.hasGenericFrontGen?.(c);
}

// strip every sentence/tag pattern our keyword-only fallback already recognizes as "handled", to
// see whether meaningful prose is left over — that leftover is the actual missing scripting work
// for cards that only pass hasKeywordOnly() (e.g. Raid bosses: the [Raid] line itself works, but
// extra bonus/tier text printed alongside it usually doesn't).
const COST_DISCOUNT_RES = [
  /Reduce the required energy of this card in your hand(?: and Outside Area)? by \d+\.?/i,
  /If there (?:is|are) no cards? on your area, reduce the energy requirement of this card in your hand by \d+\.?/i,
  /If there is an? \[?\w+\]?(?: or (?:an? )?\[?\w+\]?)? [Cc]ard on your opponent'?s area,?\s*(?:reduce this card'?s required energy in your hand by \d+|reduce (?:the|this card'?s) energy requirement (?:of this card )?in your hand by \d+|in your hand, this card'?s energy requirement is reduced by \d+)\.?/i,
  /If there is an? <[^>]+> (?:on|in) your Outside Area, reduce the (?:energy requirement|required energy) of this card in your hand by \d+\.?/i,
  /If there is an? <[^>]+> on your area, reduce the (?:energy requirement|required energy) of this card in your hand by \d+\.?/i,
  /If your opponent has \[?\w+\]?(?: or \[?\w+\]?)? (?:card|[Cc]haracters?)[^.]*?reduce this (?:card|character)'?s energy consumption\w*[^.]*?by -?\d+\.?/i,
  /If there is a <[^>]+> on your area, reduce the AP cost of this card in your hand by \d+\.?/i,
];
function residualText(c) {
  let t = c.effect || '';
  t = t.replace(/\[[^\]]*\]/g, ' ');                 // all bracket-tag keywords ([Step] [Raid] [Impact(2)] ...)
  t = t.replace(/<[^>]*>/g, ' ');                     // <NAME> / <Trait: X> tokens left dangling after tag strip
  t = t.replace(/This (?:card|character) (?:is )?also treated as\s*\.?/gi, ' ');
  t = t.replace(/This character (?:also |can )?generates? energy (?:on|when in) (?:your |the )?Front Line\.?/gi, ' ');
  t = t.replace(/cannot be chosen by (?:your opponent'?s )?(?:character'?s effect|event card(?: from hand)?|event'?s effect|effect)/gi, ' ');
  t = t.replace(/(?:this character|this field|this card) is played in active\.?/gi, ' ');
  t = t.replace(/Play this (?:field|site|character|card) (?:to your area )?(?:in active|set to active)\.?/gi, ' ');
  t = t.replace(/cannot be blocked by characters with (?:BP ?\d+|\d+ ?BP) or (?:less|more)\.?/gi, ' ');
  t = t.replace(PASSIVE_TEXT_RE, ' ');
  for (const re of COST_DISCOUNT_RES) t = t.replace(re, ' ');
  t = t.replace(/[@.,;:\s]+/g, ' ').trim();
  return t;
}

// returns 'scripted' (registry or a generic pattern actually fired something), 'keyword-only'
// (only the keyword/text fallback marked it "handled" — this is where real prose may be left
// unscripted), or 'uncovered' (nothing recognizes this card at all).
async function classify(c) {
  if (Effects.registry[c.no]) return 'scripted';
  let fired = false;
  const logs = [];
  Engine.G.log = logs;
  if (c.type === 'Character' || c.type === 'Field') {
    const p = fakePlayer(), enemy = fakePlayer();
    Engine.G.players = [p, enemy];
    addNamedAlly(c, p);
    const unit = { no: c.no, card: c, rested: false, under: [], counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempGen: 0, tempDmg: 0 };
    try { await Effects.onPlay({}, p, unit); } catch {}
    if (logs.length) fired = true;
    if (!fired && Effects.hasMain(c)) fired = true;
    if (!fired && Effects.hasGenericBp?.(c)) fired = true;
    if (!fired && Effects.hasGenericGen?.(c)) fired = true;
    if (!fired) {
      const l2 = []; Engine.G.log = l2;
      try { await Effects.onSideline({}, p, unit, 'effect'); } catch {}
      if (l2.length) fired = true;
    }
    if (!fired) {
      const l3 = []; Engine.G.log = l3;
      try { await Effects.onAttack({}, p, unit); } catch {}
      if (l3.length) fired = true;
    }
  } else if (c.type === 'Event') {
    const p = fakePlayer(), enemy = fakePlayer();
    Engine.G.players = [p, enemy];
    addNamedAlly(c, p);
    try { await Effects.onEvent({}, p, c); } catch {}
    if (logs.length && !logs.some(l => l.includes('manual'))) fired = true;
  }
  if (fired) return 'scripted';
  if (hasKeywordOnly(c)) return 'keyword-only';
  return 'uncovered';
}

const cards = UAData.cards.filter(c => c.main && c.effect && c.effect.trim());
const bySeries = {};
for (const c of cards) {
  if (!bySeries[c.series]) bySeries[c.series] = { total: 0, scripted: 0, keywordOnly: 0, keywordOnlyResidual: [], uncovered: [] };
  const s = bySeries[c.series];
  s.total++;
  const cls = await classify(c);
  if (cls === 'scripted') s.scripted++;
  else if (cls === 'keyword-only') {
    s.keywordOnly++;
    if (residualText(c).length > 10) s.keywordOnlyResidual.push(c);
  } else s.uncovered.push(c);
}

const EX_N = 6;
const rows = Object.entries(bySeries).map(([series, v]) => {
  const covered = v.scripted + v.keywordOnly;
  const byTypeUncovered = { Character: 0, Field: 0, Event: 0 };
  for (const c of v.uncovered) byTypeUncovered[c.type] = (byTypeUncovered[c.type] || 0) + 1;
  return {
    series, total: v.total, covered, pct: v.total ? (100 * covered / v.total) : 100,
    uncoveredN: v.uncovered.length, byTypeUncovered,
    residualN: v.keywordOnlyResidual.length, // "covered" only via keyword, but likely has un-scripted bonus text
    uncoveredEx: v.uncovered.slice(0, EX_N).map(c => ({ no: c.no, name: c.name, type: c.type, effect: c.effect.replace(/\n/g, ' ') })),
    residualEx: v.keywordOnlyResidual.slice(0, EX_N).map(c => ({ no: c.no, name: c.name, type: c.type, effect: c.effect.replace(/\n/g, ' ') })),
  };
}).sort((a, b) => a.pct - b.pct);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totalAll: cards.length, coveredAll: rows.reduce((s, r) => s + r.covered, 0), rows }, null, 2));
  process.exit(0);
}

const totalAll = cards.length;
const coveredAll = rows.reduce((s, r) => s + r.covered, 0);
const residualAll = rows.reduce((s, r) => s + r.residualN, 0);
console.log(`TOTAL (นับแบบเดิม, ตรงกับ coverage-total.mjs): ${coveredAll}/${totalAll} (${(100 * coveredAll / totalAll).toFixed(1)}%)`);
console.log(`ในจำนวนนั้น มี ${residualAll} ใบที่ถูกนับว่า "covered" เพราะ keyword พื้นฐาน (Raid/Impact/ฯลฯ) แต่ยังมีข้อความ bonus/tier ที่ไม่ได้ script จริง (ดูคอลัมน์ "เหลือ script" ด้านล่าง)\n`);
console.log('Series | Covered/Total |  %  | ค้าง (Char/Field/Event) | เหลือ script (keyword-only แต่มี prose)');
console.log('-------|----------------|-----|--------------------------|------------------------------------------');
for (const r of rows) {
  const uncoveredStr = `${r.uncoveredN} (${r.byTypeUncovered.Character || 0}/${r.byTypeUncovered.Field || 0}/${r.byTypeUncovered.Event || 0})`;
  console.log(`${r.series.padEnd(6)} | ${(r.covered + '/' + r.total).padEnd(14)} | ${r.pct.toFixed(0).padStart(3)}% | ${uncoveredStr.padEnd(24)} | ${r.residualN}`);
}
