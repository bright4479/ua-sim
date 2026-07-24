// ══════════ UA SIM — Kingdom (KGD) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function countDistinctYellowTraits(p) {
    const traits = new Set();
    for (const u of [...p.front, ...p.energy]) {
      if (u.card.type === 'Character' && u.card.color === 'Yellow')
        for (const t of (u.card.traits || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) traits.add(t);
    }
    return traits.size;
  }
  function countDistinctNamedTrait(p, trait) {
    const names = new Set();
    for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes(trait)) names.add(u.card.name);
    return names.size;
  }
  function countDistinctFrontNames(p) { return new Set(p.front.map(u => u.card.name)).size; }
  function countTraitCards(p, trait) { return [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes(trait)).length; }
  async function retireEnemyFrontMin(p, bpMin) {
    const enemy = Engine.opponentOf(p);
    const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= bpMin);
    if (!targets.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, targets, `เลือก character ศัตรู (BP ${bpMin} หรือมากกว่า)`, true);
    const u = targets.find(x => x.uid === uid);
    if (u) { await Engine.sidelineUnit(enemy, u, 'effect'); log(`${p.name}: ${u.card.name} ถูก retire`); }
    return u;
  }
  // "look at top N, place any number among them on top and the rest on the bottom, in any order" —
  // a top/bottom-split variant with no Outside Area involved.
  async function lookTopSplitTopBottom(p, n, title) {
    n = Math.min(n, p.deck.length);
    if (!n) return;
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title, null, n);
    const toBottom = [];
    picked.sort((a, b) => b - a).forEach(i => { toBottom.push(revealed.splice(i, 1)[0]); });
    p.deck.unshift(...revealed);
    p.deck.push(...toBottom);
    log(`${p.name}: จัดเรียงการ์ดบนสุด ${n} ใบ`);
  }

  // 003 Sei Kai — [On Play] during your turn, if 3+ yellow cards with different traits on your
  // area, you may place 1 card from hand to the Outside Area; if you did, choose up to 1 enemy
  // Front Line character with BP 3000 or less and rest it.
  reg['UA48BT-KGD-1-003'] = {
    async onPlay(G, p, unit) {
      if (!isYourTurn(p) || countDistinctYellowTraits(p) < 3) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (!discarded) return;
      await H.restEnemyFront(p, 3000);
    },
  };

  // 008 Ka Rin — [When Attacking] if this character's BP is 4000 or more, draw 1.
  reg['UA48BT-KGD-1-008'] = { async onAttack(G, p, unit) { if (Engine.bp(unit) >= 4000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 014 Shou Hei Kun — cannot be played on/moved to the Front Line. @[Main][Rest] choose any
  // number of yellow characters on your Front Line, move them to the Energy Line.
  reg['UA48BT-KGD-1-014'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = p.front.filter(u => u.card.type === 'Character' && u.card.color === 'Yellow');
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      for (const t of [...targets]) if (p.energy.length < 4) await Engine.moveUnitFree(p, t, 'energy');
    },
  };

  // 015 Haku Rei — [Main][Rest][1/turn] choose 1 of: choose up to 1 character with original BP
  // 4000 or more on your area, +1000 BP this turn; or place 1 card from hand to the Outside Area,
  // then choose up to 1 other character on your area, +1000 BP this turn.
  reg['UA48BT-KGD-1-015'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character (printed BP 4000+) +1000 BP เทิร์นนี้', value: 'a' }, { label: 'วางการ์ดจากมือ + character อื่น +1000 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.bp || 0) >= 4000);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      } else {
        const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
        if (discarded) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      }
    },
  };

  // 019 Kaine — [On Retire] if there is a Ri Boku on your area, free-play 1 yellow character
  // (other than Kaine, need<=2, ap1) from your hand rested.
  reg['UA48BT-KGD-1-019'] = {
    async onSideline(G, p, unit) {
      if (!H.hasCardNamed(p, 'Ri Boku')) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && c.name !== 'Kaine' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 025 Ri Boku — [On Play] look at the top 2 of your deck, place any number on top and the rest
  // on the bottom, in any order.
  reg['UA48BT-KGD-1-025'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 028 "Coalition Army Assemble" — draw 2. If 3+ yellow cards with different traits on your
  // area, draw 1 more.
  reg['UA48BT-KGD-1-028'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (countDistinctYellowTraits(p) >= 3) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`); }
    },
  };

  // 030 "Who Is The Strongest!?" — choose 1 enemy Front Line character with BP <= (Trait:Chu cards
  // on your area x1000), retire it. If a Trait:Chu card with BP 5000+ is on your area, choose up
  // to 1 Trait:Chu character on your area and move it to another line.
  reg['UA48BT-KGD-1-030'] = {
    async onEvent(G, p, card) {
      const n = countTraitCards(p, 'Chu');
      await H.retireEnemyFront(p, n * 1000);
      if (![...p.front, ...p.energy].some(u => (u.card.traits || '').includes('Chu') && Engine.bp(u) >= 5000)) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Chu'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Chu`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 033 "I, the God of War, Hou Ken" — reveal the card at the bottom of your deck and add it to
  // your hand. If it's a yellow Hou Ken with AP cost 1, play it to your area rested instead.
  reg['UA48BT-KGD-1-033'] = {
    async onEvent(G, p, card) {
      if (!p.deck.length) return;
      const no = p.deck.pop();
      const c = byNo(no);
      log(`${card.name}: เปิดเจอ ${c?.name} จากล่างสุดของเด็ค`);
      if (c && c.type === 'Character' && c.color === 'Yellow' && (c.name || '').includes('Hou Ken') && (c.ap || 0) === 1) {
        p.hand.push(no);
        await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false });
      } else { p.hand.push(no); log(`${card.name}: เพิ่มเข้ามือ`); }
    },
  };

  // 037 Mou Ten — [Main][Rest][1/turn] at the start of this turn's Attack Phase, untap 1 AP. This
  // character gains "at the end of your Main Phase, retire this character."
  reg['UA48BT-KGD-1-037'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      unit._pendingApActiveAttackPhase = true;
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: จะ retire ตัวเองตอนจบ Main Phase`);
    },
    async onAttackPhaseStart(G, p, unit) {
      if (!unit._pendingApActiveAttackPhase) return;
      unit._pendingApActiveAttackPhase = false;
      await H.apUntap(p, 1);
    },
  };

  // 041 Ou Hon — [When Attacking] you may pay 1 AP; if you did, +2500 BP this turn.
  reg['UA48BT-KGD-1-041'] = {
    async onAttack(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (v && Engine.payAP(p, 1)) { unit.bpMod += 2500; log(`${unit.card.name}: +2500 BP เทิร์นนี้`); }
    },
  };

  // 046 Ka Ryo Ten — [On Play] add up to 1 (Trait:Hi Shin Unit or Event Card) with need<=2 from
  // your Outside Area to your hand.
  reg['UA48BT-KGD-1-046'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.type === 'Event' || (c.traits || '').includes('Hi Shin Unit')) && (c.need || 0) <= 2, `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 047 Kyou Kai — [On Play] look at the top 2, place up to 1 blue Trait:Hi Shin Unit among them
  // to the Outside Area, remainder to the top.
  reg['UA48BT-KGD-1-047'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.color === 'Blue' && (c.traits || '').includes('Hi Shin Unit')); } };

  // 048 Kyou Kai — [On Play] if this character was played by your effect, draw 1.
  reg['UA48BT-KGD-1-048'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 058 Den Yuu — [Your Turn] if 4+ distinct-named Trait:Hi Shin Unit cards on your area, +1000 BP.
  reg['UA48BT-KGD-1-058'] = { bpBonus(p, unit) { return (isYourTurn(p) && countDistinctNamedTrait(p, 'Hi Shin Unit') >= 4) ? 1000 : 0; } };

  // 059 Bi Hei — [On Play] choose up to 1 other Trait:Hi Shin Unit character on your area, +1000
  // BP this turn.
  reg['UA48BT-KGD-1-059'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hi Shin Unit'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Hi Shin Unit`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 066 "Dragon's Talon" — choose 1 enemy Front Line character with BP 5000 or less and return it
  // to their hand. If there is an Ou Hon on your area, retire it instead.
  reg['UA48BT-KGD-1-066'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Ou Hon')) await H.retireEnemyFront(p, 5000);
      else await H.bounceEnemyFront(p, 5000);
    },
  };

  // 071 "Sai's Residents" — [On Retire] if there is an Ei Sei on your area, draw 1.
  reg['UA48BT-KGD-1-071'] = { async onSideline(G, p, unit) { if (H.hasCardNamed(p, 'Ei Sei')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 073 Shou Hei Kun (2nd print) — [On Play] choose 1 of: look at the top 3, place up to 1 to the
  // Outside Area, remainder to the top; or return 1 character (need<=2) on your area to hand, if
  // you did, choose up to 1 other character and set it active.
  reg['UA48BT-KGD-1-073'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 3 ใบ', value: 'a' }, { label: 'คืน character (Energy 2 หรือน้อยกว่า) กลับมือ + ตั้ง character อื่นเป็น Active', value: 'b' },
      ]);
      if (v === 'a') { await H.lookTopAndDiscard(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.need || 0) <= 2);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.rested);
      if (!others.length) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: เลือก character อื่นให้ Active`, true);
      const t2 = others.find(x => x.uid === uid2);
      if (t2) { t2.rested = false; log(`${unit.card.name}: ${t2.card.name} Active`); }
    },
  };

  // 076 Duke Hyou — [When Attacking] choose 1 of: this character gains "when attacking and not
  // blocked, draw 1" this turn; or if 4+ characters with different names on your Front Line, draw 1.
  reg['UA48BT-KGD-1-076'] = {
    async onAttack(G, p, unit) {
      const opts = [{ label: 'ได้รับ "โจมตีแล้วไม่ถูก block จั่ว 1 ใบ" เทิร์นนี้', value: 'a' }];
      if (countDistinctFrontNames(p) >= 4) opts.push({ label: 'จั่ว 1 ใบ', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { unit._grantedUnblockedDraw = true; log(`${unit.card.name}: ได้รับความสามารถชั่วคราว`); }
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 078 Mou Bu — [On Play] if it is your turn, you may pay 1 AP; if you did, choose 1 of: choose
  // up to 1 enemy Front Line character with BP 4500+ and retire it; or if 4+ characters with
  // different names on your Front Line, choose up to 1 enemy Front Line character with BP 3500+
  // and retire it.
  reg['UA48BT-KGD-1-078'] = {
    async onPlay(G, p, unit) {
      if (!isYourTurn(p) || Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const opts = [{ label: 'retire character ศัตรู (BP 4500 ขึ้นไป)', value: 'a' }];
      if (countDistinctFrontNames(p) >= 4) opts.push({ label: 'retire character ศัตรู (BP 3500 ขึ้นไป)', value: 'b' });
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      await retireEnemyFrontMin(p, v2 === 'b' ? 3500 : 4500);
    },
  };

  // 079 Ryo Fui — [On Play] you may place 1 card from hand to the Outside Area; if you did, draw
  // 1 (or 2 if that card was Ei Sei).
  reg['UA48BT-KGD-1-079'] = {
    async onPlay(G, p, unit) {
      const idxBefore = p.sideline.length;
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      const n = (byNo(no)?.name || '').includes('Ei Sei') ? 2 : 1;
      Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`);
    },
  };

  // 082 Ogiko — [On Retire] if it is your turn, untap 1 AP.
  reg['UA48BT-KGD-1-082'] = { async onSideline(G, p, unit) { if (isYourTurn(p)) await H.apUntap(p, 1); } };

  // 087 Koku'Ou — [On Play] you may retire 1 other Trait:Kan Ki Army character on your area; if
  // you did, draw 2.
  reg['UA48BT-KGD-1-087'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kan Ki Army'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire Trait:Kan Ki Army?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 090 Ma Ron — [On Play] choose up to 1 other Trait:Kan Ki Army character on your area, it gains
  // "[On Retire] add this card to your hand" this turn.
  reg['UA48BT-KGD-1-090'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.name !== 'Ma Ron' && (u.card.traits || '').includes('Kan Ki Army'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Kan Ki Army`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t._grantRetireToHandTurn = Engine.G.turn;
      (t._watchers ||= []).push(async (G2, owner, u2) => {
        if (u2._grantRetireToHandTurn !== Engine.G.turn) return;
        const si = owner.sideline.indexOf(u2.no);
        if (si >= 0) { owner.sideline.splice(si, 1); owner.hand.push(u2.no); log(`${u2.card.name}: กลับเข้ามือ (ได้รับความสามารถชั่วคราว)`); }
      });
      log(`${unit.card.name}: ${t.card.name} ได้รับ "[On Retire] กลับเข้ามือ" เทิร์นนี้`);
    },
  };

  // 092 Rin Gyoku — [On Play] look at the top 2, place up to 1 Trait:Kan Ki Army among them to the
  // Outside Area, remainder to the top.
  reg['UA48BT-KGD-1-092'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Kan Ki Army')); } };

  // 094 Kankoku Pass (Field) — [Main][Retire this card] choose up to 1 Trait:Qin character on your
  // area, +2000 BP until the start of your next turn.
  reg['UA48BT-KGD-1-094'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Qin'));
      await Engine.sidelineUnit(p, unit, 'effect');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Qin`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpPersist += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP จนถึงต้นเทิร์นหน้า`); }
    },
  };

  // 097 "You're Getting Too Excited" — usable only if there is a Kan Ki on your area. Choose 1
  // enemy Front Line character with BP 5000 or less and retire it. If a character was retired this
  // turn, choose up to 1 Trait:Kan Ki Army character on your area, +1000 BP this turn.
  reg['UA48BT-KGD-1-097'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Kan Ki')) return;
      await H.retireEnemyFront(p, 5000);
      if (!Engine.G.retiredThisTurn) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kan Ki Army'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Kan Ki Army`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 098 "Human Nature is --- Light" — usable only if there is an Ei Sei on your area. Choose 1
  // enemy Front Line character with BP <= (Trait:Qin cards on your area x1000) and retire it.
  reg['UA48BT-KGD-1-098'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Ei Sei')) return;
      await H.retireEnemyFront(p, countTraitCards(p, 'Qin') * 1000);
    },
  };

  // 100 "We Will Definitely Protect Our Kingdom!!" — free-play up to 1 red character (need=0) from
  // your Outside Area to your area rested. If there is an Ei Sei on your Front Line, up to 2 instead.
  reg['UA48BT-KGD-1-100'] = {
    async onEvent(G, p, card) {
      const n = p.front.some(u => (u.card.name || '').includes('Ei Sei')) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) === 0; });
        if (idx < 0) break;
        await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 101 Ei Sei — [Main][Frontline][1/turn] choose up to 1 other character on your area, it gains
  // "[When Attacking] draw up to 1 card" this turn.
  reg['UA48ST-KGD-1-101'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedAttackDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "โจมตีแล้วจั่ว 1 ใบ" เทิร์นนี้`); }
    },
  };

  // 104 Ka Ryo Ten (2nd print) — [Main][Rest+Retire] free-play 1 blue Trait:Hi Shin Unit (other
  // than Ka Ryo Ten, need<=2) from your Outside Area to your area rested.
  reg['UA48ST-KGD-1-104'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && c.name !== 'Ka Ryo Ten' && (c.traits || '').includes('Hi Shin Unit') && (c.need || 0) <= 2; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 105 Kyou Kai (2nd print) — [Main][1/turn] move this character to another line.
  reg['UA48ST-KGD-1-105'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, unit, p.front.includes(unit) ? 'energy' : 'front');
    },
  };

  // 106 Shin — passive: if 4+ distinct-named Trait:Hi Shin Unit cards on your area, +1000 BP.
  reg['UA48ST-KGD-1-106'] = { bpBonus(p, unit) { return countDistinctNamedTrait(p, 'Hi Shin Unit') >= 4 ? 1000 : 0; } };

  // 112 Ou Sen — [On Play] you may return 1 other character (need<=2) on your area to hand; if you
  // did, set this character active. @[On Retire] if you don't have a [Raid] character on your
  // Front Line, you may place 1 card from hand to the Outside Area; if you did, add this card to
  // your hand.
  reg['UA48ST-KGD-1-112'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.need || 0) <= 2);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน character (Energy 2 หรือน้อยกว่า) กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      unit.rested = false; log(`${unit.card.name}: Active`);
    },
    async onSideline(G, p, unit) {
      if (p.front.some(u => Engine.parseKeywords(u.card).raidTargets.length)) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (!discarded) return;
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
    },
  };
})();
