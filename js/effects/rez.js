// ══════════ UA SIM — Re:Zero (REZ) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function eventCountInSideline(p) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length; }
  async function placeHandCardOnTopOfDeck(p, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || 'เลือกการ์ดจากมือไปบนสุดของเด็ค');
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    p.deck.unshift(no);
    log(`${p.name}: ${byNo(no)?.name} จากมือไปบนสุดของเด็ค`);
    return no;
  }
  async function revealHandCardToBottom(p, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || 'เปิดเผยการ์ดจากมือ (ไปล่างสุดของเด็ค)');
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    p.deck.push(no);
    log(`${p.name}: เปิดเผย ${byNo(no)?.name} — ไปล่างสุดของเด็ค`);
    return no;
  }
  async function revealTopAddOrPlaySpecial(p, namePred, title) {
    if (!p.deck.length) return;
    const no = p.deck[0];
    const c = byNo(no);
    if (c && namePred(c) && Engine.hasEnergyFor(p, c)) {
      const v = await p.controller.chooseOption(p, `${title}: เปิดเจอ ${c.name} — ลงสนามแทนการเข้ามือ?`, [{ label: 'ลงสนาม (Rest)', value: true }, { label: 'เข้ามือตามปกติ', value: false }]);
      if (v) { p.deck.shift(); await Engine.playCardFromZone(p, no, 'deck', { line: 'energy', active: false }); return; }
    }
    p.deck.shift(); p.hand.push(no);
    log(`${title}: เปิดเจอ ${c?.name} — เพิ่มเข้ามือ`);
  }

  // 002 Puck — passive: if there is an Emilia on your area and you have 4+ Event Cards in your
  // Outside Area, +1000 BP. @[On Play] if there is an Emilia on your area and you have 6+ Event
  // Cards in your Outside Area, you may place 1 card from hand to the Outside Area; if you did,
  // set this character active. (Skipped: "this card is also treated as an Event Card in all
  // places" — the recurring type-reclassification meta gap.)
  reg['UA40BT-REZ-1-002'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && H.hasCardNamed(p, 'Emilia') && eventCountInSideline(p) >= 4) ? 1000 : 0; },
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Emilia') || eventCountInSideline(p) < 6) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 004 Beatrice — [On Play] draw 1. If you used an Event Card this turn, untap 1 AP.
  reg['UA40BT-REZ-1-004'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (p._eventsUsedThisTurn) await H.apUntap(p, 1);
    },
  };

  // 018 Rem — [On Play] choose up to 1 enemy Front Line character with BP 2500 or more, -2000 BP
  // this turn.
  reg['UA40BT-REZ-1-018'] = { async onPlay(G, p, unit) { await H.debuffEnemyAny(p, -2000, { min: 2500 }); } };

  // 021 Roswaal L. Mathers — [Main][Frontline][1/turn] only if there is a Rem and a Ram on your
  // area: draw 1, place 1 card from hand to the Outside Area.
  reg['UA40BT-REZ-1-021'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!H.hasCardNamed(p, 'Rem') || !H.hasCardNamed(p, 'Ram')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 025 Emilia — [On Play] look at the top 3, place up to 1 to the Outside Area, remainder to the top.
  reg['UA40BT-REZ-1-025'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 026 Emilia — [On Play] if you used an Event Card this turn, draw 1.
  reg['UA40BT-REZ-1-026'] = { async onPlay(G, p, unit) { if (p._eventsUsedThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 033 "Spiritualist" — choose up to 1 enemy Front Line character with BP 5000 or less and rest
  // it (retire instead if there is an Emilia on your area). Then, if there are an Emilia and a
  // Puck on your area, look at the top of your deck and keep it on top or send it to the Outside
  // Area.
  reg['UA40BT-REZ-1-033'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Emilia')) await H.retireEnemyFront(p, 5000);
      else await H.restEnemyFront(p, 5000);
      if (H.hasCardNamed(p, 'Emilia') && H.hasCardNamed(p, 'Puck')) await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 041 Patrasche — [Your Turn] if there is a blue Natsuki Subaru (need=0) on your Front Line,
  // +1000 BP.
  reg['UA40BT-REZ-1-041'] = { bpBonus(p, unit) { return (isYourTurn(p) && p.front.some(u => u.card.color === 'Blue' && (u.card.name || '').includes('Natsuki Subaru') && (u.card.need || 0) === 0)) ? 1000 : 0; } };

  // 042 Ferris — [On Play] choose up to 1 character on your or your opponent's area, +1000 BP this turn.
  reg['UA40BT-REZ-1-042'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...p.front, ...p.energy, ...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (ของคุณหรือศัตรู)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 045 Mimi Pearlbaton — [Main][1/turn] reveal 1 card from hand, place it at the bottom of your
  // deck. If it's a Character Card with BP 4000+, +2500 BP this turn.
  reg['UA40BT-REZ-1-045'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) return;
      unit._usedTurn = Engine.G.turn;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เปิดเผยการ์ดจากมือ`);
      if (i == null) return;
      const no = p.hand.splice(i, 1)[0];
      const c = byNo(no);
      p.deck.push(no);
      log(`${unit.card.name}: เปิดเผย ${c?.name} — ไปล่างสุดของเด็ค`);
      if (c && c.type === 'Character' && (c.bp || 0) >= 4000) { unit.bpMod += 2500; log(`${unit.card.name}: +2500 BP เทิร์นนี้`); }
    },
  };

  // 046 Julius Juukulius — [On Play] you may return 1 blue Natsuki Subaru (need=0) from your area
  // to your hand; if you did, set this character active and +1000 BP this turn.
  reg['UA40BT-REZ-1-046'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.color === 'Blue' && (u.card.name || '').includes('Natsuki Subaru') && (u.card.need || 0) === 0);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน Natsuki Subaru สีน้ำเงินกลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      unit.rested = false; unit.bpMod += 1000;
      log(`${unit.card.name}: Active และ +1000 BP เทิร์นนี้`);
    },
  };

  // 050 Rem — [On Play] look at the top 2, keep any number on top (any order), remainder to the
  // Outside Area.
  reg['UA40BT-REZ-1-050'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 052 Rem — [On Play] choose 1 of: free-play 1 blue Natsuki Subaru (need=0) from your Outside
  // Area to your area active; or you may return 1 character on your area to hand, if you did, set
  // this character active and free-play 1 blue Natsuki Subaru (fulfilled need, ap1) from your
  // Outside Area to your area rested (skipped: the "or raid it" alternative).
  reg['UA40BT-REZ-1-052'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ลง Natsuki Subaru สีน้ำเงิน (Energy 0) จาก Outside Area แบบ Active', value: 'a' }, { label: 'คืน character กลับมือ + ลง Natsuki Subaru สีน้ำเงิน', value: 'b' },
      ]);
      if (v === 'a') {
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.name || '').includes('Natsuki Subaru') && (c.need || 0) === 0; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
        return;
      }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (targets.length) {
        const doIt = await p.controller.chooseOption(p, `${unit.card.name}: คืน character กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
        if (doIt) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
          const t = targets.find(x => x.uid === uid);
          if (t) {
            await Engine.returnUnitToHand(p, t);
            log(`${unit.card.name}: ${t.card.name} กลับมือ`);
            unit.rested = false; log(`${unit.card.name}: Active`);
            const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.name || '').includes('Natsuki Subaru') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
            if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
          }
        }
      }
    },
  };

  // 060 Flugel's Giant Tree (Field) — [Main][Rest+Retire][1/turn] reveal 1 card from hand, place
  // it at the bottom of your deck. If it's a Character Card, choose up to 1 enemy Front Line
  // character with BP <= the revealed card's BP and retire it.
  reg['UA40BT-REZ-1-060'] = {
    async onMain(G, p, unit) {
      if (!p.hand.length) { await Engine.sidelineUnit(p, unit, 'effect'); return; }
      const no = await revealHandCardToBottom(p, `${unit.card.name}: เปิดเผยการ์ดจากมือ`);
      await Engine.sidelineUnit(p, unit, 'effect');
      const c = byNo(no);
      if (c && c.type === 'Character') await H.retireEnemyFront(p, c.bp || 0);
    },
  };

  // 062 "I got your Word!" — choose 1 Rem on your area, +1000 BP and [Impact +1] this turn, and
  // draw 1.
  reg['UA40BT-REZ-1-062'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Rem'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Rem`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} +1000 BP และ [Impact +1] เทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 065 "A Monster--!" — choose 1 enemy Front Line character with BP 4500 or more and retire it.
  // (Skipped: "when revealed in your hand by your effect, also treated as a Character Card with
  // BP 4000" — a reveal-context type override with no other card in this batch referencing it.)
  reg['UA40BT-REZ-1-065'] = { async onEvent(G, p, card) { await retireEnemyFrontMin(p, 4500); } };
  async function retireEnemyFrontMin(p, bpMin) {
    const enemy = Engine.opponentOf(p);
    const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= bpMin);
    if (!targets.length) return;
    const uid = await p.controller.chooseEnemyCharacter(p, targets, `เลือก character ศัตรู (BP ${bpMin} หรือมากกว่า)`, true);
    const u = targets.find(x => x.uid === uid);
    if (u) { await Engine.sidelineUnit(enemy, u, 'effect'); log(`${p.name}: ${u.card.name} ถูก retire`); }
  }

  // 066 "One Hundred Swords" — usable only if there is a Crusch Karsten on your area. Choose 1
  // enemy Front Line character with BP 5000 or less and retire it. (Skipped: the "treat hand
  // Character BP as +1000 when referenced by your effects this turn" meta clause.)
  reg['UA40BT-REZ-1-066'] = { async onEvent(G, p, card) { if (H.hasCardNamed(p, 'Crusch Karsten')) await H.retireEnemyFront(p, 5000); } };

  // 070 Natsuki Subaru — [On Play] choose 1 of: draw 1, place 1 card from hand on top of your deck
  // or the Outside Area; or you may pay 1 AP, if you did, reveal the top card of your deck and add
  // it to hand (or play it to your area rested instead, if it's a Beatrice fulfilling need — skipped:
  // the "or raid it" alternative).
  reg['UA40BT-REZ-1-070'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + วางการ์ดจากมือ (บนสุดของเด็ค/Outside Area)', value: 'a' }, { label: 'จ่าย 1 AP เพื่อเปิดเผยการ์ดบนสุดของเด็ค', value: 'b' },
      ]);
      if (v === 'a') {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        if (!p.hand.length) return;
        const dest = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจากมือไปที่ไหน?`, [{ label: 'บนสุดของเด็ค', value: 'top' }, { label: 'Outside Area', value: 'outside' }]);
        if (dest === 'top') await placeHandCardOnTopOfDeck(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
        else await H.discardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
      } else {
        if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) return;
        await revealTopAddOrPlaySpecial(p, c => c.type === 'Character' && (c.name || '').includes('Beatrice'), unit.card.name);
      }
    },
  };

  // 075 Beatrice — [On Play] if this character was played by your effect, set self active.
  reg['UA40BT-REZ-1-075'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { unit.rested = false; log(`${unit.card.name}: Active`); } } };

  // 083 Emilia — [On Play] look at the top 2, place up to 1 to the Outside Area, remainder to the top.
  reg['UA40BT-REZ-1-083'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 094 Forbidden Library (Field) — [On Play] you may place 1 card from hand to the Outside Area;
  // if you did, set this Field active. @[Main][Rest][1/turn] draw 1, place 1 card from hand on top
  // of your deck.
  reg['UA40BT-REZ-1-094'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await placeHandCardOnTopOfDeck(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
    },
  };

  // 096 "El Minya" — choose 1 enemy Front Line character with BP 3000 or less and retire it (4000
  // or less if there is a Beatrice on your area; 5000 or less if there are both a Beatrice and a
  // Natsuki Subaru).
  reg['UA40BT-REZ-1-096'] = {
    async onEvent(G, p, card) {
      let limit = 3000;
      if (H.hasCardNamed(p, 'Beatrice') && H.hasCardNamed(p, 'Natsuki Subaru')) limit = 5000;
      else if (H.hasCardNamed(p, 'Beatrice')) limit = 4000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 097 "Choose Me! Beatrice!" — look at the top 3, keep any number on top (any order), remainder
  // to the Outside Area. Then reveal the new top card and add it to hand (or play it to your area
  // rested instead, if it's a Natsuki Subaru/Beatrice fulfilling need — skipped: the "or raid it"
  // alternative).
  reg['UA40BT-REZ-1-097'] = {
    async onEvent(G, p, card) {
      await H.lookTopAndDiscard(p, 3, 3, `${card.name}: ดูการ์ดบนสุด 3 ใบ`);
      await revealTopAddOrPlaySpecial(p, c => c.type === 'Character' && /Natsuki Subaru|Beatrice/.test(c.name || ''), card.name);
    },
  };

  // 101 Natsuki Subaru — [Your Turn] if there is a face-down card under this character, +1000 BP.
  // @[On Retire] if there is an Emilia on your area and no face-down card under this character, you
  // may place 1 card from hand to the Outside Area; if you did, play this character to your Front
  // Line rested and place the discarded card face-down under it.
  reg['UA40ST-REZ-1-101'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && unit.counters.length) ? 1000 : 0; },
    async onSideline(G, p, unit) {
      if (!H.hasCardNamed(p, 'Emilia') || unit.counters.length || !p.hand.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
      if (i == null) return;
      const no = p.hand.splice(i, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไป Outside Area`);
      const newUnit = await Engine.playCardFromZone(p, unit.no, 'sideline', { line: 'front', active: false });
      if (newUnit) {
        const si = p.sideline.indexOf(no);
        if (si >= 0) { p.sideline.splice(si, 1); newUnit.counters.push(no); log(`${unit.card.name}: วางการ์ดคว่ำใต้ตัวเอง`); }
      }
    },
  };

  // 105 Emilia (ST) — [Your Turn] if you used an Event Card this turn, +1000 BP.
  reg['UA40ST-REZ-1-105'] = { bpBonus(p, unit) { return (isYourTurn(p) && p._eventsUsedThisTurn) ? 1000 : 0; } };

  // 108 Roswaal Manor (Field) — [Main][Rest][1/turn] look at the top card of your deck, place it
  // on top or the bottom.
  reg['UA40ST-REZ-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 110 Rem (ST) — passive: if there is a Natsuki Subaru on your Front Line, +1 generated energy.
  reg['UA40ST-REZ-1-110'] = { genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Natsuki Subaru')) ? 1 : 0; } };

  // 111 "Crusch and Ferris" — [On Play] look at the top 2, place any number on top (any order),
  // remainder to the Outside Area. (The "treated as both <Crusch Karsten> and <Ferris>" clause is
  // now handled generically by parseKeywords' widened alsoTreatedAs regex.)
  reg['UA40ST-REZ-1-111'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 112 Beatrice (ST) — [Your Turn] if you played a Character card from the top of your deck this
  // turn, +500 BP (approximated: does not separately detect the "raided from deck" variant).
  // @[On Play] if this character was played by your effect, set self active.
  reg['UA40ST-REZ-1-112'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p._playedFromDeckThisTurn) ? 500 : 0; },
    async onPlay(G, p, unit) { if (unit._playedByEffect) { unit.rested = false; log(`${unit.card.name}: Active`); } },
  };

  // 113 Echidna — [On Play] you may place 1 card from hand to the Outside Area or rest 1 active
  // character on your Front Line; if you did, add up to 1 "Trail of the Sanctuary" from your
  // Outside Area to your hand.
  reg['UA40ST-REZ-1-113'] = {
    async onPlay(G, p, unit) {
      const canRest = p.front.some(u => u !== unit && !u.rested);
      const opts = [{ label: 'วางการ์ดจากมือไป Outside Area', value: 'a' }];
      if (canRest) opts.push({ label: 'วางนอน character ของตัวเอง', value: 'b' });
      opts.push({ label: 'ข้าม', value: null });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v == null) return;
      let done = false;
      if (v === 'a') { const no = await H.discardFromHand(p); done = no != null; }
      else {
        const targets = p.front.filter(u => u !== unit && !u.rested);
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); done = true; }
      }
      if (done) await H.fetchFromSideline(p, c => c && (c.name || '').includes('Trail of the Sanctuary'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };
})();
