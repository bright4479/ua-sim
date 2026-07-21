// ══════════ UA SIM — Jujutsu Kaisen (JJK) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  async function playTraitFromHandOrSideline(p, unit, pred, { line = 'energy', active = false, title } = {}) {
    const handIdx = p.hand.findIndex(no => pred(byNo(no)));
    const inSideline = p.sideline.some(no => pred(byNo(no)));
    if (handIdx < 0 && !inSideline) return;
    const opts = [];
    if (handIdx >= 0) opts.push({ label: `ลงจากมือ (${byNo(p.hand[handIdx])?.name})`, value: 'hand' });
    if (inSideline) opts.push({ label: 'ลงจาก Outside Area', value: 'sideline' });
    opts.push({ label: 'ข้าม', value: null });
    const v = await p.controller.chooseOption(p, title || `${unit.card.name}: เลือกแหล่งการ์ด`, opts);
    if (v === 'hand') await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line, active });
    else if (v === 'sideline') {
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ดจาก Outside Area', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line, active });
    }
  }

  async function bounceEnemyAny(p, unit, bpLimit) {
    const enemy = Engine.opponentOf(p);
    const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= bpLimit);
    if (!targets.length) return;
    const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤${bpLimit}) กลับมือ`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { await Engine.returnUnitToHand(enemy, t); log(`${unit.card.name}: ${t.card.name} ถูกส่งกลับมือ`); }
  }

  async function sendEnemyFieldToBottom(p, unit) {
    const enemy = Engine.opponentOf(p);
    const fields = enemy.energy.filter(u => u.card.type === 'Field' && !u.kw.untargetable && !u.tempUntargetable);
    if (!fields.length) return;
    const uid = await p.controller.chooseEnemyCharacter(p, fields, `${unit.card.name}: เลือก Field ศัตรูส่งไปใต้เด็ค`, true);
    const t = fields.find(x => x.uid === uid);
    if (!t) return;
    enemy.energy.splice(enemy.energy.indexOf(t), 1);
    enemy.deck.push(t.no);
    log(`${unit.card.name}: ส่ง ${t.card.name} ไปใต้เด็คของ ${enemy.name}`);
  }

  // ── JJK-1 ──────────────────────────────────────────────────────────────

  // 001 Itadori Yuuji — [Main][Rest][1/turn] +1 energy generation this turn, retire at end of Main.
  reg['JJK-1-001'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      unit.tempGen += 1;
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: +1 energy generation เทิร์นนี้ (จะ retire เมื่อจบ Main Phase)`);
    },
  };

  // 004 Inumaki Toge — [On Retire] rest 1 enemy Front Line character.
  reg['JJK-1-004'] = {
    async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await H.restEnemyFront(p); },
  };

  // 007 Kugisaki Nobara — [Main][Front][Rest] rest 1 enemy Front Line character.
  reg['JJK-1-007'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.restEnemyFront(p);
    },
  };

  // 010 Satoru Gojo — [On Play] choose 1 opponent's Field card, return to bottom of their deck.
  reg['JJK-1-010'] = { async onPlay(G, p, unit) { await sendEnemyFieldToBottom(p, unit); } };

  // 018 Fushiguro Tsumiki — [On Play] choose 1 of your character, +1000 BP this turn.
  reg['JJK-1-018'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000); } };

  // 021 Fushiguro Megumi — [On Play] play 1 Trait:Shikigami (energy≤3, AP1) from hand/Outside Area, Active.
  reg['JJK-1-021'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Shikigami') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      await playTraitFromHandOrSideline(p, unit, pred, { active: true, title: `${unit.card.name}: เลือกแหล่ง Trait:Shikigami (Active)` });
    },
  };

  // 024 Gyokuken: Kuro & Shiro — [When Attacking] choose up to 1 other character on area, +500 BP.
  reg['JJK-1-024'] = { async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); } };

  // 027 Chimera Shadow Garden (Field) — [Main][Pay1AP][1/turn] all Trait:Shikigami +1000 BP this turn.
  // @[1/turn] when own Fushiguro Megumi attacks, choose 1 rested Trait:Shikigami on Front Line, set Active.
  reg['JJK-1-027'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes('Shikigami')) { u.bpMod += 1000; n++; }
      log(`${unit.card.name}: Trait:Shikigami ${n} ใบ +1000 BP เทิร์นนี้`);
    },
    async onAnyAttack(G, p, atk, self) {
      if (self._usedTurn2 === Engine.G.turn) return;
      if (!(atk.card.name || '').includes('Fushiguro Megumi')) return;
      const targets = p.front.filter(u => (u.card.traits || '').includes('Shikigami') && u.rested);
      if (!targets.length) return;
      self._usedTurn2 = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${self.card.name}: เลือก Trait:Shikigami บน Front Line ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${self.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 028 Infinite Void (Field) — [On Play] rest 1 enemy Front Line character.
  // (Skipped: the "doesn't stand" lock on that specific character, and the self-retire-if-no-Gojo
  // end-of-Battle-Phase check — no engine hook watches a per-unit permanent stand-lock yet.)
  reg['JJK-1-028'] = { async onPlay(G, p, unit) { await H.restEnemyFront(p); } };

  // 029 Hollow Technique: Purple (Event) — AP -1 if own Gojo Satoru. Choose 1 enemy Front Line
  // character, send to Remove Area (genuinely permanent, not Outside Area/Sideline).
  reg['JJK-1-029'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Gojo Satoru') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูส่งไป Remove Area ถาวร`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      enemy.front.splice(enemy.front.indexOf(t), 1);
      enemy.removal.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป Remove Area ถาวร`);
    },
  };

  // 030 Reverse Cursed Technique: Red (Event) — choose 1 enemy Front Line character BP≤4000, move to Energy Line.
  reg['JJK-1-030'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤4000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      let removeUid = null;
      if (enemy.energy.length >= 4) removeUid = await enemy.controller.chooseOwnCharacter(enemy, enemy.energy, 'เลือกการ์ดบน Energy Line ส่งไป Remove Area (ไม่มีที่ว่าง)');
      await Engine.moveUnitFree(enemy, t, 'energy', removeUid);
    },
  };

  // 031 Suurei Juhou — choose 1 rested enemy Front Line character, retire it.
  reg['JJK-1-031'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.rested && u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูที่นอนอยู่ให้ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 032 Suurei Juhou — rest 1 own active + 1 enemy Front Line character. If own Kugisaki Nobara, untap 1 AP.
  reg['JJK-1-032'] = {
    async onEvent(G, p, card) {
      const ownTargets = p.front.filter(u => !u.rested && u.card.type === 'Character');
      if (ownTargets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, ownTargets, `${card.name}: เลือก character ของคุณให้วางนอน`, true);
        const t = ownTargets.find(x => x.uid === uid);
        if (t) { t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`); }
      }
      await H.restEnemyFront(p);
      if (H.hasCardNamed(p, 'Kugisaki Nobara')) await H.apUntap(p, 1);
    },
  };

  // 033 Ten Shadows Technique (Event) — draw 1, then free-play 1 Trait:Shikigami (energy≤3, AP1)
  // from hand, rested (Active if own Fushiguro Megumi).
  reg['JJK-1-033'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Shikigami') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const active = H.hasCardNamed(p, 'Fushiguro Megumi');
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active });
    },
  };

  // 036 Ijichi Kiyotaka — [Main][Rest][1/turn] +1 energy generation this turn, retire at end of Main.
  reg['JJK-1-036'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      unit.tempGen += 1;
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: +1 energy generation เทิร์นนี้ (จะ retire เมื่อจบ Main Phase)`);
    },
  };

  // 039 / UA02PB-039 Itadori Yuuji — [On Play] choose 1 enemy Front Line character BP≤3500: bounce
  // if 1-2 Sukuna's Finger in Outside Area, retire instead if 3+.
  function itadori039() {
    return {
      async onPlay(G, p, unit) {
        const n = p.sideline.filter(no => (byNo(no)?.name || '').includes("Sukuna's Finger")).length;
        if (n < 1) return;
        if (n >= 3) await H.retireEnemyFront(p, 3500);
        else await H.bounceEnemyFront(p, 3500);
      },
    };
  }
  reg['JJK-1-039'] = itadori039();
  reg['UA02PB-JJK-1-039'] = itadori039();

  // 041 Inumaki Toge — [Main][Front][1/turn] choose 1 enemy (any zone) BP≥1000, -500 BP.
  reg['JJK-1-041'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.debuffEnemyAny(p, -500, { min: 1000 });
    },
  };

  // 049 Zenin Maki — passive +1000 BP if 1+ Trait:Cursed Tool or 4+ Event cards in Outside Area.
  reg['JJK-1-049'] = {
    bpBonus(p, unit) {
      const hasTool = p.sideline.some(no => (byNo(no)?.traits || '').includes('Cursed Tool'));
      const eventCount = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      return (hasTool || eventCount >= 4) ? 1000 : 0;
    },
  };

  // 050 Zenin Maki — [Opponent's Turn] same condition, +1500 BP. @[On Play] look at top 2, add up
  // to 1 to hand, remainder to Outside Area (not bottom of deck).
  reg['JJK-1-050'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] === p) return 0;
      const hasTool = p.sideline.some(no => (byNo(no)?.traits || '').includes('Cursed Tool'));
      const eventCount = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      return (hasTool || eventCount >= 4) ? 1500 : 0;
    },
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, null, 1);
      const idx = picked[0];
      if (idx != null) { p.hand.push(revealed.splice(idx, 1)[0]); log(`${unit.card.name}: เพิ่ม ${byNo(p.hand[p.hand.length - 1])?.name} เข้ามือ`); }
      p.sideline.push(...revealed);
      if (revealed.length) log(`${unit.card.name}: ส่งการ์ดที่เหลือไป Outside Area`);
    },
  };

  // 052 Nanami Kento — [When Attacking] may place top of deck to Outside Area to debuff 1 enemy
  // (any zone, BP≥1500) -1000 BP.
  reg['JJK-1-052'] = {
    async onAttack(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คไป Outside Area เพื่อ debuff ศัตรู?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(p.deck.shift());
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`);
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 057 Fushiguro Megumi — [On Play] choose 1 opponent's Field card, return to bottom of their deck.
  reg['JJK-1-057'] = { async onPlay(G, p, unit) { await sendEnemyFieldToBottom(p, unit); } };

  // 060 Toudou Aoi — [When Attacking] choose 1 own Front Line + 1 own Energy Line character, may swap positions.
  reg['JJK-1-060'] = {
    async onAttack(G, p, unit) {
      const fronts = p.front.filter(u => u !== unit && u.card.type === 'Character');
      const energies = p.energy.filter(u => u.card.type === 'Character');
      if (!fronts.length || !energies.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: สลับตำแหน่ง Front Line กับ Energy Line 1 คู่?`,
        [{ label: 'สลับ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uidF = await p.controller.chooseOwnCharacter(p, fronts, 'เลือก character บน Front Line');
      const uidE = await p.controller.chooseOwnCharacter(p, energies, 'เลือก character บน Energy Line');
      const f = fronts.find(x => x.uid === uidF), e = energies.find(x => x.uid === uidE);
      if (f && e) {
        const iF = p.front.indexOf(f), iE = p.energy.indexOf(e);
        p.front[iF] = e; p.energy[iE] = f;
        log(`${unit.card.name}: สลับตำแหน่ง ${f.card.name} กับ ${e.card.name}`);
      }
    },
  };

  // 062 Divergent Fist (Event) — bounce 1 enemy Front Line character BP≤5000 (retire instead if own Itadori Yuuji).
  reg['JJK-1-062'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Itadori Yuuji')) await H.retireEnemyFront(p, 5000);
      else await H.bounceEnemyFront(p, 5000);
    },
  };

  // 063 Sukuna's Finger (Event) — draw 1, untap 1 AP.
  // (Skipped: the alt-cost gate — discard 1 Life or rest own active Itadori Yuuji — isn't enforced
  // before play; the engine doesn't validate custom alt-costs pre-play yet.)
  reg['JJK-1-063'] = {
    async onEvent(G, p, card) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); await H.apUntap(p, 1); },
  };

  // 064 Ratio Technique Collapse (Event) — choose 1 enemy Front Line character BP≤5000, place
  // top/bottom of their deck (opponent chooses; you choose instead if own Nanami Kento).
  reg['JJK-1-064'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const chooser = H.hasCardNamed(p, 'Nanami Kento') ? p : enemy;
      const v = await chooser.controller.chooseOption(chooser, `${card.name}: วาง ${t.card.name} ไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      for (const line of [enemy.front, enemy.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      if (v === 'top') enemy.deck.unshift(t.no); else enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป${v === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็ค`);
    },
  };

  // 065 Slaughter Demon (Event) — choose 1 own Front Line character, +2000 BP this turn; draw 1.
  reg['JJK-1-065'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line รับ +2000 BP เทิร์นนี้`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 068 Getou Suguru — [On Play] may retire 1 other character to look at top 6, fetch up to 2
  // Trait:Cursed Spirit to hand, remainder to Outside Area.
  reg['JJK-1-068'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: Retire character อื่นเพื่อดูการ์ดบนสุด 6 ใบ? (ไม่บังคับ)`, true);
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      const n = Math.min(6, p.deck.length);
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือก Trait:Cursed Spirit เข้ามือ`, c => (c.traits || '').includes('Cursed Spirit'), 2);
      picked.sort((a, b) => b - a).forEach(i => p.hand.push(revealed.splice(i, 1)[0]));
      p.sideline.push(...revealed);
      log(`${unit.card.name}: เข้ามือ ${picked.length} ใบ ที่เหลือไป Outside Area`);
    },
  };

  // 072 Transfigured Human — [Main][Rest][Retire] choose 1 enemy Front Line character, -1000 BP.
  reg['JJK-1-072'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.debuffEnemyFront(p, -1000);
    },
  };

  // 077 Kamo Noritoshi — [When Attacking] choose 1 enemy Front Line character, -1000 BP.
  reg['JJK-1-077'] = { async onAttack(G, p, unit) { await H.debuffEnemyFront(p, -1000); } };

  // 082 Nishimiya Momo — [On Play] play 1 Trait:Kyoto School (energy≤2, AP1) from hand, rested.
  reg['JJK-1-082'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Kyoto School') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 085 Yoshino Junpei & Moon Dregs — [On Play] if own Mahito, mill top 3. @[On Retire] if own
  // Mahito, play "Yoshino Junpei: Transfigured" from hand/Outside Area, rested.
  reg['JJK-1-085'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Mahito')) return;
      const n = Math.min(3, p.deck.length);
      p.sideline.push(...p.deck.splice(0, n));
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      if (!H.hasCardNamed(p, 'Mahito')) return;
      await playTraitFromHandOrSideline(p, unit, c => c && (c.name || '').includes('Yoshino Junpei: Transfigured'),
        { active: false, title: `${unit.card.name}: ลง Yoshino Junpei: Transfigured (rested)?` });
    },
  };

  // 092 Mahito — [Main][Front][1/turn] retire 1 other character; if did, may mill top 3 then play
  // 1 Trait:Transfigured Humans from hand/Outside Area, Active.
  reg['JJK-1-092'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่น'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character เพื่อ retire');
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      const n = Math.min(3, p.deck.length);
      if (n) { p.sideline.push(...p.deck.splice(0, n)); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      await playTraitFromHandOrSideline(p, unit, c => c && c.type === 'Character' && (c.traits || '').includes('Transfigured Humans'),
        { active: true, title: `${unit.card.name}: ลง Trait:Transfigured Humans (Active)` });
    },
  };

  // 094 Self-Embodiment of Perfection (Field) — [1/turn] when own Mahito attacks, may retire 1
  // other character to play 1 Trait:Transfigured Humans from hand/Outside Area, Active.
  reg['JJK-1-094'] = {
    async onAnyAttack(G, p, atk, self) {
      if (self._usedTurn === Engine.G.turn) return;
      if (!(atk.card.name || '').includes('Mahito')) return;
      const others = [...p.front, ...p.energy].filter(u => u !== atk && u.card.type === 'Character' && !(u.card.name || '').includes('Mahito'));
      if (!others.length) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: Retire character อื่นเพื่อลง Trait:Transfigured Humans (Active)? (ไม่บังคับ)`,
        [{ label: 'เลือก', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character เพื่อ retire', true);
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      self._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      await playTraitFromHandOrSideline(p, self, c => c && c.type === 'Character' && (c.traits || '').includes('Transfigured Humans'),
        { active: true, title: `${self.card.name}: ลง Trait:Transfigured Humans (Active)` });
    },
  };

  // 096 Interleague Battle (Event) — fetch 1 Trait:Kyoto School to hand, then play 1 Trait:Kyoto
  // School from hand rested (paying its AP cost). (Raid-play option not automated.)
  reg['JJK-1-096'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.traits || '').includes('Kyoto School'), `${card.name}: เลือก Trait:Kyoto School จาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Kyoto School') && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false, payApCost: true });
    },
  };

  // 097 A Memory That Never Happened (Event) — choose 1 Todo Aoi + 1 other own character, +1000
  // BP each; if 2 chosen, Todo Aoi gains [Impact +1] this turn.
  reg['JJK-1-097'] = {
    async onEvent(G, p, card) {
      const todos = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Todo Aoi'));
      if (!todos.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, todos, `${card.name}: เลือก Todo Aoi`, true);
      const todo = todos.find(x => x.uid === uid);
      if (!todo) return;
      todo.bpMod += 1000;
      const others = [...p.front, ...p.energy].filter(u => u !== todo && u.card.type === 'Character');
      let chose2 = false;
      if (others.length) {
        const uid2 = await p.controller.chooseOwnCharacter(p, others, `${card.name}: เลือก character อื่น (ไม่บังคับ)`, true);
        const t = others.find(x => x.uid === uid2);
        if (t) { t.bpMod += 1000; chose2 = true; }
      }
      log(`${card.name}: ${todo.card.name} +1000 BP เทิร์นนี้`);
      if (chose2) { todo.tempImpact += 1; log(`${card.name}: ${todo.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 098 Boogie Woogie (Event) — choose 1 enemy Front Line character BP≤5000, send to bottom of
  // their deck; if own Todo Aoi, draw 1.
  // (Skipped: forcing the opponent to then play a replacement character to Front Line — no
  // generic hook models a mandatory opponent-side play.)
  reg['JJK-1-098'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { enemy.front.splice(enemy.front.indexOf(t), 1); enemy.deck.push(t.no); log(`${card.name}: ${t.card.name} ถูกส่งไปใต้เด็ค`); }
      }
      if (H.hasCardNamed(p, 'Todo Aoi')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 101 Itadori Yuuji — [Opponent's Turn] +1000 BP if own Sukuna's Finger in Outside Area.
  reg['JJK-1-101'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] === p) return 0;
      return p.sideline.some(no => (byNo(no)?.name || '').includes("Sukuna's Finger")) ? 1000 : 0;
    },
  };

  // 107 Fushiguro Megumi — [On Play] choose 1 enemy character (any zone) BP≤3000, return to hand.
  reg['JJK-1-107'] = {
    async onPlay(G, p, unit) { await bounceEnemyAny(p, unit, 3000); },
  };

  // 108 Tokyo Jujutsu High School (Field) — enters Active. [Main][Rest][1/turn] if you used an
  // Event Card this turn, all own characters +1000 BP this turn.
  reg['JJK-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card ในเทิร์นนี้ก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if (u.card.type === 'Character') { u.bpMod += 1000; n++; }
      log(`${unit.card.name}: character ${n} ใบ +1000 BP เทิร์นนี้`);
    },
  };

  // 109 Tokyo Jujutsu High 1st Year (Event) — draw 3, discard 2.
  reg['JJK-1-109'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
      await H.discardFromHand(p); await H.discardFromHand(p);
    },
  };

  // ── JJK-2 ──────────────────────────────────────────────────────────────

  // 002 Kugisaki Nobara — [On Play] if enemy has a rested character (any zone), fetch 1 yellow
  // Event Card (energy≤2) from Outside Area to hand.
  reg['JJK-2-002'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (![...enemy.front, ...enemy.energy].some(u => u.rested && u.card.type === 'Character')) return;
      await H.fetchFromSideline(p, c => c && c.type === 'Event' && c.color === 'Yellow' && (c.need || 0) <= 2, `${unit.card.name}: เลือก Event สีเหลือง (Energy≤2) จาก Outside Area`);
    },
  };

  // 003 Getou Suguru — [Your Turn][Front] +500 BP (self + aura on same-line Gojo Satoru) if own
  // Gojo Satoru on same line. @[Main][Discard1][1/turn] gains front-line energy generation this turn.
  reg['JJK-2-003'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p || !p.front.includes(unit)) return 0;
      return p.front.some(u => (u.card.name || '').includes('Gojo Satoru')) ? 500 : 0;
    },
    auraBp(owner, src, tgt) {
      if (Engine.G.players[Engine.G.active] !== owner || !owner.front.includes(src)) return 0;
      if (!(tgt.card.name || '').includes('Gojo Satoru') || !owner.front.includes(tgt)) return 0;
      return 500;
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.tempFrontGen = true;
      log(`${unit.card.name}: ได้ front-line energy generation เทิร์นนี้`);
    },
  };

  // 005 Fushiguro Megumi — [On Play] look at top 3, reveal 1 Chimera Shadow Garden or
  // Trait:Shikigami card and place it top of deck or Outside Area (your choice), remainder to bottom.
  reg['JJK-2-005'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => (c.name || '').includes('Chimera Shadow Garden') || (c.traits || '').includes('Shikigami');
      const idx = revealed.findIndex(no => pred(byNo(no)));
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง ${byNo(no)?.name} ไว้บนเด็คหรือ Outside Area?`,
          [{ label: 'บนสุดของเด็ค', value: 'top' }, { label: 'Outside Area', value: 'outside' }]);
        if (v === 'top') p.deck.unshift(no); else p.sideline.push(no);
      }
      p.deck.push(...revealed);
    },
  };

  // 006 Itadori Yuuji — passive genMod +1 if own Sukuna's Finger in Outside Area.
  reg['JJK-2-006'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      return owner && owner.sideline.some(no => (byNo(no)?.name || '').includes("Sukuna's Finger")) ? 1 : 0;
    },
  };

  // 008 Nanami Kento — [On Retire] may place top of deck to Outside Area to buff 1 own character +1000 BP.
  reg['JJK-2-008'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คไป Outside Area เพื่อ buff character?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(p.deck.shift());
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 010 Todo Aoi — [Main][1/turn] swap this character with 1 other-line character.
  reg['JJK-2-010'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const otherLine = p.front.includes(unit) ? p.energy : p.front;
      const targets = otherLine.filter(u => u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character อีก line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อีก line เพื่อสลับตำแหน่ง');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      const myLine = p.front.includes(unit) ? p.front : p.energy;
      const iMe = myLine.indexOf(unit), iT = otherLine.indexOf(t);
      myLine[iMe] = t; otherLine[iT] = unit;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
  };

  // 011 Mahito — [Your Turn] genMod +1 if a character was retired this turn. @[Main][1/turn]
  // retire 1 other character, buff 1 Trait:Cursed Spirit/Transfigured Human +1000 BP.
  reg['JJK-2-011'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner || Engine.G.players[Engine.G.active] !== owner) return 0;
      return Engine.G.retiredThisTurn ? 1 : 0;
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && !(u.card.name || '').includes('Mahito'));
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่น'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character เพื่อ retire');
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Cursed Spirit') || (u.card.traits || '').includes('Transfigured Human'));
      if (!targets.length) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ +1000 BP เทิร์นนี้', true);
      const t2 = targets.find(x => x.uid === uid2);
      if (t2) { t2.bpMod += 1000; log(`${unit.card.name}: ${t2.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // ── JJK-3 ──────────────────────────────────────────────────────────────

  // 001 Amanai Riko — [Main][EnergyLine][Rest][Discard1][1/turn] choose 1 rested Gojo
  // Satoru/Getou Suguru (energy≤5), set Active.
  // (Skipped: the passive auto-move-to-Front-Line-at-end-of-attack-phase clause — no hook fires at
  // the end of either player's Attack Phase specifically.)
  reg['JJK-3-001'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Energy Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => ((u.card.name || '').includes('Gojo Satoru') || (u.card.name || '').includes('Getou Suguru')) && (u.card.need || 0) <= 5 && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 003 Iori Utahime — [When Attacking] scry the top card.
  reg['JJK-3-003'] = { async onAttack(G, p, unit) { await H.scryTop(p, ['top', 'bottom']); } };

  // 005 Suguru Geto — passive +1000 BP if own Gojo Satoru on same line or Amanai Riko on
  // area/Outside Area. @[On Play] pay 1 AP to free-play 1 yellow Trait:Cursed Spirit (energy≤3,
  // AP1) from Outside Area, rested.
  reg['JJK-3-005'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p || !p.front.includes(unit)) return 0;
      const sameLine = p.front.some(u => (u.card.name || '').includes('Satoru Gojo'));
      const rikoAnywhere = [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Amanai Riko')) || p.sideline.some(no => (byNo(no)?.name || '').includes('Amanai Riko'));
      return (sameLine || rikoAnywhere) ? 1000 : 0;
    },
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 3 && (c.ap || 0) === 1 && (c.traits || '').includes('Cursed Spirit');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อลง Trait:Cursed Spirit (สีเหลือง) จาก Outside Area?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 007 Fushiguro Megumi — [On Play] retire 1 enemy Front Line character with BP ≤ 1000 × (own
  // Trait:Shikigami + Chimera Shadow Garden count).
  // (Skipped: the separate "when own Chimera Shadow Garden's [Main] is used, all Fushiguro Megumi
  // +1000 BP" reactive — would need Chimera Shadow Garden's own onMain to broadcast a cross-card
  // notification, no such channel exists yet.)
  reg['JJK-3-007'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Shikigami') || (u.card.name || '').includes('Chimera Shadow Garden')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 008 Rabbit Escape — when returned from area to hand, choose 1 Trait:Shikigami, set Active.
  reg['JJK-3-008'] = {
    async onLeaveField(G, p, unit) {
      if (!p.hand.includes(unit.no)) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Shikigami'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Shikigami ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 011 Okinawa Trip (Event) — look at top 5, fetch up to 2 among named Jujutsu High staff.
  reg['JJK-3-011'] = {
    async onEvent(G, p, card) {
      const names = ['Gojo Satoru', 'Getou Suguru', 'Amanai Riko', 'Kuroi Misato'];
      await H.lookTopAndTake(p, 5, c => names.some(n => (c.name || '').includes(n)), 2, `${card.name}: ดูการ์ดบนสุด 5 ใบ`);
    },
  };

  // 012 Cursed Technique Lapse: Blue (Event) — choose 1 enemy Energy Line character (gen≤1), move
  // to Front Line; if not removed by the move, draw 1.
  reg['JJK-3-012'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Character' && (u.card.gen || 0) <= 1 && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (gen≤1)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      let removed = false, removeUid = null;
      if (enemy.front.length >= 4) { removed = true; removeUid = await enemy.controller.chooseOwnCharacter(enemy, enemy.front, 'เลือกการ์ดบน Front Line ส่งไป Remove Area (ไม่มีที่ว่าง)'); }
      const ok = await Engine.moveUnitFree(enemy, t, 'front', removeUid);
      if (ok && !removed) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 016 Zennin Naobito — look at top 2, reorder as you like, then place both back on top.
  reg['JJK-3-016'] = {
    async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 2 ใบแล้วจัดเรียงใหม่ (ลำดับเดิม)`); },
  };

  // 017 Zennin Maki — [On Play] fetch 1 Event Card (not Special/Final trigger) from Outside Area to hand.
  reg['JJK-3-017'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => c && c.type === 'Event' && c.trigger !== 'Special' && c.trigger !== 'Final', `${unit.card.name}: เลือก Event Card (ไม่มี Special/Final) จาก Outside Area`);
    },
  };

  // 021 Haibara Yu — [On Play] draw 1 if own Nanami Kento.
  reg['JJK-3-021'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Nanami Kento')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 022 Haibara Yu — [Main][Rest][Retire] if own Nanami Kento in Outside Area, fetch it to hand.
  reg['JJK-3-022'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.name || '').includes('Nanami Kento');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Nanami Kento ใน Outside Area'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Nanami Kento จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const no = p.sideline[idx]; p.sideline.splice(idx, 1); p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 025 Getou Suguru — [On Play] play 1 purple Trait:Cursed Spirit (energy≤2, AP1) from hand, rested.
  reg['JJK-3-025'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes('Cursed Spirit') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 032 Dagon — [On Retire] place 2 cards from top of deck to Outside Area.
  reg['JJK-3-032'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const n = Math.min(2, p.deck.length);
      p.sideline.push(...p.deck.splice(0, n));
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
  };

  // 037 Suguru Geto — [On Play] look at top 2, place any number of Trait:Cursed Spirit/Cursed Womb
  // Death Paintings among them to Outside Area, remainder back on top.
  reg['JJK-3-037'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Cursed Spirit') || (c.traits || '').includes('Cursed Womb Death Paintings'));
    },
  };

  // 038 Suguru Geto — [On Play] reveal top 3, add up to 1 Trait:Cursed Spirit/Cursed Womb Death
  // Paintings to hand (remainder to Outside Area, not bottom), discard 1 if added.
  reg['JJK-3-038'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => (c.traits || '').includes('Cursed Spirit') || (c.traits || '').includes('Cursed Womb Death Paintings');
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`, pred, 1);
      const idx = picked[0];
      let added = false;
      if (idx != null) { p.hand.push(revealed.splice(idx, 1)[0]); added = true; log(`${unit.card.name}: เพิ่มการ์ดเข้ามือ`); }
      p.sideline.push(...revealed);
      if (added) await H.discardFromHand(p);
    },
  };

  // 048 Kugisaki Nobara — [On Play] choose 1 other Trait:Sorcerer, +500 BP this turn (+1500 if 2+
  // enemy Front Line characters BP≥4000).
  // 056 Fushiguro Megumi — same effect as a [Main][Front][1/turn] ability instead.
  function sorcererBuff(baseDelta, upgradedDelta) {
    return async (p, excludeUnit) => {
      const enemy = Engine.opponentOf(p);
      const bigEnemies = enemy.front.filter(u => u.card.type === 'Character' && Engine.bp(u) >= 4000).length;
      const delta = bigEnemies >= 2 ? upgradedDelta : baseDelta;
      const targets = [...p.front, ...p.energy].filter(u => u !== excludeUnit && (u.card.traits || '').includes('Sorcerer'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `เลือก character Trait:Sorcerer รับ +${delta} BP เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += delta; log(`${t.card.name} +${delta} BP เทิร์นนี้`); }
    };
  }
  reg['JJK-3-048'] = { async onPlay(G, p, unit) { await sorcererBuff(500, 1500)(p, unit); } };
  reg['JJK-3-056'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await sorcererBuff(500, 1500)(p, unit);
    },
  };

  // 053 Nanami Kento — [On Retire] look at top 4, fetch Itadori Yuuji to hand, discard 1 if added.
  reg['JJK-3-053'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const taken = await H.lookTopAndTake(p, 4, c => (c.name || '').includes('Itadori Yuuji'), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 058 Esou — [When Attacking] if own Choso + Kechizu on same line, draw 1 + discard 1, self +500 BP.
  reg['JJK-3-058'] = {
    async onAttack(G, p, unit) {
      const line = p.front.includes(unit) ? p.front : p.energy;
      if (!line.some(u => (u.card.name || '').includes('Choso')) || !line.some(u => (u.card.name || '').includes('Kechizu'))) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 059 Kechizu — [When Attacking] if own Choso + Esou on same line, draw 1 + discard 1, self +500 BP.
  reg['JJK-3-059'] = {
    async onAttack(G, p, unit) {
      const line = p.front.includes(unit) ? p.front : p.energy;
      if (!line.some(u => (u.card.name || '').includes('Choso')) || !line.some(u => (u.card.name || '').includes('Esou'))) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 061 Choso — [On Play] mill top 2, then may fetch 1 Esou/Kechizu from Outside Area to hand,
  // discard 1 if did.
  reg['JJK-3-061'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (n) { p.sideline.push(...p.deck.splice(0, n)); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      const pred = c => c && ((c.name || '').includes('Esou') || (c.name || '').includes('Kechizu'));
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const fetched = await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Esou หรือ Kechizu จาก Outside Area`);
      if (fetched) await H.discardFromHand(p);
    },
  };

  // 065 Dagon — [Main][Front][1/turn] if 5+ generated energy, may discard 1 to set self Active.
  reg['JJK-3-065'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const total = Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0);
      if (total < 5 || !p.hand.length) { p.controller.notify?.('ต้องมี generated energy ≥5'); return; }
      unit._usedTurn = Engine.G.turn;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 066 Hanami — [Main][Front][1/turn] if 5+ generated energy, choose: +1000 BP this turn, or
  // +1000 BP through the opponent's next turn.
  reg['JJK-3-066'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const total = Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0);
      if (total < 5) { p.controller.notify?.('ต้องมี generated energy ≥5'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1000 BP เทิร์นนี้', value: 'now' },
        { label: '+1000 BP ในเทิร์นถัดไปของศัตรู', value: 'next' },
      ]);
      if (v === 'now') { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else { unit.bpPersist += 1000; log(`${unit.card.name}: +1000 BP จนถึงต้นเทิร์นถัดไปของคุณ (ครอบคลุมเทิร์นศัตรู)`); }
    },
  };

  // 068 Subway Station (Field) — [Main][Rest][1/turn] mill top of deck to Outside Area, OR retire
  // this card to place 1 Getou Suguru/Trait:Cursed Spirit/Cursed Womb Death Paintings from Outside
  // Area on top of deck.
  reg['JJK-3-068'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && ((c.name || '').includes('Getou Suguru') || (c.traits || '').includes('Cursed Spirit') || (c.traits || '').includes('Cursed Womb Death Paintings'));
      const opts = [{ label: 'วางการ์ดบนสุดของเด็คไป Outside Area', value: 'mill' }];
      if (p.sideline.some(no => pred(byNo(no)))) opts.push({ label: 'Retire การ์ดนี้: วางการ์ดจาก Outside Area บนสุดของเด็ค', value: 'retire' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      unit.rested = true;
      if (v === 'mill') {
        if (p.deck.length) { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
      } else {
        await Engine.sidelineUnit(p, unit, 'effect');
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด', pred);
        if (idx != null) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`วาง ${byNo(no)?.name} ไว้บนสุดของเด็ค`); }
      }
    },
  };

  // 071 A Memory That Never Happened (Event) — choose up to 1 each of Choso/Esou/Kechizu/Itadori
  // Yuuji on Front Line, +1000 BP each; if 2+ chosen incl. Choso, Choso gains [Impact +1]; if 3+
  // incl. Choso, draw 1.
  reg['JJK-3-071'] = {
    async onEvent(G, p, card) {
      const names = ['Choso', 'Esou', 'Kechizu', 'Itadori Yuuji'];
      let chosenCount = 0, chosoChosen = null;
      for (const name of names) {
        const targets = p.front.filter(u => (u.card.name || '').includes(name));
        if (!targets.length) continue;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก ${name} (ไม่บังคับ)`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) continue;
        t.bpMod += 1000;
        chosenCount++;
        if (name === 'Choso') chosoChosen = t;
      }
      log(`${card.name}: เลือกไป ${chosenCount} ใบ +1000 BP เทิร์นนี้`);
      if (chosoChosen && chosenCount >= 2) { chosoChosen.tempImpact += 1; log(`${card.name}: ${chosoChosen.card.name} ได้ [Impact +1] เทิร์นนี้`); }
      if (chosoChosen && chosenCount >= 3) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // ── Skipped (need engine primitives not yet built) ──────────────────────
  // JJK-1-028: permanent "this character doesn't stand" lock + end-of-Battle-Phase self-retire
  //   condition check (partial: the rest-on-play part is scripted above).
  // JJK-1-098: forcing the opponent to play a replacement character (partial: everything else scripted).
  // JJK-3-001: end-of-either-player's-Attack-Phase auto-move trigger (partial: Main ability scripted).
  // JJK-3-007: cross-card reactive broadcast from Chimera Shadow Garden's own [Main] use (partial:
  //   on-play retire scripted above).
  // JJK-3-023: passive requiring "placed a card to Outside Area this turn" tracking — no
  //   centralized per-turn counter for that exists (many call sites push to sideline directly).
  // JJK-3-031: passive requiring "a character retired via BP reduced to 0 this turn" — no
  //   dedicated counter distinguishing bp0 retirement from other retirement reasons.
  // JJK-3-039: "copy the [Main] effects of up to 2 removed cards this turn" — would need dynamically
  //   invoking arbitrary other cards' onMain logic; too open-ended to implement safely.
  // JJK-3-050: "cannot be removed by opponent's character effect with BP4000+" — a narrow
  //   conditional-immunity variant not covered by the generic untargetable keyword.
})();
