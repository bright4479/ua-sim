// ══════════ UA SIM — Mushoku Tensei (MST) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function totalGen(p) { return Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0); }
  async function freePlayBlueTrio(p, unit, maxNeed) {
    const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && /Rudeus|Eris|Ruijerd/.test(c.name || '') && (c.need || 0) <= maxNeed && (c.ap || 0) === 1; });
    if (idx >= 0) return Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    return null;
  }
  async function retireOwnField(p, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Field');
    if (!targets.length) return false;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Field ให้ retire`, true);
    const t = targets.find(x => x.uid === uid);
    if (!t) return false;
    await Engine.sidelineUnit(p, t, 'effect');
    p._retiredFieldTurn = Engine.G.turn;
    return true;
  }

  // 003 Eris — passive: if own Rudeus and own Ruijerd, +1000 BP.
  reg['UA54BT-MST-1-003'] = { bpBonus(p, unit) { return (H.hasCardNamed(p, 'Rudeus') && H.hasCardNamed(p, 'Ruijerd')) ? 1000 : 0; } };

  // 004 Eris — [On Play] if this character was played by your effect, set self active.
  reg['UA54BT-MST-1-004'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { unit.rested = false; log(`${unit.card.name}: Active`); } } };

  // 006 Eris — [On Play] may pay 1 AP; if did, draw 1 and free-play 1 blue Rudeus/Eris/Ruijerd
  // (need≤3, ap1) from hand rested. (Skipped: the "or raid it" alternative, same gap noted for
  // several cards this session.)
  reg['UA54BT-MST-1-006'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อใช้ effect?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await freePlayBlueTrio(p, unit, 3);
    },
  };

  // 007 Eris — [On Play][1/turn] choose 1 of: draw 1, place 1 card from hand to Outside Area; or
  // if this character was played by your effect, free-play 1 blue Rudeus/Eris/Ruijerd (need≤3,
  // ap1) from hand rested. (Skipped: the "or raid it" alternative.)
  reg['UA54BT-MST-1-007'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }];
      if (unit._playedByEffect) opts.push({ label: 'ลง Rudeus/Eris/Ruijerd สีน้ำเงินจากมือ', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else await freePlayBlueTrio(p, unit, 3);
    },
  };

  // 010 Kishirika Kishirisu — [On Play] look at top 3, reorder them back on top (no real state change).
  reg['UA54BT-MST-1-010'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 011 Ghislaine — [Main][Frontline][1/turn] choose 1 own Eris, +1000 BP this turn.
  reg['UA54BT-MST-1-011'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Eris'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Eris`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 021 Ruijerd — [On Play] free-play 1 blue Rudeus/Eris/Ruijerd (need≤3, ap1) from hand rested
  // (skipped: "or raid it"). @[Main] only if own Rudeus and own Eris: set self active.
  reg['UA54BT-MST-1-021'] = {
    async onPlay(G, p, unit) { await freePlayBlueTrio(p, unit, 3); },
    async onMain(G, p, unit) {
      if (!H.hasCardNamed(p, 'Rudeus') || !H.hasCardNamed(p, 'Eris')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = false;
      log(`${unit.card.name}: Active`);
    },
  };

  // 023 Rudeus — [On Play] if this character was played by your effect, draw 1.
  reg['UA54BT-MST-1-023'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 030 Roxy — [Main][Rest] only if you used an Event Card this turn: choose 1 of: choose own
  // character +1000 BP this turn; or draw 1, place 1 card from hand to Outside Area.
  reg['UA54BT-MST-1-030'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'a' }, { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'b' },
      ]);
      if (v === 'a') await H.buffOwnCharacter(p, 1000);
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 035 "You Are A Warrior" — draw 1 for each of Rudeus/Eris/Ruijerd you control (no real
  // trade-off in "choosing up to 3" since each independently-checked draw is unconditionally
  // beneficial, so all eligible ones are applied).
  reg['UA54BT-MST-1-035'] = {
    async onEvent(G, p, card) {
      for (const name of ['Rudeus', 'Eris', 'Ruijerd']) {
        if (H.hasCardNamed(p, name)) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ (มี ${name})`); }
      }
    },
  };

  // 038 "A Gift From My Mentor" — choose 1 own character +1000 BP this turn. Set 1 of your AP
  // cards active if own Roxy. (Skipped: the "[Main][When in Outside Area]" self-reactivation
  // clause — same recurring gap as KIN-1-079/NGR-1-042.)
  reg['UA54BT-MST-1-038'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 1000);
      if (H.hasCardNamed(p, 'Roxy')) await H.apUntap(p, 1);
    },
  };

  // 039 "Rudeus Is Amazing!" — choose 1 of: choose own Eris +500 BP and [Sniper] this turn; or if
  // own Eris, free-play 1 blue Rudeus (ap1) from Outside Area to your area rested. (Skipped: the
  // "or raid it" alternative.)
  reg['UA54BT-MST-1-039'] = {
    async onEvent(G, p, card) {
      const hasEris = H.hasCardNamed(p, 'Eris');
      const opts = [];
      const erisTargets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Eris'));
      if (erisTargets.length) opts.push({ label: 'Eris +500 BP และ [Sniper] เทิร์นนี้', value: 'a' });
      if (hasEris) opts.push({ label: 'ลง Rudeus สีน้ำเงินจาก Outside Area', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseOwnCharacter(p, erisTargets, `${card.name}: เลือก Eris`, true);
        const t = erisTargets.find(x => x.uid === uid);
        if (t) { t.bpMod += 500; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +500 BP และ [Sniper] เทิร์นนี้`); }
      } else {
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.name || '').includes('Rudeus') && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 040 "I'm With You" — only if own Roxy: free-play 1 blue Rudeus/Roxy (fulfilled energy, ap1)
  // from hand rested (skipped: "or raid it"). Draw 1. Choose up to 1 own Rudeus and move it to
  // another line.
  reg['UA54BT-MST-1-040'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Roxy')) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && /Rudeus|Roxy/.test(c.name || '') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Rudeus'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Rudeus`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 046 Talhand — passive: if you retired a Field on your area this turn, +1 generated energy
  // (tracked locally via `p._retiredFieldTurn`, set by this file's own Field-retiring cards).
  // @[Main][Frontline][1/turn] retire 1 own Field; if did, self +1000 BP this turn.
  reg['UA54BT-MST-1-046'] = {
    genMod(unit, p) { return p._retiredFieldTurn === Engine.G.turn ? 1 : 0; },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      if (await retireOwnField(p, unit)) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 048 Paul — [On Play] may retire 1 own Field; if did, set self active. @[When Attacking][1/turn]
  // only if 6+ Field cards in your Outside Area: may place 1 card from hand to Outside Area; if
  // did, set self active.
  reg['UA54BT-MST-1-048'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire Field ของตัวเอง?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (v && (await retireOwnField(p, unit))) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (p.sideline.filter(no => byNo(no)?.type === 'Field').length < 6) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ Active?`);
      if (discarded) { unit._usedTurn = Engine.G.turn; unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 049 Rudeus — [On Play] may retire 1 own Field; if did, set self active, look at top 4, reveal
  // up to 1 Character/Field card without a trait and add it to hand, remainder to the bottom.
  reg['UA54BT-MST-1-049'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire Field ของตัวเอง?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !(await retireOwnField(p, unit))) return;
      unit.rested = false;
      log(`${unit.card.name}: Active`);
      await H.lookTopAndTake(p, 4, c => (c.type === 'Character' || c.type === 'Field') && !c.traits, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 052 Roxy — [On Retire] if there's a Field card on your area, draw 1.
  reg['UA54BT-MST-1-052'] = {
    async onSideline(G, p, unit) { if ([...p.front, ...p.energy].some(u => u.card.type === 'Field')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 056 Elinalise — [Main][Rest][1/turn] rest 1 own active Front Line character; if did, self +1
  // generated energy this turn.
  reg['UA54BT-MST-1-056'] = {
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

  // 059 Sylphiette — [On Play] choose 1 of: draw 1, place 1 card from hand to Outside Area; or
  // choose up to 1 other own Trait:Ranoa Magic Academy on your Front Line, grant "also generates
  // energy on the Front Line" this turn.
  reg['UA54BT-MST-1-059'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }, { label: 'Trait:Ranoa Magic Academy ผลิต energy บน Front Line ได้', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); return; }
      const targets = p.front.filter(u => u !== unit && (u.card.traits || '').includes('Ranoa Magic Academy'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Ranoa Magic Academy`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempFrontGen = true; log(`${unit.card.name}: ${t.card.name} ผลิต energy บน Front Line ได้เทิร์นนี้`); }
    },
  };

  // 062 Nanahoshi Shizuka — [On Play] choose 1 of: may return 1 other own character to hand, if
  // did, this turn reduce the AP cost of the next character card (original generated energy 2+)
  // you use from hand by 1; or draw 1.
  reg['UA54BT-MST-1-062'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'คืน character อื่นกลับมือ เพื่อลด AP cost ใบถัดไป', value: 'a' }, { label: 'จั่ว 1 ใบ', value: 'b' },
      ]);
      if (v === 'b') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      p.pendingDiscount = { predicate: c => c.type === 'Character' && (c.gen || 0) >= 2, apDelta: -1 };
      log(`${unit.card.name}: การ์ด Character (generated energy 2+) ใบถัดไป ลด AP cost 1`);
    },
  };

  // 063 Norn — [On Play] if you have 7+ generated energy, draw 1.
  reg['UA54BT-MST-1-063'] = { async onPlay(G, p, unit) { if (totalGen(p) >= 7) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 073 Rudeus — [Main] only if you have 7+ generated energy: set self active, draw 1, choose up
  // to 1 own character +2000 BP this turn. (Skipped: the static "cannot be played/moved to the
  // Energy Line, cannot stand except by your own effects" restriction, and the granted "at the end
  // of your Attack Phase, set this character active" clause — the former would need a new
  // zone-restriction keyword plus a "doesn't auto-stand" flag for one card, the latter is the
  // recurring end-of-Attack-Phase hook gap.)
  reg['UA54BT-MST-1-073'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (totalGen(p) < 7) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.buffOwnCharacter(p, 2000);
    },
  };

  // 074 Teleportation Labyrinth (Field) — [On Play] may retire 1 own Character; if did, draw 2.
  // @[On Retire] choose 1 of: may place 1 card from hand to Outside Area, if did, free-play 1
  // green Roxy (need≤1) from Outside Area to your area rested; or fetch up to 1 Labyrinth Guardian
  // Manatite Hydra from Outside Area to hand.
  reg['UA54BT-MST-1-074'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire Character ของตัวเอง?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
    async onSideline(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'วางการ์ดจากมือ เพื่อลง Roxy สีเขียว', value: 'a' }, { label: 'ดึง Labyrinth Guardian Manatite Hydra จาก Outside Area', value: 'b' },
      ]);
      if (v === 'a') {
        const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
        if (!discarded) return;
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.name || '').includes('Roxy') && (c.need || 0) <= 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      } else {
        await H.fetchFromSideline(p, c => c && (c.name || '').includes('Labyrinth Guardian Manatite Hydra'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
      }
    },
  };

  // 076 Labyrinth Guardian Manatite Hydra (Field) — [On Retire] free-play 1 green character card
  // (need≤1, ap1, without trait) from your Outside Area to your area rested (need range increases
  // by +1 for each other Field card in your Outside Area). (Skipped: the "or raid it" alternative.)
  reg['UA54BT-MST-1-076'] = {
    async onSideline(G, p, unit) {
      const bonus = p.sideline.filter(no => byNo(no)?.type === 'Field').length;
      const maxNeed = 1 + bonus;
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && !c.traits && (c.need || 0) <= maxNeed && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 080 "Yes, I Am Sylphiette" — draw 2. Choose up to 1 own Trait:Ranoa Magic Academy on your
  // Front Line, grant "also generates energy on the Front Line" this turn.
  reg['UA54BT-MST-1-080'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const targets = p.front.filter(u => (u.card.traits || '').includes('Ranoa Magic Academy'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Ranoa Magic Academy`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempFrontGen = true; log(`${card.name}: ${t.card.name} ผลิต energy บน Front Line ได้เทิร์นนี้`); }
    },
  };
})();
