// ══════════ UA SIM — Bot controller ══════════
// Simple heuristic AI implementing the Engine controller interface.

function makeBotController() {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let abilityTried = new Set(); // uids already attempted this Main Phase, reset each turn

  function evalHand(p) {
    // mulligan if fewer than 2 playable cheap cards
    const cheap = p.hand.filter(no => {
      const c = UAData.byNo.get(no);
      return c && c.type === 'Character' && (c.need || 0) <= 1;
    });
    return cheap.length < 2;
  }

  return {
    isBot: true,

    async chooseMulligan(p) { await delay(300); return evalHand(p); },

    async chooseExtraDraw(p) {
      // extra draw when hand is small and AP to spare
      return p.hand.length <= 4 && Engine.activeAP(p) >= 2;
    },

    async chooseMovements(p) {
      abilityTried = new Set();
      await delay(300);
      const moves = [];
      // move strong attackers from energy to front while keeping >= 2 energy cards
      const sorted = [...p.energy].filter(u => u.card.type === 'Character')
        .sort((a, b) => (b.card.bp || 0) - (a.card.bp || 0));
      for (const u of sorted) {
        if (p.front.length + moves.length >= 4) break;
        if (p.energy.length - moves.length <= 2) break;
        if ((u.card.bp || 0) >= 2000) moves.push({ uid: u.uid, to: 'front' });
      }
      return moves;
    },

    async chooseMainAction(p) {
      await delay(350);
      const G = Engine.G;

      // 0) try any untried [Activate: Main] ability once per turn
      const abilityUnit = [...p.front, ...p.energy].find(u =>
        !u.rested && !abilityTried.has(u.uid) && Effects.hasMain(u.card));
      if (abilityUnit) {
        abilityTried.add(abilityUnit.uid);
        return { type: 'ability', uid: abilityUnit.uid };
      }

      // 1) grow energy line to 4 with cheapest characters / sites
      if (p.energy.length < 4) {
        const candidates = p.hand
          .map(no => UAData.byNo.get(no))
          .filter(c => c && (c.type === 'Character' || c.type === 'Field'))
          .filter(c => Engine.hasEnergyFor(p, c) && Engine.activeAP(p) >= Engine.effectiveAp(p, c))
          .sort((a, b) => (a.need || 0) - (b.need || 0) || (a.ap || 0) - (b.ap || 0));
        if (candidates.length)
          return { type: 'play', no: candidates[0].no, line: 'energy' };
      }

      // 2) raid if possible
      for (const no of p.hand) {
        const c = UAData.byNo.get(no);
        if (!c || c.type !== 'Character') continue;
        const kw = Engine.parseKeywords(c);
        if (!kw.raidTargets.length) continue;
        if (!Engine.hasEnergyFor(p, c) || Engine.activeAP(p) < Engine.effectiveAp(p, c)) continue;
        const targets = Engine.raidTargetsFor(p, c);
        if (targets.length) {
          // prefer target on front line
          const t = targets.find(u => p.front.includes(u)) || targets[0];
          return { type: 'raid', no, targetUid: t.uid };
        }
      }

      // 3) play best affordable character to front line
      if (p.front.length < 4) {
        const candidates = p.hand
          .map(no => UAData.byNo.get(no))
          .filter(c => c && c.type === 'Character' && !Engine.parseKeywords(c).cannotEnterFront)
          .filter(c => Engine.hasEnergyFor(p, c) && Engine.activeAP(p) >= Engine.effectiveAp(p, c))
          .sort((a, b) => (b.bp || 0) - (a.bp || 0));
        if (candidates.length && (candidates[0].bp || 0) >= 2000)
          return { type: 'play', no: candidates[0].no, line: 'front' };
      }

      return { type: 'done' };
    },

    async chooseRaidMove(p, unit) { return p.front.length < 4; },

    async chooseAttacker(p, enemy) {
      await delay(400);
      const ready = p.front.filter(u => !u.rested && u.card.type === 'Character' && !u.kw.cannotAttack);
      if (!ready.length) return null;
      // attack with strongest first
      ready.sort((a, b) => Engine.bp(b) - Engine.bp(a));
      const atk = ready[0];
      // snipe weakest enemy front character if profitable
      if (atk.kw.snipe) {
        const targets = enemy.front.filter(u => Engine.bp(u) <= Engine.bp(atk));
        if (targets.length) {
          targets.sort((a, b) => Engine.bp(b) - Engine.bp(a));
          return { uid: atk.uid, targetUid: targets[0].uid };
        }
      }
      return { uid: atk.uid };
    },

    async chooseBlocker(p, atkUnit, candidates) {
      await delay(400);
      const atkBP = Engine.bp(atkUnit);
      // block with weakest unit that still wins/ties
      const winners = candidates.filter(u => Engine.bp(u) >= atkBP)
        .sort((a, b) => Engine.bp(a) - Engine.bp(b));
      if (winners.length) return winners[0].uid;
      // if life is critical, chump block with weakest
      if (p.life.length <= 2 && candidates.length) {
        const weakest = [...candidates].sort((a, b) => Engine.bp(a) - Engine.bp(b))[0];
        return weakest.uid;
      }
      return null;
    },

    async chooseLifeCards(p, defender, n) {
      // pick random life cards (they're face down anyway)
      const idx = [...Array(defender.life.length).keys()];
      const picked = [];
      for (let i = 0; i < n; i++) {
        picked.push(idx.splice(Math.floor(Math.random() * idx.length), 1)[0]);
      }
      return picked;
    },

    async orderTriggers(p, revealed) { return revealed; },

    async chooseUseTrigger(p, c) {
      await delay(300);
      if (c.trigger === 'Color' && !Effects.registry[c.no]?.onColorTrigger) return false; // unscripted — bot skips
      return true;
    },

    async chooseOwnCharacter(p, units, prompt) {
      // strongest front-line unit
      const front = units.filter(u => p.front.includes(u));
      const pool = front.length ? front : units;
      return pool.sort((a, b) => Engine.bp(b) - Engine.bp(a))[0].uid;
    },

    async chooseEnemyCharacter(p, units, prompt) {
      return units.sort((a, b) => Engine.bp(b) - Engine.bp(a))[0].uid;
    },

    async chooseRaidFromTrigger(p, c, targets) {
      const t = targets.find(u => p.front.includes(u)) || targets[0];
      return t ? t.uid : null;
    },

    // generic option picker for card effects: pick first option (they're ordered best-first)
    async chooseOption(p, title, options) {
      await delay(200);
      return options.length ? options[0].value : null;
    },

    // pick a card from hand to give up: highest required-energy card
    async chooseCardFromHand(p, title) {
      if (!p.hand.length) return null;
      let worst = 0, worstCost = -1;
      p.hand.forEach((no, i) => {
        const c = UAData.byNo.get(no);
        if ((c?.need || 0) > worstCost) { worstCost = c?.need || 0; worst = i; }
      });
      return worst;
    },

    async chooseCardsFromHand(p, n, title) {
      const idxs = p.hand.map((no, i) => i)
        .sort((a, b) => (UAData.byNo.get(p.hand[b])?.need || 0) - (UAData.byNo.get(p.hand[a])?.need || 0));
      return idxs.slice(0, Math.min(n, idxs.length));
    },

    async chooseCardFromRemoval(p, title, predicate) {
      const idx = p.removal.findIndex((no) => !predicate || predicate(UAData.byNo.get(no)));
      return idx >= 0 ? idx : null;
    },

    async chooseCardFromSideline(p, title, predicate) {
      const idx = p.sideline.findIndex((no) => !predicate || predicate(UAData.byNo.get(no)));
      return idx >= 0 ? idx : null;
    },

    async chooseRevealPick(p, revealedNos, title, predicate, maxPick) {
      const picked = [];
      revealedNos.forEach((no, i) => {
        if (picked.length < maxPick && (!predicate || predicate(UAData.byNo.get(no)))) picked.push(i);
      });
      return picked;
    },

    async chooseDiscard(p) {
      // discard highest-cost card
      let worst = 0, worstCost = -1;
      p.hand.forEach((no, i) => {
        const c = UAData.byNo.get(no);
        if ((c?.need || 0) > worstCost) { worstCost = c?.need || 0; worst = i; }
      });
      return worst;
    },

    notify() {},
  };
}

