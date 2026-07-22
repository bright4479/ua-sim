// ══════════ UA SIM — To Love-Ru (TLR) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countOtherChars(owner, self) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && u.card.type === 'Character').length;
  }

  // 005 Tearju Lunatique — [On Play] free-play 1 yellow Konjiki no Yami (need≤3, ap1) from hand rested.
  reg['UA45BT-TLR-1-005'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.name || '').includes('Konjiki no Yami') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 006 Nana Astar Deviluke — [On Play] may place 1 card from hand to Outside Area; if did, fetch
  // up to 1 Mea Kurosaki from Outside Area to hand.
  reg['UA45BT-TLR-1-006'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.fetchFromSideline(p, c => c && (c.name || '').includes('Mea Kurosaki'), `${unit.card.name}: เลือก Mea Kurosaki จาก Outside Area`);
    },
  };

  // 008 Ryouko Mikado — [On Play] place all cards from your hand to the Outside Area, draw 5.
  reg['UA45BT-TLR-1-008'] = {
    async onPlay(G, p, unit) {
      const n = p.hand.length;
      p.sideline.push(...p.hand.splice(0));
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดในมือทั้งหมด (${n} ใบ) ไป Outside Area`);
      Engine.draw(p, 5); log(`${unit.card.name}: จั่ว 5 ใบ`);
    },
  };

  // 009 Shizu Murasame — [On Play] may place 1 card from hand to Outside Area; if did, choose up
  // to 1 enemy Front Line character BP≤4000 and rest it.
  reg['UA45BT-TLR-1-009'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.restEnemyFront(p, 4000);
    },
  };

  // 018 Run Elsie Jewelria — [When Attacking] if own Kyouko Kirisaki on Front Line, draw 1.
  reg['UA45BT-TLR-1-018'] = {
    async onAttack(G, p, unit) {
      if (p.front.some(u => (u.card.name || '').includes('Kyouko Kirisaki'))) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 021 Mea Kurosaki — [On Play] if own Nemesis on area, choose up to 1 enemy Front Line character
  // BP≥1500, -1000 BP this turn.
  reg['UA45BT-TLR-1-021'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Nemesis')) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 027 Konjiki no Yami — passive: on your turn, if own Mikan Yuuki on area, +1000 BP. @[On Play]
  // may place 1 card from hand to Outside Area; if did, set self active.
  reg['UA45BT-TLR-1-027'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && H.hasCardNamed(p, 'Mikan Yuuki')) ? 1000 : 0; },
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 036 Lunatique (Field) — passive: if own Konjiki no Yami on Front Line, +1 generated energy.
  reg['UA45BT-TLR-1-036'] = {
    genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Konjiki no Yami')) ? 1 : 0; },
  };

  // 038 Psycho Dive — draw 2. Your opponent reveals all cards in their hand (informational only —
  // no further mechanical consequence to script).
  reg['UA45BT-TLR-1-038'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const enemy = Engine.opponentOf(p);
      const names = enemy.hand.map(no => byNo(no)?.name).join(', ');
      log(`${card.name}: ${enemy.name} เปิดเผยมือ: ${names || '(ไม่มีการ์ด)'}`);
    },
  };

  // 039 Dark Matters — choose 1 enemy Front Line character BP≤3000 (or ≤5000 if own Nemesis) and
  // place it into the (genuinely permanent) Remove Area.
  reg['UA45BT-TLR-1-039'] = {
    async onEvent(G, p, card) {
      const limit = H.hasCardNamed(p, 'Nemesis') ? 5000 : 3000;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= limit);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤${limit})`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const line = enemy.front.includes(t) ? enemy.front : enemy.energy;
      line.splice(line.indexOf(t), 1);
      enemy.removal.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป Removal Area (ถาวร)`);
    },
  };

  // 041 Mikan's Home Cooking — all own Front Line characters +1000 BP this turn. Draw 1.
  reg['UA45BT-TLR-1-041'] = {
    async onEvent(G, p, card) {
      for (const u of p.front) u.bpMod += 1000;
      log(`${card.name}: character บน Front Line ทั้งหมด +1000 BP เทิร์นนี้`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 042 Sayaka Arai — [On Play][On Retire] look at the top card of your deck, place it on top or bottom.
  reg['UA45BT-TLR-1-042'] = {
    async onPlay(G, p, unit) { await H.scryTop(p, ['top', 'bottom']); },
    async onSideline(G, p, unit) { await H.scryTop(p, ['top', 'bottom']); },
  };

  // 047 Kotegawa Yui — [On Play] choose up to 1 enemy Front Line character BP≤2000 (or ≤3000 if 5+
  // other own cards on area), give it "cannot block this turn".
  reg['UA45BT-TLR-1-047'] = {
    async onPlay(G, p, unit) {
      const limit = countOtherChars(p, unit) >= 5 ? 3000 : 2000;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= limit);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤${limit})`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noBlock = true; log(`${unit.card.name}: ${t.card.name} ห้าม block เทิร์นนี้`); }
    },
  };

  // 050 Sairenji Haruna — [On Play] if there are 5+ other characters on your area, draw 1.
  reg['UA45BT-TLR-1-050'] = {
    async onPlay(G, p, unit) {
      if (countOtherChars(p, unit) >= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 051 Sairenji Haruna — [On Play] free-play 1 red character (need≤2, ap1) from hand rested.
  reg['UA45BT-TLR-1-051'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 052 Sairenji Haruna — [On Play] choose up to 1 other own character +1000 BP this turn (or
  // +2000 if 5+ other cards on your area).
  reg['UA45BT-TLR-1-052'] = {
    async onPlay(G, p, unit) {
      const delta = countOtherChars(p, unit) >= 5 ? 2000 : 1000;
      await H.buffOwnCharacter(p, delta, { excludeUnit: unit });
    },
  };

  // 059 Nana Astar Deviluke — [On Retire] if own Momo Belia Deviluke on area, draw 1.
  reg['UA45BT-TLR-1-059'] = {
    async onSideline(G, p, unit) {
      if (H.hasCardNamed(p, 'Momo Belia Deviluke')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 063 Aya Fujisaki — [On Play] choose up to 1 other own character +1000 BP this turn; if the
  // chosen character is Saki Tenjouin, set it to active.
  reg['UA45BT-TLR-1-063'] = {
    async onPlay(G, p, unit) {
      const t = await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      if (t && (t.card.name || '').includes('Saki Tenjouin')) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 068 Momo Belia Deviluke — [On Play] if own Nana Astar Deviluke on area, draw 1.
  reg['UA45BT-TLR-1-068'] = {
    async onPlay(G, p, unit) {
      if (H.hasCardNamed(p, 'Nana Astar Deviluke')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 072 Lala Satalin Deviluke — [On Play] look at the top 2 cards of your deck, place any number
  // of them on top or bottom of your deck in any order (each card independently chooses a pile).
  reg['UA45BT-TLR-1-072'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const top = [], bottom = [];
      for (const no of revealed) {
        const c = byNo(no);
        const v = await p.controller.chooseOption(p, `${unit.card.name}: ${c?.name} — วางไว้บนสุดหรือใต้เด็ค?`, [
          { label: '⬆ บนสุด', value: 'top' }, { label: '⬇ ใต้เด็ค', value: 'bottom' },
        ]);
        (v === 'bottom' ? bottom : top).push(no);
      }
      p.deck.unshift(...top);
      p.deck.push(...bottom);
      log(`${unit.card.name}: ดูการ์ดบนสุด ${n} ใบ`);
    },
  };

  // 077 Sainan High School (Field) — [Main][Rest+Retire this card] draw 1, then free-play 1 red
  // character (need≤3, ap1) from hand rested.
  reg['UA45BT-TLR-1-077'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 080 Paradise Project — look at the top 5 cards of your deck, reveal up to a total of 3
  // Character Cards with each different name among them and add them to your hand, remaining to
  // the bottom of the deck.
  reg['UA45BT-TLR-1-080'] = {
    async onEvent(G, p, card) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const takenNames = new Set();
      const taken = [];
      for (let i = 0; i < revealed.length && taken.length < 3; i++) {
        const c = byNo(revealed[i]);
        if (c && c.type === 'Character' && !takenNames.has(c.name)) { takenNames.add(c.name); taken.push(i); }
      }
      taken.sort((a, b) => b - a).forEach(i => { const no = revealed.splice(i, 1)[0]; p.hand.push(no); log(`${card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); });
      p.deck.push(...revealed);
    },
  };
})();
