// UA SIM - list cards in a given series whose effect text does NOT yet get any
// automatic handling (registry script / generic pattern / keyword), so a scripting
// pass can prioritize them without re-deriving what's already covered.
import { readFileSync } from 'fs';

global.window = globalThis;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: { appendChild() {}, removeChild() {} } };
global.DeckBuilder = { toast: () => {} };

const src = ['data/cards.js', 'js/data.js', 'js/game/engine.js', 'js/game/bot.js',
             'js/effects/common.js', 'js/effects/mcr.js', 'js/effects/eva.js', 'js/effects/htr.js', 'js/effects/ark.js', 'js/effects/cgh.js', 'js/effects/and.js', 'js/effects/slg.js', 'js/effects/jjk.js', 'js/effects/blc.js', 'js/effects/tsk.js', 'js/effects/kmy.js', 'js/effects/kgr.js', 'js/effects/smd.js', 'js/effects/gmr.js', 'js/effects/blk.js', 'js/effects/kmr.js', 'js/effects/opm.js', 'js/effects/kin.js', 'js/effects/yyh.js', 'js/effects/hiq.js', 'js/effects/tlr.js', 'js/effects/gim.js', 'js/effects/snf.js', 'js/effects/syn.js', 'js/effects/ngr.js', 'js/effects/trk.js', 'js/effects/nik.js', 'js/effects/bcv.js', 'js/effects/rnk.js', 'js/effects/toa.js', 'js/effects/kjn.js', 'js/effects/gnt.js', 'js/effects/mst.js', 'js/effects/shy.js', 'js/effects/csm.js', 'js/effects/aot.js', 'js/effects/rly.js', 'js/effects/kgd.js', 'js/effects/rez.js', 'js/effects/btr.js', 'js/effects/mha.js']
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

// Many "if there is a <NAME> on your area, ..." self-conditions reference a specific named
// card that the synthetic board has no way to already contain — causing a false "uncovered"
// report even when the generic pattern handling it is fully correct (same class of measurement
// blind spot as the BP>=N DUMMY3 fix). Give each tested card a same-named ally on its own front
// line so those conditions can actually be satisfied during measurement.
function addNamedAlly(c, p) {
  const m = (c.effect || '').match(/<(?!Trait:)([^>]+)>/);
  if (!m) return;
  const dno = 'DUMMY_NAMED';
  UAData.byNo.set(dno, { no: dno, name: m[1].trim(), type: 'Character', color: 'Red', need: 0, ap: 0, bp: 3000, effect: '' });
  p.front.push(fakeUnit(dno));
}

function hasKeywordOnly(c) {
  const kw = Engine.parseKeywords(c);
  const passiveText = /if this character is active, increase|generates \d* ?addition\w*|reduce the required energy|reduce the energy requirement|reduce this card'?s required energy|energy requirement is reduced|reduce the AP cost of this card|if this (?:character|card) is active,? it gains \[?\w*\]? energy generation/i.test(c.effect || '');
  return kw.step || kw.snipe || kw.doubleAttack || kw.doubleBlock || kw.nullifyImpact || kw.impact || kw.dmg !== 1 ||
    kw.raidTargets.length || kw.entersActive || kw.entersActiveIf || kw.unblockableBP != null || kw.unblockableBPMin != null || kw.alsoTreatedAs.length ||
    kw.frontGen || kw.untargetable || kw.cannotBlock || kw.cannotAttack || kw.unblockableByRaided || kw.cannotMove || kw.cannotEnterFront || kw.retireToRemoval || passiveText || Engine.hasTextCostDiscount?.(c) || Effects.hasGenericFrontGen?.(c);
}

const seriesArg = process.argv[2];
const cards = UAData.cards.filter(c => c.main && c.series === seriesArg && c.effect && c.effect.trim() && !/^-?[0-9]+$/.test(c.effect.trim()));
const uncovered = [];

for (const c of cards) {
  if (Effects.registry[c.no]) continue;
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
      const logs2 = []; Engine.G.log = logs2;
      try { await Effects.onSideline({}, p, unit, 'effect'); } catch {}
      if (logs2.length) fired = true;
    }
    if (!fired) {
      const logs3 = []; Engine.G.log = logs3;
      try { await Effects.onAttack({}, p, unit); } catch {}
      if (logs3.length) fired = true;
    }
  } else if (c.type === 'Event') {
    const p = fakePlayer(), enemy = fakePlayer();
    Engine.G.players = [p, enemy];
    addNamedAlly(c, p);
    try { await Effects.onEvent({}, p, c); } catch {}
    if (logs.length && !logs.some(l => l.includes('manual'))) fired = true;
  }
  if (!fired && !hasKeywordOnly(c)) uncovered.push(c);
}

console.log(`${seriesArg}: ${cards.length} with effect, ${uncovered.length} uncovered\n`);
for (const c of uncovered) console.log(`${c.no} | ${c.name} | ${c.type} | ${c.effect.replace(/\n/g, ' ')}`);
