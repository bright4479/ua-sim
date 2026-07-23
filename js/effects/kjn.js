// ══════════ UA SIM — The Eminence in Shadow (KJN) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countDistinctTrait(owner, trait) {
    return new Set([...owner.front, ...owner.energy].filter(u => (u.card.traits || '').includes(trait)).map(u => u.card.name)).size;
  }
  // this series' "place the top card of your deck to the Remove Area; you may use it later this
  // turn" mechanic — collapsed to "may use it right away" since the engine's turn-loop has no
  // general window for a delayed one-shot permission. Playing from Removal pays full cost (energy
  // gate checked manually, AP paid via playCardFromZone's own payApCost option).
  async function millToRemovalAndOfferPlay(p, unit) {
    if (!p.deck.length) return;
    const no = p.deck.shift();
    p.removal.push(no);
    log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Remove Area`);
    const c = byNo(no);
    if (!c || c.type === 'Field' && p.energy.length >= 4) return;
    if (!Engine.hasEnergyFor(p, c)) return;
    if (Engine.activeAP(p) < (c.ap || 0)) return;
    const v = await p.controller.chooseOption(p, `${unit.card.name}: ใช้ ${c.name} จาก Remove Area เลยตอนนี้?`, [{ label: 'ใช้', value: true }, { label: 'เก็บไว้', value: false }]);
    if (!v) return;
    if (c.type === 'Event') { p.removal.splice(p.removal.indexOf(no), 1); Engine.payAP(p, c.ap || 0); await Effects.onEvent(Engine.G, p, c); }
    else await Engine.playCardFromZone(p, no, 'removal', { line: 'energy', active: false, payApCost: true });
    p._usedFromRemovalTurn = Engine.G.turn;
  }

  // 002/003 Aurora (identical text, two printings) — [Main] choose 1 own Claire Kagenow without a
  // face-down card under it; bury this character face-down under it. If did, draw 2, place 1 card
  // from hand to Outside Area.
  function aurora() {
    return {
      async onMain(G, p, unit) {
        const line = p.front.includes(unit) ? p.front : p.energy;
        if (!line.includes(unit)) return;
        const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Claire Kagenow') && !u.counters.length);
        if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Claire Kagenow`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        line.splice(line.indexOf(unit), 1);
        t.counters.push(unit.no);
        log(`${unit.card.name}: ฝังตัวเองคว่ำไว้ใต้ ${t.card.name}`);
        Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
        await H.discardFromHand(p);
      },
    };
  }
  reg['UA52BT-KJN-1-002'] = aurora();
  reg['UA52BT-KJN-1-003'] = aurora();

  // 006 Alexia Midgar — [Main][Frontline][Discard1][1/turn] place the top card of your deck to
  // the Remove Area; you may use it this turn (collapsed to an immediate offer).
  reg['UA52BT-KJN-1-006'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await millToRemovalAndOfferPlay(p, unit);
    },
  };

  // 008 Alexia Midgar — [Skipped]: "[Main][Discard1] only the turn played: reduce the AP cost of
  // the next card you use from your Remove Area this turn by 1" — depends on a genuine "later this
  // turn" window for the Remove-Area-play mechanic, which this project's simplification (offer to
  // play immediately, see `millToRemovalAndOfferPlay`) doesn't leave room for.

  // 027 Beatrix — [Main][1/turn] only if an enemy Front Line character has BP≥4500: self +2000 BP
  // this turn.
  reg['UA52BT-KJN-1-027'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      if (!enemy.front.some(u => Engine.bp(u) >= 4500)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 2000;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 029 Mary — [Main][Frontline][1/turn] choose 1 own Claire Kagenow (BP≥1500) on your Front
  // Line, -1000 BP this turn; if did, draw 1, place 1 card from hand to Outside Area, self +1000
  // BP this turn.
  reg['UA52BT-KJN-1-029'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => (u.card.name || '').includes('Claire Kagenow') && Engine.bp(u) >= 1500);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Claire Kagenow`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod -= 1000;
      log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 030 Rose Oriana — [On Play] look at top 2, place up to 1 of Alexia Midgar/Rose Oriana/Natsume
  // Kafka among them to the Outside Area, remainder back on top.
  reg['UA52BT-KJN-1-030'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => /Alexia Midgar|Rose Oriana|Natsume Kafka/.test(c.name || ''));
    },
  };

  // 031 Rose Oriana — [On Play] choose 1 of: look at top 3, reorder them back on top (no real
  // state change, so just a no-op log); or place 1 card from hand to Outside Area, if did, place
  // the top card of your deck to the Remove Area (may use it right away).
  reg['UA52BT-KJN-1-031'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 3 ใบ (จัดเรียงใหม่)', value: 'a' }, { label: 'วางการ์ดจากมือ เพื่อส่งการ์ดบนสุดไป Remove Area', value: 'b' },
      ]);
      if (v === 'a') { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); return; }
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await millToRemovalAndOfferPlay(p, unit);
    },
  };

  // 032 Rose Oriana — [Main][1/turn] only the turn played: place the top card of your deck to the
  // Remove Area (may use it right away).
  reg['UA52BT-KJN-1-032'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await millToRemovalAndOfferPlay(p, unit);
    },
  };

  // 033 Rose Oriana — [Main][Rest] choose 1 of: place 1 card from hand on top of your deck, if
  // did, buff up to 1 other own character +1000 BP this turn; or if you used a card from your
  // Remove Area this turn, buff up to 1 other own character +1000 BP this turn.
  reg['UA52BT-KJN-1-033'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const opts = [];
      if (p.hand.length) opts.push({ label: 'วางการ์ดจากมือบนสุดของเด็ค', value: 'a' });
      if (p._usedFromRemovalTurn === Engine.G.turn) opts.push({ label: 'buff character (ใช้การ์ดจาก Remove Area แล้วเทิร์นนี้)', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดวางบนสุดของเด็ค`);
        if (i == null) return;
        const no = p.hand.splice(i, 1)[0];
        p.deck.unshift(no);
        log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`);
      }
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 050 Nu — passive: if 10+ cards in your Outside Area, +1500 BP.
  reg['UA52BT-KJN-1-050'] = { bpBonus(p, unit) { return p.sideline.length >= 10 ? 1500 : 0; } };

  // 051 Nu — passive: +1 generated energy for every 10 cards in your Outside Area. @[On Play]
  // look at top 2, place any number on top (any order), remainder to the Outside Area.
  reg['UA52BT-KJN-1-051'] = {
    genMod(unit, p) { return Math.floor(p.sideline.length / 10); },
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, null, revealed.length);
      const keepSet = new Set(keepIdxs);
      const keep = [], outside = [];
      revealed.forEach((no, i) => (keepSet.has(i) ? keep : outside).push(no));
      p.deck.unshift(...keep);
      p.sideline.push(...outside);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + outside.length;
    },
  };

  // 053 Alpha — dynamic: if 10+ cards in your Outside Area and own Cid Kagenow, gains "also
  // generates energy on the Front Line".
  reg['UA52BT-KJN-1-053'] = { frontGenBonus(p, unit) { return p.sideline.length >= 10 && H.hasCardNamed(p, 'Cid Kagenow'); } };

  // 055 Alpha — [On Play] only if own Cid Kagenow: may place up to 2 cards from hand to Outside
  // Area; if did, draw the same number placed.
  reg['UA52BT-KJN-1-055'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Cid Kagenow')) return;
      let n = 0;
      for (let i = 0; i < 2; i++) {
        if (!p.hand.length) break;
        const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area อีกใบ?`, [{ label: 'วาง', value: true }, { label: 'หยุด', value: false }]);
        if (!v) break;
        if (await H.discardFromHand(p)) n++;
      }
      if (n) { Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`); }
    },
  };

  // 058 Eta — [Main][Rest] choose 1 other own character +1000 BP this turn (2 characters instead
  // if 7+ distinctly-named Trait:Seven Shadows on your area).
  reg['UA52BT-KJN-1-058'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const count = countDistinctTrait(p, 'Seven Shadows') >= 7 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
        if (!targets.length) break;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (${i + 1}/${count})`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      }
    },
  };

  // 059 Epsilon — [On Play] look at top 3, reorder them back on top (no real state change).
  reg['UA52BT-KJN-1-059'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 061 Epsilon — [Main][Frontline][1/turn] choose 1 other own Trait:Seven Shadows card, send it
  // to the bottom of your deck; if did, free-play 1 purple Trait:Seven Shadows character (not
  // Epsilon, need≤3, ap1) from Outside Area to your area rested. (Its [On Play] firing anyway is
  // an accepted approximation — `playCardFromZone` always triggers [On Play] unconditionally.)
  reg['UA52BT-KJN-1-061'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Seven Shadows'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Seven Shadows`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const line = p.front.includes(t) ? p.front : p.energy;
      line.splice(line.indexOf(t), 1);
      p.deck.push(t.no);
      log(`${unit.card.name}: ${t.card.name} ถูกส่งไปใต้เด็ค`);
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes('Seven Shadows') && c.no !== unit.no && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 062 Gamma — [Main][Rest][1/turn] draw 1, place 1 card from hand to Outside Area.
  reg['UA52BT-KJN-1-062'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 063 Gamma — [Main][Rest][Discard1][1/turn] place up to 1 card from the top of your deck to the
  // Outside Area; if 10+ cards in your Outside Area, +1 generated energy this turn.
  reg['UA52BT-KJN-1-063'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.discardFromHand(p);
      if (p.deck.length) { const no = p.deck.shift(); p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
      if (p.sideline.length >= 10) { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
    },
  };

  // 068 Delta — [Main][Discard1] only if 5+ distinctly-named Trait:Seven Shadows on your area:
  // set self active, self +1000 BP this turn.
  reg['UA52BT-KJN-1-068'] = {
    async onMain(G, p, unit) {
      if (countDistinctTrait(p, 'Seven Shadows') < 5) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      unit.rested = false;
      unit.bpMod += 1000;
      log(`${unit.card.name}: Active และ +1000 BP เทิร์นนี้`);
    },
  };

  // 069 Delta — [On Play] tiered by distinctly-named Trait:Seven Shadows on your area: 5+ set self
  // active; 7+ self gains [Sniper] this turn.
  reg['UA52BT-KJN-1-069'] = {
    async onPlay(G, p, unit) {
      const n = countDistinctTrait(p, 'Seven Shadows');
      if (n >= 5) { unit.rested = false; log(`${unit.card.name}: Active`); }
      if (n >= 7) { unit.tempSnipe = true; log(`${unit.card.name}: ได้ [Sniper] เทิร์นนี้`); }
    },
  };

  // 070 Beta — [Main][Rest][1/turn] rest 1 own active Front Line character; if did, self +1
  // generated energy this turn.
  reg['UA52BT-KJN-1-070'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => !u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Front Line ให้วางนอน', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; unit.tempGen += 1; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน — +1 energy generation เทิร์นนี้`); }
    },
  };

  // 071 Beta — [On Play] free-play 1 purple Trait:Seven Shadows character (need≤2, ap1) from hand rested.
  reg['UA52BT-KJN-1-071'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes('Seven Shadows') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 073 Beta — passive: if own Cid Kagenow on your Front Line, +1 generated energy. @[On Play]
  // place up to 2 cards from the top of your deck to the Outside Area.
  reg['UA52BT-KJN-1-073'] = {
    genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Cid Kagenow')) ? 1 : 0; },
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
    },
  };

  // 077 "Possession Cure" — add 1 Trait:Seven Shadows card with AP cost of 1 from your Outside
  // Area to your hand (or play it rested directly instead, if you don't already control a
  // same-named character and its energy requirement is fulfilled).
  reg['UA52BT-KJN-1-077'] = {
    async onEvent(G, p, card) {
      const pred = c => c && (c.traits || '').includes('Seven Shadows') && (c.ap || 0) === 1;
      const idx = p.sideline.findIndex(no => pred(byNo(no)));
      if (idx < 0) return;
      const no = p.sideline[idx];
      const c = byNo(no);
      const alreadyHas = [...p.front, ...p.energy].some(u => u.card.name === c.name);
      if (!alreadyHas && Engine.hasEnergyFor(p, c)) {
        const v = await p.controller.chooseOption(p, `${card.name}: ลง ${c.name} ทันที (rested) แทนการเข้ามือ?`, [{ label: 'ลงสนาม', value: true }, { label: 'เข้ามือ', value: false }]);
        if (v) { p.sideline.splice(idx, 1); await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); return; }
      }
      p.sideline.splice(idx, 1);
      p.hand.push(no);
      log(`${card.name}: เพิ่ม ${c.name} เข้ามือ`);
    },
  };

  // 078 "Seven Shadows" — choose 1 enemy Front Line character with BP ≤ (own Trait:Seven Shadows
  // card count × 1000) and retire it.
  reg['UA52BT-KJN-1-078'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Seven Shadows')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };
})();
