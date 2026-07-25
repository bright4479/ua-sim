// ══════════ UA SIM — Blue Archive (BAC) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  async function unraidTopLayerToHand(owner, unit) {
    if (!unit.under.length) return null;
    const lineArr = owner.front.includes(unit) ? owner.front : owner.energy;
    const idx = lineArr.indexOf(unit);
    if (idx < 0) return null;
    const newNo = unit.under.shift();
    owner.hand.push(unit.no);
    const newUnit = {
      uid: unit.uid, no: newNo, card: byNo(newNo), rested: unit.rested, under: unit.under,
      counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempDmg: 0, tempGen: 0, tempFrontGen: false,
      frontGenPersist: false, retireAtEndOfMain: false, retireAtEndOfTurn: false, noBlock: false,
      skipNextStand: false, noRetire: false, tempSnipe: false, tempUnblockableBP: null, tempUnblockableBPMin: null,
      effectsNullified: false, enteredTurn: Engine.G.turn, attackedThisTurn: 0, blockedThisTurn: 0,
      kw: Engine.parseKeywords(byNo(newNo)),
    };
    lineArr[idx] = newUnit;
    log(`${owner.name}: ${unit.card.name} กลับมือ เผย ${newUnit.card.name}`);
    return newUnit;
  }

  // 001 Ayane — [On Play] look at the top 3, keep them on top in any order (no real state change).
  reg['CN/BAC-1-001'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`); } };

  // 013 Arisu — passive: if there is a Trait:Game Development Club card with [Raid] on the same
  // line, +1000 BP.
  reg['CN/BAC-1-013'] = { bpBonus(p, unit) { const line = p.front.includes(unit) ? p.front : p.energy; return line.some(u => u !== unit && (u.card.traits || '').includes('Game Development Club') && Engine.parseKeywords(u.card).raidTargets.length) ? 1000 : 0; } };

  // 028 Shiba Seki Ramen (Field) — [Main][Rest] draw 1, place 1 card from hand to the Outside Area.
  reg['CN/BAC-1-028'] = { async onMain(G, p, unit) { if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } unit.rested = true; Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); } };

  // 029 Game Development Department Club Room (Field) — [Main][Rest+Retire] choose 1 Trait:Game
  // Development Club character, [Impact +1] this turn.
  reg['CN/BAC-1-029'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Game Development Club'));
      await Engine.sidelineUnit(p, unit, 'effect');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Game Development Club`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${unit.card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
    },
  };

  // 032 "Abydos Resort Restoration Committee" — all Trait:Abydos High School characters +1000 BP
  // this turn. (Skipped: the "[When in Outside Area] selected by your effect" reactive clause —
  // the recurring "activate/react from Outside Area" gap.)
  reg['CN/BAC-1-032'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Abydos High School'));
      for (const u of targets) u.bpMod += 1000;
      if (targets.length) log(`${card.name}: Trait:Abydos High School ทุกใบ +1000 BP เทิร์นนี้`);
    },
  };

  // 033 "Summon No-man Drone: Artilery Support, Start" — choose 1 Shiroko, +2000 BP and [Sniper]
  // this turn. (Skipped: the "if used while paying 0 AP" redirect-to-deck-bottom clause — same
  // engine limitation as CSM-076/MGS/IYS's resolved-Event-card redirection cases.)
  reg['CN/BAC-1-033'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Shiroko'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Shiroko`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +2000 BP และ [Sniper] เทิร์นนี้`); }
    },
  };

  // 042 Hina — [Main][Discard 1][1/turn] +1000 BP this turn.
  reg['CN/BAC-1-042'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 049 Izuna — [On Play] look at the top 2, place up to 1 Event card among them to the Outside
  // Area, remainder to the top.
  reg['CN/BAC-1-049'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.type === 'Event'); } };

  // 054 Iori — [When Attacking] if you placed a card from hand to the Outside Area this turn
  // (approximated: does not separately check "by a Trait:Disciplinary Committee card's effect"),
  // draw up to 1.
  reg['CN/BAC-1-054'] = { async onAttack(G, p, unit) { if (p._placedToOutsideThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 057 Shun — cannot be played to the Front Line except by your own effects (handled generically
  // via the widened kw.cannotEnterFront regex). @[On Play] look at the top 2, split any between top
  // and Outside Area. @[When Attacking] +1000 BP this turn.
  reg['CN/BAC-1-057'] = {
    async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); },
    async onAttack(G, p, unit) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); },
  };

  // 060 Saya — [On Play] add up to 1 Rejuvenation Potion from your Outside Area to your hand.
  reg['CN/BAC-1-060'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.name || '').includes('Rejuvenation Potion'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 067 "Rejuvenation Potion" — choose 1 of: free-play 1 Trait:Young from your Outside Area to
  // your Energy Line rested; or choose up to 1 Trait:Shanhaijing Senior High School character in
  // Raid State, return its top card to your hand, draw 1.
  reg['CN/BAC-1-067'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ลง Trait:Young จาก Outside Area', value: 'a' }, { label: 'ยกเลิก Raid State ของ Trait:Shanhaijing Senior High School + จั่ว 1 ใบ', value: 'b' },
      ]);
      if (v === 'a') {
        const idx = p.sideline.findIndex(no => (byNo(no)?.traits || '').includes('Young'));
        if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      } else {
        const targets = [...p.front, ...p.energy].filter(u => u.under.length && (u.card.traits || '').includes('Shanhaijing Senior High School'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await unraidTopLayerToHand(p, t);
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 072 Kayoko — [Main][1/turn] only during the turn played, if this card's printed required
  // energy is 4 or higher: draw 1.
  reg['CN/BAC-1-072'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn || (unit.card.need || 0) < 4) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 073 Kayoko — [Main][When in Energy Line][1/turn] only if this card's printed required energy
  // is 5 or higher: move to the Front Line, +1000 BP this turn.
  reg['CN/BAC-1-073'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit) || (unit.card.need || 0) < 5) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.front.length >= 4) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, unit, 'front');
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 076 Haruka — [Main][Frontline][Rest+Retire] choose 1 enemy Front Line character with required
  // energy <= this card's, retire it.
  reg['CN/BAC-1-076'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (u.card.need || 0) <= (unit.card.need || 0));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: ${t.card.name} ถูก retire`); }
    },
  };

  // 077 Mutsuki — [On Play] look at the top 3, keep them on top in any order (no real state change).
  reg['CN/BAC-1-077'] = { async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 3 ใบ (เก็บไว้บนเด็คเหมือนเดิม)`); } };

  // 078 Mutsuki — passive: if 3+ other Trait:Konbini 68 cards on your area, +1 red generated energy.
  reg['CN/BAC-1-078'] = { genMod(unit, p) { return [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Konbini 68')).length >= 3 ? 1 : 0; } };

  // 082 Mika — [Your Turn] if all cards on your area are Trait:Trinity General School, +1000 BP.
  reg['CN/BAC-1-082'] = { bpBonus(p, unit) { return (isYourTurn(p) && [...p.front, ...p.energy].every(u => (u.card.traits || '').includes('Trinity General School'))) ? 1000 : 0; } };

  // 090 Hanako — [On Play] choose up to 1 other character with BP 4000+, +2000 BP this turn.
  async function hanakoBuff(p, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && Engine.bp(u) >= 4000);
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (BP 4000+)`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
  }
  reg['CN/BAC-1-090'] = { async onPlay(G, p, unit) { await hanakoBuff(p, unit); } };

  // 091 Hanako — [Your Turn] if there is a Front Line character other than this one with BP 6000+,
  // +4000 BP. @[On Play] same as 090.
  reg['CN/BAC-1-091'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p.front.some(u => u !== unit && Engine.bp(u) >= 6000)) ? 4000 : 0; },
    async onPlay(G, p, unit) { await hanakoBuff(p, unit); },
  };

  // 096 Konbini 68 Business Office (Field) — [On Play] choose up to 1 Trait:Konbini 68 card, its
  // required energy is 2 higher this turn (no current mechanical consumer reads a live unit's
  // required energy, so this is flavor-only). @[Main][Discard 1] re-activate the [On Play] effect.
  reg['CN/BAC-1-096'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Konbini 68'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Konbini 68`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) log(`${unit.card.name}: ${t.card.name}'s required energy +2 เทิร์นนี้ (ไม่มีผลเชิงกลไกในปัจจุบัน)`);
    },
    async onMain(G, p, unit) {
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Konbini 68'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Konbini 68`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) log(`${unit.card.name}: ${t.card.name}'s required energy +2 เทิร์นนี้ (ไม่มีผลเชิงกลไกในปัจจุบัน)`);
    },
  };

  // 098 "Evaluation Exam" — choose 1 enemy Front Line character with BP <= (Trait:Supplemental
  // Lessons Club cards on your area x1000) and retire it.
  reg['CN/BAC-1-098'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Supplemental Lessons Club')).length; await H.retireEnemyFront(p, n * 1000); } };

  // 100 "Professor Peroro Doll" — choose 1 Trait:Supplemental Lessons Club, +2000 BP this turn.
  // Then choose up to 1 character with BP 4000+, +2000 BP this turn. If there is a Hifumi or
  // Azusa on your area, untap 1 AP.
  reg['CN/BAC-1-100'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Supplemental Lessons Club'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Supplemental Lessons Club`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      const targets2 = [...p.front, ...p.energy].filter(u => Engine.bp(u) >= 4000);
      if (targets2.length) {
        const uid2 = await p.controller.chooseOwnCharacter(p, targets2, `${card.name}: เลือก character (BP 4000+)`, true);
        const t2 = targets2.find(x => x.uid === uid2);
        if (t2) { t2.bpMod += 2000; log(`${card.name}: ${t2.card.name} +2000 BP เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Hifumi') || H.hasCardNamed(p, 'Azusa')) await H.apUntap(p, 1);
    },
  };

  // 101 Ayane (2nd) — [When in Outside Area] selected by your effect reactive. (Skipped: recurring
  // "activate/react from Outside Area" gap.)

  // 104 Serika — [Main][Discard 1][1/turn] choose 1 other Trait:Abydos High School, +1000 BP this
  // turn.
  reg['CN/BAC-1-104'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Abydos High School'));
      if (!targets.length) return;
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Abydos High School`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 105 Nonomi — [On Play] look at the top 2, keep any number on top (any order), remainder to the
  // Outside Area.
  reg['CN/BAC-1-105'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 108 Abydos High School (Field) — [On Play] you may place 1 card from hand to the Outside Area;
  // if you did, draw 2. @[Main][Rest][1/turn] place the top card of your deck to the Outside Area.
  reg['CN/BAC-1-108'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      const no = p.deck.shift();
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`);
    },
  };
})();
