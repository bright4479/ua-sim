// ══════════ UA SIM — Monogatari Series (MGS) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }

  // 001 Koyomi Araragi — [On Play] choose 1 of: draw 1, place 1 card from hand to the Outside
  // Area; or you may retire 1 Field card on your area, if you did, draw 1.
  reg['UA42BT-MGS-1-001'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }, { label: 'retire Field ของตัวเอง + จั่ว 1 ใบ', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Field');
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Field ให้ retire`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        await Engine.sidelineUnit(p, t, 'effect');
        log(`${unit.card.name}: ${t.card.name} ถูก retire`);
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 008 Suruga Kanbaru — [On Play] add up to 1 (Curse-Lifting Ritual or Nadeko Sengoku, need<=1)
  // from your Outside Area to your hand.
  reg['UA42BT-MGS-1-008'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && /Curse-Lifting Ritual|Nadeko Sengoku/.test(c.name || '') && (c.need || 0) <= 1, `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 010 Nadeko Sengoku — [Main][Rest] draw 1, place 1 card from hand to the Outside Area.
  reg['UA42BT-MGS-1-010'] = { async onMain(G, p, unit) { if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } unit.rested = true; Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); } };

  // 017 Tsubasa Hanekawa — [On Play] free-play 1 yellow Character (need<=2) from your hand rested.
  reg['UA42BT-MGS-1-017'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 2; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 019 Karen Araragi — [On Play] choose up to 1 Trait:Fire Sisters card on your area and move it
  // to another line.
  reg['UA42BT-MGS-1-019'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Fire Sisters'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Fire Sisters`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 022 Tsukihi Araragi — [On Play] choose 1 other Trait:Fire Sisters card on your area, +1000 BP
  // this turn.
  reg['UA42BT-MGS-1-022'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Fire Sisters'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Fire Sisters`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 024 Tsukihi Araragi — [When Attacking] draw up to 1.
  reg['UA42BT-MGS-1-024'] = { async onAttack(G, p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };

  // 026 Suruga Kanbaru's Room (Field) — [Main][Rest][1/turn] place the top card of your deck to
  // the Outside Area. @[On Retire] add up to 1 Suruga Kanbaru from your Outside Area to your hand.
  reg['UA42BT-MGS-1-026'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      if (p.deck.length) { const no = p.deck.shift(); p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`); }
    },
    async onSideline(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.name || '').includes('Suruga Kanbaru'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`); },
  };

  // 027 Jagirinawa (Field) — [On Play] you may place 1 Nadeko Sengoku from hand to the Outside
  // Area; if you did, draw 1. @[On Retire] choose up to 1 enemy Front Line character with BP 5000
  // or less and retire it.
  reg['UA42BT-MGS-1-027'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.name || '').includes('Nadeko Sengoku'));
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Nadeko Sengoku จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(p.hand.splice(idx, 1)[0]);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    async onSideline(G, p, unit) { await H.retireEnemyFront(p, 5000); },
  };

  // 029 "Curse-Lifting Ritual" — retire 1 Field card on your area; if you did, draw 1 and reduce
  // the AP cost of the next Nadeko Sengoku you use this turn by 1.
  reg['UA42BT-MGS-1-029'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Field');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Field`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${card.name}: ${t.card.name} ถูก retire`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Nadeko Sengoku'), apDelta: -1 };
      log(`${card.name}: Nadeko Sengoku ใบถัดไป ลด AP cost 1`);
    },
  };

  // 031 "Brushing Teeth" — rest 1 active Karen Araragi on your Front Line; if you did, draw 3.
  reg['UA42BT-MGS-1-031'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Karen Araragi'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Karen Araragi`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
    },
  };

  // 032 "Platinum Mukatsuku" — free-play 1 Trait:Fire Sisters (need<=3, ap1) from hand active.
  reg['UA42BT-MGS-1-032'] = { async onEvent(G, p, card) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Fire Sisters') && (c.need || 0) <= 3 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true }); } };

  // 038 Koyomi Araragi — [On Retire] look at the top 3, reveal up to 1 (Koyomi Araragi, Shinobu
  // Oshino, or Kiss-Shot Acerola-Orion Heart-Under-Blade) among them and add it to hand, remainder
  // to the bottom.
  reg['UA42BT-MGS-1-038'] = { async onSideline(G, p, unit) { await H.lookTopAndTake(p, 3, c => /Koyomi Araragi|Shinobu Oshino|Kiss-Shot Acerola-Orion Heart-Under-Blade/.test(c.name || ''), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 039 Koyomi Araragi — [Your Turn] if there is a Kiss-Shot Acerola-Orion Heart-Under-Blade or
  // Tsubasa Hanekawa on your area, +1000 BP. @[On Retire] add up to 1 Kiss-Shot Acerola-Orion
  // Heart-Under-Blade from your Outside Area to hand; if you did, place 1 card from hand to the
  // Outside Area.
  reg['UA42BT-MGS-1-039'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && (H.hasCardNamed(p, 'Kiss-Shot Acerola-Orion Heart-Under-Blade') || H.hasCardNamed(p, 'Tsubasa Hanekawa'))) ? 1000 : 0; },
    async onSideline(G, p, unit) {
      const no = await H.fetchFromSideline(p, c => c && (c.name || '').includes('Kiss-Shot Acerola-Orion Heart-Under-Blade'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
      if (no != null) await H.discardFromHand(p);
    },
  };

  // 042 Shinobu Oshino — [Main][Rest][1/turn] choose 1 other character, +1000 BP this turn.
  reg['UA42BT-MGS-1-042'] = { async onMain(G, p, unit) { if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; } unit.rested = true; unit._usedTurn = Engine.G.turn; await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 043 Shinobu Oshino — [On Play] choose 1 other character, +1000 BP this turn.
  reg['UA42BT-MGS-1-043'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 046 Shinobu Oshino — [Main][Frontline][1/turn] you may return 1 Koyomi Araragi from your area
  // to hand; if you did, self +1000 BP this turn. (Skipped: "activate the [On Retire] effect of the
  // returned character" — an ability-borrowing mechanic, same class of gap as MHA-2-038.)
  reg['UA42BT-MGS-1-046'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Koyomi Araragi'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน Koyomi Araragi กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Koyomi Araragi');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 048 Meme Oshino — [On Play] choose up to 1 enemy Front Line character with BP 4500 or more,
  // -4000 BP this turn.
  reg['UA42BT-MGS-1-048'] = { async onPlay(G, p, unit) { await H.debuffEnemyAny(p, -4000, { min: 4500 }); } };

  // 051 Hitagi Senjougahara — [Main][1/turn] place 1 card from hand on top of your deck; if you
  // did, +1000 BP this turn.
  reg['UA42BT-MGS-1-051'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือไปบนสุดของเด็ค`);
      if (i == null) return;
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไปบนสุดของเด็ค`);
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 052 Hitagi Senjougahara — when this character attacks and is blocked, draw 1.
  async function senjougahara052(p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
  reg['UA42BT-MGS-1-052'] = {
    async onWinBattle(G, p, atk) { await senjougahara052(p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) { if (atk === self) await senjougahara052(p, atk); },
  };

  // 053 Hitagi Senjougahara — [On Play] add up to 1 (Koyomi Araragi or Tsubasa Hanekawa, need<=2)
  // from your Outside Area to your hand.
  reg['UA42BT-MGS-1-053'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && /Koyomi Araragi|Tsubasa Hanekawa/.test(c.name || '') && (c.need || 0) <= 2, `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 084/085 Mayoi Hachikuji — reactive to being placed in the Remove Area by your own effect.
  // (Skipped: no hook distinguishes "moved to Remove Area by your own effect" from any other
  // route — same new reactive-trigger category noted since IMS.)

  // 092 "I LOVE YOU" — place the top 2 cards of your deck to the Outside Area. Add 1 Hitagi
  // Senjougahara from your Outside Area to your hand.
  reg['UA42BT-MGS-1-092'] = {
    async onEvent(G, p, card) {
      const n = Math.min(2, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Hitagi Senjougahara'), `${card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 093 "Devil's Left Hand" — raid a Suruga Kanbaru from your Outside Area, placing this card
  // face-down under the raided character. (Skipped: an Event card acting as a raider is a genuinely
  // different mechanic from normal character-based raiding — too complex/unique for one card.)

  // 095 "I Bit My Tongue" — draw 2. (Skipped: the reactive "placed to Remove Area by your own
  // effect" clause — same new gap category as 084/085.)
  reg['UA42BT-MGS-1-095'] = { async onEvent(G, p, card) { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); } };

  // 098 "Did Something Good Happen?" — choose 1 character on your area, it gains "[When
  // Attacking][1/turn] draw up to 3" this turn.
  reg['UA42BT-MGS-1-098'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedAttackDrawN = 3; log(`${card.name}: ${t.card.name} ได้รับ "โจมตีแล้วจั่ว 3 ใบ" เทิร์นนี้`); }
    },
  };

  // 099 "Rainy Devil" — choose 1 enemy Front Line character with BP 5000 or less and retire it.
  // (Skipped: the self-referential AP-cost reduction, and the granted face-down-replacement clause
  // on a raided Suruga Kanbaru — both narrow/complex for this single card.)
  reg['UA42BT-MGS-1-099'] = { async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); } };

  // 103 Kiss-Shot Acerola-Orion Heart-Under-Blade — [On Play] you may retire 1 other character on
  // your area; if you did, draw 2.
  reg['UA42ST-MGS-1-103'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่น?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 109 "Cram School Ruins" (Field) — [On Play] place the top 3 cards of your deck to the Outside
  // Area.
  reg['UA42ST-MGS-1-109'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const sent = p.deck.splice(0, n);
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
  };

  // 111 Nadeko Sengoku — [On Play] look at the top 2, keep any number on top (any order),
  // remainder to the Outside Area.
  reg['UA42ST-MGS-1-111'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 112 Suruga Kanbaru — [On Play][When in Energy Line] set self active. @[Main][Rest] choose 1
  // Suruga Kanbaru with 2 or fewer face-down cards under it and in Raid State on your area, place
  // the top card of your deck face-down under it, it gains "[When Attacking] draw up to 1" this turn.
  reg['UA42ST-MGS-1-112'] = {
    async onPlay(G, p, unit) { if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Suruga Kanbaru') && u.counters.length <= 2 && u.under.length);
      if (!targets.length || !p.deck.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Suruga Kanbaru`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const no = p.deck.shift();
      t.counters.push(no);
      t._grantedAttackDraw = true;
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ ${t.card.name} — ได้รับ "โจมตีแล้วจั่ว 1 ใบ" เทิร์นนี้`);
    },
  };
})();
