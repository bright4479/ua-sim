// ══════════ UA SIM — Haikyu!! (HIQ) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // this series' central "multi-school" gimmick: count DISTINCT <X High School> trait values
  // among OTHER cards on your area (not just a count of any one trait).
  function countDistinctHighSchoolTraits(owner, self) {
    const traits = new Set();
    for (const u of [...owner.front, ...owner.energy]) {
      if (u === self) continue;
      for (const t of (u.card.traits || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
        if (/high school/i.test(t)) traits.add(t.toLowerCase());
      }
    }
    return traits.size;
  }
  function countOtherTrait(owner, self, trait) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
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

  // 005 Kei Tsukishima — [Main][1/turn] if 3+ other cards with different High-School traits on
  // your area, choose 1 other own character +1000 BP this turn.
  reg['HIQ-1-005'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (countDistinctHighSchoolTraits(p, unit) < 3) { p.controller.notify?.('เงื่อนไข High School ไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 006 Shoyo Hinata — [When Attacking][On Block] choose up to 1 own character +500 BP this turn.
  reg['HIQ-1-006'] = {
    async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500); },
    async onBlock(G, p, unit) { await H.buffOwnCharacter(p, 500); },
  };

  // 007 Tadashi Yamaguchi — [Main][Rest+Retire this card] choose up to 2 enemy Front Line
  // characters with BP≥1000, -500 BP until the start of your next turn.
  reg['HIQ-1-007'] = {
    async onMain(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      let targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1000);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      for (let i = 0; i < 2 && targets.length; i++) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (${i + 1}/2)`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) break;
        t.bpPersist -= 500;
        log(`${unit.card.name}: ${t.card.name} -500 BP จนถึงต้นเทิร์นหน้า`);
        targets = targets.filter(x => x !== t);
      }
      await Engine.checkBpZero();
    },
  };

  // 008 Daiki Ogano — passive: on your turn, if 3+ other cards with different High-School traits
  // on your area, +1000 BP.
  reg['HIQ-1-008'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && countDistinctHighSchoolTraits(p, unit) >= 3) ? 1000 : 0; },
  };

  // 009 Taketora Yamamoto — [On Block] self +500 BP this turn.
  reg['HIQ-1-009'] = { async onBlock(G, p, unit) { unit.bpMod += 500; log(`${unit.card.name}: +500 BP เทิร์นนี้`); } };

  // 010 Taketora Yamamoto — [When Attacking] choose up to 1 other own character +500 BP this turn.
  reg['HIQ-1-010'] = { async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500, { excludeUnit: unit }); } };

  // 013 Kenma Kozume — [On Play] look at top 3, add 1 to hand, rest face-down under this character.
  // @[Main][Rest this card] look at the face-down cards under this character, add up to 1 to hand.
  reg['HIQ-1-013'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`, null, 1);
      if (picked.length) { const no = revealed.splice(picked[0], 1)[0]; p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); }
      unit.counters.push(...revealed);
      log(`${unit.card.name}: วางการ์ดที่เหลือคว่ำไว้ใต้ตัวเอง`);
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!unit.counters.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำใต้ตัวนี้'); return; }
      unit.rested = true;
      const opts = unit.counters.map((no, i) => ({ label: byNo(no)?.name || no, value: i }));
      const i = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ดคว่ำเข้ามือ`, opts);
      if (i == null) return;
      const no = unit.counters.splice(i, 1)[0];
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 017 Tetsuro Kuroo — [On Block] draw 1, place 1 from hand to Outside Area. @[On Retire]
  // free-play 1 yellow character (not Tetsuro Kuroo, need≤3, ap1) from hand rested.
  reg['HIQ-1-017'] = {
    async onBlock(G, p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); },
    async onSideline(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && !(c.name || '').includes('Tetsuro Kuroo') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 018 Tetsuro Kuroo — [When Attacking][On Block][1/turn] choose up to 1 other character with a
  // printed [When Attacking] or [On Block] ability on your area, it gains +1000 BP and [Impact +1]
  // this turn.
  function countOtherAttackOrBlock(owner, self) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && /\[When Attacking\]|\[On Block\]/.test(u.card.effect || ''));
  }
  reg['HIQ-1-018'] = {
    async onAttack(G, p, unit) { await kurooShared(p, unit); },
    async onBlock(G, p, unit) { await kurooShared(p, unit); },
  };
  async function kurooShared(p, unit) {
    if (unit._usedTurn === Engine.G.turn) return;
    const targets = countOtherAttackOrBlock(p, unit);
    if (!targets.length) return;
    unit._usedTurn = Engine.G.turn;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character อื่นที่มี [When Attacking]/[On Block]`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += 1000; t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} +1000 BP และ [Impact +1] เทิร์นนี้`); }
  }

  // 019 Lev Haiba — passive: if 3+ other cards with different High-School traits on your area,
  // +1 generated energy.
  reg['HIQ-1-019'] = { genMod(unit, p) { return countDistinctHighSchoolTraits(p, unit) >= 3 ? 1 : 0; } };

  // 027 Keiji Akaashi — passive: on your turn, if 3+ other cards with different High-School traits
  // on your area, +1000 BP. (Skipped: the "[When in Energy Line] at the end of your Attack Phase,
  // may swap positions with a Front Line character" clause — needs an end-of-Attack-Phase hook
  // that doesn't exist yet, same recurring gap noted across several series this session.)
  reg['HIQ-1-027'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && countDistinctHighSchoolTraits(p, unit) >= 3) ? 1000 : 0; },
  };

  // 028 "Decisive battle at the garbage dump" (Field) — "Play this Field in active." (generic)
  // @[Main][Rest this card] choose 1 own character with a printed [When Attacking] ability and 1
  // other with [On Block], both +500 BP this turn; may pay 1 AP to retire this Field, upgrading the
  // duration to "until the start of your next turn" instead.
  reg['HIQ-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const atkTargets = [...p.front, ...p.energy].filter(u => /\[When Attacking\]/.test(u.card.effect || ''));
      if (!atkTargets.length) { p.controller.notify?.('ไม่มี character ที่มี [When Attacking]'); return; }
      unit.rested = true;
      const uid1 = await p.controller.chooseOwnCharacter(p, atkTargets, `${unit.card.name}: เลือก character ที่มี [When Attacking]`, true);
      const t1 = atkTargets.find(x => x.uid === uid1);
      const blkTargets = [...p.front, ...p.energy].filter(u => u !== t1 && /\[On Block\]/.test(u.card.effect || ''));
      let t2 = null;
      if (blkTargets.length) {
        const uid2 = await p.controller.chooseOwnCharacter(p, blkTargets, `${unit.card.name}: เลือก character อีกใบที่มี [On Block]`, true);
        t2 = blkTargets.find(x => x.uid === uid2);
      }
      const v = Engine.activeAP(p) >= 1 && await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ retire Field นี้ (อัพเกรดระยะเวลา)?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      const persist = v && Engine.payAP(p, 1);
      if (persist) await Engine.sidelineUnit(p, unit, 'effect');
      for (const t of [t1, t2].filter(Boolean)) {
        if (persist) t.bpPersist += 500; else t.bpMod += 500;
        log(`${unit.card.name}: ${t.card.name} +500 BP ${persist ? 'จนถึงต้นเทิร์นหน้า' : 'เทิร์นนี้'}`);
      }
    },
  };

  // 031 "Training Camp with strong Schools" — choose up to 1 enemy Front Line character BP≤5000
  // and rest it (retire instead if 3+ cards with different High-School traits on your area).
  reg['HIQ-1-031'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (countDistinctHighSchoolTraits(p, null) >= 3) await Engine.sidelineUnit(enemy, t, 'effect');
      else { t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 033 "One Round of Flying!!" — specify a High-School trait present on your area, rest all own
  // characters with that trait and draw 2; if 2+ were rested, all own Front Line +1000 BP this turn.
  reg['HIQ-1-033'] = {
    async onEvent(G, p, card) {
      const traitSet = new Set();
      for (const u of [...p.front, ...p.energy]) for (const t of (u.card.traits || '').split(/[,;]/).map(s => s.trim())) if (/high school/i.test(t)) traitSet.add(t);
      if (!traitSet.size) return;
      const trait = [...traitSet][0];
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes(trait) && !u.rested);
      for (const u of targets) u.rested = true;
      log(`${card.name}: ระบุ <${trait}> — วางนอน ${targets.length} ใบ`);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (targets.length >= 2) {
        for (const u of p.front) u.bpMod += 1000;
        log(`${card.name}: character บน Front Line ทั้งหมด +1000 BP เทิร์นนี้`);
      }
    },
  };

  // 041 Toru Oikawa — [On Play] choose up to 1 Trait:Wing Spiker or Trait:Middle Blocker on your
  // area, +1000 BP this turn. @[Main][Rest+Retire this card] free-play 1 Trait:Aoba Johsai High
  // School character (not Toru Oikawa, need≤2) from your Outside Area to your area rested.
  function wingOrMiddle(u) { return /Wing Spiker|Middle Blocker/i.test(u.card.traits || ''); }
  reg['HIQ-1-041'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(wingOrMiddle);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Wing Spiker/Middle Blocker`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
    async onMain(G, p, unit) {
      const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Aoba Johsai High School') && !(c.name || '').includes('Toru Oikawa') && (c.need || 0) <= 2;
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const i = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:Aoba Johsai High School จาก Outside Area`, pred);
      if (i != null) { const no = p.sideline.splice(i, 1)[0]; await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
    },
  };

  // 042 Toru Oikawa — [Skipped]: "[Main][Frontline][Discard1][1/turn] choose 1 other Trait:Aoba
  // Johsai High School character; if you fulfil the energy requirement in your hand, raid up to 1
  // character card that can be raided onto the chosen character" — a manual-trigger-Raid mechanic
  // (Engine.raidCard only supports normal hand-play raids via the player's own declared action, not
  // a scripted "search hand for any raidable match" flow); same recurring gap noted for several
  // manual-Raid cards earlier this session (TSK/KMY).

  // 044 Yutaro Kindaichi — [On Play] choose up to 1 enemy Front Line character BP≥1500, -1000 BP this turn.
  reg['HIQ-1-044'] = { async onPlay(G, p, unit) { await debuffEnemyFrontMin(p, 1500, -1000); } };

  // 049 Wakatoshi Ushijima — this character can only attack if there are 5+ other Trait:Shiratorizawa
  // Academy High School characters on your area.
  reg['HIQ-1-049'] = {
    canAttack(p, unit) { return countOtherTrait(p, unit, 'Shiratorizawa Academy High School') >= 5; },
  };

  // 054 Tsutomu Goshiki — [Skipped]: "[Opponent's Turn][1/turn] when another character with an
  // original BP of 4000+ on your area leaves the field, this character gets +3000 BP" needs an
  // "any unit leaves the field" watcher hook that doesn't exist (only onAnyAttack/onAnyWinBattle/
  // onAnyLoseBattle are per-unit-broadcast hooks today).

  // 055 Kenjiro Shirabu — [Main][Discard1][1/turn] only the turn this character was played: choose
  // 1 other Trait:Shiratorizawa Academy High School card on your area, set it to active.
  reg['HIQ-1-055'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested && (u.card.traits || '').includes('Shiratorizawa Academy High School'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Shiratorizawa Academy High School`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 057 Taichi Kawanishi — [Main][Frontline][Rest][1/turn] choose 1 other Trait:Shiratorizawa
  // Academy High School card on your area, set it to active.
  reg['HIQ-1-057'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested && (u.card.traits || '').includes('Shiratorizawa Academy High School'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Shiratorizawa Academy High School`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 061 Kenji Futakuchi — [On Retire] choose up to 1 own character +1000 BP this turn.
  reg['HIQ-1-061'] = { async onSideline(G, p, unit) { await H.buffOwnCharacter(p, 1000); } };

  // 066 "Super Ace" — choose 1 own character, +1000 BP and [Sniper] this turn; choose up to 1 own
  // Wakatoshi Ushijima and set it to active.
  reg['HIQ-1-066'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +1000 BP และ [Sniper] เทิร์นนี้`); }
      }
      const ushi = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Wakatoshi Ushijima'));
      if (ushi.length) {
        const uid = await p.controller.chooseOwnCharacter(p, ushi, `${card.name}: เลือก Wakatoshi Ushijima ให้ Active`, true);
        const t = ushi.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
      }
    },
  };

  // 067 (unnamed) — during this turn, grant "when your character raids, draw 1 card"; if 6+
  // Trait:Aoba Johsai High School cards on your area, choose up to 1 of your AP cards and set it
  // to active.
  reg['HIQ-1-067'] = {
    async onEvent(G, p, card) {
      p._grantedRaidDraw = true;
      log(`${card.name}: เทิร์นนี้ raid แล้วจั่ว 1 ใบ`);
      if (countOtherTrait(p, null, 'Aoba Johsai High School') >= 6) await H.apUntap(p, 1);
    },
  };

  // 068 Asahi Azumane — passive: if this character moved during this turn, +1000 BP.
  reg['HIQ-1-068'] = { bpBonus(p, unit) { return unit._movedThisTurn ? 1000 : 0; } };

  // 072 Daichi Sawamura — [On Play] choose 1 own character and move it to the other line; if it's
  // now on the Energy Line and Active, draw 1.
  reg['HIQ-1-072'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ให้ย้าย line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const toLine = p.front.includes(t) ? 'energy' : 'front';
      const ok = await Engine.moveUnitFree(p, t, toLine);
      if (ok && toLine === 'energy' && !t.rested) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 076 Tobio Kageyama — [Main][Rest this card] choose 1 own Trait:Wing Spiker or Middle Blocker
  // character, +1000 BP this turn.
  reg['HIQ-1-076'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(wingOrMiddle);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Wing Spiker/Middle Blocker`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 080 Koshi Sugawara — [On Play] set all characters on your Energy Line to active.
  reg['HIQ-1-080'] = {
    async onPlay(G, p, unit) {
      let n = 0;
      for (const u of p.energy) if (u.rested) { u.rested = false; n++; }
      if (n) log(`${unit.card.name}: ${n} ใบบน Energy Line เป็น Active`);
    },
  };

  // 082 Kei Tsukishima — [On Retire] may place 1 card from hand to Outside Area; if did, choose up
  // to 1 own character +2000 BP this turn.
  reg['HIQ-1-082'] = {
    async onSideline(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) await H.buffOwnCharacter(p, 2000);
    },
  };

  // 083 Kei Tsukishima — [On Block][1/turn] if you have ≤1 card in hand, self +2000 BP this turn.
  reg['HIQ-1-083'] = {
    async onBlock(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (p.hand.length > 1) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 2000;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 096 "Kill Block" — choose 1 own character, it gains [Sniper] this turn; if the chosen character
  // is Kei Tsukishima, it also gets +3000 BP until the start of your next turn.
  reg['HIQ-1-096'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.tempSnipe = true;
      log(`${card.name}: ${t.card.name} ได้ [Sniper] เทิร์นนี้`);
      if ((t.card.name || '').includes('Kei Tsukishima')) { t.bpPersist += 3000; log(`${card.name}: ${t.card.name} +3000 BP จนถึงต้นเทิร์นหน้า`); }
    },
  };

  // 097 "The Strongest Decoy" — your opponent may rest any number of characters on their Front
  // Line, then you draw 1 for each of their still-active Front Line characters. (Simplification:
  // the opponent controller has no heuristic for this defensive rest-vs-keep-blockers trade-off, so
  // this assumes the opponent rests none — an approximation that favors whoever casts the card.)
  reg['HIQ-1-097'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const n = enemy.front.filter(u => u.card.type === 'Character' && !u.rested).length;
      if (n) { Engine.draw(p, n); log(`${card.name}: จั่ว ${n} ใบ (character ศัตรูที่ Active บน Front Line)`); }
    },
  };

  // 098 "Synchronized Attack" — draw 1. Move any number of characters from your Energy Line to the
  // Front Line. Choose up to 1 character that moved, +2000 BP this turn.
  reg['HIQ-1-098'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const moved = [];
      for (const u of [...p.energy]) {
        if (p.front.length >= 4) break;
        if (await Engine.moveUnitFree(p, u, 'front')) moved.push(u);
      }
      if (!moved.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, moved, `${card.name}: เลือก character ที่ย้าย`, true);
      const t = moved.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };

  // 103 Tobio Kageyama — [On Play] choose up to 1 Trait:Wing Spiker or Middle Blocker on your area,
  // +1000 BP this turn.
  reg['HIQ-1-103'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(wingOrMiddle);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Wing Spiker/Middle Blocker`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 104 Tobio Kageyama — [Main][Frontline][Discard1][1/turn] choose 1 other own character +1500 BP
  // this turn; if it's on the Energy Line, move it to the Front Line.
  reg['HIQ-1-104'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อื่น');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1500;
      log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`);
      if (p.energy.includes(t)) await Engine.moveUnitFree(p, t, 'front');
    },
  };

  // 112 Toru Oikawa — [On Play] add up to 2 character cards with [Raid] from your Outside Area to
  // your hand.
  reg['HIQ-1-112'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && Engine.parseKeywords(c).raidTargets.length;
      for (let i = 0; i < 2; i++) {
        if (!(await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือกการ์ด [Raid] จาก Outside Area (${i + 1}/2)`))) break;
      }
    },
  };
})();
