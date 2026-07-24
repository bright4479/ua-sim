// ══════════ UA SIM — Rent-a-Girlfriend (RLY) effect scripts ══════════
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

  // 006 Inda Karane — [On Play] choose 1 of: choose up to 1 enemy Front Line character with BP
  // 3000 or less and retire it; or draw 2.
  reg['RLY-1-006'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'retire character ศัตรู (BP 3000 หรือน้อยกว่า)', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' },
      ]);
      if (v === 'a') await H.retireEnemyFront(p, 3000);
      else { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 008 Inda Karane — [On Play] you may place 1 card from hand to the Outside Area. If you did,
  // choose 1 of: choose up to 1 enemy Front Line character and rest it; or choose up to 1 other
  // character on your area and set it active.
  reg['RLY-1-008'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (!discarded) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'วางนอน character ศัตรู', value: 'a' }, { label: 'ตั้ง character อื่นของตัวเองเป็น Active', value: 'b' },
      ]);
      if (v === 'a') await H.restEnemyFront(p);
      else {
        const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character', true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
      }
    },
  };

  // 015 Yakuzen Kusuri — [Main][Rest+Retire] choose another character on your area, +2000 BP this
  // turn. Draw 1.
  reg['RLY-1-015'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 027 Hahari Hanazono — [Main][Rest+Retire] choose 1 other Trait:Hanazono Family character on
  // your area and set it active.
  reg['RLY-1-027'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hanazono Family'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Hanazono Family`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 029 Hahari Hanazono — [On Play][When in Energy Line] set self active. @[Main][Rest] choose 1
  // other Trait:Hanazono Family character on your area, +500 BP this turn.
  reg['RLY-1-029'] = {
    async onPlay(G, p, unit) { if (p.energy.includes(unit)) { unit.rested = false; log(`${unit.card.name}: Active`); } },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Hanazono Family'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Hanazono Family`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
    },
  };

  // 036 "Karane Launcher & Hakari Meteor Bullet" — usable only if there is an Inda Karane and a
  // Hanazono character on your area. Retire 1 Hanazono character on your area. Choose up to 1
  // enemy Front Line character with BP <= the retired character's BP and retire it. Draw 2.
  reg['RLY-1-036'] = {
    async onEvent(G, p, card) {
      if (!H.hasCardNamed(p, 'Inda Karane')) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Hanazono'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Hanazono ให้ retire`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const bpLimit = Engine.bp(t);
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${card.name}: ${t.card.name} ถูก retire`);
      await H.retireEnemyFront(p, bpLimit);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 037 "I Bought Today's Ending..." — choose 1 of 4 effects (2 of them if there is a Hanazono
  // character on your area): retire enemy FL BP<=5000; draw 2; untap 1 AP; choose 1 own character
  // +3000 BP this turn.
  reg['RLY-1-037'] = {
    async onEvent(G, p, card) {
      const picks = H.hasCardNamed(p, 'Hanazono') ? 2 : 1;
      const run = async v => {
        if (v === 'a') await H.retireEnemyFront(p, 5000);
        else if (v === 'b') { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); }
        else if (v === 'c') await H.apUntap(p, 1);
        else await H.buffOwnCharacter(p, 3000);
      };
      const opts = [
        { label: 'retire character ศัตรู (BP 5000 หรือน้อยกว่า)', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' },
        { label: 'AP กลับมา Active 1 ใบ', value: 'c' }, { label: 'character ของตัวเอง +3000 BP เทิร์นนี้', value: 'd' },
      ];
      for (let i = 0; i < picks; i++) {
        const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect (${i + 1}/${picks})`, opts);
        await run(v);
      }
    },
  };

  // 038 "A Five-Pronged Man Who Looks Like A Ghost Of Honesty" — declare a required energy number.
  // Reveal the top card of your deck and add it to your hand. If its required energy matches the
  // declared number, choose up to 1 character and up to 1 AP card on your area, set them active and
  // the chosen character gets +1000 BP this turn.
  reg['RLY-1-038'] = {
    async onEvent(G, p, card) {
      const declared = await p.controller.chooseOption(p, `${card.name}: ประกาศตัวเลข required energy`, [1, 2, 3, 4, 5, 6].map(n => ({ label: `${n}`, value: n })));
      if (!p.deck.length) return;
      const no = p.deck.shift();
      const c = byNo(no);
      p.hand.push(no);
      log(`${card.name}: เปิดเจอ ${c?.name} — เพิ่มเข้ามือ`);
      if (!c || (c.need || 0) !== declared) return;
      await H.apUntap(p, 1);
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 039 "Tsundere" — choose 1 of: choose 1 enemy Front Line character with BP 4000 or less and
  // retire it; or choose 1 Inda Karane on your area, +2000 BP, [Impact +1] and [Damage +1] this turn.
  reg['RLY-1-039'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Inda Karane'));
      const opts = [{ label: 'retire character ศัตรู (BP 4000 หรือน้อยกว่า)', value: 'a' }];
      if (targets.length) opts.push({ label: 'Inda Karane +2000 BP, [Impact +1], [Damage +1] เทิร์นนี้', value: 'b' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'a') await H.retireEnemyFront(p, 4000);
      else {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Inda Karane`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; t.tempImpact = (t.tempImpact || 0) + 1; t.tempDmg = (t.tempDmg || 0) + 1; log(`${card.name}: ${t.card.name} +2000 BP, [Impact +1], [Damage +1] เทิร์นนี้`); }
      }
    },
  };

  // 043 Aijou Rentarou — [On Play][When Attacking][1/turn] choose any number of OTHER characters
  // on your Front Line, +500 BP each this turn.
  reg['RLY-1-043'] = {
    async onPlay(G, p, unit) { await buffAllFront(p, unit); },
    async onAttack(G, p, unit) { await buffAllFront(p, unit); },
  };
  async function buffAllFront(p, unit) {
    if (unit._usedTurn === Engine.G.turn) return;
    const targets = p.front.filter(u => u !== unit && (u.card.name || '') !== 'Aijou Rentarou');
    if (!targets.length) return;
    unit._usedTurn = Engine.G.turn;
    for (const t of targets) t.bpMod += 500;
    log(`${unit.card.name}: character บน Front Line อื่น +500 BP เทิร์นนี้`);
  }

  // 049 Eiai Nano — [On Play] look at the top 2 of your deck, keep any number on top (any order),
  // remainder to the Outside Area.
  reg['RLY-1-049'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 052 Eiai Nano — [When Attacking] choose 1 of: self +500 BP this turn; or draw 1, place 1 card
  // from hand to the Outside Area. (Skipped: the "[Opponent's Turn] replace green [Color] trigger
  // with a draw, then free-play" clause — a color-trigger replacement effect, deeper than the
  // per-card onColorTrigger hook supports for a full "instead of" override.)
  reg['RLY-1-052'] = {
    async onAttack(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+500 BP เทิร์นนี้', value: 'a' }, { label: 'จั่ว 1 ใบ + วางการ์ดจากมือไป Outside Area', value: 'b' },
      ]);
      if (v === 'a') { unit.bpMod += 500; log(`${unit.card.name}: +500 BP เทิร์นนี้`); }
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 056 Yakuzen Kusuri — [Your Turn] +500 BP for each Event Card you used this turn.
  reg['RLY-1-056'] = { bpBonus(p, unit) { return isYourTurn(p) ? (p._eventsUsedThisTurn || 0) * 500 : 0; } };

  // 057 Yakuzen Kusuri — [On Play] draw 1. Choose 1 of: reduce the AP cost of the next Event Card
  // used this turn by 1; or place up to 1 Event Card from your Outside Area on top of your deck.
  reg['RLY-1-057'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ลด AP cost ของ Event Card ใบถัดไปที่ใช้เทิร์นนี้ 1', value: 'a' }, { label: 'วาง Event Card จาก Outside Area บนสุดของเด็ค', value: 'b' },
      ]);
      if (v === 'a') { p.pendingDiscount = { predicate: c => c.type === 'Event', apDelta: -1 }; log(`${unit.card.name}: Event Card ใบถัดไป ลด AP cost 1`); }
      else {
        const idx = p.sideline.findIndex(no => byNo(no)?.type === 'Event');
        if (idx >= 0) { const no = p.sideline.splice(idx, 1)[0]; p.deck.unshift(no); log(`${unit.card.name}: ${byNo(no)?.name} จาก Outside Area ไปบนสุดของเด็ค`); }
      }
    },
  };

  // 059 Yakuzen Kusuri — [On Play] you may reveal 1 Event Card from your hand. If you used an
  // Event Card or revealed a card from hand this turn, draw 1. @[Main][Rest+Retire] add 1 Event
  // Card (need<=2) from your Outside Area to your hand.
  reg['RLY-1-059'] = {
    async onPlay(G, p, unit) {
      const hasEvent = p.hand.some(no => byNo(no)?.type === 'Event');
      if (hasEvent) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เปิดเผย Event Card จากมือ?`, [{ label: 'เปิดเผย', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { p._revealedHandCardTurn = Engine.G.turn; log(`${unit.card.name}: เปิดเผย Event Card จากมือ`); }
      }
      if (p._eventsUsedThisTurn || p._revealedHandCardTurn === Engine.G.turn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && c.type === 'Event' && (c.need || 0) <= 2, `${unit.card.name}: เลือก Event Card จาก Outside Area`);
    },
  };

  // 063 Yoshimoto Shizuka — [When Attacking][1/turn] this character gains "cannot be blocked by
  // characters with required energy of 4 or more" until the end of the attack (approximated as
  // lasting the rest of the turn).
  reg['RLY-1-063'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      unit._usedTurn = Engine.G.turn;
      unit.tempUnblockableNeedMin = 4;
      log(`${unit.card.name}: ไม่ถูก block ด้วย character required energy 4 ขึ้นไป จนจบการโจมตี`);
    },
  };

  // 065 Yoshimoto Shizuka — [On Play] free-play 1 green Character (need<=2, ap1) from your hand
  // to your area rested.
  reg['RLY-1-065'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 066 Yoshimoto Shizuka — [On Play] if you have fewer hand cards than your opponent, you may pay
  // 1 AP; if you did, draw until hand sizes are equal and you cannot use cards from your hand this
  // turn. @[Main][Frontline][Discard 1][1/turn] choose 1 character (need<=3) on your area, +1000 BP
  // this turn.
  reg['RLY-1-066'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (p.hand.length >= enemy.hand.length) return;
      if (Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      const n = enemy.hand.length - p.hand.length;
      Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`);
      p._cannotPlayFromHandThisTurn = true;
      log(`${unit.card.name}: ใช้การ์ดจากมือไม่ได้จนจบเทิร์นนี้`);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.need || 0) <= 3);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (Energy 3 หรือน้อยกว่า)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 070 Hakari Hanazono — [Main][Frontline][Discard 1][1/turn] self +1000 BP this turn.
  reg['RLY-1-070'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 074 Chemistry Lab (Field) — [Main][Rest] only if you used an Event Card this turn: draw 1.
  reg['RLY-1-074'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 076 "A Drug That Counteracts The Effects Of Drugs" — draw 1. Choose 1 of: choose up to 1 enemy
  // character in Raid State and send its top card to the Outside Area; or choose up to 1 own
  // character in Raid State and return its top card to your hand.
  reg['RLY-1-076'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const enemyTargets = [...enemy.front, ...enemy.energy].filter(u => u.under.length);
      const ownTargets = [...p.front, ...p.energy].filter(u => u.under.length);
      const opts = [];
      if (enemyTargets.length) opts.push({ label: 'character ศัตรูในสถานะ Raid — ส่งใบบนไป Outside Area', value: 'a' });
      if (ownTargets.length) opts.push({ label: 'character ของตัวเองในสถานะ Raid — เอาใบบนกลับมือ', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseEnemyCharacter(p, enemyTargets, `${card.name}: เลือก character ศัตรู`, true);
        const t = enemyTargets.find(x => x.uid === uid);
        if (t) await H.unraidTopLayer(enemy, t);
      } else {
        const uid = await p.controller.chooseOwnCharacter(p, ownTargets, `${card.name}: เลือก character`, true);
        const t = ownTargets.find(x => x.uid === uid);
        if (t) await unraidTopLayerToHand(p, t);
      }
    },
  };

  // 078 "Crown Love Story - Crystal Love" — all characters on your area with need<=3 get +1500 BP
  // this turn. Choose up to 1 Yoshimoto Shizuka on your area, [Impact +1] this turn.
  reg['RLY-1-078'] = {
    async onEvent(G, p, card) {
      for (const u of [...p.front, ...p.energy].filter(u => (u.card.need || 0) <= 3)) u.bpMod += 1500;
      log(`${card.name}: character (Energy 3 หรือน้อยกว่า) ทุกใบ +1500 BP เทิร์นนี้`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Yoshimoto Shizuka'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Yoshimoto Shizuka`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
    },
  };

  // 079 "A Drug That Turns You Into A Human Magnet" — choose 1 character on your area +1000 BP
  // this turn. Add up to 1 Character Card with a different name from the chosen one from your
  // Outside Area to your hand.
  reg['RLY-1-079'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 1000; log(`${card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.name !== t.card.name, `${card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 080 "A Drug That Makes You Want To Kiss Someone You Love So Badly" — choose 1 character on
  // your area, +3000 BP and [Sniper] this turn. If there is a Yakuzen Kusuri on your area, you may
  // place 1 card from your hand to the Outside Area; if you did, reduce the AP cost of the next
  // Event Card (need<=2) used this turn by 1.
  reg['RLY-1-080'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 3000; t.tempSnipe = true; log(`${card.name}: ${t.card.name} +3000 BP และ [Sniper] เทิร์นนี้`); }
      }
      if (!H.hasCardNamed(p, 'Yakuzen Kusuri')) return;
      const discarded = await H.discardFromHand(p, `${card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (discarded) { p.pendingDiscount = { predicate: c => c.type === 'Event' && (c.need || 0) <= 2, apDelta: -1 }; log(`${card.name}: Event Card (Energy 2 หรือน้อยกว่า) ใบถัดไป ลด AP cost 1`); }
    },
  };
})();
