// ══════════ UA SIM — Tokyo Ghoul (TKG) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  async function sidelineToDeckTop(p, predicate, title) {
    const i = await p.controller.chooseCardFromSideline(p, title, predicate);
    if (i == null) return null;
    const no = p.sideline.splice(i, 1)[0];
    p.deck.unshift(no);
    log(`${p.name}: ${byNo(no)?.name} จาก Outside Area ไปบนสุดของเด็ค`);
    return no;
  }

  // 003 Kishou Arima — passive: if there is a character on your opponent's Front Line, or your
  // opponent's character was retired this turn (approximated via the global retired-this-turn
  // counter), +1 generated energy.
  reg['UA47BT-TKG-1-003'] = { genMod(unit, p) { const enemy = Engine.opponentOf(p); return (enemy.front.length > 0 || Engine.G.retiredThisTurn > 0) ? 1 : 0; } };

  // 018 Akira Mado — [On Play][When in Energy Line] if 6+ Trait:Mado Squad cards on your area, set
  // this character active. (Skipped: the granted "next [Main][Pay 1 AP] doesn't need to pay" clause
  // on another card — would require every other card's own onMain to check a shared waiver flag.)
  reg['UA47BT-TKG-1-018'] = { async onPlay(G, p, unit) { if (p.energy.includes(unit) && [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Mado Squad')).length >= 6) { unit.rested = false; log(`${unit.card.name}: Active`); } } };

  // 022 Ginshi Shirazu — [Main][Frontline][Pay 1 AP][1/turn] choose 1 of: set self active; or if
  // active, draw 1.
  reg['UA47BT-TKG-1-022'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
      unit._usedTurn = Engine.G.turn;
      const opts = [{ label: 'ตั้งตัวเองเป็น Active', value: 'a' }];
      if (!unit.rested) opts.push({ label: 'จั่ว 1 ใบ', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { unit.rested = false; log(`${unit.card.name}: Active`); }
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 024 Tooru Mutsuki — [On Play] choose up to 1 other Trait:Mado Squad, +1000 BP this turn.
  // @[Main][Pay 1 AP][1/turn] same effect.
  async function mutsuki024(p, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Mado Squad'));
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Mado Squad`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
  }
  reg['UA47BT-TKG-1-024'] = {
    async onPlay(G, p, unit) { await mutsuki024(p, unit); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
      unit._usedTurn = Engine.G.turn;
      await mutsuki024(p, unit);
    },
  };

  // 025 Saiko Yonebayashi — [Main][Pay 1 AP][1/turn] self +3000 BP this turn.
  reg['UA47BT-TKG-1-025'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 3000; log(`${unit.card.name}: +3000 BP เทิร์นนี้`);
    },
  };

  // 026 Saiko Yonebayashi — passive: if you used a [Main][Pay 1 AP] ability this turn, +2000 BP.
  // (Skipped: the "gain another card's [Main][Pay 1 AP]" ability-borrowing clause, and the
  // "[Discard 1] instead of [Pay 1 AP]" cost-substitution clause — both narrow/complex for 1 card.)
  reg['UA47BT-TKG-1-026'] = { bpBonus(p, unit) { return (p._paidApByEffectThisTurn || 0) > 0 ? 2000 : 0; } };

  // 027 CCG Headquarters (Field) — [1/turn] when your Trait:CCG character attacks and wins the
  // battle, draw 1.
  reg['UA47BT-TKG-1-027'] = {
    async onAnyWinBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn) return;
      if (!(atk.card.traits || '').includes('CCG')) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 030 "Suzuya-senpai never abandons his subordinates" — choose 1 of: free-play 1 Hanbe Abara
  // (fulfilled energy, ap1) from your Outside Area rested; or look at the top 6, reveal up to 1
  // Juuzou Suzuya among them and add it to hand, remainder to the bottom (untap 1 AP if there is a
  // Hanbe Abara on your area).
  reg['UA47BT-TKG-1-030'] = {
    async onEvent(G, p, card) {
      const opts = [{ label: 'ลง Hanbe Abara จาก Outside Area', value: 'a' }, { label: 'ดูการ์ดบนสุด 6 ใบ (Juuzou Suzuya)', value: 'b' }];
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Hanbe Abara') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      } else {
        await H.lookTopAndTake(p, 6, c => (c.name || '').includes('Juuzou Suzuya'), 1, `${card.name}: ดูการ์ดบนสุด 6 ใบ`);
        if (H.hasCardNamed(p, 'Hanbe Abara')) await H.apUntap(p, 1);
      }
    },
  };

  // 034 Itori — [On Play] look at the top 3, place up to 1 to the Outside Area, remainder to the top.
  reg['UA47BT-TKG-1-034'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 036 Uta — [On Play] choose up to 1 enemy Front Line character with BP 1500 or more, -1000 BP
  // this turn. @[Main][Frontline][Pay 1 AP][1/turn] same effect.
  async function uta036(p, unit) { await H.debuffEnemyAny(p, -1000, { min: 1500 }); }
  reg['UA47BT-TKG-1-036'] = {
    async onPlay(G, p, unit) { await uta036(p, unit); },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
      unit._usedTurn = Engine.G.turn;
      await uta036(p, unit);
    },
  };

  // 039 Ken Kaneki — [Main][Frontline][1/turn] only if this character is active: look at the top of
  // your deck, place it on top or the Outside Area.
  reg['UA47BT-TKG-1-039'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 043 Rize Kamishiro — [On Retire] choose up to 1 Ken Kaneki without a face-down card under it,
  // place this card face-down under it.
  reg['UA47BT-TKG-1-043'] = {
    async onSideline(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Ken Kaneki') && !u.counters.length);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Ken Kaneki`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); t.counters.push(unit.no); log(`${unit.card.name}: วางคว่ำใต้ ${t.card.name}`); }
    },
  };

  // 044 Rize Kamishiro — [Main][When in Outside Area] activation from the sideline. (Skipped: the
  // recurring "activate ability from Outside Area" gap, same as KIN-1-079/NGR-1-042.)

  // 046 Touka Kirishima — [Main][Frontline][1/turn] rest 1 active Ken Kaneki (need<=4) on your
  // Front Line; if you did, +2000 BP this turn.
  reg['UA47BT-TKG-1-046'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Ken Kaneki') && (u.card.need || 0) <= 4);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Ken Kaneki`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      unit.bpMod += 2000; log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 051 Shuu Tsukiyama — [On Play][1/turn] you may place 2+ cards from your Outside Area to the
  // Remove Area; if you did and there are 10+ cards in your Remove Area, set self active. @[On
  // Retire] you may place 2 other Shuu Tsukiyama cards from your Outside Area to the Remove Area;
  // if you did, add this card to your hand.
  reg['UA47BT-TKG-1-051'] = {
    async onPlay(G, p, unit) {
      if (p.sideline.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ด 2+ ใบจาก Outside Area ไป Remove Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      let moved = 0;
      for (;;) {
        if (!p.sideline.length) break;
        const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือกการ์ด (${moved + 1})`, null);
        if (idx == null) break;
        p.removal.push(p.sideline.splice(idx, 1)[0]); moved++;
        if (moved >= 2) { const more = await p.controller.chooseOption(p, 'วางเพิ่ม?', [{ label: 'วางเพิ่ม', value: true }, { label: 'พอแล้ว', value: false }]); if (!more) break; }
      }
      if (moved >= 2 && p.removal.length >= 10) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onSideline(G, p, unit) {
      const others = p.sideline.filter(no => (byNo(no)?.name || '').includes('Shuu Tsukiyama'));
      if (others.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Shuu Tsukiyama 2 ใบไป Remove Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 2; i++) { const idx = p.sideline.findIndex(no => (byNo(no)?.name || '').includes('Shuu Tsukiyama')); if (idx < 0) break; p.removal.push(p.sideline.splice(idx, 1)[0]); }
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
    },
  };

  // 055 Hinami Fueguchi — [On Play] choose 1 of: draw 1, place 1 from hand to the Outside Area; or
  // if it's your turn, choose up to 1 other character, +1000 BP this turn.
  reg['UA47BT-TKG-1-055'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }];
      if (isYourTurn(p)) opts.push({ label: 'character อื่น +1000 BP เทิร์นนี้', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 059 Renji Yomo — passive: if 10+ total cards in your Outside Area and Remove Area, +1000 BP.
  reg['UA47BT-TKG-1-059'] = { bpBonus(p, unit) { return (p.sideline.length + p.removal.length) >= 10 ? 1000 : 0; } };

  // 060 Ghoul Restaurant (Field) — [On Play] place up to 2 cards from your Remove Area to your
  // Outside Area. @[Main][Rest] only if there is a Shuu Tsukiyama on your area: place 2 cards from
  // your Outside Area to the Remove Area; if you did, draw 1, place 1 card from hand to the
  // Outside Area.
  reg['UA47BT-TKG-1-060'] = {
    async onPlay(G, p, unit) {
      for (let i = 0; i < 2; i++) { if (!p.removal.length) break; const no = p.removal.pop(); p.sideline.push(no); log(`${unit.card.name}: ${byNo(no)?.name} จาก Remove Area ไป Outside Area`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!H.hasCardNamed(p, 'Shuu Tsukiyama')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (p.sideline.length < 2) return;
      unit.rested = true;
      for (let i = 0; i < 2; i++) { if (!p.sideline.length) break; const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือกการ์ด (${i + 1}/2)`, null); if (idx == null) break; p.removal.push(p.sideline.splice(idx, 1)[0]); }
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 063 "That's fine... Kaneki-kun..." — look at the top 2, add up to 1 to hand, remainder to the
  // Outside Area. Reduce the AP cost of the next Ken Kaneki (need>=5) used this turn by 1.
  reg['UA47BT-TKG-1-063'] = {
    async onEvent(G, p, card) {
      await H.lookTopAndTake(p, 2, () => true, 1, `${card.name}: ดูการ์ดบนสุด 2 ใบ`);
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Ken Kaneki') && (c.need || 0) >= 5, apDelta: -1 };
      log(`${card.name}: Ken Kaneki (Energy 5+) ใบถัดไป ลด AP cost 1`);
    },
  };

  // 064 "Pervert? How disappointing..." — [1/turn] draw 1. If there is a Shuu Tsukiyama on your
  // area, untap 1 AP.
  reg['UA47BT-TKG-1-064'] = {
    async onEvent(G, p, card) {
      if (p._usedPervertTurn === Engine.G.turn) return;
      p._usedPervertTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (H.hasCardNamed(p, 'Shuu Tsukiyama')) await H.apUntap(p, 1);
    },
  };

  // 067 Eto — [On Play] if your Life is 4-5, draw 1 and place 1 card from hand to the Outside Area;
  // if your Life is 3 or less, just draw 1.
  reg['UA47BT-TKG-1-067'] = {
    async onPlay(G, p, unit) {
      if (p.life.length >= 4 && p.life.length <= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else if (p.life.length <= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 070 Ken Kaneki — [Main][1/turn] add 1 of your Life cards to hand; if you did, +1000 BP this
  // turn. @[On Retire] if retired by battle and your Life is 3 or less, you may place 1 card from
  // hand to the Outside Area; if you did, choose up to 1 enemy Front Line character and rest it.
  reg['UA47BT-TKG-1-070'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const no = await H.addLifeToHand(p);
      if (no == null) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onSideline(G, p, unit, reason) {
      if (reason !== 'battle' || p.life.length > 3) return;
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      await H.restEnemyFront(p);
    },
  };

  // 074 Ayato Kirishima — [On Play] if your Life is 6+, draw 1 and place 1 card from hand to the
  // Outside Area; if your Life is 5 or less, just draw 1.
  reg['UA47BT-TKG-1-074'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (p.life.length >= 6) await H.discardFromHand(p);
    },
  };

  // 079 Noro — [On Retire] choose 1 of: you may add 1 Life card to hand, if you did, play this card
  // to your area rested; or you may place 2 cards from hand to the Outside Area, if you did, add
  // this card to your hand.
  reg['UA47BT-TKG-1-079'] = {
    async onSideline(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'เพิ่มการ์ด Life เข้ามือ + ลงสนามใหม่', value: 'a' }, { label: 'วางการ์ด 2 ใบจากมือ + กลับเข้ามือ', value: 'b' },
      ]);
      if (v === 'a') {
        const no = await H.addLifeToHand(p);
        if (no == null) return;
        await Engine.playCardFromZone(p, unit.no, 'sideline', { line: 'energy', active: false });
      } else {
        if (p.hand.length < 2) return;
        for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: วางการ์ดจากมือ (${i + 1}/2)`); if (idx == null) return; p.sideline.push(p.hand.splice(idx, 1)[0]); }
        const si = p.sideline.indexOf(unit.no);
        if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
      }
    },
  };

  // 086 Yukinori Shinohara — [Main][Frontline][1/turn] choose 1 Juuzou Suzuya, +1000 BP this turn.
  reg['UA47BT-TKG-1-086'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Juuzou Suzuya'));
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Juuzou Suzuya`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 094 Akira Mado — [On Play] if 4+ Trait:CCG cards on your area, draw 1, place 1 from hand to the
  // Outside Area. (Skipped: the [Discard 1][1/turn] "set active" gate on "changed active to rest by
  // your effect" — the recurring tracker gap.)
  reg['UA47BT-TKG-1-094'] = {
    async onPlay(G, p, unit) {
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('CCG')).length >= 4) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 098 "... you're too big" — choose 1 Koutarou Amon, +3000 BP and [Impact +1] this turn.
  reg['UA47BT-TKG-1-098'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Koutarou Amon'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Koutarou Amon`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 3000; t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} +3000 BP และ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 100 "Owl Suppression Operation" — choose 1 enemy Front Line character with BP <= (Trait:CCG
  // cards on your area x1000) and retire it.
  reg['UA47BT-TKG-1-100'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('CCG')).length; await H.retireEnemyFront(p, n * 1000); } };

  // 105 Hideyoshi Nagachika — [On Play] place up to 1 Ken Kaneki (need<=4) from your Outside Area
  // on top of your deck.
  reg['UA47ST-TKG-1-105'] = { async onPlay(G, p, unit) { await sidelineToDeckTop(p, c => c && (c.name || '').includes('Ken Kaneki') && (c.need || 0) <= 4, `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 107 Anteiku (Field) — [On Play] choose up to 1 character and set it active. @[Main][Rest+Retire]
  // choose 1 character and set it active.
  reg['UA47ST-TKG-1-107'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested);
      await Engine.sidelineUnit(p, unit, 'effect');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };
})();
