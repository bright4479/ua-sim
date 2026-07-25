// ══════════ UA SIM — Tekken (TKN) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  async function lookTopSplitTopBottom(p, n, title) {
    n = Math.min(n, p.deck.length);
    if (!n) return;
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title, null, n);
    const toBottom = [];
    picked.sort((a, b) => b - a).forEach(i => { toBottom.push(revealed.splice(i, 1)[0]); });
    p.deck.unshift(...revealed);
    p.deck.push(...toBottom);
    log(`${p.name}: จัดเรียงการ์ดบนสุด ${n} ใบ`);
  }

  // 001 ARMOR KING — [On Play] declare a required energy number. Reveal the top card of your deck.
  // If it matches, choose up to 1 enemy Front Line character and rest it. Place the revealed card
  // on top or the bottom of your deck.
  reg['TKN-1-001'] = {
    async onPlay(G, p, unit) {
      const declared = await p.controller.chooseOption(p, `${unit.card.name}: ประกาศตัวเลข required energy`, [0, 1, 2, 3, 4, 5, 6].map(n => ({ label: `${n}`, value: n })));
      if (!p.deck.length) return;
      const c = byNo(p.deck[0]);
      log(`${unit.card.name}: เปิดเจอ ${c?.name}`);
      if (c && (c.need || 0) === declared) await H.restEnemyFront(p);
      const dest = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดที่เปิดไว้ที่ไหน?`, [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      const no = p.deck.shift();
      if (dest === 'bottom') p.deck.push(no); else p.deck.unshift(no);
    },
  };

  // 005 KING — [On Play] look at the top 2, split any between top and bottom.
  reg['TKN-1-005'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 009 SERGEI DRAGUNOV — [Main][1/turn] place 1 card from hand on top of your deck; if you did,
  // +1000 BP until the start of your next Start Phase.
  reg['TKN-1-009'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือไปบนสุดของเด็ค`);
      if (i == null) return;
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: ${byNo(no)?.name} จากมือไปบนสุดของเด็ค`);
      unit.bpPersist += 1000; log(`${unit.card.name}: +1000 BP จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 011 BOB — [On Play] if there is an enemy Front Line character with BP lower than its printed
  // BP, set this character active.
  reg['TKN-1-011'] = { async onPlay(G, p, unit) { const enemy = Engine.opponentOf(p); if (enemy.front.some(u => u.card.bp != null && Engine.bp(u) < u.card.bp)) { unit.rested = false; log(`${unit.card.name}: Active`); } } };

  // 022 ALISA BOSCONOVITCH — [On Play] choose up to 1 other Trait:Violet Systems, +1000 BP until
  // the start of your next turn.
  reg['TKN-1-022'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Violet Systems'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Violet Systems`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpPersist += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP จนถึงต้นเทิร์นหน้า`); }
    },
  };

  // 030 VIOLET SYSTEMS (Field) — [On Play] free-play 1 Trait:Violet Systems (need<=2, ap1) from
  // hand rested.
  reg['TKN-1-030'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Violet Systems') && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 032 "Eliminate!" — choose 1 enemy Front Line character with BP <= (Trait:Violet Systems on your
  // area x1000) and retire it.
  reg['TKN-1-032'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Violet Systems')).length; await H.retireEnemyFront(p, n * 1000); } };

  // 033 "(Pro wrestling is the best!)" — choose 1 enemy Front Line character with BP 5000 or less,
  // move it to the Energy Line and it cannot move until the start of your next turn. If 4+
  // characters with different names on your area, look at the top 2, split any between top/bottom.
  reg['TKN-1-033'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          await Engine.moveUnitFree(enemy, t, 'energy');
          t.tempCannotMove = true;
          Engine.scheduleDelayedAction(Engine.G.turn + 2, () => { t.tempCannotMove = false; });
          log(`${card.name}: ${t.card.name} ย้ายไป Energy Line และห้ามย้ายจนถึงต้นเทิร์นหน้าของคุณ`);
        }
      }
      if (new Set([...p.front, ...p.energy].map(u => u.card.name)).size >= 4) await lookTopSplitTopBottom(p, 2, `${card.name}: ดูการ์ดบนสุด 2 ใบ`);
    },
  };

  // 034 "Aim for the prize!" — look at the top 3, split any between top and bottom. Draw 1.
  reg['TKN-1-034'] = { async onEvent(G, p, card) { await lookTopSplitTopBottom(p, 3, `${card.name}: ดูการ์ดบนสุด 3 ใบ`); Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); } };

  // 035 ELIZA — [When Attacking] you may draw 1; if you did, this character won't stand next time.
  reg['TKN-1-035'] = {
    async onAttack(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.skipNextStand = true;
    },
  };

  // 037 ASUKA KAZAMA — passive: if this character moved this turn, +1000 BP.
  reg['TKN-1-037'] = { bpBonus(p, unit) { return unit._movedThisTurn ? 1000 : 0; } };

  // 038 ASUKA KAZAMA — passive: +1000 BP for each time this character moved this turn. If its BP
  // is 4000 or more, it gains "[When Attacking] draw 1".
  reg['TKN-1-038'] = {
    bpBonus(p, unit) { return (unit._moveCountThisTurn || 0) * 1000; },
    async onAttack(G, p, unit) { if (Engine.bp(unit) >= 4000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 041 ZAFINA — [On Retire] if it's your turn, choose up to 1 enemy Front Line character, -2000
  // BP (approximated as lasting the rest of this turn — the printed text omits a duration).
  reg['TKN-1-041'] = { async onSideline(G, p, unit) { if (isYourTurn(p)) await H.debuffEnemyFront(p, -2000); } };

  // 044 STEVE FOX — [On Play] you may pay 1 AP; if you did, choose up to 1 enemy Front Line
  // character with BP 4500 or higher and retire it.
  reg['TKN-1-044'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 4500);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 052 LILI — [When Attacking Phase end] choose this character and another character on a
  // different line, you may swap positions.
  reg['TKN-1-052'] = {
    async onAttackPhaseEnd(G, p, unit) {
      const otherLine = p.front.includes(unit) ? p.energy : p.front;
      if (!otherLine.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: สลับตำแหน่งกับ character อีก line?`, [{ label: 'สลับ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, otherLine, `${unit.card.name}: เลือก character`);
      const t = otherLine.find(x => x.uid === uid);
      if (!t) return;
      const ownLine = p.front.includes(unit) ? p.front : p.energy;
      const oi = ownLine.indexOf(unit), ti = otherLine.indexOf(t);
      ownLine[oi] = t; otherLine[ti] = unit;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
  };

  // 054 KUMA — [Your Turn] if 10+ cards in your Outside Area, +1000 BP. @[On Play] +2000 BP until
  // the start of your next Start Phase.
  reg['TKN-1-054'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p.sideline.length >= 10) ? 1000 : 0; },
    async onPlay(G, p, unit) { unit.bpPersist += 2000; log(`${unit.card.name}: +2000 BP จนถึงต้นเทิร์นหน้า`); },
  };

  // 058 NINA WILLIAMS — [Your Turn] if a character was retired this turn, +1000 BP (approximated
  // via the global retired-this-turn counter, not scoped to only your own area).
  reg['TKN-1-058'] = { bpBonus(p, unit) { return (isYourTurn(p) && Engine.G.retiredThisTurn > 0) ? 1000 : 0; } };

  // 061 HEIHACHI MISHIMA — [On Play] you may retire 1 other character; if you did, free-play up to
  // 1 Character (need<=2, ap1) from hand rested (set active if it has Trait:Mishima Zaibatsu).
  reg['TKN-1-061'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่น?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const active = (byNo(p.hand[idx])?.traits || '').includes('Mishima Zaibatsu');
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active });
    },
  };

  // 065 "Breaking with the past" — retire 1 character; if you did, untap 1 AP, draw 2.
  reg['TKN-1-065'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character retire`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${card.name}: ${t.card.name} ถูก retire`);
      await H.apUntap(p, 1);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 077 HWOARANG — [On Retire] free-play 1 red Character (other than this card, need<=3, ap1) from
  // hand rested.
  reg['TKN-1-077'] = { async onSideline(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && c.name !== 'HWOARANG' && (c.need || 0) <= 3 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 081 KAZUMI MISHIMA — [On Play] you may retire 1 other character; if you did, draw 1 and
  // free-play 1 red Character (need<=3, ap1) from hand rested.
  reg['TKN-1-081'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character อื่น?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 089/106 KAZUYA MISHIMA — passive: +500 BP for each (or per 2, on the -106 print) face-down
  // card under this character. @[On Play] you may place the top card of your deck face-down under
  // this character.
  reg['TKN-1-089'] = {
    bpBonus(p, unit) { return (unit.counters.length) * 500; },
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ตัวเอง?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ตัวเอง`);
    },
  };
  reg['TKN-1-106'] = {
    bpBonus(p, unit) { return unit.counters.length >= 2 ? 500 : 0; },
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ตัวเอง?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ตัวเอง`);
    },
  };

  // 096 G CORPORATION (Field) — [Main][Rest][1/turn] draw 1, place 1 card from hand to the Outside
  // Area or face-down under a Trait:G Corporation character on your Front Line.
  reg['TKN-1-096'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const targets = p.front.filter(u => (u.card.traits || '').includes('G Corporation'));
      const opts = [{ label: 'วางไป Outside Area', value: 'a' }];
      if (targets.length) opts.push({ label: 'วางคว่ำใต้ Trait:G Corporation', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือกที่วางการ์ด`, opts);
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ`);
      if (i == null) return;
      if (v === 'b') {
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:G Corporation');
        const t = targets.find(x => x.uid === uid);
        if (t) { const no = p.hand.splice(i, 1)[0]; t.counters.push(no); log(`${unit.card.name}: วางคว่ำใต้ ${t.card.name}`); }
      } else { const no = p.hand.splice(i, 1)[0]; p.sideline.push(no); log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`); }
    },
  };

  // 098 "Raid" — draw 1, choose up to 1 character and set it active. If it has Trait:G
  // Corporation, you may place the top card of your deck face-down under it.
  reg['TKN-1-098'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = false; log(`${card.name}: ${t.card.name} Active`);
      if ((t.card.traits || '').includes('G Corporation') && p.deck.length) {
        const v = await p.controller.chooseOption(p, `${card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ ${t.card.name}?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { t.counters.push(p.deck.shift()); log(`${card.name}: วางการ์ดคว่ำใต้ ${t.card.name}`); }
      }
    },
  };

  // 101 JIN KAZAMA — [On Play] free-play 1 red Character without a trait (need<=2, ap1) from hand
  // rested.
  reg['TKN-1-101'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && !(c.traits || '').trim() && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 108 "GET READY FOR THE NEXT BATTLE" (Field) — [Main][Rest+Retire] untap 1 AP, draw 1.
  reg['TKN-1-108'] = { async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); await H.apUntap(p, 1); Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };
})();
