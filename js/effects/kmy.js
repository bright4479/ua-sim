// ══════════ UA SIM — Kimetsu no Yaiba / Demon Slayer (KMY) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  async function moveToLine(p) {
    const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character เพื่อย้าย line', true);
    const t = targets.find(x => x.uid === uid);
    if (!t) return;
    const toLine = p.front.includes(t) ? 'energy' : 'front';
    let removeUid = null;
    const dest = toLine === 'front' ? p.front : p.energy;
    if (dest.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, dest, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
    await Engine.moveUnitFree(p, t, toLine, removeUid);
  }
  async function swapFrontEnergyPair(p, label) {
    const fronts = p.front.filter(u => u.card.type === 'Character');
    const energies = p.energy.filter(u => u.card.type === 'Character');
    if (!fronts.length || !energies.length) return;
    const uidF = await p.controller.chooseOwnCharacter(p, fronts, 'เลือก character บน Front Line');
    const uidE = await p.controller.chooseOwnCharacter(p, energies, 'เลือก character บน Energy Line');
    const f = fronts.find(x => x.uid === uidF), e = energies.find(x => x.uid === uidE);
    if (f && e) { const iF = p.front.indexOf(f), iE = p.energy.indexOf(e); p.front[iF] = e; p.energy[iE] = f; log(`${label}: สลับตำแหน่ง ${f.card.name} กับ ${e.card.name}`); }
  }
  async function moveOrSwapChoice(p, unit) {
    const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
      { label: 'ย้าย character ไปอีก line', value: 'move' },
      { label: 'สลับตำแหน่ง Front Line กับ Energy Line 1 คู่', value: 'swap' },
    ]);
    if (v === 'move') await moveToLine(p); else await swapFrontEnergyPair(p, unit.card.name);
  }

  // ── KMY-1 ──────────────────────────────────────────────────────────────

  // 002 Ubuyashiki Kagaya — [Main][Rest][Discard1][Retire] untap 1 AP.
  reg['KMY-1-002'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.apUntap(p, 1);
    },
  };

  // 006 Kamado Tanjiro — [On Play] play 1 Kamado Nezuko (energy≤2, AP1) from hand to Front Line, rested.
  reg['KMY-1-006'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Kamado Nezuko') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: false });
    },
  };

  // 010 Kamado Nezuko — [On Play][Frontline] if own Kamado Tanjiro, choose 1 enemy Front Line character BP≥1500, -1000 BP.
  reg['KMY-1-010'] = {
    async onPlay(G, p, unit) {
      if (!p.front.includes(unit) || !H.hasCardNamed(p, 'Kamado Tanjiro')) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 1500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥1500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 013 Shinazugawa Genya — [Your Turn][1/turn] when an enemy Front Line character retires, may
  // draw 1 + discard 1. (Skipped: no hook broadcasts an opponent's retirement to the other player's
  // units — only the retiring unit's own owner gets onSideline.)

  // 021 Kocho Shinobu — [On Play] choose 1 of 3 effects (all 3 if 6+ Ubuyashiki Kagaya/Trait:Hashira on area).
  reg['KMY-1-021'] = {
    async onPlay(G, p, unit) {
      const hashiraCount = [...p.front, ...p.energy].filter(u => u !== unit && ((u.card.name || '').includes('Ubuyashiki Kagaya') || (u.card.traits || '').includes('Hashira'))).length;
      const doDraw = async () => { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); };
      const doRest = async () => { await H.restEnemyFront(p, 3000); };
      const doBuff = async () => { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); };
      if (hashiraCount >= 6) { await doDraw(); await doRest(); await doBuff(); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'draw' },
        { label: 'วางนอน character ศัตรู (BP≤3000)', value: 'rest' },
        { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'buff' },
      ]);
      if (v === 'draw') await doDraw(); else if (v === 'rest') await doRest(); else await doBuff();
    },
  };

  // 028 Butterfly Mansion (Field) — [Main][Rest][Retire] fetch up to 2 yellow character cards (energy≤3) from Outside Area to hand.
  reg['KMY-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 3;
      for (let i = 0; i < 2; i++) {
        if (!p.sideline.some(no => pred(byNo(no)))) break;
        const idx = await p.controller.chooseCardFromSideline(p, `เลือก character สีเหลือง (${i + 1}/2)`, pred);
        if (idx == null) break;
        const no = p.sideline.splice(idx, 1)[0];
        p.hand.push(no);
        log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
      }
    },
  };

  // 032 You Hesitate Too Long (Event) — rest 1 enemy Front Line character; choose up to 1 own Urokodaki Sakonji, set Active.
  reg['KMY-1-032'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Urokodaki Sakonji') && u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Urokodaki Sakonji ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 041 Hand Demon — [On Retire] choose: move 1 own character to the other line, or swap a Front/Energy Line pair.
  reg['KMY-1-041'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await moveOrSwapChoice(p, unit); } };

  // 043 Yahaba — [Main][Rest][Discard1] same choice as Hand Demon.
  reg['KMY-1-043'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      await H.discardFromHand(p);
      await moveOrSwapChoice(p, unit);
    },
  };

  // 048 Rokuro — [On Retire][Your Turn] choose 1 enemy Front Line character, -2000 BP this turn.
  reg['KMY-1-048'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      if (Engine.G.players[Engine.G.active] !== p) return;
      await H.debuffEnemyFront(p, -2000);
    },
  };

  // 054 Gyutaro — [On Play] if own Daki, draw 1 + discard 1.
  reg['KMY-1-054'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Daki')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); } } };

  // 057 Daki — [On Retire] look at top 6, fetch 1 Gyutaro to hand, discard 1 if added.
  reg['KMY-1-057'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const taken = await H.lookTopAndTake(p, 6, c => (c.name || '').includes('Gyutaro'), 1, `${unit.card.name}: ดูการ์ดบนสุด 6 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 058 Daki — [On Play] / [On Retire] play 1 Gyutaro (energy≤3, AP1) from Outside Area to Front Line, Active.
  function daki058() {
    return async (p, unit) => {
      const pred = c => c && (c.name || '').includes('Gyutaro') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Gyutaro จาก Outside Area`, pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'front', active: true });
    };
  }
  reg['KMY-1-058'] = {
    async onPlay(G, p, unit) { await daki058()(p, unit); },
    async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await daki058()(p, unit); },
  };

  // 061 Kyogoku House (Field) — [Main][Rest][Retire] fetch 1 Gyutaro/Daki from Outside Area to hand.
  reg['KMY-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && ((c.name || '').includes('Gyutaro') || (c.name || '').includes('Daki'));
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Gyutaro หรือ Daki จาก Outside Area`);
    },
  };

  // 062 Demon's Power (Event) — choose 1 own character +1000 BP + 1000 more per character retired
  // this turn; if BP ends ≥5000, gains [Impact +1].
  reg['KMY-1-062'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const bonus = 1000 + 1000 * (Engine.G.retiredThisTurn || 0);
      t.bpMod += bonus;
      log(`${card.name}: ${t.card.name} +${bonus} BP เทิร์นนี้`);
      if (Engine.bp(t) >= 5000) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 063 Lower Your Heads (Event) — retire 1 own character; if did, retire 1 enemy Front Line character, draw 1.
  reg['KMY-1-063'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ของคุณเพื่อ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      await H.retireEnemyFront(p);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 064 Purge (Event) — retire 1 own character; if did, untap 1 AP; draw 2.
  reg['KMY-1-064'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ของคุณเพื่อ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      await H.apUntap(p, 1);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 075 Chun Taro — [Main][Rest][1/turn] +1 red energy generation this turn, retire at end of Main.
  reg['KMY-1-075'] = {
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

  // 077 Hashibira Inosuke — passive +500 BP if this character moved during this turn.
  reg['KMY-1-077'] = { bpBonus(p, unit) { return unit._movedThisTurn ? 500 : 0; } };

  // 083 Hinatsuru — [On Retire] fetch 1 Uzui Tengen from Outside Area to hand.
  reg['KMY-1-083'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Uzui Tengen'), `${unit.card.name}: เลือก Uzui Tengen จาก Outside Area`);
    },
  };

  // 086 Uzui Tengen — [On Play] look at top 4, fetch 1 Trait:Tengen's Wife/Trait:Disguise card to hand, remainder to bottom.
  reg['KMY-1-086'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndTake(p, 4, c => (c.traits || '').includes("Tengen's Wife") || (c.traits || '').includes('Disguise'), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 088 Rengoku Kyojuro — [On Play] return 1 other character (energy≤1) to hand, or self if none.
  reg['KMY-1-088'] = { async onPlay(G, p, unit) { await H.bounceSelfOrOther(p, unit, 1); } };

  // 089 Rengoku Kyojuro — [Main][Frontline][Discard1][1/turn] all own characters +500 BP this turn.
  reg['KMY-1-089'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if (u.card.type === 'Character') { u.bpMod += 500; n++; }
      log(`${unit.card.name}: character ${n} ใบ +500 BP เทิร์นนี้`);
    },
  };

  // 096 String Performance (Event) — retire 1 enemy Front Line character with BP ≤ 1000 × (own
  // Uzui Tengen + Trait:Tengen's Wife + Trait:Disguise count).
  reg['KMY-1-096'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Uzui Tengen') || (u.card.traits || '').includes("Tengen's Wife") || (u.card.traits || '').includes('Disguise')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 097 Thunderclap and Flash (Event) — retire 1 enemy Front Line character BP≤3000 (BP≤5000 if own Zenitsu Agatsuma).
  reg['KMY-1-097'] = { async onEvent(G, p, card) { await H.retireEnemyFront(p, H.hasCardNamed(p, 'Zenitsu Agatsuma') ? 5000 : 3000); } };

  // 098 Crazy Cutting (Event) — choose 1 own Front Line character +2000 BP; if Inosuke Hashibira, also [Damage +1].
  reg['KMY-1-098'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if ((t.card.name || '').includes('Inosuke Hashibira')) { t.tempDmg += 1; log(`${card.name}: ${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
    },
  };

  // 100 Boar Rush (Event) — choose 1 own Front Line character +3000 BP.
  reg['KMY-1-100'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 3000; log(`${card.name}: ${t.card.name} +3000 BP เทิร์นนี้`); }
    },
  };

  // 104 Kamazo Nezuko — [On Play] choose up to 1 enemy Front Line character (energy≤3), retire it.
  reg['KMY-1-104'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (u.card.need || 0) <= 3);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (Energy≤3)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 108 Round Rock (Field) — [Main][Rest][Retire] all own characters +1000 BP this turn.
  reg['KMY-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if (u.card.type === 'Character') { u.bpMod += 1000; n++; }
      log(`${unit.card.name}: character ${n} ใบ +1000 BP เทิร์นนี้`);
    },
  };

  // ── KMY-2 ──────────────────────────────────────────────────────────────

  // 001 Kamado Tanjiro / 002 Kamado Nezuko — a 2-card "moves during Attack Phase" combo. (Skipped:
  // no hook fires at the start of Attack Phase or watches for movement specifically within it.)

  // 004 Kanroji Mitsuri — [Main][Pay1AP][1/turn] self +2500 BP this turn.
  reg['KMY-2-004'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 2500;
      log(`${unit.card.name}: +2500 BP เทิร์นนี้`);
    },
  };

  // 005 Kocho Shinobu — [Main][Frontline][1/turn] choose 1 enemy character (any zone) BP≥1500, -1000 BP.
  reg['KMY-2-005'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 007 Tokito Muichiro — passive genMod +1 if 3+ Ubuyashiki Kagaya/other Trait:Hashira on area.
  reg['KMY-2-007'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner) return 0;
      const n = [...owner.front, ...owner.energy].filter(u => (u.card.name || '').includes('Ubuyashiki Kagaya') || (u !== unit && (u.card.traits || '').includes('Hashira'))).length;
      return n >= 3 ? 1 : 0;
    },
  };

  // 009 Himejima Gyomei — [On Play] may discard 1 to free-play 1 other Trait:Hashira (fulfilled
  // energy, AP1) from hand, rested.
  reg['KMY-2-009'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Hashira') && !(c.name || '').includes('Himejima Gyomei') && (c.ap || 0) === 1 && Engine.hasEnergyFor(p, c);
      if (!p.hand.some(no => pred(byNo(no)))) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อลง Trait:Hashira ฟรี?`);
      if (!discarded) return;
      const idx = p.hand.findIndex(no => pred(byNo(no)));
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // ── KMY-3 ──────────────────────────────────────────────────────────────

  // 001 Ubuyashiki Kagaya — [Main][Rest][Retire] choose 1 own Trait:Hashira, set Active.
  reg['KMY-3-001'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Hashira') && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Hashira ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 002 Kamado Tanjiro — [On Play] may rest 1 active own Kamado Nezuko on Front Line to set self
  // Active. (Skipped: the "your Nezuko cannot be chosen by opponent effects" continuous aura grant
  // — no aura-untargetable hook exists, only bpBonus-style static/live BP auras.)
  reg['KMY-3-002'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => (u.card.name || '').includes('Kamado Nezuko') && !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางนอน Kamado Nezuko (Active) เพื่อ Active ตัวเอง? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      unit.rested = false;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน, Active ตัวเอง`);
    },
  };

  // 004 Kanzaki Aoi — [On Play] may discard 1 to fetch 1 yellow character card (energy≤3) from Outside Area to hand.
  reg['KMY-3-004'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 3;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อดึงการ์ดจาก Outside Area? (ไม่บังคับ)`);
      if (discarded) await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก character สีเหลืองจาก Outside Area`);
    },
  };

  // 005 Tamayo — [Main][Rest] force the opponent to place 1 card (2 if they have 10+ in their
  // Outside Area) from their Outside Area to their Remove Area.
  reg['KMY-3-005'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const enemy = Engine.opponentOf(p);
      const n = enemy.sideline.length >= 10 ? 2 : 1;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        if (!enemy.sideline.length) break;
        const idx = await enemy.controller.chooseCardFromSideline(enemy, `${unit.card.name}: เลือกการ์ดจาก Outside Area ส่งไป Remove Area (ถูกบังคับ)`);
        const no = enemy.sideline.splice(idx ?? 0, 1)[0];
        enemy.removal.push(no);
        moved++;
      }
      log(`${unit.card.name}: ${enemy.name} ส่ง ${moved} ใบจาก Outside Area ไป Remove Area`);
    },
  };

  // 007 Kanroji Mitsuri — [Main][Frontline][Discard1][1/turn] choose 1 own Trait:Hashira (AP2), set Active.
  reg['KMY-3-007'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Hashira') && (u.card.ap || 0) === 2 && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Hashira (AP2) ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 009 Tokito Muichiro — [Main][Frontline][1/turn] choose 1 own Trait:Hashira (AP2), gains [Impact +1] this turn.
  reg['KMY-3-009'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Hashira') && (u.card.ap || 0) === 2);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Hashira (AP2) รับ [Impact +1] เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 011 Nursing (Event) — fetch 1 character card from Outside Area to hand.
  reg['KMY-3-011'] = { async onEvent(G, p, card) { await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก character จาก Outside Area`); } };

  // 012 Goto — [On Play] same move-or-swap choice as Hand Demon/Yahaba.
  reg['KMY-3-012'] = { async onPlay(G, p, unit) { await moveOrSwapChoice(p, unit); } };

  // 015 / 037 / 038 Kamado Tanjiro / Tokito Muichiro — depend on tracking "this character was
  // chosen by a Trait:Nichirin Sword card's effect this turn". (Skipped: no generic hook marks a
  // targeted unit with which trait/card targeted it, only that it was targeted at all via the
  // controller's target-picking methods.)

  // 016 Kamado Tanjiro — [Main][Frontline][Pay1AP][1/turn] choose 1 own Kamado Nezuko, +1000 BP
  // this turn. (Skipped: the reactive "when chosen by a Trait:Nichirin Sword card" first clause —
  // same gap as 015/037/038.)
  reg['KMY-3-016'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kamado Nezuko'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Kamado Nezuko'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Kamado Nezuko รับ +1000 BP เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 020 Kamado Nezuko — [When Attacking] look at the top of your deck; if it's Kamado Tanjiro or
  // Nichirin Sword (Kamado Tanjiro), may reveal it for +1000 BP this turn (kept on top either way).
  reg['KMY-3-020'] = {
    async onAttack(G, p, unit) {
      if (!p.deck.length) return;
      const top = p.deck[0];
      const c = byNo(top);
      if ((c.name || '').includes('Kamado Tanjiro') || (c.name || '').includes('Nichirin Sword (Kamado Tanjiro)')) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุด ${c.name} — เปิดเผยให้ศัตรูดูเพื่อรับ +1000 BP?`,
          [{ label: 'เปิดเผย', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      }
    },
  };

  // 025 Hotaru Haganezuka — [On Play] choose: look at top 7 for up to 1 Trait:Nichirin Sword card
  // to hand (remainder to bottom), or draw 1 if own Trait:Nichirin Sword.
  reg['KMY-3-025'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 7 ใบ (หา Trait:Nichirin Sword)', value: 'look' },
        { label: 'จั่ว 1 ใบ (ถ้ามี Trait:Nichirin Sword)', value: 'draw' },
      ]);
      if (v === 'look') {
        await H.lookTopAndTake(p, 7, c => (c.traits || '').includes('Nichirin Sword'), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
      } else if ([...p.front, ...p.energy].some(u => (u.card.traits || '').includes('Nichirin Sword'))) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 029 Yoriichi Type Zero — [On Retire] choose: look at top 7 for up to 1 Trait:Nichirin Sword
  // card to hand (remainder to bottom), or fetch 1 Trait:Nichirin Sword from Outside Area to hand.
  reg['KMY-3-029'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const opts = [{ label: 'ดูการ์ดบนสุด 7 ใบ (หา Trait:Nichirin Sword)', value: 'look' }];
      if (p.sideline.some(no => (byNo(no)?.traits || '').includes('Nichirin Sword'))) opts.push({ label: 'เลือก Trait:Nichirin Sword จาก Outside Area', value: 'fetch' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'look') await H.lookTopAndTake(p, 7, c => (c.traits || '').includes('Nichirin Sword'), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
      else await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Nichirin Sword'), `${unit.card.name}: เลือก Trait:Nichirin Sword จาก Outside Area`);
    },
  };

  // 031 Kanjori Mitsuri — [On Retire] choose 1 own character, +1000 BP this turn.
  reg['KMY-3-031'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await H.buffOwnCharacter(p, 1000); } };

  // 045 Dancing Flash (Event) — retire 1 enemy Front Line character BP≤2000 (BP≤4000 if own Kamado
  // Tanjiro; BP≤5000 if also own Nichirin Sword (Kamado Tanjiro)).
  reg['KMY-3-045'] = {
    async onEvent(G, p, card) {
      let limit = 2000;
      if (H.hasCardNamed(p, 'Kamado Tanjiro')) limit = 4000;
      if (H.hasCardNamed(p, 'Kamado Tanjiro') && H.hasCardNamed(p, 'Nichirin Sword (Kamado Tanjiro)')) limit = 5000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 046 Bright Red Blade (Event) — choose 1 own character, +1000 BP and [Impact +1] or [Damage +1]
  // this turn, draw 1. (Simplified: the "was chosen by a Trait:Nichirin Sword this turn" targeting
  // filter isn't enforced — same tracking gap as 015/016/037/038.)
  reg['KMY-3-046'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก bonus`, [
        { label: '[Impact +1]', value: 'impact' }, { label: '[Damage +1]', value: 'damage' },
      ]);
      if (v === 'impact') { t.tempImpact += 1; } else { t.tempDmg += 1; }
      log(`${card.name}: ${t.card.name} +1000 BP และ ${v === 'impact' ? '[Impact +1]' : '[Damage +1]'} เทิร์นนี้`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 047 Mist Breathing Fifth Form (Event) — AP -1 if own Tokito Muichiro; choose 1 enemy Front Line
  // character BP≤5000, send to bottom of their deck.
  reg['KMY-3-047'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Tokito Muichiro') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000) ส่งไปใต้เด็ค`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      enemy.front.splice(enemy.front.indexOf(t), 1);
      enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไปใต้เด็คของ ${enemy.name}`);
    },
  };

  // 053 Daki — [Main] manually raids this card onto another Daki with [Raid] on Front Line.
  // (Skipped: bespoke manual-trigger-Raid mechanic — same risk noted for EX09BT-TSK-2-032.)

  // 054 Daki — [On Play] if own Gyutaro, choose 1 enemy character (any zone) BP≥1500, -1000 BP.
  // @[Main][Frontline][Pay1AP][1/turn] choose 1 own Gyutaro, gains [Impact +1] this turn.
  reg['KMY-3-054'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Gyutaro')) return;
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gyutaro'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Gyutaro'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Gyutaro รับ [Impact +1] เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 055 Hantengu — [On Retire] choose any number of Aizetsu/Urami/Karaku/Sekido from Outside Area;
  // play up to 2 rested, remainder to hand.
  reg['KMY-3-055'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const names = ['Aizetsu', 'Urami', 'Karaku', 'Sekido'];
      const pred = c => c && names.some(n => (c.name || '').includes(n));
      const picks = [];
      while (picks.length < 4 && p.sideline.some(no => pred(byNo(no)))) {
        const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือกการ์ด (ไม่บังคับเลือกทั้งหมด)`, pred);
        if (idx == null) break;
        picks.push(p.sideline.splice(idx, 1)[0]);
      }
      if (!picks.length) return;
      for (let i = 0; i < picks.length; i++) {
        const no = picks[i];
        if (i < 2) { p.sideline.push(no); await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false }); }
        else { p.hand.push(no); log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); }
      }
    },
  };

  // 056 Aizetsu — [On Retire] choose 1 enemy Front Line character, -1000 BP this turn. (Simplified:
  // fires on any non-battle retirement rather than only "retired by your own effect"; the
  // Zohakuten-specific -2000 upgrade isn't distinguished — no infra tracks which effect retired a
  // card, same gap as 015/016/037/038/046.)
  reg['KMY-3-056'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await H.debuffEnemyFront(p, -1000); } };

  // 057 Urami — [On Retire] draw 1 (see 056's note on the Zohakuten-upgrade simplification).
  reg['KMY-3-057'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };

  // 058 Karaku — [On Retire] place the top of your deck to the Outside Area (see 056's note).
  reg['KMY-3-058'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      if (p.deck.length) { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
    },
  };

  // 062 Agatsuma Zenitsu — passive +1000 BP if own Kamado Tanjiro or Hashibira Inosuke is in Raid State.
  reg['KMY-3-062'] = {
    bpBonus(p, unit) {
      const raided = [...p.front, ...p.energy].some(u => u.under && u.under.length && ((u.card.name || '').includes('Kamado Tanjiro') || (u.card.name || '').includes('Hashibira Inosuke')));
      return raided ? 1000 : 0;
    },
  };

  // 063 Kamado Tanjiro — [Main][Rest][Retire] choose 1 of: own Agatsuma Zenitsu in Raid State gains
  // [Impact +1], or own Hashibira Inosuke in Raid State gains [Damage +1].
  reg['KMY-3-063'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const zenitsu = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Agatsuma Zenitsu') && u.under && u.under.length);
      const inosuke = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Hashibira Inosuke') && u.under && u.under.length);
      const opts = [];
      if (zenitsu.length) opts.push({ label: 'Zenitsu (Raid State) รับ [Impact +1]', value: 'zenitsu' });
      if (inosuke.length) opts.push({ label: 'Inosuke (Raid State) รับ [Damage +1]', value: 'inosuke' });
      if (!opts.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      await Engine.sidelineUnit(p, unit, 'effect');
      if (v === 'zenitsu') {
        const uid = await p.controller.chooseOwnCharacter(p, zenitsu, 'เลือก Zenitsu', true);
        const t = zenitsu.find(x => x.uid === uid);
        if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
      } else {
        const uid = await p.controller.chooseOwnCharacter(p, inosuke, 'เลือก Inosuke', true);
        const t = inosuke.find(x => x.uid === uid);
        if (t) { t.tempDmg += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
      }
    },
  };

  // 065 Hashibira Inosuke — [On Play] if own Kamado Tanjiro or Agatsuma Zenitsu is in Raid State, set self Active.
  reg['KMY-3-065'] = {
    async onPlay(G, p, unit) {
      const raided = [...p.front, ...p.energy].some(u => u.under && u.under.length && ((u.card.name || '').includes('Kamado Tanjiro') || (u.card.name || '').includes('Agatsuma Zenitsu')));
      if (raided) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 066 / 067 Rengoku Shinjuro / Rengoku Ruka — depend on tracking "placed to Outside Area
  // specifically by an Event Card or Rengoku Kyojuro's effect". (Skipped: same source-tracking gap
  // noted for BLC-2-013/BLC-2-047.)

  // 071 Rengoku Kyojuro — [Main][Discard1][1/turn] the next BP-range-gated targeting effect you use
  // this turn treats its threshold as 1000 higher. (Skipped: this alters how OTHER cards' text is
  // interpreted at the moment they're used — too open-ended to hook in generically.)

  // ── UAPR-KMY-P (promo prints) ─────────────────────────────────────────

  // 001 Nezuko Kamado — [On Play] choose up to 1 own Nichirin Sword (Tanjiro Kamado), set Active.
  // (Skipped: the "if you raided a blue Tanjiro/Nezuko this turn, draw 1" clause — no generic
  // tracker records "raided a card this turn".)
  reg['UAPR-KMY-P-001'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Nichirin Sword (Tanjiro Kamado)') && u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Nichirin Sword (Tanjiro Kamado) ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 003 Kyojuro Rengoku — [On Play] choose: look at top 3 for a "Rengoku"-named card to hand
  // (discard 1 if added), or +1 energy generation this turn if 5+ generated energy.
  reg['UAPR-KMY-P-003'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 3 ใบ (หาการ์ดชื่อ Rengoku)', value: 'look' },
        { label: '+1 energy generation เทิร์นนี้ (ถ้ามี generated energy≥5)', value: 'gen' },
      ]);
      if (v === 'look') {
        const taken = await H.lookTopAndTake(p, 3, c => (c.name || '').includes('Rengoku'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      } else {
        const total = Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0);
        if (total >= 5) { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
        else p.controller.notify?.('generated energy ไม่ถึง 5');
      }
    },
  };

  // ---------- 2026-07-25 round: worst-covered-series pass ----------
  // KMY-2-001 Kamado Tanjiro (2) — [Your Turn][1/turn] if a character on your area moved during
  // this turn (approximated: not scoped to specifically your Attack Phase), choose up to 1 own
  // character, +1000 BP.
  reg['KMY-2-001'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (![...p.front, ...p.energy].some(u => u._movedThisTurn)) { p.controller.notify?.('ต้องมี character ที่ย้าย line เทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // KMY-2-002 Kamado Nezuko — [When in Energy Line] at the start of your Attack Phase, choose 1
  // own Front Line character, switch position with this character.
  reg['KMY-2-002'] = {
    async onAttackPhaseStart(G, p, unit) {
      if (!p.energy.includes(unit) || !p.front.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, p.front, `${unit.card.name}: เลือก character บน Front Line เพื่อสลับตำแหน่ง`);
      const t = p.front.find(x => x.uid === uid);
      if (!t) return;
      const ei = p.energy.indexOf(unit), fi = p.front.indexOf(t);
      p.energy[ei] = t; p.front[fi] = unit;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
  };

  // ---------- 2026-07-26: residual pass (bonus text alongside working keywords) ----------
  const namedOnArea = (p, name) => [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name));
  // several cards swap one of your Front Line characters with one on your Energy Line
  async function swapFrontEnergy(p, frontPred, energyPred, title) {
    const f = p.front.filter(frontPred), e = p.energy.filter(energyPred);
    if (!f.length || !e.length) return;
    const fu = await p.controller.chooseOwnCharacter(p, f, `${title}: เลือก character บน Front Line`, true);
    const a = f.find(x => x.uid === fu);
    if (!a) return;
    const eu = await p.controller.chooseOwnCharacter(p, e, `${title}: เลือก character บน Energy Line`, true);
    const b = e.find(x => x.uid === eu);
    if (!b) return;
    p.front[p.front.indexOf(a)] = b;
    p.energy[p.energy.indexOf(b)] = a;
    log(`${title}: สลับตำแหน่ง ${a.card.name} กับ ${b.card.name}`);
  }

  // 008 Kamado Tanjiro — [On Play] fetch a <Kamado Nezuko> (need<=3, ap1) from your Outside Area,
  // then you may free-play one from your hand rested.
  reg['KMY-1-008'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && (c.name || '').includes('Kamado Nezuko') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Kamado Nezuko จาก Outside Area`);
      const i = p.hand.findIndex(no => pred(byNo(no)));
      if (i < 0 || p.front.length >= 4) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ลง ${byNo(p.hand[i]).name} ลงสนาม (rested)?`,
        [{ label: 'ลง', value: true }, { label: 'ข้าม', value: false }]);
      if (v) await Engine.playCardFromZone(p, p.hand[i], 'hand', { line: 'front', active: false });
    },
  };

  // 011 Kamado Nezuko — [When Attacking] swap a <Kamado Tanjiro> on your Front Line with another
  // character on your Energy Line.
  reg['KMY-1-011'] = {
    async onAttack(G, p, unit) {
      await swapFrontEnergy(p, u => (u.card.name || '').includes('Kamado Tanjiro'), u => u !== unit, unit.card.name);
    },
  };

  // 015 / 078 Hashibira Inosuke — retire itself at the end of your Attack Phase (015 only while
  // still active).
  reg['KMY-1-015'] = {
    async onAttackPhaseEnd(G, p, unit) {
      if (p.front.includes(unit) && !unit.rested) await Engine.sidelineUnit(p, unit, 'effect');
    },
  };
  reg['KMY-1-078'] = {
    async onAttackPhaseEnd(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); },
  };

  // 035 Kibutsuji Muzan — cannot be played or moved to the Front Line unless your Outside Area
  // holds 20 or more cards.
  reg['KMY-1-035'] = {
    canPlayFromHand(p) { return p.sideline.length >= 20; },
    canMoveToFront(p) { return p.sideline.length >= 20; },
  };

  // 036 Kibutsuji Muzan — [Main][1 Per Turn] retire another of your characters and mill 1; if you
  // did, +1000 BP this turn.
  reg['KMY-1-036'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่น'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: เลือก character ให้ retire`);
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      if (p.deck.length) { p.sideline.push(p.deck.shift()); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; }
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 052 Akaza — [On Play] you may place 2 cards from your hand to the Outside Area; if you did,
  // gain [Sniper] and [Impact (1)] this turn.
  reg['KMY-1-052'] = {
    async onPlay(G, p, unit) {
      if (p.hand.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้ง 2 ใบเพื่อรับ [Sniper] + [Impact (1)]?`,
        [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 2; i++) if (!await H.discardFromHand(p)) return;
      unit.tempSnipe = true;
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: ได้ [Sniper] และ [Impact (1)] เทิร์นนี้`);
    },
  };

  // 055 Gyutaro — [1 Per Turn] set itself active after winning a battle. @[When Attacking] draw 1
  // if a <Daki> is on your area.
  reg['KMY-1-055'] = {
    async onWinBattle(G, p, unit) {
      if (unit._standTurn === Engine.G.turn) return false;
      unit._standTurn = Engine.G.turn;
      unit.rested = false;
      log(`${unit.card.name}: ตั้งขึ้น Active`);
      return false; // the loser is still sidelined normally
    },
    async onAttack(G, p, unit) {
      if (!namedOnArea(p, 'Daki')) return;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 070 Agatsuma Zenitsu — [On Play] fetch any Character Card other than <Agatsuma Zenitsu> from
  // your Outside Area.
  reg['KMY-1-070'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && !(c.name || '').includes('Agatsuma Zenitsu'),
        `${unit.card.name}: เลือก Character จาก Outside Area`);
    },
  };

  // 071 Agatsuma Zenitsu (Raid) — [On Play] with an <Inosuke Hashibira> on your field, draw 2 and
  // place 1 card from your hand to the Outside Area.
  reg['KMY-1-071'] = {
    async onPlay(G, p, unit) {
      if (!namedOnArea(p, 'Inosuke Hashibira') && !namedOnArea(p, 'Hashibira Inosuke')) return;
      Engine.draw(p, 2);
      log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 079 Hashibira Inosuke (Raid) — [On Play] with a <Zenitsu Agatsuma> on your field, set another
  // of your characters to active.
  reg['KMY-1-079'] = {
    async onPlay(G, p, unit) {
      if (!namedOnArea(p, 'Zenitsu Agatsuma') && !namedOnArea(p, 'Agatsuma Zenitsu')) return;
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.rested);
      if (!others.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: เลือก character ให้ตั้งขึ้น`, true);
      const t = others.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} ตั้งขึ้น`); }
    },
  };

  // 090 Rengoku Kyojuro — [On Play] you may discard 1; if you did, retire an enemy Front Line
  // character with BP 3000 or less and gain [Impact (1)] this turn.
  reg['KMY-1-090'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อ retire ศัตรู + [Impact (1)]?`,
        [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !await H.discardFromHand(p)) return;
      await H.retireEnemyFront(p, 3000);
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: ได้ [Impact (1)] เทิร์นนี้`);
    },
  };

  // 094 Bento (Field) — [Main][Rest] choose 1 of your characters, +1000 BP this turn.
  reg['KMY-1-094'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 103 Kamado Tanjiro (Raid) — [On Play] with a <Kamado Nezuko> on your area, +500 BP and
  // [Impact (1)] until the start of your next turn.
  reg['KMY-1-103'] = {
    async onPlay(G, p, unit) {
      if (!namedOnArea(p, 'Kamado Nezuko')) return;
      unit.bpPersist += 500;
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: +500 BP และ [Impact (1)] จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 107 Tomioka Giyu — [On Play] rest an enemy Front Line character, then draw 1.
  reg['KMY-1-107'] = {
    async onPlay(G, p, unit) {
      await H.restEnemyFront(p);
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 2-010 Uzui Tengen — [When Attacking] swap a <Trait: Tengen's Wife> on your Front Line with a
  // <Uzui Tengen> or <Trait: Disguise> on your Energy Line.
  reg['KMY-2-010'] = {
    async onAttack(G, p, unit) {
      await swapFrontEnergy(p,
        u => (u.card.traits || '').includes("Tengen's Wife"),
        u => (u.card.name || '').includes('Uzui Tengen') || (u.card.traits || '').includes('Disguise'),
        unit.card.name);
    },
  };

  // 2-011 Rengoku Kyojuro — [On Retire] choose up to 1 other character on your area, +1000 BP this
  // turn. (The "your other characters cannot be targeted by [Sniper]" aura is not implemented: the
  // snipe gate reads only the attacker's own keywords, with no per-defender aura hook.)
  reg['KMY-2-011'] = {
    async onSideline(G, p, unit, reason) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
  };

  // 3-008 Kocho Shinobu — draw 1 when this character attacks and loses, and again when it is
  // retired by an effect or by its BP hitting 0.
  reg['KMY-3-008'] = {
    // fires for every attack that loses, so it only counts when THIS character was the attacker
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) {
      if (atk !== self) return;
      Engine.draw(p, 1);
      log(`${self.card.name}: จั่ว 1 ใบ`);
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 3-010 Tomioka Giyuu — [When Attacking] with 6 or more <Ubuyashiki Kagaya> / other
  // <Trait: Hashira> cards on your area, another Hashira gets +1500 BP this turn.
  reg['KMY-3-010'] = {
    async onAttack(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit &&
        ((u.card.name || '').includes('Ubuyashiki Kagaya') || (u.card.traits || '').includes('Hashira'))).length;
      if (n < 6) return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hashira'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Hashira`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1500; log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
    },
  };

  // 3-024 Shinazugawa Genya — [On Retire] you may return this card to your hand.
  reg['KMY-3-024'] = {
    async onSideline(G, p, unit, reason) {
      const i = p.sideline.lastIndexOf(unit.no);
      if (i < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เอากลับเข้ามือ?`,
        [{ label: 'เอากลับ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.splice(i, 1);
      p.hand.push(unit.no);
      log(`${unit.card.name}: กลับเข้ามือ`);
    },
  };

  // 3-033 Kanjori Mitsuri — passive: +1 generated energy while a <Nichirin Sword (Kanroji
  // Mitsuri)> is on your area.
  reg['KMY-3-033'] = {
    genMod(unit, p) { return namedOnArea(p, 'Nichirin Sword (Kanroji Mitsuri)') ? 1 : 0; },
  };

  // 3-039 Tokito Muichiro — [On Play] an enemy Front Line character with BP 2500 or higher gets
  // -2000 BP this turn. (The "chosen by a Nichirin Sword effect" reactive is still unhandled: no
  // marker tracks which card chose this one.)
  reg['KMY-3-039'] = {
    async onPlay(G, p, unit) { await H.debuffEnemyAny(p, -2000, { min: 2500 }); },
  };
})();
