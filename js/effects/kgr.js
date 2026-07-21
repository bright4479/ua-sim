// ══════════ UA SIM — KGR series effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 001 Kyora Sazanami — [On Play] look at top 5, place up to 3 face-down under this character
  // (shared "face-down card storage" convention via unit.counters), remainder to bottom.
  // @[Main][Frontline][Pay1AP][1/turn] reveal 1 face-down card under this character or Rakuzaichi,
  // add to hand and set self Active; if it has Trait:Tou, may instead play it Active.
  reg['UA46BT-KGR-1-001'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดวางคว่ำใต้การ์ดนี้ (สูงสุด 3 ใบ)`, null, Math.min(3, revealed.length));
      picked.sort((a, b) => b - a).forEach(i => unit.counters.push(revealed.splice(i, 1)[0]));
      p.deck.push(...revealed);
      log(`${unit.card.name}: วางการ์ดคว่ำ ${picked.length} ใบไว้ใต้การ์ดนี้`);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      const rakuzaichi = [...p.front, ...p.energy].find(u => (u.card.name || '').includes('Rakuzaichi') && u.counters.length);
      const pool = unit.counters.length ? unit : rakuzaichi;
      if (!pool || !pool.counters.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำ'); return; }
      unit._usedTurn = Engine.G.turn;
      const idx = await p.controller.chooseRevealPick(p, pool.counters, `${unit.card.name}: เลือกการ์ดคว่ำใต้ ${pool.card.name}`, null, 1);
      const i = idx[0];
      if (i == null) return;
      const no = pool.counters.splice(i, 1)[0];
      const c = byNo(no);
      if ((c.traits || '').includes('Tou')) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: ${c.name} — เพิ่มเข้ามือแล้ว Active ตัวเอง หรือ ลงสนามทันที (Active)?`,
          [{ label: 'เพิ่มเข้ามือ', value: 'hand' }, { label: 'ลงสนามทันที (Active)', value: 'play' }]);
        if (v === 'play') { p.hand.push(no); await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: true }); unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); return; }
      }
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`);
      unit.rested = false;
      log(`${unit.card.name}: Active ตัวเอง`);
    },
  };

  // 005 Iori Samura — enters Active when played to Energy Line (conditional on destination line, so
  // the static entersActive keyword doesn't apply). @[Main][Rest] gated on own Chihiro
  // Rokuhira/Trait:Masumi Ninja Clan; choose: scry the top card, or discard 1 to buff another +1000 BP.
  reg['UA46BT-KGR-1-005'] = {
    async onPlay(G, p, unit) {
      if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง (ลงที่ Energy Line)`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const gated = H.hasCardNamed(p, 'Chihiro Rokuhira') || [...p.front, ...p.energy].some(u => (u.card.traits || '').includes('Masumi Ninja Clan'));
      if (!gated) { p.controller.notify?.('ต้องมี Chihiro Rokuhira หรือ Trait:Masumi Ninja Clan'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุดของเด็ค วางบนหรือใต้เด็ค', value: 'scry' },
        { label: 'ทิ้งการ์ด 1 ใบ เพื่อ buff character อื่น +1000 BP', value: 'discard' },
      ]);
      if (v === 'scry') await H.scryTop(p, ['top', 'bottom']);
      else if (p.hand.length) { const discarded = await H.discardFromHand(p); if (discarded) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); }
    },
  };

  // 009 Genichi Sojo — [On Play] choose up to 1 enemy Front Line character BP≥1500, -1000 BP this turn.
  reg['UA46BT-KGR-1-009'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 010 Genichi Sojo — same [On Play] debuff as 009. @[Main][Pay1AP][1/turn] choose: draw 1, or (if
  // on Front Line) look at top 3 for a Genichi Sojo/Cloud Gouger Mei card to hand (draw 1 if none added).
  reg['UA46BT-KGR-1-010'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      const opts = [{ label: 'จั่ว 1 ใบ', value: 'draw' }];
      if (p.front.includes(unit)) opts.push({ label: 'ดูการ์ดบนสุด 3 ใบ (หา Genichi Sojo/Cloud Gouger Mei)', value: 'look' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else {
        const taken = await H.lookTopAndTake(p, 3, c => (c.name || '').includes('Genichi Sojo') || (c.name || '').includes('Cloud Gouger Mei'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
        if (!taken.length) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      }
    },
  };

  // 018 Yoji Uruha — passive +1000 BP if own Chihiro Rokuhira or Seiichi Samura. @[On Retire] draw
  // 1; if it's the opponent's turn, discard 1.
  reg['UA46BT-KGR-1-018'] = {
    bpBonus(p, unit) { return (H.hasCardNamed(p, 'Chihiro Rokuhira') || H.hasCardNamed(p, 'Seiichi Samura')) ? 1000 : 0; },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (Engine.G.players[Engine.G.active] !== p) await H.discardFromHand(p);
    },
  };

  // 022 Enji Sazanami — [On Play] if you paid AP via a character effect this turn, choose 1 Kyora
  // Sazanami/Trait:Tou, +2000 BP this turn.
  reg['UA46BT-KGR-1-022'] = {
    async onPlay(G, p, unit) {
      if (!p._paidApByEffectThisTurn) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kyora Sazanami') || (u.card.traits || '').includes('Tou'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kyora Sazanami หรือ Trait:Tou`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };

  // 023 Soya Sazanami — [On Play][once ever] if you paid AP via a character effect this turn, may
  // discard 1 to move 1 enemy Front Line character to Energy Line.
  reg['UA46BT-KGR-1-023'] = {
    async onPlay(G, p, unit) {
      if (unit._usedEver || !p._paidApByEffectThisTurn || !p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อย้าย character ศัตรูไป Energy Line?`);
      if (!discarded) return;
      unit._usedEver = true;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูย้ายไป Energy Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      let removeUid = null;
      if (enemy.energy.length >= 4) removeUid = await enemy.controller.chooseOwnCharacter(enemy, enemy.energy, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
      await Engine.moveUnitFree(enemy, t, 'energy', removeUid);
    },
  };

  // 027 Toto — [Main][Rest][Retire][once ever] gated on having paid AP via a character effect this
  // turn; untap 1 AP.
  reg['UA46BT-KGR-1-027'] = {
    async onMain(G, p, unit) {
      if (unit._usedEver) { p.controller.notify?.('ใช้ไปแล้ว'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p._paidApByEffectThisTurn) { p.controller.notify?.('ต้องจ่าย AP ผ่านเอฟเฟกต์ของ character ในเทิร์นนี้ก่อน'); return; }
      unit._usedEver = true;
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.apUntap(p, 1);
    },
  };

  // 028 Hiruhiko — [When Attacking] if you paid AP via a character effect this turn, draw 1.
  reg['UA46BT-KGR-1-028'] = {
    async onAttack(G, p, unit) { if (p._paidApByEffectThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 029 Hiruhiko — [On Play] may pay 1 AP to set self Active and rest 1 enemy Front Line character;
  // if you'd already paid AP via another character's effect this turn, that target also skips its next stand.
  reg['UA46BT-KGR-1-029'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ Active ตัวเองและวางนอน character ศัตรู?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const hadPaidBefore = !!p._paidApByEffectThisTurn;
      if (!Engine.payApForEffect(p, 1)) return;
      unit.rested = false;
      log(`${unit.card.name}: Active ตัวเอง`);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้วางนอน`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      if (hadPaidBefore) { t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 031 Sumi — [On Play] choose 1 Chihiro Rokuhira/Iori Samura/Trait:Iai White Purity Style; move
  // it to the other line, or swap it with a character on the other line.
  reg['UA46BT-KGR-1-031'] = {
    async onPlay(G, p, unit) {
      const pred = u => (u.card.name || '').includes('Chihiro Rokuhira') || (u.card.name || '').includes('Iori Samura') || (u.card.traits || '').includes('Iai White Purity Style');
      const targets = [...p.front, ...p.energy].filter(pred);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const myLine = p.front.includes(t) ? p.front : p.energy;
      const otherLine = p.front.includes(t) ? p.energy : p.front;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ย้าย ${t.card.name} ไปอีก line เฉยๆ หรือสลับกับตัวอื่น?`,
        [{ label: 'ย้ายเฉยๆ', value: 'move' }, { label: 'สลับกับตัวอื่น', value: 'swap' }]);
      if (v === 'move') {
        let removeUid = null;
        if (otherLine.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, otherLine, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
        await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front', removeUid);
      } else {
        const others = otherLine.filter(u => u.card.type === 'Character');
        if (!others.length) return;
        const uid2 = await p.controller.chooseOwnCharacter(p, others, 'เลือก character อีก line');
        const t2 = others.find(x => x.uid === uid2);
        if (!t2) return;
        const iMe = myLine.indexOf(t), iT = otherLine.indexOf(t2);
        myLine[iMe] = t2; otherLine[iT] = t;
        log(`${unit.card.name}: สลับตำแหน่ง ${t.card.name} กับ ${t2.card.name}`);
      }
    },
  };

  // 041 Magatsumi Centipede (Event) — retire 1 enemy Front Line character BP≤4000 (BP≤5000 if own
  // Kyora Sazanami/Rakuzaichi). (Skipped: the "if revealed by Kyora Sazanami's effect, use free"
  // clause — no hook fires from a reveal-effect back into this Event's own play cost.)
  reg['UA46BT-KGR-1-041'] = {
    async onEvent(G, p, card) {
      const limit = (H.hasCardNamed(p, 'Kyora Sazanami') || H.hasCardNamed(p, 'Rakuzaichi')) ? 5000 : 4000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 043 Char Kyonagi / 054 Kunishige Rokuhira — reactive to "placed to Outside Area specifically by
  // Chihiro Rokuhira's effect". (Skipped: no hook tracks which card's effect caused a discard, same
  // gap noted for BLC-2-013/BLC-2-047/KMY-3-066/KMY-3-067.)

  // 045 Hakuri Sazanami — passive +1000 BP if own Chihiro Rokuhira or Togo Shiba is on Front Line.
  reg['UA46BT-KGR-1-045'] = {
    bpBonus(p, unit) { return p.front.some(u => (u.card.name || '').includes('Chihiro Rokuhira') || (u.card.name || '').includes('Togo Shiba')) ? 1000 : 0; },
  };

  // 046 Hakuri Sazanami — [On Play] if own Chihiro Rokuhira/Togo Shiba, look at top 3, place up to
  // 1 card face-down under this character, remainder to top.
  reg['UA46BT-KGR-1-046'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Chihiro Rokuhira') && !H.hasCardNamed(p, 'Togo Shiba')) return;
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดวางคว่ำใต้การ์ดนี้ (สูงสุด 1 ใบ)`, null, 1);
      const idx = picked[0];
      if (idx != null) { unit.counters.push(revealed.splice(idx, 1)[0]); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้การ์ดนี้`); }
      p.deck.unshift(...revealed);
    },
  };

  // 050 Togo Shiba — free-play trigger at the start of Attack Phase under a field/energy condition.
  // (Skipped: no hook fires at the start of Attack Phase, same gap noted for KMY-2-001/KMY-2-002.)

  // 052 Hinao — [On Play] look at top 4, keep up to 1 on top (in order), remainder to bottom.
  reg['UA46BT-KGR-1-052'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดไว้บนสุด (สูงสุด 1 ใบ)`, null, 1);
      const idx = picked[0];
      let top = null;
      if (idx != null) top = revealed.splice(idx, 1)[0];
      p.deck.push(...revealed);
      if (top != null) p.deck.unshift(top);
      log(`${unit.card.name}: จัดการ์ดบนสุดของเด็คใหม่`);
    },
  };

  // 057 Chihiro Rokuhira — [Main][Discard1][1/turn] self +1000 BP and +1 red energy generation this turn.
  reg['UA46BT-KGR-1-057'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      unit.tempGen += 1;
      log(`${unit.card.name}: +1000 BP และ +1 energy generation เทิร์นนี้`);
    },
  };

  // 058 Chihiro Rokuhira — [When Attacking] may place 1 face-down card from under this character to
  // Outside Area for +2000 BP this turn. @[On Block] may discard 2 for +2000 BP this battle and,
  // if you then win, place the top of your deck face-down under this character.
  reg['UA46BT-KGR-1-058'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อรับ +2000 BP?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = unit.counters.shift();
      p.sideline.push(no);
      unit.bpMod += 2000;
      log(`${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area, +2000 BP เทิร์นนี้`);
    },
    async onBlock(G, p, unit) {
      if (p.hand.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้งการ์ด 2 ใบเพื่อรับ +2000 BP และเก็บการ์ดคว่ำถ้าชนะ?`,
        [{ label: 'ทิ้ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await H.discardFromHand(p); await H.discardFromHand(p);
      unit.bpMod += 2000;
      unit._grantedOnWinFaceDown = true;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้ (ถ้าชนะจะได้การ์ดคว่ำใต้ตัวเอง)`);
    },
    async onDefenderWinBattle(G, p, unit) {
      if (unit._grantedOnWinFaceDown) {
        unit._grantedOnWinFaceDown = false;
        if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้การ์ดนี้`); }
      }
    },
  };

  // 062 Soshiro Azami — [On Play] draw 1; free-play 1 Trait:Kamunabi (fulfilled energy, AP1) from
  // hand, rested; then may discard 1 to set that character Active and +1000 BP this turn.
  reg['UA46BT-KGR-1-062'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Kamunabi') && (c.ap || 0) === 1 && Engine.hasEnergyFor(p, c); });
      if (idx < 0) return;
      const no = p.hand[idx];
      const played = await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false });
      if (!played || !p.hand.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อ Active ${played.card.name} และ +1000 BP?`,
        [{ label: 'ทิ้ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await H.discardFromHand(p);
      played.rested = false;
      played.bpMod += 1000;
      log(`${unit.card.name}: ${played.card.name} Active และ +1000 BP เทิร์นนี้`);
    },
  };

  // 063 Hiyuki Kagari — [On Play] look at top 2, place up to 1 Trait:Kamunabi card to Outside Area, remainder on top.
  reg['UA46BT-KGR-1-063'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Kamunabi')); },
  };

  // 066 Hiyuki Kagari — [Your Turn] if 4+ Trait:Kamunabi, this character gains a once-per-turn
  // on-win-as-attacker trigger: draw 1 if the opponent's Life is 4+, otherwise set self Active.
  reg['UA46BT-KGR-1-066'] = {
    async onWinBattle(G, p, atk, enemy, defender) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kamunabi')).length;
      if (n < 4 || atk._usedTurn === Engine.G.turn) return false;
      atk._usedTurn = Engine.G.turn;
      if ((enemy.life || []).length >= 4) { Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`); }
      else { atk.rested = false; log(`${atk.card.name}: Active ตัวเอง`); }
      return false;
    },
  };

  // 068 Tafuku Mihara — [On Play] choose up to 1 Hiyuki Kagari, +1000 BP this turn. (Skipped: the
  // "if opponent's Life ≤3, gains draw-on-unblocked-attack" grant — no hook distinguishes a blocked
  // vs. unblocked attack outcome, same gap noted for TSK-2-051/ARK's post-block-declaration hook.)
  reg['UA46BT-KGR-1-068'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Hiyuki Kagari'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Hiyuki Kagari`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 069 Tafuku Mihara — forces a specific enemy character to block a specific own attacker.
  // (Skipped: no hook constrains the opponent's block-candidate choice.)

  // 070 Kiyohiko Uzuki — [On Play] if 4+ Trait:Kamunabi, rest up to 1 enemy Front Line character BP≤2500.
  reg['UA46BT-KGR-1-070'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kamunabi')).length;
      if (n < 4) return;
      await H.restEnemyFront(p, 2500);
    },
  };

  // 071 Makoto Kasahara — [Main][Discard1][1/turn] gated on 4+ Trait:Kamunabi; self +1000 BP this turn.
  reg['UA46BT-KGR-1-071'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kamunabi')).length;
      if (n < 4) { p.controller.notify?.('ต้องมี Trait:Kamunabi 4 ใบขึ้นไป'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 072 Hajime Kugara — [When Attacking] if self BP≥4000 and 4+ Trait:Kamunabi, draw 1, discard 1.
  reg['UA46BT-KGR-1-072'] = {
    async onAttack(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kamunabi')).length;
      if (Engine.bp(unit) >= 4000 && n >= 4) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 073 Ikuto Hagiwara — [Main][Frontline][1/turn] gated on self-Active; choose 1 other own
  // Trait:Kamunabi, +1000 BP this turn.
  reg['UA46BT-KGR-1-073'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kamunabi'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Kamunabi รับ +1000 BP เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 078 Isou (Event) — choose 1 enemy Front Line character, move it to Energy Line.
  reg['UA46BT-KGR-1-078'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      let removeUid = null;
      if (enemy.energy.length >= 4) removeUid = await enemy.controller.chooseOwnCharacter(enemy, enemy.energy, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
      await Engine.moveUnitFree(enemy, t, 'energy', removeUid);
    },
  };
})();
