// ══════════ UA SIM — Rurouni Kenshin (RNK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasName(p, name) { return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name)); }
  // combined "N or more <NAME>, <NAME2> and/or Trait:X cards" condition (this series' Juppongatana synergy).
  function countJuppongatanaCombo(owner) {
    return [...owner.front, ...owner.energy].filter(u => /Makoto Shishio|Yumi Komagata/.test(u.card.name || '') || (u.card.traits || '').includes('Juppongatana')).length;
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

  // 005 Kanryu Takeda — [On Play] choose 1 of: choose up to 1 enemy Front Line character BP≤2000
  // and retire it; or may retire 1 own Trait:Oniwabanshu, if did draw 1 and choose up to 1 enemy
  // Front Line character BP≤4000 and retire it.
  reg['UA41BT-RNK-1-005'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'Retire ศัตรู BP≤2000', value: 'a' }, { label: 'Retire Trait:Oniwabanshu ของตัวเอง เพื่อจั่ว1+retire BP≤4000', value: 'b' },
      ]);
      if (v === 'a') { await H.retireEnemyFront(p, 2000); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Oniwabanshu'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Oniwabanshu ให้ retire`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.retireEnemyFront(p, 4000);
    },
  };

  // 006 Seijuro Hiko — [On Play] choose up to 1 own Kenshin Himura, +1000 BP this turn.
  reg['UA41BT-RNK-1-006'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kenshin Himura'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kenshin Himura`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 010 Kenshin Himura — [Main][When in Energy Line][1/turn] may place 1 "Will to Live" from your
  // Outside Area to the bottom of your deck; if did, move this character to the Front Line and
  // +1000 BP this turn.
  reg['UA41BT-RNK-1-010'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Energy Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const idx = p.sideline.findIndex(no => (byNo(no)?.name || '').includes('Will to Live'));
      if (idx < 0) { p.controller.notify?.('ไม่มี "Will to Live" ใน Outside Area'); return; }
      unit._usedTurn = Engine.G.turn;
      const no = p.sideline.splice(idx, 1)[0];
      p.deck.push(no);
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไปใต้เด็ค`);
      if (p.front.length < 4 && (await Engine.moveUnitFree(p, unit, 'front'))) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 013 Shikijo — [Skipped]: "if your Aoshi Shinomori would leave the area by your opponent's
  // effect, you may retire this active character instead" — a replacement/substitution effect that
  // would need to intercept `sidelineUnit`/`returnUnitToHand` BEFORE they happen for a specific
  // named unit; no supporting hook for pre-empting an opponent's removal effect.

  // 016 Aoshi Shinomori — [On Play] if this character was played by your Character or Event Card
  // effect, draw 1.
  reg['UA41BT-RNK-1-016'] = {
    async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 017 Aoshi Shinomori — [On Play] may rest 1 own active Trait:Oniwabanshu on your Front Line;
  // if did, set self active.
  reg['UA41BT-RNK-1-017'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => !u.rested && (u.card.traits || '').includes('Oniwabanshu'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน Trait:Oniwabanshu เพื่อ Active ตัวเอง?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Oniwabanshu`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      unit.rested = false;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน — ${unit.card.name} เป็น Active`);
    },
  };

  // 019 Hannya — [Main][Discard1][1/turn] self +1000 BP this turn. @[On Retire] may place 1 card
  // from hand to Outside Area; if did, free-play 1 blue Aoshi Shinomori (need≤2) from Outside Area
  // to your area rested.
  reg['UA41BT-RNK-1-019'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onSideline(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.name || '').includes('Aoshi Shinomori') && (c.need || 0) <= 2; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 020 Hyottoko — [On Retire] if own Aoshi Shinomori on area, draw 1.
  reg['UA41BT-RNK-1-020'] = { async onSideline(G, p, unit) { if (hasName(p, 'Aoshi Shinomori')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 024 Misao Makimachi — [On Play] choose 1 of: self +1 generated energy this turn; or choose up
  // to 1 other own character +1000 BP this turn. @[Main][Rest] choose 1 other own character +1000
  // BP this turn. Return this card to your hand.
  reg['UA41BT-RNK-1-024'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1 energy generation เทิร์นนี้', value: 'a' }, { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
      else await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 029 "Kaiten Kenbu Rokuren" — choose 1 own Aoshi Shinomori, -1000 BP this turn. (Skipped: the
  // granted "when an attack by an Aoshi Shinomori ends, ..." reactive — no end-of-attack hook.)
  reg['UA41BT-RNK-1-029'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Aoshi Shinomori'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Aoshi Shinomori`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 032 "Sakabato Shinuchi" — choose 1 own Kenshin Himura +2000 BP this turn. Set 1 of your AP
  // cards active.
  reg['UA41BT-RNK-1-032'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kenshin Himura'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Kenshin Himura`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      await H.apUntap(p, 1);
    },
  };

  // 033 "Ryusui no Ugoki" — free-play 1 Aoshi Shinomori (need≤2, ap1) from hand or Outside Area to
  // your area active, gains "cannot attack" this turn (approximated duration via tempCannotAttack,
  // cleared at the start of your opponent's next turn). Draw 1 if played from hand. (Skipped: the
  // "if active at the end of your Attack Phase, retire this character" clause — end-of-Attack-Phase
  // hook gap.)
  reg['UA41BT-RNK-1-033'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && (c.name || '').includes('Aoshi Shinomori') && (c.need || 0) <= 2 && (c.ap || 0) === 1;
      let idx = p.hand.findIndex(no => pred(byNo(no)));
      let u = null, fromHand = false;
      if (idx >= 0) { u = await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true }); fromHand = true; }
      else { idx = p.sideline.findIndex(no => pred(byNo(no))); if (idx >= 0) u = await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true }); }
      if (!u) return;
      u.tempCannotAttack = true;
      Engine.scheduleDelayedAction(Engine.G.turn + 1, () => { u.tempCannotAttack = false; });
      log(`${card.name}: ${u.card.name} ห้ามโจมตีเทิร์นนี้`);
      if (fromHand) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 037 Hajime Saito — [On Play] choose up to 1 of Kenshin Himura/Hajime Saito/Sanosuke Sagara on
  // your area, move it to another line.
  reg['UA41BT-RNK-1-037'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => /Kenshin Himura|Hajime Saito|Sanosuke Sagara/.test(u.card.name || ''));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 042 Sanosuke Sagara — [On Play] may pay 1 AP; if did, choose up to 1 enemy Field Card and
  // retire it.
  reg['UA41BT-RNK-1-042'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Field' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ retire Field ศัตรู?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก Field ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 045 Kenshin Himura — [On Play] look at top 2, place up to 1 purple card without a trait among
  // them to the Outside Area, remainder back on top.
  reg['UA41BT-RNK-1-045'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.color === 'Purple' && !c.traits); },
  };

  // 046 Kenshin Himura — [Main][Discard1][1/turn] self +1000 BP this turn.
  reg['UA41BT-RNK-1-046'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 050 Usui Uonuma — [When Attacking] look at the face-down cards under this character, add up to
  // 1 to hand. @[On Block] may retire 1 other own Front Line character; if did, place the top card
  // of your deck face-down under this character, +500 BP this turn.
  reg['UA41BT-RNK-1-050'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const opts = unit.counters.map((no, i) => ({ label: byNo(no)?.name || no, value: i }));
      opts.push({ label: 'ไม่เอา', value: -1 });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ดคว่ำเข้ามือ`, opts);
      if (v == null || v < 0) return;
      const no = unit.counters.splice(v, 1)[0];
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
    async onBlock(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่นบน Front Line?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`); }
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 052 Hoji Sadojima — passive: if 3+ total of Makoto Shishio/Yumi Komagata/Trait:Juppongatana
  // cards on your area, +1 generated energy.
  reg['UA41BT-RNK-1-052'] = { genMod(unit, p) { return countJuppongatanaCombo(p) >= 3 ? 1 : 0; } };

  // 056 Sojiro Seta — [Skipped]: "when this card is placed from your deck to the Outside Area by
  // your effect, ..." — a reactive tied to a specific card being milled, with no hook to identify
  // which card was affected mid-resolution across the many deck-milling helper functions.

  // 058 Sojiro Seta — [Main][Frontline][1/turn] look at the top card of your deck, place it on top
  // or to the Outside Area.
  reg['UA41BT-RNK-1-058'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 060 Kamatari Honjo — [On Play] choose up to 1 of Makoto Shishio/Yumi Komagata/another
  // Trait:Juppongatana character, +1000 BP this turn.
  reg['UA41BT-RNK-1-060'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (/Makoto Shishio|Yumi Komagata/.test(u.card.name || '') || (u.card.traits || '').includes('Juppongatana')));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 066 "Juppongatana Assamble" — choose 1 enemy Front Line character with BP ≤ (own Makoto
  // Shishio/Yumi Komagata/Trait:Juppongatana count × 1000) and retire it.
  reg['UA41BT-RNK-1-066'] = { async onEvent(G, p, card) { await H.retireEnemyFront(p, countJuppongatanaCombo(p) * 1000); } };

  // 067 "Ghosts of the End of the Edo Period" — place up to 1 Makoto Shishio/Yumi Komagata/
  // Trait:Juppongatana card from your Outside Area on top of your deck. Set 1 of your AP cards active.
  reg['UA41BT-RNK-1-067'] = {
    async onEvent(G, p, card) {
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && (/Makoto Shishio|Yumi Komagata/.test(c.name || '') || (c.traits || '').includes('Juppongatana')); });
      if (idx >= 0) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`${card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`); }
      await H.apUntap(p, 1);
    },
  };

  // 071 Kaoru Kamiya — passive: if own Kenshin Himura on your Front Line, +1 generated energy.
  // @[Main][1/turn] only the turn this character was played: choose 1 own Kenshin Himura, give it
  // "opponent cannot choose this character with effects unless they pay 1 additional card"
  // (approximated via tempUntargetable, shorter duration than printed — same accepted
  // approximation used elsewhere this session).
  reg['UA41BT-RNK-1-071'] = {
    genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Kenshin Himura')) ? 1 : 0; },
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kenshin Himura'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kenshin Himura`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ห้ามถูกเลือกโดยศัตรูเทิร์นนี้`); }
    },
  };

  // 072 Hajime Saito — [On Play] choose up to 1 own Kenshin Himura, it loses all its [Your Turn]
  // effects this turn (approximated as full effect-nullify — an over-grant, but the simplest
  // representation available).
  reg['UA41BT-RNK-1-072'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kenshin Himura'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Kenshin Himura`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.effectsNullified = true; log(`${unit.card.name}: ${t.card.name} สูญเสีย effect เทิร์นนี้`); }
    },
  };

  // 075 Sanosuke Sagara — when this character attacks and is not blocked, draw 1.
  reg['UA41BT-RNK-1-075'] = {
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); } },
  };

  // 080 Megumi Takani — [On Play] choose up to 1 other own character +1000 BP this turn.
  reg['UA41BT-RNK-1-080'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 082 Megumi Takani — [On Play] choose 1 of: fetch up to 1 character card (need≤1) from Outside
  // Area to hand; or choose up to 1 other own character +1500 BP this turn.
  reg['UA41BT-RNK-1-082'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดึงการ์ด (Energy≤1) จาก Outside Area', value: 'a' }, { label: 'character อื่น +1500 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.need || 0) <= 1, `${unit.card.name}: เลือกการ์ด (Energy≤1) จาก Outside Area`);
      else await H.buffOwnCharacter(p, 1500, { excludeUnit: unit });
    },
  };

  // 084 Tsunan Tsukioka — [On Play] choose 1 of: choose up to 1 rested own Sanosuke Sagara on
  // your Front Line, set active; or may rest 1 active own Sanosuke Sagara on your Front Line, if
  // did, choose up to 1 enemy Front Line character and rest it.
  reg['UA41BT-RNK-1-084'] = {
    async onPlay(G, p, unit) {
      const restedTargets = p.front.filter(u => u.rested && (u.card.name || '').includes('Sanosuke Sagara'));
      const activeTargets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Sanosuke Sagara'));
      const opts = [];
      if (restedTargets.length) opts.push({ label: 'Active Sanosuke Sagara ที่นอนอยู่', value: 'a' });
      if (activeTargets.length) opts.push({ label: 'วางนอน Sanosuke Sagara เพื่อวางนอนศัตรู', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseOwnCharacter(p, restedTargets, `${unit.card.name}: เลือก Sanosuke Sagara`, true);
        const t = restedTargets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      } else {
        const uid = await p.controller.chooseOwnCharacter(p, activeTargets, `${unit.card.name}: เลือก Sanosuke Sagara`, true);
        const t = activeTargets.find(x => x.uid === uid);
        if (t) { t.rested = true; await H.restEnemyFront(p, null); }
      }
    },
  };

  // 087 Kenshin Himura — [Your Turn] opponent's characters that lose to this character in battle
  // move to their Energy Line instead of being retired.
  reg['UA41BT-RNK-1-087'] = {
    async onWinBattle(G, p, atk, enemy, defender) {
      if (Engine.G.players[Engine.G.active] !== p) return false;
      const line = enemy.front.includes(defender) ? enemy.front : enemy.energy;
      const idx = line.indexOf(defender);
      if (idx < 0) return false;
      if (enemy.energy.includes(defender)) return false; // already on Energy Line, nothing to move
      if (enemy.energy.length >= 4) return false; // no space — fall back to default retire
      line.splice(idx, 1);
      enemy.energy.push(defender);
      log(`${atk.card.name}: ${defender.card.name} ถูกย้ายไป Energy Line แทนการ retire`);
      return true;
    },
  };

  // 093 Yahiko Myojin — [Main][Pay1AP][1/turn] draw 1, self +1000 BP this turn. @[When Attacking]
  // may place 1 card from hand to Outside Area; if did, choose up to 1 own character that hasn't
  // attacked this turn and set it active.
  reg['UA41BT-RNK-1-093'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onAttack(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && u.attackedThisTurn === 0);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ที่ยังไม่โจมตี`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 099 "Futae no Kiwami" — only if own Sanosuke Sagara on area: choose 1 enemy Front Line
  // character BP≤5000 and retire it (or may rest 1 active own Sanosuke Sagara, if did, place it to
  // the Remove Area instead).
  reg['UA41BT-RNK-1-099'] = {
    async onEvent(G, p, card) {
      if (!hasName(p, 'Sanosuke Sagara')) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const sano = p.front.find(u => !u.rested && (u.card.name || '').includes('Sanosuke Sagara'));
      let toRemoval = false;
      if (sano) {
        const v = await p.controller.chooseOption(p, `${card.name}: วางนอน Sanosuke Sagara เพื่อส่งศัตรูไป Remove Area แทน?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { sano.rested = true; toRemoval = true; }
      }
      const line = enemy.front.includes(t) ? enemy.front : enemy.energy;
      line.splice(line.indexOf(t), 1);
      (toRemoval ? enemy.removal : enemy.sideline).push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป${toRemoval ? 'Remove Area' : 'Sideline'}`);
    },
  };

  // 100 "Ryutsuisen" — choose 1 enemy Front Line character BP≤5000 and move it to the Energy Line
  // (or place it at the bottom of their deck instead, if own Kenshin Himura).
  reg['UA41BT-RNK-1-100'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (hasName(p, 'Kenshin Himura')) {
        enemy.front.splice(enemy.front.indexOf(t), 1);
        enemy.deck.push(t.no);
        log(`${card.name}: ${t.card.name} ถูกส่งไปใต้เด็คของ ${enemy.name}`);
      } else await Engine.moveUnitFree(enemy, t, 'energy');
    },
  };

  // UA41ST-RNK-1-101 Kaoru Kamiya — [On Play][When in Energy Line] may place 1 card from hand to
  // Outside Area; if did, set self active. (Skipped: the end-of-Attack-Phase self-rest-for-draw
  // clause — end-of-Attack-Phase hook gap.)
  reg['UA41ST-RNK-1-101'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // UA41ST-RNK-1-108 "Kamiya Dojo" (Field) — [Main][Rest] draw 1, place 1 card from hand to
  // Outside Area.
  reg['UA41ST-RNK-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // UA41ST-RNK-1-109 "Sakabato" — draw 1. Choose up to 1 own Kenshin Himura, grant "[When
  // Attacking] draw 1 card" this turn (uses the existing `_grantedAttackDraw` temp flag).
  reg['UA41ST-RNK-1-109'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kenshin Himura'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Kenshin Himura`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedAttackDraw = true; log(`${card.name}: ${t.card.name} ได้รับ "เมื่อโจมตี จั่ว 1 ใบ" เทิร์นนี้`); }
    },
  };

  // UA41ST-RNK-1-111 Seijuro Hiko — "This card cannot be played to Front Line, and can only be
  // moved to Front Line by your effects." (kw.cannotEnterFront, generic). @[On Play] look at top 2,
  // place any number on top (any order), remainder to Outside Area. @[Main][Discard2][1/turn] only
  // if own Kenshin Himura on area: move this character to another line.
  reg['UA41ST-RNK-1-111'] = {
    async onPlay(G, p, unit) { await lookTopKeepOnTopRestOutside(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!hasName(p, 'Himura Kenshin') && !hasName(p, 'Kenshin Himura')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (p.hand.length < 2) { p.controller.notify?.('ต้องมีการ์ดในมืออย่างน้อย 2 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p); await H.discardFromHand(p);
      await Engine.moveUnitFree(p, unit, p.front.includes(unit) ? 'energy' : 'front');
    },
  };

  // UA41ST-RNK-1-112 Shishio Makoto — [On Play] place 1 card from your hand on top of your deck.
  reg['UA41ST-RNK-1-112'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดวางบนสุดของเด็ค`);
      if (i == null) return;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`);
    },
  };

  // UA41ST-RNK-1-113 Saito Hajime — [When Attacking] may draw 1; if did, the next time this
  // character would set to active, it doesn't.
  reg['UA41ST-RNK-1-113'] = {
    async onAttack(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จั่ว 1 ใบ (แต่จะไม่ stand ครั้งถัดไป)?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.skipNextStand = true;
      log(`${unit.card.name}: จะไม่ stand ครั้งถัดไป`);
    },
  };
})();
