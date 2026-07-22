// ══════════ UA SIM — Kinnikuman (KIN) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // count OTHER units on owner's area (both lines) matching a trait, optionally also requiring
  // their own printed effect text to contain a given bracket marker (e.g. "[When Attacking]") —
  // this series' "Justice Chojin cards that themselves have [When Attacking]" synergy condition.
  function countOtherTraitWithMarker(owner, self, trait, marker) {
    return [...owner.front, ...owner.energy].filter(u => u !== self &&
      (u.card.traits || '').toLowerCase().includes(trait.toLowerCase()) &&
      (!marker || (u.card.effect || '').includes(marker))).length;
  }
  function countOtherTrait(owner, self, trait) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
  }
  function countTrait(owner, trait) {
    return [...owner.front, ...owner.energy].filter(u => (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
  }

  // 002 Ashuraman — [Main][Frontline][1/turn] gated on own Energy Line having ≤2 cards: self
  // +1000 BP until the start of your next turn.
  reg['UA39BT-KIN-1-002'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.energy.length > 2) { p.controller.notify?.('Energy Line ต้องมีไม่เกิน 2 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpPersist += 1000;
      log(`${unit.card.name}: +1000 BP จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 003 Atlantis — [On Retire] if 3+ other Trait:Devil Chojin on your area, draw 1.
  reg['UA39BT-KIN-1-003'] = {
    async onSideline(G, p, unit) {
      if (countOtherTrait(p, unit, 'Devil Chojin') >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 005 Sunshine — [Main][Frontline][1/turn] same energy-line gate as Ashuraman: self +500 BP and
  // "also generates energy on the Front Line" during this turn.
  reg['UA39BT-KIN-1-005'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.energy.length > 2) { p.controller.notify?.('Energy Line ต้องมีไม่เกิน 2 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 500;
      unit.tempFrontGen = true;
      log(`${unit.card.name}: +500 BP และผลิต energy บน Front Line ได้เทิร์นนี้`);
    },
  };

  // 006 Stereo-Cassette King — [Main][Discard 1][1/turn]: this turn, this character's BP becomes
  // (required energy of the discarded card) x500 — implemented as a live bpBonus offsetting the
  // printed base BP up to that target value.
  reg['UA39BT-KIN-1-006'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือไป Outside Area`);
      if (idx == null) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      const need = byNo(no)?.need || 0;
      unit._bpSetTurn = Engine.G.turn;
      unit._bpSetValue = need * 500;
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area — BP กลายเป็น ${unit._bpSetValue} เทิร์นนี้`);
    },
    bpBonus(p, unit) { return unit._bpSetTurn === Engine.G.turn ? (unit._bpSetValue - (unit.card.bp || 0)) : 0; },
  };

  // 007 Springman — [On Play] look at top 2, may keep any number on top of the deck (in any
  // order), the rest to the Outside Area — equivalent to "place up to 2 of them to Outside Area,
  // remaining back on top" (H.lookTopAndDiscard already returns unpicked cards to the top).
  reg['UA39BT-KIN-1-007'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
  };

  // 010 Buffaloman — passive: if 3+ other Trait:Devil Chojin on your area, +1 generated energy.
  reg['UA39BT-KIN-1-010'] = {
    genMod(unit, p) { return countOtherTrait(p, unit, 'Devil Chojin') >= 3 ? 1 : 0; },
  };

  // 014 Black Hole — [Skipped]: a hand-level reactive ("when this card is placed from your hand
  // to the Outside Area, you may bury it under a character") that fires while the card is still
  // inert in the hand zone (not yet a placed unit) — the Effects hook system is unit-based and has
  // no hand-level trigger surface, so this can't be wired in without new hand-watcher infra that
  // would only ever serve this one card.

  // 022 Turboman — [On Play] if own life ≤5, may pay 1 AP: choose 1 enemy Front Line character,
  // +1000 BP (or +2000 if life ≤2) this turn; then if its BP is now ≥5500, retire it.
  reg['UA39BT-KIN-1-022'] = {
    async onPlay(G, p, unit) {
      if (p.life.length > 5) return;
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อใช้ effect?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const delta = p.life.length <= 2 ? 2000 : 1000;
      t.bpMod += delta;
      log(`${unit.card.name}: ${t.card.name} +${delta} BP เทิร์นนี้`);
      if (Engine.bp(t) >= 5500) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 023 Dalmatiman — [On Play] look at top 2, place up to 1 Trait:Perfect Large Numbers among them
  // to the Outside Area, remaining back on top.
  reg['UA39BT-KIN-1-023'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Perfect Large Numbers'));
    },
  };

  // 027 Peek-a-Boo — passive: on your turn, if your opponent has 2+ [Special]-trigger cards in
  // their Outside Area, +2500 BP.
  reg['UA39BT-KIN-1-027'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const enemy = Engine.opponentOf(p);
      const n = enemy.sideline.filter(no => byNo(no)?.trigger === 'Special').length;
      return n >= 2 ? 2500 : 0;
    },
  };

  // 032 Perfect Large Numbers (Field) — tiered abilities based on the count of DIFFERENT-NAMED
  // Trait:Perfect Large Numbers characters on your area: 3+ On Play draw 1; 5+ Main(Rest+Retire
  // this card) set 1 such character active; 7+ Main(Rest, 1/turn) retire 1 enemy Front Line
  // character with BP≤3000.
  function countDistinctPerfectLargeNumbers(p) {
    return new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Perfect Large Numbers')).map(u => u.card.name)).size;
  }
  reg['UA39BT-KIN-1-032'] = {
    async onPlay(G, p, unit) {
      if (countDistinctPerfectLargeNumbers(p) >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
    async onMain(G, p, unit) {
      const n = countDistinctPerfectLargeNumbers(p);
      const opts = [];
      if (n >= 5 && !unit.rested) opts.push({ label: '[Rest+Retire this card] Active ตัว Trait:Perfect Large Numbers', value: 'active' });
      if (n >= 7 && !unit.rested && unit._usedTurn !== Engine.G.turn) opts.push({ label: '[Rest][1/turn] Retire ศัตรู BP≤3000', value: 'retire' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'active') {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Perfect Large Numbers'));
        if (!targets.length) return;
        unit.rested = true;
        await Engine.sidelineUnit(p, unit, 'effect');
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active', true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      } else if (v === 'retire') {
        unit._usedTurn = Engine.G.turn;
        unit.rested = true;
        await H.retireEnemyFront(p, 3000);
      }
    },
  };

  // 033 "If you support the devil, you'll never become a good adult" — play up to 1 Trait:Devil
  // Chojin card (need≤2) from Outside Area to your area rested; if it was Atlantis, set it active
  // and grant "at the end of the Attack Phase, retire this character" + [Sniper] this turn.
  // (The end-of-Attack-Phase self-retire grant has no hook to fire on — approximated by just the
  // active+Sniper portion, which is the part actually actionable this turn.)
  reg['UA39BT-KIN-1-033'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Devil Chojin') && (c.need || 0) <= 2;
      const i = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือกการ์ด Trait:Devil Chojin (Energy≤2) จาก Outside Area`, pred);
      if (i == null) return;
      const no = p.sideline[i];
      const u = await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false });
      if (u && (u.card.name || '').includes('Atlantis')) {
        u.rested = false;
        u.tempSnipe = true;
        log(`${card.name}: ${u.card.name} เป็น Active และได้ [Sniper] เทิร์นนี้`);
      }
    },
  };

  // 035 Spring Bazooka — choose 1 of: (own Buffaloman required) enemy Front Line character -5000
  // BP this turn; or draw 1 + choose up to 1 own Springman +2500 BP and [Sniper] this turn.
  reg['UA39BT-KIN-1-035'] = {
    async onEvent(G, p, card) {
      const opts = [];
      if (H.hasCardNamed(p, 'Buffaloman')) opts.push({ label: 'Buffaloman: ศัตรู -5000 BP เทิร์นนี้', value: 'a' });
      opts.push({ label: 'จั่ว 1 ใบ + Springman +2500 BP และ [Sniper]', value: 'b' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod -= 5000; log(`${card.name}: ${t.card.name} -5000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
      } else {
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
        const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Springman'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Springman`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2500; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +2500 BP และ [Sniper] เทิร์นนี้`); }
      }
    },
  };

  // 037 Zero's Tragedy — choose 1 enemy Front Line character (BP≤5000), place it at the bottom of
  // their deck. If 3+ own Trait:Perfect Chojin on your area, draw 1. (Skipped: the middle clause —
  // opponent may free-play a need-0 character from their own Outside Area with its [On Play]
  // suppressed — `Engine.playCardFromZone` always fires [On Play] unconditionally, and this exact
  // "forced-opponent-play + on-play-suppression" combination was already flagged as unsupported
  // back in the TSK round, so it's left undone here too rather than firing an incorrect [On Play].)
  reg['UA39BT-KIN-1-037'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          enemy.front.splice(enemy.front.indexOf(t), 1);
          enemy.deck.push(t.no);
          log(`${card.name}: ${t.card.name} ถูกส่งไปใต้เด็คของ ${enemy.name}`);
        }
      }
      if (countTrait(p, 'Perfect Chojin') >= 3) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 038 "I'll let you choose your opponent!" — look at top 7, opponent randomly picks 1, rest to
  // the bottom of the deck; reveal the chosen card: if Trait:Perfect Large Numbers, play it to your
  // area rested, otherwise add it to your hand.
  reg['UA39BT-KIN-1-038'] = {
    async onEvent(G, p, card) {
      const n = Math.min(7, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pick = Math.floor(Math.random() * revealed.length);
      const chosenNo = revealed.splice(pick, 1)[0];
      p.deck.push(...revealed);
      const c = byNo(chosenNo);
      if (c && (c.traits || '').includes('Perfect Large Numbers')) {
        p.deck.unshift(chosenNo);
        await Engine.playCardFromZone(p, chosenNo, 'deck', { line: 'energy', active: false });
      } else {
        p.hand.push(chosenNo);
        log(`${card.name}: เพิ่ม ${c?.name} เข้ามือ`);
      }
    },
  };

  // 048 Kinnikuman — "This card cannot be played to the Front Line." now handled generically via
  // kw.cannotEnterFront.

  // 049 Kinnikuman — [Main][Frontline][Rest][1/turn] choose 1 enemy Front Line character, give it
  // "cannot block" this turn.
  reg['UA39BT-KIN-1-049'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้ "ห้าม block" เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noBlock = true; log(`${unit.card.name}: ${t.card.name} ห้าม block เทิร์นนี้`); }
    },
  };

  // 053 Geronimo — [Main][Frontline][Rest][1/turn] place 1 card from the top of the deck face-down
  // under this character. @[When Attacking] may send 1 face-down card from under this character to
  // the Outside Area; if did, choose up to 1 enemy Front Line character, move it to the Energy Line
  // and give it "cannot move" until the start of your next turn.
  reg['UA39BT-KIN-1-053'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`);
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = unit.counters.shift();
      p.sideline.push(no);
      log(`${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area`);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.moveUnitFree(enemy, t, 'energy');
      t.tempCannotMove = true;
      const dueTurn = Engine.G.turn + 2;
      Engine.scheduleDelayedAction(dueTurn, () => { t.tempCannotMove = false; });
      log(`${unit.card.name}: ${t.card.name} ย้ายไป Energy Line และห้ามเคลื่อนที่จนถึงต้นเทิร์นหน้าของคุณ`);
    },
  };

  // 060 Mito-kun — passive: if own Kinnikuman on your Front Line, +1 generated energy. @[Main]
  // [Rest][Discard 1] choose 1 own Kinnikuman on your area and move it to the other line.
  reg['UA39BT-KIN-1-060'] = {
    genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Kinnikuman')) ? 1 : 0; },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kinnikuman'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Kinnikuman บนสนาม'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Kinnikuman ให้ย้าย line', true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 061 Brocken Jr. — [When Attacking] if 2+ other Trait:Justice Chojin characters with a printed
  // [When Attacking] ability are on your area, draw 1 and place 1 card from your hand to the
  // Outside Area.
  reg['UA39BT-KIN-1-061'] = {
    async onAttack(G, p, unit) {
      if (countOtherTraitWithMarker(p, unit, 'Justice Chojin', '[When Attacking]') >= 2) {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        await H.discardFromHand(p);
      }
    },
  };

  // 062 Brocken Jr. — [When Attacking] look at top 3, reveal up to 1 <Red Rain of Berlin> among
  // them and add it to hand, remaining to the bottom; if added, place 1 card from hand to the
  // Outside Area.
  reg['UA39BT-KIN-1-062'] = {
    async onAttack(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 3, c => (c.name || '').includes('Red Rain of Berlin'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 066 Ramenman — [When Attacking] if 2+ other Trait:Justice Chojin characters with [When
  // Attacking] on your area, this character gets +1000 BP this turn.
  reg['UA39BT-KIN-1-066'] = {
    async onAttack(G, p, unit) {
      if (countOtherTraitWithMarker(p, unit, 'Justice Chojin', '[When Attacking]') >= 2) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 068 Robin Mask — [When Attacking] if 4+ other Trait:Justice Chojin characters with [When
  // Attacking] on your area, this character gets +1500 BP this turn.
  reg['UA39BT-KIN-1-068'] = {
    async onAttack(G, p, unit) {
      if (countOtherTraitWithMarker(p, unit, 'Justice Chojin', '[When Attacking]') >= 4) { unit.bpMod += 1500; log(`${unit.card.name}: +1500 BP เทิร์นนี้`); }
    },
  };

  // 070 Robin Mask — [Main][Frontline][1/turn] choose 1 enemy Front Line character with BP≥1500,
  // it gets -1000 BP this turn. @[When Attacking] may place 1 card from hand to Outside Area; if
  // did, this character gets +2000 BP this turn.
  reg['UA39BT-KIN-1-070'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
    async onAttack(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ +2000 BP?`);
      if (discarded) { unit.bpMod += 2000; log(`${unit.card.name}: +2000 BP เทิร์นนี้`); }
    },
  };

  // 073 Three Attributes Chojin Non-Aggression Pact — [Skipped]: "at the end of your Attack Phase,
  // retire any character that attacked this turn" needs an end-of-Attack-Phase hook that doesn't
  // exist in the engine yet (same recurring gap noted across GMR/KMY/KMR/OPM this session).

  // 076 Screw Driver — choose 1 own character, it gets +500 BP this turn (tiered up to +1000/
  // +2000/+6000 for a Warsman meeting escalating conditions), and set 1 of your AP cards to active.
  reg['UA39BT-KIN-1-076'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) {
        const isWarsman = (t.card.name || '').includes('Warsman');
        const highNeed = isWarsman && (t.card.need || 0) >= 4;
        const raided = highNeed && t.under && t.under.length;
        const delta = raided ? 6000 : highNeed ? 2000 : isWarsman ? 1000 : 500;
        t.bpMod += delta;
        log(`${card.name}: ${t.card.name} +${delta} BP เทิร์นนี้`);
      }
      await H.apUntap(p, 1);
    },
  };

  // 078 Furinkazan — choose 1 character on your Front Line, it gets +2000 BP this turn; if own
  // Kinnikuman is on your area, it also gains [Impact +1] this turn.
  reg['UA39BT-KIN-1-078'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if (H.hasCardNamed(p, 'Kinnikuman')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 079 Red Rain of Berlin — draw 1; if there's a red Brocken Jr. on your Front Line, choose up to
  // 1 enemy Front Line character with BP≥2500, it gets -2000 BP this turn. (Skipped: the paired
  // "[Main][When in Outside Area][Discard 1][1/turn] fetch this card from Outside Area to hand"
  // clause — a genuinely new "ability usable while sitting in the Outside Area" activation surface
  // that no other card this session has needed, not worth new infra for one card.)
  reg['UA39BT-KIN-1-079'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const hasRedBrocken = p.front.some(u => (u.card.name || '').includes('Brocken Jr.') && u.card.color === 'Red');
      if (!hasRedBrocken) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 2500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≥2500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 2000; log(`${card.name}: ${t.card.name} -2000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };
})();
