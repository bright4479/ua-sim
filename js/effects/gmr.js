// ══════════ UA SIM — Gamera (GMR) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 002 Emiko — [On Retire] look at top 4, fetch 1 Trait:Kaiju card to hand, remainder to bottom.
  reg['GMR-1-002'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('Kaiju'), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 007 S-Gyaos — [On Play] rest 1 enemy Front Line character (approximated as one-shot
  // skipNextStand rather than a true "as long as this character is on the Front Line" persistent
  // lock — no engine hook re-applies a lock every stand phase for an ongoing board-state condition
  // like this). Then may discard 1 to set self Active.
  reg['GMR-1-007'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้วางนอน`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = true; t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป (ประมาณค่าจาก "ตราบใดที่การ์ดนี้อยู่บน Front Line")`); }
      }
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 010 Gyaos — [Main][1/turn] retire 1 own character without a trait; if did, self +1000 BP this turn.
  reg['GMR-1-010'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && !(u.card.traits || '').trim());
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ที่ไม่มี trait เพื่อ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 011 Gyaos — [Main][Rest] discard 1 character card without a trait from hand; if did, draw 1.
  reg['GMR-1-011'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && !(c.traits || '').trim(); });
      if (idx < 0) { p.controller.notify?.('ไม่มีการ์ด character ไม่มี trait ในมือ'); return; }
      unit.rested = true;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} จากมือไป Outside Area`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 014 Guiron — [When Attacking] +1000 BP this turn if one of your characters dealt damage to the opponent this turn.
  reg['GMR-1-014'] = {
    async onAttack(G, p, unit) { if (p._dealtDamageThisTurn) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); } },
  };

  // 019 Zigra — [Main][Frontline][Discard1][1/turn] choose 1 enemy character (any zone) BP≥1500, -1000 BP.
  reg['GMR-1-019'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 025 Jiger — [On Play] play 1 Jiger (energy=0) from hand to Front Line, rested.
  reg['GMR-1-025'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Jiger') && (c.need || 0) === 0; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: false });
    },
  };

  // 026 Jiger — [On Play] choose: play 1 Jigar (energy≤2) from Outside Area rested, or fetch 1 Jiger from Outside Area to hand.
  reg['GMR-1-026'] = {
    async onPlay(G, p, unit) {
      const predPlay = c => c && (c.name || '').includes('Jigar') && (c.need || 0) <= 2;
      const predFetch = c => c && (c.name || '').includes('Jiger');
      const opts = [];
      if (p.sideline.some(no => predPlay(byNo(no)))) opts.push({ label: 'ลง Jigar (Energy≤2) จาก Outside Area', value: 'play' });
      if (p.sideline.some(no => predFetch(byNo(no)))) opts.push({ label: 'เพิ่ม Jiger จาก Outside Area เข้ามือ', value: 'fetch' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'play') {
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Jigar', predPlay);
        if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      } else {
        await H.fetchFromSideline(p, predFetch, `${unit.card.name}: เลือก Jiger จาก Outside Area`);
      }
    },
  };

  // 033 Liquid Bomb (Event) — rest 1 enemy Front Line character; if own Zigra, all enemy Front Line
  // characters BP≥1500 get -1000 BP this turn.
  reg['GMR-1-033'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p);
      if (!H.hasCardNamed(p, 'Zigra')) return;
      const enemy = Engine.opponentOf(p);
      let n = 0;
      for (const u of enemy.front) if (u.card.type === 'Character' && Engine.bp(u) >= 1500) { u.bpMod -= 1000; n++; }
      log(`${card.name}: enemy Front Line ${n} ใบ -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 036 Ultrasonic Scalpel (Event) — choose 1 enemy Front Line character BP≤5000, place top/bottom
  // of their deck (opponent's choice; your choice instead if own Gyaos/S-Gyaos).
  reg['GMR-1-036'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const chooser = (H.hasCardNamed(p, 'Gyaos') || H.hasCardNamed(p, 'S-Gyaos')) ? p : enemy;
      const v = await chooser.controller.chooseOption(chooser, `${card.name}: วาง ${t.card.name} ไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      enemy.front.splice(enemy.front.indexOf(t), 1);
      if (v === 'top') enemy.deck.unshift(t.no); else enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป${v === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็ค`);
    },
  };

  // 039 Asymmetrical Permeability Shield (Event) — choose 1 own character +1000 BP until the start
  // of your next turn; if own Viras, draw 1 and discard 1.
  reg['GMR-1-039'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpPersist += 1000; log(`${card.name}: ${t.card.name} +1000 BP จนถึงต้นเทิร์นถัดไปของคุณ`); }
      }
      if (H.hasCardNamed(p, 'Viras')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 042 Scholars — [Main][Rest][Retire] fetch 1 Gamera from Outside Area to hand.
  reg['GMR-1-042'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.name || '').includes('Gamera');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Gamera ใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Gamera จาก Outside Area`);
    },
  };

  // 043 Muneaki Sasaki — [On Play] if own Tank on Front Line and the opponent's Energy Line has
  // space, may discard 1 to move 1 enemy Front Line character to Energy Line.
  reg['GMR-1-043'] = {
    async onPlay(G, p, unit) {
      if (!p.front.some(u => (u.card.name || '').includes('Tank'))) return;
      const enemy = Engine.opponentOf(p);
      if (enemy.energy.length >= 4 || !p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อย้าย character ศัตรูไป Energy Line?`);
      if (!discarded) return;
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(enemy, t, 'energy');
    },
  };

  // 047 Warship — [On Play] choose up to 1 enemy Front Line character BP≥1500, -1000 BP this turn.
  reg['GMR-1-047'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 048 Gamera — cannot be played/moved to the Front Line except via its own effect (Skipped: no
  // hook constrains destination-line options for play/move). [When in Energy Line] at the end of
  // this character's attack, may swap with an active Trait:Child on Front Line. (Skipped: no
  // "post-attack-resolution" hook exists — onAttack fires before battle resolves.)

  // 051 Junichi — [Main][Frontline][1/turn] draw 1, discard 1.
  reg['GMR-1-051'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 053 Joe — passive genMod +1 if this character is Active and own Trait:Child is on Front Line.
  reg['GMR-1-053'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner || unit.rested) return 0;
      return owner.front.some(u => (u.card.traits || '').includes('Child')) ? 1 : 0;
    },
  };

  // 055 Brody — [Main][Frontline][1/turn] choose 1 green character on Energy Line, set it Active.
  reg['GMR-1-055'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.energy.filter(u => u.card.color === 'Green' && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character สีเขียวบน Energy Line ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 059 Fighter Jet — [Main][EnergyLine][1/turn] move this character to the Front Line.
  reg['GMR-1-059'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Energy Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      let removeUid = null;
      if (p.front.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, p.front, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
      await Engine.moveUnitFree(p, unit, 'front', removeUid);
    },
  };

  // 062 Gamera — cannot be played/moved to the Front Line (Skipped: no hook constrains
  // play/move destination). [On Play] may reveal the bottom card of your deck; if did, place it on
  // top or bottom of your deck.
  reg['GMR-1-062'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เปิดเผยการ์ดล่างสุดของเด็ค?`,
        [{ label: 'เปิดเผย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.deck.pop();
      const c = byNo(no);
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดล่างสุด ${c.name} — วางไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด (เหมือนเดิม)', value: 'bottom' }]);
      if (v2 === 'top') p.deck.unshift(no); else p.deck.push(no);
    },
  };

  // 063 Gamera — [On Play] if this card was played by your character's effect, set self Active.
  reg['GMR-1-063'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); } } };

  // 065 Gamera — [When Attacking] draw 1 if unblocked and own Trait:Child is on Front Line.
  // (Skipped: no hook distinguishes a blocked vs. unblocked attack outcome, same gap noted
  // repeatedly this session for TSK-2-051/ARK/KGR-1-068.)

  // 066 Gamera — [Main][1/turn] if own Trait:Child is on Front Line, move this character to the other line.
  reg['GMR-1-066'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.front.some(u => u !== unit && (u.card.traits || '').includes('Child'))) { p.controller.notify?.('ต้องมี Trait:Child บน Front Line'); return; }
      unit._usedTurn = Engine.G.turn;
      const toLine = p.front.includes(unit) ? 'energy' : 'front';
      let removeUid = null;
      const dest = toLine === 'front' ? p.front : p.energy;
      if (dest.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, dest, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
      await Engine.moveUnitFree(p, unit, toLine, removeUid);
    },
  };

  // 067 Gamera — [When Attacking] if no enemy Front Line character is in Raid State, draw 1.
  reg['GMR-1-067'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (enemy.front.some(u => u.under && u.under.length)) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 071 Gamera — [On Play] may rest 1 active own Trait:Child on Front Line; if did, untap 1 AP.
  reg['GMR-1-071'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && (u.card.traits || '').includes('Child') && !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางนอน Trait:Child? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      await H.apUntap(p, 1);
    },
  };

  // 073 Gamera — [On Play] choose: retire 1 enemy Front Line character BP≤5000, or retire 1 enemy
  // Field card. @[On Retire] play 1 Gamera (energy=0, AP1) from hand/Outside Area, rested.
  reg['GMR-1-073'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const fields = enemy.energy.filter(u => u.card.type === 'Field');
      const opts = [{ label: 'Retire character ศัตรู (BP≤5000)', value: 'char' }];
      if (fields.length) opts.push({ label: 'Retire Field ของศัตรู', value: 'field' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'char') await H.retireEnemyFront(p, 5000);
      else {
        const uid = await p.controller.chooseEnemyCharacter(p, fields, `${unit.card.name}: เลือก Field ศัตรู`, true);
        const t = fields.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(enemy, t, 'effect');
      }
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const pred = c => c && (c.name || '').includes('Gamera') && (c.need || 0) === 0 && (c.ap || 0) === 1;
      const handIdx = p.hand.findIndex(no => pred(byNo(no)));
      const inSideline = p.sideline.some(no => pred(byNo(no)));
      if (handIdx < 0 && !inSideline) return;
      const opts = [];
      if (handIdx >= 0) opts.push({ label: 'ลงจากมือ', value: 'hand' });
      if (inSideline) opts.push({ label: 'ลงจาก Outside Area', value: 'sideline' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ลง Gamera (rested)`, opts);
      if (v === 'hand') await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line: 'energy', active: false });
      else if (v === 'sideline') {
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด', pred);
        if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 074 Serket (Field) — [On Play] look at top 2, keep any number on top, remainder to Outside Area.
  // @[Main][Rest][Retire] reveal the bottom card of your deck, place it on top or bottom.
  reg['GMR-1-074'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.deck.length) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const no = p.deck.pop();
      const c = byNo(no);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดล่างสุด ${c.name} — วางไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด (เหมือนเดิม)', value: 'bottom' }]);
      if (v === 'top') p.deck.unshift(no); else p.deck.push(no);
    },
  };

  // 076 Flame Spinning Attack (Event) — choose 1 own Gamera, +1000 BP this turn; if it's Trait:Air, draw 1 and it gains [Snipe] this turn.
  reg['GMR-1-076'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gamera'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Gamera`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000;
      log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      if ((t.card.traits || '').includes('Air')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); t.tempSnipe = true; log(`${card.name}: ${t.card.name} ได้ [Snipe] เทิร์นนี้`); }
    },
  };

  // 078 Bond with Gamera (Event) — choose 1 own character, set it Active; if it's Gamera, untap 1 AP.
  reg['GMR-1-078'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = false;
      log(`${card.name}: ${t.card.name} เป็น Active`);
      if ((t.card.name || '').includes('Gamera')) await H.apUntap(p, 1);
    },
  };

  // 080 Scorching Hand (Event) — AP -1 if own Gamera; retire 1 enemy Front Line character (send to
  // Remove Area instead if own Trait:Land).
  reg['GMR-1-080'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Gamera') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const toRemoval = p.front.some(u => (u.card.traits || '').includes('Land'));
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (toRemoval) { enemy.front.splice(enemy.front.indexOf(t), 1); enemy.removal.push(t.no); log(`${card.name}: ${t.card.name} ถูกส่งไป Remove Area ถาวร`); }
      else await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };
})();