// build a random legal bot deck from a series (mono-color per deck rules)
function buildBotDeck(seriesCode, color) {
  let pool = UAData.cards.filter(c => c.main && c.series === seriesCode &&
    ['Character', 'Event', 'Field'].includes(c.type));
  // pick the color with the largest pool if not specified
  if (!color) {
    const byColor = {};
    for (const c of pool) if (c.color) byColor[c.color] = (byColor[c.color] || 0) + 1;
    color = Object.entries(byColor).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  pool = pool.filter(c => c.color === color);
  // prefer low-cost characters, add 4x each until 50
  const chars = pool.filter(c => c.type === 'Character').sort((a, b) => (a.need || 0) - (b.need || 0));
  const events = pool.filter(c => c.type === 'Event');
  const deck = [];
  const trig = { Special: 0, Color: 0, Final: 0 };
  function tryAdd(c, copies) {
    for (let i = 0; i < copies && deck.length < 50; i++) {
      if (['Special', 'Color', 'Final'].includes(c.trigger)) {
        if (trig[c.trigger] >= 4) return;
        trig[c.trigger]++;
      }
      deck.push(c.no);
    }
  }
  // mix: mostly characters with spread of costs
  const shuffled = [...chars].sort(() => Math.random() - 0.5);
  // ensure ~28 cheap (need<=2), rest any
  for (const c of shuffled.filter(c => (c.need || 0) <= 2)) { if (deck.length >= 30) break; tryAdd(c, 4); }
  for (const c of shuffled) { if (deck.length >= 44) break; tryAdd(c, 2); }
  for (const c of events.sort(() => Math.random() - 0.5)) { if (deck.length >= 50) break; tryAdd(c, 2); }
  for (const c of shuffled) { if (deck.length >= 50) break; tryAdd(c, 1); }
  return deck.slice(0, 50);
}
