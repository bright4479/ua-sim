// ══════════ UA SIM — One Punch Man (OPM) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 002 Bomb — [On Play] choose up to 1 own Bomb/Silverfang, gains [Impact +1] this turn.
  reg['UA35BT-OPM-1-002'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Bomb') || (u.card.name || '').includes('Silverfang'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Bomb หรือ Silverfang`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 004 King — cannot attack/block (now generic via kw.cannotAttack/kw.cannotBlock, combined-form
  // regex). [Main][Frontline][Rest] rest 1 enemy Front Line character BP ≤ half this character's
  // BP, it skips its next stand (approximates the permanent lock). (Skipped: the end-of-Attack-
  // Phase "bury self to reactivate Saitama" clause — no end-of-Attack-Phase hook exists.)
  reg['UA35BT-OPM-1-004'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const halfBp = Math.floor(Engine.bp(unit) / 2);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= halfBp);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤${halfBp})`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 006 Genos — [On Play] choose: look at top 5 for a Saitama card to hand (discard 1 if added), or
  // draw 1 if own Saitama.
  reg['UA35BT-OPM-1-006'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: 'ดูการ์ดบนสุด 5 ใบ (หา Saitama)', value: 'look' }];
      if (H.hasCardNamed(p, 'Saitama')) opts.push({ label: 'จั่ว 1 ใบ (มี Saitama)', value: 'draw' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'look') {
        const taken = await H.lookTopAndTake(p, 5, c => (c.name || '').includes('Saitama'), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      } else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 008 Silverfang — [Main][Frontline][1/turn] return 1 other own character to hand; if did,
  // choose: set self Active, or self +1500 BP this turn.
  reg['UA35BT-OPM-1-008'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character คืนมือ');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'Active ตัวเอง', value: 'a' }, { label: '+1500 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
      else { unit.bpMod += 1500; log(`${unit.card.name}: +1500 BP เทิร์นนี้`); }
    },
  };

  // 013 Terrible Tornado — passive +1000 BP on your turn if you used an Event Card this turn.
  reg['UA35BT-OPM-1-013'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._eventsUsedThisTurn) ? 1000 : 0; },
  };

  // 014 Terrible Tornado — grants own Hellish Blizzard cards immunity from opponent targeting while
  // on Front Line. (Skipped: an aura-untargetable grant to OTHER cards — the untargetable helpers
  // are per-unit static/temp flags, not a live aura, same gap noted for KMY-3-002/BLK-1-021.)

  // 017 Saitama — [Main][Discard1] gated on Front Line not full: move self to Front Line.
  // (Skipped: the "cannot be removed by opponent's abilities" broad immunity and the end-of-Attack-
  // Phase auto-move-to-Energy clause.)
  reg['UA35BT-OPM-1-017'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.front.length >= 4) { p.controller.notify?.('Front Line เต็ม'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await Engine.moveUnitFree(p, unit, 'front');
    },
  };

  // 020 Hellish Blizzard — [On Play] look at top 4, reveal 1 yellow card (energy≤3) among them: add
  // to hand and discard 1 (or send straight to Outside Area instead if it's an Event Card),
  // remainder to bottom.
  reg['UA35BT-OPM-1-020'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => c && c.color === 'Yellow' && (c.need || 0) <= 3;
      const idx = revealed.findIndex(no => pred(byNo(no)));
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        const c = byNo(no);
        if (c.type === 'Event') { p.sideline.push(no); log(`${unit.card.name}: ส่ง ${c.name} ไป Outside Area`); }
        else { p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); await H.discardFromHand(p); }
      }
      p.deck.push(...revealed);
    },
  };

  // 026 Let's Go (Event) — choose 1 own Front Line character +2000 BP this turn; if it's Hellish Blizzard, also [Impact +1].
  reg['UA35BT-OPM-1-026'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if ((t.card.name || '').includes('Hellish Blizzard')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 028 Hellstorm (Event) — choose 1 enemy Front Line character (resting or BP≤1500), retire it.
  reg['UA35BT-OPM-1-028'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (u.rested || Engine.bp(u) <= 1500));
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (นอนอยู่ หรือ BP≤1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 030 Whirling Wind Flowing Water Roaring Chi Rending Sky Fist (Event) — cost: rest own active
  // Silverfang and Bomb on Front Line (not enforced pre-play, only performed here); retire 1 enemy
  // Front Line character BP≤4000, draw 1.
  reg['UA35BT-OPM-1-030'] = {
    async onEvent(G, p, card) {
      const silverfang = p.front.find(u => (u.card.name || '').includes('Silverfang') && !u.rested);
      const bomb = p.front.find(u => (u.card.name || '').includes('Bomb') && !u.rested);
      if (!silverfang || !bomb) return;
      silverfang.rested = true; bomb.rested = true;
      log(`${card.name}: วางนอน Silverfang และ Bomb`);
      await H.retireEnemyFront(p, 4000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 033 I Merely Immobilized Them (Event) — once per turn (name-guard): rest 1 enemy Front Line
  // character; if own Terrible Tornado and Hellish Blizzard are both on Front Line, it also skips its next stand.
  reg['UA35BT-OPM-1-033'] = {
    async onEvent(G, p, card) {
      if (p._immobilizedTurn === Engine.G.turn) return;
      p._immobilizedTurn = Engine.G.turn;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูให้วางนอน`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      if (p.front.some(u => (u.card.name || '').includes('Terrible Tornado')) && p.front.some(u => (u.card.name || '').includes('Hellish Blizzard'))) {
        t.skipNextStand = true;
        log(`${card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป`);
      }
    },
  };

  // 037 Death Gatling — [On Retire] choose up to 1 other own character +500 BP this turn.
  reg['UA35BT-OPM-1-037'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); } };

  // 049 Silverfang — [On Play][When Attacking][On Block] scry the top card (top or Outside Area).
  reg['UA35BT-OPM-1-049'] = {
    async onPlay(G, p, unit) { await H.scryTop(p, ['top', 'outside']); },
    async onAttack(G, p, unit) { await H.scryTop(p, ['top', 'outside']); },
    async onBlock(G, p, unit) { await H.scryTop(p, ['top', 'outside']); },
  };

  // 050 Flashy Flash — [When Attacking] if 6+ other Trait:Hero on area, cannot be blocked by BP≥3500 this attack (evaluated live at each attack).
  reg['UA35BT-OPM-1-050'] = {
    async onAttack(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hero')).length;
      if (n >= 6) { unit.tempUnblockableBPMin = 3500; log(`${unit.card.name}: ไม่ถูก block โดย character BP≥3500 เทิร์นนี้`); }
    },
  };

  // 051 Terrible Tornado — [On Play] may discard 1 Trait:Hero card; if did, set self Active.
  reg['UA35BT-OPM-1-051'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('Hero'));
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:Hero จากมือไป Outside Area เพื่อ Active ตัวเอง?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      unit.rested = false;
      log(`${unit.card.name}: Active ตัวเอง`);
    },
  };

  // 055 Child Emperor — [On Play] if 3+ other Trait:Hero on area, choose: draw 1, or choose up to 1 other own character +1000 BP this turn.
  reg['UA35BT-OPM-1-055'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hero')).length;
      if (n < 3) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'draw' }, { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'buff' },
      ]);
      if (v === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 056 Watchdog Man — "This character cannot move." now handled generically via kw.cannotMove.

  // 058 Puri-puri Prisoner — passive +2000 BP on your turn if hand is empty. @[Main][1/turn] place
  // your entire hand to the Outside Area.
  reg['UA35BT-OPM-1-058'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p.hand.length === 0) ? 2000 : 0; },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const n = p.hand.length;
      p.sideline.push(...p.hand.splice(0));
      log(`${unit.card.name}: ส่งการ์ดในมือทั้งหมด (${n} ใบ) ไป Outside Area`);
    },
  };

  // 059 Metal Knight — [On Play] play 1 green character (energy≤2, AP1) from hand, rested.
  reg['UA35BT-OPM-1-059'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 060 Mumen Rider — [On Retire] if retired by losing a battle, may discard 1 to replay this card, rested.
  reg['UA35BT-OPM-1-060'] = {
    async onSideline(G, p, unit, reason) {
      if (reason !== 'battle') return;
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อลงใหม่?`);
      if (!discarded) return;
      const idx = p.sideline.lastIndexOf(unit.no);
      if (idx < 0) return;
      p.sideline.splice(idx, 1);
      p.hand.push(unit.no);
      await Engine.playCardFromZone(p, unit.no, 'hand', { line: 'energy', active: false });
    },
  };

  // 063 Hero Association (Field) — [Main][Rest][Retire] play 1 green character (energy≤3, AP1) from hand, rested.
  reg['UA35BT-OPM-1-063'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) { p.controller.notify?.('ไม่มีเป้าหมายในมือ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 064 King Engine (Event) — retire 1 enemy Front Line character with BP ≤ your highest own BP;
  // if own King, choose 1 own character +1 energy generation this turn.
  reg['UA35BT-OPM-1-064'] = {
    async onEvent(G, p, card) {
      const own = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      const highest = own.length ? Math.max(...own.map(u => Engine.bp(u))) : 0;
      await H.retireEnemyFront(p, highest);
      if (!H.hasCardNamed(p, 'King')) return;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character รับ +1 energy generation เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempGen += 1; log(`${card.name}: ${t.card.name} +1 energy generation เทิร์นนี้`); }
    },
  };

  // 070 Speed-o'-Sound Sonic — passive +1000 BP on your turn if combined Life total ≤4. @[On Play]
  // may move 3 cards from Outside Area to Remove Area for draw 1.
  reg['UA35BT-OPM-1-070'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const enemy = Engine.opponentOf(p);
      return (p.life.length + enemy.life.length) <= 4 ? 1000 : 0;
    },
    async onPlay(G, p, unit) {
      if (p.sideline.length < 3) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ย้ายการ์ด 3 ใบจาก Outside Area ไป Remove Area เพื่อจั่ว 1 ใบ?`,
        [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 3; i++) p.removal.push(p.sideline.pop());
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 075 Garou — [On Play] place up to 2 cards from the top of your deck to Outside Area.
  reg['UA35BT-OPM-1-075'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (n) { p.sideline.push(...p.deck.splice(0, n)); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
    },
  };

  // 076 Garou — passive tiered BP based on Outside Area count (5/10/15+, +500 each, stacking).
  // @[On Play] may pay 1 AP to retire 1 enemy Front Line character with BP ≤ this character's BP.
  reg['UA35BT-OPM-1-076'] = {
    bpBonus(p, unit) {
      const n = p.sideline.length;
      let bonus = 0;
      if (n >= 5) bonus += 500;
      if (n >= 10) bonus += 500;
      if (n >= 15) bonus += 500;
      return bonus;
    },
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ retire character ศัตรู?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payApForEffect(p, 1)) return;
      await H.retireEnemyFront(p, Engine.bp(unit));
    },
  };

  // 079 Tareo — [Main][Rest][Retire] fetch 1 Garou from Outside Area to hand.
  reg['UA35BT-OPM-1-079'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.name || '').includes('Garou');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Garou ใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Garou จาก Outside Area`);
    },
  };

  // 081 Boros — [On Play] may add 1 Life card to hand; if did, draw 2, discard 1.
  reg['UA35BT-OPM-1-081'] = {
    async onPlay(G, p, unit) {
      if (!p.life.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เพิ่มการ์ดจาก Life เข้ามือ?`,
        [{ label: 'เพิ่ม', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await H.addLifeToHand(p);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 088 Super S — [On Play] choose: draw 1, or retire 2 enemy Front Line characters BP≤2000 with matching BP.
  reg['UA35BT-OPM-1-088'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const pool = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 2000);
      const bpGroups = {};
      for (const u of pool) (bpGroups[Engine.bp(u)] ||= []).push(u);
      const validBps = Object.keys(bpGroups).filter(k => bpGroups[k].length >= 2);
      const opts = [{ label: 'จั่ว 1 ใบ', value: 'draw' }];
      if (validBps.length) opts.push({ label: 'Retire enemy 2 ใบ (BP≤2000 เท่ากัน)', value: 'retire' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const targets = validBps.flatMap(k => bpGroups[k]);
      const uid1 = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูตัวที่ 1`, true);
      const t1 = targets.find(x => x.uid === uid1);
      if (!t1) return;
      const sameBp = targets.filter(u => u !== t1 && Engine.bp(u) === Engine.bp(t1));
      if (!sameBp.length) return;
      const uid2 = await p.controller.chooseEnemyCharacter(p, sameBp, `${unit.card.name}: เลือก character ศัตรูตัวที่ 2 (BP เท่ากัน)`, true);
      const t2 = sameBp.find(x => x.uid === uid2);
      if (!t2) return;
      await Engine.sidelineUnit(enemy, t1, 'effect');
      await Engine.sidelineUnit(enemy, t2, 'effect');
    },
  };

  // 093 Doctor Genus — [On Play] may add 1 Life card to hand; if did, free-play 1 red Trait:House
  // of Evolution (fulfilled energy, AP1) from hand, rested.
  reg['UA35BT-OPM-1-093'] = {
    async onPlay(G, p, unit) {
      if (!p.life.length) return;
      const pred = c => c && c.type === 'Character' && c.color === 'Red' && (c.traits || '').includes('House of Evolution') && (c.ap || 0) === 1 && Engine.hasEnergyFor(p, c);
      if (!p.hand.some(no => pred(byNo(no)))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เพิ่มการ์ดจาก Life เข้ามือ เพื่อลง Trait:House of Evolution?`,
        [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await H.addLifeToHand(p);
      const idx = p.hand.findIndex(no => pred(byNo(no)));
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 095 Mosquito Girl — [On Play] choose up to 1 other own character +1000 BP this turn.
  // @[Main][1/turn] may add 1 Life card to hand; if did, self +2500 BP this turn.
  reg['UA35BT-OPM-1-095'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.life.length) { p.controller.notify?.('ไม่มีการ์ด Life'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เพิ่มการ์ดจาก Life เข้ามือ เพื่อ +2500 BP?`,
        [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit._usedTurn = Engine.G.turn;
      await H.addLifeToHand(p);
      unit.bpMod += 2500;
      log(`${unit.card.name}: +2500 BP เทิร์นนี้`);
    },
  };

  // 096 Monster Association (Field) — [Main][Rest] mill top of deck to Outside Area.
  // @[Main][Rest][Retire] place 1 Garou/Trait:Monster Association card from Outside Area on top of deck.
  reg['UA35BT-OPM-1-096'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && !unit.rested && p.deck.length) opts.push({ label: '[Rest] วางการ์ดบนสุดของเด็คไป Outside Area', value: 'mill' });
      const pred = c => c && ((c.name || '').includes('Garou') || (c.traits || '').includes('Monster Association'));
      if (!unit.rested && p.sideline.some(no => pred(byNo(no)))) opts.push({ label: '[Rest][Retire] วางการ์ด Garou/Trait:Monster Association จาก Outside Area บนสุดของเด็ค', value: 'retire' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'mill') { unit._usedTurn1 = Engine.G.turn; unit.rested = true; p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
      else {
        await Engine.sidelineUnit(p, unit, 'effect');
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด', pred);
        if (idx != null) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`วาง ${byNo(no)?.name} ไว้บนสุดของเด็ค`); }
      }
    },
  };

  // 098 Hero Almanac (Event) — draw 1, may place 1 character card from hand to Outside Area.
  // (Skipped: the granted "must block if able" clause — no hook forces a blocker choice.)
  reg['UA35BT-OPM-1-098'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (!p.hand.some(no => byNo(no)?.type === 'Character')) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางการ์ด character จากมือไป Outside Area?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const idx = p.hand.findIndex(no => byNo(no)?.type === 'Character');
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
    },
  };

  // 100 Fist of Flowing Water Crushing Rock (Event) — AP -1 if own Garou; retire 1 enemy Front Line
  // character BP≤5000. (Skipped: the granted "special-trigger-retire redirect" clause — too narrow
  // a trigger-resolution override to hook in generically.)
  reg['UA35BT-OPM-1-100'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Garou') ? -1 : 0 }; },
    async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); },
  };

  // ── UA35ST-OPM-1 (newer print run) ───────────────────────────────────────

  // 104 Terrible Tornado — [Main][Frontline][1/turn] rest 1 own Front Line character BP≤5000; if did, rest 1 enemy Front Line character.
  reg['UA35ST-OPM-1-104'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => !u.rested && u.card.type === 'Character' && Engine.bp(u) <= 5000);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Front Line ให้วางนอน');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      await H.restEnemyFront(p);
    },
  };

  // 110 SilverFang — grants own Trait:Hero cards a targeting-tax (opponent must discard an extra
  // card to choose them). (Skipped: no engine primitive taxes an opponent's targeting choice, same
  // gap noted for TSK-2-008/similar cards this session.)

  // 111 Terrible Tornado — [On Play] fetch 1 green character card (not self-named) from Outside Area to hand.
  reg['UA35ST-OPM-1-111'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Green' && !(c.name || '').includes('Terrible Tornado'), `${unit.card.name}: เลือก character สีเขียวจาก Outside Area`);
    },
  };

  // 112 Speed-O'-Sound Sonic — [On Play] draw 1, discard 1. @[Main][1/turn] move 3 cards from
  // Outside Area to Remove Area; self +1000 BP this turn.
  reg['UA35ST-OPM-1-112'] = {
    async onPlay(G, p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.sideline.length < 3) { p.controller.notify?.('Outside Area มีไม่ถึง 3 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      for (let i = 0; i < 3; i++) p.removal.push(p.sideline.pop());
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // ── UAPR-OPM-P (promo prints) ─────────────────────────────────────────

  // 001 Tatsumaki — meta text-replacement effect. (Skipped: too open-ended to hook in generically,
  // same class as SMD's "Choose 1 → Choose all" skip.)

  // 002 Metal Bat — [Opponent's Turn] manual-trigger-Raid mechanic. (Skipped: same risk noted for
  // every manual-Raid-trigger card this session.)

  // 003 Speed-o'-Sound Sonic — [On Play] choose: look at top 3 for a same-named card to hand
  // (discard 1 if added); or, if played by your own effect, may discard 1 to set an own resting
  // character Active.
  reg['UAPR-OPM-P-003'] = {
    async onPlay(G, p, unit) {
      const opts = [{ label: "ดูการ์ดบนสุด 3 ใบ (หา Speed-o'-Sound Sonic)", value: 'look' }];
      if (unit._playedByEffect) opts.push({ label: 'วางการ์ดจากมือไป Outside Area เพื่อ Active character', value: 'active' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'look') {
        const taken = await H.lookTopAndTake(p, 3, c => (c.name || '').includes("Speed-o'-Sound Sonic"), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      } else {
        if (!p.hand.length) return;
        const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ Active character?`);
        if (!discarded) return;
        const targets = [...p.front, ...p.energy].filter(u => u.rested);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active', true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      }
    },
  };

  // ─── residual pass ───────────────────────────────────────────────────────────

  // "This character cannot be removed from the field by your opponent's effect." — the replacement
  // hook fires ahead of any state change, so returning true simply cancels the removal. It must
  // NOT cancel a BP-0 removal or a lost battle, which are rules, not opponent effects.
  const immuneToRemoval = {
    onBeforeLeaveField(G, p, leaving, ctx, unit) {
      if (leaving !== unit || !ctx.byOpponent) return false;
      if (ctx.reason === 'bp0' || ctx.reason === 'battle') return false;
      log(`${unit.card.name}: ไม่ถูกนำออกจากสนามด้วยเอฟเฟกต์ฝ่ายตรงข้าม`);
      return true;
    },
  };

  // return this character to hand once the battle it blocked in is over
  async function returnSelfAfterBlocking(p, unit) {
    if (!p.front.includes(unit) && !p.energy.includes(unit)) return;
    await Engine.returnUnitToHand(p, unit);
    log(`${unit.card.name}: กลับเข้ามือหลังจบ battle ที่บล็อก`);
  }

  // 1-007 Genos — [On Retire] if retired by losing a battle, set a character on your field active.
  reg['UA35BT-OPM-1-007'] = {
    async onSideline(G, p, unit, reason) {
      if (reason !== 'battle') return;
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ตั้งขึ้น`, true);
      const t = targets.find(u => u.uid === uid);
      if (!t) return;
      t.rested = false;
      log(`${t.card.name}: ตั้งขึ้น`);
    },
  };

  // 1-015 Terrible Tornado — [Main][When in Frontline][1 Per Turn] the next Event card you use from
  // your hand this turn costs 1 less AP.
  reg['UA35BT-OPM-1-015'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._apDiscountTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      unit._apDiscountTurn = Engine.G.turn;
      p.pendingDiscount = { predicate: c => c.type === 'Event', apDelta: -1 };
      log(`${unit.card.name}: Event ใบถัดไปลด AP 1`);
    },
    mainLabel: 'ลด AP ของ Event ใบถัดไป 1',
  };

  // 1-025 The Blizzard Bunch — [Main][Rest this card] usable only if you used an Event card this
  // turn; all characters on your field get +1000 BP this turn.
  reg['UA35BT-OPM-1-025'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card ก่อนในเทิร์นนี้'); return; }
      unit.rested = true;
      for (const u of [...p.front, ...p.energy]) u.bpMod += 1000;
      log(`${unit.card.name}: character ทั้งหมดได้ +1000 BP เทิร์นนี้`);
    },
    mainLabel: 'character ทั้งหมด +1000 BP',
  };

  // 1-052 Zombieman — [On Retire] you may place 1 card from your hand into your Remove Area; if you
  // do, add this card to your hand.
  reg['UA35BT-OPM-1-052'] = {
    async onSideline(G, p, unit) {
      if (!p.hand.length) return;
      const ok = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้ง 1 ใบไป Remove Area เพื่อเอาการ์ดนี้กลับมือ?`,
        [{ label: 'ทิ้ง 1 ใบ', value: true }, { label: 'ข้าม', value: false }]);
      if (!ok) return;
      await H.manualDiscardToRemoval(p);
      const i = p.sideline.lastIndexOf(unit.no);
      if (i < 0) return;
      p.sideline.splice(i, 1);
      p.hand.push(unit.no);
      log(`${unit.card.name}: กลับเข้ามือ`);
    },
  };

  // 1-061 Saitama — immune to opponent removal; returns to hand after blocking; draws when milled
  // from the deck by your own ability (approximated as: any time it lands in the Outside Area).
  reg['UA35BT-OPM-1-061'] = {
    ...immuneToRemoval,
    async onBlock(G, p, unit) { await returnSelfAfterBlocking(p, unit); },
  };

  // 1-062 Saitama — same, plus [When Attacking] retire an enemy Front Line character.
  reg['UA35BT-OPM-1-062'] = {
    ...immuneToRemoval,
    async onAttack(G, p, unit) { await H.retireEnemyFront(p); },
    async onBlock(G, p, unit) { await returnSelfAfterBlocking(p, unit); },
  };

  // 1-067 "Serious Punch" — unusable unless a Saitama is on your field; retire 1 enemy Front Line
  // and 1 enemy Energy Line character.
  reg['UA35BT-OPM-1-067'] = {
    canPlayFromHand(p) { return H.hasCardNamed(p, 'Saitama'); },
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      await H.retireEnemyFront(p);
      const energy = enemy.energy.filter(u => u.card.type === 'Character');
      if (!energy.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, energy, 'Serious Punch: เลือก character บน Energy Line ศัตรู', true);
      const t = energy.find(u => u.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 1-069 Speed-o'-Sound Sonic — [Main][1 Per Turn] move 3 cards from your Outside Area to your
  // Remove Area; if you do, this character gets +1000 BP this turn.
  reg['UA35BT-OPM-1-069'] = {
    async onMain(G, p, unit) {
      if (unit._sonicTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      if (p.sideline.length < 3) { p.controller.notify?.('ต้องมีการ์ดใน Outside Area 3 ใบ'); return; }
      unit._sonicTurn = Engine.G.turn;
      for (let i = 0; i < 3; i++) p.removal.push(p.sideline.shift());
      unit.bpMod += 1000;
      log(`${unit.card.name}: ส่ง 3 ใบไป Remove Area, ได้ +1000 BP เทิร์นนี้`);
    },
    mainLabel: 'ส่ง 3 ใบไป Remove Area → +1000 BP',
  };

  // 1-071 Speed-o'-Sound Sonic — [On Play] you may move 3 cards from your Outside Area to your
  // Remove Area to draw 1; at the end of this character's attack, if your Outside Area has 3 or
  // fewer cards and no enemy Front Line character has base BP 6000+, swap with a Sonic on Energy.
  async function sonicSwap(p, unit) {
    if (!p.front.includes(unit)) return;
    if (p.sideline.length > 3) return;
    const enemy = Engine.opponentOf(p);
    if (enemy.front.some(u => (u.card.bp || 0) >= 6000)) return;
    const pool = p.energy.filter(u => /Speed-o'-Sound Sonic/.test(u.card.name || ''));
    if (!pool.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, pool, `${unit.card.name}: สลับตำแหน่งกับ Sonic บน Energy Line?`, true);
    const t = pool.find(u => u.uid === uid);
    if (!t) return;
    p.front[p.front.indexOf(unit)] = t;
    p.energy[p.energy.indexOf(t)] = unit;
    log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
  }
  reg['UA35BT-OPM-1-071'] = {
    async onPlay(G, p, unit) {
      if (p.sideline.length < 3) return;
      const ok = await p.controller.chooseOption(p, `${unit.card.name}: ส่ง 3 ใบจาก Outside Area ไป Remove Area เพื่อจั่ว 1?`,
        [{ label: 'ส่ง 3 ใบ', value: true }, { label: 'ข้าม', value: false }]);
      if (!ok) return;
      for (let i = 0; i < 3; i++) p.removal.push(p.sideline.shift());
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    // an attack ends whether it was won, lost or never blocked
    async onWinBattle(G, p, unit) { await sonicSwap(p, unit); return false; },
    async onAnyLoseBattle(G, p, atk, enemy, defender, unit) { if (atk === unit) await sonicSwap(p, unit); },
    async onAnyUnblockedAttack(G, p, atk, unit) { if (atk === unit) await sonicSwap(p, unit); },
  };

  // 1-072 Speed-o'-Sound Sonic — [On Play] play 1 red Sonic (need <=2, AP cost 1) from your hand or
  // Outside Area to your field rested.
  reg['UA35BT-OPM-1-072'] = {
    async onPlay(G, p, unit) {
      const fits = c => c && c.type === 'Character' && (c.color || '').toLowerCase() === 'red' &&
        /Speed-o'-Sound Sonic/.test(c.name || '') && (c.need || 0) <= 2 && (c.ap || 0) === 1;
      const hi = p.hand.findIndex(no => fits(byNo(no)));
      if (hi >= 0) { await Engine.playCardFromZone(p, p.hand[hi], 'hand', { line: 'front', active: false }); return; }
      const si = p.sideline.findIndex(no => fits(byNo(no)));
      if (si >= 0) await Engine.playCardFromZone(p, p.sideline[si], 'sideline', { line: 'front', active: false });
    },
  };

  // 1-082 Boros — [On Play] +1000 BP this turn; if both players' Life totals 4 or less you may pay
  // 1 AP to retire an enemy Front Line character.
  reg['UA35BT-OPM-1-082'] = {
    async onPlay(G, p, unit) {
      unit.bpMod += 1000;
      log(`${unit.card.name}: ได้ +1000 BP เทิร์นนี้`);
      if (p.life.length + Engine.opponentOf(p).life.length > 4) return;
      if (Engine.activeAP(p) < 1) return;
      const ok = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ retire การ์ดศัตรู?`,
        [{ label: 'จ่าย 1 AP', value: true }, { label: 'ไม่จ่าย', value: false }]);
      if (!ok || !Engine.payApForEffect(p, 1)) return;
      await H.retireEnemyFront(p);
    },
  };

  // 1-102 Genos — [On Retire] play 1 yellow Genos (need <=3, AP cost 1) from your hand rested, or
  // active instead if a Saitama is on your field.
  reg['UA35ST-OPM-1-102'] = {
    async onPlay(G, p, unit) { unit.tempImpact = (unit.tempImpact || 0) + 1; log(`${unit.card.name}: ได้ [Impact (1)] เทิร์นนี้`); },
    async onSideline(G, p, unit) {
      const i = p.hand.findIndex(no => {
        const c = byNo(no);
        return c && c.type === 'Character' && (c.color || '').toLowerCase() === 'yellow' &&
          /Genos/.test(c.name || '') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      });
      if (i < 0) return;
      const active = H.hasCardNamed(p, 'Saitama');
      await Engine.playCardFromZone(p, p.hand[i], 'hand', { line: 'front', active });
    },
  };

  // 1-106 Saitama — immune to opponent removal; goes to the bottom of your deck at the end of your
  // Attack Phase; [On Play] retire an enemy Front Line character with BP 4000 or less.
  reg['UA35ST-OPM-1-106'] = {
    ...immuneToRemoval,
    async onPlay(G, p, unit) { await H.retireEnemyFront(p, 4000); },
    async onAttackPhaseEnd(G, p, unit) {
      if (!p.front.includes(unit) && !p.energy.includes(unit)) return;
      const line = p.front.includes(unit) ? p.front : p.energy;
      line.splice(line.indexOf(unit), 1);
      p.deck.push(unit.no);
      log(`${unit.card.name}: ลงไปอยู่ใต้สุดของเด็ค`);
    },
  };
})();
