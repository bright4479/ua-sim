// ══════════ UA SIM — Chainsaw Man (CSM) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function markDenjiRetired(p, leftUnit) { if ((leftUnit.card.name || '').includes('Denji')) p._denjiRetiredTurn = Engine.G.turn; }
  async function placeHandCardUnder(p, unit, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || `${unit.card.name}: เลือกการ์ดจากมือ (คว่ำใต้การ์ดนี้)`);
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    unit.counters.push(no);
    log(`${p.name}: วางการ์ดคว่ำใต้ ${unit.card.name}`);
    return no;
  }
  async function plantSidelineUnder(p, targetUnit, predicate, title) {
    const i = await p.controller.chooseCardFromSideline(p, title, predicate);
    if (i == null) return null;
    const no = p.sideline.splice(i, 1)[0];
    targetUnit.counters.push(no);
    log(`${p.name}: วาง ${byNo(no)?.name} คว่ำใต้ ${targetUnit.card.name}`);
    return no;
  }

  // 006 Denji — [On Retire] draw 1. If retired by your own effect, you may instead look at the
  // top 4 cards of your deck, reveal up to 1 Reze/Denji and add it to hand, remainder to bottom.
  reg['UA53BT-CSM-1-006'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'effect') {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
          { label: 'จั่ว 1 ใบ', value: 'a' }, { label: 'ดูการ์ดบนสุด 4 ใบ (เลือก Reze/Denji เข้ามือ)', value: 'b' },
        ]);
        if (v === 'b') { await H.lookTopAndTake(p, 4, c => c && /Reze|Denji/.test(c.name || ''), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`); return; }
      }
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 012 Power — when this character attacks and wins a battle, place 1 card from hand to the
  // Outside Area.
  reg['UA53BT-CSM-1-012'] = { async onWinBattle(G, p, atk) { await H.discardFromHand(p); return false; } };

  // 013 Power — [When Attacking] if there is a Denji on your area, this character gets +500 BP
  // this turn.
  reg['UA53BT-CSM-1-013'] = { async onAttack(G, p, unit) { if (H.hasCardNamed(p, 'Denji')) { unit.bpMod += 500; log(`${unit.card.name}: +500 BP เทิร์นนี้`); } } };

  // 015 Violence Fiend — [Your Turn] for each Event card you used this turn, +500 BP.
  reg['UA53BT-CSM-1-015'] = { bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p) ? (p._eventsUsedThisTurn || 0) * 500 : 0; } };

  // 020 Makima — [On Play] choose 1 other character on your area, +1000 BP this turn.
  reg['UA53BT-CSM-1-020'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 021 Makima — [On Play] look at the top 3 cards of your deck, place up to 1 to the Outside
  // Area and the remaining on top of your deck in any order.
  reg['UA53BT-CSM-1-021'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 027 Reze — [Your Turn] if a Denji on your area was retired this turn, +1000 BP.
  reg['UA53BT-CSM-1-027'] = {
    async onAnyLeaveField(G, p, leftUnit) { markDenjiRetired(p, leftUnit); },
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._denjiRetiredTurn === Engine.G.turn) ? 1000 : 0; },
  };

  // 028 Reze — [On Play] play up to 1 of Reze/Denji/Crossroad Cafe (need<=2, ap1) from your hand
  // to your area rested.
  reg['UA53BT-CSM-1-028'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && /Reze|Denji|Crossroad Cafe/.test(c.name || '') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 029 Reze — when this character attacks and is not blocked, if a Denji on your area is retired
  // this turn, draw 1 card.
  reg['UA53BT-CSM-1-029'] = {
    async onAnyLeaveField(G, p, leftUnit) { markDenjiRetired(p, leftUnit); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) {
      if (atkUnit !== self) return;
      if (p._denjiRetiredTurn === Engine.G.turn) { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 030 Reze — [On Play] you may retire 1 other character on your area. If you did, choose up to 1
  // of: draw 1 + choose 1 other character +2000 BP this turn; or draw 2.
  reg['UA53BT-CSM-1-030'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่นของตัวเอง?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + character อื่น +2000 BP เทิร์นนี้', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' },
      ]);
      if (opt === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.buffOwnCharacter(p, 2000, { excludeUnit: unit }); }
      else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 032 Cinema (Field) — [On Play] if there is a Makima on your area, you may add up to 1
  // Denji/Date (need<=3) from your Outside Area to your hand.
  reg['UA53BT-CSM-1-032'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Makima')) return;
      await H.fetchFromSideline(p, c => c && /Denji|Date/.test(c.name || '') && (c.need || 0) <= 3, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 037 Date — choose 1 of: choose 1 character on your area +1000 BP this turn, set 1 of your AP
  // cards active (skipped: the "all character cards other than Makima treated as Event cards"
  // meta type-reclassification — recurring gap); or draw 2, place 1 card from hand to the Outside
  // Area, and if you used another Event card this turn, set 1 of your AP cards active.
  reg['UA53BT-CSM-1-037'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'character +1000 BP เทิร์นนี้ + AP กลับมา Active 1 ใบ', value: 'a' }, { label: 'จั่ว 2 ใบ + วางการ์ดจากมือไป Outside Area', value: 'b' },
      ]);
      if (v === 'a') { await H.buffOwnCharacter(p, 1000); await H.apUntap(p, 1); }
      else {
        Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p);
        if ((p._eventsUsedThisTurn || 0) >= 2) await H.apUntap(p, 1);
      }
    },
  };

  // 038 "I Will Take Denji-kun's Heart..." — usable only if there is a Reze on your area. Retire
  // 1 character on your area. If you did, set 1 of your AP cards active, draw 2 cards.
  reg['UA53BT-CSM-1-038'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Reze')) return;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${card.name}: ${t.card.name} ถูก retire`);
      await H.apUntap(p, 1);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 040 "I Like Country Mouse Too" — usable only if there is a Makima on your area. Choose 1
  // character on your opponent's Front Line with BP 5000 or less and retire it. If you used
  // another Event card this turn, choose up to 1 character on your area +1000 BP this turn.
  reg['UA53BT-CSM-1-040'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Makima')) return;
      await H.retireEnemyFront(p, 5000);
      if ((p._eventsUsedThisTurn || 0) >= 2) await H.buffOwnCharacter(p, 1000);
    },
  };

  // 051 Denji — [On Play] look at the top 2 cards of your deck, place any number on top of your
  // deck in any order and the remaining to the Outside Area. Then choose up to 1 Denji on your
  // area not in raid state with no face-down cards under it, place up to 1 Pochita/"In
  // exchange...show me your dreams Denji" from your Outside Area face-down under it.
  reg['UA53BT-CSM-1-051'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Denji') && !u.under.length && !u.counters.length);
      if (!targets.length) return;
      if (!p.sideline.some(no => /Pochita|In exchange/i.test(byNo(no)?.name || ''))) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Denji`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await plantSidelineUnder(p, t, c => c && /Pochita|In exchange/i.test(c.name || ''), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 054 Aki Hayakawa — [On Play] if there is a Himeno on your area, draw 1 and place 1 card from
  // your hand face-down under this character. @[When Attacking] you may place 1 face-down card
  // under an Aki Hayakawa on your Front Line to the Outside Area; if you did, this character gets
  // +1500 BP this turn.
  reg['UA53BT-CSM-1-054'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Himeno')) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await placeHandCardUnder(p, unit);
    },
    async onAttack(G, p, unit) {
      const holders = p.front.filter(u => (u.card.name || '').includes('Aki Hayakawa') && u.counters.length);
      if (!holders.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้ Aki Hayakawa ไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, holders, 'เลือก Aki Hayakawa');
      const h = holders.find(x => x.uid === uid);
      if (!h) return;
      const no = h.counters.shift();
      p.sideline.push(no);
      log(`${unit.card.name}: การ์ดคว่ำใต้ ${h.card.name} ไป Outside Area`);
      unit.bpMod += 1500;
      log(`${unit.card.name}: +1500 BP เทิร์นนี้`);
    },
  };

  // 059 Power — [Main][Discard 1][1/turn] this character gets +1 red generated energy this turn.
  reg['UA53BT-CSM-1-059'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.tempGen += 1;
      log(`${unit.card.name}: +1 generated energy เทิร์นนี้`);
    },
  };

  // 062 Beam — [Main][Rest+Retire this card] choose up to 1 Denji on your area, it gains
  // "[When Attacking] draw 1 card." this turn.
  reg['UA53BT-CSM-1-062'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes('Denji'));
      let t = null;
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Denji`, true);
        t = targets.find(x => x.uid === uid);
        if (t) { t._grantedAttackDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "โจมตีแล้วจั่ว 1 ใบ" เทิร์นนี้`); }
      }
      await Engine.sidelineUnit(p, unit, 'effect');
    },
  };

  // 065 Himeno — [Main][Rest this card][1/turn] choose 1 card on your Energy Line and set it active.
  reg['UA53BT-CSM-1-065'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.energy.filter(u => u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือกการ์ดบน Energy Line`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 068 Makima — [On Retire] you may place 2 character cards or 1 Event card from your hand to
  // the Outside Area. If you did, add this card to your hand.
  reg['UA53BT-CSM-1-068'] = {
    async onSideline(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'วางการ์ด Character 2 ใบจากมือ', value: 'a' }, { label: 'วางการ์ด Event 1 ใบจากมือ', value: 'b' }, { label: 'ข้าม', value: null },
      ]);
      if (v == null) return;
      if (v === 'a') {
        let count = 0;
        for (let i = 0; i < 2; i++) {
          const idx = p.hand.findIndex(no => byNo(no)?.type === 'Character');
          if (idx < 0) break;
          p.sideline.push(p.hand.splice(idx, 1)[0]); count++;
        }
        if (count < 2) return;
        log(`${unit.card.name}: วางการ์ด Character 2 ใบไป Outside Area`);
      } else {
        const idx = p.hand.findIndex(no => byNo(no)?.type === 'Event');
        if (idx < 0) return;
        p.sideline.push(p.hand.splice(idx, 1)[0]);
        log(`${unit.card.name}: วางการ์ด Event 1 ใบไป Outside Area`);
      }
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
    },
  };

  // 070 Makima — [Main][Frontline][1/turn] choose 1 character on your Energy Line, switch its
  // position with this character. @[When Attacking] retire 1 character other than Makima on your
  // area.
  reg['UA53BT-CSM-1-070'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.energy.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, p.energy, `${unit.card.name}: เลือกการ์ดบน Energy Line เพื่อสลับตำแหน่ง`);
      const t = p.energy.find(x => x.uid === uid);
      if (!t) return;
      const fi = p.front.indexOf(unit), ei = p.energy.indexOf(t);
      p.front.splice(fi, 1); p.energy.splice(ei, 1);
      p.energy.push(unit); p.front.push(t);
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
    async onAttack(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && !(u.card.name || '').includes('Makima'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(p, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 072 Ghost Devil — [When Attacking] if this character moved outside of your Move Phase this
  // turn, add up to 1 Aki Hayakawa (need<=2) from your Outside Area to your hand.
  reg['UA53BT-CSM-1-072'] = {
    async onAttack(G, p, unit) {
      if (!unit._movedByEffectThisTurn) return;
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Aki Hayakawa') && (c.need || 0) <= 2, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 076 "In Exchange...Show Me Your Dreams Denji" — choose 1 of: look at the top 2 cards of your
  // deck, place any number on top in any order and the remaining to the Outside Area, then you may
  // play 1 red Denji (need<=1) from your Outside Area to your Energy Line active; or if you have a
  // Denji with no face-down cards, set 1 of your AP cards active. (Simplified: the event card
  // itself becoming a face-down counter under the chosen Denji is skipped — engine.js unconditionally
  // sends a resolved Event card to the Outside Area right after onEvent returns, so there is no
  // window to redirect it into unit.counters without changing playEvent for one card.)
  reg['UA53BT-CSM-1-076'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 2 ใบ + ลง Denji สีแดงจาก Outside Area', value: 'a' }, { label: 'AP กลับมา Active 1 ใบ (ถ้ามี Denji ที่ไม่มีการ์ดคว่ำใต้)', value: 'b' },
      ]);
      if (v === 'a') {
        await H.lookTopAndDiscard(p, 2, 2, `${card.name}: ดูการ์ดบนสุด 2 ใบ`);
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.name || '').includes('Denji') && (c.need || 0) <= 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
      } else {
        const has = [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Denji') && !u.counters.length);
        if (has) await H.apUntap(p, 1);
      }
    },
  };

  // 077 "... Kon." — usable only if there is an Aki Hayakawa on your area. Choose 1 character on
  // your opponent's Front Line with BP 5000 or less and retire it. You may place 1 face-down card
  // under an Aki Hayakawa on your area to the Outside Area.
  reg['UA53BT-CSM-1-077'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Aki Hayakawa')) return;
      await H.retireEnemyFront(p, 5000);
      const holders = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Aki Hayakawa') && u.counters.length);
      if (!holders.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางการ์ดคว่ำใต้ Aki Hayakawa ไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, holders, 'เลือก Aki Hayakawa');
      const h = holders.find(x => x.uid === uid);
      if (h) { const no = h.counters.shift(); p.sideline.push(no); log(`${card.name}: การ์ดคว่ำใต้ ${h.card.name} ไป Outside Area`); }
    },
  };

  // 078 "The Strongest Bread" — draw 2. If there is a Hayakawa House on your area, or a face-down
  // card under a Denji on your area, draw 3 instead.
  reg['UA53BT-CSM-1-078'] = {
    async onEvent(G, p, card) {
      const boosted = H.hasCardNamed(p, 'Hayakawa House') || [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Denji') && u.counters.length);
      const n = boosted ? 3 : 2;
      Engine.draw(p, n); log(`${card.name}: จั่ว ${n} ใบ`);
    },
  };
})();
