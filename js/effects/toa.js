// ══════════ UA SIM — Tales of Arise (TOA) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function totalGen(p) { return Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0); }
  function countEventsInSideline(p) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length; }
  async function debuffEnemyFrontMin(p, minBp, delta) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= minBp);
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู (BP≥${minBp}) รับ ${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }
  // 078/103 both grant "this turn you cannot place cards from your Life Area to the Outside Area
  // by your card effect" — a local flag only this file's own Life-to-Outside effects (069/101) respect.
  async function placeLifeToOutside(p, unit) {
    if (p._noLifeToOutsideThisTurn) return;
    if (!p.life.length) return;
    const no = p.life.shift();
    p.sideline.push(no);
    p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
    log(`${unit.card.name}: วางการ์ดจาก Life Area ไป Outside Area`);
  }

  // 011 Dohalim — [On Play] only if own Kisara: choose up to 1 own character, grant "[1/turn] when
  // this character attacks and is not blocked, draw 1 card" this turn.
  reg['TOA-1-011'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Kisara')) return;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedUnblockedDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "โจมตีไม่ถูก block แล้วจั่ว 1 ใบ" เทิร์นนี้`); }
    },
  };

  // 012 Dohalim — [On Play] only if own Kisara: choose up to 1 enemy Front Line character BP≥1500,
  // -1000 BP this turn.
  reg['TOA-1-012'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Kisara')) await debuffEnemyFrontMin(p, 1500, -1000); } };

  // 017 Hootle — [Main][Rest][Discard1][Retire this card] add up to 1 Event Card from your
  // Outside Area to your hand.
  reg['TOA-1-017'] = {
    async onMain(G, p, unit) {
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && c.type === 'Event', `${unit.card.name}: เลือก Event Card จาก Outside Area`);
    },
  };

  // 023 Law — [On Play] only if own Rinwell: draw 1, place 1 card from hand to Outside Area.
  reg['TOA-1-023'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Rinwell')) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 027 "Air Thrust" — may place 1 Event Card from hand to Outside Area. Choose up to 1 enemy
  // Front Line character BP≤3000 (or ≤4000 if an Event was placed) and return it to hand.
  reg['TOA-1-027'] = {
    async onEvent(G, p, card) {
      let upgraded = false;
      const idx = p.hand.findIndex(no => byNo(no)?.type === 'Event');
      if (idx >= 0) {
        const v = await p.controller.chooseOption(p, `${card.name}: วาง Event Card จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { const no = p.hand.splice(idx, 1)[0]; p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; upgraded = true; log(`${card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`); }
      }
      const enemy = Engine.opponentOf(p);
      const limit = upgraded ? 4000 : 3000;
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= limit);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤${limit})`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.returnUnitToHand(enemy, t); log(`${card.name}: ${t.card.name} ถูกส่งกลับมือ`); }
    },
  };

  // 028 "Thunder Blade" — choose 1 enemy Front Line character and rest it. May place 1 Event Card
  // from hand to Outside Area; if did, set 1 of your AP cards active.
  reg['TOA-1-028'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p, null);
      const idx = p.hand.findIndex(no => byNo(no)?.type === 'Event');
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วาง Event Card จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      await H.apUntap(p, 1);
    },
  };

  // 029 "Guardian Field" — choose 1 own Front Line character, give it "opponent cannot choose this
  // character" until the start of your next turn (approximated via tempUntargetable, shorter
  // duration than printed). (Skipped: the "it's 1 or 2 instead if own Kisara" nuance — ambiguous
  // wording, likely a data/translation artifact; left as the safer unconditional single-target grant.)
  reg['TOA-1-029'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${card.name}: ${t.card.name} ห้ามถูกเลือกโดยศัตรูเทิร์นนี้`); }
    },
  };

  // 032 "Fish Steak" — choose 1 own character +1000 BP this turn (until the start of your next
  // turn instead, if own Kisara).
  reg['TOA-1-032'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Kisara')) { t.bpPersist += 1000; log(`${card.name}: ${t.card.name} +1000 BP จนถึงต้นเทิร์นหน้า`); }
      else { t.bpMod += 1000; log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 034 "Hootle Pancakes" — choose 1 own character +2500 BP this turn. Draw 1 if own Rinwell.
  reg['TOA-1-034'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2500);
      if (H.hasCardNamed(p, 'Rinwell')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 037 Alphen — [Main][Rest+Retire this card] draw 1.
  reg['TOA-1-037'] = { async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };

  // 039 Alphen — [When Attacking] look at the top card of your deck, place it on top or bottom.
  reg['TOA-1-039'] = { async onAttack(G, p, unit) { await H.scryTop(p, ['top', 'bottom']); } };

  // 041 Kisara — [On Play] only if own Dohalim: choose up to 1 other own character +1000 BP this turn.
  reg['TOA-1-041'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Dohalim')) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 042 Kisara — [On Play] only if own Dohalim: free-play 1 green character (need≤2, ap1) from
  // hand rested.
  reg['TOA-1-042'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Dohalim')) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 046 Shionne — passive: if you have 6+ generated energy, +1000 BP.
  reg['TOA-1-046'] = { bpBonus(p, unit) { return totalGen(p) >= 6 ? 1000 : 0; } };

  // 051 Dohalim — [Main][Frontline][1/turn] choose 1 own character +1000 BP this turn. If you use
  // an Event Card this turn, draw 1.
  reg['TOA-1-051'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
      if (p._eventsUsedThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 060 Menancia (Field) — [1/turn] when a character on your area attacks and wins a battle, may
  // draw 1.
  reg['TOA-1-060'] = {
    async onAnyWinBattle(G, p, atk, enemyOwner, defender, self) {
      if (self.card.type !== 'Field' || self._usedTurn === Engine.G.turn) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 064 "Dohalim Pancakes" — choose up to 1 own character +1000 BP and [Impact +1] this turn.
  // Draw 1 if own Dohalim.
  reg['TOA-1-064'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; t.tempImpact += 1; log(`${card.name}: ${t.card.name} +1000 BP และ [Impact +1] เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Dohalim')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 066 "First Aid" — add 1 Character Card from your Outside Area to your hand.
  reg['TOA-1-066'] = { async onEvent(G, p, card) { await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก Character Card จาก Outside Area`); } };

  // 068 Alphen — passive: if your Life is 4 or less, +500 BP.
  reg['TOA-1-068'] = { bpBonus(p, unit) { return p.life.length <= 4 ? 500 : 0; } };

  // 069 Alphen — [On Play] choose up to 1 enemy Front Line character BP≤4000, may retire it; if
  // did, place 1 card from your Life Area to the Outside Area.
  reg['TOA-1-069'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤4000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire ${t.card.name}?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await Engine.sidelineUnit(enemy, t, 'effect');
      await placeLifeToOutside(p, unit);
    },
  };

  // 074 Shionne — [On Play] only if own Alphen: draw 1, place 1 card from hand to Outside Area.
  reg['TOA-1-074'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Alphen')) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 075 Shionne — [On Play] only if own Alphen: look at top 2, place any number on top (any
  // order), remainder to the bottom.
  reg['TOA-1-075'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Alphen')) return;
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, null, revealed.length);
      const keepSet = new Set(keepIdxs);
      const keep = [], bottom = [];
      revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
      p.deck.unshift(...keep);
      p.deck.push(...bottom);
    },
  };

  // 078 Shionne — [On Play] this turn, you cannot place cards from your Life Area to the Outside
  // Area by your card effect (enforced locally against this file's own 069/101 clauses only).
  reg['TOA-1-078'] = { async onPlay(G, p, unit) { p._noLifeToOutsideThisTurn = true; log(`${unit.card.name}: เทิร์นนี้ ห้ามวางการ์ดจาก Life Area ไป Outside Area ด้วย effect`); } };

  // 085 Rinwell — [On Play] only if own Law: choose up to 1 other own character +1000 BP this turn.
  reg['TOA-1-085'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Law')) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 086 Rinwell — [On Play] only if own Law: draw 1, place 1 card from hand to Outside Area.
  reg['TOA-1-086'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Law')) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 090 Law — passive: on your turn, if 4+ Event Cards in your Outside Area, +1000 BP.
  reg['TOA-1-090'] = { bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && countEventsInSideline(p) >= 4) ? 1000 : 0; } };

  // 093 "Infernal Torrent" (Field) — [Main][Retire this card] only if a character was retired
  // this turn (approximated — the printed condition additionally requires the retired character
  // to be an opponent's with original BP≥4000, which no existing tracker distinguishes): draw 2.
  reg['TOA-1-093'] = {
    async onMain(G, p, unit) {
      if (!Engine.G.retiredThisTurn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 098 "Mabo Curry" — choose 1 own character +1000 BP this turn; if it's Alphen, also set it active.
  reg['TOA-1-098'] = {
    async onEvent(G, p, card) {
      const t = await H.buffOwnCharacter(p, 1000);
      if (t && (t.card.name || '').includes('Alphen')) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 100 "Talon Storm" — choose up to 1 own character +2000 BP this turn. Draw 1 if own Law.
  reg['TOA-1-100'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2000);
      if (H.hasCardNamed(p, 'Law')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 101 Alphen — [Main][1/turn] self +1000 BP this turn. Place 1 card from your Life Area to the
  // Outside Area.
  reg['TOA-1-101'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
      await placeLifeToOutside(p, unit);
    },
  };

  // 103 Shionne — [On Play] choose up to 1 other own character +2000 BP and [Impact +1] this
  // turn. This turn, you cannot place cards from your Life Area to the Outside Area by your card
  // effect.
  reg['TOA-1-103'] = {
    async onPlay(G, p, unit) {
      const t = await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
      p._noLifeToOutsideThisTurn = true;
      log(`${unit.card.name}: เทิร์นนี้ ห้ามวางการ์ดจาก Life Area ไป Outside Area ด้วย effect`);
    },
  };

  // 108 "Crimson Crows' Hideout" (Field) — [Main][Rest+Retire this card] set 1 of your AP cards
  // active, draw 1.
  reg['TOA-1-108'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.apUntap(p, 1);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // UAPR-TOA-P-002 Law — [Main][Rest] only if 3+ Event cards in your Outside Area: choose 1 of:
  // choose 1 own character with an original AP cost of 2 and set it active; or if you used an
  // Event Card this turn, +1 generated energy this turn (cannot repeat the same choice twice this
  // turn). @[Main][When in Energy Line][1/turn] only if 5+ Event cards in your Outside Area: set
  // self active.
  reg['UAPR-TOA-P-002'] = {
    async onMain(G, p, unit) {
      const n = countEventsInSideline(p);
      const opts = [];
      unit._chosenThisTurn ||= new Set();
      if (unit._chosenTurnKey !== Engine.G.turn) { unit._chosenThisTurn.clear(); unit._chosenTurnKey = Engine.G.turn; }
      if (!unit.rested && n >= 3) {
        if (!unit._chosenThisTurn.has('a') && [...p.front, ...p.energy].some(u => (u.card.ap || 0) === 2)) opts.push({ label: 'Active character (AP cost 2)', value: 'a' });
        if (!unit._chosenThisTurn.has('b') && p._eventsUsedThisTurn) opts.push({ label: '+1 energy generation เทิร์นนี้', value: 'b' });
      }
      if (p.energy.includes(unit) && unit._usedTurnEnergyLine !== Engine.G.turn && n >= 5) opts.push({ label: 'Active ตัวเอง (Energy Line)', value: 'c' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'c') { unit._usedTurnEnergyLine = Engine.G.turn; unit.rested = false; log(`${unit.card.name}: Active`); return; }
      unit.rested = true;
      unit._chosenThisTurn.add(v);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.ap || 0) === 2);
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (AP cost 2)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      } else { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
    },
  };
})();
