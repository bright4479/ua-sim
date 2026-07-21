// UA SIM - headless engine test: bot vs bot until game over.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// minimal browser shims
global.window = globalThis;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: { appendChild() {}, removeChild() {} } };
global.DeckBuilder = { toast: () => {} };

// concatenate so top-level consts share one eval scope, then export to global
const src = ['data/cards.js', 'js/data.js', 'js/game/engine.js', 'js/game/bot.js',
             'js/effects/common.js', 'js/effects/mcr.js', 'js/effects/eva.js', 'js/effects/htr.js', 'js/effects/ark.js', 'js/effects/cgh.js', 'js/effects/and.js', 'js/effects/slg.js', 'js/effects/jjk.js', 'js/effects/blc.js', 'js/effects/tsk.js', 'js/effects/kmy.js', 'js/effects/kgr.js']
  .map(p => readFileSync(join(ROOT, p), 'utf8')).join('\n;\n') +
  '\n;globalThis.UAData = UAData; globalThis.Engine = Engine; globalThis.Effects = Effects;' +
  'globalThis.makeBotController = makeBotController; globalThis.buildBotDeck = buildBotDeck;';
(0, eval)(src);

// silence bot delays
const origSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => origSetTimeout(fn, 0);

const seriesA = process.argv[2] || 'MCR';
const seriesB = process.argv[3] || 'MCR';
const deckA = buildBotDeck(seriesA);
const deckB = buildBotDeck(seriesB);
console.log(`deck A (${seriesA}): ${deckA.length} cards, deck B (${seriesB}): ${deckB.length} cards`);

let updates = 0;
Engine.G.onUpdate = () => { updates++; };
Engine.G.onLog = m => { if (process.env.VERBOSE) console.log('  ' + m); };

// hard stop in case of hangs
const killer = origSetTimeout(() => {
  console.error('TIMEOUT: game did not finish in 60s');
  console.error('last log lines:', Engine.G.log.slice(-15));
  process.exit(1);
}, 60000);

const t0 = Date.now();
await Engine.startGame(deckA, deckB, makeBotController(), makeBotController(), 'BotA', 'BotB');
clearTimeout(killer);

const G = Engine.G;
console.log(`game over in ${G.turn} player-turns (${Date.now() - t0} ms), winner: ${G.winner?.name}`);
console.log('final life:', G.players.map(p => `${p.name}=${p.life.length}`).join(', '));
console.log('deck left:', G.players.map(p => `${p.name}=${p.deck.length}`).join(', '));
console.log('last events:');
for (const l of G.log.slice(-10)) console.log('  ' + l);
