// ══════════ UA SIM — Goddess of Victory: NIKKE (NIK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. This is an unusually large and
// combo-heavy series (158 cards); as with KMR, a higher skip ratio is accepted for multi-clause
// cards needing brand-new infra that would only ever serve 1-2 cards.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasName(p, name) { return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name)); }
  function countDistinctTrait(owner, trait) {
    return new Set([...owner.front, ...owner.energy].filter(u => (u.card.traits || '').includes(trait)).map(u => u.card.name)).size;
  }
  // this series' "rest 1 active Front Line character via your own card effect" synergy piece —
  // shared by the abilities that DO the resting (015/032) and the cards that react to it (013/022/023).
  async function restOwnFrontActive(p, { excludeUnit } = {}) {
    const targets = p.front.filter(u => !u.rested && u !== excludeUnit);
    if (!targets.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Front Line ให้วางนอน');
    const t = targets.find(x => x.uid === uid);
    if (t) { t.rested = true; t._restedByEffectTurn = Engine.G.turn; log(`${p.name}: ${t.card.name} ถูกวางนอน (โดยเอฟเฟกต์)`); }
    return t;
  }
  function frontRestedByEffectThisTurn(p) {
    return p.front.some(u => u._restedByEffectTurn === Engine.G.turn);
  }
  async function plantTopFacedown(p, unit) {
    if (!p.deck.length) return false;
    unit.counters.push(p.deck.shift());
    log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`);
    return true;
  }

  // 005 Neon — [Main][1/turn] only if you used an Event Card this turn: self +1000 BP this turn.
  reg['NIK-1-005'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 010 Rapi — [On Play] look at top 2, place any number on top (any order), remainder to the bottom.
  reg['NIK-1-010'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, null, revealed.length);
      const keepSet = new Set(keepIdxs);
      const keep = [], bottom = [];
      revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
      p.deck.unshift(...keep);
      p.deck.push(...bottom);
    },
  };

  // 013 Viper — [Main][1/turn] only if an active Front Line character was rested by your card
  // effect this turn: all enemy Front Line characters BP≥1000 get -500 BP this turn.
  reg['NIK-1-013'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!frontRestedByEffectThisTurn(p)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front.filter(x => x.card.type === 'Character' && Engine.bp(x) >= 1000)) u.bpMod -= 500;
      log(`${unit.card.name}: character ศัตรูบน Front Line ที่ BP≥1000 ทั้งหมด -500 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 014 Viper — [On Play] choose up to 1 own Trait:Exotic or Trait:Wardress card, move it to
  // another line.
  reg['NIK-1-014'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => /Exotic|Wardress/.test(u.card.traits || ''));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Exotic/Wardress`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 015 Viper — [On Play][When in Energy Line] free-play 1 Trait:Exotic/Wardress character
  // (BP≤3500, ap1) from hand active. @[Main][Rest][1/turn] rest 1 own active Front Line character;
  // if did, choose 1 own character [Damage +1] this turn, and all enemy Front Line characters
  // BP≥1000 get -500 BP this turn.
  reg['NIK-1-015'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && /Exotic|Wardress/.test(c.traits || '') && (c.bp || 0) <= 3500 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit.rested = true;
      const rested = await restOwnFrontActive(p, { excludeUnit: unit });
      if (!rested) return;
      unit._usedTurn = Engine.G.turn;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character รับ [Damage +1]`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempDmg = (t.kw.dmg || 1) + 1; log(`${unit.card.name}: ${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
      }
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front.filter(x => x.card.type === 'Character' && Engine.bp(x) >= 1000)) u.bpMod -= 500;
      log(`${unit.card.name}: character ศัตรูบน Front Line ที่ BP≥1000 ทั้งหมด -500 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 022 Jackal — [1/turn] when an active Front Line character is rested by your effect, self
  // +1000 BP this turn.
  reg['NIK-1-022'] = { bpBonus(p, unit) { return frontRestedByEffectThisTurn(p) ? 1000 : 0; } };

  // 023 Jackal — [Main][1/turn] only if an active Front Line character was rested by your card
  // effect this turn: set self active.
  reg['NIK-1-023'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!frontRestedByEffectThisTurn(p)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      log(`${unit.card.name}: Active`);
    },
  };

  // 028 "Anis Level Up!" — draw 1. This turn, reduce the AP cost of the next Anis you use from
  // your hand by 1.
  reg['NIK-1-028'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      p.pendingDiscount = { predicate: c => (c.name || '').includes('Anis'), apDelta: -1 };
      log(`${card.name}: การ์ด Anis ใบถัดไป ลด AP cost 1`);
    },
  };

  // 032 "Reward" — may rest 1 own active Trait:Exotic/Wardress character on your Front Line; if
  // did, draw 3.
  reg['NIK-1-032'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => !u.rested && /Exotic|Wardress/.test(u.card.traits || ''));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางนอน Trait:Exotic/Wardress เพื่อจั่ว 3 ใบ?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; t._restedByEffectTurn = Engine.G.turn;
      log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
    },
  };

  // 033 "The Weak and the Strong" — choose up to 1 enemy Front Line character, rest it (the next
  // time it would set to active it doesn't). If 3+ own Trait:Exotic on your area, choose up to 1
  // own character and set it active.
  reg['NIK-1-033'] = {
    async onEvent(G, p, card) {
      const t = await H.restEnemyFront(p, null);
      if (t) t.skipNextStand = true;
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Exotic')).length >= 3) {
        const targets = [...p.front, ...p.energy].filter(u => u.rested);
        if (targets.length) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ให้ Active`, true);
          const t2 = targets.find(x => x.uid === uid);
          if (t2) { t2.rested = false; log(`${card.name}: ${t2.card.name} เป็น Active`); }
        }
      }
    },
  };

  // 040 Dorothy — passive: if there are no [Trigger] cards on your area, +500 BP.
  reg['NIK-1-040'] = { bpBonus(p, unit) { return [...p.front, ...p.energy].every(u => !u.card.trigger) ? 500 : 0; } };

  // 041 Dorothy — passive: on your turn, if 4+ non-[Trigger] cards on your area, +1000 BP.
  // @[When Attacking] if enemy has 2+ [Trigger] cards on their area, choose up to 1 other own
  // character +500 BP this turn.
  reg['NIK-1-041'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return [...p.front, ...p.energy].filter(u => !u.card.trigger).length >= 4 ? 1000 : 0;
    },
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if ([...enemy.front, ...enemy.energy].filter(u => u.card.trigger).length >= 2) await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
    },
  };

  // 042/046 Dorothy/Noah — [Skipped]: "when a card without [Trigger] is placed from your Life Area
  // to the Outside Area, ..." — a reactive tied to the Trigger-check resolution pipeline
  // (dealDamage), which has no hook for "what happened to the revealed Life card afterward".

  // 048 Harran — [On Play] free-play 1 purple character without [Trigger] (need≤2, ap1) from hand rested.
  reg['NIK-1-048'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && !c.trigger && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 054 Snow White — [On Play] if you have ≤2 cards in hand, may draw 1.
  reg['NIK-1-054'] = {
    async onPlay(G, p, unit) {
      if (p.hand.length > 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 055 Snow White — [Main][Frontline][Discard2][1/turn] choose 1 enemy character (either line),
  // it loses all its effects this turn (approximated — printed duration is "until the start of
  // your next turn"). @[When Attacking] if hand≤2, may draw 1.
  reg['NIK-1-055'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.hand.length < 2) { p.controller.notify?.('ต้องมีการ์ดในมืออย่างน้อย 2 ใบ'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p); await H.discardFromHand(p);
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.effectsNullified = true; log(`${unit.card.name}: ${t.card.name} สูญเสีย effect ทั้งหมดเทิร์นนี้`); }
    },
    async onAttack(G, p, unit) {
      if (p.hand.length > 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 065 "Pilgrim" — [Skipped]: "at the end of this turn's Attack Phase, you may draw 3..." — the
  // end-of-Attack-Phase hook gap noted repeatedly this session.

  // 069 Alice — [When Attacking] may send 1 face-down card from under this character to the
  // Outside Area; if did, self +1000 BP this turn.
  reg['NIK-1-069'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area เพื่อ +1000 BP?`, [{ label: 'ส่ง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 073 Noir — [Main][Frontline][1/turn] place the top card of your deck face-down under this
  // character; if did, choose up to 2 own characters +500 BP this turn (all own characters instead
  // if own Blanc on area).
  reg['NIK-1-073'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!(await plantTopFacedown(p, unit))) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      if (hasName(p, 'Blanc')) { for (const u of [...p.front, ...p.energy]) u.bpMod += 500; log(`${unit.card.name}: character ทุกตัวของคุณ +500 BP เทิร์นนี้`); return; }
      for (let i = 0; i < 2; i++) {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (!targets.length) break;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (${i + 1}/2)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
      }
    },
  };

  // 074 Blanc — [On Play][When in Energy Line] if own Noir on area, set self active.
  // @[Main][Rest] choose 1 other own Trait:Tetra Line character, +500 BP this turn and place the
  // top card of your deck face-down under it.
  reg['NIK-1-074'] = {
    async onPlay(G, p, unit) { if (p.energy.includes(unit) && hasName(p, 'Noir')) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Tetra Line'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Tetra Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 500;
      log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`);
      await plantTopFacedown(p, t);
    },
  };

  // 075 Dolla — [On Play] choose up to 1 other own Trait:Tetra Line character, +500 BP this turn
  // and place the top card of your deck face-down under it.
  reg['NIK-1-075'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Tetra Line'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Tetra Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 500;
      log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`);
      await plantTopFacedown(p, t);
    },
  };

  // 076 Yan — [On Play] may place the top card of your deck face-down under a character on the
  // field; if did, draw 1.
  reg['NIK-1-076'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length || !p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ character?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await plantTopFacedown(p, t);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 077 Rupee — [When Attacking] may send a total of 2 face-down cards (from any own characters)
  // to the Outside Area; if did, choose up to 1 own Trait:Tetra Line card (other than Rupee) played
  // this turn, set it active.
  reg['NIK-1-077'] = {
    async onAttack(G, p, unit) {
      const holders = () => [...p.front, ...p.energy].filter(u => u.counters.length);
      if (holders().length < 1) return;
      const total = [...p.front, ...p.energy].reduce((s, u) => s + u.counters.length, 0);
      if (total < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ส่งการ์ดคว่ำรวม 2 ใบไป Outside Area?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 2; i++) {
        const hs = holders();
        if (!hs.length) break;
        const uid = await p.controller.chooseOwnCharacter(p, hs, `${unit.card.name}: เลือก character ที่มีการ์ดคว่ำ (${i + 1}/2)`, true);
        const h = hs.find(x => x.uid === uid) || hs[0];
        p.sideline.push(h.counters.shift());
      }
      log(`${unit.card.name}: ส่งการ์ดคว่ำ 2 ใบไป Outside Area`);
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested && (u.card.traits || '').includes('Tetra Line') && u.enteredTurn === Engine.G.turn);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Tetra Line ที่ลงเทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 085 Julia — when this character attacks and is not blocked, draw 1.
  reg['NIK-1-085'] = {
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); } },
  };

  // 087 Drake — [When Attacking] if 2+ own Trait:Missilis characters BP≥4000 on your Front Line,
  // look at top 3, place any number on top (any order), remainder to the bottom.
  reg['NIK-1-087'] = {
    async onAttack(G, p, unit) {
      if (p.front.filter(u => (u.card.traits || '').includes('Missilis') && Engine.bp(u) >= 4000).length < 2) return;
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`, null, revealed.length);
      const keepSet = new Set(keepIdxs);
      const keep = [], bottom = [];
      revealed.forEach((no, i) => (keepSet.has(i) ? keep : bottom).push(no));
      p.deck.unshift(...keep);
      p.deck.push(...bottom);
    },
  };

  // 088 Maxwell — [On Play] choose 1 other own character +1000 BP this turn.
  reg['NIK-1-088'] = { async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); } };

  // 089 Maxwell — [On Play] choose up to 1 other own character +3000 BP this turn; then if 2+
  // other own Trait:Missilis characters BP≥4000 on your Front Line, set self active.
  reg['NIK-1-089'] = {
    async onPlay(G, p, unit) {
      await H.buffOwnCharacter(p, 3000, { excludeUnit: unit });
      if (p.front.filter(u => u !== unit && (u.card.traits || '').includes('Missilis') && Engine.bp(u) >= 4000).length >= 2) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 094 Guilty — passive: on your turn, if another own Trait:Missilis character BP≥4000 is on
  // your Front Line, +1000 BP.
  reg['NIK-1-094'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.front.some(u => u !== unit && (u.card.traits || '').includes('Missilis') && Engine.bp(u) >= 4000) ? 1000 : 0;
    },
  };

  // 096 Arena (Field) — "Play this Field in active." (kw.entersActive, generic) @[1/turn] when
  // your character attacks and wins the battle, may rest this Field; if did, draw 1.
  reg['NIK-1-096'] = {
    async onAnyWinBattle(G, p, atk, enemyOwner, defender, self) {
      if (self.card.type !== 'Field' || self.rested || self._usedTurn === Engine.G.turn) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: วางนอนเพื่อจั่ว 1 ใบ?`, [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      self._usedTurn = Engine.G.turn;
      self.rested = true;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 097 "Alice and the Snow Queen" — choose 1 of: Trait:Tetra Line character +2000 BP and
  // [Impact +1] this turn; or choose a Trait:Tetra Line card, draw 1, place 1 card from hand
  // face-down under it and set it active (both effects instead, if own Alice on area).
  reg['NIK-1-097'] = {
    async onEvent(G, p, card) {
      const both = hasName(p, 'Alice');
      const doA = async () => {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Tetra Line'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Tetra Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; t.tempImpact += 1; log(`${card.name}: ${t.card.name} +2000 BP และ [Impact +1] เทิร์นนี้`); }
      };
      const doB = async () => {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Tetra Line'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Tetra Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
        if (p.hand.length) { const i = await p.controller.chooseCardFromHand(p, `${card.name}: เลือกการ์ดวางคว่ำใต้ ${t.card.name}`); if (i != null) { t.counters.push(p.hand.splice(i, 1)[0]); log(`${card.name}: วางการ์ดคว่ำใต้ ${t.card.name}`); } }
        t.rested = false;
        log(`${card.name}: ${t.card.name} เป็น Active`);
      };
      if (both) { await doA(); await doB(); return; }
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [{ label: '+2000 BP และ Impact+1', value: 'a' }, { label: 'จั่ว 1 + วางคว่ำ + Active', value: 'b' }]);
      if (v === 'a') await doA(); else await doB();
    },
  };

  // 099 "Just do as you're told." — retire 1 own character; if did, look at top 4, reveal up to 2
  // Trait:Missilis cards among them and add to hand, remainder to the bottom. Set 1 of your AP
  // cards active.
  reg['NIK-1-099'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ให้ retire`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          await Engine.sidelineUnit(p, t, 'effect');
          await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('Missilis'), 2, `${card.name}: ดูการ์ดบนสุด 4 ใบ`);
        }
      }
      await H.apUntap(p, 1);
    },
  };

  // 100 "Appearance of a Hero" — choose 1 enemy Front Line character BP≤2000 (or ≤5000 instead if
  // own Laplace) and retire it. If 5+ distinctly-named Trait:Missilis cards on your area, choose up
  // to 1 own character +1000 BP this turn.
  reg['NIK-1-100'] = {
    async onEvent(G, p, card) {
      const limit = hasName(p, 'Laplace') ? 5000 : 2000;
      await H.retireEnemyFront(p, limit);
      if (countDistinctTrait(p, 'Missilis') >= 5) await H.buffOwnCharacter(p, 1000);
    },
  };

  // 105 Rapi — [Main][Rest] draw 1, place 1 card from hand to Outside Area.
  reg['NIK-1-105'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 107 Anis — [On Play] choose up to 1 enemy Front Line character, rest it (the next time it
  // would set to active it doesn't). If you used an Event Card this turn, set self active.
  reg['NIK-1-107'] = {
    async onPlay(G, p, unit) {
      const t = await H.restEnemyFront(p, null);
      if (t) t.skipNextStand = true;
      if (p._eventsUsedThisTurn) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 108 Ark (Field) — [On Play] may place 1 card from hand to Outside Area; if did, draw 2.
  // @[Main][Rest][1/turn] place the top card of your deck to the Outside Area.
  reg['NIK-1-108'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      const no = p.deck.shift();
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`);
    },
  };

  // 110 Guren — passive: on your turn, if hand≤2, +1000 BP. @[When Attacking] choose up to 1 enemy
  // Front Line character -1000 BP this turn; place 1 card from hand to Outside Area.
  reg['NIK-1-110'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p.hand.length <= 2) ? 1000 : 0; },
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
      }
      await H.discardFromHand(p);
    },
  };

  // 111 Snow White — [Main][Discard1][1/turn] self +1000 BP this turn. @[When Attacking] if
  // hand=0, look at the top card of your deck, place it on top or to the Outside Area.
  reg['NIK-1-111'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onAttack(G, p, unit) { if (!p.hand.length) await H.scryTop(p, ['top', 'outside']); },
  };

  // PC02BT-NIK-2-002 Blue Ocean — "also treated as a Neon" (kw.alsoTreatedAs, generic). Passive:
  // on your turn, if you used an Event Card this turn, +1000 BP. When this character attacks and
  // is not blocked, draw 1.
  reg['PC02BT-NIK-2-002'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._eventsUsedThisTurn) ? 1000 : 0; },
    async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); } },
  };

  // PC02BT-NIK-2-003 Marian — [On Play][When in Energy Line] set self active. @[Main][Rest] only
  // if you used a Memory card this turn: choose 1 of 2 effects (cannot repeat the same choice
  // twice this turn).
  reg['PC02BT-NIK-2-003'] = {
    async onPlay(G, p, unit) { if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p._playedTraitsThisTurn?.has('memory')) { p.controller.notify?.('ต้องใช้การ์ด Memory มาก่อน'); return; }
      unit._chosenThisTurn ||= new Set();
      if (unit._usedTurnKey !== Engine.G.turn) { unit._chosenThisTurn.clear(); unit._usedTurnKey = Engine.G.turn; }
      const opts = [];
      if (!unit._chosenThisTurn.has('a')) opts.push({ label: 'Trait:Counters +2000 BP เทิร์นนี้', value: 'a' });
      if (!unit._chosenThisTurn.has('b')) opts.push({ label: 'ศัตรู BP≥2500 -2000 BP เทิร์นนี้', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ใช้ตัวเลือกครบแล้วเทิร์นนี้'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      unit._chosenThisTurn.add(v);
      if (v === 'a') {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Counters'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Counters`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      } else {
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 2500);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥2500)`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod -= 2000; log(`${unit.card.name}: ${t.card.name} -2000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
      }
    },
  };

  // PC02BT-NIK-2-004 Rapi — passive: on your turn, if you used an Event Card this turn, +1000 BP.
  // (Skipped: "when this character is raided on, if there's a face-down card under it, draw 1" —
  // by the time `onRaided` fires the raider has already replaced this unit in the line, and any
  // face-down cards this card itself carried were already flushed to the Outside Area by
  // `raidCard`'s own counters-dump step before the hook runs, so there is nothing left to check.)
  reg['PC02BT-NIK-2-004'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._eventsUsedThisTurn) ? 1000 : 0; },
  };

  // PC02BT-NIK-2-010 Grave — [On Play] if played from hand, may pay 1 AP; if did, draw 1.
  // (Skipped: the "discard a Cinderella to the Remove Area, activate its [Trigger]" clause — a
  // manual-trigger-activation mechanic on an arbitrary hand card outside the normal Life-damage
  // trigger-check flow, no supporting hook.)
  reg['PC02BT-NIK-2-010'] = {
    async onPlay(G, p, unit) {
      if (unit._playedByEffect) return;
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อจั่ว 1 ใบ?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (v && Engine.payAP(p, 1)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // PC02BT-NIK-2-012 Cinderella — [On Play] look at top 2, place up to 1 to the Remove Area,
  // remainder back on top.
  reg['PC02BT-NIK-2-012'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, null, 1);
      if (picked.length) { const no = revealed.splice(picked[0], 1)[0]; p.removal.push(no); log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Removal Area`); }
      p.deck.unshift(...revealed);
    },
  };

  // PC02BT-NIK-2-013 Cinderella — [On Play] if 3+ cards in your Remove Area, draw 1.
  reg['PC02BT-NIK-2-013'] = { async onPlay(G, p, unit) { if (p.removal.length >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // PC02BT-NIK-2-018 "Inheritance" — look at top 2, place any number on top (any order), remainder
  // to the Outside Area. May free-play 1 Rapi (need≤2) from Outside Area to your area active; if
  // did, that Rapi +2500 BP this turn. (Skipped: "place this card face-down under that Rapi" — the
  // event would need to be diverted from its normal post-resolution sideline-push, not supported.)
  reg['PC02BT-NIK-2-018'] = {
    async onEvent(G, p, card) {
      const n = Math.min(2, p.deck.length);
      if (n) {
        const revealed = p.deck.splice(0, n);
        const keepIdxs = await p.controller.chooseRevealPick(p, revealed, `${card.name}: ดูการ์ดบนสุด 2 ใบ`, null, revealed.length);
        const keepSet = new Set(keepIdxs);
        const keep = [], outside = [];
        revealed.forEach((no, i) => (keepSet.has(i) ? keep : outside).push(no));
        p.deck.unshift(...keep);
        p.sideline.push(...outside);
        p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + outside.length;
      }
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Rapi') && (c.need || 0) <= 2; });
      if (idx < 0) return;
      const no = p.sideline[idx];
      const v = await p.controller.chooseOption(p, `${card.name}: ลง ${byNo(no)?.name} แบบ Active?`, [{ label: 'ลง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.splice(idx, 1);
      const u = await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: true });
      if (u) { u.bpMod += 2500; log(`${card.name}: ${u.card.name} +2500 BP เทิร์นนี้`); }
    },
  };

  // PC02BT-NIK-2-019 Dorothy — [On Play] only if 6+ non-[Trigger] cards on your area: set self
  // active. @[On Retire] may place 1 non-[Trigger] card from hand to Outside Area; if did, choose
  // up to 1 [Trigger] enemy Front Line character and rest it.
  reg['PC02BT-NIK-2-019'] = {
    async onPlay(G, p, unit) {
      if ([...p.front, ...p.energy].filter(u => !u.card.trigger).length >= 6) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
    async onSideline(G, p, unit) {
      const idx = p.hand.findIndex(no => !byNo(no)?.trigger);
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && u.card.trigger && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูที่มี Trigger`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // PC02BT-NIK-2-020 Crown — [On Play] look at top 2, place up to 1 Trait:Weissritter/Pioneer or
  // named Modernia to the Outside Area, remainder back on top.
  reg['PC02BT-NIK-2-020'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => /Weissritter|Pioneer/.test(c.traits || '') || (c.name || '').includes('Modernia'));
    },
  };

  // PC02BT-NIK-2-023 Trombe — [On Play] only if own Crown on area: choose 1 of: draw 1, place 1
  // card from hand to Outside Area; or if you placed a card to Outside Area by your own effect
  // this turn, draw 1.
  reg['PC02BT-NIK-2-023'] = {
    async onPlay(G, p, unit) {
      if (!hasName(p, 'Crown')) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'a' }, { label: 'จั่ว 1 ใบ (ถ้าวางการ์ดไป Outside Area แล้วเทิร์นนี้)', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else if (p._placedToOutsideThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // PC02BT-NIK-2-033 Red Hood — [On Play] choose up to 1 [Trait: Goddess] character +1000 BP this
  // turn. (Skipped: the "played by the effect of your Red Hood → +2000 instead" upgrade — no
  // in-scope source ability tags units with "played specifically by Red Hood's effect", so this
  // upgrade branch is left as the safer under-grant baseline.)
  reg['PC02BT-NIK-2-033'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Goddess'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Goddess`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // PC02BT-NIK-2-034 Red Hood — [On Play] may return 1 other Trait:Goddess (need≤3) to hand; if
  // did, choose up to 1 Trait:Goddess character +1000 BP this turn. (Skipped: the "played by Red
  // Hood" upgrade branch, same as -033.)
  reg['PC02BT-NIK-2-034'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Goddess') && (u.card.need || 0) <= 3);
      if (targets.length) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน Trait:Goddess (Energy≤3) กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
        if (v) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
          const t = targets.find(x => x.uid === uid);
          if (t) { await Engine.returnUnitToHand(p, t); log(`${unit.card.name}: ${t.card.name} กลับมือ`); }
        }
      }
      const buffTargets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Goddess'));
      if (!buffTargets.length) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, buffTargets, `${unit.card.name}: เลือก Trait:Goddess รับ BP`, true);
      const t2 = buffTargets.find(x => x.uid === uid2);
      if (t2) { t2.bpMod += 1000; log(`${unit.card.name}: ${t2.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // PC02BT-NIK-2-035 Red Hood — passive: if 3+ other distinctly-named Trait:Goddess characters on
  // your area, +1 generated energy. (Skipped: the "played by Red Hood" conditional grant, same
  // reason as -033/-034.)
  reg['PC02BT-NIK-2-035'] = {
    genMod(unit, p) {
      const names = new Set([...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Goddess')).map(u => u.card.name));
      return names.size >= 3 ? 1 : 0;
    },
  };

  // PC02BT-NIK-2-042 Blanc — [On Play] choose 1 of: if 2+ face-down cards under your own
  // characters, draw 1; or may send 1 face-down card from your area to the Outside Area, if did,
  // choose up to 1 Trait:Tetra Line character +1500 BP this turn.
  reg['PC02BT-NIK-2-042'] = {
    async onPlay(G, p, unit) {
      const total = [...p.front, ...p.energy].reduce((s, u) => s + u.counters.length, 0);
      const opts = [];
      if (total >= 2) opts.push({ label: 'จั่ว 1 ใบ (มีการ์ดคว่ำ 2+ ใบ)', value: 'a' });
      const holders = [...p.front, ...p.energy].filter(u => u.counters.length);
      if (holders.length) opts.push({ label: 'ส่งการ์ดคว่ำไป Outside Area', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); return; }
      const uid = await p.controller.chooseOwnCharacter(p, holders, `${unit.card.name}: เลือก character ที่มีการ์ดคว่ำ`, true);
      const h = holders.find(x => x.uid === uid) || holders[0];
      p.sideline.push(h.counters.shift());
      log(`${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Tetra Line'));
      if (!targets.length) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Tetra Line`, true);
      const t = targets.find(x => x.uid === uid2);
      if (t) { t.bpMod += 1500; log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
    },
  };

  // PC02BT-NIK-2-043 Rouge — passive: if a face-down card is under this character, +1 generated
  // energy. @[Main][Rest][1/turn] place the top card of your deck face-down under this character.
  reg['PC02BT-NIK-2-043'] = {
    genMod(unit) { return unit.counters.length ? 1 : 0; },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!(await plantTopFacedown(p, unit))) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
    },
  };

  // PC02BT-NIK-2-046 Tia — [On Play] choose up to 1 other own Trait:Missilis character +1000 BP this turn.
  reg['PC02BT-NIK-2-046'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Missilis'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Missilis`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // PC02BT-NIK-2-047 Naga — [On Play] look at the top (1 + 1 per own Trait:Missilis character
  // BP≥4000 on your Front Line) cards, place up to 1 among them on top of your deck, remainder to
  // the bottom.
  reg['PC02BT-NIK-2-047'] = {
    async onPlay(G, p, unit) {
      const bonus = p.front.filter(u => (u.card.traits || '').includes('Missilis') && Engine.bp(u) >= 4000).length;
      const n = Math.min(1 + bonus, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด ${n} ใบ`, null, 1);
      const keep = [], bottom = [];
      revealed.forEach((no, i) => (picked.includes(i) ? keep : bottom).push(no));
      p.deck.unshift(...keep);
      p.deck.push(...bottom);
    },
  };

  // UAPR-NIK-P-002 Rapunzel — [Skipped]: "when this card is placed from your hand to the Outside
  // Area, ..." — a hand-level reactive with no supporting hook (the card is still inert in hand
  // when this would need to fire), same gap noted for HIQ-1-042/YYH-1-014.

  // UAPR-NIK-P-003 Elegg — [On Play] if there's a character BP≥4000 on your opponent's area, this
  // turn reduce the AP cost of the next Trait:Missilis card you use from hand by 1.
  reg['UAPR-NIK-P-003'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (![...enemy.front, ...enemy.energy].some(u => Engine.bp(u) >= 4000)) return;
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Missilis'), apDelta: -1 };
      log(`${unit.card.name}: การ์ด Trait:Missilis ใบถัดไป ลด AP cost 1`);
    },
  };
})();
