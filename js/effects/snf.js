// ══════════ UA SIM — Shangri-La Frontier (SNF) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  async function lookTopKeepAnyOnTopRestBottom(p, unit, n, title) {
    const cnt = Math.min(n, p.deck.length);
    if (!cnt) return;
    const revealed = p.deck.splice(0, cnt);
    const keepIdxs = await p.controller.chooseRevealPick(p, revealed, title, null, revealed.length);
    const keepSet = new Set(keepIdxs);
    const keep = [], bottom = [];
    revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
    p.deck.unshift(...keep);
    p.deck.push(...bottom);
    log(`${unit.card.name}: ดูการ์ดบนสุด ${cnt} ใบ`);
  }

  // 002 Animalia — [Main][1/turn] if a Trait:Vorpal Bunny is on a different line from this
  // character, move this character to that line.
  reg['UA32BT-SNF-1-002'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const selfLine = p.front.includes(unit) ? p.front : p.energy;
      const otherLine = selfLine === p.front ? p.energy : p.front;
      if (!otherLine.some(u => (u.card.traits || '').includes('Vorpal Bunny'))) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, unit, selfLine === p.front ? 'energy' : 'front');
    },
  };

  // 003 Aramis — [On Play] if own Bilac on area, set self active.
  reg['UA32BT-SNF-1-003'] = {
    async onPlay(G, p, unit) {
      if (H.hasCardNamed(p, 'Bilac')) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 004 Sunraku — [When Attacking][On Block] may place 1 green Event Card from hand to Outside
  // Area; if did, self +2500 BP this turn.
  reg['UA32BT-SNF-1-004'] = {
    async onAttack(G, p, unit) { await sunrakuGreenEventBuff(p, unit); },
    async onBlock(G, p, unit) { await sunrakuGreenEventBuff(p, unit); },
  };
  async function sunrakuGreenEventBuff(p, unit) {
    const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Event' && c.color === 'Green'; });
    if (idx < 0) return;
    const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Event card สีเขียวจากมือไป Outside Area เพื่อ +2500 BP?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    const no = p.hand.splice(idx, 1)[0];
    p.sideline.push(no);
    unit.bpMod += 2500;
    log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area — +2500 BP เทิร์นนี้`);
  }

  // 006 Sunraku — [On Play] draw 1, place any number of green cards from hand to Outside Area;
  // gains effects based on the TYPES placed: Character → set self active; Event → retire 1 enemy
  // Front Line character BP≤3000; Field → draw 2.
  reg['UA32BT-SNF-1-006'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const placedTypes = new Set();
      for (;;) {
        const idx = p.hand.findIndex(no => byNo(no)?.color === 'Green');
        if (idx < 0) break;
        const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดสีเขียวจากมือไป Outside Area อีกใบ?`, [{ label: 'วาง', value: true }, { label: 'หยุด', value: false }]);
        if (!v) break;
        const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดสีเขียว`);
        if (i == null || byNo(p.hand[i])?.color !== 'Green') break;
        const no = p.hand.splice(i, 1)[0];
        p.sideline.push(no);
        placedTypes.add(byNo(no)?.type);
        log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      }
      if (placedTypes.has('Character')) { unit.rested = false; log(`${unit.card.name}: Active`); }
      if (placedTypes.has('Event')) await H.retireEnemyFront(p, 3000);
      if (placedTypes.has('Field')) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 010 Vysache — [Opponent's Turn] if your opponent has not moved a character this turn's
  // Movement Phase, +1000 BP.
  reg['UA32BT-SNF-1-010'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] === p) return 0;
      const enemy = Engine.opponentOf(p);
      return [...enemy.front, ...enemy.energy].some(u => u._movedThisTurn) ? 0 : 1000;
    },
  };

  // 011 Vysache — [On Play] choose up to 1 character on either Front Line, it loses all of its
  // effects this turn.
  reg['UA32BT-SNF-1-011'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...p.front, ...enemy.front].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character (ฝั่งใดก็ได้)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.effectsNullified = true; log(`${unit.card.name}: ${t.card.name} สูญเสีย effect ทั้งหมดเทิร์นนี้`); }
    },
  };

  // 020 Bilac — [Main][Rest this card] all own characters +500 BP this turn (or +1000 instead if
  // you place 1 green Event Card from hand to Outside Area).
  reg['UA32BT-SNF-1-020'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      let amount = 500;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Event' && c.color === 'Green'; });
      if (idx >= 0) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Event card สีเขียวจากมือไป Outside Area เพื่อเพิ่มเป็น +1000 BP?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { const no = p.hand.splice(idx, 1)[0]; p.sideline.push(no); amount = 1000; log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`); }
      }
      for (const u of [...p.front, ...p.energy]) u.bpMod += amount;
      log(`${unit.card.name}: character ทุกตัวของคุณ +${amount} BP เทิร์นนี้`);
    },
  };

  // 023 Psyger-0 — [On Play] draw 1, place 1 card from hand face-down under this character.
  // @[Main][Frontline][1/turn] only if active: look at the face-down cards under this character,
  // reveal up to 1 to the Outside Area; if it's a green Event Card, use it for free (ignore energy
  // and AP cost).
  reg['UA32BT-SNF-1-023'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดวางคว่ำใต้ตัวเอง (ไม่บังคับ)`);
      if (i != null) { unit.counters.push(p.hand.splice(i, 1)[0]); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ตัวเอง`); }
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!unit.counters.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำใต้ตัวนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const opts = unit.counters.map((no, i) => ({ label: byNo(no)?.name || no, value: i }));
      const i = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ดคว่ำส่งไป Outside Area`, opts);
      if (i == null) return;
      const no = unit.counters.splice(i, 1)[0];
      p.sideline.push(no);
      const c = byNo(no);
      log(`${unit.card.name}: ส่ง ${c?.name} ไป Outside Area`);
      if (c && c.type === 'Event' && c.color === 'Green') { log(`${unit.card.name}: ใช้ ${c.name} ฟรี (ไม่เสีย Energy/AP)`); await Effects.onEvent(G, p, c); }
    },
  };

  // 026 Psyger-100 — [On Play] if you used an Event Card with original required energy ≥6 this
  // turn, may set self active.
  reg['UA32BT-SNF-1-026'] = {
    async onPlay(G, p, unit) {
      if ((p._eventNeedsPlayedThisTurn || 0) < 6) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: Active ตัวเอง?`, [{ label: 'Active', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 031 Lycagon's Curse (Field) — [Main][Rest][Discard1][Retire this card] draw cards equal to
  // your active AP count; you cannot use Event Cards from your hand this turn.
  reg['UA32BT-SNF-1-031'] = {
    async onMain(G, p, unit) {
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      await Engine.sidelineUnit(p, unit, 'effect');
      const n = Engine.activeAP(p);
      if (n) { Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ (เท่ากับ AP ที่เหลือ)`); }
      p._cannotUseEventsThisTurn = true;
      log(`${unit.card.name}: ห้ามใช้ Event Card จากมือเทิร์นนี้`);
    },
  };

  // 032 "Maximum Firepower" — retire 1 enemy Front Line character. All remaining enemy Front Line
  // characters with BP≥1500 get -1000 BP this turn.
  reg['UA32BT-SNF-1-032'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(enemy, t, 'effect');
      }
      for (const u of enemy.front.filter(x => x.card.type === 'Character' && Engine.bp(x) >= 1500)) u.bpMod -= 1000;
      log(`${card.name}: character ศัตรูบน Front Line ที่ BP≥1500 ทั้งหมด -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 034 "Vorpal Soul" — choose 1 own character, +2500 BP and [Sniper] this turn.
  reg['UA32BT-SNF-1-034'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2500; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +2500 BP และ [Sniper] เทิร์นนี้`); }
    },
  };

  // 035 "Schwarzer Wolf" — choose 1 of: free-play up to 2 green Trait:Schwarzer Wolf (need≤3, ap1)
  // from hand or Outside Area rested; or free-play up to 1 green Trait:Schwarzer Wolf (need≤5,
  // ap1) from hand or Outside Area rested.
  reg['UA32BT-SNF-1-035'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ลง Trait:Schwarzer Wolf (Energy≤3) สูงสุด 2 ใบ', value: 'a' }, { label: 'ลง Trait:Schwarzer Wolf (Energy≤5) 1 ใบ', value: 'b' },
      ]);
      const maxNeed = v === 'a' ? 3 : 5;
      const count = v === 'a' ? 2 : 1;
      const pred = c => c && c.type === 'Character' && c.color === 'Green' && (c.traits || '').includes('Schwarzer Wolf') && (c.need || 0) <= maxNeed && (c.ap || 0) === 1;
      for (let i = 0; i < count; i++) {
        let idx = p.hand.findIndex(no => pred(byNo(no)));
        if (idx >= 0) { await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); continue; }
        idx = p.sideline.findIndex(no => pred(byNo(no)));
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 037 "Emperor Of Evil - Satan" — draw 1. Choose up to 1 own Front Line character and set it
  // active. Choose up to 1 enemy Front Line character and rest it.
  reg['UA32BT-SNF-1-037'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = p.front.filter(u => u.rested);
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line ให้ Active`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
      }
      await H.restEnemyFront(p, null);
    },
  };

  // 040 "Repel Counter" — draw 1, choose up to 1 own character +1000 BP this turn. (Skipped: the
  // reactive "when this card is placed from your hand to the Outside Area by the effect of your
  // green card, draw 1" clause — no hook watches a specific card already sitting in the Outside
  // Area for being moved by another card's effect.)
  reg['UA32BT-SNF-1-040'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 043 Arthur Pencilgon — [On Play] may pay 1 AP; if did, free-play 1 red Field Card (need≥3,
  // ap1) from your Outside Area to your Energy Line rested.
  reg['UA32BT-SNF-1-043'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Field' && c.color === 'Red' && (c.need || 0) >= 3 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อลง Field จาก Outside Area?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Field สีแดง (Energy≥3, AP1) จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // 051 Orcelott — [On Retire] your opponent draws 1 card.
  reg['UA32BT-SNF-1-051'] = {
    async onSideline(G, p, unit) { const enemy = Engine.opponentOf(p); Engine.draw(enemy, 1); log(`${unit.card.name}: ${enemy.name} จั่ว 1 ใบ`); },
  };

  // 054 Kirin — [On Play] if own Wethermon the Tombguard is in Raid State on your area, set self
  // active. (Skipped: "this card is also treated as an Event Card in all places" — a pervasive
  // type-reclassification that would need to affect every other card's "Event Card" text-predicate
  // matching throughout the whole engine; too broad a simplification to support safely.)
  reg['UA32BT-SNF-1-054'] = {
    async onPlay(G, p, unit) {
      if ([...p.front, ...p.energy].some(u => (u.card.name || '').includes('Wethermon the Tombguard') && u.under && u.under.length)) {
        unit.rested = false; log(`${unit.card.name}: Active`);
      }
    },
  };

  // 061 Setsuna of the Distant Days — [On Play] look at top 2, place any number on top (any
  // order), remainder to the bottom. @[Main][Rest+Retire this card] re-activate this character's
  // [On Play] effect.
  reg['UA32BT-SNF-1-061'] = {
    async onPlay(G, p, unit) { await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (จาก [Main])`);
    },
  };

  // 064/065 Wethermon the Tombguard — [Main][Rest+Retire this card] draw 2.
  reg['UA32BT-SNF-1-064'] = reg['UA32BT-SNF-1-065'] = {
    async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); },
  };

  // 066 Wethermon the Tombguard — [On Play] look at the top 6, reveal any number of red Event
  // Cards or <Setsuna's Grave> with different required energy among them and add them to hand,
  // remainder to the bottom.
  reg['UA32BT-SNF-1-066'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(6, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const seenNeeds = new Set();
      const taken = [];
      for (let i = 0; i < revealed.length; i++) {
        const c = byNo(revealed[i]);
        if (!c) continue;
        const matches = (c.type === 'Event' && c.color === 'Red') || (c.name || '').includes("Setsuna's Grave");
        if (matches && !seenNeeds.has(c.need || 0)) { seenNeeds.add(c.need || 0); taken.push(i); }
      }
      taken.sort((a, b) => b - a).forEach(i => { const no = revealed.splice(i, 1)[0]; p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); });
      p.deck.push(...revealed);
    },
  };

  // 069 "Tearjewel of Rebirth" (Field) — [Main][Rest+Retire this card] free-play 1 Sunraku/
  // Oikatzo/Arthur Pencilgon (need==4, ap1) from your Outside Area to your area rested. (Skipped:
  // the "or raid it" alternative, same gap as several other cards this session.)
  reg['UA32BT-SNF-1-069'] = {
    async onMain(G, p, unit) {
      const pred = c => c && c.type === 'Character' && (c.need || 0) === 4 && (c.ap || 0) === 1 && /Sunraku|Oikatzo|Arthur Pencilgon/.test(c.name || '');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก character จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // 071 "Reward Scale" (Field) — [Main][Rest this card] draw 1, place 1 card from hand to Outside
  // Area; choose up to 1 own character, its BP increases by (required energy of the discarded
  // card × 500) this turn.
  reg['UA32BT-SNF-1-071'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const no = await H.discardFromHand(p);
      if (no == null) return;
      const amount = (byNo(no)?.need || 0) * 500;
      if (!amount) return;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character รับ +${amount} BP`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += amount; log(`${unit.card.name}: ${t.card.name} +${amount} BP เทิร์นนี้`); }
    },
  };

  // 073 "Ohshike" — choose up to 1 enemy character in Raid State, place the top card of its Raid
  // stack to the Outside Area, and give the newly-exposed Raid Source "cannot block" this turn.
  reg['UA32BT-SNF-1-073'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.under && u.under.length);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูใน Raid State`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const exposed = await H.unraidTopLayer(enemy, t);
      if (exposed) { exposed.noBlock = true; log(`${card.name}: ${exposed.card.name} ห้าม block เทิร์นนี้`); }
    },
  };

  // 076 "Seiten Taisei" — draw 1. (Skipped: "during this turn, when you choose a character with an
  // effect that specifies a BP range, increase the specified BP range by +1000" — a meta
  // text-modifying effect that would need to intercept every other card's BP-threshold parsing;
  // same class of unscriptable meta effect noted for OPM's Tatsumaki.)
  reg['UA32BT-SNF-1-076'] = { async onEvent(G, p, card) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); } };

  // 079 "Togetsu (Moon Blade)" — draw 1, add 1 card from your Life Area to hand (refilling Life
  // from the top of the deck if this empties it — a pure hand-effect, not battle damage, so it
  // shouldn't cause a loss). Choose up to 1 own character +2000 BP this turn. (Skipped: the granted
  // "opponent must block this character's attack if possible" clause — a forced-block mechanic with
  // no supporting hook, same gap noted for several cards this session.)
  reg['UA32BT-SNF-1-079'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.addLifeToHand(p);
      if (p.life.length === 0 && p.deck.length) { p.life.push(p.deck.shift()); log(`${card.name}: เติมการ์ดบนสุดของเด็คเข้า Life Area`); }
      await H.buffOwnCharacter(p, 2000);
    },
  };

  // 080 "Nyudo-Gumo" — draw 1. Choose up to 1 enemy Front Line character BP≤4000 and move it to
  // the Energy Line.
  reg['UA32BT-SNF-1-080'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤4000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(enemy, t, 'energy');
    },
  };
})();
