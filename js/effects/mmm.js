// ══════════ UA SIM — Puella Magi Madoka Magica (MMM) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function eventsInSideline(p) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length; }
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }

  // 008 Madoka Kaname — [On Play] look top 4, place up to 1 Character among them to the Outside
  // Area, remainder to top. @[Main][Rest] look at the top card, place on top or Outside Area.
  reg['UA31BT-MMM-1-008'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 4, 1, `${unit.card.name}: ดูบนสุด 4 ใบ`, c => c.type === 'Character'); },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 017 Mami Tomoe — passive: if 2+ Event Cards in your Outside Area, +1000 BP your turn.
  reg['UA31BT-MMM-1-017'] = { bpBonus(p, unit) { return (isYourTurn(p) && eventsInSideline(p) >= 2) ? 1000 : 0; } };

  // 018 Mami Tomoe (2) — [On Play] if 2+ Event Cards in your Outside Area, draw 1.
  reg['UA31BT-MMM-1-018'] = { async onPlay(G, p, unit) { if (eventsInSideline(p) >= 2) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 024 Sayaka Miki — [On Play] if this character was played from the Remove Area, look at the
  // top 2, keep any number on top, remainder to the Outside Area.
  reg['UA31BT-MMM-1-024'] = { async onPlay(G, p, unit) { if (unit._playedFromRemoval) await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูบนสุด 2 ใบ`); } };

  // 028 "Law of Cycles" — gated by Madoka/Ultimate Madoka on your area: choose 1 enemy Front Line
  // BP<=5000, retire it to the Remove Area. (Skipped: the event card's own self-placement clause —
  // the recurring "resolved Event card always goes to sideline" architecture limitation.)
  reg['UA31BT-MMM-1-028'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Madoka Kaname') && !H.hasCardNamed(p, 'Ultimate Madoka')) { p.controller.notify?.('ต้องมี Madoka Kaname หรือ Ultimate Madoka บนสนาม'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (t) await forceToRemoval(enemy, t, 'effect');
    },
  };

  // 029 "Like This! That's Definitely Wrong!" — rest 1 active own Front Line character, if you did
  // draw 3.
  reg['UA31BT-MMM-1-029'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character' && !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ของคุณ`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
    },
  };

  // 032 "Tiro Finale" — rest 1 enemy Front Line BP<=5000, doesn't stand next time; if there is a
  // Mami Tomoe on your area, may retire it instead.
  reg['UA31BT-MMM-1-032'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Mami Tomoe')) {
        const v = await p.controller.chooseOption(p, `${card.name}: Retire แทนได้`, [{ label: 'Retire', value: true }, { label: 'วางนอนแทน', value: false }]);
        if (v) { await Engine.sidelineUnit(enemy, t, 'effect'); return; }
      }
      t.rested = true; t.skipNextStand = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน (ไม่ลุกครั้งถัดไป)`);
    },
  };

  // 033 "I'm Not Afraid of Anything Anymore" — rest 1 enemy Front Line character; if there is a
  // Mami Tomoe on your area and 2+ Event Cards in your Outside Area, upgrade to skip-next-stand.
  // (Skipped: the "only 1 per turn" usage-limit clause — deck-building-level restriction.)
  reg['UA31BT-MMM-1-033'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      if (H.hasCardNamed(p, 'Mami Tomoe') && eventsInSideline(p) >= 2) t.skipNextStand = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน`);
    },
  };

  // 042 Madoka Kaname (2) — [On Play] play up to 1 purple Homura Akemi/Madoka Kaname (need<=1,
  // ap=1) from hand rested; threshold becomes need<=2 if all own characters are Homura/Madoka.
  reg['UA31BT-MMM-1-042'] = {
    async onPlay(G, p, unit) {
      const units = [...p.front, ...p.energy];
      const allHM = units.length > 0 && units.every(u => (u.card.name || '').includes('Homura Akemi') || (u.card.name || '').includes('Madoka Kaname'));
      const maxNeed = allHM ? 2 : 1;
      const i = p.hand.findIndex(no => { const c = byNo(no); return c && c.color === 'Purple' && ((c.name || '').includes('Homura Akemi') || (c.name || '').includes('Madoka Kaname')) && (c.need || 0) <= maxNeed && (c.ap || 0) === 1; });
      if (i < 0 || p.front.length >= 4) return;
      await Engine.playCardFromZone(p, p.hand[i], 'hand', { line: 'front', active: false });
    },
  };

  // 048 Madoka Kaname (3) — [On Play] look at the top 2, keep any number on top, remainder to the
  // Outside Area.
  reg['UA31BT-MMM-1-048'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูบนสุด 2 ใบ`); } };

  // 052 Kyoko Sakura — [Main][1/turn] can only be activated if this character's BP is 5000+: set
  // this character to active.
  reg['UA31BT-MMM-1-052'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.bp(unit) < 5000) { p.controller.notify?.('BP ต้อง 5000 ขึ้นไป'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      log(`${unit.card.name}: ตั้งขึ้น Active`);
    },
  };

  // 055 Mami Tomoe (2) — [Main][When in Frontline][1/turn] can only be activated if active: choose
  // 1 Nagisa Momoe or other Trait:Puella Magi Holy Quintet, +1000 BP.
  reg['UA31BT-MMM-1-055'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit) || unit.rested) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && ((u.card.name || '').includes('Nagisa Momoe') || (u.card.traits || '').includes('Puella Magi Holy Quintet')));
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 060 Sayaka Miki (2) — [On Play] add up to 1 purple Trait:Mahou Shoujo from your Outside Area
  // to your hand.
  reg['UA31BT-MMM-1-060'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.color === 'Purple' && (c.traits || '').includes('Mahou Shoujo'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 061 "Homura's Weapon" (Field) — [Main][Rest][Discard 1] draw 1.
  reg['UA31BT-MMM-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 062 "I Was Waiting For This Moment..." — choose up to 1 own Front Line, +2000 BP and
  // [Impact +1]; if there is a Homura Akemi on your area, draw 1.
  reg['UA31BT-MMM-1-062'] = {
    async onEvent(G, p, card) {
      if (p.front.length) {
        const uid = await p.controller.chooseOwnCharacter(p, p.front, `${card.name}: เลือก character บน Front Line`, true);
        const t = p.front.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} +2000 BP และ [Impact +1] เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Homura Akemi')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 069 Kyubey — [On Retire] add this card to your hand.
  reg['UA31BT-MMM-1-069'] = {
    async onSideline(G, p, unit, reason) {
      const i = p.sideline.indexOf(unit.no);
      if (i < 0) return;
      p.sideline.splice(i, 1); p.hand.push(unit.no);
      log(`${unit.card.name}: กลับเข้ามือแทนที่จะไป Outside Area`);
    },
  };

  // 074 Homura Akemi — [On Play] if there is a Madoka Kaname on your area, draw 1.
  reg['UA31BT-MMM-1-074'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Madoka Kaname')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 077 Madoka Kaname (4) — passive: if 3+ Trait:Mahou Shoujo (different names) other than this
  // card on your area, +1 generated energy.
  reg['UA31BT-MMM-1-077'] = {
    genMod(unit, p) {
      const names = new Set([...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Mahou Shoujo')).map(u => u.card.name));
      return names.size >= 3 ? 1 : 0;
    },
  };

  // 089 Sayaka Miki (3) — passive: if your Life is 4 or less, +500 BP your turn. @[Main][1/turn]
  // add 1 card from your Life to your hand, if you did set this character to active.
  reg['UA31BT-MMM-1-089'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p.life.length <= 4) ? 500 : 0; },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const no = await H.addLifeToHand(p);
      if (no == null) return;
      unit._usedTurn = Engine.G.turn;
      unit.rested = false; log(`${unit.card.name}: ตั้งขึ้น Active`);
    },
  };

  // 092 "I'm Really Stupid..." — add 1 card from your Life to your hand, if you did draw 2.
  reg['UA31BT-MMM-1-092'] = {
    async onEvent(G, p, card) {
      const no = await H.addLifeToHand(p);
      if (no == null) return;
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 100 "Being Alone is Lonely..." — retire 1 Kyoko Sakura on your area, if you did choose up to 1
  // enemy Front Line character with BP<= that Kyoko's BP and retire it, draw 2.
  reg['UA31BT-MMM-1-100'] = {
    async onEvent(G, p, card) {
      const kyokos = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kyoko Sakura'));
      if (!kyokos.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, kyokos, `${card.name}: เลือก Kyoko Sakura ให้ retire`);
      const t = kyokos.find(x => x.uid === uid);
      if (!t) return;
      const bpLimit = Engine.bp(t);
      await Engine.sidelineUnit(p, t, 'effect');
      await H.retireEnemyFront(p, bpLimit);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 102 Homura Akemi (2, ST) — [On Play] may place 1 Madoka Kaname from your area to the bottom of
  // your deck; if you did, draw 1 and play up to 1 red Trait:Mahou Shoujo (need<=4, ap=1) from
  // your hand to your area rested.
  reg['UA31ST-MMM-1-102'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Madoka Kaname'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่ง Madoka Kaname ไปล่างสุดของเด็ค? (ไม่บังคับ)`, [{ label: 'ข้าม', value: null }, ...targets.map(u => ({ label: u.card.name, value: u.uid }))]);
      if (v == null) return;
      const t = targets.find(x => x.uid === v);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      p.deck.push(t.no);
      log(`${unit.card.name}: ${t.card.name} ไปล่างสุดของเด็ค`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const i2 = p.hand.findIndex(no => { const c = byNo(no); return c && c.color === 'Red' && (c.traits || '').includes('Mahou Shoujo') && (c.need || 0) <= 4 && (c.ap || 0) === 1; });
      if (i2 < 0 || p.front.length >= 4) return;
      await Engine.playCardFromZone(p, p.hand[i2], 'hand', { line: 'front', active: false });
    },
  };

  // 108 Mitakihara Junior High School (Field, ST) — [On Play] may place 1 card from hand to the
  // Outside Area; if you did, add up to 1 Trait:Mahou Shoujo (need<=3, ap=1) from your Outside
  // Area to your hand.
  reg['UA31ST-MMM-1-108'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: ส่งการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Mahou Shoujo') && (c.need || 0) <= 3 && (c.ap || 0) === 1, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 112 Homura Akemi (3, ST2) — [On Retire] add up to 1 Madoka Kaname (need<=2) from your Outside
  // Area to your hand.
  reg['UA31ST-MMM-1-112'] = {
    async onSideline(G, p, unit, reason) {
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Madoka Kaname') && (c.need || 0) <= 2, `${unit.card.name}: เลือก Madoka Kaname จาก Outside Area`);
    },
  };
})();
