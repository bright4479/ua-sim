// UA SIM - stress test: run 1 bot-vs-bot game for every series that can field a
// legal 50-card mono-color deck, to catch crashes/hangs in generic effect patterns
// across the whole card database (not just the series scripted by hand so far).
import { readFileSync } from 'fs';

global.window = globalThis;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: { appendChild() {}, removeChild() {} } };
global.DeckBuilder = { toast: () => {} };

const src = ['data/cards.js', 'js/data.js', 'js/game/engine.js', 'js/game/bot.js',
             'js/effects/common.js', 'js/effects/mcr.js', 'js/effects/eva.js', 'js/effects/htr.js', 'js/effects/ark.js', 'js/effects/cgh.js', 'js/effects/and.js', 'js/effects/slg.js', 'js/effects/jjk.js', 'js/effects/blc.js', 'js/effects/tsk.js', 'js/effects/kmy.js', 'js/effects/kgr.js', 'js/effects/smd.js', 'js/effects/gmr.js', 'js/effects/blk.js', 'js/effects/kmr.js', 'js/effects/opm.js', 'js/effects/kin.js', 'js/effects/yyh.js', 'js/effects/hiq.js', 'js/effects/tlr.js', 'js/effects/gim.js', 'js/effects/snf.js', 'js/effects/syn.js', 'js/effects/ngr.js', 'js/effects/trk.js', 'js/effects/nik.js', 'js/effects/bcv.js', 'js/effects/rnk.js', 'js/effects/toa.js', 'js/effects/kjn.js']
  .map(p => readFileSync(p, 'utf8')).join('\n;\n') +
  '\n;globalThis.UAData = UAData; globalThis.Engine = Engine; globalThis.Effects = Effects;' +
  'globalThis.makeBotController = makeBotController; globalThis.buildBotDeck = buildBotDeck;';
(0, eval)(src);

const origSetTimeout = global.setTimeout;
global.setTimeout = (fn) => origSetTimeout(fn, 0);

const seriesList = [...new Set(UAData.cards.map(c => c.series))].filter(Boolean);
let pass = 0, fail = 0, skipped = 0;
const failures = [];

for (const s of seriesList) {
  const deck = buildBotDeck(s);
  if (deck.length < 50) { skipped++; continue; }
  Engine.G.log = [];
  Engine.G.onUpdate = () => {};
  Engine.G.onLog = () => {};
  try {
    const t0 = Date.now();
    await Engine.startGame(deck, deck, makeBotController(), makeBotController(), 'A', 'B');
    if (Engine.G.turn > 500) throw new Error('suspiciously long game: ' + Engine.G.turn + ' turns');
    pass++;
    console.log(`OK   ${s}: ${Engine.G.turn} turns, ${Date.now() - t0}ms, winner=${Engine.G.winner?.name}`);
  } catch (e) {
    fail++;
    failures.push({ series: s, error: e.message, stack: e.stack, lastLog: Engine.G.log.slice(-8) });
    console.log(`FAIL ${s}: ${e.message}`);
  }
}

console.log(`\n=== SUMMARY: ${pass} pass, ${fail} fail, ${skipped} skipped (no legal 50-card deck) ===`);
if (failures.length) {
  console.log('\n=== FAILURE DETAILS ===');
  for (const f of failures) {
    console.log(`\n--- ${f.series} ---`);
    console.log(f.error);
    console.log(f.stack);
    console.log('last log:', f.lastLog);
  }
  process.exit(1);
}
