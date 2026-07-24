// ══════════ UA SIM — The Dangers in My Heart / "Shy" (SHY) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasTrait(u, trait) { return (u.card.traits || '').includes(trait); }
  function hasOtherHeroNeed4(p, self) {
    return [...p.front, ...p.energy].some(u => u !== self && hasTrait(u, 'Hero') && (u.card.need || 0) >= 4);
  }
  async function buffNamedOwn(p, name, delta, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes(name));
    if (!targets.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `เลือก ${name} รับ ${delta > 0 ? '+' : ''}${delta} BP`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += delta; log(`${t.card.name} ${delta > 0 ? '+' : ''}${delta} BP เทิร์นนี้`); }
    return t;
  }
  async function sidelineToDeckTop(p, predicate, title) {
    const i = await p.controller.chooseCardFromSideline(p, title, predicate);
    if (i == null) return null;
    const no = p.sideline.splice(i, 1)[0];
    p.deck.unshift(no);
    log(`${p.name}: ${byNo(no)?.name} จาก Outside Area ไปบนสุดของเด็ค`);
    return no;
  }
  async function sidelineToDeckBottom(owner, title) {
    const i = await owner.controller.chooseCardFromSideline(owner, title, null);
    if (i == null) return null;
    const no = owner.sideline.splice(i, 1)[0];
    owner.deck.push(no);
    log(`${owner.name}: ${byNo(no)?.name} จาก Outside Area ไปล่างสุดของเด็ค`);
    return no;
  }

  // 002 Lady Black — [On Play] place up to 1 blue Trait:Hero card from your Outside Area on top
  // of your deck.
  reg['SHY-1-002'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('Hero');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      await sidelineToDeckTop(p, pred, `${unit.card.name}: เลือก Trait:Hero สีน้ำเงินจาก Outside Area`);
    },
  };

  // 006 Natalia — [On Play] choose up to 1 Spirits on your area, +2000 BP this turn.
  reg['SHY-1-006'] = { async onPlay(G, p, unit) { await buffNamedOwn(p, 'Spirits', 2000, unit); } };

  // 014 Stigma — [Main][Rest] choose 1 other Trait:Amarariruku card on your area, +1000 BP this turn.
  reg['SHY-1-014'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && hasTrait(u, 'Amarariruku'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Amarariruku`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 017 Tzveta — [Main][Frontline][Rest][1/turn] only if you used an Event Card this turn: draw 1.
  reg['SHY-1-017'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 031 Lady Black — [When Attacking] look at the top card of your deck (kept on top). If it has
  // no trigger and is a Trait:Hero card, you may reveal it and add it to your hand.
  reg['SHY-1-031'] = {
    async onAttack(G, p, unit) {
      if (!p.deck.length) return;
      const c = byNo(p.deck[0]);
      if (!c || c.trigger || !(c.traits || '').includes('Hero')) return;
      const v = await p.controller.chooseOption(p, `การ์ดบนสุดของเด็ค: ${c.name} — เพิ่มเข้ามือ?`, [{ label: 'เพิ่มเข้ามือ', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { const no = p.deck.shift(); p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); }
    },
  };

  // 034 "You can't stop this" — choose 1 Trait:Amarariruku card on your area, +2000 BP and
  // [Impact +1] this turn.
  reg['SHY-1-034'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => hasTrait(u, 'Amarariruku'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Amarariruku`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} +2000 BP และ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 036 "Heart's Crystal" — add up to 1 Trait:Amarariruku card from your Outside Area to your
  // hand. If there is no Trait:Hero card on your area, draw 1 card.
  reg['SHY-1-036'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Amarariruku'), `${card.name}: เลือกการ์ดจาก Outside Area`);
      if (![...p.front, ...p.energy].some(u => hasTrait(u, 'Hero'))) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 037 "Nakayoshi Bomb" — draw 1. Choose up to 1 character on your opponent's Front Line with
  // BP 3000 or less and move it to the Energy Line.
  reg['SHY-1-037'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP 3000 หรือน้อยกว่า)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(enemy, t, 'energy');
    },
  };

  // 039 "The Human Toy Box" — draw 2. Play up to 1 of each Keheheh and Tzveta (need<=4, ap1) from
  // your hand to your area rested. (Skipped: the "or raid it" alternative.)
  reg['SHY-1-039'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      for (const name of ['Keheheh', 'Tzveta']) {
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes(name) && (c.need || 0) <= 4 && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      }
    },
  };

  // 041 "Welcome into the inside of my heart" — choose 1 character on your opponent's Front Line
  // with BP 5000 or less, rest it and it cannot stand up the next time it would. If there is a
  // Tzveta on your area, retire it instead.
  reg['SHY-1-041'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP 5000 หรือน้อยกว่า)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Tzveta')) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${card.name}: ${t.card.name} ถูก retire`); }
      else { t.rested = true; t.skipNextStand = true; log(`${card.name}: ${t.card.name} ถูกวางนอน และจะไม่ลุกครั้งถัดไป`); }
    },
  };

  // 049 Shy — [On Play] if this character was played by your character's effect, draw 1 card.
  reg['SHY-1-049'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  async function endOfAttackToEnergy050(G, p, atk) { if (p.front.includes(atk)) await Engine.moveUnitFree(p, atk, 'energy'); }
  // 050 Shy — passive: at the end of this character's attack (regardless of outcome), move this
  // character to the Energy Line. @[On Play] if own Koishikawa Iko, set self active. @[Main]
  // [1/turn] only if 4+ characters on your opponent's Front Line: self +1000 BP this turn.
  reg['SHY-1-050'] = {
    async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Koishikawa Iko')) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onWinBattle(G, p, atk) { await endOfAttackToEnergy050(G, p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemyOwner, defender, self) { if (atk === self) await endOfAttackToEnergy050(G, p, atk); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) await endOfAttackToEnergy050(G, p, atkUnit); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      if (enemy.front.length < 4) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  async function endOfAttackReturnHand051(G, p, atk) {
    if (atk._returnOnAttackEndTurn === Engine.G.turn) { atk._returnOnAttackEndTurn = null; await Engine.returnUnitToHand(p, atk); log(`${atk.card.name}: กลับมือ`); }
  }
  // 051 Shy — [On Play] you may set this character to active. If there are 2 or less other
  // Trait:Hero cards (need>=4) on your area, this character gains "at the end of this character's
  // attack, return this character to your hand" during this turn.
  reg['SHY-1-051'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ตั้งเป็น Active?`, [{ label: 'Active', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { unit.rested = false; log(`${unit.card.name}: Active`); }
      const otherHero4 = [...p.front, ...p.energy].filter(u => u !== unit && hasTrait(u, 'Hero') && (u.card.need || 0) >= 4).length;
      if (otherHero4 <= 2) { unit._returnOnAttackEndTurn = Engine.G.turn; log(`${unit.card.name}: ได้รับความสามารถ "จบการโจมตีแล้วกลับมือ" เทิร์นนี้`); }
    },
    async onWinBattle(G, p, atk) { await endOfAttackReturnHand051(G, p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemyOwner, defender, self) { if (atk === self) await endOfAttackReturnHand051(G, p, atk); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) await endOfAttackReturnHand051(G, p, atkUnit); },
  };

  // 056 Spirits — [When Attacking] if there is another Trait:Hero (need<=4) on your area, draw 1
  // and place 1 card from your hand to the Outside Area.
  reg['SHY-1-056'] = {
    async onAttack(G, p, unit) {
      const has = [...p.front, ...p.energy].some(u => u !== unit && hasTrait(u, 'Hero') && (u.card.need || 0) <= 4);
      if (!has) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  async function dsBottomCombo(G, p, unit) {
    if (!p.sideline.length) return;
    const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจาก Outside Area ไปล่างสุดของเด็ค?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    const no = await sidelineToDeckBottom(p, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    if (no == null) return;
    const enemy = Engine.opponentOf(p);
    if (enemy.sideline.length) await sidelineToDeckBottom(enemy, `${unit.card.name}: ฝ่ายตรงข้ามเลือกการ์ดจาก Outside Area`);
  }
  // 058 Doktor Schwarz — [On Play][When Attacking] may place 1 card from your Outside Area to the
  // bottom of your deck; if did, your opponent places 1 card from their Outside Area to the bottom
  // of their deck.
  reg['SHY-1-058'] = {
    async onPlay(G, p, unit) { await dsBottomCombo(G, p, unit); },
    async onAttack(G, p, unit) { await dsBottomCombo(G, p, unit); },
  };

  // 061 Mian Long — [Your Turn] if there is a Trait:Hero card (need>=4) on your area, this
  // character gets +1000 BP.
  reg['SHY-1-061'] = { bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && [...p.front, ...p.energy].some(u => u !== unit && hasTrait(u, 'Hero') && (u.card.need || 0) >= 4)) ? 1000 : 0; } };

  // 069 Unilord — [On Play] you may rest 1 active Trait:Hero character (need>=4) on your Front
  // Line; if did, choose up to 1 character on your opponent's Front Line and rest it.
  reg['SHY-1-069'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && !u.rested && hasTrait(u, 'Hero') && (u.card.need || 0) >= 4);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน Trait:Hero ของตัวเอง?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Hero`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      await H.restEnemyFront(p);
    },
  };

  // 073 Spaceship (Field) — passive: if there is a Trait:Hero card (need>=4) on your area, this
  // field gets +1 generated energy.
  reg['SHY-1-073'] = { genMod(unit, p) { return [...p.front, ...p.energy].some(u => u !== unit && hasTrait(u, 'Hero') && (u.card.need || 0) >= 4) ? 1 : 0; } };

  // 074 "Flame One Stroke" — choose up to 1 character on your opponent's Front Line with BP 2000
  // or less and retire it. If there is a Shy on your area, BP 4000 or less instead. If there are
  // both Shy and Koishikawa Iko on your area, BP 5000 or less instead.
  reg['SHY-1-074'] = {
    async onEvent(G, p, card) {
      let limit = 2000;
      if (H.hasCardNamed(p, 'Shy') && H.hasCardNamed(p, 'Koishikawa Iko')) limit = 5000;
      else if (H.hasCardNamed(p, 'Shy')) limit = 4000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 075 "Sleep" — choose 1 active Mian Long on your Front Line and rest it. If you did, draw 3.
  reg['SHY-1-075'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Mian Long'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Mian Long`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
    },
  };

  // 077 "Hero's holiday" — draw 2. If there are both Shy and Koishikawa Iko on your area, also
  // draw 1 and place 1 card from your hand to the Outside Area.
  reg['SHY-1-077'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (H.hasCardNamed(p, 'Shy') && H.hasCardNamed(p, 'Koishikawa Iko')) {
        Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`);
        await H.discardFromHand(p);
      }
    },
  };

  // 078 "Flame of Courage" — choose 1 character on your area, +2000 BP this turn. If the chosen
  // character is Shy, also grant [Impact +1] this turn.
  reg['SHY-1-078'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      let msg = `${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`;
      if ((t.card.name || '').includes('Shy')) { t.tempImpact = (t.tempImpact || 0) + 1; msg += ' และ [Impact +1]'; }
      log(msg);
    },
  };

  // 080 "Because I'm 'shy'" — return 1 Shy on your area to your hand. If you did, look at the top
  // 5 of your deck, reveal up to 2 Shy among them and add them to hand, remainder to the bottom,
  // choose up to 1 of your AP cards and set it active. If you added 2 cards this way, place 1 card
  // from your hand to the Outside Area.
  reg['SHY-1-080'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Shy'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Shy`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${card.name}: ${t.card.name} กลับมือ`);
      const taken = await H.lookTopAndTake(p, 5, c => (c.name || '').includes('Shy'), 2, `${card.name}: ดูการ์ดบนสุด 5 ใบ`);
      await H.apUntap(p, 1);
      if (taken.length >= 2) await H.discardFromHand(p);
    },
  };

  // UAPR-SHY-P-001 Tzveta — [Your Turn] if you used an Event Card this turn, +500 BP. @[Activate
  // Main][Frontline][1/turn] can only activate if you have no Trait:Hero on your area and used an
  // Event Card this turn: set this character to active.
  reg['UAPR-SHY-P-001'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._eventsUsedThisTurn) ? 500 : 0; },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if ([...p.front, ...p.energy].some(u => hasTrait(u, 'Hero')) || !p._eventsUsedThisTurn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      log(`${unit.card.name}: Active`);
    },
  };
})();
