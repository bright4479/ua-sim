// ══════════ UA SIM — My Hero Academia (MHA) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.
// Large, mechanically dense series — accepts more skipped sub-clauses than usual, same as KMR/NIK.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countDistinctOneForAll(p) {
    const names = new Set();
    for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes('One For All')) names.add(u.card.name);
    for (const no of p.sideline) { const c = byNo(no); if (c && (c.traits || '').includes('One For All')) names.add(c.name); }
    return names.size;
  }
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }
  async function swapFrontEnergy(p, title) {
    if (!p.front.length || !p.energy.length) return;
    const uid1 = await p.controller.chooseOwnCharacter(p, p.front, `${title}: เลือก character บน Front Line`);
    const a = p.front.find(x => x.uid === uid1);
    const uid2 = await p.controller.chooseOwnCharacter(p, p.energy, `${title}: เลือก character บน Energy Line`);
    const b = p.energy.find(x => x.uid === uid2);
    if (!a || !b) return;
    const fi = p.front.indexOf(a), ei = p.energy.indexOf(b);
    p.front[fi] = b; p.energy[ei] = a;
    log(`${title}: สลับตำแหน่ง ${a.card.name} กับ ${b.card.name}`);
  }

  // 002 Eri — [On Play] you may place 3 cards from the top of your deck to the Outside Area.
  // @[Main][Rest+Retire] add 1 (Trait:Shie Hassaikai or named Quirk-Destroying Bullet) from your
  // Outside Area to hand.
  reg['MHA-1-002'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็ค 3 ใบไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const n = Math.min(3, p.deck.length);
      const sent = p.deck.splice(0, n);
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && ((c.traits || '').includes('Shie Hassaikai') || (c.name || '').includes('Quirk-Destroying Bullet')), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 003 All For One — passive: if 3+ of your characters have an [Main] ability, +1000 BP.
  reg['MHA-1-003'] = { bpBonus(p, unit) { return [...p.front, ...p.energy].filter(u => Effects.hasMain(u.card)).length >= 3 ? 1000 : 0; } };

  // 006 Kurogiri — [Main][Discard 1][1/turn] choose 1 of: choose up to 1 character on your area
  // and move it to another line; or choose 1 Front Line and 1 Energy Line character and swap them.
  reg['MHA-1-006'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ย้าย character 1 ใบไปอีก line', value: 'a' }, { label: 'สลับตำแหน่ง Front Line กับ Energy Line', value: 'b' },
      ]);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy];
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character', true);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      } else await swapFrontEnergy(p, unit.card.name);
    },
  };

  // 009 Shigaraki Tomura — [Your Turn] an opponent's character that battles this character and
  // loses goes to the Remove Area instead of the Outside Area. @[Main][Discard 1][1/turn] self
  // gains [Impact +1] this turn.
  reg['MHA-1-009'] = {
    async onWinBattle(G, p, atk, enemy, defender) {
      await forceToRemoval(enemy, defender, 'battle');
      return true;
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: [Impact +1] เทิร์นนี้`);
    },
  };

  // 011 Stain — passive: the character that blocks this character's attack (and wins) will not
  // stand the next time it would. (Skipped: the granted "opponent must block if able" [Main]
  // ability — the recurring forced-block mechanic gap.)
  reg['MHA-1-011'] = { async onAnyLoseBattle(G, p, atk, enemy, defender, self) { if (atk === self && defender) { defender.skipNextStand = true; log(`${defender.card.name}: จะไม่ลุกครั้งถัดไป`); } } };

  // 013 Dabi — [On Play] you may add 1 card from your Life Area to your hand; if you did, choose
  // up to 1 character on your Front Line and set it active.
  reg['MHA-1-013'] = {
    async onPlay(G, p, unit) {
      const no = await H.addLifeToHand(p);
      if (no == null) return;
      const targets = p.front.filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 018 Toga Himiko — [Main][1/turn] this character gains "when attacks and wins, draw 1" this turn.
  reg['MHA-1-018'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit._grantedOnWinDraw = true;
      log(`${unit.card.name}: ได้รับ "โจมตีชนะแล้วจั่ว 1 ใบ" เทิร์นนี้`);
    },
  };

  // 019 Toga Himiko — [Main][Frontline][1/turn] choose up to 1 character on either area with BP
  // 1500 or higher, -1000 BP this turn.
  reg['MHA-1-019'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = [...p.front, ...p.energy, ...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); }
    },
  };

  // 020 Toga Himiko — can be raided without the required Raided card. @[On Play] reveal the top
  // card of your deck and add it to hand; if it has no [Raid], place 1 card from hand to the
  // Outside Area.
  reg['MHA-1-020'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const no = p.deck.shift();
      const c = byNo(no);
      p.hand.push(no);
      log(`${unit.card.name}: เปิดเจอ ${c?.name} — เพิ่มเข้ามือ`);
      if (c && !Engine.parseKeywords(c).raidTargets.length) await H.discardFromHand(p);
    },
  };

  // 023 La Brava — [Main][Frontline][1/turn] choose 1 other character on your area, +1000 BP this
  // turn (+2000 and [Sniper] if the chosen is Gentle Criminal).
  reg['MHA-1-023'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if ((t.card.name || '').includes('Gentle Criminal')) { t.bpMod += 2000; t.tempSnipe = true; log(`${unit.card.name}: ${t.card.name} +2000 BP และ [Sniper] เทิร์นนี้`); }
      else { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 029 "Quirk Destroying Bullet" (Field) — cannot be played from hand unless you have Overhaul on
  // your field. @[On Play] choose up to 1 enemy Front Line character, rest it and move its Raid
  // stack to the Outside Area. (Simplified: the persistent "loses all effects and cannot stand
  // while this Field remains" lock is not implemented — would need a multi-turn nullify tied to
  // this Field's lifetime, not just "this turn".)
  reg['MHA-1-029'] = {
    canPlayFromHand(p, card) { return H.hasCardNamed(p, 'Overhaul'); },
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      if (t.under.length) { enemy.sideline.push(...t.under); t.under = []; }
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน และการ์ดใต้ตัวไป Outside Area`);
    },
  };

  // 030 "Sad Man's Parade" — usable only if there is a Twice on your area. Play any number of
  // Twice (need<=2, ap1) from your hand or Outside Area to your area active.
  reg['MHA-1-030'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Twice')) return;
      for (;;) {
        const hi = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes('Twice') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
        if (hi >= 0) { await Engine.playCardFromZone(p, p.hand[hi], 'hand', { line: 'energy', active: true }); continue; }
        const si = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes('Twice') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
        if (si >= 0) { await Engine.playCardFromZone(p, p.sideline[si], 'sideline', { line: 'energy', active: true }); continue; }
        break;
      }
    },
  };

  // 031 "Shie Hassaikai" — add up to 1 Trait:Shie Hassaikai card from your Outside Area to hand.
  // Free-play up to 1 Trait:Shie Hassaikai (fulfilled energy, ap1) from your hand rested (skipped:
  // the "or raid" alternative).
  reg['MHA-1-031'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Shie Hassaikai'), `${card.name}: เลือกการ์ดจาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Shie Hassaikai') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 033 "Decay" — choose 1 enemy Front Line character with BP 4000 or less and place it in the
  // Remove Area. (Skipped: the self-referential "reduce this card's AP cost in your hand" clause —
  // does not affect the resulting board state, only the AP the bot pays.)
  reg['MHA-1-033'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await forceToRemoval(enemy, t, 'effect');
    },
  };

  // 042 Uraraka Ochako — [On Play] choose an active Front Line character other than this one, you
  // may return it to hand; if you did, free-play up to 1 green Character (need<=3, ap1) from hand
  // active.
  reg['MHA-1-042'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน ${t.card.name} กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
    },
  };

  // 048 Sir Nighteye — [On Play] you may peek at your Life Area (no state change). (Skipped: the
  // "would leave the field by opponent's effect, it does not instead" replacement-effect passive —
  // the recurring replacement-effect gap.)
  reg['MHA-1-048'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดใน Life Area ทั้งหมด`); } };

  // 052 Todoroki Shoto — [When Attacking] choose up to 1 enemy Front Line character with BP 1000
  // or higher, -500 BP this turn.
  reg['MHA-1-052'] = { async onAttack(G, p, unit) { await H.debuffEnemyAny(p, -500, { min: 1000 }); } };

  // 056 Fat Gum — [On Play] you may place 1 card from hand face-down under a Fat Gum or Amajiki
  // Tamaki; if you did, draw 1. @[When Attacking] you may place a face-down card from under this
  // character to the Outside Area; if you did, +2000 BP this turn.
  reg['MHA-1-056'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => /Fat Gum|Amajiki Tamaki/.test(u.card.name || ''));
      if (!targets.length || !p.hand.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจากมือคว่ำใต้ Fat Gum/Amajiki Tamaki?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
      if (i == null) return;
      const no = p.hand.splice(i, 1)[0];
      t.counters.push(no);
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ ${t.card.name}`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้ตัวเองไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = unit.counters.shift();
      p.sideline.push(no);
      log(`${unit.card.name}: การ์ดคว่ำไป Outside Area`);
      unit.bpMod += 2000; log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 059 Midoriya Izuku — [On Play] free-play up to 1 green Character (need<=3, ap1) from hand
  // active (skipped: the "or raid it" alternative).
  reg['MHA-1-059'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
    },
  };

  // 063 "Detroit Smash" — choose 1 character on your area, +2500 BP and "when attacks and wins,
  // draw 1" this turn. If the chosen is All Might or Midoriya Izuku, also [Sniper] this turn.
  reg['MHA-1-063'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2500; t._grantedOnWinDraw = true;
      let msg = `${card.name}: ${t.card.name} +2500 BP และ "ชนะแล้วจั่ว 1 ใบ" เทิร์นนี้`;
      if (/All Might|Midoriya Izuku/.test(t.card.name || '')) { t.tempSnipe = true; msg += ' และ [Sniper]'; }
      log(msg);
    },
  };

  // 070 Ida Tenya — [Main][Discard 1][1/turn] set this character active.
  reg['MHA-1-070'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.rested = false; log(`${unit.card.name}: Active`);
    },
  };

  // 071 Endeavor — [On Play] place 1 card from your hand to the Outside Area.
  reg['MHA-1-071'] = { async onPlay(G, p, unit) { await H.discardFromHand(p); } };

  // 074 Kirishima Eijiro — [Your Turn][1/turn] if this character would leave the field by your
  // opponent's effect, it does not instead. (Skipped: replacement-effect gap, no hook available.)

  // 076 Sero Hanta — [On Play][Frontline] choose up to 1 character on your Energy Line and move it
  // to the Front Line.
  reg['MHA-1-076'] = {
    async onPlay(G, p, unit) {
      if (!p.front.includes(unit)) return;
      if (!p.energy.length || p.front.length >= 4) return;
      const uid = await p.controller.chooseOwnCharacter(p, p.energy, `${unit.card.name}: เลือกการ์ดบน Energy Line`, true);
      const t = p.energy.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, 'front');
    },
  };

  // 079 Todoroki Shoto — [When Attacking] choose up to 1 other character on your area, +500 BP
  // this turn.
  reg['MHA-1-079'] = { async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); } };

  // 084 Bakugo Katsuki — [Main][Frontline][1/turn] grant "next BP-range effect this turn increases
  // by +1000". (Skipped: the recurring meta BP-range-increase gap.)

  // 087 Best Jeanist — [On Retire] draw until you have 2 cards in hand.
  reg['MHA-1-087'] = { async onSideline(G, p, unit) { const n = 2 - p.hand.length; if (n > 0) { Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`); } } };

  // 089 Hawks — [On Play] if you have 3 or fewer cards in hand, draw 1.
  reg['MHA-1-089'] = { async onPlay(G, p, unit) { if (p.hand.length <= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 091 Mt. Lady — [When Attacking]/[On Block] if there is space on your Front Line, you may place
  // 1 card from hand to the Outside Area; if you did, +2000 BP this turn.
  async function mtLadyEffect(p, unit) {
    if (p.front.length >= 4) return;
    const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
    if (no != null) { unit.bpMod += 2000; log(`${unit.card.name}: +2000 BP เทิร์นนี้`); }
  }
  reg['MHA-1-091'] = { async onAttack(G, p, unit) { await mtLadyEffect(p, unit); }, async onBlock(G, p, unit) { await mtLadyEffect(p, unit); } };

  // 093 Midoriya Izuku — [Frontline][1/turn] if another character would leave by an opponent's
  // character effect, redirect instead. (Skipped: replacement-effect gap, no hook available.)

  // 096 Endeavor Agency (Field) — [Your Turn][1/turn] only if you placed a card from hand to the
  // Outside Area this turn: you may rest this active field; if you did, draw 1.
  reg['MHA-1-096'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._placedToOutsideThisTurn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 104 Jiro Kyouka — [On Play] look at the top 3, keep them on top in any order (no real state
  // change to simulate).
  reg['MHA-1-104'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`); } };

  // 105 Bakugo Katsuki — [When Attacking] choose up to 1 enemy Front Line character with BP 2500
  // or less, retire it.
  reg['MHA-1-105'] = { async onAttack(G, p, unit) { await H.retireEnemyFront(p, 2500); } };

  // 106 Midoriya Izuku — passive: if 3+ characters on your opponent's Front Line, +1000 BP.
  reg['MHA-1-106'] = { bpBonus(p, unit) { return Engine.opponentOf(p).front.length >= 3 ? 1000 : 0; } };

  // ── MHA-2 (EX/ST) prints ──

  // 2-003 All Might — passive: if 3+ distinct-named Trait:One For All cards on your area and
  // Outside Area, +1 generated energy. @[Main][Rest] place 1 Trait:One For All card from hand to
  // the Outside Area; if you did, draw 1.
  reg['MHA-2-003'] = {
    genMod(unit, p) { return countDistinctOneForAll(p) >= 3 ? 1 : 0; },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('One For All'));
      if (idx < 0) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไป Outside Area`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 2-016 Sero Hanta — [On Retire] choose up to 1 character on your area and move it to another line.
  reg['MHA-2-016'] = {
    async onSideline(G, p, unit) {
      const targets = [...p.front, ...p.energy];
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 2-018 Todoroki Shoto — [On Play] you may pay 1 AP and place 1 card from hand (other than Izuku
  // Midoriya) to the Outside Area; if you did, free-play 1 yellow Izuku Midoriya (need<=4, ap1)
  // from your Outside Area to your area rested.
  reg['MHA-2-018'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const otherIdx = p.hand.findIndex(no => (byNo(no)?.name || '') !== 'Izuku Midoriya');
      if (otherIdx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP + วางการ์ดจากมือ?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ (ไม่ใช่ Izuku Midoriya)`);
      if (i == null || (byNo(p.hand[i])?.name || '') === 'Izuku Midoriya') return;
      const no = p.hand.splice(i, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไป Outside Area`);
      const idx = p.sideline.findIndex(sno => { const c = byNo(sno); return c && c.type === 'Character' && c.color === 'Yellow' && (c.name || '').includes('Izuku Midoriya') && (c.need || 0) <= 4 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 2-021/2-023/2-025 Midoriya Izuku — cannot be played from hand if there is a Trait:Class A card
  // other than this one on your area (can still activate [Main]). (Skipped: the [Main][Pay 1 AP]
  // hand-based ability activation itself — a new activation surface, hand cards are not currently
  // scannable as ability candidates by bot.js/ui.js.)
  function classAOtherPresent(p) { return [...p.front, ...p.energy].some(u => u.card.name !== 'Izuku Midoriya' && (u.card.traits || '').includes('Class A')); }
  reg['MHA-2-021'] = { canPlayFromHand(p, card) { return !classAOtherPresent(p); } };
  reg['MHA-2-023'] = { canPlayFromHand(p, card) { return !classAOtherPresent(p); } };
  reg['MHA-2-025'] = { canPlayFromHand(p, card) { return !classAOtherPresent(p); } };

  // 2-029 En (Field) — [Main][Rest+Retire] only if 3+ distinct-named Trait:One For All cards on
  // your area and Outside Area: choose 1 Izuku Midoriya on your area, grant it untargetable
  // (approximated as lasting the rest of this turn rather than "until the start of your next
  // turn"). Draw 1.
  reg['MHA-2-029'] = {
    async onMain(G, p, unit) {
      if (countDistinctOneForAll(p) < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Izuku Midoriya'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Izuku Midoriya`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ป้องกันการเป็นเป้าหมายเทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 2-030 Shinomori Hikage (Field) — [Your Turn] replacement effect protecting Izuku Midoriya from
  // Trigger effects by retiring this Field instead. (Skipped: replacement-effect gap.)

  // 2-031 Shimura Nana (Field) — [Main][Rest+Retire] only if 3+ distinct-named Trait:One For All
  // cards on your area and Outside Area: choose 1 Izuku Midoriya on your area, set it active.
  reg['MHA-2-031'] = {
    async onMain(G, p, unit) {
      if (countDistinctOneForAll(p) < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Izuku Midoriya'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Izuku Midoriya`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 2-032 Banjo Daigoro (Field) — [Main][Discard 1][Rest+Retire] only if 3+ distinct-named
  // Trait:One For All cards on your area and Outside Area: choose 1 Izuku Midoriya, [Sniper] this turn.
  reg['MHA-2-032'] = {
    async onMain(G, p, unit) {
      if (countDistinctOneForAll(p) < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Izuku Midoriya'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Izuku Midoriya`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempSnipe = true; log(`${unit.card.name}: ${t.card.name} [Sniper] เทิร์นนี้`); }
    },
  };

  // 2-033 "One for All 3rd generation successor (Bruce)" (Field) — [Main][Rest+Retire] only if 3+
  // distinct-named Trait:One For All cards on your area and Outside Area: choose 1 Izuku Midoriya,
  // +2000 BP this turn. Draw 1.
  reg['MHA-2-033'] = {
    async onMain(G, p, unit) {
      if (countDistinctOneForAll(p) < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Izuku Midoriya'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Izuku Midoriya`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 2-036 "Friends" — usable only if 3+ Trait:Class A cards on your area. Choose up to 2 of: choose
  // up to 1 enemy Front Line character and rest it; free-play 1 yellow Trait:Class A (fulfilled
  // energy, ap1) from hand active (skipped: "or raid it"); all characters on your area +1000 BP.
  reg['MHA-2-036'] = {
    async onEvent(G, p, card) {
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Class A')).length < 3) return;
      const opts = [
        { label: 'วางนอน character ศัตรู', value: 'a' }, { label: 'ลง Trait:Class A สีเหลืองจากมือ แบบ Active', value: 'b' }, { label: 'character ทุกใบ +1000 BP เทิร์นนี้', value: 'c' },
      ];
      for (let i = 0; i < 2; i++) {
        if (!opts.length) break;
        const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect (${i + 1}/2)`, opts);
        const oi = opts.findIndex(o => o.value === v);
        if (oi >= 0) opts.splice(oi, 1);
        if (v === 'a') await H.restEnemyFront(p);
        else if (v === 'b') {
          const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Class A') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
          if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
        } else { for (const u of [...p.front, ...p.energy]) u.bpMod += 1000; log(`${card.name}: character ทุกใบ +1000 BP เทิร์นนี้`); }
      }
    },
  };

  // 2-038 All For One — [On Play] borrow another card's [Main] effect. (Skipped: too complex/narrow
  // to implement generically — would need runtime re-parsing of an arbitrary card's ability text.)

  // 2-040 Shigaraki Tomura — [Main][Frontline][1/turn] grant an enemy character a reactive BP-drop
  // and a BP-zero-retire replacement. (Skipped: would need a new per-unit reactive hook plus a
  // checkBpZero override for one card — too complex/narrow.)

  // 2-041 Dabi — [On Play] you may pay 1 AP; if you did, choose 1 of: choose up to 1 enemy Front
  // Line character with BP 2500 or less and retire it; or draw 2.
  reg['MHA-2-041'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [{ label: 'retire character ศัตรู (BP 2500 หรือน้อยกว่า)', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' }]);
      if (v2 === 'a') await H.retireEnemyFront(p, 2500);
      else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 2-045 Lady Nagant — [Main][Discard 2][1/turn] this character gains [Sniper] this turn
  // (approximated: does not separately enforce "cannot target BP 3000+ with Sniper").
  reg['MHA-2-045'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.hand.length < 2) return;
      for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: [Discard 2] (${i + 1}/2)`); if (idx == null) return; p.removal.push(p.hand.splice(idx, 1)[0]); }
      unit._usedTurn = Engine.G.turn;
      unit.tempSnipe = true;
      log(`${unit.card.name}: [Sniper] เทิร์นนี้`);
    },
  };

  // 2-050 Aoyama Yuga — [On Play] if there is space on your opponent's Front Line, you may free-
  // play 1 green Character (need<=3, ap1) from hand rested; if you did, your opponent plays up to
  // 1 ap1 Character Card from their hand to their Front Line rested. Neither played character's
  // [On Play] effect activates.
  reg['MHA-2-050'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (enemy.front.length >= 4) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ลง Character สีเขียวจากมือ?`, [{ label: 'ลง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false, skipOnPlay: true });
      if (enemy.front.length >= 4) return;
      const candidates = enemy.hand.filter(no => (byNo(no)?.ap || 0) === 1 && byNo(no)?.type === 'Character');
      if (!candidates.length) return;
      const opts = candidates.map(no => ({ label: byNo(no)?.name || no, value: no }));
      const chosen = await enemy.controller.chooseOption(enemy, `${unit.card.name}: ฝ่ายตรงข้ามถูกบังคับให้ลง character`, opts);
      if (chosen == null) return;
      await Engine.playCardFromZone(enemy, chosen, 'hand', { line: 'front', active: false, skipOnPlay: true });
    },
  };

  // 2-067 Todoroki Shoto — [On Play] you may pay 1 AP; if you did, choose 1 of: set self active
  // and +1000 BP this turn; or choose up to 1 enemy Front Line character with BP 3000 or less, rest
  // it and it will not stand the next time it would.
  reg['MHA-2-067'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [{ label: 'Active + 1000 BP เทิร์นนี้', value: 'a' }, { label: 'วางนอนศัตรู (BP 3000 หรือน้อยกว่า) + ไม่ลุกครั้งถัดไป', value: 'b' }]);
      if (v2 === 'a') { unit.rested = false; unit.bpMod += 1000; log(`${unit.card.name}: Active และ +1000 BP เทิร์นนี้`); }
      else {
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = true; t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน และจะไม่ลุกครั้งถัดไป`); }
      }
    },
  };

  // 2-069 Hawks — [On Play] you may place 1 card from the top of your deck face-down under this
  // character. @[When Attacking] look at the face-down cards under this character and add up to 1
  // to your hand; if you did, you may place 1 card from your hand to the Outside Area.
  reg['MHA-2-069'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ตัวเอง?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ตัวเอง`);
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const i = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ดคว่ำใต้ตัวเองเข้ามือ`, unit.counters.map((no, idx) => ({ label: byNo(no)?.name || no, value: idx })).concat([{ label: 'ข้าม', value: null }]));
      if (i == null) return;
      const no = unit.counters.splice(i, 1)[0];
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
      await H.discardFromHand(p);
    },
  };

  // 2-070 Midnight — [Main][Frontline][1/turn] only if you placed a card from hand to the Outside
  // Area this turn: choose 1 character (need>=5) on your area, set it active and +500 BP this turn.
  reg['MHA-2-070'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._placedToOutsideThisTurn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.need || 0) >= 5);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (Energy 5+)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} Active และ +500 BP เทิร์นนี้`); }
    },
  };
})();
