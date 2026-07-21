// ══════════ UA SIM — Code Geass (CGH) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. Everything below
// is CGH-specific logic that needed a bespoke script. CGH leans on: Trait-gated
// mass buffs (Four Holy Swords / Black Knights / Ashford Academy / Pizza), the
// Outside-Area-as-resource theme (event-card counting, Pizza cards), and several
// "free-play a cheap character from hand/Outside Area rested" On-Play effects.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function massBuffTrait(p, trait, delta) {
    let n = 0;
    for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes(trait)) { u.bpMod += delta; n++; }
    return n;
  }

  // ---------- CGH-1 ----------

  // 007 C.C. — draw 1; draw 1 more if a card with AP cost 2 was played from hand this turn.
  reg['CGH-1-007'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (p._playedApCostsThisTurn?.has(2)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่วเพิ่ม 1 ใบ (ใช้การ์ด AP2 เทิร์นนี้)`); }
    },
  };

  // 013 Kyoshiro Tohdoh — [Main][Front][1/turn] all Trait:Four Holy Swords +500 BP this turn.
  reg['CGH-1-013'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const n = massBuffTrait(p, 'Four Holy Swords', 500);
      log(`${unit.card.name}: Trait:Four Holy Swords ${n} ใบ +500 BP เทิร์นนี้`);
    },
  };

  // 014 Rakshata Chawla — [Main][Rest][Retire] fetch Trait:KMF from Outside Area to hand.
  reg['CGH-1-014'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.traits || '').includes('KMF');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีการ์ด Trait:KMF ใน Outside Area'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด Trait:KMF จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const no = p.sideline[idx]; p.sideline.splice(idx, 1); p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 016 / UA01PB-1-016 Lelouch Lamperouge — bare enemy front -1000 BP this turn.
  function lelouch016() { return { async onPlay(G, p, unit) { await H.debuffEnemyFront(p, -1000); } }; }
  reg['CGH-1-016'] = lelouch016();
  reg['UA01PB-CGH-1-016'] = lelouch016();

  // 018 Asahina Shogo — [When Attacking][Discard 1] fetch a Four Holy Swords/Kyoshiro/Gekka card.
  reg['CGH-1-018'] = {
    async onAttack(G, p, unit) {
      const pred = c => c && ((c.traits || '').includes('Four Holy Sword') || (c.name || '').includes('Kyoshiro Tohdoh') || (c.name || '').includes('Gekka'));
      if (!p.hand.length || !p.sideline.some(no => pred(byNo(no)))) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อดึงการ์ดจาก Outside Area? (ไม่บังคับ)`);
      if (discarded) await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 019 Kosetsu Urabe — buff another own character +1000 this turn.
  reg['CGH-1-019'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
  };

  // 020 Ryoga Senba — [On Retire] look top 3, fetch Four Holy Swords/Kyoshiro/Gekka.
  reg['CGH-1-020'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const pred = c => (c.traits || '').includes('Four Holy Swords') || (c.name || '').includes('Kyoshiro Tohdoh') || (c.name || '').includes('Gekka');
      await H.lookTopAndTake(p, 3, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
    },
  };

  // 027 Submarine (Field) — [Main][Rest] draw 1, discard 1. (entersActive now handled by kw.)
  reg['CGH-1-027'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 028 The Reason To Live — play a character (need<=3, AP1) from Outside Area rested.
  reg['CGH-1-028'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก Character (Energy≤3, AP1) จาก Outside Area`, pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 030 Geass of Absolute Obedience — retire enemy BP<=5000; untap 1 AP if own Lelouch present.
  reg['CGH-1-030'] = {
    async onEvent(G, p, card) {
      await H.retireEnemyFront(p, 5000);
      if (H.hasCardNamed(p, 'Lelouch Lamperouge')) await H.apUntap(p, 1);
    },
  };

  // 031 Spinning Life or Death Formation — enemy front -1000 BP per Four Holy Swords/Kyoshiro/Gekka on own area.
  reg['CGH-1-031'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Four Holy Swords') ||
        (u.card.name || '').includes('Kyoshiro Tohdoh') || (u.card.name || '').includes('Gekka')).length;
      if (n > 0) await H.debuffEnemyFront(p, -1000 * n);
    },
  };

  // 032 Overlook with all of your strength — choose 1 own purple character, grant
  // "cannot be blocked by BP<=2000" this turn; draw 1.
  reg['CGH-1-032'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.color === 'Purple' && u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character สีม่วง รับ "ห้าม block ด้วย BP≤2000" เทิร์นนี้`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempUnblockableBP = 2000; log(`${card.name}: ${t.card.name} ไม่สามารถถูก block ด้วย character BP≤2000 เทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 037 Clovis La Britannia — [Main][Rest][1/turn] buff own character +1000 this turn.
  reg['CGH-1-037'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 039 Cornelia Li Britannia — free-play a character (need<=2, AP1) from hand rested.
  reg['CGH-1-039'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 046 Euphemia Li Britannia — grants teammates immunity from opponent's Event cards used from
  // hand. Left unscripted: this is a field-wide targeting-protection aura granted to OTHER units,
  // not a self-immunity kw.untargetable can express (see skipped-items note at the end of file).

  // 053 Andreas Darlton — [When in Frontline] +500 BP per other own Front-Line character.
  reg['CGH-1-053'] = {
    bpBonus(p, unit) {
      if (!p.front.includes(unit)) return 0;
      return p.front.filter(u => u !== unit && u.card.type === 'Character').length * 500;
    },
  };

  // 054 Gilbert G.P. Guilford — [Your Turn] +1000 BP if you have more Front-Line characters than opponent.
  reg['CGH-1-054'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const enemy = Engine.opponentOf(p);
      return p.front.length > enemy.front.length ? 1000 : 0;
    },
  };

  // 061 Special Division Head Trailer (Field) — [Main][Discard 1][1/turn] +2 green energy this turn.
  reg['CGH-1-061'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.tempGen += 2;
      log(`${unit.card.name}: +2 energy generation เทิร์นนี้`);
    },
  };

  // 063 V.A.R.I.S — retire enemy BP<=3000 (or <=5000 with own Kururugi Suzaku/Lancelot).
  reg['CGH-1-063'] = {
    async onEvent(G, p, card) {
      const limit = (H.hasCardNamed(p, 'Kururugi Suzaku') || H.hasCardNamed(p, 'Lancelot')) ? 5000 : 3000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 065 Knight Accolade — buff own Front-Line character +3000 this turn.
  reg['CGH-1-065'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line รับ +3000 BP เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 3000; log(`${card.name}: ${t.card.name} +3000 BP เทิร์นนี้`); }
    },
  };

  // 066 Airframe Maintenance — look top 5, fetch a Character or Special Division Head Trailer;
  // untap 1 AP if the found card had Trait:KMF/KGF.
  reg['CGH-1-066'] = {
    async onEvent(G, p, card) {
      const pred = c => c.type === 'Character' || (c.name || '').includes('Special Division Head Trailer');
      const taken = await H.lookTopAndTake(p, 5, pred, 1, `${card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.length) {
        const c = byNo(taken[0]);
        if (c && ((c.traits || '').includes('KMF') || (c.traits || '').includes('KGF'))) await H.apUntap(p, 1);
      }
    },
  };

  // 067 Army Expansion — retire enemy BP<=1000; then all own Front-Line characters +1000 BP each.
  reg['CGH-1-067'] = {
    async onEvent(G, p, card) {
      await H.retireEnemyFront(p, 1000);
      let n = 0;
      for (const u of p.front) if (u.card.type === 'Character') { u.bpMod += 1000; n++; }
      if (n) log(`${card.name}: character บน Front Line ${n} ใบ +1000 BP เทิร์นนี้`);
    },
  };

  // 071 Kallen Stadfield — [When Attacking] self +1000 BP this turn.
  reg['CGH-1-071'] = {
    async onAttack(G, p, unit) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); },
  };

  // 073 Kururugi Suzaku — free-play a character (need<=2, AP1) from hand rested.
  reg['CGH-1-073'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 076 C.C. — passive +500 BP per Delivery Pizza / Giant Pizza (each, not combined) in Outside Area.
  reg['CGH-1-076'] = {
    bpBonus(p, unit) {
      let bonus = 0;
      if (p.sideline.some(no => (byNo(no)?.name || '').includes('Delivery Pizza'))) bonus += 500;
      if (p.sideline.some(no => (byNo(no)?.name || '').includes('Giant Pizza'))) bonus += 500;
      return bonus;
    },
  };

  // 079 Shirley Fenette — [Main][Rest][1/turn] +1 red energy this turn; retires at end of Main.
  reg['CGH-1-079'] = {
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

  // 080 Shirley Fenette — [Main][Rest] draw 1, discard 1.
  reg['CGH-1-080'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 083 Nunnally vi Britannia — [Main][1/turn] grant an own character "cannot be blocked by BP>=4000" this turn.
  reg['CGH-1-083'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ "ห้าม block ด้วย BP≥4000" เทิร์นนี้');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUnblockableBPMin = 4000; log(`${unit.card.name}: ${t.card.name} ไม่สามารถถูก block ด้วย character BP≥4000 เทิร์นนี้`); }
    },
  };

  // 086 Millay Ashford — buff another own character +1000 this turn.
  reg['CGH-1-086'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
  };

  // 087 Millay Ashford — [When Attacking] draw 1, discard 1.
  reg['CGH-1-087'] = {
    async onAttack(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 094 Ashford Academy (Field) — [Main][Rest] stand a Trait:Ashford Academy character played this turn.
  reg['CGH-1-094'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.traits || '').includes('Ashford Academy') && u.enteredTurn === Engine.G.turn);
      if (!targets.length) { p.controller.notify?.('ไม่มี character Trait:Ashford Academy ที่เพิ่งลงสนามเทิร์นนี้'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 097 Chess Match — retire enemy BP<=3000 (or <=5000 with 3+ own Event cards in Outside Area).
  reg['CGH-1-097'] = {
    async onEvent(G, p, card) {
      const n = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      await H.retireEnemyFront(p, n >= 3 ? 5000 : 3000);
    },
  };

  // 098 Horror House — retire enemy BP<=3000 (or <=5000 if opponent has 4 or less life).
  reg['CGH-1-098'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      await H.retireEnemyFront(p, enemy.life.length <= 4 ? 5000 : 3000);
    },
  };

  // 099 Giant Pizza — buff own character +1000; untap 1 AP.
  reg['CGH-1-099'] = {
    async onEvent(G, p, card) { await H.buffOwnCharacter(p, 1000); await H.apUntap(p, 1); },
  };

  // 100 Delivery Pizza — draw 1, discard 1; untap 1 AP.
  reg['CGH-1-100'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
      await H.apUntap(p, 1);
    },
  };

  // 102 C.C. — fetch a purple Character from Outside Area to hand.
  reg['CGH-1-102'] = {
    async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.color === 'Purple' && c.type === 'Character', `${unit.card.name}: เลือก Character สีม่วงจาก Outside Area`); },
  };

  // 103 Lelouch Lamperouge — bare enemy front -3000 BP.
  reg['CGH-1-103'] = { async onPlay(G, p, unit) { await H.debuffEnemyFront(p, -3000); } };

  // 108 Trailer (Field) — [Main][Rest] all Trait:The Order of the Black Knights +500 BP this turn.
  reg['CGH-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const n = massBuffTrait(p, 'The Order of the Black Knights', 500);
      log(`${unit.card.name}: Trait:The Order of the Black Knights ${n} ใบ +500 BP เทิร์นนี้`);
    },
  };

  // ---------- CGH-2 ----------

  // 003 C.C. — choose enemy front BP<=3000: bounce it, or retire instead if it was rested.
  reg['CGH-2-003'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (t.rested) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire (นอนอยู่)`); }
      else { await Engine.returnUnitToHand(enemy, t); log(`${unit.card.name}: ${t.card.name} ถูกส่งกลับมือ`); }
    },
  };

  // 005 C.C. — may discard 2 -> look top 3, add up to 2 to hand, remainder to bottom.
  reg['CGH-2-005'] = {
    async onPlay(G, p, unit) {
      if (p.hand.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้งการ์ด 2 ใบไป Outside Area เพื่อดูการ์ดบนสุด 3 ใบ?`,
        [{ label: 'ทิ้ง 2 ใบ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      await H.discardFromHand(p);
      await H.discardFromHand(p);
      await H.lookTopAndTake(p, 3, () => true, 2, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
    },
  };

  // 011 Rakshata Chawla — place a Trait:KMF card from Outside Area onto the top of the deck.
  reg['CGH-2-011'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && (c.traits || '').includes('KMF');
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:KMF จาก Outside Area วางบนเด็ค`, pred);
      if (idx == null) return;
      const no = p.sideline.splice(idx, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} ไว้บนสุดของเด็ค`);
    },
  };

  // 013 Lelouch Lamperouge — draw 1 if an opponent character is rested.
  reg['CGH-2-013'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if ([...enemy.front, ...enemy.energy].some(u => u.rested && u.card.type === 'Character')) {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 015 Rolo Lamperouge — [Main][Front][Rest] rest an enemy Front-Line character.
  reg['CGH-2-015'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.restEnemyFront(p);
    },
  };

  // 016 Rolo Lamperouge — may pay 1 AP -> retire an enemy character with a [Main] ability
  // (BP<=3000, generated energy<=1).
  reg['CGH-2-016'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable &&
        Effects.hasMain(u.card) && Engine.bp(u) <= 3000 && (u.card.gen || 0) <= 1);
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อ retire character ศัตรูที่มี [Main] (BP≤3000, gen≤1)?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, 'เลือก character ศัตรูให้ retire', true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 020 Tianzi — [On Play][Energy Line] stand if own Li Xingke/Shen Hu is on Front Line.
  // (The reactive "rest self to fetch a discarded card" ability isn't automated — needs a
  // watcher on ANY of your own Li Xingke/Shen Hu discard-effects, not just this card's own.)
  reg['CGH-2-020'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      if (p.front.some(u => (u.card.name || '').includes('Li Xingke') || (u.card.name || '').includes('Shen Hu'))) {
        unit.rested = false;
        log(`${unit.card.name}: Active ตัวเอง (มี Li Xingke/Shen Hu บน Front Line)`);
      }
    },
  };

  // 031 Ikaruga (Field) — [Main][Rest] buff a Trait:The Order Of The Black Knights character +500 this turn.
  reg['CGH-2-031'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('The Order Of The Black Knights'));
      if (!targets.length) { p.controller.notify?.('ไม่มี character Trait:The Order Of The Black Knights'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ +500 BP เทิร์นนี้');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
    },
  };

  // 034 Ward of Absolute Suspension — choose: rest enemy front (skip-next-stand + draw 1 if own
  // Rolo Lamperouge present), or retire a rested enemy Front-Line character.
  reg['CGH-2-034'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const restedFoe = enemy.front.some(u => u.rested && u.card.type === 'Character' && !u.kw.untargetable);
      const opts = [{ label: 'วางนอน character ศัตรู', value: 'rest' }];
      if (restedFoe) opts.push({ label: 'Retire character ศัตรูที่นอนอยู่', value: 'retire' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'retire') {
        const targets = enemy.front.filter(u => u.rested && u.card.type === 'Character' && !u.kw.untargetable);
        const uid = await p.controller.chooseEnemyCharacter(p, targets, 'เลือก character ศัตรูที่นอนอยู่ให้ retire', true);
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(enemy, t, 'effect');
      } else {
        const t = await H.restEnemyFront(p);
        if (t && H.hasCardNamed(p, 'Rolo Lamperouge')) { t.skipNextStand = true; log(`${card.name}: ${t.card.name} จะไม่ Active ครั้งถัดไป`); }
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 037 Locket — set a Rolo Lamperouge/Vincent active +1000 BP this turn; untap 1 AP if own
  // Lelouch/Shinkiro present. (Once-per-turn clause not enforced.)
  reg['CGH-2-037'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Rolo Lamperouge') || (u.card.name || '').includes('Vincent'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; t.bpMod += 1000; log(`${card.name}: ${t.card.name} Active +1000 BP เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Lelouch Lamperouge') || H.hasCardNamed(p, 'Shinkiro')) await H.apUntap(p, 1);
    },
  };

  // 038 Kozuki Kallen — draw 1; discount the next AP-cost-2 card from hand by 1 this turn.
  reg['CGH-2-038'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      p.pendingDiscount = { predicate: c => (c.ap || 0) === 2, apDelta: -1 };
      log(`${unit.card.name}: การ์ด AP2 ใบถัดไปลด AP 1 เทิร์นนี้`);
    },
  };

  // 042 Lelouch Lamperouge — choose 1 effect (may discard an AP2 card first to choose 2 instead):
  // enemy front -3000 BP, self-stand, or untap 1 AP. (unblockableBP4500 handled by kw already.)
  reg['CGH-2-042'] = {
    async onPlay(G, p, unit) {
      let picks = 1;
      const disc = p.hand.find(no => (byNo(no)?.ap || 0) === 2);
      if (disc != null) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้งการ์ด AP2 เพื่อเลือก effect 2 อย่าง?`,
          [{ label: 'ทิ้ง (เลือก 2 อย่าง)', value: true }, { label: 'ข้าม (เลือก 1 อย่าง)', value: false }]);
        if (v) { await H.discardFromHand(p, undefined); picks = 2; }
      }
      const done = new Set();
      for (let i = 0; i < picks; i++) {
        const opts = [];
        if (!done.has('debuff')) opts.push({ label: 'ศัตรู Front Line -3000 BP เทิร์นนี้', value: 'debuff' });
        if (!done.has('stand')) opts.push({ label: 'Active ตัวเอง', value: 'stand' });
        if (!done.has('ap')) opts.push({ label: 'ตั้ง AP กลับมา Active 1 ใบ', value: 'ap' });
        if (!opts.length) break;
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect (${i + 1}/${picks})`, opts);
        done.add(v);
        if (v === 'debuff') await H.debuffEnemyFront(p, -3000);
        else if (v === 'stand') { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
        else if (v === 'ap') await H.apUntap(p, 1);
      }
    },
  };

  // 049 Memories recovered — fetch a Character from Outside Area to hand.
  reg['CGH-2-049'] = { async onEvent(G, p, card) { await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก Character จาก Outside Area`); } };

  // 051 Schneizel el Britannia — buff another own character +500 per own Front-Line character this turn.
  reg['CGH-2-051'] = {
    async onPlay(G, p, unit) {
      const amt = p.front.filter(u => u.card.type === 'Character').length * 500;
      if (amt > 0) await H.buffOwnCharacter(p, amt, { excludeUnit: unit });
    },
  };

  // 055 Kururugi Suzaku — [When Attacking][1/turn] grant another Trait:Knights Of The Round [Damage +1] this turn.
  reg['CGH-2-055'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Knights Of The Round'));
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Trait:Knights Of The Round รับ [Damage +1] เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempDmg = (t.tempDmg || t.card.dmg || 1) + 1; log(`${unit.card.name}: ${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
    },
  };

  // 062 Anya Alstreim — [Your Turn] +1000 BP per Event card used this turn.
  reg['CGH-2-062'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (p._eventsUsedThisTurn || 0) * 1000;
    },
  };

  // 065 C.C. — passive +1 generated energy if 2+ Trait:Pizza cards in Outside Area.
  reg['CGH-2-065'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      return owner && owner.sideline.filter(no => (byNo(no)?.traits || '').includes('Pizza')).length >= 2 ? 1 : 0;
    },
  };

  // 068 Gino Weinberg — stand another own Front-Line character (BP<=3000).
  reg['CGH-2-068'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && u.card.type === 'Character' && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (BP≤3000) ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 069 Shirley Fenette — [Main][Rest][Retire], gated on 4+ Event cards in Outside Area: draw 2.
  reg['CGH-2-069'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const n = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      if (n < 4) { p.controller.notify?.('ต้องมี Event Card ใน Outside Area ≥4 ใบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 070 Lelouch Lamperouge — draw 1 if 2+ Event cards in Outside Area.
  reg['CGH-2-070'] = {
    async onPlay(G, p, unit) {
      const n = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      if (n >= 2) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ (Event Card ใน Outside Area ≥2)`); }
    },
  };

  // 072 Rolo Lamperouge — [When Attacking] buff a Lelouch/Rolo Lamperouge +1000 this turn.
  reg['CGH-2-072'] = {
    async onAttack(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Lelouch Lamperouge') || (u.card.name || '').includes('Rolo Lamperouge'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character รับ +1000 BP เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 073 Cupid's day — draw 1; untap 1 AP if own Lelouch Lamperouge and Shirley Fenette both present.
  reg['CGH-2-073'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (H.hasCardNamed(p, 'Lelouch Lamperouge') && H.hasCardNamed(p, 'Shirley Fenette')) await H.apUntap(p, 1);
    },
  };

  // ---------- promo / UAPR ----------

  // UAPR-CGH-P-001 Lelouch Lamperouge — [On Play] if opponent has a rested character, stand
  // another own character; [Main][1/turn] same gate: buff another own character +1000 this turn.
  reg['UAPR-CGH-P-001'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (![...enemy.front, ...enemy.energy].some(u => u.rested && u.card.type === 'Character')) return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const enemy = Engine.opponentOf(p);
      if (![...enemy.front, ...enemy.energy].some(u => u.rested && u.card.type === 'Character')) { p.controller.notify?.('ศัตรูต้องมี character นอนอยู่'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // UAPR-CGH-P-003 C.C. — passive +1500 BP if 4+ Trait:Pizza in Outside Area; [On Play] choose:
  // look top 7 fetch a Pizza card (discard 1 if added), or discard an Event card to draw 1.
  reg['UAPR-CGH-P-003'] = {
    bpBonus(p, unit) {
      return p.sideline.filter(no => (byNo(no)?.traits || '').includes('Pizza')).length >= 4 ? 1500 : 0;
    },
    async onPlay(G, p, unit) {
      const eventInHand = p.hand.some(no => byNo(no)?.type === 'Event');
      const opts = [{ label: 'ดูการ์ดบนสุด 7 ใบ หา Trait:Pizza', value: 'look' }];
      if (eventInHand) opts.push({ label: 'ทิ้ง Event Card จากมือ เพื่อจั่ว 1 ใบ', value: 'discard' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'discard') {
        const idx = p.hand.findIndex(no => byNo(no)?.type === 'Event');
        p.sideline.push(p.hand.splice(idx, 1)[0]);
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      } else {
        const taken = await H.lookTopAndTake(p, 7, c => (c.traits || '').includes('Pizza'), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      }
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Skipped / partially automated (documenting the gap rather than guessing):
  //  • 1-046 / Euphemia Li Britannia — grants teammates immunity from opponent's Event cards
  //    (field-wide targeting-protection aura; same class of gap as HTR/ARK's aura-immunity cards)
  //  • 2-020 Tianzi — reactive "rest self to fetch a card MY OTHER effects placed in Outside Area"
  //    (needs a broader own-side watcher, not just this card's own instance)
  // Both keep their base stats/keywords correct; only the bonus text above is unscripted.
  // ────────────────────────────────────────────────────────────────────────
})();
