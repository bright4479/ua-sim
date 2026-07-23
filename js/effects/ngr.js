// ══════════ UA SIM — NGR effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasNameSub(p, sub) { return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(sub)); }
  function countOtherTrait(owner, self, trait) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
  }
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

  // 004 Ririsa Amano — passive: on your turn, +500 BP for each own Trait:Cosplay character in Raid
  // State on your Front Line. @[On Play] may pay 1 AP; if did, draw 1. (Skipped: the paired
  // "place 1 card from hand, raid up to 1 Trait:Cosplay card from hand" — a manual-trigger-Raid
  // mechanic, same recurring gap noted for several cards this session.)
  reg['UA33BT-NGR-1-004'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const n = p.front.filter(u => (u.card.traits || '').includes('Cosplay') && u.under && u.under.length).length;
      return n * 500;
    },
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อจั่ว 1 ใบ?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (v && Engine.payAP(p, 1)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 006 Masamune Okumura — [On Play] add any number of yellow character cards with different
  // names (need≤1) from your Outside Area to your hand.
  reg['UA33BT-NGR-1-006'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 1;
      const seenNames = new Set();
      const idxs = [];
      p.sideline.forEach((no, i) => { const c = byNo(no); if (pred(c) && !seenNames.has(c.name)) { seenNames.add(c.name); idxs.push(i); } });
      idxs.sort((a, b) => b - a).forEach(i => { const no = p.sideline.splice(i, 1)[0]; p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); });
    },
  };

  // 010/011 Aria Kisaki — [Skipped]: "choose 1 other character that changed from active to rest
  // BY YOUR EFFECT this turn, set it active" / the matching passive condition — there is no
  // project-wide tracker for "rested by an effect (not battle/stand)" distinct from a normal rest;
  // building one would mean retroactively touching many already-shipped scripts across other
  // series that self-rest a character, not worth it for 2 cards.

  // 015 Mikari Tachibana — when this character attacks and is blocked (approximated as "a
  // defender was determined" — covers both a real blocker and a sniped target), may draw 1; if
  // did, place 1 card from hand to the Outside Area.
  async function mikariTachibanaBlocked(p, atk) {
    const v = await p.controller.chooseOption(p, `${atk.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`);
    await H.discardFromHand(p);
  }
  reg['UA33BT-NGR-1-015'] = {
    async onWinBattle(G, p, atk) { await mikariTachibanaBlocked(p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemyOwner, defender, self) { if (atk === self) await mikariTachibanaBlocked(p, atk); },
  };

  // 016 Mikari Tachibana — [Main][Discard1][1/turn] self +500 BP this turn. (Skipped: the granted
  // "opponent must block this attack with a character BP≤3000 if possible" forced-block clause —
  // no supporting hook, same recurring gap noted for several cards.)
  reg['UA33BT-NGR-1-016'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 036 "I Will Recover!!" — draw 2. If your Life is 6 or less, may place 1 card without [Trigger]
  // from hand to your Life Area.
  reg['UA33BT-NGR-1-036'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (p.life.length > 6) return;
      const idx = p.hand.findIndex(no => !byNo(no)?.trigger);
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางการ์ดจากมือเข้า Life Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.life.push(no);
      log(`${card.name}: วาง ${byNo(no)?.name} เข้า Life Area`);
    },
  };

  // 037 "The Sparkle Of Clear Ice" — choose 1 enemy Front Line character BP≤5000, rest it (the
  // next time it would set to active it doesn't), or retire it instead if own character with
  // "Nonoa" in its name.
  reg['UA33BT-NGR-1-037'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (hasNameSub(p, 'Nonoa')) {
        const v = await p.controller.chooseOption(p, `${card.name}: retire แทนวางนอน?`, [{ label: 'retire', value: true }, { label: 'วางนอนตามปกติ', value: false }]);
        if (v) { await Engine.sidelineUnit(enemy, t, 'effect'); return; }
      }
      t.rested = true;
      t.skipNextStand = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน และจะไม่ stand ครั้งถัดไป`);
    },
  };

  // 040 "Look At Me!" — choose 1 own character +2000 BP this turn. (Skipped: the granted
  // "opponent must block this attack if possible" clause on Mikari-named characters — forced-block
  // gap, same class noted elsewhere.)
  reg['UA33BT-NGR-1-040'] = { async onEvent(G, p, card) { await H.buffOwnCharacter(p, 2000); } };

  // 042 Ririsa Amano — [Skipped]: "[Main][When in Outside Area] ... add this card from your
  // Outside Area to your hand" — an ability activated while the card itself sits in the Outside
  // Area (sideline), not on the battlefield; `Effects.onMain` only fires for units on the field, so
  // there's no hook for this, same gap noted for KIN-1-079.

  // 043 Masamune Okumura — [On Play] choose 1 of: fetch up to 1 character card with "Ririsa" in
  // its name from Outside Area to hand; or choose up to 1 own character with "Ririsa" in its name
  // and set it active.
  reg['UA33BT-NGR-1-043'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดึง "Ririsa" จาก Outside Area', value: 'a' }, { label: 'Active "Ririsa" บนสนาม', value: 'b' },
      ]);
      if (v === 'a') await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.name || '').includes('Ririsa'), `${unit.card.name}: เลือกการ์ด "Ririsa"`);
      else {
        const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Ririsa'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก "Ririsa"`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      }
    },
  };

  // 049 Forosso (Courtesan Costume) / Magino — [On Play] choose 1 of: free-play 1 blue Ogino from
  // hand or Outside Area to Energy Line rested; or choose up to 1 own Ogino on Energy Line, it
  // gains "this character will not be retired" this turn.
  reg['UA33BT-NGR-1-049'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ลง Ogino สีน้ำเงินจากมือ/Outside Area', value: 'a' }, { label: 'Ogino บน Energy Line ไม่ถูก retire เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') {
        const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.name || '').includes('Ogino');
        let idx = p.hand.findIndex(no => pred(byNo(no)));
        if (idx >= 0) { await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); return; }
        idx = p.sideline.findIndex(no => pred(byNo(no)));
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      } else {
        const targets = p.energy.filter(u => (u.card.name || '').includes('Ogino'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Ogino บน Energy Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.noRetire = true; log(`${unit.card.name}: ${t.card.name} จะไม่ถูก retire เทิร์นนี้`); }
      }
    },
  };

  // 050 Liliel Angel Airborne Corps / Ririsa — [Main][Frontline][1/turn] only if own character with
  // "753♡" in its name and BP≥4500 on your Front Line: self +1500 BP this turn.
  reg['UA33BT-NGR-1-050'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.front.some(u => (u.card.name || '').includes('753♡') && Engine.bp(u) >= 4500)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1500;
      log(`${unit.card.name}: +1500 BP เทิร์นนี้`);
    },
  };

  // 060 Ariel Angel Airborne Corps / Aria — [On Play] only if another own Trait:Angel Airborne
  // Corps card on area: look at top 2, place any number on top (any order), remainder to the bottom.
  reg['UA33BT-NGR-1-060'] = {
    async onPlay(G, p, unit) {
      if (countOtherTrait(p, unit, 'Angel Airborne Corps') < 1) return;
      await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
    },
  };

  // 062 Nokiel Angel Airborne Corps / Nonoa — [Main][Rest][Discard1][Retire this card] free-play 1
  // blue Trait:Angel Airborne Corps card (not this card, need≤1) from Outside Area to area rested.
  reg['UA33BT-NGR-1-062'] = {
    async onMain(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('Angel Airborne Corps') && c.no !== unit.no && (c.need || 0) <= 1;
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      await Engine.sidelineUnit(p, unit, 'effect');
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือกการ์ดจาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // 063 Nokiel Angel Airborne Corps / Nonoa — passive: if 3+ other Trait:Angel Airborne Corps on
  // area, +1 generated energy and +1000 BP on your turn.
  reg['UA33BT-NGR-1-063'] = {
    genMod(unit, p) { return countOtherTrait(p, unit, 'Angel Airborne Corps') >= 3 ? 1 : 0; },
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && countOtherTrait(p, unit, 'Angel Airborne Corps') >= 3) ? 1000 : 0; },
  };

  // 064 Nokiel Angel Airborne Corps / Nonoa — tiered by distinct-named Trait:Angel Airborne Corps
  // on your Front Line: 2+ [On Play] fetch a non-Nonoa character (need≤3) from Outside Area to
  // hand, discard 1 if added; 3+ [Your Turn] +500 BP; 4+ [On Block] choose up to 1 other own
  // character +500 BP this turn.
  function distinctAngelAirborneOnFront(p) {
    return new Set(p.front.filter(u => (u.card.traits || '').includes('Angel Airborne Corps')).map(u => u.card.name)).size;
  }
  reg['UA33BT-NGR-1-064'] = {
    async onPlay(G, p, unit) {
      if (distinctAngelAirborneOnFront(p) < 2) return;
      const added = await H.fetchFromSideline(p, c => c && c.type === 'Character' && !(c.name || '').includes('Nonoa') && (c.need || 0) <= 3, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
      if (added) await H.discardFromHand(p);
    },
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && distinctAngelAirborneOnFront(p) >= 3) ? 500 : 0; },
    async onBlock(G, p, unit) { if (distinctAngelAirborneOnFront(p) >= 4) await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); },
  };

  // 066 Miriella Angel Airborne Corps/Mikari — [Main][Rest] choose 1 Trait:Angel Airborne Corps
  // character on your Front Line and 1 on your Energy Line, swap their positions.
  reg['UA33BT-NGR-1-066'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const frontTargets = p.front.filter(u => (u.card.traits || '').includes('Angel Airborne Corps'));
      const energyTargets = p.energy.filter(u => (u.card.traits || '').includes('Angel Airborne Corps'));
      if (!frontTargets.length || !energyTargets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid1 = await p.controller.chooseOwnCharacter(p, frontTargets, `${unit.card.name}: เลือก character บน Front Line`, true);
      const t1 = frontTargets.find(x => x.uid === uid1);
      const uid2 = await p.controller.chooseOwnCharacter(p, energyTargets, `${unit.card.name}: เลือก character บน Energy Line`, true);
      const t2 = energyTargets.find(x => x.uid === uid2);
      if (!t1 || !t2) return;
      p.front[p.front.indexOf(t1)] = t2;
      p.energy[p.energy.indexOf(t2)] = t1;
      log(`${unit.card.name}: สลับตำแหน่ง ${t1.card.name} กับ ${t2.card.name}`);
    },
  };

  // 067 Miriella Angel Airborne Corps/Mikari — tiered by distinct-named Trait:Angel Airborne Corps
  // on your Front Line: 2+ [Main][Pay1AP][1/turn] choose own character +1000 BP this turn; 3+
  // [When Attacking] draw 1, place 1 from hand to Outside Area; 4+ [On Play][When in Frontline] set
  // self active.
  reg['UA33BT-NGR-1-067'] = {
    async onPlay(G, p, unit) {
      if (p.front.includes(unit) && distinctAngelAirborneOnFront(p) >= 4) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onMain(G, p, unit) {
      if (distinctAngelAirborneOnFront(p) < 2) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
    },
    async onAttack(G, p, unit) {
      if (distinctAngelAirborneOnFront(p) >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 068 Liliel Angel Airborne Corps / Ririsa — [On Play] choose up to 1 other own Trait:Angel
  // Airborne Corps character, +1000 BP this turn.
  reg['UA33BT-NGR-1-068'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Angel Airborne Corps'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Angel Airborne Corps`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 069 Liliel Angel Airborne Corps / Ririsa — [On Play] if 3+ other Trait:Angel Airborne Corps on
  // area, reveal the top card of your deck and add it to hand; if it's not Trait:Angel Airborne
  // Corps, place 1 card from hand to Outside Area.
  reg['UA33BT-NGR-1-069'] = {
    async onPlay(G, p, unit) {
      if (countOtherTrait(p, unit, 'Angel Airborne Corps') < 3 || !p.deck.length) return;
      const no = p.deck.shift();
      p.hand.push(no);
      const c = byNo(no);
      log(`${unit.card.name}: เปิด ${c?.name} เข้ามือ`);
      if (!(c?.traits || '').includes('Angel Airborne Corps')) await H.discardFromHand(p);
    },
  };

  // 078 "First Event" — choose 1 own character +2000 BP this turn. Choose up to 1 of your AP cards
  // and set it to active.
  reg['UA33BT-NGR-1-078'] = { async onEvent(G, p, card) { await H.buffOwnCharacter(p, 2000); await H.apUntap(p, 1); } };

  // 079 "We're Serious" — choose 1 enemy Front Line character with BP ≤ (own Trait:Angel Airborne
  // Corps card count × 1000) and retire it.
  reg['UA33BT-NGR-1-079'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Angel Airborne Corps')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // UAPR-NGR-P-001 Mikari Tachibana — [On Play] only if own character with "Ririsa" in its name:
  // look at top 5, reveal up to 1 Trait:Cosplay card among them and add it to hand, remainder to
  // the bottom; if the added card doesn't have "Mikari" in its name, place 1 card from hand to
  // Outside Area.
  reg['UAPR-NGR-P-001'] = {
    async onPlay(G, p, unit) {
      if (!hasNameSub(p, 'Ririsa')) return;
      const taken = await H.lookTopAndTake(p, 5, c => (c.traits || '').includes('Cosplay'), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.length && !(byNo(taken[0])?.name || '').includes('Mikari')) await H.discardFromHand(p);
    },
  };

  // UAPR-NGR-P-002 753♡ — [On Play] draw 1. Add up to 1 Trait:Cosplay card with "753" in its name
  // from Outside Area to hand.
  reg['UAPR-NGR-P-002'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Cosplay') && (c.name || '').includes('753'), `${unit.card.name}: เลือกการ์ด "753" จาก Outside Area`);
    },
  };

  // UAPR-NGR-P-003 Liliel Angel Airborne Corps / Ririsa — [On Play] choose 1 of Mikari/Nonoa/Aria;
  // look at the top 7, reveal up to 1 Trait:Angel Airborne Corps card with the chosen name and add
  // it to hand, remainder to the bottom; if added, place 1 card from hand to Outside Area.
  reg['UAPR-NGR-P-003'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือกชื่อ`, [
        { label: 'Mikari', value: 'Mikari' }, { label: 'Nonoa', value: 'Nonoa' }, { label: 'Aria', value: 'Aria' },
      ]);
      const taken = await H.lookTopAndTake(p, 7, c => (c.traits || '').includes('Angel Airborne Corps') && (c.name || '').includes(v), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };
})();
