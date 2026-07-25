// ══════════ UA SIM — Code Geass R2 (CGD) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  async function lookTopSplitTopBottom(p, n, title) {
    n = Math.min(n, p.deck.length);
    if (!n) return;
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title, null, n);
    const toBottom = [];
    picked.sort((a, b) => b - a).forEach(i => { toBottom.push(revealed.splice(i, 1)[0]); });
    p.deck.unshift(...revealed);
    p.deck.push(...toBottom);
    log(`${p.name}: จัดเรียงการ์ดบนสุด ${n} ใบ`);
  }
  // reveal top N, optionally play up to `maxPlay` matching `predicate` to the Front Line rested,
  // remainder to the bottom of the deck (approximates the "or raid it" alternative as skipped).
  async function lookTopPlayFromDeck(p, n, maxPlay, predicate, title) {
    n = Math.min(n, p.deck.length);
    if (!n) return;
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title, predicate, maxPlay);
    const toPlay = [];
    picked.sort((a, b) => b - a).forEach(i => { toPlay.push(revealed.splice(i, 1)[0]); });
    p.deck.push(...revealed);
    for (const no of toPlay) {
      p.deck.unshift(no);
      if (p.front.length < 4) {
        await Engine.playCardFromZone(p, no, 'deck', { line: 'front', active: false });
      } else {
        p.deck.shift();
        p.deck.push(no);
      }
    }
  }

  // 006 Kensei Kuroto — [On Play][1/turn] discount the next Trait:KMF card (need<=3) you use from
  // hand by 1 AP this turn.
  reg['UA34BT-CGD-1-006'] = {
    async onPlay(G, p, unit) {
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('KMF') && (c.need || 0) <= 3, apDelta: -1 };
      log(`${unit.card.name}: Trait:KMF (Energy 3 หรือน้อยกว่า) ใบถัดไป ลด AP cost 1`);
    },
  };

  // 007 Yuri Sano — [Main][Rest] choose 1 other Trait:Seven Shining Stars, +1000 BP this turn; if
  // KMF, may look at the top card and place it on top or to the Outside Area.
  reg['UA34BT-CGD-1-007'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Seven Shining Stars'));
      if (!targets.length) return;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Seven Shining Stars`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      if ((t.card.traits || '').includes('KMF')) await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 008 Shota Munemori — [On Play] choose up to 1 other Trait:Seven Shining Stars, +1000 BP.
  reg['UA34BT-CGD-1-008'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Seven Shining Stars'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Seven Shining Stars`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 009 Isao Monobe — [Main][Rest+Retire] choose 1: retire enemy BP<=2000; OR discard 1 Trait:KMF
  // (need<=3) from hand, if you did retire enemy BP<=4000.
  reg['UA34BT-CGD-1-009'] = {
    async onMain(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'Retire ศัตรู BP 2000 หรือน้อยกว่า', value: 'a' }, { label: 'ทิ้ง Trait:KMF (Energy<=3) → Retire ศัตรู BP 4000 หรือน้อยกว่า', value: 'b' },
      ]);
      await Engine.sidelineUnit(p, unit, 'effect');
      if (v === 'a') { await H.retireEnemyFront(p, 2000); return; }
      const i = p.hand.findIndex(no => { const c = byNo(no); return c && (c.traits || '').includes('KMF') && (c.need || 0) <= 3; });
      if (i < 0) return;
      const no = p.hand.splice(i, 1)[0]; p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      await H.retireEnemyFront(p, 4000);
    },
  };

  // 011 Haruka Rutaka — passive: if there is a Trait:KMF (need<=3) on your area, +500 BP your turn.
  reg['UA34BT-CGD-1-011'] = { bpBonus(p, unit) { return (isYourTurn(p) && [...p.front, ...p.energy].some(u => (u.card.traits || '').includes('KMF') && (u.card.need || 0) <= 3)) ? 500 : 0; } };

  // 015 Mei Ema — [Main][When in Frontline][Rest][1/turn] rest 1 enemy Front Line character.
  reg['UA34BT-CGD-1-015'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit) || unit.rested) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      await H.restEnemyFront(p);
    },
  };

  // 019 Natalia Luxembourg — [On Play] look at the top 2, keep any number on top (any order),
  // remainder to the bottom.
  reg['UA34BT-CGD-1-019'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 037 "Aircraft Provide" — play up to 2 yellow Trait:KMF (need<=3) from your Outside Area to
  // your area rested. (Skipped: the "or raid them" alternative.)
  reg['UA34BT-CGD-1-037'] = {
    async onEvent(G, p, card) {
      for (let n = 0; n < 2; n++) {
        const i = p.sideline.findIndex(no => { const c = byNo(no); return c && c.color === 'Yellow' && (c.traits || '').includes('KMF') && (c.need || 0) <= 3; });
        if (i < 0 || p.front.length >= 4) break;
        await Engine.playCardFromZone(p, p.sideline[i], 'sideline', { line: 'front', active: false });
      }
    },
  };

  // 040 "Power of Absolute Obedience" — retire 1 enemy Front Line character BP<=5000. (The
  // AP-cost discount clause is handled generically at the engine's cost-computation layer.)
  reg['UA34BT-CGD-1-040'] = { async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); } };

  // 041 Loki — deck-building rule text only (no in-game action).
  reg['UA34BT-CGD-1-041'] = { async onPlay() {} };

  // 048 Walther Lindstedt — [Main][1/turn] only if a Sakura, Princess Haruyanagi is on your area:
  // look at the top card, place it on top or bottom.
  reg['UA34BT-CGD-1-048'] = {
    async onMain(G, p, unit) {
      if (!H.hasCardNamed(p, 'Sakura, Princess Haruyanagi')) { p.controller.notify?.('ต้องมี Sakura, Princess Haruyanagi บนสนาม'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 050 Catherine Sabathra — [Main][1/turn] place 1 card from hand on top of deck, +1000 BP.
  reg['UA34BT-CGD-1-050'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือไปบนสุดของเด็ค`);
      if (i == null) return;
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      unit.bpMod += 1000;
      log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค, +1000 BP เทิร์นนี้`);
    },
  };

  // 054 Christoph Scissorman — [Main][Rest] retire 1 other own character, if you did +2500 BP.
  reg['UA34BT-CGD-1-054'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ตัวเองให้ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      unit.bpMod += 2500; log(`${unit.card.name}: +2500 BP เทิร์นนี้`);
    },
  };

  // 055 Christoph Scissorman — passive: if a character on your area was retired/left during this
  // turn, +1000 BP.
  reg['UA34BT-CGD-1-055'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && unit._retireWatchTurn === Engine.G.turn) ? 1000 : 0; },
    onAnyLeaveField(G, p, leftUnit, selfUnit) { selfUnit._retireWatchTurn = Engine.G.turn; },
  };

  // 056 Stanley Vonbraun — [On Play] play up to 1 Loki from your hand to your area rested.
  reg['UA34BT-CGD-1-056'] = {
    async onPlay(G, p, unit) {
      const i = p.hand.findIndex(no => (byNo(no)?.name || '') === 'Loki');
      if (i < 0 || p.front.length >= 4) return;
      await Engine.playCardFromZone(p, p.hand[i], 'hand', { line: 'front', active: false });
    },
  };

  // 058 Natalia Luxembourg (2) — [Main][1/turn] choose 1 other Trait:Neo-Britannian Empire on your
  // Front Line, move to the Energy Line.
  reg['UA34BT-CGD-1-058'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => u !== unit && (u.card.traits || '').includes('Neo-Britannian Empire'));
      if (!targets.length || p.energy.length >= 4) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Neo-Britannian Empire`);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, 'energy');
    },
  };

  // 076 "It's Better to Disappear From Here" — gated by Norland von Lunebelg or a "Foulbout"-named
  // card on your area: retire 1 enemy Front Line character BP<=5000; you may retire 1 of your own
  // characters, if you did choose up to 1 enemy Energy Line character and it cannot move until the
  // start of your opponent's next turn.
  reg['UA34BT-CGD-1-076'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Norland von Lunebelg') && ![...p.front, ...p.energy].some(u => (u.card.name || '').includes('Foulbout'))) { p.controller.notify?.('ต้องมี Norland von Lunebelg หรือการ์ด Foulbout บนสนาม'); return; }
      await H.retireEnemyFront(p, 5000);
      const own = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!own.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: retire character ตัวเอง? (ไม่บังคับ)`, [{ label: 'ข้าม', value: null }, ...own.map(u => ({ label: u.card.name, value: u.uid }))]);
      if (v == null) return;
      const t = own.find(x => x.uid === v);
      if (t) await Engine.sidelineUnit(p, t, 'effect');
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูบน Energy Line`, true);
      const et = targets.find(x => x.uid === uid);
      if (!et) return;
      et.tempCannotMove = true;
      const dueTurn = Engine.G.turn + 2;
      Engine.scheduleDelayedAction(dueTurn, () => { et.tempCannotMove = false; });
      log(`${card.name}: ${et.card.name} ห้ามเคลื่อนที่จนถึงต้นเทิร์นหน้าของฝ่ายตรงข้าม`);
    },
  };

  // 078 "Situmpe Wall" — all characters on your area gain untargetable until the start of your
  // next turn.
  reg['UA34BT-CGD-1-078'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy];
      for (const u of units) u.tempUntargetable = true;
      const dueTurn = Engine.G.turn + 2;
      Engine.scheduleDelayedAction(dueTurn, () => { for (const u of units) u.tempUntargetable = false; });
      if (units.length) log(`${card.name}: character ทั้งหมดบนสนาม ไม่ถูกเลือกเป็นเป้าหมายโดยเอฟเฟกต์ศัตรู จนถึงต้นเทิร์นหน้าของคุณ`);
    },
  };

  // 079 "Nara's Negotiation Skills" — look at the top 4, from among them play up to 1 blue
  // Trait:Neo-Britannian Empire Character (need<=4, AP cost 1) to your area rested; remainder to
  // the bottom. (Skipped: the "or raid it" alternative.)
  reg['UA34BT-CGD-1-079'] = {
    async onEvent(G, p, card) {
      await lookTopPlayFromDeck(p, 4, 1, c => c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('Neo-Britannian Empire') && (c.need || 0) <= 4 && (c.ap || 0) === 1, `${card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };
})();
