// ══════════ UA SIM — Attack on Titan (AOT) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function usedTraitThisTurn(p, sub) { return [...(p._playedTraitsThisTurn || [])].some(t => t.includes(sub.toLowerCase())); }
  function countDistinctYellowNonRumbling(p) {
    const names = new Set();
    for (const u of [...p.front, ...p.energy])
      if (u.card.type === 'Character' && u.card.color === 'Yellow' && !(u.card.traits || '').includes('Rumbling')) names.add(u.card.name);
    return names.size;
  }
  function eventCountInSideline(p) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length; }
  function markPaidApInAttack(p) { p._paidApAttackPhaseTurn = Engine.G.turn; }
  async function buffMarleyanRaidAware(p, unit, title) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Marleyan Warriors'));
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, title, true);
    const t = targets.find(x => x.uid === uid);
    if (!t) return;
    const raided = t.under.length > 0;
    const delta = raided ? 2000 : 1000;
    t.bpMod += delta;
    if (raided) unit.bpMod += 2000;
    log(`${unit.card.name}: ${t.card.name} +${delta} BP เทิร์นนี้${raided ? ` (${unit.card.name} ก็ +2000 BP ด้วย เพราะเป้าหมายอยู่ในสถานะ Raid)` : ''}`);
  }
  // "look at top N, place up to M among them to the Outside Area, remaining to the BOTTOM of your
  // deck" — a bottom-remainder variant of common.js's lookTopAndDiscard (which returns the
  // remainder to the TOP instead).
  async function lookTopDiscardRemainderBottom(p, n, maxDiscard, title, predicate) {
    n = Math.min(n, p.deck.length);
    if (!n) return [];
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title, predicate || null, maxDiscard);
    const sent = [];
    picked.sort((a, b) => b - a).forEach(i => { sent.push(revealed.splice(i, 1)[0]); });
    for (const no of sent) { p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${p.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`); }
    p.deck.push(...revealed);
    return sent;
  }

  // 003 Hange Zoë — [On Play] choose 1 active Trait:Titan Successor or Trait:Pure Titan card on
  // either area and you may rest it. If you did, the owner of the rested character draws 1.
  reg['AOT-1-003'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const pred = u => !u.rested && u.card.type === 'Character' && /Titan Successor|Pure Titan/i.test(u.card.traits || '');
      const targets = [...p.front, ...p.energy, ...enemy.front, ...enemy.energy].filter(pred);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (ของคุณหรือศัตรู)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน ${t.card.name}?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      t.rested = true;
      const owner = p.front.includes(t) || p.energy.includes(t) ? p : enemy;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(owner, 1); log(`${owner.name}: จั่ว 1 ใบ`);
    },
  };

  // 004 Eld Gin — [Your Turn] during this turn's Attack Phase, if you paid an AP, +2000 BP.
  reg['AOT-1-004'] = { bpBonus(p, unit) { return (isYourTurn(p) && p._paidApAttackPhaseTurn === Engine.G.turn) ? 2000 : 0; } };

  // 006 Petra Rall — [On Play] at the start of this turn's Attack Phase, choose up to 1 of your AP
  // cards and set it active.
  reg['AOT-1-006'] = {
    async onPlay(G, p, unit) { unit._pendingApActiveAttackPhase = true; },
    async onAttackPhaseStart(G, p, unit) {
      if (!unit._pendingApActiveAttackPhase) return;
      unit._pendingApActiveAttackPhase = false;
      await H.apUntap(p, 1);
    },
  };

  // 008/009 Levi — [When Attacking] you may pay 1 AP; if you did, draw 1 and this character gets
  // +500/+1000 BP this turn.
  function makeLeviPayAttack(bpGain) {
    return async function (G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      markPaidApInAttack(p);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.bpMod += bpGain; log(`${unit.card.name}: +${bpGain} BP เทิร์นนี้`);
    };
  }
  reg['AOT-1-008'] = { onAttack: makeLeviPayAttack(500) };
  reg['AOT-1-009'] = { onAttack: makeLeviPayAttack(1000) };

  // 010 Levi — @[Frontline] at the start of your Attack Phase, if active, untap 1 AP. @[When
  // Attacking] you may pay 1 AP; if you did, choose up to 1 character on your area, +1000 BP and
  // (approximated as untargetable) "cannot be chosen by your opponent's trigger effects" until end
  // of turn.
  reg['AOT-1-010'] = {
    async onAttackPhaseStart(G, p, unit) { if (p.front.includes(unit) && !unit.rested) await H.apUntap(p, 1); },
    async onAttack(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      markPaidApInAttack(p);
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} +1000 BP และป้องกัน trigger effect ของศัตรู จนจบเทิร์น`); }
    },
  };

  // 020 Historia Reiss — [On Play] look at the top 2 of your deck, keep both on top (any order).
  // If there is a character with Ymir in its name on your area, instead choose any number among
  // them to place to the Outside Area, remainder to top.
  reg['AOT-1-020'] = {
    async onPlay(G, p, unit) {
      if (H.hasCardNamed(p, 'Ymir')) await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
      else log(`${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`);
    },
  };

  // 021 Historia Reiss — passive: if there is a character with Ymir in its name on your area,
  // +500 BP. @[On Play][1/turn] if you used an Event Card this turn, untap 1 AP.
  reg['AOT-1-021'] = {
    bpBonus(p, unit) { return H.hasCardNamed(p, 'Ymir') ? 500 : 0; },
    async onPlay(G, p, unit) { if (p._eventsUsedThisTurn) await H.apUntap(p, 1); },
  };

  // 024 Mikasa Ackerman — tiered passive based on the number of Event Cards in your Outside Area:
  // 2+: +1 generated energy; 4+: +1000 BP.
  reg['AOT-1-024'] = {
    genMod(unit, p) { return eventCountInSideline(p) >= 2 ? 1 : 0; },
    bpBonus(p, unit) { return eventCountInSideline(p) >= 4 ? 1000 : 0; },
  };

  // 028 Former Survey Corps Headquarters (Field) — [Main][Rest] reveal the top card of your deck.
  // If it's a blue Character with need<=3, add it to hand; otherwise place it back on top.
  reg['AOT-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.deck.length) return;
      unit.rested = true;
      const c = byNo(p.deck[0]);
      if (c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 3) {
        const no = p.deck.shift(); p.hand.push(no); log(`${unit.card.name}: เปิดเจอ ${c.name} — เพิ่มเข้ามือ`);
      } else log(`${unit.card.name}: เปิดเจอ ${c?.name || '-'} — ไม่ตรงเงื่อนไข วางกลับบนเด็ค`);
    },
  };

  // 031 "Cleaning" — look at the top 2 of your deck, keep any number on top (any order), the rest
  // to the Outside Area. Draw 2.
  reg['AOT-1-031'] = { async onEvent(G, p, card) { await H.lookTopAndDiscard(p, 2, 2, `${card.name}: ดูการ์ดบนสุด 2 ใบ`); Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); } };

  // 036 Kenny Ackerman — [Main][1/turn] only during the turn this character was played: choose 1
  // enemy Front Line character with BP <= this character's BP and retire it. @[Main][Discard 1]
  // this character gets +1000 BP this turn. (Two independent Activate:Main abilities on one card —
  // offer whichever are currently legal.)
  reg['AOT-1-036'] = {
    async onMain(G, p, unit) {
      const opts = [];
      const canRetire = unit.enteredTurn === Engine.G.turn && !unit._retireUsedTurn;
      if (canRetire) opts.push({ label: 'retire character ศัตรู (BP ไม่เกินของตัวเอง)', value: 'retire' });
      if (p.hand.length) opts.push({ label: '[Discard 1] +1000 BP เทิร์นนี้', value: 'buff' });
      if (!opts.length) { p.controller.notify?.('ไม่มี ability ที่ใช้ได้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'retire') { unit._retireUsedTurn = true; await H.retireEnemyFront(p, Engine.bp(unit)); }
      else { const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`); if (discarded) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); } }
    },
  };

  // 046 Zeke Yeager — [Main][Rest] choose 1 Trait:Pure Titans card on your area, +1000 BP this turn.
  reg['AOT-1-046'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Pure Titans'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Pure Titans`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 049 Pure Titans (Titans Relaxing) — [On Retire] free-play 1 Trait:Pure Titans card (need<=2,
  // ap1) from your hand to your area rested.
  reg['AOT-1-049'] = {
    async onSideline(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Pure Titans') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 055 Bertholdt Hoover — [On Play] if you have 6+ generated energy, draw 1.
  reg['AOT-1-055'] = { async onPlay(G, p, unit) { if (Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0) >= 6) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 059 Reiner Braun — passive: if you have 6+ generated energy, +1000 BP.
  reg['AOT-1-059'] = { bpBonus(p, unit) { return Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0) >= 6 ? 1000 : 0; } };

  // 062 Titan Tree Forest (Field) — [Main][Rest][Discard 1][1/turn] +1 generated energy this turn.
  reg['AOT-1-062'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit.rested = true;
      unit.tempGen += 1;
      log(`${unit.card.name}: +1 generated energy เทิร์นนี้`);
    },
  };

  // 064 "We Settle This Right Here!! Right Now!!" — choose 1 of the following (or ALL, if there is
  // a character with Reiner Braun in its name on your area): look at the top 7, reveal up to 2
  // green Character cards and add to hand, remainder to bottom; or free-play up to 2 green
  // Character cards (need>=4, ap1) from hand to your Front Line active (skipped: the "or raid it"
  // alternative).
  reg['AOT-1-064'] = {
    async onEvent(G, p, card) {
      const all = H.hasCardNamed(p, 'Reiner Braun');
      const doA = async () => { await H.lookTopAndTake(p, 7, c => c.type === 'Character' && c.color === 'Green', 2, `${card.name}: ดูการ์ดบนสุด 7 ใบ`); };
      const doB = async () => {
        for (let i = 0; i < 2; i++) {
          const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) >= 4 && (c.ap || 0) === 1; });
          if (idx < 0) break;
          await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: true });
        }
      };
      if (all) { await doA(); await doB(); return; }
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 7 ใบ (เลือก Character สีเขียวเข้ามือ)', value: 'a' }, { label: 'ลง Character สีเขียว (Energy 4+) จากมือ', value: 'b' },
      ]);
      if (v === 'a') await doA(); else await doB();
    },
  };

  // 067 "Are we doing it?! Now?! Here?!" — [1/turn] choose 1 card on your area, grant it "+2
  // generated energy" this turn. If there is a character with Bertholdt Hoover in its name on your
  // area, untap 1 AP.
  reg['AOT-1-067'] = {
    async onEvent(G, p, card) {
      if (p._usedAreWeDoingItTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy];
      if (!targets.length) return;
      p._usedAreWeDoingItTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือกการ์ด`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempGen += 2; log(`${card.name}: ${t.card.name} +2 generated energy เทิร์นนี้`); }
      if (H.hasCardNamed(p, 'Bertholdt Hoover')) await H.apUntap(p, 1);
    },
  };

  // 071 Eren Kruger — [Main][Rest+Retire this card] only if there is a Grisha Yeager on your area:
  // draw 2, place 1 card from hand to the Outside Area.
  reg['AOT-1-071'] = {
    async onMain(G, p, unit) {
      if (!H.hasCardNamed(p, 'Grisha Yeager')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 076 Armin Arlelt — [Your Turn] when this character returns from your area to your hand, you
  // may place 1 red Armin Arlert (need=1) from your hand to the Outside Area. If you did, draw 2,
  // place 1 card from hand to the Outside Area.
  reg['AOT-1-076'] = {
    async onLeaveField(G, p, unit) {
      if (!isYourTurn(p)) return;
      if (!p.hand.includes(unit.no)) return; // only fires on a genuine return-to-hand (already in hand by now)
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.name || '').includes('Armin Arlert') && (c.need || 0) === 1; });
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Armin Arlert สีแดงจากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไป Outside Area`);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 077 Armin Arlelt — [On Play] choose 1 of: choose up to 1 other character on your area, +1000
  // BP this turn (skipped: the "increase the next BP-range effect by +1000" meta clause — the
  // recurring BP-range-increase gap noted since SNF/TLR). @[Main][Frontline][1/turn] re-activate
  // this character's [On Play] effect.
  reg['AOT-1-077'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 082 Sasha Braus — [On Play] choose up to 1 Trait:104th Training Corps card on your area,
  // +1000 BP this turn. If you used a Trait:Ingredients card this turn, set this character active.
  reg['AOT-1-082'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('104th Training Corps'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:104th Training Corps`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      }
      if (usedTraitThisTurn(p, 'ingredient')) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 099 "Vertical Maneuvering Gear" — draw 2. Play up to 2 red Trait:104th Training Corps (need<=3,
  // ap1) from your hand to your Front Line active. (Skipped: the granted "at the end of the Attack
  // Phase, return to hand" clause — the recurring end-of-Attack-Phase hook gap.)
  reg['AOT-1-099'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      for (let i = 0; i < 2; i++) {
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.traits || '').includes('104th Training Corps') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
        if (idx < 0) break;
        await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: true });
      }
    },
  };

  // 100 "Steamed Sweet Potato!" — place up to 3 cards from your hand to the bottom of your deck,
  // draw the same number, untap 1 AP.
  reg['AOT-1-100'] = {
    async onEvent(G, p, card) {
      let n = 0;
      for (let i = 0; i < 3; i++) {
        if (!p.hand.length) break;
        const idx = await p.controller.chooseCardFromHand(p, `${card.name}: วางการ์ดจากมือไปล่างสุดของเด็ค? (${i + 1}/3)`);
        if (idx == null) break;
        p.deck.push(p.hand.splice(idx, 1)[0]); n++;
      }
      if (n) { Engine.draw(p, n); log(`${card.name}: จั่ว ${n} ใบ`); }
      await H.apUntap(p, 1);
    },
  };

  // 104 Armin Arlelt — [On Play][When in Energy Line] choose 1 of: look at the top 3, reveal up to
  // 1 Trait:104th Training Corps (need<=3) and add to hand, remainder to bottom; or free-play 1 red
  // Trait:104th Training Corps (need<=3, ap1) from hand to Front Line active. (Skipped: the granted
  // "at the end of your Attack Phase, return to hand" clause — recurring gap.)
  reg['AOT-1-104'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 3 ใบ (Trait:104th Training Corps)', value: 'a' }, { label: 'ลง Trait:104th Training Corps สีแดงจากมือ', value: 'b' },
      ]);
      if (v === 'a') await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('104th Training Corps') && (c.need || 0) <= 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      else {
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.traits || '').includes('104th Training Corps') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: true });
      }
    },
  };

  // 106 Eren Yeager — passive: if your Life is 3 or less, +1000 BP.
  reg['AOT-1-106'] = { bpBonus(p, unit) { return p.life.length <= 3 ? 1000 : 0; } };

  // 109 "104th Training Corps" — choose 1 enemy Front Line character with BP <= (number of your
  // Trait:104th Training Corps cards x1000) and retire it.
  reg['AOT-1-109'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('104th Training Corps')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 111 Erwin Smith — @[Frontline] at the start of your Attack Phase, if active, untap 1 AP.
  // @[When Attacking] you may pay 1 AP; if you did, +500 BP this turn.
  reg['AOT-1-111'] = {
    async onAttackPhaseStart(G, p, unit) { if (p.front.includes(unit) && !unit.rested) await H.apUntap(p, 1); },
    async onAttack(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      markPaidApInAttack(p);
      unit.bpMod += 500; log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 113 Colossal Titan — cannot be played on the Energy Line. [On Play] choose up to 1 Field card
  // on your opponent's area and retire it. (Skipped: the "Front Line capacity reduced by 1" static
  // clause — would require touching every hardcoded Front Line capacity check across engine.js/
  // bot.js for one card.)
  reg['AOT-1-113'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Field');
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก Field ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // ── EX10BT prints ──

  // 2-002 Onyankopon — [On Play] free-play up to 1 Yellow Character (need<=3, ap1) without
  // Trait:Rumbling from your hand to your area rested. Cannot fetch a duplicate name already on
  // your area.
  reg['EX10BT-AOT-2-002'] = {
    async onPlay(G, p, unit) {
      const ownNames = new Set([...p.front, ...p.energy].map(u => u.card.name));
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && !(c.traits || '').includes('Rumbling') && (c.need || 0) <= 3 && (c.ap || 0) === 1 && !ownNames.has(c.name); });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 2-003 Gabi Braun — [On Play] if 4+ distinct-named Yellow Characters without Trait:Rumbling on
  // your area, choose up to 1 other character +1500 BP this turn.
  reg['EX10BT-AOT-2-003'] = { async onPlay(G, p, unit) { if (countDistinctYellowNonRumbling(p) >= 4) await H.buffOwnCharacter(p, 1500, { excludeUnit: unit }); } };

  // 2-005 Conny Springer — passive: same condition, +1000 BP.
  reg['EX10BT-AOT-2-005'] = { bpBonus(p, unit) { return countDistinctYellowNonRumbling(p) >= 4 ? 1000 : 0; } };

  // 2-006 Jean Kirschtein — [Your Turn] same condition, +1500 BP.
  reg['EX10BT-AOT-2-006'] = { bpBonus(p, unit) { return (isYourTurn(p) && countDistinctYellowNonRumbling(p) >= 4) ? 1500 : 0; } };

  // 2-012 Armin Arlert — [On Play] draw 1, place 1 card from hand to the Outside Area. If 4+
  // distinct-named Yellow Characters without Trait:Rumbling on your area, just draw 1 instead.
  reg['EX10BT-AOT-2-012'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (countDistinctYellowNonRumbling(p) < 4) await H.discardFromHand(p);
    },
  };

  // 2-021 Eren Yeager — passive: if there is a Founder Ymir on your area or Outside Area, +1
  // generated energy.
  reg['EX10BT-AOT-2-021'] = { genMod(unit, p) { return (H.hasCardNamed(p, 'Founder Ymir') || p.sideline.some(no => (byNo(no)?.name || '').includes('Founder Ymir'))) ? 1 : 0; } };

  // 2-024 Zeke Yeager — [On Play] choose 1 of: look at the top 3, place up to 1 to the Outside
  // Area, remainder to the bottom; or if this character was played from the Outside Area, draw 1.
  reg['EX10BT-AOT-2-024'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'ดูการ์ดบนสุด 3 ใบ', value: 'a' }];
      if (unit._playedFromSideline) opts.push({ label: 'จั่ว 1 ใบ (ลงจาก Outside Area)', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') await lookTopDiscardRemainderBottom(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 2-026 Jaw Titan — passive: if there is a character with "Eren" and a character with "Zeke" in
  // their names on your area, this character also generates energy on the Front Line.
  reg['EX10BT-AOT-2-026'] = { frontGenBonus(p, unit) { return H.hasCardNamed(p, 'Eren') && H.hasCardNamed(p, 'Zeke'); } };

  // 2-030 Tom Ksaver — [On Play]/[On Retire] reveal 2 from the top of your deck, add up to 1 with
  // "Zeke" in its name to hand, remainder to the Outside Area. If added to hand, discard 1.
  async function tomKsaverReveal(p, unit) {
    const n = Math.min(2, p.deck.length);
    if (!n) return;
    const revealed = p.deck.splice(0, n);
    const idx = revealed.findIndex(no => (byNo(no)?.name || '').includes('Zeke'));
    let added = false;
    if (idx >= 0) { p.hand.push(revealed.splice(idx, 1)[0]); added = true; log(`${unit.card.name}: เพิ่มการ์ดที่มี Zeke เข้ามือ`); }
    p.sideline.push(...revealed);
    if (added) await H.discardFromHand(p);
  }
  reg['EX10BT-AOT-2-030'] = {
    async onPlay(G, p, unit) { await tomKsaverReveal(p, unit); },
    async onSideline(G, p, unit) { await tomKsaverReveal(p, unit); },
  };

  // 2-034 "The Rumbling" — usable only if a character with "Eren" and a character with "Zeke" in
  // their names are on your area, and you have 2+ other cards in hand. Place all cards from hand
  // to the Outside Area. Retire all enemy Front Line characters with BP 5000 or less. (Skipped:
  // the granted "cannot attack with characters other than Eren Yeager (Final Titan)" whole-turn
  // restriction — would require a new player-level attack gate touching both attackPhase and
  // bot.js's candidate filter for one card.)
  reg['EX10BT-AOT-2-034'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Eren') || !H.hasCardNamed(p, 'Zeke') || p.hand.length < 2) return;
      p.sideline.push(...p.hand.splice(0));
      log(`${card.name}: วางการ์ดทั้งหมดจากมือไป Outside Area`);
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front.filter(x => Engine.bp(x) <= 5000)) await Engine.sidelineUnit(enemy, u, 'effect');
    },
  };

  // 2-036 "Let's go quickly. To save the world!" — look at the top 5, reveal up to 3 different-
  // named Character cards without Trait:Rumbling and add to hand, remainder to the bottom.
  reg['EX10BT-AOT-2-036'] = { async onEvent(G, p, card) { await H.lookTopAndTake(p, 5, c => c.type === 'Character' && !(c.traits || '').includes('Rumbling'), 3, `${card.name}: ดูการ์ดบนสุด 5 ใบ`); } };

  // 2-039 Hange Zoe — [On Play] choose up to 1 enemy Front Line character with BP 2500 or higher,
  // -2000 BP this turn.
  reg['EX10BT-AOT-2-039'] = { async onPlay(G, p, unit) { await H.debuffEnemyAny(p, -2000, { min: 2500 }); } };

  // 2-040 Levi — [Main][Rest][1/turn] rest 1 active character on your Front Line. If you did,
  // +1 generated energy this turn.
  reg['EX10BT-AOT-2-040'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = p.front.filter(u => !u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Front Line`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; unit.tempGen += 1; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน — +1 generated energy เทิร์นนี้`); }
    },
  };

  // 2-044 Historia Reiss — [Main][Rest] only if 6+ Event Cards in your Outside Area: choose up to
  // 1 other Trait:104th Training Corps, +1000 BP this turn.
  reg['EX10BT-AOT-2-044'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (eventCountInSideline(p) < 6) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = true;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('104th Training Corps'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:104th Training Corps`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 2-045 Historia Reiss — [On Play] choose 1 of: draw 1, place 1 card from hand to the Outside
  // Area; or (2+ Event Cards in Outside Area) draw 1; or (6+ Event Cards in Outside Area) draw 2,
  // place 1 card from hand to the Outside Area.
  reg['EX10BT-AOT-2-045'] = {
    async onPlay(G, p, unit) {
      const n = eventCountInSideline(p);
      const opts = [{ label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }];
      if (n >= 2) opts.push({ label: 'จั่ว 1 ใบ', value: 'b' });
      if (n >= 6) opts.push({ label: 'จั่ว 2 ใบ + วางการ์ดจากมือไป Outside Area', value: 'c' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else if (v === 'b') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 2-047 Armin Arlert — [On Play] look at the top 2, place up to 1 Event Card among them to the
  // Outside Area, remainder to the top.
  reg['EX10BT-AOT-2-047'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.type === 'Event'); } };

  // 2-049 "Thunder Spear" — choose up to 1 enemy Front Line character with BP 2500 or less or BP
  // 4500 or higher, and retire it.
  reg['EX10BT-AOT-2-049'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (Engine.bp(u) <= 2500 || Engine.bp(u) >= 4500));
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 2-050 Gabi Braun — [When Attacking] choose up to 1 other Trait:Marleyan Warriors card on your
  // area, +1000 BP this turn (+2000, and this character also +2000, if the chosen was in Raid State).
  reg['EX10BT-AOT-2-050'] = { async onAttack(G, p, unit) { await buffMarleyanRaidAware(p, unit, `${unit.card.name}: เลือก Trait:Marleyan Warriors`); } };

  // 2-051 Falco Grice — [On Play][When in Energy Line] set self active. @[Main][Rest][Discard 1]
  // choose up to 1 other Trait:Marleyan Warriors card on your area, +1000 BP (+2000 if raided).
  reg['EX10BT-AOT-2-051'] = {
    async onPlay(G, p, unit) { if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit.rested = true;
      await buffMarleyanRaidAware(p, unit, `${unit.card.name}: เลือก Trait:Marleyan Warriors`);
    },
  };

  // 2-055 Pieck Finger — [On Play] choose up to 1 other Trait:Marleyan Warriors card on your area,
  // +1000 BP (+2000 if raided).
  reg['EX10BT-AOT-2-055'] = { async onPlay(G, p, unit) { await buffMarleyanRaidAware(p, unit, `${unit.card.name}: เลือก Trait:Marleyan Warriors`); } };

  // 2-062 Nicolo — [On Play] reduce the AP cost of the next Trait:Ingredient card you use this
  // turn by 1.
  reg['EX10BT-AOT-2-062'] = {
    async onPlay(G, p, unit) {
      p.pendingDiscount = { predicate: c => (c.traits || '').toLowerCase().includes('ingredient'), apDelta: -1 };
      log(`${unit.card.name}: การ์ด Trait:Ingredient ใบถัดไป ลด AP cost 1`);
    },
  };

  // 2-064 Jean Kirschtein — [When Attacking] look at the top 3, place them back on top in any order.
  reg['EX10BT-AOT-2-064'] = { async onAttack(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`); } };

  // 2-065 Sasha Braus — [On Play][1/turn] if you used a Trait:Ingredient card this turn, set self
  // active.
  reg['EX10BT-AOT-2-065'] = { async onPlay(G, p, unit) { if (usedTraitThisTurn(p, 'ingredient')) { unit.rested = false; log(`${unit.card.name}: Active`); } } };

  // 2-073 "Fruits Of The Sea" — choose 1 of: choose up to 1 character +1000 BP this turn, draw 2;
  // or choose up to 2 characters +1000 BP each this turn, draw 1; or choose up to 3 characters
  // +1000 BP each this turn.
  reg['EX10BT-AOT-2-073'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'character 1 ใบ +1000 BP + จั่ว 2 ใบ', value: 'a' }, { label: 'character สูงสุด 2 ใบ +1000 BP + จั่ว 1 ใบ', value: 'b' }, { label: 'character สูงสุด 3 ใบ +1000 BP', value: 'c' },
      ]);
      const picks = v === 'a' ? 1 : v === 'b' ? 2 : 3;
      for (let i = 0; i < picks; i++) await H.buffOwnCharacter(p, 1000);
      if (v === 'a') { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); }
      else if (v === 'b') { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };
})();
