// ══════════ UA SIM — MSS effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function countDistinctTrait(p, trait) {
    const names = new Set();
    for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes(trait)) names.add(u.card.name);
    return names.size;
  }
  function countDistinctFrontTrait(p, trait) {
    const names = new Set();
    for (const u of p.front) if ((u.card.traits || '').includes(trait)) names.add(u.card.name);
    return names.size;
  }
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
  async function endOfAttackMoveToEnergy(G, p, atk, drawDiscard) {
    if (!p.front.includes(atk)) return;
    const moved = await Engine.moveUnitFree(p, atk, 'energy');
    if (moved && drawDiscard) { Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
  }

  // 003 Yuuki Wakura (Eternal Chain) — cannot be played or moved to the Front Line unless there is
  // a Kyouka Uzen on your area. @[Your Turn] if 5+ total Kyouka Uzen/Yuuki Wakura (Eternal Chain)
  // cards on your Outside Area, +1000 BP. @[On Retire] if there is a Kyouka Uzen on your Front
  // Line, draw 1.
  reg['UA49BT-MSS-1-003'] = {
    canPlayFromHand(p) { return H.hasCardNamed(p, 'Kyouka Uzen'); },
    canMoveToFront(p) { return H.hasCardNamed(p, 'Kyouka Uzen'); },
    bpBonus(p, unit) {
      if (!isYourTurn(p)) return 0;
      const n = p.sideline.filter(no => /Kyouka Uzen|Yuuki Wakura \(Eternal Chain\)/.test(byNo(no)?.name || '')).length;
      return n >= 5 ? 1000 : 0;
    },
    async onSideline(G, p, unit) { if (p.front.some(u => (u.card.name || '').includes('Kyouka Uzen'))) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 006 Yuuki Wakura (Eternal Chain: Sparkling Stars) — cannot be played or moved to the Front Line
  // unless there is a Nei Ookawamura on your area. @[On Play][When Attacking] if Nei Ookawamura is
  // on the same line, look at the top 2, split any between top and bottom.
  reg['UA49BT-MSS-1-006'] = {
    canPlayFromHand(p) { return H.hasCardNamed(p, 'Nei Ookawamura'); },
    canMoveToFront(p) { return H.hasCardNamed(p, 'Nei Ookawamura'); },
    async onPlay(G, p, unit) { const line = p.front.includes(unit) ? p.front : p.energy; if (line.some(u => (u.card.name || '').includes('Nei Ookawamura'))) await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onAttack(G, p, unit) { const line = p.front.includes(unit) ? p.front : p.energy; if (line.some(u => (u.card.name || '').includes('Nei Ookawamura'))) await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
  };

  // 007 Yuuki Wakura (Eternal Chain: Whirlwind) — cannot be played or moved to the Front Line
  // unless there is a Himari Azuma on your area. @[When in Energy Line] at the end of any of your
  // characters' attacks, if there is a Himari Azuma on your Front Line and space on your Front
  // Line, you may move this character to the Front Line.
  async function maybeMoveWhirlwind(p, self) {
    if (!self || !p.energy.includes(self)) return;
    if (!p.front.some(u => (u.card.name || '').includes('Himari Azuma')) || p.front.length >= 4) return;
    const v = await p.controller.chooseOption(p, `${self.card.name}: ย้ายไป Front Line?`, [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
    if (v) await Engine.moveUnitFree(p, self, 'front');
  }
  reg['UA49BT-MSS-1-007'] = {
    canPlayFromHand(p) { return H.hasCardNamed(p, 'Himari Azuma'); },
    canMoveToFront(p) { return H.hasCardNamed(p, 'Himari Azuma'); },
    async onAnyWinBattle(G, p, atk, enemy, defender, self) { await maybeMoveWhirlwind(p, self); },
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) { await maybeMoveWhirlwind(p, self); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { await maybeMoveWhirlwind(p, self); },
  };

  // 010 Himari Azuma — [Frontline] at the end of this character's attack, you may move it to your
  // Energy Line; if you did, draw 1, place 1 card from hand to the Outside Area.
  async function himariEndAttack(G, p, atk) {
    if (!p.front.includes(atk)) return;
    const v = await p.controller.chooseOption(p, `${atk.card.name}: ย้ายไป Energy Line?`, [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    await endOfAttackMoveToEnergy(G, p, atk, true);
  }
  reg['UA49BT-MSS-1-010'] = {
    async onWinBattle(G, p, atk) { await himariEndAttack(G, p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) { if (atk === self) await himariEndAttack(G, p, atk); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) await himariEndAttack(G, p, atkUnit); },
  };

  // 015 Kyouka Uzen — [On Play] place the top 2 cards of your deck to the Outside Area. If 5+ total
  // Kyouka Uzen/Yuuki Wakura (Eternal Chain) cards on your Outside Area, draw 1.
  reg['UA49BT-MSS-1-015'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      const cnt = p.sideline.filter(no => /Kyouka Uzen|Yuuki Wakura \(Eternal Chain\)/.test(byNo(no)?.name || '')).length;
      if (cnt >= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 026 Nei Ookawamura — [Main][1/turn] only during the turn this character was played, and 4+
  // distinct-named Trait:7th Unit on your area: choose 1 other character, set it active and +1000
  // BP this turn.
  reg['UA49BT-MSS-1-026'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (countDistinctTrait(p, '7th Unit') < 4) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} Active และ +1000 BP เทิร์นนี้`); }
    },
  };

  // 027 Nei Ookawamura — [On Play] choose 1 of: look at the top 2, split any between top/bottom;
  // choose up to 1 character, +1000 BP this turn; or if 4+ distinct-named Trait:7th Unit, draw 1.
  reg['UA49BT-MSS-1-027'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'ดูการ์ดบนสุด 2 ใบ', value: 'a' }, { label: 'character +1000 BP เทิร์นนี้', value: 'b' }];
      if (countDistinctTrait(p, '7th Unit') >= 4) opts.push({ label: 'จั่ว 1 ใบ', value: 'c' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
      else if (v === 'b') await H.buffOwnCharacter(p, 1000);
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 029 Shushu Suruga — [On Retire] free-play 1 yellow Trait:7th Unit (need<=3, ap1) from hand rested.
  reg['UA49BT-MSS-1-029'] = { async onSideline(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('7th Unit') && (c.need || 0) <= 3 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 030 Shushu Suruga — passive: if 4+ distinct-named Trait:7th Unit on your area, +1 generated energy.
  reg['UA49BT-MSS-1-030'] = { genMod(unit, p) { return countDistinctTrait(p, '7th Unit') >= 4 ? 1 : 0; } };

  // 032 Shushu Suruga — [When Attacking][On Block][1/turn] if 4+ distinct-named Trait:7th Unit and
  // an empty Front Line space, +2000 BP this turn.
  async function suruga032(p, unit) {
    if (unit._usedTurn === Engine.G.turn) return;
    if (countDistinctTrait(p, '7th Unit') < 4 || p.front.length >= 4) return;
    unit._usedTurn = Engine.G.turn;
    unit.bpMod += 2000; log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
  }
  reg['UA49BT-MSS-1-032'] = { async onAttack(G, p, unit) { await suruga032(p, unit); }, async onBlock(G, p, unit) { await suruga032(p, unit); } };

  // 034 Yachiho Azuma — replacement effect protecting Himari Azuma from an opponent's Event effect.
  // (Skipped: recurring replacement-effect gap.)

  // 037 "7th Unit Dormitory" (Field) — [On Play] you may place 1 card from hand to the Outside
  // Area; if you did, add up to 1 Trait:7th Unit (need<=3) from your Outside Area to your hand.
  reg['UA49BT-MSS-1-037'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('7th Unit') && (c.need || 0) <= 3, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 039 "Eternal Chain" — usable only if there is a Kyouka Uzen on your area. Place up to 3 cards
  // from the top of your deck to the Outside Area. Add up to 1 Yuuki Wakura (Eternal Chain) from
  // your Outside Area to your hand. Untap 1 AP.
  reg['UA49BT-MSS-1-039'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Kyouka Uzen')) return;
      const n = Math.min(3, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Yuuki Wakura (Eternal Chain)'), `${card.name}: เลือกการ์ดจาก Outside Area`);
      await H.apUntap(p, 1);
    },
  };

  // 046 Koko Zenibako — passive: if 4+ total Trait:Humanoid Shuuki/Trait:Shuuki cards on your area,
  // +1 generated energy.
  reg['UA49BT-MSS-1-046'] = { genMod(unit, p) { return [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Humanoid Shuuki') || (u.card.traits || '').includes('Shuuki')).length >= 4 ? 1 : 0; } };

  // 049 Naon Yuno — [On Play] look at the top 2, place up to 1 (Trait:Humanoid Shuuki, Trait:Shuuki,
  // or named Mato's Peaches) among them to the Outside Area, remainder to the top.
  reg['UA49BT-MSS-1-049'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Humanoid Shuuki') || (c.traits || '').includes('Shuuki') || (c.name || '').includes("Mato's Peaches")); } };

  // 056 Ginna Bizen — [On Play] you gain "all characters on your and your opponent's area cannot be
  // removed by effects" this turn.
  reg['UA49BT-MSS-1-056'] = { async onPlay(G, p, unit) { Engine.G._noRemovalByEffectsThisTurn = true; log(`${unit.card.name}: character ทุกใบทั้งสองฝ่ายไม่ถูก retire ด้วย effect เทิร์นนี้`); } };

  // 057 Himari Azuma — [Main][Discard 2][1/turn] only if there is a Yachiho Azuma on your Front
  // Line: +1000 BP and [Sniper] this turn.
  reg['UA49BT-MSS-1-057'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.front.some(u => (u.card.name || '').includes('Yachiho Azuma'))) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (p.hand.length < 2) return;
      for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: [Discard 2] (${i + 1}/2)`); if (idx == null) return; p.removal.push(p.hand.splice(idx, 1)[0]); }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000; unit.tempSnipe = true;
      log(`${unit.card.name}: +1000 BP และ [Sniper] เทิร์นนี้`);
    },
  };

  // 062 Yachiho Azuma — [On Play] if 3+ Trait:6th Unit cards on your Front Line, draw 1.
  reg['UA49BT-MSS-1-062'] = { async onPlay(G, p, unit) { if (countDistinctFrontTrait(p, '6th Unit') >= 3 || p.front.filter(u => (u.card.traits || '').includes('6th Unit')).length >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 068 Tenka Izumo — [Main][1/turn] only during the turn this character was played, and 3+
  // Trait:Anti-Demon Corps on your Front Line: choose 1 of: choose 1 Trait:6th Unit card, move it
  // to another line or swap its position with 1 character on another line; or draw 1.
  reg['UA49BT-MSS-1-068'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (p.front.filter(u => (u.card.traits || '').includes('Anti-Demon Corps')).length < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [{ label: 'ย้าย/สลับตำแหน่ง Trait:6th Unit', value: 'a' }, { label: 'จั่ว 1 ใบ', value: 'b' }]);
      if (v === 'b') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('6th Unit'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:6th Unit`);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 069 Tenka Izumo — [Main][1/turn per option] choose 1 of: if in Energy Line, set self active; or
  // if in Front Line, choose 1 Trait:Anti-Demon Corps card, move it to another line or swap
  // position.
  reg['UA49BT-MSS-1-069'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (p.energy.includes(unit) && unit._usedA !== Engine.G.turn) opts.push({ label: 'ตั้งตัวเองเป็น Active', value: 'a' });
      if (p.front.includes(unit) && unit._usedB !== Engine.G.turn) opts.push({ label: 'ย้าย/สลับตำแหน่ง Trait:Anti-Demon Corps', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ไม่มี effect ที่ใช้ได้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { unit._usedA = Engine.G.turn; unit.rested = false; log(`${unit.card.name}: Active`); }
      else {
        unit._usedB = Engine.G.turn;
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Anti-Demon Corps'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Anti-Demon Corps`);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      }
    },
  };

  // 072 Sahara Wakasa — [Main][Frontline][Pay 1 AP][1/turn] choose this character or 1
  // Trait:Anti-Demon Corps card on your Energy Line, set it active.
  reg['UA49BT-MSS-1-072'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
      unit._usedTurn = Engine.G.turn;
      const targets = [unit, ...p.energy.filter(u => (u.card.traits || '').includes('Anti-Demon Corps'))];
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 078 "Mato's Intersquad Tournament" — add up to 1 Trait:6th Unit from your Outside Area to your
  // hand. Free-play up to 1 Trait:6th Unit (fulfilled energy, ap1) from hand rested (skipped: "or
  // raid it").
  reg['UA49BT-MSS-1-078'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('6th Unit'), `${card.name}: เลือกการ์ดจาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('6th Unit') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 079 "Mato's Peaches" — [1/turn] draw 1. Choose up to 1 Trait:Humanoid Shuuki card, it gains "+1
  // generated energy" this turn. If there is an Aoba Wakura on your area, untap 1 AP.
  reg['UA49BT-MSS-1-079'] = {
    async onEvent(G, p, card) {
      if (p._usedMatosPeachesTurn === Engine.G.turn) return;
      p._usedMatosPeachesTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Humanoid Shuuki'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Humanoid Shuuki`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempGen += 1; log(`${card.name}: ${t.card.name} +1 generated energy เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Aoba Wakura')) await H.apUntap(p, 1);
    },
  };
})();
