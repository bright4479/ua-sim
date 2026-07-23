// ══════════ UA SIM — Synduality Noir (SYN) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

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

  // 004 Maria — [Main][Rest+Retire this card] add up to 1 Trait:Magus or Trait:Cradle Coffin card
  // from your Outside Area to your hand.
  reg['SYN-1-004'] = {
    async onMain(G, p, unit) {
      const pred = c => c && ((c.traits || '').includes('Magus') || (c.traits || '').includes('Cradle Coffin'));
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือกการ์ด Trait:Magus/Cradle Coffin จาก Outside Area`);
    },
  };

  // 011 Ellie — passive: on your turn, if a character returned to your hand this turn, +500 BP.
  // (Skipped: the granted "when this character attacks, free-play a yellow character" clause — a
  // temporary granted onAttack ability with no supporting hook.)
  reg['SYN-1-011'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._returnedToHandThisTurn) ? 500 : 0; },
  };

  // 015 Kanata — passive: on your turn, if you played a card from your deck this turn, +500 BP.
  // @[On Play] if this character was played from the deck, set self active.
  reg['SYN-1-015'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._playedFromDeckThisTurn) ? 500 : 0; },
    async onPlay(G, p, unit) { if (unit._playedFromDeck) { unit.rested = false; log(`${unit.card.name}: Active (ลงจากเด็ค)`); } },
  };

  // 016 Kanata — [On Play] choose up to 1 enemy Front Line character and rest it; the next time it
  // would set to active, it doesn't. (Skipped: "this card in your deck may be treated as having AP
  // cost of 1" — an unusual in-deck cost override with no clear application point.)
  reg['SYN-1-016'] = {
    async onPlay(G, p, unit) {
      const t = await H.restEnemyFront(p, null);
      if (t) { t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 018 Tokio — [On Play] free-play 1 yellow character (need≤2, ap1) from hand rested.
  reg['SYN-1-018'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 023 Ange — [Main][1/turn] return 1 own character (need≤3) to hand; if did, choose 1 of: draw
  // 1+discard 1; or choose up to 1 own character +1000 BP this turn.
  reg['SYN-1-023'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.need || 0) <= 3);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character (Energy≤3) กลับมือ');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }, { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else await H.buffOwnCharacter(p, 1000);
    },
  };

  // 024 Ciel — [On Retire] choose up to 1 enemy Front Line character with [Raid], rest it
  // (regardless of Raid State).
  reg['SYN-1-024'] = {
    async onSideline(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.parseKeywords(u.card).raidTargets.length);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูที่มี [Raid]`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 028 Carrier (Kanata Tokio Machine) (Field) — [On Play] look at top 5, reveal up to 1
  // Trait:Cradle Coffin to hand, remainder bottom. @[Main][Rest] choose 1 of: move 1 own character
  // to another line; or swap positions of 1 Front Line and 1 Energy Line character.
  reg['SYN-1-028'] = {
    async onPlay(G, p, unit) { await H.lookTopAndTake(p, 5, c => (c.traits || '').includes('Cradle Coffin'), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`); },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ย้าย character 1 ใบไปอีก line', value: 'a' }, { label: 'สลับตำแหน่ง Front/Energy', value: 'b' },
      ]);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      } else {
        if (!p.front.length || !p.energy.length) return;
        const uid1 = await p.controller.chooseOwnCharacter(p, p.front, `${unit.card.name}: เลือก character บน Front Line`, true);
        const t1 = p.front.find(x => x.uid === uid1);
        const uid2 = await p.controller.chooseOwnCharacter(p, p.energy, `${unit.card.name}: เลือก character บน Energy Line`, true);
        const t2 = p.energy.find(x => x.uid === uid2);
        if (!t1 || !t2) return;
        p.front[p.front.indexOf(t1)] = t2;
        p.energy[p.energy.indexOf(t2)] = t1;
        log(`${unit.card.name}: สลับตำแหน่ง ${t1.card.name} กับ ${t2.card.name}`);
      }
    },
  };

  // 033 "Yoshiwo-chan Key Chain" — choose 1 own Front Line character +2000 BP this turn (also
  // [Impact +1] if own Ellie or Leah Lid on area).
  reg['SYN-1-033'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if (H.hasCardNamed(p, 'Ellie') || H.hasCardNamed(p, 'Leah Lid')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 036 Maria — [On Play] choose 1 of: fetch up to 1 Trait:Magus/Trait:Cradle Coffin character
  // from Outside Area to hand; or draw 2, place 1 card from hand to Outside Area.
  reg['SYN-1-036'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดึง Trait:Magus/Cradle Coffin จาก Outside Area', value: 'a' }, { label: 'จั่ว 2 ใบ + วางการ์ดจากมือไป Outside Area', value: 'b' },
      ]);
      if (v === 'a') await H.fetchFromSideline(p, c => c && c.type === 'Character' && ((c.traits || '').includes('Magus') || (c.traits || '').includes('Cradle Coffin')), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
      else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 042 Kurokamen — [When Attacking] may choose 1 or 2 enemy Front Line characters, -500 BP each
  // this turn; if did, the next time this character would set to active it doesn't.
  reg['SYN-1-042'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      let targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก character ศัตรู 1-2 ใบ รับ -500 BP?`, [{ label: 'เลือก', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      let picked = 0;
      for (let i = 0; i < 2 && targets.length; i++) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (${i + 1}/2)`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) break;
        t.bpMod -= 500;
        log(`${unit.card.name}: ${t.card.name} -500 BP เทิร์นนี้`);
        targets = targets.filter(x => x !== t);
        picked++;
        if (i === 0) { const more = await p.controller.chooseOption(p, `${unit.card.name}: เลือกอีก 1 ใบ?`, [{ label: 'เลือก', value: true }, { label: 'พอแล้ว', value: false }]); if (!more) break; }
      }
      if (picked) { unit.skipNextStand = true; log(`${unit.card.name}: จะไม่ stand ครั้งถัดไป`); }
      await Engine.checkBpZero();
    },
  };

  // 043 Kurokamen — [When Attacking] may place 1 card from hand to Outside Area; if did, choose up
  // to 1 enemy Front Line character -2000 BP this turn, and the next time this character would set
  // to active it doesn't.
  reg['SYN-1-043'] = {
    async onAttack(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod -= 2000; log(`${unit.card.name}: ${t.card.name} -2000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
      }
      unit.skipNextStand = true;
      log(`${unit.card.name}: จะไม่ stand ครั้งถัดไป`);
    },
  };

  // 048 Tokio — passive: on your turn, if you or your opponent placed a card from hand to the
  // Outside Area by an effect this turn, +1000 BP. @[On Retire] if own Mouton on area, draw 1.
  reg['SYN-1-048'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (p._placedToOutsideThisTurn || Engine.opponentOf(p)._placedToOutsideThisTurn) ? 1000 : 0;
    },
    async onSideline(G, p, unit) { if (H.hasCardNamed(p, 'Mouton')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 052 Mouton — [On Play] may place up to 2 cards from hand to Outside Area; if did, draw the
  // same number of cards placed.
  reg['SYN-1-052'] = {
    async onPlay(G, p, unit) {
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

  // 057 Ciel — [On Retire] choose 1 of: draw 2, place 1 card from hand to Outside Area; or draw 1
  // (and if it's your turn, set 1 of your AP cards to active).
  reg['SYN-1-057'] = {
    async onSideline(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 2 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }, { label: 'จั่ว 1 ใบ (+ Active AP ถ้าเป็นเทิร์นตัวเอง)', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); }
      else {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        if (Engine.G.players[Engine.G.active] === p) await H.apUntap(p, 1);
      }
    },
  };

  // 058 Schnee — [On Play] choose up to 1 own Kurokamen or Gilbow, give it "opponent cannot choose
  // this character with character effects" (approximated as tempUntargetable — a slight
  // under-duration since the printed text lasts until the start of your next turn, same
  // approximation accepted for YYH-1-093).
  reg['SYN-1-058'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => /Kurokamen|Gilbow/.test(u.card.name || ''));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kurokamen/Gilbow`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ห้ามถูกเลือกโดย character effect ของศัตรูเทิร์นนี้`); }
    },
  };

  // 061 Ideal Aircraft Carrier (Field) — [Main][Rest] only if 4+ Trait:Ideal on your area: choose
  // up to 1 enemy Front Line character -500 BP this turn.
  reg['SYN-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Ideal')).length < 4) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = true;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 500; log(`${unit.card.name}: ${t.card.name} -500 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 062 "Get rich quick" — reveal the top 3 cards, add up to 1 to hand, remainder to the bottom.
  // If the 3 revealed cards' required energy is all the same, or 3 consecutive numbers, add all 3
  // to hand instead.
  reg['SYN-1-062'] = {
    async onEvent(G, p, card) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const needs = revealed.map(no => byNo(no)?.need || 0).sort((a, b) => a - b);
      const allSame = needs.every(x => x === needs[0]);
      const consecutive = needs.length === 3 && needs[1] === needs[0] + 1 && needs[2] === needs[0] + 2;
      if (allSame || consecutive) {
        for (const no of revealed) { p.hand.push(no); log(`${card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); }
        return;
      }
      const picked = await p.controller.chooseRevealPick(p, revealed, `${card.name}: ดูการ์ดบนสุด 3 ใบ`, null, 1);
      const taken = [];
      picked.sort((a, b) => b - a).forEach(i => taken.push(revealed.splice(i, 1)[0]));
      for (const no of taken) { p.hand.push(no); log(`${card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); }
      p.deck.push(...revealed);
    },
  };

  // 063 "Energy Impact Blade" — choose 1 enemy Front Line character -3000 BP this turn (or -5000
  // instead if own (Kurokamen or Gilbow) and own Schnee).
  reg['SYN-1-063'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const upgraded = (H.hasCardNamed(p, 'Kurokamen') || H.hasCardNamed(p, 'Gilbow')) && H.hasCardNamed(p, 'Schnee');
      const delta = upgraded ? -5000 : -3000;
      t.bpMod += delta;
      log(`${card.name}: ${t.card.name} ${delta} BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 073 Alba — [On Play] may place 1 card from hand to Outside Area; if did, fetch up to 1
  // Trait:Magus character from Outside Area to hand.
  reg['SYN-1-073'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.traits || '').includes('Magus'), `${unit.card.name}: เลือก Trait:Magus จาก Outside Area`);
    },
  };

  // 077 Kanata — [Main][Frontline][1/turn] choose 1 own Daisy Ogre or Daisy Ogre Alter, [Impact +1] this turn.
  reg['SYN-1-077'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => /Daisy Ogre/.test(u.card.name || ''));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Daisy Ogre`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 079 Claudia — [On Play] this turn, if your opponent draws cards by your effect, you draw the
  // same number instead (implemented as a player-level redirect flag, checked by this file's own
  // "opponent draws" cards — 087/096).
  reg['SYN-1-079'] = {
    async onPlay(G, p, unit) {
      p._mirrorOpponentDrawThisTurn = true;
      log(`${unit.card.name}: เทิร์นนี้ ถ้าฝ่ายตรงข้ามจะจั่วจาก effect ของคุณ คุณจะจั่วแทน`);
    },
  };

  // 080 Claudia — [Main][Frontline][1/turn] only if you've drawn 2+ cards this turn: choose 1 own
  // character +1000 BP this turn.
  reg['SYN-1-080'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if ((p._drewThisTurn || 0) < 2) { p.controller.notify?.('เงื่อนไขไม่ครบ (ต้องจั่ว 2+ ใบเทิร์นนี้)'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 084 Ciel — [On Play] choose 1 other own character +1000 BP this turn.
  reg['SYN-1-084'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 086 Ciel — [On Play] choose up to 1 own Kanata, set active.
  reg['SYN-1-086'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Kanata'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kanata`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 087 Flamme — [On Play] may choose "your opponent draws 1 card." (redirected to self instead if
  // own Claudia/High tuition fees granted the mirror this turn).
  reg['SYN-1-087'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ให้ฝ่ายตรงข้ามจั่ว 1 ใบ?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      if (p._mirrorOpponentDrawThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: คุณจั่ว 1 ใบแทน (mirror)`); }
      else { Engine.draw(Engine.opponentOf(p), 1); log(`${unit.card.name}: ฝ่ายตรงข้ามจั่ว 1 ใบ`); }
    },
  };

  // 088 Flamme — [On Play] you and your opponent each draw 1 card.
  reg['SYN-1-088'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1);
      Engine.draw(Engine.opponentOf(p), 1);
      log(`${unit.card.name}: ทั้งสองฝ่ายจั่ว 1 ใบ`);
    },
  };

  // 089 Flamme — [Main][Discard1][Pay1AP][1/turn] only the turn this character was played: choose
  // up to 1 enemy Front Line character BP≤3000 and retire it. You and your opponent draw 1 card.
  reg['SYN-1-089'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length || Engine.activeAP(p) < 1) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      Engine.payAP(p, 1);
      await H.retireEnemyFront(p, 3000);
      Engine.draw(p, 1);
      Engine.draw(Engine.opponentOf(p), 1);
      log(`${unit.card.name}: ทั้งสองฝ่ายจั่ว 1 ใบ`);
    },
  };

  // 092 Mystere — [When Attacking][1/turn] choose 1 of: self +1000 BP this turn; or may place 1
  // card from hand to Outside Area, if did, choose up to 1 enemy Front Line character BP≤1500 and retire it.
  reg['SYN-1-092'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1000 BP เทิร์นนี้', value: 'a' }, { label: 'วางการ์ดจากมือ เพื่อ retire ศัตรู (BP≤1500)', value: 'b' },
      ]);
      if (v === 'a') { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else {
        const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
        if (discarded) await H.retireEnemyFront(p, 1500);
      }
    },
  };

  // 093 Maria's Lab (Field) — "Play this Field in active." (kw.entersActive, generic) @[Main][Rest]
  // choose 1 own character +1000 BP this turn.
  reg['SYN-1-093'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 094 "This heat is what you gave me" — choose 1 enemy Front Line character BP≤5000, give it
  // "cannot block this turn" (or retire it instead, if own (Kanata or Daisy Ogre) and own Ciel).
  reg['SYN-1-094'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const upgraded = (H.hasCardNamed(p, 'Kanata') || H.hasCardNamed(p, 'Daisy Ogre')) && H.hasCardNamed(p, 'Ciel');
      if (upgraded) await Engine.sidelineUnit(enemy, t, 'effect');
      else { t.noBlock = true; log(`${card.name}: ${t.card.name} ห้าม block เทิร์นนี้`); }
    },
  };

  // 096 "High tuition fees" — draw 1. If own Claudia/Flamme/Glen Shinobi on area, draw 1 more and
  // this turn, if opponent draws by your effect, you draw the same instead.
  reg['SYN-1-096'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (H.hasCardNamed(p, 'Claudia') || H.hasCardNamed(p, 'Flamme') || H.hasCardNamed(p, 'Glen Shinobi')) {
        Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`);
        p._mirrorOpponentDrawThisTurn = true;
        log(`${card.name}: เทิร์นนี้ ถ้าฝ่ายตรงข้ามจะจั่วจาก effect ของคุณ คุณจะจั่วแทน`);
      }
    },
  };

  // 103 Kanata — [On Play] may add 1 Noir from your Outside Area to hand; if did, place 1 card
  // from hand to Outside Area. If this character was played from the deck, skip the discard cost.
  reg['SYN-1-103'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && (c.name || '').includes('Noir');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      if (unit._playedFromDeck) { await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Noir จาก Outside Area`); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เพิ่ม Noir จาก Outside Area เข้ามือ?`, [{ label: 'เพิ่ม', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const added = await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Noir จาก Outside Area`);
      if (added) await H.discardFromHand(p);
    },
  };

  // 106 Noir — [On Play] look at top 2, place any number on top (any order), remainder to the
  // bottom. @[Main][Rest+Retire this card] re-activate this character's [On Play] effect.
  reg['SYN-1-106'] = {
    async onPlay(G, p, unit) { await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (จาก [Main])`);
    },
  };

  // UAPR-SYN-P-001 Noir — [On Play] may retire this character; if did, look at the top 3 cards of
  // your deck and add 1 of them to your hand (equivalent to reordering them to put the chosen one
  // on top, then revealing it — simplified to a direct pick since the reorder has no other
  // consequence), remainder back on top. If the card added fulfills its energy requirement and has
  // an AP cost of 1, you may use/play it for free instead of paying its normal cost.
  reg['UAPR-SYN-P-001'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire ตัวเอง?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`, null, 1);
      if (!picked.length) { p.deck.unshift(...revealed); return; }
      const no = revealed.splice(picked[0], 1)[0];
      p.deck.unshift(...revealed);
      const c = byNo(no);
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${c?.name} เข้ามือ`);
      if (c && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1) {
        const v2 = await p.controller.chooseOption(p, `${unit.card.name}: ใช้ ${c.name} ฟรีทันที (ไม่เสีย AP)?`, [{ label: 'ใช้', value: true }, { label: 'เก็บไว้ในมือ', value: false }]);
        if (v2) {
          if (c.type === 'Event') { p.hand.splice(p.hand.indexOf(no), 1); log(`${unit.card.name}: ใช้ ${c.name} ฟรี`); await Effects.onEvent(G, p, c); p.sideline.push(no); }
          else await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false });
        }
      }
    },
  };

  // UAPR-SYN-P-002 Kurokamen — [When Attacking][1/turn] only if own Schnee on area: may choose 1
  // other own character without [Raid] that attacked this turn; if did, the chosen character is
  // set to active. (Skipped: "this attack will not deal damage" — `unit.tempDmg`'s existing
  // truthy-OR-fallback formula in `attackPhase` has no way to represent an explicit zero distinct
  // from "unset", so it can't force an attack's damage down to 0; reworking that sentinel would
  // risk several already-shipped cards elsewhere that rely on the current fallback behavior.)
  reg['UAPR-SYN-P-002'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (!H.hasCardNamed(p, 'Schnee')) return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.attackedThisTurn > 0 && !Engine.parseKeywords(u.card).raidTargets.length);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก character อื่นที่โจมตีแล้วเทิร์นนี้?`, [{ label: 'เลือก', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      t.rested = false;
      log(`${unit.card.name}: ${t.card.name} เป็น Active`);
    },
  };

  // UAPR-SYN-P-003 Ciel — [Skipped]: "[Main][Frontline][1/turn] during this turn, the next [Main]
  // of a red Daisy Ogre loses [Pay 1 AP]" — a next-ability-activation cost discount targeting
  // ANOTHER card's [Main] ability cost specifically (as opposed to `p.pendingDiscount`, which only
  // covers play/energy/AP costs for cards being PLAYED, not activated-ability costs); not worth new
  // infra for one promo card.
})();
