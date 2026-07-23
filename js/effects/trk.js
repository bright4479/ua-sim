// ══════════ UA SIM — Toriko (TRK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // several cards print "This card is also treated as having required energy of N" for the sole
  // purpose of "total required energy of characters on your area" combo checks — this computes
  // that total honoring any such override.
  function treatedNeed(c) {
    const m = (c.effect || '').match(/also treated as having required energy of (\d+)/i);
    return m ? parseInt(m[1]) : (c.need || 0);
  }
  function totalTreatedNeed(owner) {
    return [...owner.front, ...owner.energy].filter(u => u.card.type === 'Character').reduce((s, u) => s + treatedNeed(u.card), 0);
  }
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
  async function lookTopKeepOnTopRestOutside(p, unit, n, title) {
    const cnt = Math.min(n, p.deck.length);
    if (!cnt) return;
    const revealed = p.deck.splice(0, cnt);
    const keepIdxs = await p.controller.chooseRevealPick(p, revealed, title, null, revealed.length);
    const keepSet = new Set(keepIdxs);
    const keep = [], outside = [];
    revealed.forEach((no, i) => (keepSet.has(i) ? keep : outside).push(no));
    p.deck.unshift(...keep);
    p.sideline.push(...outside);
    p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + outside.length;
    log(`${unit.card.name}: ดูการ์ดบนสุด ${cnt} ใบ`);
  }

  // 007 Coco — [On Play] choose up to 1 enemy Front Line character BP≥1500, -1000 BP this turn.
  reg['TRK-1-007'] = { async onPlay(G, p, unit) { await debuffEnemyFrontMin(p, 1500, -1000); } };

  // 008 Coco — [On Play] reveal the top card of your deck; if it's Trait:Four Heavenly Kings, add
  // it to hand, else keep it on top.
  reg['TRK-1-008'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const no = p.deck[0];
      const c = byNo(no);
      if (c && (c.traits || '').includes('Four Heavenly Kings')) { p.deck.shift(); p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); }
      else log(`${unit.card.name}: เก็บการ์ดไว้บนสุดของเด็ค`);
    },
  };

  // 014 Zebra — [When Attacking] choose up to 1 other own character +500 BP this turn.
  reg['TRK-1-014'] = { async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); } };

  // 015 Zebra — [When Attacking] may place 1 Trait:Four Heavenly Kings card from hand to Outside
  // Area; if did, draw 1.
  reg['TRK-1-015'] = {
    async onAttack(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('Four Heavenly Kings'));
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:Four Heavenly Kings จากมือไป Outside Area เพื่อจั่ว 1 ใบ?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 027 "Super Hair Shot" — choose 1 enemy Front Line character and rest it (or rest it + skip its
  // next stand + draw 1 instead, if own Sunny).
  reg['TRK-1-027'] = {
    async onEvent(G, p, card) {
      const t = await H.restEnemyFront(p, null);
      if (t && H.hasCardNamed(p, 'Sunny')) { t.skipNextStand = true; Engine.draw(p, 1); log(`${card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป — จั่ว 1 ใบ`); }
    },
  };

  // 028 "Beat Punch" — choose 1 own character +2000 BP this turn, draw 1. (Skipped: the granted
  // "must block your opponent's attack if possible" clause on Zebra — forced-block gap.)
  reg['TRK-1-028'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 030 "Jewel Meat" — choose 1 own character +1000 BP this turn (until start of your next turn
  // instead, if it's Sunny), draw 1.
  reg['TRK-1-030'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          if ((t.card.name || '').includes('Sunny')) { t.bpPersist += 1000; log(`${card.name}: ${t.card.name} +1000 BP จนถึงต้นเทิร์นหน้า`); }
          else { t.bpMod += 1000; log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
        }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 031 "Meteor Garlic" — choose 1 own character +2000 BP this turn, draw 1 (also [Impact +1] if it's Coco).
  reg['TRK-1-031'] = {
    async onEvent(G, p, card) {
      const t = await H.buffOwnCharacter(p, 2000);
      if (t && (t.card.name || '').includes('Coco')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 032 "Mellow Cola" — choose 1 own character +2000 BP this turn, draw 1 (draw 1 additional if it's Zebra).
  reg['TRK-1-032'] = {
    async onEvent(G, p, card) {
      const t = await H.buffOwnCharacter(p, 2000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (t && (t.card.name || '').includes('Zebra')) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`); }
    },
  };

  // 033 "Medicinal Mochi" — draw 1. (Skipped: the granted "unaffected by BP-reducing effects"
  // immunity — BP debuffs apply directly via `bpMod -= N` scattered across many scripts, with no
  // single choke point to check an immunity flag against; auditing every debuff site project-wide
  // isn't worth it for one card.)
  reg['TRK-1-033'] = { async onEvent(G, p, card) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); } };

  // 034 Aimaru — [Skipped]: "[On Play] choose 1 other own Front Line character, during your
  // opponent's next turn give it a targeting-tax (+1 AP to choose it)" — the targeting-tax
  // mechanic has no supporting hook, same recurring gap noted for TSK/OPM/HIQ cards this session.

  // 045 Melk the Second — [On Play] choose up to 1 other own character +1000 BP this turn (+2000
  // instead if own Komatsu).
  reg['TRK-1-045'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, H.hasCardNamed(p, 'Komatsu') ? 2000 : 1000, { excludeUnit: unit }); },
  };

  // 046 Mansam — also treated as need 5. @[When Attacking] if total treated-required-energy of
  // your area's characters is 20+, draw 1.
  reg['TRK-1-046'] = {
    async onAttack(G, p, unit) { if (totalTreatedNeed(p) >= 20) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 048 Love — also treated as need 5. @[On Play] look at top 2, place any number on top (any
  // order), remainder to the Outside Area.
  reg['TRK-1-048'] = { async onPlay(G, p, unit) { await lookTopKeepOnTopRestOutside(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 049 Rin — [On Play] if own Toriko on area, choose up to 1 enemy Front Line character BP≤3000
  // and rest it.
  reg['TRK-1-049'] = {
    async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Toriko')) await H.restEnemyFront(p, 3000); },
  };

  // 051 Yosaku — also treated as need 5. @[On Play] if total treated-required-energy is 20+, may
  // place 1 card from hand to Outside Area; if did, fetch up to 1 character card (need≥5) from
  // Outside Area to hand.
  reg['TRK-1-051'] = {
    async onPlay(G, p, unit) {
      if (totalTreatedNeed(p) < 20) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.need || 0) >= 5, `${unit.card.name}: เลือก character (Energy≥5) จาก Outside Area`);
    },
  };

  // 060 "Gourmet Spicer" (Field) — "Play this Field in active." (kw.entersActive, generic)
  // @[Main][Rest][Discard1][1/turn] this turn, reduce the AP cost of the next Trait:Ingredients
  // card from your hand by 1 (uses `p.pendingDiscount`).
  reg['TRK-1-060'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.discardFromHand(p);
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Ingredients'), apDelta: -1 };
      log(`${unit.card.name}: การ์ด Trait:Ingredients ใบถัดไป ลด AP cost 1`);
    },
  };

  // 063 "Knocking" — choose up to 1 enemy Front Line character, give it "cannot attack or block"
  // until the end of your opponent's next Attack Phase (approximated via `tempCannotAttack`/
  // `tempCannotBlock`, cleared at the start of the card owner's next-but-one turn). Draw 1 if own
  // Jiro or Teppei.
  reg['TRK-1-063'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          t.tempCannotAttack = true; t.tempCannotBlock = true;
          const dueTurn = Engine.G.turn + 3;
          Engine.scheduleDelayedAction(dueTurn, () => { t.tempCannotAttack = false; t.tempCannotBlock = false; });
          log(`${card.name}: ${t.card.name} ห้ามโจมตีหรือ block จนกว่าจะผ่าน Attack Phase ถัดไปของฝ่ายตรงข้าม`);
        }
      }
      if (H.hasCardNamed(p, 'Jiro') || H.hasCardNamed(p, 'Teppei')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 064 "Ozone Herb" — draw 2. Free-play up to 1 Toriko and up to 1 Komatsu (fulfilled energy,
  // ap1) from your hand to your area rested. (Skipped: the "or raid" alternative, same gap noted
  // for several cards this session.)
  reg['TRK-1-064'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      for (const name of ['Toriko', 'Komatsu']) {
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes(name) && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
        if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      }
    },
  };

  // 065 "Rainbow Fruit" — choose up to 1 own Front Line character +1000 BP and [Impact +1] this
  // turn (draw 1 if own Komatsu).
  reg['TRK-1-065'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; t.tempImpact += 1; log(`${card.name}: ${t.card.name} +1000 BP และ [Impact +1] เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Komatsu')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 066 "BB Corn" — choose up to 1 own character +2000 BP this turn. If own Toriko or Terry Cloth,
  // set 1 of your AP cards to active.
  reg['TRK-1-066'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2000);
      if (H.hasCardNamed(p, 'Toriko') || H.hasCardNamed(p, 'Terry Cloth')) await H.apUntap(p, 1);
    },
  };

  // 067 Detonation Bug — "if retired, goes to the Remove Area instead" (kw.retireToRemoval,
  // generic). @[On Play] if played from the Outside Area, place up to 2 cards from the top of your
  // deck to the Outside Area.
  reg['TRK-1-067'] = {
    async onPlay(G, p, unit) {
      if (!unit._playedFromSideline) return;
      const n = Math.min(2, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
    },
  };

  // 068 Giant Parasite — "if retired, goes to the Remove Area instead" (kw.retireToRemoval,
  // generic). Passive: if 3+ total Trait:Parasitic Insect cards in your Outside Area + Remove
  // Area, +500 BP.
  reg['TRK-1-068'] = {
    bpBonus(p, unit) {
      const n = [...p.sideline, ...p.removal].filter(no => (byNo(no)?.traits || '').includes('Parasitic Insect')).length;
      return n >= 3 ? 500 : 0;
    },
  };

  // 069 Parasite Emperor — "if retired, goes to the Remove Area instead" (kw.retireToRemoval,
  // generic). @[On Play] if played from the Outside Area and 3+ total Trait:Parasitic Insect cards
  // in your Outside Area + Remove Area, choose up to 1 enemy Front Line character -2000 BP this turn.
  reg['TRK-1-069'] = {
    async onPlay(G, p, unit) {
      if (!unit._playedFromSideline) return;
      const n = [...p.sideline, ...p.removal].filter(no => (byNo(no)?.traits || '').includes('Parasitic Insect')).length;
      if (n < 3) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 2000; log(`${unit.card.name}: ${t.card.name} -2000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 070 Teppei — [On Play] choose up to 1 enemy character (either line), give it "cannot move"
  // until the start of your next turn.
  reg['TRK-1-070'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.tempCannotMove = true;
      const dueTurn = Engine.G.turn + 2;
      Engine.scheduleDelayedAction(dueTurn, () => { t.tempCannotMove = false; });
      log(`${unit.card.name}: ${t.card.name} ห้ามเคลื่อนที่จนถึงต้นเทิร์นหน้าของคุณ`);
    },
  };

  // 071 Alfaro — [Main][Frontline][Discard1][1/turn] choose 1 enemy Front Line character -1000 BP this turn.
  reg['TRK-1-071'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 072 GT Robo — passive: on your turn, if a card with original BP≥3000 is stacked under this
  // character (Raid), +500 BP. @[On Play] if you placed a card from hand to Outside Area this
  // turn, draw 1. @[On Retire] return the bottom card of this character's Raid stack to hand.
  reg['TRK-1-072'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return unit.under.some(no => (byNo(no)?.bp || 0) >= 3000) ? 500 : 0;
    },
    async onPlay(G, p, unit) {
      if (p._placedToOutsideThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
    async onSideline(G, p, unit) {
      if (!unit.under.length) return;
      const no = unit.under[unit.under.length - 1];
      unit.under = unit.under.slice(0, -1);
      p.sideline.push(...unit.under);
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} (การ์ดล่างสุดของ Raid stack) เข้ามือ`);
    },
  };

  // 074 Bogie Woods — [Main][Rest] choose up to 1 other own character +1000 BP this turn. Return
  // this card to your hand.
  reg['TRK-1-074'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 075 Coco — [On Play] look at top 2, place any number on top (any order), remainder to the
  // Outside Area.
  reg['TRK-1-075'] = { async onPlay(G, p, unit) { await lookTopKeepOnTopRestOutside(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 084 Grinpatch — [On Play] if there's an open space on opponent's Front Line, may place 1 card
  // from hand to Outside Area; if did, choose up to 1 enemy Energy Line character with generated
  // energy of 1, move it to the Front Line. (Skipped: "unaffected by BP reducing effects" passive
  // immunity, same class of unscriptable immunity noted for TRK-1-033.)
  reg['TRK-1-084'] = {
    async onPlay(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      const enemy = Engine.opponentOf(p);
      if (enemy.front.length >= 4) return;
      const targets = enemy.energy.filter(u => u.card.type === 'Character' && (u.card.gen || 0) === 1);
      if (!targets.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูบน Energy Line (gen=1)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(enemy, t, 'front');
    },
  };

  // 085 Starjun — [Main][Discard1][1/turn] self +1000 BP this turn.
  reg['TRK-1-085'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 089 Tommyrod — [On Play] look at top 5, place up to 1 Trait:Parasitic Insect to the Outside
  // Area, remainder back on top.
  reg['TRK-1-089'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 5, 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`, c => (c.traits || '').includes('Parasitic Insect')); } };

  // 090 Tommyrod — [On Play] choose up to 1 own Trait:Parasitic Insect or Tommyrod, [Impact +1] this turn.
  reg['TRK-1-090'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Parasitic Insect') || (u.card.name || '').includes('Tommyrod'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 096 Chiyo — [On Play] may place 1 card from hand to Outside Area; if did, opponent places 1
  // card from their hand to the Outside Area.
  reg['TRK-1-096'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const enemy = Engine.opponentOf(p);
      if (!enemy.hand.length) return;
      const i = await enemy.controller.chooseCardFromHand(enemy, `${unit.card.name}: เลือกการ์ดจากมือไป Outside Area (ถูกบังคับ)`);
      if (i == null) return;
      const no = enemy.hand.splice(i, 1)[0];
      enemy.sideline.push(no);
      log(`${unit.card.name}: ${enemy.name} ส่ง ${byNo(no)?.name} จากมือไป Outside Area`);
    },
  };

  // 097 "Gourmet Corp Headquarters" (Field) — "Play this Field in active." (kw.entersActive,
  // generic) @[Main][Rest][Discard1] choose 1 own Trait:Gourmet Corp, give it "[When Attacking]
  // draw 1 card" this turn (uses the existing `_grantedAttackDraw` temp flag).
  reg['TRK-1-097'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Gourmet Corp'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Gourmet Corp`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedAttackDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "เมื่อโจมตี จั่ว 1 ใบ" เทิร์นนี้`); }
    },
  };

  // 104 Teppei — [On Play] add up to 1 Trait:Ingredient card from your Outside Area to your hand.
  reg['TRK-1-104'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Ingredient'), `${unit.card.name}: เลือก Trait:Ingredient จาก Outside Area`); } };

  // 107 Komatsu — [On Play] if own Toriko on area, this turn reduce the AP cost of the next
  // Trait:Ingredient card from hand by 1. @[Main][Rest] only if you used a Trait:Ingredient card
  // from hand this turn: draw 1, place 1 card from hand to Outside Area.
  reg['TRK-1-107'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Toriko')) return;
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Ingredient'), apDelta: -1 };
      log(`${unit.card.name}: การ์ด Trait:Ingredient ใบถัดไป ลด AP cost 1`);
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p._playedTraitsThisTurn?.has('ingredients')) { p.controller.notify?.('ต้องใช้การ์ด Trait:Ingredient มาก่อนในเทิร์นนี้'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // UAPR-TRK-P-001 Coco — [On Play] choose up to 1 own Trait:Four Heavenly Kings character +1000
  // BP this turn; if own Toriko, Sunny and Zebra are all on your Front Line, set the chosen
  // character active.
  reg['UAPR-TRK-P-001'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Four Heavenly Kings'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Four Heavenly Kings`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000;
      log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      if (['Toriko', 'Sunny', 'Zebra'].every(n => p.front.some(u => (u.card.name || '').includes(n)))) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // UAPR-TRK-P-002 Toriko — [On Play] may pay 1 AP; if did, look at top 7, reveal up to 1 blue
  // Trait:Ingredient (any distinct name) and up to 1 Komatsu among them, add to hand, remainder to
  // the bottom. @[When Attacking] if you used a Trait:Ingredient card from hand this turn, choose
  // up to 1 own character +2000 BP this turn.
  reg['UAPR-TRK-P-002'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อดูการ์ดบนสุด 7 ใบ?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const n = Math.min(7, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const taken = [];
      let idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('Ingredient'); });
      if (idx >= 0) taken.push(revealed.splice(idx, 1)[0]);
      idx = revealed.findIndex(no => (byNo(no)?.name || '').includes('Komatsu'));
      if (idx >= 0) taken.push(revealed.splice(idx, 1)[0]);
      for (const no of taken) { p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); }
      p.deck.push(...revealed);
    },
    async onAttack(G, p, unit) {
      if (p._playedTraitsThisTurn?.has('ingredients')) await H.buffOwnCharacter(p, 2000);
    },
  };
})();
