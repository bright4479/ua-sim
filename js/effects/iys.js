// ══════════ UA SIM — Inuyasha (IYS) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }

  // 001 A-Un — [On Play] choose up to 1 character without a Trait on your area and move it to
  // another line.
  reg['UA50BT-IYS-1-001'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => !(u.card.traits || '').trim());
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (ไม่มี Trait)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 007 Sesshomaru — [When Attacking] if a character was played from your Outside Area this turn,
  // draw up to 1.
  reg['UA50BT-IYS-1-007'] = { async onAttack(G, p, unit) { if (p._playedFromSidelineThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 010 Sesshomaru's Mother — [On Play] add up to 1 purple Character without a Trait (need<=4)
  // from your Outside Area to your hand.
  reg['UA50BT-IYS-1-010'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Purple' && !(c.traits || '').trim() && (c.need || 0) <= 4, `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 013 Rin — passive: if there is a Sesshomaru on your Front Line, +1 generated energy. @[On Play]
  // if this character was played from your Outside Area, choose up to 1 Sesshomaru and set it active.
  reg['UA50BT-IYS-1-013'] = {
    genMod(unit, p) { return p.front.some(u => (u.card.name || '').includes('Sesshomaru')) ? 1 : 0; },
    async onPlay(G, p, unit) {
      if (!unit._playedFromSideline) return;
      const targets = [...p.front, ...p.energy].filter(u => u.rested && (u.card.name || '').includes('Sesshomaru'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Sesshomaru`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 014 Akago — [On Retire] look at the top 3, reveal up to 1 Trait:Naraku Faction card and add it
  // to hand, remainder to the bottom.
  reg['UA50BT-IYS-1-014'] = { async onSideline(G, p, unit) { await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Naraku Faction'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 019 Kagura — [On Play] free-play 1 purple Character (need<=2, ap1) from your Outside Area
  // rested, gaining "at the end of your Main Phase, retire this character" this turn.
  reg['UA50BT-IYS-1-019'] = {
    async onPlay(G, p, unit) {
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const t = await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      if (t) { t.retireAtEndOfMain = true; log(`${unit.card.name}: ${t.card.name} จะ retire ตัวเองตอนจบ Main Phase`); }
    },
  };

  // 023 Goshinki — [Your Turn] if a character was retired this turn, +1000 BP.
  reg['UA50BT-IYS-1-023'] = { bpBonus(p, unit) { return (isYourTurn(p) && Engine.G.retiredThisTurn > 0) ? 1000 : 0; } };

  // 024 Kohaku — [On Retire] add this card to your hand.
  reg['UA50BT-IYS-1-024'] = {
    async onSideline(G, p, unit) {
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
    },
  };

  // 031 Byakuya of the Dreams — [On Retire] place up to 2 cards from the top of your deck to the
  // Outside Area.
  reg['UA50BT-IYS-1-031'] = {
    async onSideline(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const sent = p.deck.splice(0, n);
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
  };

  // 032 Kanna's Mirror (Field) — [Main][Rest] place 1 (Trait:Naraku Faction or Shards of the
  // Shikon no Tama) from your Outside Area face-down under 1 Naraku on your area.
  reg['UA50BT-IYS-1-032'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Naraku') && !(u.card.name || '').includes('Naraku Faction'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      if (!p.sideline.some(no => { const c = byNo(no); return c && ((c.traits || '').includes('Naraku Faction') || (c.name || '').includes('Shards of the Shikon no Tama')); })) { p.controller.notify?.('ไม่มีการ์ดใน Outside Area'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Naraku`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือกการ์ดจาก Outside Area`, c => c && ((c.traits || '').includes('Naraku Faction') || (c.name || '').includes('Shards of the Shikon no Tama')));
      if (idx == null) return;
      const no = p.sideline.splice(idx, 1)[0];
      t.counters.push(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} คว่ำใต้ ${t.card.name}`);
    },
  };

  // 033 "The most fierce Victory" — draw 2. If there is a Naraku on your area, your opponent places
  // 2 Event cards from their Outside Area at the bottom of their deck (their own choice).
  reg['UA50BT-IYS-1-033'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (!H.hasCardNamed(p, 'Naraku')) return;
      const enemy = Engine.opponentOf(p);
      for (let i = 0; i < 2; i++) {
        const idx = await enemy.controller.chooseCardFromSideline(enemy, `${card.name}: ฝ่ายตรงข้ามเลือก Event Card จาก Outside Area ไปล่างสุดเด็ค`, c => c && c.type === 'Event');
        if (idx == null) break;
        enemy.deck.push(enemy.sideline.splice(idx, 1)[0]);
      }
    },
  };

  // 035 "Miasma" — choose 1 enemy Front Line character, -1000 BP for each Trait:Naraku Faction
  // card on your area this turn.
  reg['UA50BT-IYS-1-035'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Naraku Faction')).length;
      if (!n) return;
      await H.debuffEnemyFront(p, -1000 * n, {});
    },
  };

  // 039 "Fusion" — usable only if there is a character on your area. Untap 1 AP. Draw 2. Retire 1
  // character on your area. (Skipped: "you may place this card face-down under a Naraku" — same
  // engine limitation as CSM-076/MGS's resolved-Event-card-as-counter cases.)
  reg['UA50BT-IYS-1-039'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      await H.apUntap(p, 1);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character retire`);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(p, t, 'effect'); log(`${card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 045 Inuyasha — [When Attacking] if this character's BP is 4000 or more, draw 1. (Skipped: the
  // [Main][1/turn] "changed active to rest by your effect" gate — the recurring tracker gap.)
  reg['UA50BT-IYS-1-045'] = { async onAttack(G, p, unit) { if (Engine.bp(unit) >= 4000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 051 kirara — [Your Turn] if your Sango has attacked this turn, +1000 BP.
  reg['UA50BT-IYS-1-051'] = { bpBonus(p, unit) { return (isYourTurn(p) && [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Sango') && u.attackedThisTurn > 0)) ? 1000 : 0; } };

  // 054 Koga — [On Play] if there is a Kagome Higurashi on your area, you may set this character
  // active; if you did, it gains "at the end of your Attack Phase, if its BP is 4000 or less,
  // return it to your hand" this turn.
  reg['UA50BT-IYS-1-054'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Kagome Higurashi')) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ตั้งเป็น Active?`, [{ label: 'Active', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.rested = false; log(`${unit.card.name}: Active`);
      unit._returnIfWeakTurn = Engine.G.turn;
    },
    async onAttackPhaseEnd(G, p, unit) {
      if (unit._returnIfWeakTurn !== Engine.G.turn) return;
      unit._returnIfWeakTurn = null;
      if (Engine.bp(unit) <= 4000) { await Engine.returnUnitToHand(p, unit); log(`${unit.card.name}: กลับมือ`); }
    },
  };

  // 056 Sango — [On Play] look at the top 2, place up to 1 red Event card among them to the
  // Outside Area, remainder to the top.
  reg['UA50BT-IYS-1-056'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.type === 'Event' && c.color === 'Red'); } };

  // 062 Totosai — [On Play] add up to 1 red Event card from your Outside Area to your hand.
  reg['UA50BT-IYS-1-062'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.type === 'Event' && c.color === 'Red', `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 074 "Sit" — usable only if there is a Kagome Higurashi on your area. Draw 1. Choose up to 1
  // Inuyasha, +1000 BP this turn. You may rest 1 active Inuyasha on your Front Line; if you did,
  // untap 1 AP.
  reg['UA50BT-IYS-1-074'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Kagome Higurashi')) return;
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Inuyasha'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Inuyasha`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      }
      const restTargets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Inuyasha'));
      if (!restTargets.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางนอน Inuyasha บน Front Line?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid2 = await p.controller.chooseOwnCharacter(p, restTargets, 'เลือก Inuyasha');
      const t2 = restTargets.find(x => x.uid === uid2);
      if (t2) { t2.rested = true; log(`${card.name}: ${t2.card.name} ถูกวางนอน`); await H.apUntap(p, 1); }
    },
  };

  // 075 "I have to be strong" — choose up to 1 character, +2000 BP this turn. If there is a Shippo
  // on your area, untap 1 AP.
  reg['UA50BT-IYS-1-075'] = { async onEvent(G, p, card) { await H.buffOwnCharacter(p, 2000); if (H.hasCardNamed(p, 'Shippo')) await H.apUntap(p, 1); } };
})();
