// ══════════ UA SIM — Angel Beats! (AND) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. AND leans on:
// face-down counters under Andy, Raid-state peeling (Victor), and Trait:UNION /
// Trait:UNDER mass-buff synergy.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 004 Backs — choose 1 enemy Front-Line character, it loses all effects this turn.
  reg['AND-1-004'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู ให้เสีย effect ทั้งหมดเทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.effectsNullified = true; log(`${unit.card.name}: ${t.card.name} เสีย effect ทั้งหมดเทิร์นนี้`); }
    },
  };

  // 009 Latla — [Main][1/turn] move another Trait:UNDER Front-Line character to Energy Line.
  reg['AND-1-009'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => u !== unit && (u.card.traits || '').includes('UNDER'));
      if (!targets.length) { p.controller.notify?.('ไม่มี character Trait:UNDER อื่นบน Front Line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ย้ายไป Energy Line');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, t, 'energy');
    },
  };

  // 010 Latla — passive +1000 BP if 3+ other Trait:UNDER on own Front Line including a Rip.
  // (Trigger-targeting immunity clause not automated — different from kw.untargetable's scope.)
  reg['AND-1-010'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const others = p.front.filter(u => u !== unit && (u.card.traits || '').includes('UNDER'));
      return (others.length >= 3 && others.some(u => (u.card.name || '').includes('Rip'))) ? 1000 : 0;
    },
  };

  // 013 Rip — [When Attacking] grant another Trait:UNDER character [Impact +1] this turn.
  reg['AND-1-013'] = {
    async onAttack(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('UNDER'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Trait:UNDER รับ [Impact +1] เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 016 / 017 Andy — [Main][Front][1/turn], gated on a face-down counter under self.
  reg['AND-1-016'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!unit.counters.length) { p.controller.notify?.('ต้องมีการ์ดคว่ำใต้ตัวเอง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.debuffEnemyFront(p, -1000);
    },
  };
  reg['AND-1-017'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!unit.counters.length || unit.rested) { p.controller.notify?.('ต้องมีการ์ดคว่ำใต้ตัวเองและอยู่ในสถานะ Active'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 019 Izumo Fuuko — choose: draw 1 + discard 1, or peel a Raided Victor's top layer + untap 1 AP.
  reg['AND-1-019'] = {
    async onPlay(G, p, unit) {
      const raidedVictors = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Victor') && u.under.length);
      const opts = [{ label: 'จั่ว 1 ใบ แล้วทิ้ง 1 ใบ', value: 'draw' }];
      if (raidedVictors.length) opts.push({ label: 'ลอกชั้นบนของ Victor (Raid State) ออก', value: 'unraid' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'unraid') {
        const uid = await p.controller.chooseOwnCharacter(p, raidedVictors, 'เลือก Victor', true);
        const t = raidedVictors.find(x => x.uid === uid);
        if (t) { const exposed = await H.unraidTopLayer(p, t); if (exposed) await H.apUntap(p, 1); }
      } else {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        await H.discardFromHand(p);
      }
    },
  };

  // 022 Victor — choose 2 of: self-stand / enemy front -1000 / fetch a face-down counter card to
  // hand. When it leaves the area (any reason), may tuck itself under an Andy instead of Outside Area.
  reg['AND-1-022'] = {
    async onPlay(G, p, unit) {
      const opts = [
        { label: 'Active ตัวเอง', value: 'stand' },
        { label: 'ศัตรู Front Line -1000 BP เทิร์นนี้', value: 'debuff' },
        { label: 'ดูการ์ดคว่ำใต้ character ทั้งหมด เลือกเข้ามือได้ 1 ใบ', value: 'look' },
      ];
      const chosen = new Set();
      for (let i = 0; i < 2; i++) {
        const remaining = opts.filter(o => !chosen.has(o.value));
        if (!remaining.length) break;
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect (${i + 1}/2)`, remaining);
        chosen.add(v);
        if (v === 'stand') { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
        else if (v === 'debuff') await H.debuffEnemyFront(p, -1000);
        else if (v === 'look') {
          const allCounters = [...p.front, ...p.energy].flatMap(u => u.counters.map(no => ({ owner: u, no })));
          if (allCounters.length) {
            const pickOpts = allCounters.map((c, idx) => ({ label: byNo(c.no)?.name || c.no, value: idx }));
            const idx = await p.controller.chooseOption(p, 'เลือกการ์ดคว่ำเข้ามือ', pickOpts);
            const picked = allCounters[idx];
            picked.owner.counters.splice(picked.owner.counters.indexOf(picked.no), 1);
            p.hand.push(picked.no);
            log(`${unit.card.name}: เพิ่ม ${byNo(picked.no)?.name} เข้ามือจากใต้ character`);
          }
        }
      }
    },
    async onSideline(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Andy'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางคว่ำใต้ Andy แทนที่จะไป Outside Area ไหม? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const i = p.sideline.lastIndexOf(unit.no);
      if (i >= 0) { p.sideline.splice(i, 1); t.counters.push(unit.no); log(`${unit.card.name}: ถูกวางคว่ำใต้ ${t.card.name}`); }
    },
  };

  // 026 Juiz — look top 2, keep any number on top (in any order), rest to Outside Area.
  reg['AND-1-026'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
  };

  // 033 UMA Kain (Field) — may discard 1 -> fetch a Trait:UNDER (need<=3) from Outside Area.
  reg['AND-1-033'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบไป Outside Area เพื่อดึงการ์ด Trait:UNDER (Energy≤3)?`);
      if (!discarded) return;
      await H.fetchFromSideline(p, c => c && (c.traits || '').includes('UNDER') && (c.need || 0) <= 3, `${unit.card.name}: เลือก Trait:UNDER (Energy≤3)`);
    },
  };

  // 034 Immortal — fetch a Character from Outside Area; draw 1 more if own Andy/Victor present.
  reg['AND-1-034'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก Character จาก Outside Area`);
      if (H.hasCardNamed(p, 'Andy') || H.hasCardNamed(p, 'Victor')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 035 Isn't That Unfair? — draw 1; if own Billy (Trait:UNDER) present, opponent discards 1.
  reg['AND-1-035'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if ([...p.front, ...p.energy].some(u => (u.card.name || '').includes('Billy') && (u.card.traits || '').includes('UNDER'))) {
        const enemy = Engine.opponentOf(p);
        if (enemy.hand.length) {
          const i = await enemy.controller.chooseCardFromHand(enemy, `${card.name}: เลือกการ์ดจากมือไป Outside Area`);
          if (i != null) { enemy.sideline.push(enemy.hand.splice(i, 1)[0]); log(`${card.name}: ${enemy.name} ส่งการ์ดไป Outside Area`); }
        }
      }
    },
  };

  // 039 Blade Runner — enemy front -3000 BP; choose -4000 instead, or draw 1.
  reg['AND-1-039'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: '-4000 BP แทน', value: 'more' },
        { label: '-3000 BP แล้วจั่ว 1 ใบ', value: 'draw' },
      ]);
      if (v === 'more') { t.bpMod -= 4000; log(`${card.name}: ${t.card.name} -4000 BP เทิร์นนี้`); }
      else { t.bpMod -= 3000; log(`${card.name}: ${t.card.name} -3000 BP เทิร์นนี้`); Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
      await Engine.checkBpZero();
    },
  };

  // 044 Andy — [On Retire] may discard a non-Andy hand card -> play a red Andy (need<=2) from
  // Outside Area active.
  reg['AND-1-044'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const idx = p.hand.findIndex(no => !(byNo(no)?.name || '').includes('Andy'));
      if (idx < 0) return;
      const pred = c => c && c.color === 'Red' && (c.name || '').includes('Andy') && (c.need || 0) <= 2;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      p.sideline.push(p.hand.splice(idx, 1)[0]);
      log(`${unit.card.name}: วางการ์ดจากมือไป Outside Area`);
      const sidx = await p.controller.chooseCardFromSideline(p, 'เลือก Andy สีแดง (Energy≤2) จาก Outside Area', pred);
      if (sidx == null) return;
      await Engine.playCardFromZone(p, p.sideline[sidx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 049 Izumo Fuuko — may retire 1 other character -> play a red Andy (need<=2) from Outside
  // Area rested.
  reg['AND-1-049'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) return;
      const pred = c => c && c.color === 'Red' && (c.name || '').includes('Andy') && (c.need || 0) <= 2;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: Retire character อื่นเพื่อเรียก Andy จาก Outside Area? (ไม่บังคับ)`, true);
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Andy สีแดง (Energy≤2) จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 051 Isshin — [On Retire] buff another own character +1000 this turn.
  reg['AND-1-051'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 053 Gina — grants a reactive "opponent must pay extra AP to target this" tax. Left unscripted:
  // no AP-cost-on-targeting mechanism exists in the engine (same class of gap as HTR-2-024).

  // 055 Shen — draws 1 when winning a battle AS THE BLOCKER (uses the new onDefenderWinBattle hook).
  reg['AND-1-055'] = {
    async onDefenderWinBattle(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ (ชนะ battle ในฐานะผู้ถูกโจมตี)`);
    },
  };

  // 058 Chikara Shigeno — choose 1 enemy front BP<=3000, cannot block this turn.
  reg['AND-1-058'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3000) ห้าม block เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noBlock = true; log(`${unit.card.name}: ${t.card.name} ห้าม block เทิร์นนี้`); }
    },
  };

  // 061 Juiz — [Main][Rest] buff another own character +500 this turn.
  reg['AND-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
    },
  };

  // 067 Top — moves itself to the Energy Line after attacking (approximated as "when it attacks",
  // since there's no distinct "attack has ended" hook — resolving this attack's outcome is unaffected).
  reg['AND-1-067'] = {
    async onAttack(G, p, unit) {
      if (p.energy.length >= 4) return;
      await Engine.moveUnitFree(p, unit, 'energy');
    },
  };

  // 068 Nico — self-bounce pattern (return another need<=1 character, or self if none).
  reg['AND-1-068'] = {
    async onPlay(G, p, unit) { await H.bounceSelfOrOther(p, unit, 1); },
  };

  // 069 Billy — passive +500 BP per other Trait:UNION on own Front Line.
  reg['AND-1-069'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.front.filter(u => u !== unit && (u.card.traits || '').includes('UNION')).length * 500;
    },
  };

  // 071 Void — [Sniper] restricted to targets under BP2000. Left unscripted: Sniper's targeting
  // restriction isn't modeled (kw.snipe just enables target-choice; no per-card BP cap on it yet).

  // 075 UMA Clothes (Field) — [Main][Rest] buff an own character +1000 this turn.
  // (entersActive now handled generically by kw.entersActive.)
  reg['AND-1-075'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 076 Apocalypse — draw 1 (or 2 if an own character needs 5+ energy); add a Life card to hand.
  reg['AND-1-076'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].some(u => (u.card.need || 0) >= 5) ? 2 : 1;
      Engine.draw(p, n); log(`${card.name}: จั่ว ${n} ใบ`);
      await H.addLifeToHand(p);
    },
  };

  // 078 Deadline — bare retire enemy BP<=3000.
  reg['AND-1-078'] = { async onEvent(G, p, card) { await H.retireEnemyFront(p, 3000); } };

  // 079 Unluck — usable only with own Izumo Fuuko; retire an enemy front BP<=5000 or an own Andy.
  reg['AND-1-079'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Izumo Fuuko')) { log(`${card.name}: ใช้ไม่ได้ (ไม่มี Izumo Fuuko)`); return; }
      const enemy = Engine.opponentOf(p);
      const enemyTargets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= 5000);
      const ownAndys = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Andy'));
      const opts = [
        ...enemyTargets.map(u => ({ label: `Retire ${u.card.name} (ศัตรู)`, value: `e:${u.uid}` })),
        ...ownAndys.map(u => ({ label: `Retire ${u.card.name} (Andy ของตัวเอง)`, value: `o:${u.uid}` })),
      ];
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือกเป้าหมาย retire`, opts);
      const [side, uidStr] = v.split(':');
      const uid = parseInt(uidStr);
      if (side === 'e') { const t = enemyTargets.find(x => x.uid === uid); if (t) await Engine.sidelineUnit(enemy, t, 'effect'); }
      else { const t = ownAndys.find(x => x.uid === uid); if (t) await Engine.sidelineUnit(p, t, 'effect'); }
    },
  };

  // 080 The power of UNION — retire enemy front BP < (Trait:UNION count on own area) x 1000;
  // sent to the Remove Area instead if own Juiz is present.
  reg['AND-1-080'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('UNION')).length;
      const limit = n * 1000 - 1;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= limit);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP<${n * 1000})`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Juiz')) {
        await Engine.sidelineUnit(enemy, t, 'effect');
        const i = enemy.sideline.lastIndexOf(t.no);
        if (i >= 0) { enemy.sideline.splice(i, 1); enemy.removal.push(t.no); }
        log(`${card.name}: ${t.card.name} ถูกส่งไป Remove Area ถาวร (มี Juiz)`);
      } else {
        await Engine.sidelineUnit(enemy, t, 'effect');
      }
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Skipped (needs engine mechanisms that don't exist yet):
  //  • 1-053 Gina — reactive AP-tax on being targeted (no AP-cost-on-targeting layer)
  //  • 1-071 Void — [Sniper] with a BP-cap restriction (Sniper has no per-card target filter yet)
  // ────────────────────────────────────────────────────────────────────────
})();
