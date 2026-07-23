// ══════════ UA SIM — Black Clover (BCV) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function totalGen(p) { return Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0); }
  function countOtherTrait(owner, self, trait) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
  }

  // 001 Megicula — [On Play] choose up to 1 enemy Front Line character, -1000 BP until the start
  // of your next turn.
  reg['BCV-1-001'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpPersist -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP จนถึงต้นเทิร์นหน้า`); await Engine.checkBpZero(); }
    },
  };

  // 006 Gauche Adlai — [On Play] choose up to 1 own Trait:Black Bull character, fetch a
  // same-named character card (need≤2, ap1) from Outside Area and play it rested. (Skipped: "at
  // the end of your Attack Phase, retire that character" — end-of-Attack-Phase hook gap.)
  reg['BCV-1-006'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Black Bull'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Black Bull`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '') === (t.card.name || '') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 008 Zora Ideale — [Skipped]: "[When in Frontline][1/turn] when your opponent activates
  // [Main] and another own Trait:Black Bull is on your area, draw 1" — no hook watches the
  // opponent's own [Main] activations.

  // 009 Charmy Pappitson — [On Play] choose up to 1 other own character +1000 BP this turn.
  reg['BCV-1-009'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 012 Vanessa Enoteca — [On Play] free-play 1 Trait:Black Bull purple character (need≤2, ap1;
  // need≤4 instead if 6+ other Trait:Black Bull cards on your area) from your Outside Area to your
  // area rested. (Skipped: "or raid it" alternative, same gap noted for several cards.)
  reg['BCV-1-012'] = {
    async onPlay(G, p, unit) {
      const maxNeed = countOtherTrait(p, unit, 'Black Bull') >= 6 ? 4 : 2;
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes('Black Bull') && (c.need || 0) <= maxNeed && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 013 Finral Roulacase — [On Play] choose 1 other character (need≤1) and return it to hand; if
  // you cannot, return this character instead.
  reg['BCV-1-013'] = { async onPlay(G, p, unit) { await H.bounceSelfOrOther(p, unit, 1); } };

  // 014 Magna Swing — [On Play] if another own Trait:Black Bull card on area, draw 1, place 1 card
  // from hand to Outside Area.
  reg['BCV-1-014'] = {
    async onPlay(G, p, unit) {
      if (countOtherTrait(p, unit, 'Black Bull') < 1) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 021 Zenon Zogratis — [On Retire] look at top 3, reveal up to 1 Trait:Dark Triad or
  // Trait:Devil card and add to hand, remainder to the bottom.
  reg['BCV-1-021'] = {
    async onSideline(G, p, unit) { await H.lookTopAndTake(p, 3, c => /Dark Triad|Devil/.test(c.traits || ''), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); },
  };

  // 022 Zenon Zogratis — [On Play] may retire 1 other own character; if did, draw 2.
  reg['BCV-1-022'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่น?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 028 "The Tree of Qliphoth" (Field) — [Main][Rest][1/turn] place 4 cards from your Outside Area
  // to the Remove Area; if did, draw 1, place 1 card from hand to Outside Area. (Skipped: the
  // instant-win clause "if 0 cards in deck and 3 differently-named Trait:Dark Triad on area, you
  // win the game" — too high-stakes/rare a condition to risk an incorrect implementation of.)
  reg['BCV-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.sideline.length < 4) { p.controller.notify?.('Outside Area มีไม่ถึง 4 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      for (let i = 0; i < 4; i++) p.removal.push(p.sideline.pop());
      log(`${unit.card.name}: ส่งการ์ด 4 ใบจาก Outside Area ไป Remove Area`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 029 "The Black Bulls' Hideout" (Field) — [On Play] only if ALL cards on your area have
  // Trait:Black Bull: choose 1 of: draw 1; or may place 1 Trait:Black Bull card from hand to
  // Outside Area, if did, draw 2.
  reg['BCV-1-029'] = {
    async onPlay(G, p, unit) {
      if (![...p.front, ...p.energy].every(u => (u.card.traits || '').includes('Black Bull'))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'a' }, { label: 'วาง Trait:Black Bull จากมือ เพื่อจั่ว 2 ใบ', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('Black Bull'));
      if (idx < 0) return;
      const vv = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:Black Bull จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!vv) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 031 "Black Bull" — choose 1 enemy Front Line character, -1000 BP for each own Trait:Black
  // Bull card on your area this turn.
  reg['BCV-1-031'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Black Bull')).length;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000 * n; log(`${card.name}: ${t.card.name} -${1000 * n} BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 033 "In the Presence of the Devil King" — choose 1 enemy Front Line character, -3000 BP until
  // the start of your next turn. If own Dante Zogratis, choose 1 of: -4000 instead; or draw 1.
  reg['BCV-1-033'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Dante Zogratis')) {
        const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [{ label: '-4000 BP แทน', value: 'a' }, { label: 'จั่ว 1 ใบ', value: 'b' }]);
        if (v === 'a') { t.bpPersist -= 4000; log(`${card.name}: ${t.card.name} -4000 BP จนถึงต้นเทิร์นหน้า`); }
        else { t.bpPersist -= 3000; log(`${card.name}: ${t.card.name} -3000 BP จนถึงต้นเทิร์นหน้า`); Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
      } else { t.bpPersist -= 3000; log(`${card.name}: ${t.card.name} -3000 BP จนถึงต้นเทิร์นหน้า`); }
      await Engine.checkBpZero();
    },
  };

  // 034 Lily Aquaria — [On Play] reveal the top card of your deck; if it's Asta or Yuno, add it to
  // hand, else place it on top or bottom.
  reg['BCV-1-034'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const no = p.deck[0];
      const c = byNo(no);
      if (c && /Asta|Yuno/.test(c.name || '')) { p.deck.shift(); p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); }
      else await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 036 Lemiel Silvamillion Clover — same bounce-self-or-other pattern as Finral Roulacase-013.
  reg['BCV-1-036'] = { async onPlay(G, p, unit) { await H.bounceSelfOrOther(p, unit, 1); } };

  // 038 Nozel Silva — [When Attacking] if this character's BP is 5000+, draw 1.
  reg['BCV-1-038'] = { async onAttack(G, p, unit) { if (Engine.bp(unit) >= 5000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 045 Asta — [Main][1/turn] place 1 card from hand to the top of your deck; if did, self +1000
  // BP until the start of your next turn.
  reg['BCV-1-045'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดในมือ'); return; }
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดวางบนสุดของเด็ค`);
      if (i == null) return;
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`);
      unit.bpPersist += 1000;
      log(`${unit.card.name}: +1000 BP จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 048 Charmy Pappitson — [On Play] choose up to 1 own character (including self) +1000 BP this turn.
  reg['BCV-1-048'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000); } };

  // 053 Yami Sukehiro — [On Play] may pay 1 AP; if did, choose 1 of: choose an enemy in Raid
  // State and place the top card of its Raid stack to Outside Area; or draw 2. @[Main][Frontline]
  // [1/turn] choose 1 own character +1000 BP this turn.
  reg['BCV-1-053'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อใช้ effect?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ลอกชั้นบนของศัตรูใน Raid State', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' },
      ]);
      if (v2 === 'a') {
        const enemy = Engine.opponentOf(p);
        const targets = [...enemy.front, ...enemy.energy].filter(u => u.under && u.under.length);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูใน Raid State`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await H.unraidTopLayer(enemy, t);
      } else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 061 Jack the Ripper — passive: if you have 6+ generated energy, +1500 BP.
  reg['BCV-1-061'] = { bpBonus(p, unit) { return totalGen(p) >= 6 ? 1500 : 0; } };

  // 062 Rill Boismortier — [Main] only if you have 6+ generated energy: this character gains
  // "also generates energy on the Front Line" until the start of your next turn.
  reg['BCV-1-062'] = {
    async onMain(G, p, unit) {
      if (totalGen(p) < 6) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.frontGenPersist = true;
      log(`${unit.card.name}: ผลิต energy บน Front Line ได้จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 065 "It seems like I understand myself a little bit..." — choose 1 own character, set it
  // active and +1000 BP this turn. If own Mereoleona Vermillion, draw 1.
  reg['BCV-1-065'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; t.bpMod += 1000; log(`${card.name}: ${t.card.name} เป็น Active และ +1000 BP เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Mereoleona Vermillion')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 066 "Dark Cloaked Dimension Slash: Equinox" — choose up to 1 enemy Front Line character with
  // BP ≤ the highest BP among your own characters and retire it.
  reg['BCV-1-066'] = {
    async onEvent(G, p, card) {
      const own = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      const highest = own.length ? Math.max(...own.map(u => Engine.bp(u))) : 0;
      await H.retireEnemyFront(p, highest);
    },
  };

  // 067 "Rival" — choose up to 1 enemy Front Line character BP≤2000 and retire it (BP≤4000
  // instead if only Asta or only Yuno is on your area; BP≤5000 instead if both are).
  reg['BCV-1-067'] = {
    async onEvent(G, p, card) {
      const hasAsta = H.hasCardNamed(p, 'Asta'), hasYuno = H.hasCardNamed(p, 'Yuno');
      const limit = (hasAsta && hasYuno) ? 5000 : (hasAsta || hasYuno) ? 4000 : 2000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 069 Lolopechka — passive: if 4+ Event Cards in your Outside Area, +1500 BP (always-on).
  reg['BCV-1-069'] = { bpBonus(p, unit) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length >= 4 ? 1500 : 0; } };

  // 070 Lolopechka — passive: on your turn, if 4+ Event Cards in your Outside Area, +500 BP.
  reg['BCV-1-070'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p.sideline.filter(no => byNo(no)?.type === 'Event').length >= 4) ? 500 : 0; },
  };

  // 074 Asta — passive: if there's a face-down card under this character, +1000 BP.
  reg['BCV-1-074'] = { bpBonus(p, unit) { return unit.counters.length ? 1000 : 0; } };

  // 076 Grey — [Main][Rest][Discard1][Retire this card] free-play 1 Trait:Black Bull red
  // character (need≤3, ap1) from hand active, it gets +1000 BP this turn.
  reg['BCV-1-076'] = {
    async onMain(G, p, unit) {
      const playIdx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.traits || '').includes('Black Bull') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (playIdx < 0) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      if (p.hand.length < 2) { p.controller.notify?.('ต้องมีการ์ดในมืออย่างน้อย 2 ใบ'); return; }
      const playNo = p.hand[playIdx];
      // [Discard 1] cost — never discard the card this ability is about to play
      const others = p.hand.filter(no => no !== playNo);
      const discardNo = others.reduce((worst, no) => (byNo(no)?.need || 0) > (byNo(worst)?.need || 0) ? no : worst, others[0]);
      p.hand.splice(p.hand.indexOf(discardNo), 1);
      p.sideline.push(discardNo);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่ง ${byNo(discardNo)?.name} จากมือไป Outside Area`);
      await Engine.sidelineUnit(p, unit, 'effect');
      const u = await Engine.playCardFromZone(p, playNo, 'hand', { line: 'energy', active: true });
      if (u) { u.bpMod += 1000; log(`${unit.card.name}: ${u.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 082 Noelle Silva — [Main][Frontline][1/turn] only if you used an Event Card this turn: look
  // at the top card of your deck, place it on top or to Outside Area.
  reg['BCV-1-082'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 085 Finral Roulacase — [On Play] place the top card of your deck face-down under this
  // character. (Skipped: the end-of-Attack-Phase "consume the face-down card to move/swap
  // characters" clause — end-of-Attack-Phase hook gap.)
  reg['BCV-1-085'] = {
    async onPlay(G, p, unit) { if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`); } },
  };

  // 087 Yami Sukehiro — passive: if this character is active, +1 generated energy.
  reg['BCV-1-087'] = { genMod(unit) { return !unit.rested ? 1 : 0; } };

  // 088 Yami Sukehiro — [On Play] may place the top card of your deck face-down under a
  // character on your area; if did, draw 1. @[When Attacking] choose up to 1 other own
  // Trait:Black Bull character, place the top card of your deck face-down under it.
  reg['BCV-1-088'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length || !p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ character?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ ${t.card.name}`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    async onAttack(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Black Bull'));
      if (!targets.length || !p.deck.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Black Bull`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำใต้ ${t.card.name}`); }
    },
  };

  // 095 Undine (Field) — "This field is play in active." (kw.entersActive, generic) @[Main][Rest]
  // [1/turn] only if own Lolopechka on area: look at the top card of your deck, place it on top or
  // to the Outside Area.
  reg['BCV-1-095'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!H.hasCardNamed(p, 'Lolopechka')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 098 "Sea Dragon's Nest" — choose 1 own Front Line character, give it "opponent cannot choose
  // this character" until the start of your next turn (approximated via tempUntargetable — a
  // shorter duration than printed, same accepted approximation as YYH-1-093). If own Noelle Silva,
  // set 1 of your AP cards active.
  reg['BCV-1-098'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempUntargetable = true; log(`${card.name}: ${t.card.name} ห้ามถูกเลือกโดยศัตรูเทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Noelle Silva')) await H.apUntap(p, 1);
    },
  };

  // 109 "Emergency meeting" (Field) — [Main][Rest+Retire this card] add up to 2 red character
  // cards with required energy of 3 or less from your Outside Area to hand.
  reg['BCV-1-109'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      const pred = c => c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 3;
      for (let i = 0; i < 2; i++) {
        if (!(await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก character สีแดง (Energy≤3) (${i + 1}/2)`))) break;
      }
    },
  };

  // 111 Henry Legolant — passive: if 4+ other Trait:Black Bull cards on your area, +1 generated
  // energy. @[Main][Rest][Pay1AP][1/turn] choose 1 own Black Bull Hideout Field and re-activate its
  // [On Play] effect.
  reg['BCV-1-111'] = {
    genMod(unit, p) { return countOtherTrait(p, unit, 'Black Bull') >= 4 ? 1 : 0; },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Black Bull Hideout'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Black Bull Hideout`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Effects.onPlay(G, p, t);
    },
  };
})();
