// ══════════ UA SIM — Idolmaster (IMS) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.
// Largest single series in the database (219 cards) — accepts more skips than usual, same as KMR/NIK/MHA.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function countDistinctTrait(p, trait, excludeUnit) {
    const names = new Set();
    for (const u of [...p.front, ...p.energy]) if (u !== excludeUnit && (u.card.traits || '').includes(trait)) names.add(u.card.name);
    return names.size;
  }
  function countRemovalTrait(p, trait) { return p.removal.filter(no => (byNo(no)?.traits || '').includes(trait)).length; }
  async function moveSidelineToRemoval(p, maxN, title) {
    let n = 0;
    for (let i = 0; i < maxN; i++) {
      if (!p.sideline.length) break;
      const idx = await p.controller.chooseCardFromSideline(p, title || `เลือกการ์ดจาก Outside Area ไป Remove Area (${i + 1}/${maxN})`, null);
      if (idx == null) break;
      const no = p.sideline.splice(idx, 1)[0];
      p.removal.push(no);
      n++;
    }
    if (n) log(`${p.name}: ส่งการ์ด ${n} ใบจาก Outside Area ไป Remove Area`);
    return n;
  }
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
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }
  async function sendEnemyToDeck(enemy, unit, chooser) {
    for (const line of [enemy.front, enemy.energy]) { const i = line.indexOf(unit); if (i >= 0) { line.splice(i, 1); break; } }
    for (const c of unit.under) enemy.sideline.push(c); unit.under = [];
    if (unit.counters.length) { enemy.sideline.push(...unit.counters); unit.counters = []; }
    const dest = await chooser.controller.chooseOption(chooser, `${unit.card.name}: วางไว้บนสุดหรือล่างสุดของเด็คเจ้าของ?`, [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
    if (dest === 'top') enemy.deck.unshift(unit.no); else enemy.deck.push(unit.no);
    log(`${unit.card.name}: กลับเด็คของ ${enemy.name} (${dest === 'top' ? 'บนสุด' : 'ล่างสุด'})`);
    await Effects.onLeaveField(Engine.G, enemy, unit);
  }

  // 003 Osaki Amana — [On Play] place up to 2 cards from your Outside Area to the Remove Area.
  reg['IMS-1-003'] = { async onPlay(G, p, unit) { await moveSidelineToRemoval(p, 2); } };

  // 006 Osaki Tenka — [On Play] place up to 2 cards from your Outside Area to the Remove Area, and
  // your opponent places 2 cards from their Outside Area to the Remove Area.
  reg['IMS-1-006'] = {
    async onPlay(G, p, unit) {
      await moveSidelineToRemoval(p, 2);
      const enemy = Engine.opponentOf(p);
      for (let i = 0; i < 2; i++) {
        if (!enemy.sideline.length) break;
        const idx = await enemy.controller.chooseCardFromSideline(enemy, 'ถูกบังคับส่งการ์ดจาก Outside Area ไป Remove Area', null);
        if (idx == null) break;
        enemy.removal.push(enemy.sideline.splice(idx, 1)[0]);
      }
    },
  };

  // 010 Kuwayama Chiyuki — [On Play] choose 1 enemy Front Line character and rest it (won't stand
  // next time). Place up to 2 cards from your Outside Area to the Remove Area.
  reg['IMS-1-010'] = {
    async onPlay(G, p, unit) {
      const t = await H.restEnemyFront(p);
      if (t) t.skipNextStand = true;
      await moveSidelineToRemoval(p, 2);
    },
  };

  // 012 Kazano Hiori — [On Play] look at the top 2 (5 if there is a Sakuragi Mano or Hachimiya
  // Meguru on your area), place 1 among them on top, the rest to the bottom.
  reg['IMS-1-012'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(H.hasCardNamed(p, 'Sakuragi Mano') || H.hasCardNamed(p, 'Hachimiya Meguru') ? 5 : 2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const i = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ด 1 ใบไว้บนสุด`, revealed.map((no, idx) => ({ label: byNo(no)?.name || no, value: idx })));
      const topNo = revealed.splice(i ?? 0, 1)[0];
      p.deck.unshift(topNo);
      p.deck.push(...revealed);
      log(`${unit.card.name}: จัดเรียงการ์ดบนสุด ${n} ใบ`);
    },
  };

  // 015 Sakuragi Mano — [On Play][When Attacking] choose 1 other Trait:Illumination STARS card on
  // your area, +500 BP this turn.
  async function sakuragiMano015(p, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Illumination STARS'));
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Illumination STARS`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
  }
  reg['IMS-1-015'] = { async onPlay(G, p, unit) { await sakuragiMano015(p, unit); }, async onAttack(G, p, unit) { await sakuragiMano015(p, unit); } };

  // 024 Nanakusa Nichika — [On Play] free-play 1 Yellow Character (need<=2, ap1) from your hand rested.
  reg['IMS-1-024'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 028 "Matching Snapshots" — choose up to 1 enemy Front Line character with BP 5000 or less and
  // rest it (retire instead if 3+ distinct-named Trait:Illumination STARS on your area).
  reg['IMS-1-028'] = { async onEvent(G, p, card) { if (countDistinctTrait(p, 'Illumination STARS') >= 3) await H.retireEnemyFront(p, 5000); else await H.restEnemyFront(p, 5000); } };

  // 032 "Full Bloom, Delishtroemeria" — place up to 3 cards from your Outside Area to the Remove
  // Area. Choose up to 1 enemy Front Line character with BP 3000 or less (4000 or less if 3+
  // distinct-named Trait:ALSTROEMERIA on your area) and send it to the Remove Area. (Skipped: "and
  // this card" — same engine limitation as CSM-076/AOT's Rumbling, resolved Event cards always end
  // up in the Outside Area right after onEvent returns.)
  reg['IMS-1-032'] = {
    async onEvent(G, p, card) {
      await moveSidelineToRemoval(p, 3);
      const enemy = Engine.opponentOf(p);
      const limit = countDistinctTrait(p, 'ALSTROEMERIA') >= 3 ? 4000 : 3000;
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= limit);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await forceToRemoval(enemy, t, 'effect');
    },
  };

  // 039 Tanaka Mamimi — [On Play] choose up to 1 enemy Front Line character with BP 2500 or less
  // and place it on top or bottom of their deck.
  reg['IMS-1-039'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 2500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await sendEnemyToDeck(enemy, t, p);
    },
  };

  // 048 Yukoku Kiriko — [On Play] draw 1. Choose up to 1 Trait:L'Antica card, +3000 BP during your
  // opponent's next turn.
  reg['IMS-1-048'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("L'Antica"));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:L'Antica`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const targetTurn = Engine.G.turn + 1;
      Engine.scheduleDelayedAction(targetTurn, () => { t.bpMod += 3000; log(`${unit.card.name}: ${t.card.name} +3000 BP ระหว่างเทิร์นฝ่ายตรงข้าม`); });
    },
  };

  // 050 Asakura Toru — [On Play] you may place 1 Trait:noctchill card from hand to the Outside
  // Area; if you did, untap 1 AP.
  reg['IMS-1-050'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.some(no => (byNo(no)?.traits || '').includes('noctchill'))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:noctchill จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือก Trait:noctchill`);
      if (i == null || !(byNo(p.hand[i])?.traits || '').includes('noctchill')) return;
      p.sideline.push(p.hand.splice(i, 1)[0]);
      await H.apUntap(p, 1);
    },
  };

  // 071 Izumi Mei — [On Play] you may place 1 card from hand to the Outside Area; if you did, draw
  // 1 (3 instead if the placed card was an Event Card).
  reg['IMS-1-071'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      const n = byNo(no)?.type === 'Event' ? 3 : 1;
      Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`);
    },
  };

  // 073 Serizawa Asahi — [Your Turn] +1000 BP for each Event Card used this turn.
  reg['IMS-1-073'] = { bpBonus(p, unit) { return isYourTurn(p) ? (p._eventsUsedThisTurn || 0) * 1000 : 0; } };

  // 090 Morino Rinze — [On Play] choose up to 1 other Trait:Houkago Climax Girls card on your area,
  // +1000 BP this turn.
  reg['IMS-1-090'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Houkago Climax Girls`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 094 "Good Luck Ball" — if your opponent's Life is 3 or higher, inflict 1 damage to your opponent.
  reg['IMS-1-094'] = { async onEvent(G, p, card) { const enemy = Engine.opponentOf(p); if (enemy.life.length >= 3) await Engine.dealDamage(p, enemy, 1); } };

  // 099 "Don't Play On An Empty Stomach" — choose up to 1 character on your area, +1000 BP this
  // turn. Untap 1 AP.
  reg['IMS-1-099'] = { async onEvent(G, p, card) { await H.buffOwnCharacter(p, 1000); await H.apUntap(p, 1); } };

  // 104 Kazano Hiori (2nd print) — [On Play] free-play 1 yellow Character (need<=3, ap1) from your
  // Outside Area rested.
  reg['IMS-1-104'] = {
    async onPlay(G, p, unit) {
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 2-001 Amana Osaki — [Main][Rest] only if 3 or fewer cards on your Outside Area: choose up to 1
  // other Trait:ALSTROEMERIA character, +500 BP this turn (+1000 if 0 cards on your Outside Area).
  reg['IMS-2-001'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (p.sideline.length > 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = true;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('ALSTROEMERIA'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:ALSTROEMERIA`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const delta = p.sideline.length === 0 ? 1000 : 500;
      t.bpMod += delta; log(`${unit.card.name}: ${t.card.name} +${delta} BP เทิร์นนี้`);
    },
  };

  // 2-002 Tenka Osaki — [Your Turn] if 0 cards on your Outside Area, +1500 BP.
  reg['IMS-2-002'] = { bpBonus(p, unit) { return (isYourTurn(p) && p.sideline.length === 0) ? 1500 : 0; } };

  // 2-003 Chiyuki Kuwayama — [Main][Rest] place 1 card from your Outside Area to the Remove Area.
  reg['IMS-2-003'] = { async onMain(G, p, unit) { if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } unit.rested = true; await moveSidelineToRemoval(p, 1); } };

  // 2-004 Chiyuki Kuwayama — [Main][Frontline][Rest] only if 0 cards on your Outside Area: choose 1
  // enemy Front Line character with BP 5000 or less, send it and this character to the Remove Area.
  reg['IMS-2-004'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (p.sideline.length !== 0) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await forceToRemoval(enemy, t, 'effect');
      await forceToRemoval(p, unit, 'effect');
    },
  };

  // 2-012 Nichika Nanakusa — [On Play] you may place 1 Trait:SHHis card from hand to the Outside
  // Area; if you did, look at the top 4, reveal up to 1 character card and add it to hand, remainder
  // to the bottom.
  reg['IMS-2-012'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.some(no => (byNo(no)?.traits || '').includes('SHHis'))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:SHHis จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือก Trait:SHHis`);
      if (i == null || !(byNo(p.hand[i])?.traits || '').includes('SHHis')) return;
      p.sideline.push(p.hand.splice(i, 1)[0]);
      await H.lookTopAndTake(p, 4, c => c.type === 'Character', 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 2-015 Mamimi Tanaka — [On Play] if 4+ other Trait:L'Antica cards on your area, choose up to 1
  // Trait:L'Antica character on your area, [Impact +1] this turn.
  reg['IMS-2-015'] = {
    async onPlay(G, p, unit) {
      if (countDistinctTrait(p, "L'Antica", unit) < 4 && [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes("L'Antica")).length < 4) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("L'Antica"));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:L'Antica`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${unit.card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
    },
  };

  // 2-016 Kogane Tsukioka — [On Play] if there is a character on your opponent's area with BP lower
  // than its printed BP, draw 1.
  reg['IMS-2-016'] = { async onPlay(G, p, unit) { const enemy = Engine.opponentOf(p); if ([...enemy.front, ...enemy.energy].some(u => u.card.bp != null && Engine.bp(u) < u.card.bp)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 2-017 Yuika Mitsumine — [Main][Frontline][Discard 1][1/turn] choose up to 1 character on your
  // opponent's area with BP 1500 or more, -1000 BP this turn.
  reg['IMS-2-017'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 2-018 Kiriko Yukoku — [Main][Rest+Retire] choose 1 character on your opponent's area with BP
  // 2500 or more, -2000 BP this turn.
  reg['IMS-2-018'] = { async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); await H.debuffEnemyAny(p, -2000, { min: 2500 }); } };

  // 2-019 Kiriko Yukoku — [Raid][On Play] this character gains "[When Attacking][1/turn] choose up
  // to 1 enemy Front Line character with BP lower than its printed BP and retire it" this turn.
  reg['IMS-2-019'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      unit._usedTurn = Engine.G.turn;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && u.card.bp != null && Engine.bp(u) < u.card.bp);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 2-020 Toru Asakura — [Your Turn] if you used 4+ cards from your hand this turn, +2000 BP.
  reg['IMS-2-020'] = { bpBonus(p, unit) { return (isYourTurn(p) && (p._cardsPlayedFromHandThisTurn || 0) >= 4) ? 2000 : 0; } };

  // 2-024 Madoka Higuchi — [When Attacking] if you used 4+ cards from your hand this turn, choose
  // up to 1 Trait:noctchill character on your area, [Damage +1] this turn.
  reg['IMS-2-024'] = {
    async onAttack(G, p, unit) {
      if ((p._cardsPlayedFromHandThisTurn || 0) < 4) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('noctchill'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:noctchill`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempDmg = (t.tempDmg || 0) + 1; log(`${unit.card.name}: ${t.card.name} [Damage +1] เทิร์นนี้`); }
    },
  };

  // 2-026 Koito Fukumaru — [On Play] you may place 1 other Trait:noctchill card on your area at the
  // bottom of your deck; if you did, draw 1 and reduce the AP cost of the next Hinana Ichikawa you
  // use this turn by 1.
  reg['IMS-2-026'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('noctchill'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่ง Trait:noctchill ไปล่างสุดของเด็ค?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) { line.splice(i, 1); break; } }
      if (t.under.length) { p.sideline.push(...t.under); t.under = []; }
      if (t.counters.length) { p.sideline.push(...t.counters); t.counters = []; }
      p.deck.push(t.no);
      log(`${unit.card.name}: ${t.card.name} ไปล่างสุดของเด็ค`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Hinana Ichikawa'), apDelta: -1 };
      log(`${unit.card.name}: Hinana Ichikawa ใบถัดไป ลด AP cost 1`);
    },
  };

  // 2-030 Amana Osaki — [On Play] look at the top 4, place up to 3 distinct-named
  // Trait:ALSTROEMERIA among them to the Outside Area, remainder to the bottom.
  reg['IMS-2-030'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`, c => (c.traits || '').includes('ALSTROEMERIA'), 3);
      const sent = [];
      picked.sort((a, b) => b - a).forEach(i => { sent.push(revealed.splice(i, 1)[0]); });
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + sent.length;
      p.deck.push(...revealed);
      log(`${unit.card.name}: ส่งการ์ด ${sent.length} ใบไป Outside Area`);
    },
  };

  // 2-033 Tenka Osaki — [Main][Frontline][1/turn] place up to 3 Trait:ALSTROEMERIA cards from your
  // Outside Area to the bottom of your deck; if you did, choose up to 1 other Trait:ALSTROEMERIA
  // character, +1000 BP and [Impact +1] this turn.
  reg['IMS-2-033'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        const idx = p.sideline.findIndex(no => (byNo(no)?.traits || '').includes('ALSTROEMERIA'));
        if (idx < 0) break;
        p.deck.push(p.sideline.splice(idx, 1)[0]); moved++;
      }
      if (!moved) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      unit._usedTurn = Engine.G.turn;
      log(`${unit.card.name}: ${moved} ใบ Trait:ALSTROEMERIA ไปล่างสุดของเด็ค`);
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('ALSTROEMERIA'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:ALSTROEMERIA`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; t.tempImpact = (t.tempImpact || 0) + 1; log(`${unit.card.name}: ${t.card.name} +1000 BP และ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 2-042 Mamimi Tanaka — [On Play] look at the top 3, keep them on top in any order (no real state
  // change to simulate).
  reg['IMS-2-042'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`); } };

  // 2-044 Kogane Tsukioka — [On Play] look at the top 3, reveal up to 1 Trait:L'Antica card among
  // them and add it to hand, remainder to the bottom.
  reg['IMS-2-044'] = { async onPlay(G, p, unit) { await H.lookTopAndTake(p, 3, c => (c.traits || '').includes("L'Antica"), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 2-045 Kogane Tsukioka — [On Play] choose 1 of: place up to 1 card from the top of your deck to
  // the Outside Area; or place up to 1 Trait:L'Antica card from your Outside Area on top of your deck.
  reg['IMS-2-045'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'วางการ์ดบนสุดของเด็คไป Outside Area', value: 'a' }, { label: 'วาง Trait:L\'Antica จาก Outside Area บนสุดของเด็ค', value: 'b' },
      ]);
      if (v === 'a') { if (p.deck.length) { const no = p.deck.shift(); p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`); } }
      else {
        const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:L'Antica`, c => c && (c.traits || '').includes("L'Antica"));
        if (idx != null) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`${unit.card.name}: ${byNo(no)?.name} บนสุดของเด็ค`); }
      }
    },
  };

  // 2-053 Luca Ikaruga — [On Play] choose up to 1 enemy Front Line character, -2000 BP this turn
  // (-4000 instead if there is a 283 Production on your area). (Skipped: the color-flexible energy
  // requirement and the targeting-tax restriction — both recurring gaps.)
  reg['IMS-2-053'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const delta = H.hasCardNamed(p, '283 Production') ? -4000 : -2000;
      t.bpMod += delta; log(`${unit.card.name}: ${t.card.name} ${delta} BP เทิร์นนี้`);
    },
  };

  // 2-055 "SIDE：Y" — choose 1 enemy Front Line character, -1000 BP for each Trait:L'Antica card
  // on your area this turn.
  reg['IMS-2-055'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("L'Antica")).length;
      if (!n) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= n * 1000; log(`${card.name}: ${t.card.name} -${n * 1000} BP เทิร์นนี้`); }
    },
  };

  // 2-059 "Magical*Skyrace" — draw 1. You may choose 1 enemy Front Line character and 1 enemy
  // Energy Line character with generated energy of 1 or less and swap their positions.
  reg['IMS-2-059'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const elTargets = enemy.energy.filter(u => (u.card.gen || 0) <= 1);
      if (!enemy.front.length || !elTargets.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: สลับตำแหน่ง character ศัตรู?`, [{ label: 'สลับ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid1 = await p.controller.chooseEnemyCharacter(p, enemy.front, `${card.name}: เลือก character บน Front Line ศัตรู`);
      const a = enemy.front.find(x => x.uid === uid1);
      const uid2 = await p.controller.chooseEnemyCharacter(p, elTargets, `${card.name}: เลือก character บน Energy Line ศัตรู`);
      const b = elTargets.find(x => x.uid === uid2);
      if (!a || !b) return;
      const fi = enemy.front.indexOf(a), ei = enemy.energy.indexOf(b);
      enemy.front[fi] = b; enemy.energy[ei] = a;
      log(`${card.name}: สลับตำแหน่ง ${a.card.name} กับ ${b.card.name}`);
    },
  };

  // 2-060 "Anyhow, Whatcha Talkin About!?" — look at the top 5, add 1 to hand and place 1 to the
  // Outside Area, remainder to the bottom (any order).
  reg['IMS-2-060'] = {
    async onEvent(G, p, card) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const i1 = await p.controller.chooseOption(p, `${card.name}: เลือกการ์ดเข้ามือ`, revealed.map((no, idx) => ({ label: byNo(no)?.name || no, value: idx })));
      const handNo = revealed.splice(i1 ?? 0, 1)[0];
      p.hand.push(handNo);
      log(`${card.name}: เพิ่ม ${byNo(handNo)?.name} เข้ามือ`);
      if (revealed.length) {
        const i2 = await p.controller.chooseOption(p, `${card.name}: เลือกการ์ดไป Outside Area`, revealed.map((no, idx) => ({ label: byNo(no)?.name || no, value: idx })));
        const outNo = revealed.splice(i2 ?? 0, 1)[0];
        p.sideline.push(outNo);
        p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
        log(`${card.name}: ${byNo(outNo)?.name} ไป Outside Area`);
      }
      p.deck.push(...revealed);
    },
  };

  // 2-067 Natsuha Arisugawa — [On Play][1/turn] you may return 1 Trait:Houkago Climax Girls card on
  // your area (other than this one) to hand; if you did, choose up to 1 Trait:Houkago Climax Girls
  // card on your area and set it active.
  reg['IMS-2-067'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน Trait:Houkago Climax Girls กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      const actTargets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!actTargets.length) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, actTargets, `${unit.card.name}: เลือก character ให้ Active`, true);
      const t2 = actTargets.find(x => x.uid === uid2);
      if (t2) { t2.rested = false; log(`${unit.card.name}: ${t2.card.name} Active`); }
    },
  };

  // 2-069 Juri Saijo — [On Play] choose up to 1 Trait:Houkago Climax Girls card on your area, it
  // gains "[1/turn] when this character attacks and wins, set this character active" this turn.
  reg['IMS-2-069'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Houkago Climax Girls`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedOnWinActive = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "ชนะแล้ว Active" เทิร์นนี้`); }
    },
  };

  // 2-070 Chiyoko Sonoda — [Main][1/turn] choose up to 1 Trait:Houkago Climax Girls card on your
  // Front Line, set it active and grant it "cannot attack" this turn.
  reg['IMS-2-070'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Houkago Climax Girls`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; t.tempCannotAttack = true; log(`${unit.card.name}: ${t.card.name} Active แต่ไม่สามารถโจมตีเทิร์นนี้`); }
    },
  };

  // 2-071 Rinze Morino — [On Retire] free-play 1 red Trait:Houkago Climax Girls (need<=3, ap1) from
  // your hand rested.
  reg['IMS-2-071'] = { async onSideline(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.traits || '').includes('Houkago Climax Girls') && (c.need || 0) <= 3 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 2-072 "Howl at the moon" — choose 1 character on your area, +2000 BP this turn (also [Impact
  // +1] if it has Trait:Straylight).
  reg['IMS-2-072'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      let msg = `${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`;
      if ((t.card.traits || '').includes('Straylight')) { t.tempImpact = (t.tempImpact || 0) + 1; msg += ' และ [Impact +1]'; }
      log(msg);
    },
  };

  // 2-073 "Mark Of Invincibility! The 5 Crests!" — choose 1 Trait:Houkago Climax Girls character,
  // +2000 BP this turn (until the start of your next turn instead if it's Komiya Kaho).
  reg['IMS-2-073'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Houkago Climax Girls'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Houkago Climax Girls`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if ((t.card.name || '').includes('Komiya Kaho')) { t.bpPersist += 2000; log(`${card.name}: ${t.card.name} +2000 BP จนถึงต้นเทิร์นหน้า`); }
      else { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };

  // ── PC01BT prints ──

  // 3-002 Tenka Osaki — [On Play] place up to 3 cards from your Outside Area to the Remove Area; if
  // you have 0 cards in your Outside Area, draw 1. @[Main][Rest] place 1 card from your Outside
  // Area to the Remove Area.
  reg['PC01BT-IMS-3-002'] = {
    async onPlay(G, p, unit) {
      await moveSidelineToRemoval(p, 3);
      if (!p.sideline.length) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
    async onMain(G, p, unit) { if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } unit.rested = true; await moveSidelineToRemoval(p, 1); },
  };

  // 3-007 Mikoto Aketa — [Main][Rest][Discard 1] only if 3+ other characters with different traits
  // on your area: choose 1 character without Trait:SHHis, +2000 BP this turn.
  reg['PC01BT-IMS-3-007'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const traits = new Set();
      for (const u of [...p.front, ...p.energy]) if (u !== unit) for (const t of (u.card.traits || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) traits.add(t);
      if (traits.size < 3) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit.rested = true;
      const targets = [...p.front, ...p.energy].filter(u => !(u.card.traits || '').includes('SHHis'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };

  // 3-015 Toru Asakura — [When Attacking][1/turn] if you used 4+ cards from your hand this turn,
  // choose up to 1 enemy Front Line character with BP 4000-5000 and rest it.
  reg['PC01BT-IMS-3-015'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if ((p._cardsPlayedFromHandThisTurn || 0) < 4) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 4000 && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 3-019 "Ganbare! Noroma-go" — draw 1. If there is a Trait:noctchill card on your area, untap 1 AP.
  reg['PC01BT-IMS-3-019'] = { async onEvent(G, p, card) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); if ([...p.front, ...p.energy].some(u => (u.card.traits || '').includes('noctchill'))) await H.apUntap(p, 1); } };

  // 3-021 Tenka Osaki — [On Play] place up to 2 cards from the top of your deck to the Outside Area.
  // @[Main][1/turn] place 3 Trait:ALSTROEMERIA cards from your Outside Area to the bottom of your
  // deck; if you did, this character also generates energy on the Front Line this turn.
  reg['PC01BT-IMS-3-021'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const sent = p.deck.splice(0, n);
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        const idx = p.sideline.findIndex(no => (byNo(no)?.traits || '').includes('ALSTROEMERIA'));
        if (idx < 0) break;
        p.deck.push(p.sideline.splice(idx, 1)[0]); moved++;
      }
      if (!moved) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.tempFrontGen = true;
      log(`${unit.card.name}: ${moved} ใบไปล่างสุดของเด็ค — ผลิต energy บน Front Line ได้เทิร์นนี้`);
    },
  };

  // 3-022 Chiyuki Kuwayama — [When raided on] combo bonus resolved in any order with the raider's
  // On Play. (Skipped: raid-timing combo mechanic, too complex/narrow.)

  // 3-025 Kogane Tsukioka — [On Play] place up to 1 purple Trait:L'Antica (need<=3) from your
  // Outside Area on top of your deck. @[On Retire] place up to 1 card from the top of your deck to
  // the Outside Area.
  reg['PC01BT-IMS-3-025'] = {
    async onPlay(G, p, unit) {
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:L'Antica`, c => c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes("L'Antica") && (c.need || 0) <= 3);
      if (idx != null) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`${unit.card.name}: ${byNo(no)?.name} บนสุดของเด็ค`); }
    },
    async onSideline(G, p, unit) {
      if (!p.deck.length) return;
      const no = p.deck.shift();
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ${byNo(no)?.name} จากบนสุดของเด็คไป Outside Area`);
    },
  };

  // 3-027 Kiriko Yukoku — [On Play][When Attacking][Frontline][1/turn] if you have 20 or fewer
  // cards in your deck, set this character active.
  async function yukoku027(p, unit) {
    if (unit._usedTurn === Engine.G.turn) return;
    if (p.deck.length > 20) return;
    unit._usedTurn = Engine.G.turn;
    unit.rested = false;
    log(`${unit.card.name}: Active`);
  }
  reg['PC01BT-IMS-3-027'] = { async onPlay(G, p, unit) { await yukoku027(p, unit); }, async onAttack(G, p, unit) { if (p.front.includes(unit)) await yukoku027(p, unit); } };

  // 3-030 Luca Ikaruga — [Your Turn] if you have 3+ cards in your Remove Area, +1000 BP. @[On Play]
  // place the top card of your deck to the Remove Area.
  reg['PC01BT-IMS-3-030'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p.removal.length >= 3) ? 1000 : 0; },
    async onPlay(G, p, unit) { if (p.deck.length) { const no = p.deck.shift(); p.removal.push(no); log(`${unit.card.name}: ${byNo(no)?.name} จากบนสุดของเด็คไป Remove Area`); } },
  };

  // 3-032/3-036/3-040 — reactive to being placed in the Remove Area specifically by a Trait:CoMETIK
  // card's effect. (Skipped: no hook distinguishes "milled/discarded to Remove Area by a specific
  // trait's effect" from any other route to the Remove Area — a new reactive-trigger category.)

  // 3-034 Haruki Ikuta — [On Play] look at the top 2, place any number on top and the rest on the
  // bottom, in any order.
  reg['PC01BT-IMS-3-034'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 3-037 Hana Suzuki — passive: if 3+ Trait:CoMETIK cards in your Remove Area, +1000 BP.
  reg['PC01BT-IMS-3-037'] = { bpBonus(p, unit) { return countRemovalTrait(p, 'CoMETIK') >= 3 ? 1000 : 0; } };

  // 3-038 Hana Suzuki — [When Attacking] if you have 6+ cards in your Remove Area, choose up to 1
  // enemy Front Line character, -1000 BP this turn.
  reg['PC01BT-IMS-3-038'] = { async onAttack(G, p, unit) { if (p.removal.length >= 6) await H.debuffEnemyFront(p, -1000); } };

  // 3-044 Fuyuko Mayuzumi — [On Play] look at the top 2, place up to 1 Trait:Straylight card and up
  // to 1 Event card among them to the Outside Area, remainder to the top.
  reg['PC01BT-IMS-3-044'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.type === 'Event' || (c.traits || '').includes('Straylight')); } };

  // 3-048 Chiyoko Sonoda — [On Play] if you returned a Trait:Houkago Climax Girls card to hand this
  // turn (approximated: does not separately check "or was played by your effect"), choose 1 of:
  // draw 1; or if it's your turn, choose up to 2 Trait:Houkago Climax Girls characters, +1000 BP
  // each this turn.
  reg['PC01BT-IMS-3-048'] = {
    async onPlay(G, p, unit) {
      if (!p._returnedToHandThisTurn) return;
      const opts = [{ label: 'จั่ว 1 ใบ', value: 'a' }];
      if (isYourTurn(p)) opts.push({ label: 'Trait:Houkago Climax Girls สูงสุด 2 ใบ +1000 BP เทิร์นนี้', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Houkago Climax Girls'));
      for (let i = 0; i < 2 && targets.length; i++) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (${i + 1}/2)`, true);
        const idx = targets.findIndex(x => x.uid === uid);
        if (idx < 0) break;
        targets[idx].bpMod += 1000;
        log(`${unit.card.name}: ${targets[idx].card.name} +1000 BP เทิร์นนี้`);
        targets.splice(idx, 1);
      }
    },
  };

  // 3-049 Rinze Morino — [On Play] choose 1 of: look at the top 3, reveal up to 1
  // Trait:Houkago Climax Girls card and add it to hand, remainder to the bottom (if added, place 1
  // card from hand to the Outside Area); or choose up to 1 other Trait:Houkago Climax Girls
  // character, +1000 BP this turn.
  reg['PC01BT-IMS-3-049'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 3 ใบ (Trait:Houkago Climax Girls)', value: 'a' }, { label: 'Trait:Houkago Climax Girls อื่น +1000 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') {
        const taken = await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Houkago Climax Girls'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      } else {
        const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Houkago Climax Girls'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      }
    },
  };

  // UAPR-IMS-P-001 Sakuragi Mano — [Main][Rest+Retire] reduce the required energy and AP cost of
  // the next Trait:Illumination STARS card (printed AP cost 2) used this turn by 1.
  reg['UAPR-IMS-P-001'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Illumination STARS') && (c.ap || 0) === 2, needDelta: -1, apDelta: -1 };
      log(`${unit.card.name}: Trait:Illumination STARS (AP 2) ใบถัดไป ลด required energy และ AP cost 1`);
    },
  };

  // UAPR-IMS-P-002 Tsukioka Kogane — [On Play] if 2+ other distinct-named Trait:L'Antica cards on
  // your area, choose up to 1 enemy Front Line character with BP 1500 or higher, -1000 BP this turn.
  reg['UAPR-IMS-P-002'] = { async onPlay(G, p, unit) { if (countDistinctTrait(p, "L'Antica", unit) >= 2) await H.debuffEnemyFront(p, -1000, {}); } };

  // UAPR-IMS-P-003 Komiya Kaho — [On Play][1/turn] if 3+ other distinct-named Trait:Houkago Climax
  // Girls cards on your area, reduce the AP cost of the next Komiya Kaho you use this turn by 1.
  reg['UAPR-IMS-P-003'] = {
    async onPlay(G, p, unit) {
      if (countDistinctTrait(p, 'Houkago Climax Girls', unit) < 3) return;
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Komiya Kaho'), apDelta: -1 };
      log(`${unit.card.name}: Komiya Kaho ใบถัดไป ลด AP cost 1`);
    },
  };
})();
