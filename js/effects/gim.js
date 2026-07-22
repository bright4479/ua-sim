// ══════════ UA SIM — Girls und Panzer (GIM) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasName(p, name) { return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name)); }
  // this series' recurring "4+ distinctly-named Trait:1st Year cards, OR a single specific named
  // ally" OR-condition (appears on several 1st-Year passives with a different named-ally each time).
  function distinct1stYearOrNamed(p, altName) {
    if (altName && hasName(p, altName)) return true;
    const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('1st Year')).map(u => u.card.name));
    return names.size >= 4;
  }
  async function lookTopKeepAnyOnTopRestBottom(p, unit, n, title) {
    const cnt = Math.min(n, p.deck.length);
    if (!cnt) return;
    const revealed = p.deck.splice(0, cnt);
    const keepIdxs = await p.controller.chooseRevealPick(p, revealed, title, null, revealed.length);
    const keepSet = new Set(keepIdxs);
    const keep = [], bottom = [];
    revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
    p.deck.unshift(...keep);
    p.deck.push(...bottom);
    log(`${unit.card.name}: ดูการ์ดบนสุด ${cnt} ใบ`);
  }

  // EX13BT-GIM-2-002 Lilja Katsuragi — [1/turn] when a Sumika Shiun is played on a different line
  // than this character, you may move this character to another line.
  reg['EX13BT-GIM-2-002'] = {
    async onAnyPlay(G, p, playedUnit, self) {
      if (self._usedTurn === Engine.G.turn) return;
      if (!(playedUnit.card.name || '').includes('Sumika Shiun')) return;
      const selfLine = p.front.includes(self) ? p.front : p.energy;
      const playedLine = p.front.includes(playedUnit) ? p.front : p.energy;
      if (selfLine === playedLine) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: ย้าย line?`, [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      self._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, self, selfLine === p.front ? 'energy' : 'front');
    },
  };

  // EX13BT-GIM-2-003 Lilja Katsuragi — when this character leaves the area by an effect (not
  // battle), free-play 1 yellow same-named Lilja Katsuragi (need≤3, ap1) from hand rested. @[Your
  // Turn] if 4+ distinctly-named Trait:1st Year cards or own Sumika Shiun on your area, +1000 BP.
  reg['EX13BT-GIM-2-003'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && distinct1stYearOrNamed(p, 'Sumika Shiun')) ? 1000 : 0; },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.name || '').includes('Lilja Katsuragi') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // EX13BT-GIM-2-004 China Kuramoto — [On Play] choose up to 1 own Trait:1st Year character, +1000 BP this turn.
  reg['EX13BT-GIM-2-004'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('1st Year'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:1st Year`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // EX13BT-GIM-2-006 Sumika Shiun — [Your Turn] if 4+ distinctly-named Trait:1st Year or own Lilja
  // Katsuragi on your area, +1500 BP.
  reg['EX13BT-GIM-2-006'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && distinct1stYearOrNamed(p, 'Lilja Katsuragi')) ? 1500 : 0; },
  };

  // EX13BT-GIM-2-009 Tsubame Amaya — [On Play] look at top 2, place up to 1 Trait:3rd Year to
  // Outside Area, remainder back on top.
  reg['EX13BT-GIM-2-009'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('3rd Year')); },
  };

  // EX13BT-GIM-2-010 Tsubame Amaya — passive: if 4+ Trait:3rd Year on your area, +1 generated energy.
  reg['EX13BT-GIM-2-010'] = {
    genMod(unit, p) { return [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('3rd Year')).length >= 4 ? 1 : 0; },
  };

  // EX13BT-GIM-2-018 Rinami Himesaki — [On Play] look at top 2, place any number on top (any
  // order) and the rest at the bottom of your deck.
  reg['EX13BT-GIM-2-018'] = { async onPlay(G, p, unit) { await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // EX13BT-GIM-2-021 Misuzu Hataya — [Your Turn] if 4+ distinctly-named Trait:1st Year or own
  // Temari Tsukimura on your area, +1000 BP.
  reg['EX13BT-GIM-2-021'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && distinct1stYearOrNamed(p, 'Temari Tsukimura')) ? 1000 : 0; },
  };

  // EX13BT-GIM-2-023 Ume Hanami — [1/turn] when a Saki Hanami is played on a different line than
  // this character, you may move this character to another line.
  reg['EX13BT-GIM-2-023'] = {
    async onAnyPlay(G, p, playedUnit, self) {
      if (self._usedTurn === Engine.G.turn) return;
      if (!(playedUnit.card.name || '').includes('Saki Hanami')) return;
      const selfLine = p.front.includes(self) ? p.front : p.energy;
      const playedLine = p.front.includes(playedUnit) ? p.front : p.energy;
      if (selfLine === playedLine) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: ย้าย line?`, [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      self._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, self, selfLine === p.front ? 'energy' : 'front');
    },
  };

  // EX13BT-GIM-2-025 Temari Tsukimura — [Skipped]: "at the end of your Attack Phase, if this
  // character is on the same line as Misuzu Hataya or Lilja Katsuragi, you may move it" — needs an
  // end-of-Attack-Phase hook that doesn't exist yet (recurring gap this session).

  // EX13BT-GIM-2-027 Saki Hanami — passive: if this character is active, +1 generated energy.
  reg['EX13BT-GIM-2-027'] = { genMod(unit) { return !unit.rested ? 1 : 0; } };

  // EX13BT-GIM-2-031 Kotone Fujita — at the end of THIS character's attack (win, loss, or
  // unblocked — wired via all 3 post-attack hooks), may place this character at the bottom of your
  // deck; if did, draw 1 and choose up to 1 other own Trait:1st Year character (not Kotone Fujita)
  // on your Energy Line, move it to the Front Line and grant it +2000 BP this turn.
  async function endOfAttackKotoneFujita(G, p, unit) {
    const line = p.front.includes(unit) ? p.front : p.energy;
    if (!line.includes(unit)) return;
    const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งตัวเองไปใต้เด็ค?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    line.splice(line.indexOf(unit), 1);
    p.deck.push(unit.no);
    log(`${unit.card.name}: ถูกส่งไปใต้เด็ค`);
    Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    const targets = p.energy.filter(u => u !== unit && (u.card.traits || '').includes('1st Year') && !(u.card.name || '').includes('Kotone Fujita'));
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:1st Year บน Energy Line', true);
    const t = targets.find(x => x.uid === uid);
    if (t && (await Engine.moveUnitFree(p, t, 'front'))) { t.bpMod += 2000; log(`${t.card.name}: +2000 BP เทิร์นนี้`); }
  }
  reg['EX13BT-GIM-2-031'] = {
    async onWinBattle(G, p, atk) { await endOfAttackKotoneFujita(G, p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemyOwner, defender, self) { if (atk === self) await endOfAttackKotoneFujita(G, p, atk); },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) await endOfAttackKotoneFujita(G, p, atkUnit); },
  };

  // EX13BT-GIM-2-032 Sena Juo — [Main][Rest+Retire this card] free-play 1 yellow Trait:3rd Year
  // (not Sena Juo, need≤1) from your Outside Area to your area rested.
  reg['EX13BT-GIM-2-032'] = {
    async onMain(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('3rd Year') && !(c.name || '').includes('Sena Juo') && (c.need || 0) <= 1;
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:3rd Year จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // EX13BT-GIM-2-034 Sena Juo — [Skipped]: "choose 2 of the following" combo including a
  // manual-trigger-Raid clause ("raid up to 1 character card with fulfilled required energy from
  // your hand that can be raided onto the chosen character") — same recurring manual-Raid-search
  // gap noted for several cards this session (Engine.raidCard only supports the player's own
  // normal declared raid action, not a scripted search-and-raid flow).

  // EX13BT-GIM-2-035 Classroom (Field) — [On Play] may place 1 card from hand to Outside Area; if
  // did, set this Field to active. @[Main][Rest][Pay 1 AP] draw 1, free-play 1 Trait:1st Year card
  // (fulfilled energy, ap1) from hand to your area AS ACTIVE. (Skipped: the granted "return to hand
  // at the end of your Attack Phase" clause on the played character, and the "cannot play a
  // same-named card already on your area" restriction — the former needs the still-missing
  // end-of-Attack-Phase hook, the latter is a minor edge-case simplification.)
  reg['EX13BT-GIM-2-035'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area เพื่อ Active Field นี้?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (Engine.activeAP(p) < 1 || !Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('1st Year') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
    },
  };

  // EX13BT-GIM-2-038 "Now, One More Round!" — choose 1 enemy Front Line character with BP ≤ (own
  // Trait:3rd Year card count × 1000) and retire it.
  reg['EX13BT-GIM-2-038'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('3rd Year')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // EX13BT-GIM-2-040 "Doesn't This Suit You?" — choose 1 own character and set it to active; if it
  // has Trait:1st Year, also set 1 of your AP cards to active.
  reg['EX13BT-GIM-2-040'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = false;
      log(`${card.name}: ${t.card.name} เป็น Active`);
      if ((t.card.traits || '').includes('1st Year')) await H.apUntap(p, 1);
    },
  };

  // EX13BT-GIM-2-046 Hiro Shinosawa — [Main][Frontline][1/turn] only if this character is active:
  // look at the top card of your deck, place it on top or to the Outside Area.
  reg['EX13BT-GIM-2-046'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // EX13BT-GIM-2-048 Sena Juo — [Main][1/turn] (gated to the turn played, only if both Misuzu
  // Hataya and Ume Hanami are on your area) choose 1 of Misuzu Hataya/Ume Hanami with a printed
  // [Main] ability on your area and set it to active.
  reg['EX13BT-GIM-2-048'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const bothPresent = hasName(p, 'Misuzu Hataya') && hasName(p, 'Ume Hanami');
      if (bothPresent && unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.rested && /\[Main\]/.test(u.card.effect || '') && ((u.card.name || '').includes('Misuzu Hataya') || (u.card.name || '').includes('Ume Hanami')));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Misuzu Hataya/Ume Hanami`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // EX13BT-GIM-2-049 Misuzu Hataya — [Main][Rest][1/turn] rest 1 own active Front Line character;
  // if did, +1 generated energy this turn.
  reg['EX13BT-GIM-2-049'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => !u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Front Line ให้วางนอน', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; unit.tempGen += 1; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน — +1 energy generation เทิร์นนี้`); }
    },
  };

  // EX13BT-GIM-2-051 Ume Hanami — [On Play] may place 1 card from hand to Outside Area; if did,
  // choose 1 of: buff up to 1 other character with original BP≤2500 +1500 BP this turn; or fetch up
  // to 1 Event card without [Special]/[Final] from Outside Area to hand.
  reg['EX13BT-GIM-2-051'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น BP≤2500 +1500 BP เทิร์นนี้', value: 'a' }, { label: 'ดึง Event card จาก Outside Area', value: 'b' },
      ]);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.bp || 0) <= 2500);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (BP≤2500)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1500; log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
      } else {
        await H.fetchFromSideline(p, c => c && c.type === 'Event' && c.trigger !== 'Special' && c.trigger !== 'Final', `${unit.card.name}: เลือก Event card จาก Outside Area`);
      }
    },
  };

  // EX13BT-GIM-2-055 "Let's Enjoy Summer!" — choose up to 1 character with original BP≤2500,
  // +1500 BP this turn. Set 1 of your AP cards to active.
  reg['EX13BT-GIM-2-055'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.bp || 0) <= 2500);
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character (BP≤2500)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1500; log(`${card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
      }
      await H.apUntap(p, 1);
    },
  };

  // EX13BT-GIM-2-057 Lilja Katsuragi — passive: if own Sumika Shiun on Front Line, +1 generated energy.
  reg['EX13BT-GIM-2-057'] = { genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Sumika Shiun')) ? 1 : 0; } };

  // EX13BT-GIM-2-059 Sumika Shiun — [On Play] look at top 3, place up to 1 to the Outside Area,
  // remainder back on top.
  reg['EX13BT-GIM-2-059'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // EX13BT-GIM-2-061 Temari Tsukimura — [Main][Discard 1][1/turn] self +1500 BP this turn.
  reg['EX13BT-GIM-2-061'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1500;
      log(`${unit.card.name}: +1500 BP เทิร์นนี้`);
    },
  };

  // EX13BT-GIM-2-062 Temari Tsukimura — [Your Turn] if own Saki Hanami and Kotone Fujita on your
  // area, +1000 BP and gains "when this character attacks and wins a battle, draw up to 1 card".
  reg['EX13BT-GIM-2-062'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && hasName(p, 'Saki Hanami') && hasName(p, 'Kotone Fujita')) ? 1000 : 0; },
    async onWinBattle(G, p, atk) {
      if (hasName(p, 'Saki Hanami') && hasName(p, 'Kotone Fujita')) { Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`); }
      return false;
    },
  };

  // EX13BT-GIM-2-064 Kotone Fujita — [On Play] choose up to 1 of Saki Hanami/Temari
  // Tsukimura/another Kotone Fujita on your area, +1000 BP this turn.
  reg['EX13BT-GIM-2-064'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && /Saki Hanami|Temari Tsukimura|Kotone Fujita/.test(u.card.name || ''));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // EX13BT-GIM-2-065 Kotone Fujita — [When in Frontline][1/turn] when your Temari Tsukimura's
  // attack is not blocked, this character +1000 BP this turn. @[When in Frontline][1/turn] when
  // your Saki Hanami attacks and wins a battle, draw up to 1 card.
  reg['EX13BT-GIM-2-065'] = {
    async onAnyUnblockedAttack(G, p, atkUnit, self) {
      if (!p.front.includes(self) || self._usedTurnA === Engine.G.turn) return;
      if (!(atkUnit.card.name || '').includes('Temari Tsukimura')) return;
      self._usedTurnA = Engine.G.turn;
      self.bpMod += 1000;
      log(`${self.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onAnyWinBattle(G, p, atk, enemyOwner, defender, self) {
      if (!p.front.includes(self) || self._usedTurnB === Engine.G.turn) return;
      if (!(atk.card.name || '').includes('Saki Hanami')) return;
      self._usedTurnB = Engine.G.turn;
      Engine.draw(p, 1);
      log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // EX13BT-GIM-2-069 "Will It Be Done Soon, I Wonder?" — draw 2; if you used another Event card
  // this turn, draw 1 more.
  reg['EX13BT-GIM-2-069'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if ((p._eventsUsedThisTurn || 0) >= 2) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ (ใช้ Event card อื่นแล้วเทิร์นนี้)`); }
    },
  };

  // EX13BT-GIM-2-070 "Let's Enjoy Summer to the Fullest!" — only usable if own Saki Hanami, Temari
  // Tsukimura and Kotone Fujita are all on your area. Choose up to 1 enemy Front Line character
  // BP≤5000 and retire it. Choose up to 1 own character +1000 BP this turn.
  reg['EX13BT-GIM-2-070'] = {
    async onEvent(G, p, card) {
      if (!(hasName(p, 'Saki Hanami') && hasName(p, 'Temari Tsukimura') && hasName(p, 'Kotone Fujita'))) return;
      await H.retireEnemyFront(p, 5000);
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // UA27BT-GIM-1-002 Lilja Katsuragi — [On Block] self -1000 BP this turn (or +1000 instead if the
  // attacking character is in Raid State).
  reg['UA27BT-GIM-1-002'] = {
    async onBlock(G, p, unit, atkUnit) {
      if (atkUnit && atkUnit.under && atkUnit.under.length) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้ (ศัตรูอยู่ใน Raid State)`); }
      else { unit.bpMod -= 1000; log(`${unit.card.name}: -1000 BP เทิร์นนี้`); }
    },
  };

  // UA27BT-GIM-1-008 Hiro Shinosawa — passive: on your turn, if there's a character with original
  // BP≤2500 on your Front Line, +1000 BP.
  reg['UA27BT-GIM-1-008'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p.front.some(u => u.card.type === 'Character' && (u.card.bp || 0) <= 2500)) ? 1000 : 0; },
  };

  // UA27BT-GIM-1-009 Hiro Shinosawa — [On Play] choose up to 1 own character with original
  // BP≤2500, +1500 BP this turn.
  reg['UA27BT-GIM-1-009'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.bp || 0) <= 2500);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (BP≤2500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1500; log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
    },
  };

  // UA27BT-GIM-1-010 Hiro Shinosawa — [On Play][1/turn] this turn, reduce the AP cost of the next
  // Character Card with BP≤2500 you use from your hand by 1 (uses the engine's existing
  // `p.pendingDiscount` one-shot-discount primitive).
  reg['UA27BT-GIM-1-010'] = {
    async onPlay(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      unit._usedTurn = Engine.G.turn;
      p.pendingDiscount = { predicate: c => c.type === 'Character' && (c.bp || 0) <= 2500, apDelta: -1 };
      log(`${unit.card.name}: การ์ด Character ใบถัดไป (BP≤2500) ที่เล่นจากมือ ลด AP cost 1`);
    },
  };

  // UA27BT-GIM-1-016 Rinami Himesaki — [On Play] free-play 1 blue Character Card (need≤3, ap1)
  // from your Outside Area to your area rested. (Skipped: the "or raid it" alternative — raiding
  // from the Outside Area isn't supported by Engine.raidCard, same gap noted for several cards.)
  reg['UA27BT-GIM-1-016'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก character สีน้ำเงิน (Energy≤3, AP1) จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // UA27BT-GIM-1-027 Ume Hanami — passive: if there's a character with BP≥4000 on your Front Line,
  // +1 generated energy.
  reg['UA27BT-GIM-1-027'] = { genMod(unit, p) { return p.front.some(u => Engine.bp(u) >= 4000) ? 1 : 0; } };

  // UA27BT-GIM-1-028 Ume Hanami — passive: on your turn, if there's a character on your Front Line
  // with BP≥5000 other than Ume Hanami, +1000 BP. @[Main][Frontline][1/turn] look at the top card
  // of your deck, place it on top or to the Outside Area.
  reg['UA27BT-GIM-1-028'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p.front.some(u => u !== unit && Engine.bp(u) >= 5000)) ? 1000 : 0; },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // UA27BT-GIM-1-030 Temari Tsukimura — [On Play] choose up to 1 own Misuzu Hataya, set active.
  reg['UA27BT-GIM-1-030'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Misuzu Hataya'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Misuzu Hataya`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // UA27BT-GIM-1-032 Kotone Fujita — [Main][Rest this card] draw 1, place 1 card from hand to Outside Area.
  reg['UA27BT-GIM-1-032'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // UA27BT-GIM-1-033 Student Council Room (Field) — [Main][Rest][1/turn] only if there's a
  // character with BP≥5000 on your Front Line: draw 1, place 1 card from hand to Outside Area.
  reg['UA27BT-GIM-1-033'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.front.some(u => Engine.bp(u) >= 5000)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // UA27BT-GIM-1-034 "Success In A New Challenge!" — draw 3, place 2 cards from hand to Outside Area.
  reg['UA27BT-GIM-1-034'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
      await H.discardFromHand(p);
      await H.discardFromHand(p);
    },
  };

  // UA27BT-GIM-1-035 "Thank You For Your Hard Work, China-chan." — free-play 1 blue Character Card
  // (need≤3, ap1) from your Outside Area to your area rested. (Skipped: the "or raid it"
  // alternative, same gap as UA27BT-GIM-1-016.)
  reg['UA27BT-GIM-1-035'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const i = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก character สีน้ำเงิน (Energy≤3, AP1) จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // UA27BT-GIM-1-037 "Grrrrrr...!" — choose 1 own character +1500 BP this turn; if it's Ume
  // Hanami, it also gains [Damage +1] this turn.
  reg['UA27BT-GIM-1-037'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1500;
      log(`${card.name}: ${t.card.name} +1500 BP เทิร์นนี้`);
      if ((t.card.name || '').includes('Ume Hanami')) { t.tempDmg = (t.kw.dmg || 1) + 1; log(`${card.name}: ${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
    },
  };

  // UA27BT-GIM-1-039 "We Can Do It If We Try" — choose 1 enemy Front Line character with BP ≤ (own
  // character count with original BP≤2500 × 1000) and retire it.
  reg['UA27BT-GIM-1-039'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.bp || 0) <= 2500).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // UA27BT-GIM-1-043 Mao Arimura — [On Play] look at top 2, place any number on top (any order),
  // remainder to the bottom.
  reg['UA27BT-GIM-1-043'] = { async onPlay(G, p, unit) { await lookTopKeepAnyOnTopRestBottom(p, unit, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // UA27BT-GIM-1-052 Sumika Shiun — [On Play] if you used an Event Card this turn, draw 1.
  reg['UA27BT-GIM-1-052'] = {
    async onPlay(G, p, unit) { if (p._eventsUsedThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // UA27BT-GIM-1-054 Hiro Shinosawa — [On Play] look at the top 3 cards, place 1 among them on top
  // of your deck, remainder to the bottom.
  reg['UA27BT-GIM-1-054'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ด 1 ใบวางไว้บนสุด`, null, 1);
      const keepSet = new Set(keepIdxs);
      const keep = [], bottom = [];
      revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
      p.deck.unshift(...keep);
      p.deck.push(...bottom);
      log(`${unit.card.name}: ดูการ์ดบนสุด ${n} ใบ`);
    },
  };

  // UA27BT-GIM-1-058 Misuzu Hataya — [On Play] choose up to 1 own Temari Tsukimura, set active.
  reg['UA27BT-GIM-1-058'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Temari Tsukimura'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Temari Tsukimura`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // UA27BT-GIM-1-061 Temari Tsukimura — passive: if own Saki Hanami and Kotone Fujita on your
  // area, +1000 BP (always-on, not turn-gated).
  reg['UA27BT-GIM-1-061'] = {
    bpBonus(p, unit) { return (hasName(p, 'Saki Hanami') && hasName(p, 'Kotone Fujita')) ? 1000 : 0; },
  };

  // UA27BT-GIM-1-066 Saki Hanami — [When Attacking] if own Ume Hanami on Front Line, draw 1, place
  // 1 card from hand to Outside Area.
  reg['UA27BT-GIM-1-066'] = {
    async onAttack(G, p, unit) {
      if (p.front.some(u => (u.card.name || '').includes('Ume Hanami'))) {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        await H.discardFromHand(p);
      }
    },
  };

  // UA27BT-GIM-1-078 "2nd Classroom Party!" — look at top 3, add 2 among them to hand, remainder bottom.
  reg['UA27BT-GIM-1-078'] = {
    async onEvent(G, p, card) { await H.lookTopAndTake(p, 3, () => true, 2, `${card.name}: ดูการ์ดบนสุด 3 ใบ`); },
  };

  // UA27BT-GIM-1-079 "Come On, Let's Hold It Together♪" — draw 1. This turn, reduce the AP cost of
  // the next Lilja Katsuragi or Sumika Shiun you use from your hand by 1.
  reg['UA27BT-GIM-1-079'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Lilja Katsuragi') || (c.name || '').includes('Sumika Shiun'), apDelta: -1 };
      log(`${card.name}: การ์ด Lilja Katsuragi/Sumika Shiun ใบถัดไป ลด AP cost 1`);
    },
  };

  // UA27BT-GIM-1-080 "Like A Prince" — choose 1 own character +2000 BP this turn (until the start
  // of your next turn instead, if own Lilja Katsuragi or Sumika Shiun is on your area).
  reg['UA27BT-GIM-1-080'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const persist = hasName(p, 'Lilja Katsuragi') || hasName(p, 'Sumika Shiun');
      if (persist) { t.bpPersist += 2000; log(`${card.name}: ${t.card.name} +2000 BP จนถึงต้นเทิร์นหน้า`); }
      else { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };
})();
