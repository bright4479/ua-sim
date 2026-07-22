// ══════════ UA SIM — Yu Yu Hakusho (YYH) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  async function debuffEnemyFrontMin(p, minBp, delta) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= minBp);
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู (BP≥${minBp}) รับ ${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }

  // UAPR-YYH-P-001 Toguro (Younger Brother) — [Main][Frontline][1/turn] retire 1 other own
  // character; if did, draw 1 and self gains front-line energy generation this turn, and this
  // character may attack this turn (its "can only attack if a character was retired from your
  // field by your effect this turn" gate, now wired via the `canAttack` hook added in the HIQ
  // round). (Still skipped: the "cannot block characters with BP 3500 or less" static blocking
  // restriction — no conditional-block engine hook exists for that direction yet.)
  reg['UAPR-YYH-P-001'] = {
    canAttack(p, unit) { return unit._retiredByEffectTurn === Engine.G.turn; },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อื่นให้ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      unit._retiredByEffectTurn = Engine.G.turn;
      Engine.draw(p, 1);
      unit.tempFrontGen = true;
      log(`${unit.card.name}: จั่ว 1 ใบ และผลิต energy บน Front Line ได้เทิร์นนี้`);
    },
  };

  // UAPR-YYH-P-003 Kurama — when raided on, if you have ≤3 cards in hand, draw 1. @[On Play] may
  // place 1 card from hand to Outside Area; if did, choose 1 other own character +2000 BP this turn.
  reg['UAPR-YYH-P-003'] = {
    async onRaided(G, p) { if (p.hand.length <= 3) { Engine.draw(p, 1); log(`Kurama ถูก Raid: จั่ว 1 ใบ`); } },
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
    },
  };

  // 007 Karasu — [Main][Rest][1/turn] gated on enemy Front Line having a character BP≤2000: draw
  // 1, place 1 card from hand to the Outside Area.
  reg['YYH-1-007'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      if (!enemy.front.some(u => u.card.type === 'Character' && Engine.bp(u) <= 2000)) { p.controller.notify?.('ไม่มีเป้าหมายศัตรู'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 011 Sakyo — choose 1 of: (a) if a character was retired this turn, free-play 1 purple
  // character (need≤2, ap1) from hand rested; (b) may return 1 own character (need≤2) to hand; if
  // did, choose up to 1 other own character +2000 BP this turn.
  reg['YYH-1-011'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (Engine.G.retiredThisTurn) opts.push({ label: 'ลง character สีม่วง (Energy≤2, AP1) จากมือ (rested)', value: 'a' });
      opts.push({ label: 'คืน character (Energy≤2) กลับมือ เพื่อ buff ตัวอื่น', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      } else {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.need || 0) <= 2);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character (Energy≤2) กลับมือ');
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        await Engine.returnUnitToHand(p, t);
        log(`${unit.card.name}: ${t.card.name} กลับมือ`);
        await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
      }
    },
  };

  // 014 Jin — passive: on your turn, if your opponent's Front Line has space (<4), +1000 BP.
  reg['YYH-1-014'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return Engine.opponentOf(p).front.length < 4 ? 1000 : 0;
    },
  };

  // 017 Seiryu — [On Play] choose up to 1 enemy Front Line character with BP≥1500, -1000 BP this turn.
  reg['YYH-1-017'] = { async onPlay(G, p, unit) { await debuffEnemyFrontMin(p, 1500, -1000); } };

  // 023 Toguro (Younger) — [Main][1/turn] retire 1 other own character; if did, self +1000 BP this turn.
  reg['YYH-1-023'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อื่นให้ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 024 Toguro (Younger) — [On Play] may retire 1 other own character; if did, draw 2.
  reg['YYH-1-024'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่น?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อื่นให้ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 027 Bui — "cannot be rested, moved or returned to the hand by your opponent's effects" now
  // handled generically (approximated as kw.untargetable).

  // 029 Dark Tournament (Field) — "Play this Field in active." (kw.entersActive, generic) @[Main]
  // [Rest this card] choose 1 own character, +1000 BP this turn.
  reg['YYH-1-029'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 030 Tornado Fist — choose up to 1 enemy Front Line character BP≤5000, move to Energy Line; if
  // own Jin on area, draw 1.
  reg['YYH-1-030'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(enemy, t, 'energy');
      }
      if (H.hasCardNamed(p, 'Jin')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 031 Trace-Eyes — your opponent places 1 card from their hand to the Outside Area; if a
  // Character Card was placed by this effect, draw 1.
  reg['YYH-1-031'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      if (!enemy.hand.length) return;
      const i = await enemy.controller.chooseCardFromHand(enemy, `${card.name}: เลือกการ์ดจากมือไป Outside Area (ถูกบังคับ)`);
      if (i == null) return;
      const no = enemy.hand.splice(i, 1)[0];
      enemy.sideline.push(no);
      log(`${card.name}: ${enemy.name} ส่ง ${byNo(no)?.name} จากมือไป Outside Area`);
      if (byNo(no)?.type === 'Character') { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 033 "I won't do it" — choose up to 2 of your AP Cards and set them to active.
  reg['YYH-1-033'] = { async onEvent(G, p, card) { await H.apUntap(p, 2); } };

  // 034 Rainbow Cyclone — look at the top 3 cards of your deck (7 instead if own Beautiful Demon
  // Fighter Suzuki). Reveal up to 1 Character Card, Event Card and Field Card among them and add
  // them to your hand, remaining to the bottom of the deck.
  reg['YYH-1-034'] = {
    async onEvent(G, p, card) {
      const n = H.hasCardNamed(p, 'Beautiful Demon Fighter Suzuki') ? 7 : 3;
      const cnt = Math.min(n, p.deck.length);
      if (!cnt) return;
      const revealed = p.deck.splice(0, cnt);
      for (const type of ['Character', 'Event', 'Field']) {
        const idx = revealed.findIndex(no => byNo(no)?.type === type);
        if (idx >= 0) {
          const no = revealed.splice(idx, 1)[0];
          p.hand.push(no);
          log(`${card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
        }
      }
      p.deck.push(...revealed);
    },
  };

  // 036 Urameshi Yusuke — [On Play] choose 1 own character, place the top card of your deck
  // face-down under it.
  reg['YYH-1-036'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length || !p.deck.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character รับการ์ดคว่ำ`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ ${t.card.name}`); }
    },
  };

  // 037 Urameshi Yusuke — [Main][1/turn] choose 1 of: self +1 green generated energy until the
  // start of your next turn; or self gains front-line energy generation until the start of your next turn.
  reg['YYH-1-037'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1 energy generation (สีเขียว) จนถึงต้นเทิร์นหน้า', value: 'gen' },
        { label: 'ผลิต energy บน Front Line ได้ จนถึงต้นเทิร์นหน้า', value: 'front' },
      ]);
      if (v === 'gen') { unit.genPersist += 1; log(`${unit.card.name}: +1 energy generation จนถึงต้นเทิร์นหน้า`); }
      else { unit.frontGenPersist = true; log(`${unit.card.name}: ผลิต energy บน Front Line ได้จนถึงต้นเทิร์นหน้า`); }
    },
  };

  // 039 Kurama — [Main][1/turn] choose 1 of: self +1500 BP this turn; or self gains front-line
  // energy generation until the start of your next turn.
  reg['YYH-1-039'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1500 BP เทิร์นนี้', value: 'bp' },
        { label: 'ผลิต energy บน Front Line ได้ จนถึงต้นเทิร์นหน้า', value: 'front' },
      ]);
      if (v === 'bp') { unit.bpMod += 1500; log(`${unit.card.name}: +1500 BP เทิร์นนี้`); }
      else { unit.frontGenPersist = true; log(`${unit.card.name}: ผลิต energy บน Front Line ได้จนถึงต้นเทิร์นหน้า`); }
    },
  };

  // 042 Kuwabara Kazuma — [On Play] choose up to 1 enemy Front Line character with BP lower than
  // the highest BP among your OTHER characters, rest it.
  reg['YYH-1-042'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) return;
      const highest = Math.max(...others.map(u => Engine.bp(u)));
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) < highest);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP<${highest})`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 045 Genkai — [On Play] draw 1 and add up to 1 green character (need≤3, ap1; need≤4 instead if
  // own Genkai with BP≥4000) from your Outside Area to your hand.
  reg['YYH-1-045'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const maxNeed = [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Genkai') && Engine.bp(u) >= 4000) ? 4 : 3;
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= maxNeed && (c.ap || 0) === 1, `${unit.card.name}: เลือก character สีเขียว (Energy≤${maxNeed}, AP1) จาก Outside Area`);
    },
  };

  // 046 Genkai — [On Play] choose up to 1 character on your Energy Line with required energy of 2
  // or less and set it to active.
  reg['YYH-1-046'] = {
    async onPlay(G, p, unit) {
      const targets = p.energy.filter(u => u.rested && u.card.type === 'Character' && (u.card.need || 0) <= 2);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Energy Line (Energy≤2) ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 050 Koenma — [On Play][When in Energy Line] set this character to active. @[Main][Rest][1/turn]
  // place the top card of your deck face-down under this character. (Skipped: the passive
  // "Choose 1 of the following -> Choose 2 of the following" meta-effect-modifying reactive — the
  // same class of meta text-replacement effect already flagged unscriptable for OPM's Tatsumaki.)
  reg['YYH-1-050'] = {
    async onPlay(G, p, unit) {
      if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: เป็น Active (ลงที่ Energy Line)`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`);
    },
  };

  // 052 Juri — [On Play] if own Koto on area, choose up to 1 other own character +1000 BP this turn.
  reg['YYH-1-052'] = {
    async onPlay(G, p, unit) {
      if (H.hasCardNamed(p, 'Koto')) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 057 Botan — choose 1 of: buff up to 1 other own character +1000 BP this turn; or if an own
  // character has BP≥5000, draw 1.
  reg['YYH-1-057'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'character อื่น +1000 BP เทิร์นนี้', value: 'a' }];
      if ([...p.front, ...p.energy].some(u => Engine.bp(u) >= 5000)) opts.push({ label: 'จั่ว 1 ใบ (มี character BP≥5000)', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 058 Botan — choose 1 of: look at the top 2 cards, keep any number on top (in any order),
  // remaining to the bottom; or reveal the top card and add it to hand — if it's not Yusuke
  // Urameshi, place 1 card from hand to the Outside Area.
  reg['YYH-1-058'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 2 ใบ (จัดเรียง)', value: 'a' }, { label: 'เปิดการ์ดบนสุด 1 ใบเข้ามือ', value: 'b' },
      ]);
      if (v === 'a') {
        const n = Math.min(2, p.deck.length);
        if (!n) return;
        const revealed = p.deck.splice(0, n);
        const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกใบที่จะวางไว้บนสุด`, null, revealed.length);
        const keepSet = new Set(keepIdxs);
        const keep = [], toBottom = [];
        revealed.forEach((no, i) => (keepSet.has(i) ? keep : toBottom).push(no));
        p.deck.unshift(...keep);
        p.deck.push(...toBottom);
        log(`${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
      } else {
        if (!p.deck.length) return;
        const no = p.deck.shift();
        p.hand.push(no);
        log(`${unit.card.name}: เปิด ${byNo(no)?.name} เข้ามือ`);
        if (!(byNo(no)?.name || '').includes('Yusuke Urameshi')) await H.discardFromHand(p);
      }
    },
  };

  // 063 Selection Meeting (Field) — "Play this Field in active." (kw.entersActive, generic)
  // @[Main][Rest][1/turn] choose 1 character on your Energy Line with required energy of 2 or less
  // and set it to active.
  reg['YYH-1-063'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = p.energy.filter(u => u.rested && u.card.type === 'Character' && (u.card.need || 0) <= 2);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Energy Line (Energy≤2) ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 066 Spirit Sword — choose 1 own character, +1000 BP this turn (+[Sniper] this turn if it's
  // Kazuma Kuwabara). (Skipped: the granted "when this character attacks and wins the battle,
  // fetch+play a green character from your Outside Area" clause — a one-off granted on-win-fetch
  // hook that would only ever serve this one card.)
  reg['YYH-1-066'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000;
      log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      if ((t.card.name || '').includes('Kazuma Kuwabara')) { t.tempSnipe = true; log(`${card.name}: ${t.card.name} ได้ [Sniper] เทิร์นนี้`); }
    },
  };

  // 067 Spirit Reflection Blast — add up to 1 <Genkai> with AP cost of 1 from your Outside Area to
  // your hand; then if you and your opponent have the same generated energy, choose up to 1 of
  // your AP cards and set it to active. (Skipped: the "or raid it on a character" alternative —
  // `Engine.raidCard` only supports raiding from hand, not from the Outside Area/sideline, and
  // extending it would only ever serve this one card.)
  reg['YYH-1-067'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Genkai') && (c.ap || 0) === 1, `${card.name}: เลือก Genkai (AP1) จาก Outside Area`);
      const myGen = Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0);
      const oppGen = Object.values(Engine.energyGen(Engine.opponentOf(p))).reduce((a, b) => a + b, 0);
      if (myGen === oppGen) await H.apUntap(p, 1);
    },
  };

  // 069 Urameshi Yusuke — passive: on your turn, if you used an Event Card this turn, +1000 BP.
  reg['YYH-1-069'] = { bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._eventsUsedThisTurn) ? 1000 : 0; } };

  // 071 Kurama — [Main][Frontline][Discard 1][1/turn] self +1000 BP this turn.
  reg['YYH-1-071'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 073 Kurama — "Play this character in active." (kw.entersActive, generic) @[On Play] draw cards
  // until you have 3 cards in your hand.
  reg['YYH-1-073'] = {
    async onPlay(G, p, unit) {
      let n = 0;
      while (p.hand.length < 3 && p.deck.length && n < 10) { Engine.draw(p, 1); n++; }
      if (n) log(`${unit.card.name}: จั่วจนมือครบ 3 ใบ (${n} ใบ)`);
    },
  };

  // 076 Kuwabara Kazuma — choose 1 of: choose up to 1 enemy Field Card with generated energy ≤1
  // and retire it; or if your hand has ≤2 cards, draw 1.
  reg['YYH-1-076'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const fieldTargets = enemy.energy.filter(u => u.card.type === 'Field' && (u.card.gen || 0) <= 1 && !u.kw.untargetable && !u.tempUntargetable);
      const opts = [];
      if (fieldTargets.length) opts.push({ label: 'Retire Field ศัตรู (gen≤1)', value: 'a' });
      if (p.hand.length <= 2) opts.push({ label: 'จั่ว 1 ใบ (มือ≤2)', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseEnemyCharacter(p, fieldTargets, `${unit.card.name}: เลือก Field ศัตรู`, true);
        const t = fieldTargets.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(enemy, t, 'effect');
      } else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 081 Hiei — passive: on your turn, +1000 BP for each Event Card you used this turn.
  reg['YYH-1-081'] = { bpBonus(p, unit) { return Engine.G.players[Engine.G.active] === p ? (p._eventsUsedThisTurn || 0) * 1000 : 0; } };

  // 082 Hiei — [When Attacking] draw 1 and place 1 card from hand to the Outside Area (draw 1 only,
  // if you used 2+ Event Cards this turn).
  reg['YYH-1-082'] = {
    async onAttack(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if ((p._eventsUsedThisTurn || 0) < 2) await H.discardFromHand(p);
    },
  };

  // 090 Yukina — [Main][Rest] gated on having used an Event Card this turn: look at the top card
  // of your deck, place it on top or bottom. (Skipped: the paired "[On Play] reduce the AP cost of
  // the next Event Card you use by 1" clause — a one-shot "next card played" consumable discount
  // that the AP-cost pipeline has no hook for; not worth new infra for one card.)
  reg['YYH-1-090'] = {
    async onMain(G, p, unit) {
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อนในเทิร์นนี้'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 093 Rose Whip Thorn Wheel (Field) — [Main][1/turn] only the turn this Field was played: choose
  // 1 own Kurama on your Front Line, give it "opponent cannot choose this character" this turn
  // (approximated as tempUntargetable, which lasts through this turn rather than the printed
  // "until the start of your next turn" — a slight under-grant, simpler than adding a new
  // longer-duration untargetable-persist field for one card).
  reg['YYH-1-093'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลง Field นี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => (u.card.name || '').includes('Kurama'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Kurama บน Front Line'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kurama`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ห้ามถูกเลือกโดยศัตรูเทิร์นนี้`); }
    },
  };

  // 095 Seed of the Death Plant — choose up to 1 enemy Front Line character and rest it; if own
  // Kurama on area, draw 1.
  reg['YYH-1-095'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p, null);
      if (H.hasCardNamed(p, 'Kurama')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 098 "Don't underestimate the power of the Jagan" — choose up to 1 own character +1000 BP this
  // turn; choose up to 1 of your AP cards and set it to active.
  reg['YYH-1-098'] = {
    async onEvent(G, p, card) { await H.buffOwnCharacter(p, 1000); await H.apUntap(p, 1); },
  };

  // 105 Kuwabara Kazuma — [When Attacking] may send 1 face-down card from under this character to
  // the Outside Area; if did, self +1000 BP this turn (uses the shared `unit.counters` convention —
  // the face-down card is planted by other cards' effects, e.g. Urameshi Yusuke-036).
  reg['YYH-1-105'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area เพื่อ +1000 BP?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 107 Hiei — [On Play] may place the top card of your deck face-down under this character.
  // @[When Attacking] may send 1 face-down card from under this character to the Outside Area; if
  // did, draw 1.
  reg['YYH-1-107'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ตัวเอง`); }
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area เพื่อจั่ว 1 ใบ?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 108 Sarayashiki Junior High (Field) — [Main][Rest][1/turn] draw 1, place 1 card from hand to
  // the Outside Area.
  reg['YYH-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 112 Hiei — [On Play] if you used an Event Card this turn, draw 1.
  reg['YYH-1-112'] = {
    async onPlay(G, p, unit) {
      if (p._eventsUsedThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };
})();
