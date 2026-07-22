// ══════════ UA SIM — Sakamoto Days (SMD) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 010 Lu Wutang — [On Play] if own Lu Shaotang, set self Active.
  reg['UA43BT-SMD-1-010'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Lu Shaotang')) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); } } };

  // 012 Nagumo — [Main][Frontline][1/turn] choose 1 yellow character without [Raid] on area; it
  // gains "your [Raid] cards can raid on this character" this turn (unit.tempRaidable, checked by
  // Engine.raidTargetsFor — any raider qualifies, not just name/trait matches).
  reg['UA43BT-SMD-1-012'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.card.color === 'Yellow' && !u.kw.raidTargets.length);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character สีเหลือง (ไม่มี Raid) ให้รับ Raid ได้เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempRaidable = true; log(`${unit.card.name}: ${t.card.name} รับ Raid จากการ์ดใดก็ได้เทิร์นนี้`); }
    },
  };

  // 014 Shin Asakura — look at top 3, fetch 1 Trait:Sakamoto's Store/Heisuke Mashimo card to hand, discard 1 if added.
  reg['UA43BT-SMD-1-014'] = {
    async onPlay(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 3, c => (c.traits || '').includes("Sakamoto's Store") || (c.name || '').includes('Heisuke Mashimo'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 015 Shin Asakura — [When Attacking] if 3+ differently-named Trait:Sakamoto's Store on area, choose: draw 1 or self +1000 BP.
  reg['UA43BT-SMD-1-015'] = {
    async onAttack(G, p, unit) {
      const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("Sakamoto's Store")).map(u => u.card.name));
      if (names.size < 3) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'draw' }, { label: '+1000 BP เทิร์นนี้', value: 'buff' },
      ]);
      if (v === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 006 / 007 / 016 — depend on the "face-up card in deck/Life" mechanic. (Skipped: this needs a
  // new persistent per-position face-state overlay on the deck/Life zones, which the simulator's
  // p.deck/p.life arrays don't currently track and which touches UI rendering too widely to add
  // safely for 3 cards in one series.)

  // 018 Shin Asakura — [On Play] rest 1 enemy Front Line character, it skips its next stand.
  // (Skipped: the chained "if there's a face-up card on top of your deck..." clause — same
  // face-up-tracking gap as 006/007/016.)
  reg['UA43BT-SMD-1-018'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้วางนอน`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 029 Lu Shaotang — "cannot be blocked by characters in raided state" now handled generically via kw.unblockableByRaided.

  // 034 Ikuraisaka Shopping Street Airsoft Tournament (Field) — [1/turn] when one of your characters attacks and wins, draw 1.
  reg['UA43BT-SMD-1-034'] = {
    async onAnyWinBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 035 Sakamoto's Store (Field) — [Main][Rest][Discard1] choose 1 Trait:Sakamoto's Store character (original BP≤3500), set Active.
  reg['UA43BT-SMD-1-035'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("Sakamoto's Store") && (u.card.bp || 0) <= 3500 && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, "เลือก Trait:Sakamoto's Store ให้ Active");
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 036 Sakamoto's Family Rules — end-of-Attack-Phase conditional draw. (Skipped: no hook fires at
  // the end of Attack Phase, same gap noted for KMY-2-001/KMY-2-002/KGR-1-050.)

  // 037 Psychic Power (Event) — draw 2; opponent reveals their hand (logged only — no hidden-info
  // system to actually expose since the bot doesn't use it).
  reg['UA43BT-SMD-1-037'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const enemy = Engine.opponentOf(p);
      log(`${card.name}: ${enemy.name} เปิดเผยการ์ดในมือทั้งหมด (${enemy.hand.length} ใบ)`);
    },
  };

  // 040 I Can Totally Hear It... (Event) — AP -1 if own Shin Asakura; retire 1 enemy Front Line character BP≤5000.
  reg['UA43BT-SMD-1-040'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Shin Asakura') ? -1 : 0 }; },
    async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); },
  };

  // 044 Osaragi — [Your Turn] +1000 BP if you used extra draw this turn.
  reg['UA43BT-SMD-1-044'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.extraDrawUsed ? 1000 : 0;
    },
  };

  // 045 Osaragi — [When in Frontline] you may extra draw without paying AP (Engine.hasFreeExtraDraw).
  reg['UA43BT-SMD-1-045'] = { freeExtraDraw: true };

  // 048 Taro Sakamoto — passive +1000 BP if a Trigger effect was activated (by either player) this turn.
  reg['UA43BT-SMD-1-048'] = { bpBonus(p, unit) { return Engine.G._triggerActivatedThisTurn ? 1000 : 0; } };

  // 049 Taro Sakamoto — [On Play] look at top 3, place 1 card to the Outside Area, remainder on top.
  reg['UA43BT-SMD-1-049'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ด 1 ใบส่งไป Outside Area`, null, 1);
      const idx = picked[0] ?? 0;
      const no = revealed.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      p.deck.unshift(...revealed);
    },
  };

  // 050 Taro Sakamoto — [On Play] may discard 1 to activate a non-raided own Front Line character's
  // printed Trigger effect. (Skipped: resolveTrigger() isn't exposed on the Engine API and manually
  // re-implementing every trigger type's logic here would risk drifting from the real resolver.)

  // 054 Shishiba — [Main][Rest][Discard1] gated on having used extra draw this turn; +1 energy generation this turn.
  reg['UA43BT-SMD-1-054'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.extraDrawUsed) { p.controller.notify?.('ต้องใช้ extra draw ในเทิร์นนี้ก่อน'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      unit.tempGen += 1;
      log(`${unit.card.name}: +1 energy generation เทิร์นนี้`);
    },
  };

  // 056 Takamura — [On Play] set self Active; choose up to 1 enemy Front Line character or enemy
  // Field card, retire it. (Skipped: the "can only be played if you used extra draw this turn"
  // play-legality precondition isn't enforced pre-play, consistent with earlier series' convention.)
  reg['UA43BT-SMD-1-056'] = {
    async onPlay(G, p, unit) {
      unit.rested = false;
      log(`${unit.card.name}: Active ตัวเอง`);
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front.filter(u => u.card.type === 'Character'), ...enemy.energy.filter(u => u.card.type === 'Field')].filter(u => !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character หรือ Field ของศัตรูเพื่อ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 058 Nagumo — "Your Character Cards with [Raid] can use this card to raid with the effect of a
  // trigger." (Skipped: pure Raid-material eligibility declaration, no discrete runtime action —
  // same class as BLC-1-026.)

  // 060 Nagumo — "When you activate this card's [Get] trigger, you may change it into [Draw] or
  // [Active] instead." (Skipped: would need a per-card override hook inside the core trigger
  // resolver's 'Get' branch — too narrow to justify touching that dispatch for one card.)

  // 063 Kashima — [On Play] and [When Attacking]: look at top 3, fetch 1 Trait:LABO card to hand, discard 1 if added.
  function kashima063() {
    return async (p, unit) => {
      const taken = await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('LABO'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    };
  }
  reg['UA43BT-SMD-1-063'] = {
    async onPlay(G, p, unit) { await kashima063()(p, unit); },
    async onAttack(G, p, unit) { await kashima063()(p, unit); },
  };

  // 064 Intruder Elimination System — [On Play] if the opponent has 4+ characters BP≥4000 on their
  // Front Line, draw 1, set self Active, +2000 BP until the start of your next turn.
  reg['UA43BT-SMD-1-064'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const n = enemy.front.filter(u => u.card.type === 'Character' && Engine.bp(u) >= 4000).length;
      if (n < 4) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.rested = false;
      unit.bpPersist += 2000;
      log(`${unit.card.name}: Active ตัวเอง, +2000 BP จนถึงต้นเทิร์นถัดไปของคุณ`);
    },
  };

  // 066 Natsuki Seba — [On Play] choose 1 Trait:LABO, +1000 BP this turn. @[When Attacking] all own Trait:LABO +1000 BP this turn.
  reg['UA43BT-SMD-1-066'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('LABO'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:LABO`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
    async onAttack(G, p, unit) {
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes('LABO')) { u.bpMod += 1000; n++; }
      log(`${unit.card.name}: Trait:LABO ${n} ใบ +1000 BP เทิร์นนี้`);
    },
  };

  // 067 Natsuki Seba — [When Attacking] if 3+ Trait:LABO on area, self +1000 BP this turn.
  reg['UA43BT-SMD-1-067'] = {
    async onAttack(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('LABO')).length;
      if (n >= 3) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 076 Genkatsugi (Event) — once per turn: draw 1; if you used extra draw this turn, untap 1 AP.
  reg['UA43BT-SMD-1-076'] = {
    async onEvent(G, p, card) {
      if (p._genkatsugiTurn === Engine.G.turn) return;
      p._genkatsugiTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (p.extraDrawUsed) await H.apUntap(p, 1);
    },
  };

  // 078 It's Almost Quitting Time, So Time to Wrap Up (Event) — choose 1 enemy Front Line
  // character, -1000 BP this turn for each own Trait:LABO card.
  reg['UA43BT-SMD-1-078'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('LABO')).length;
      if (!n) return;
      await H.debuffEnemyFront(p, -1000 * n);
    },
  };

  // 079 Master of Disguise (Event) — choose 1 enemy Front Line character BP≤5000, place top/bottom
  // of their deck (opponent's choice; your choice instead if own Nagumo).
  reg['UA43BT-SMD-1-079'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const chooser = H.hasCardNamed(p, 'Nagumo') ? p : enemy;
      const v = await chooser.controller.chooseOption(chooser, `${card.name}: วาง ${t.card.name} ไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      enemy.front.splice(enemy.front.indexOf(t), 1);
      if (v === 'top') enemy.deck.unshift(t.no); else enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป${v === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็ค`);
    },
  };

  // 080 The Fun Experiment Begins! (Event) — untap 1 AP; the opponent cannot move a character from
  // Energy Line to Front Line during their next Move Phase (Engine's p._blockEnergyToFrontNextMove).
  reg['UA43BT-SMD-1-080'] = {
    async onEvent(G, p, card) {
      await H.apUntap(p, 1);
      const enemy = Engine.opponentOf(p);
      enemy._blockEnergyToFrontNextMove = true;
      log(`${card.name}: ${enemy.name} ไม่สามารถย้าย character จาก Energy Line ไป Front Line ได้ในเทิร์นถัดไป`);
    },
  };
})();
