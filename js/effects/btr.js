// ══════════ UA SIM — Roboco Channel (BTR) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countTraitInSideline(p, trait) { return p.sideline.filter(no => (byNo(no)?.traits || '').includes(trait)).length; }
  function eventCountInSideline(p) { return p.sideline.filter(no => byNo(no)?.type === 'Event').length; }
  function countDistinctFrontNames(p) { return new Set(p.front.map(u => u.card.name)).size; }
  async function sidelineToDeckTop(p, predicate, title) {
    const i = await p.controller.chooseCardFromSideline(p, title, predicate);
    if (i == null) return null;
    const no = p.sideline.splice(i, 1)[0];
    p.deck.unshift(no);
    log(`${p.name}: ${byNo(no)?.name} จาก Outside Area ไปบนสุดของเด็ค`);
    return no;
  }
  // "look at top N, place any number among them on top (any order), the rest on the bottom" — no
  // Outside Area involved.
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
  // both players reveal the top card of their own deck, then place it at the bottom of their own
  // deck. Returns {mine, theirs} card objects (or null if a deck was empty).
  async function dualRevealToBottom(p, enemy) {
    const mine = p.deck.length ? byNo(p.deck.shift()) : null;
    const theirs = enemy.deck.length ? byNo(enemy.deck.shift()) : null;
    if (mine) { p.deck.push(mine.no); log(`${p.name}: เปิดเผย ${mine.name} — ไปล่างสุดของเด็ค`); }
    if (theirs) { enemy.deck.push(theirs.no); log(`${enemy.name}: เปิดเผย ${theirs.name} — ไปล่างสุดของเด็ค`); }
    return { mine, theirs };
  }

  // 001 Akasyonyu — passive: if 2+ Trait:Food cards on your Outside Area, +1000 BP.
  reg['BTR-1-001'] = { bpBonus(p, unit) { return countTraitInSideline(p, 'Food') >= 2 ? 1000 : 0; } };

  // 002 Gigant Kuroda — [On Play] add up to 1 Trait:Food card from your Outside Area to your hand.
  reg['BTR-1-002'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.traits || '').includes('Food'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 003 Gyutaro — [On Play][When Attacking] you may place 1 Trait:Food card from hand to the
  // Outside Area; if you did, draw 1 and +1000 BP this turn.
  async function gyutaroEffect(p, unit) {
    if (!p.hand.some(no => (byNo(no)?.traits || '').includes('Food'))) return;
    const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง Trait:Food จากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือก Trait:Food`);
    if (i == null) return;
    const no = p.hand.splice(i, 1)[0];
    p.sideline.push(no);
    log(`${unit.card.name}: ${byNo(no)?.name} จากมือไป Outside Area`);
    Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
  }
  reg['BTR-1-003'] = { async onPlay(G, p, unit) { await gyutaroEffect(p, unit); }, async onAttack(G, p, unit) { await gyutaroEffect(p, unit); } };

  // 013 Madoka-Chuwan — [When Attacking] you and your opponent reveal the top card of your own
  // deck and place it at the bottom. If your revealed card's required energy is >= your
  // opponent's, draw 1 and +1000 BP this turn; if less, -1000 BP this turn. (Skipped: "you may
  // treat this card on top of your deck as required energy of 5" — a narrow deck-top text-override
  // with no other card in this batch referencing it.)
  reg['BTR-1-013'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const { mine, theirs } = await dualRevealToBottom(p, enemy);
      if (!mine || !theirs) return;
      if ((mine.need || 0) >= (theirs.need || 0)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else { unit.bpMod -= 1000; log(`${unit.card.name}: -1000 BP เทิร์นนี้`); }
    },
  };

  // 014 Madoka-Chuwan (2nd print) — [Main][Frontline][1/turn] only if 4 distinct-named characters
  // on your Front Line: choose 1 other character, both it and this character get +1000 BP this turn.
  reg['BTR-1-014'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (countDistinctFrontNames(p) < 4) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; unit.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} และตัวเอง +1000 BP เทิร์นนี้`); }
    },
  };

  // 017 Mifune Chizuru — [Main][1/turn] peek at the top of your opponent's deck (kept in place).
  // @[Main][Pay 1 AP][1/turn] your opponent places 1 card from the top of their deck to the Outside
  // Area.
  reg['BTR-1-017'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurnA !== Engine.G.turn) opts.push({ label: 'ดูการ์ดบนสุดของเด็คศัตรู', value: 'a' });
      if (unit._usedTurnB !== Engine.G.turn && Engine.activeAP(p) >= 1) opts.push({ label: 'จ่าย 1 AP: บังคับศัตรูส่งการ์ดบนสุดไป Outside Area', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ไม่มี ability ที่ใช้ได้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      const enemy = Engine.opponentOf(p);
      if (v === 'a') { unit._usedTurnA = Engine.G.turn; if (enemy.deck.length) log(`${unit.card.name}: การ์ดบนสุดของเด็คศัตรูคือ ${byNo(enemy.deck[0])?.name}`); }
      else { unit._usedTurnB = Engine.G.turn; if (Engine.payAP(p, 1) && enemy.deck.length) { const no = enemy.deck.shift(); enemy.sideline.push(no); log(`${unit.card.name}: ${byNo(no)?.name} จากบนสุดเด็คศัตรูไป Outside Area`); } }
    },
  };

  // 018 Motsuo Brothers — [On Play] you and your opponent reveal the top card of your own deck and
  // place it at the bottom. If your revealed card's required energy is >= your opponent's, draw 1;
  // if less, your opponent draws 1.
  reg['BTR-1-018'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const { mine, theirs } = await dualRevealToBottom(p, enemy);
      if (!mine || !theirs) return;
      if ((mine.need || 0) >= (theirs.need || 0)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else { Engine.draw(enemy, 1); log(`${enemy.name}: จั่ว 1 ใบ`); }
    },
  };

  // 019 Motsuo — [When Attacking] if 4 characters with different names on your Front Line, draw 1.
  reg['BTR-1-019'] = { async onAttack(G, p, unit) { if (countDistinctFrontNames(p) >= 4) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 027 "Mom's Knife" (Field) — [Main][Rest+Retire] choose 1 character on your area, +3000 BP this
  // turn. If the chosen character is Bondo's Mom, also set it active.
  reg['BTR-1-027'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy];
      await Engine.sidelineUnit(p, unit, 'effect');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 3000; log(`${unit.card.name}: ${t.card.name} +3000 BP เทิร์นนี้`);
      if ((t.card.name || '').includes("Bondo's Mom")) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 029 "Queen Of Board Games" — choose 1 enemy Front Line character with BP 2000 or less (5000 or
  // less if there is a Madoka-Chuwan on your area) and retire it. Look at the top of your deck,
  // keep it on top or send it to the Outside Area.
  reg['BTR-1-029'] = {
    async onEvent(G, p, card) {
      await H.retireEnemyFront(p, H.hasCardNamed(p, 'Madoka-Chuwan') ? 5000 : 2000);
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 031 "Roboco Quiz" — declare a required energy number. Reveal the top card of your deck and add
  // it to hand. If it matches, also draw 2 and place 1 card from hand to the Outside Area.
  reg['BTR-1-031'] = {
    async onEvent(G, p, card) {
      const declared = await p.controller.chooseOption(p, `${card.name}: ประกาศตัวเลข required energy`, [0, 1, 2, 3, 4, 5, 6].map(n => ({ label: `${n}`, value: n })));
      if (!p.deck.length) return;
      const no = p.deck.shift();
      const c = byNo(no);
      p.hand.push(no);
      log(`${card.name}: เปิดเจอ ${c?.name} — เพิ่มเข้ามือ`);
      if (!c || (c.need || 0) !== declared) return;
      Engine.draw(p, 2); log(`${card.name}: จั่วเพิ่ม 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 032 "Omu-Rice" — draw 1, place 1 card from hand to the Outside Area, untap 1 AP.
  reg['BTR-1-032'] = { async onEvent(G, p, card) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); await H.apUntap(p, 1); } };

  // 033 "Pow! Flour Festival Float" — choose up to 1 enemy Front Line character with BP 4000 or
  // less and rest it. If there is a Roboco on your area, draw 1.
  reg['BTR-1-033'] = { async onEvent(G, p, card) { await H.restEnemyFront(p, 4000); if (H.hasCardNamed(p, 'Roboco')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); } } };

  // 036 Bondo — passive: if 4+ Event Cards on your Outside Area, +1500 BP.
  reg['BTR-1-036'] = { bpBonus(p, unit) { return eventCountInSideline(p) >= 4 ? 1500 : 0; } };

  // 037 Bondo — [On Play] look at the top 2, keep any number on top (any order), remainder to the
  // Outside Area.
  reg['BTR-1-037'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 049 Myomyoji Tokasa — [On Play] if there are 4 distinct-named Trait:Bermuda cards on your area,
  // choose 1 of: draw 1; or choose up to 1 enemy Front Line character with BP 3000 or less and rest
  // it. @[Main][Frontline][1/turn] all Trait:Bermuda on your area get +500 BP this turn.
  reg['BTR-1-049'] = {
    async onPlay(G, p, unit) {
      const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Bermu')).map(u => u.card.name));
      if (names.size < 4) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [{ label: 'จั่ว 1 ใบ', value: 'a' }, { label: 'วางนอน character ศัตรู (BP 3000 หรือน้อยกว่า)', value: 'b' }]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else await H.restEnemyFront(p, 3000);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Bermu'));
      for (const t of targets) t.bpMod += 500;
      log(`${unit.card.name}: Trait:Bermuda ทุกใบ +500 BP เทิร์นนี้`);
    },
  };

  // 051 Motsuo — [On Play] you and your opponent draw 1.
  reg['BTR-1-051'] = { async onPlay(G, p, unit) { Engine.draw(p, 1); Engine.draw(Engine.opponentOf(p), 1); log(`${unit.card.name}: ทั้งสองฝ่ายจั่ว 1 ใบ`); } };

  // 052 Motsuo — [On Play] reveal the top 3 of your deck; your opponent picks 1 among them, which
  // goes to the bottom of your deck, the rest to your hand. @[When Attacking]/[On Block] if you
  // have 5+ cards in hand, +1000 BP this turn.
  reg['BTR-1-052'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const opts = revealed.map((no, i) => ({ label: byNo(no)?.name || no, value: i }));
      const picked = await enemy.controller.chooseOption(enemy, `เลือกการ์ด 1 ใบของฝ่ายตรงข้ามให้ไปล่างสุดเด็ค`, opts);
      const idx = picked ?? 0;
      const bottomNo = revealed.splice(idx, 1)[0];
      p.deck.push(bottomNo);
      p.hand.push(...revealed);
      log(`${unit.card.name}: เปิดเผยการ์ดบนสุด 3 ใบ — ${byNo(bottomNo)?.name} ไปล่างสุดเด็ค ที่เหลือเข้ามือ`);
    },
    async onAttack(G, p, unit) { if (p.hand.length >= 5) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); } },
    async onBlock(G, p, unit) { if (p.hand.length >= 5) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); } },
  };

  // 055 Armored Samurai — [On Retire] you may place 2 cards from your hand to the Outside Area; if
  // you did, add this card to your hand.
  reg['BTR-1-055'] = {
    async onSideline(G, p, unit) {
      if (p.hand.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ด 2 ใบจากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ (${i + 1}/2)`); if (idx == null) return; p.sideline.push(p.hand.splice(idx, 1)[0]); }
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ`); }
    },
  };

  // 058 Dr. Mockus — [Main][Rest+Retire] add 1 Trait:Roboco's Enemy character (other than
  // Dr.Mockus) from your Outside Area to your hand.
  reg['BTR-1-058'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.name !== 'Dr.Mockus' && (c.traits || '').includes("Roboco's Enemy"), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 061 River (Field) — [Main][Rest] all Trait:Roboco's Enemy cards on your area get +500 BP this
  // turn. If 3+ of them, also choose up to 1 enemy character with BP 1000+, -500 BP this turn.
  reg['BTR-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes("Roboco's Enemy"));
      for (const t of targets) t.bpMod += 500;
      log(`${unit.card.name}: Trait:Roboco's Enemy ทุกใบ +500 BP เทิร์นนี้`);
      if (targets.length >= 3) await H.debuffEnemyAny(p, -500, { min: 1000 });
    },
  };

  // 063 "Flying Roboco" — look at the top 2, keep any number on top (any order), remainder to the
  // bottom (any order). Draw 2.
  reg['BTR-1-063'] = { async onEvent(G, p, card) { await lookTopSplitTopBottom(p, 2, `${card.name}: ดูการ์ดบนสุด 2 ใบ`); Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); } };

  // 064 "Difficult Question" — choose 1 enemy Front Line character with BP 3000 or less (5000 or
  // less if there is a Motsuo on your area), return it to hand, and draw 1.
  reg['BTR-1-064'] = { async onEvent(G, p, card) { await H.bounceEnemyFront(p, H.hasCardNamed(p, 'Motsuo') ? 5000 : 3000); Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); } };

  // 066 "Moe Moe Crush" — tiered based on the number of "Roboco's Knee" named cards on your
  // Outside Area: 1+: choose up to 1 enemy Front Line character with BP 4000 or less and retire it
  // (5000 or less instead if 2+); 4+: also choose up to 1 Roboco, [Impact +1] and [Damage +1] this turn.
  reg['BTR-1-066'] = {
    async onEvent(G, p, card) {
      const n = p.sideline.filter(no => (byNo(no)?.name || '').includes("Roboco's Knee")).length;
      if (n >= 1) await H.retireEnemyFront(p, n >= 2 ? 5000 : 4000);
      if (n < 4) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Roboco'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Roboco`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact = (t.tempImpact || 0) + 1; t.tempDmg = (t.tempDmg || 0) + 1; log(`${card.name}: ${t.card.name} [Impact +1] และ [Damage +1] เทิร์นนี้`); }
    },
  };

  // 067 "Roboco's Knee" — draw 1. You may rest 1 active Roboco on your area; if you did, untap 1 AP.
  reg['BTR-1-067'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => !u.rested && (u.card.name || '').includes('Roboco'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${card.name}: วางนอน Roboco?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Roboco');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`); await H.apUntap(p, 1); }
    },
  };

  // 078 Roboco — [On Play] you may retire 1 Gachi Gorilla on your area; if you did, choose up to 1
  // enemy Front Line character with BP <= the retired Gachi Gorilla's BP and retire it. Draw 1.
  reg['BTR-1-078'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gachi Gorilla'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire Gachi Gorilla?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Gachi Gorilla');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const bpLimit = Engine.bp(t);
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      await H.retireEnemyFront(p, bpLimit);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 083 Gachi Gorilla's Mom — [On Play] choose up to 1 other Trait:Gachi's House card on your area
  // and set it active.
  reg['BTR-1-083'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested && (u.card.traits || '').includes("Gachi's House"));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Gachi's House`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} Active`); }
    },
  };

  // 092 Nyonta — [Main][Rest] choose 1 other character on your area, +1000 BP this turn. Return
  // this card to your hand.
  reg['BTR-1-092'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 095 Gachi Animal Hospital (Field) — [Main][Rest] choose 1 character on your area, +1000 BP
  // this turn.
  reg['BTR-1-095'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 100 "Roboco Cannon" — choose 1 character on your area and set it active. If it's a Trait:Animal
  // card, also untap 1 AP.
  reg['BTR-1-100'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = false; log(`${card.name}: ${t.card.name} Active`);
      if ((t.card.traits || '').includes('Animal')) await H.apUntap(p, 1);
    },
  };

  // 102 Madoka-Chuwan — [On Play] place 1 yellow Character card from your Outside Area to the top
  // of your deck.
  reg['BTR-1-102'] = { async onPlay(G, p, unit) { await sidelineToDeckTop(p, c => c && c.type === 'Character' && c.color === 'Yellow', `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 107 Gachi Gorilla — [When Attacking] choose 1 character on your area, +500 BP this turn.
  reg['BTR-1-107'] = { async onAttack(G, p, unit) { await H.buffOwnCharacter(p, 500); } };

  // 108 "Bermuda Elementary School" (Field) — [Main][Rest] choose 1 of: choose 1 character on your
  // area and move it to another line; or choose 1 character on your Front Line and 1 on your
  // Energy Line and swap their positions.
  reg['BTR-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ย้าย character 1 ใบไปอีก line', value: 'a' }, { label: 'สลับตำแหน่ง Front Line กับ Energy Line', value: 'b' },
      ]);
      unit.rested = true;
      if (v === 'a') {
        const targets = [...p.front, ...p.energy];
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
        const t = targets.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      } else {
        if (!p.front.length || !p.energy.length) return;
        const uid1 = await p.controller.chooseOwnCharacter(p, p.front, 'เลือก character บน Front Line');
        const a = p.front.find(x => x.uid === uid1);
        const uid2 = await p.controller.chooseOwnCharacter(p, p.energy, 'เลือก character บน Energy Line');
        const b = p.energy.find(x => x.uid === uid2);
        if (!a || !b) return;
        const fi = p.front.indexOf(a), ei = p.energy.indexOf(b);
        p.front[fi] = b; p.energy[ei] = a;
        log(`${unit.card.name}: สลับตำแหน่ง ${a.card.name} กับ ${b.card.name}`);
      }
    },
  };

  // 109 "Oh Yeah!! Manly Man Dinner!!" — choose 1 character on your area, +2000 BP this turn. If
  // there is a Roboco on your area, untap 1 AP.
  reg['BTR-1-109'] = { async onEvent(G, p, card) { await H.buffOwnCharacter(p, 2000); if (H.hasCardNamed(p, 'Roboco')) await H.apUntap(p, 1); } };
  // ─── residual pass ───────────────────────────────────────────────────────────

  const confirmB = (p, q) => p.controller.chooseOption(p, q, [{ label: 'ตกลง', value: true }, { label: 'ข้าม', value: false }]);
  async function pickOwnB(p, list, title) {
    if (!list.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, list, title, true);
    return list.find(u => u.uid === uid) || null;
  }
  async function pickEnemyB(p, list, title) {
    if (!list.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, list, title, true);
    return list.find(u => u.uid === uid) || null;
  }
  const myTurnB = p => Engine.G.players[Engine.G.active] === p;

  // Both players reveal their top card and bury it; returns the two required-energy values.
  // Shared by 1-015 and 1-022.
  function dualRevealToBottom(p, unit) {
    const enemy = Engine.opponentOf(p);
    const mine = p.deck.length ? p.deck.shift() : null;
    const theirs = enemy.deck.length ? enemy.deck.shift() : null;
    if (mine) p.deck.push(mine);
    if (theirs) enemy.deck.push(theirs);
    const a = mine ? (byNo(mine)?.need || 0) : -1;
    const b = theirs ? (byNo(theirs)?.need || 0) : -1;
    log(`${unit.card.name}: เปิดการ์ดบนสุด — คุณ ${byNo(mine)?.name || '-'} (${a}) vs ศัตรู ${byNo(theirs)?.name || '-'} (${b})`);
    return { mine: a, theirs: b };
  }

  // 1-008 Bondo — [When Attacking] with 4+ differently-named characters on your Front Line, rest an
  // enemy Front Line character.
  reg['BTR-1-008'] = {
    async onAttack(G, p, unit) {
      const names = new Set(p.front.map(u => u.card.name));
      if (names.size < 4) return;
      await H.restEnemyFront(p);
    },
  };

  // 1-015 Madoka-Chuwan — [When Attacking] the reveal duel: win or tie draws 1 and gives +1000 BP,
  // losing costs 1000 BP.
  reg['BTR-1-015'] = {
    onAttack(G, p, unit) {
      const r = dualRevealToBottom(p, unit);
      if (r.mine >= r.theirs) {
        Engine.draw(p, 1);
        unit.bpMod += 1000;
        log(`${unit.card.name}: ชนะการเปิด → จั่ว 1 ใบ และ +1000 BP เทิร์นนี้`);
      } else {
        unit.bpMod -= 1000;
        log(`${unit.card.name}: แพ้การเปิด → -1000 BP เทิร์นนี้`);
      }
    },
  };

  // 1-022 Roboco — same reveal, but the payoff is unconditional [Impact (1)].
  reg['BTR-1-022'] = {
    onAttack(G, p, unit) {
      dualRevealToBottom(p, unit);
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: ได้ [Impact (1)] เทิร์นนี้`);
    },
  };

  // 1-034 Custom Meico — [On Play] bounce a cheap character of yours to discount the next cheap
  // character you play.
  reg['BTR-1-034'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.need || 0) <= 3);
      if (!targets.length) return;
      const t = await pickOwnB(p, targets, `${unit.card.name}: คืน character (energy ≤3) เข้ามือ?`);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      p.pendingDiscount = { predicate: c => c.type === 'Character' && (c.need || 0) <= 3, apDelta: -1 };
      log(`${unit.card.name}: character (energy ≤3) ใบถัดไปลด AP 1`);
    },
  };

  // 1-038 Bondo — [On Play] bounce an enemy with BP up to 1000 per Event card in your Outside Area.
  reg['BTR-1-038'] = {
    async onPlay(G, p, unit) {
      const events = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      if (events > 0) await H.bounceEnemyFront(p, events * 1000);
      unit.tempImpact = (unit.tempImpact || 0) + 1;
      log(`${unit.card.name}: ได้ [Impact (1)] เทิร์นนี้`);
    },
  };

  // 1-053 Motsuo — [On Play] pick one of two effects.
  reg['BTR-1-053'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (p.hand.length >= 5) opts.push({ label: 'retire ศัตรู (BP ≤3000)', value: 'retire' });
      opts.push({ label: 'จั่ว 1 ใบ', value: 'draw' });
      const pick = await p.controller.chooseOption(p, `${unit.card.name}: เลือกผล`, opts);
      if (pick === 'retire') { await H.retireEnemyFront(p, 3000); return; }
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 1-069 — [On Play] retire a weak enemy on the Energy Line.
  reg['BTR-1-069'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Character' &&
        (u.card.gen || 0) <= 1 && (u.card.ap || 0) === 1);
      const t = await pickEnemyB(p, targets, `${unit.card.name}: เลือก character ศัตรูบน Energy Line`);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 1-073 Serizawa Gaku — [On Play] discount the next Animal card; [Main][When in Frontline]
  // [1 Per Turn] draw 1 if you played an Animal card this turn.
  reg['BTR-1-073'] = {
    onPlay(G, p, unit) {
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Animal'), apDelta: -1 };
      log(`${unit.card.name}: Animal ใบถัดไปลด AP 1`);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._gakuTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      const played = [...(p._playedTraitsThisTurn || [])].some(t => t.includes('animal'));
      if (!played) { p.controller.notify?.('ต้องเล่นการ์ด Animal ในเทิร์นนี้ก่อน'); return; }
      unit._gakuTurn = Engine.G.turn;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    mainLabel: 'จั่ว 1 ใบ (เล่น Animal แล้ว)',
  };

  // 1-074 Bondo — [Main][Pay 1 AP][1 Per Turn] +1000 BP until the start of your next turn.
  reg['BTR-1-074'] = {
    async onMain(G, p, unit) {
      if (unit._bondoTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._bondoTurn = Engine.G.turn;
      unit.bpPersist += 1000;
      log(`${unit.card.name}: ได้ +1000 BP จนถึงต้นเทิร์นหน้า`);
    },
    mainLabel: 'จ่าย 1 AP → +1000 BP',
  };

  // 1-076 Motsuo — +1000 BP while any of your characters carries [Impact] or [Damage].
  reg['BTR-1-076'] = {
    bpBonus(p, unit) {
      // kw.dmg defaults to 1 on every character (the normal damage a hit deals), so only a value
      // above 1 means the card actually carries [Damage (N)]
      const armed = [...p.front, ...p.energy].some(u =>
        (u.kw?.impact || 0) > 0 || (u.kw?.dmg || 0) > 1 || (u.tempImpact || 0) > 0 || (u.tempDmg || 0) > 0);
      return armed ? 1000 : 0;
    },
  };

  // 1-077 Roboco — [When Attacking] rest any number of active Animal cards for a tiered payoff.
  reg['BTR-1-077'] = {
    async onAttack(G, p, unit) {
      const pool = [...p.front, ...p.energy].filter(u => u !== unit && !u.rested && (u.card.traits || '').includes('Animal'));
      if (!pool.length) return;
      let n = 0;
      for (const u of pool) {
        if (!await confirmB(p, `${unit.card.name}: วางนอน ${u.card.name}?`)) break;
        u.rested = true;
        n++;
      }
      if (!n) return;
      unit.bpMod += 500 * n;
      if (n >= 3) unit.tempImpact = (unit.tempImpact || 0) + 1;
      if (n >= 4) unit.tempDmg = (unit.tempDmg || 0) + 1;
      log(`${unit.card.name}: วางนอน Animal ${n} ใบ → +${500 * n} BP${n >= 3 ? ' · [Impact (1)]' : ''}${n >= 4 ? ' · [Damage (2)]' : ''}`);
    },
  };

  // 1-081 Gachi Gorilla — [On Play] fetch a cheap green ally from your Outside Area, either to hand
  // or straight onto the field rested. ("or raid it" is not offered.)
  reg['BTR-1-081'] = {
    async onPlay(G, p, unit) {
      const fits = c => c && c.type === 'Character' && (c.color || '').toLowerCase() === 'green' &&
        (c.ap || 0) === 1 && !/Gachi Gorilla/.test(c.name || '') &&
        ((c.traits || '').includes("Gachi's House") || /Bondo|Motsuo/.test(c.name || ''));
      const i = p.sideline.findIndex(no => fits(byNo(no)));
      if (i < 0) return;
      const how = await p.controller.chooseOption(p, `${unit.card.name}: ${byNo(p.sideline[i])?.name}`,
        [{ label: 'เข้ามือ', value: 'hand' }, { label: 'ลงสนามแบบนอน', value: 'field' }, { label: 'ข้าม', value: null }]);
      if (!how) return;
      if (how === 'hand') {
        p.hand.push(p.sideline.splice(i, 1)[0]);
        log(`${unit.card.name}: เพิ่มการ์ดเข้ามือ`);
        return;
      }
      await Engine.playCardFromZone(p, p.sideline[i], 'sideline', { line: 'front', active: false });
    },
  };

  // 1-088 Ruri — +500 BP with a <Gachi Gorilla> out; [On Retire] dig 3 for a Gachi's House card.
  reg['BTR-1-088'] = {
    bpBonus(p, unit) { return myTurnB(p) && H.hasCardNamed(p, 'Gachi Gorilla') ? 500 : 0; },
    async onSideline(G, p, unit) {
      const revealed = p.deck.splice(0, 3);
      if (!revealed.length) return;
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือก Gachi's House เข้ามือ`,
        c => (c.traits || '').includes("Gachi's House"), 1);
      const chosen = picked?.length ? revealed[picked[0]] : null;
      if (chosen) {
        revealed.splice(revealed.indexOf(chosen), 1);
        p.hand.push(chosen);
        log(`${unit.card.name}: เพิ่ม ${byNo(chosen)?.name} เข้ามือ`);
      }
      for (const no of revealed) p.deck.push(no);
    },
  };

  // 1-101 Bondo — [On Play] +1000 BP this turn to any number of differently-named Front Line characters.
  reg['BTR-1-101'] = {
    async onPlay(G, p, unit) {
      const seen = new Set();
      for (const u of [...p.front]) {
        if (seen.has(u.card.name)) continue;
        if (!await confirmB(p, `${unit.card.name}: ให้ ${u.card.name} +1000 BP?`)) continue;
        seen.add(u.card.name);
        u.bpMod += 1000;
        log(`${u.card.name}: ได้ +1000 BP เทิร์นนี้`);
      }
    },
  };

  // 1-106 Roboco — [On Play] fetch a <Trait: Food> card from your Outside Area.
  reg['BTR-1-106'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => (c.traits || '').includes('Food'), `${unit.card.name}: เลือก Food เข้ามือ`);
    },
  };

  // P-001 Roboco — [On Play][When Attacking] mark an enemy to retire at the end of the Attack Phase.
  const markForRetire = async (p, unit) => {
    const t = await pickEnemyB(p, Engine.opponentOf(p).front, `${unit.card.name}: เลือก character ศัตรู (retire ตอนจบ Attack Phase)`);
    if (!t) return;
    t.retireAtEndOfTurn = true;
    log(`${t.card.name}: จะถูก retire ตอนจบ Attack Phase`);
  };
  reg['UAPR-BTR-P-001'] = {
    async onPlay(G, p, unit) { await markForRetire(p, unit); },
    async onAttack(G, p, unit) { await markForRetire(p, unit); },
  };

  // P-002 Roboco — [On Play] pitch 2 to bury an enemy Front Line character in their deck.
  reg['UAPR-BTR-P-002'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (p.hand.length < 2 || !enemy.front.length) return;
      if (!await confirmB(p, `${unit.card.name}: ทิ้ง 2 ใบเพื่อส่ง character ศัตรูลงใต้เด็ค?`)) return;
      await H.discardFromHand(p);
      await H.discardFromHand(p);
      const t = await pickEnemyB(p, enemy.front, `${unit.card.name}: เลือก character ศัตรูลงใต้เด็ค`);
      if (!t) return;
      enemy.front.splice(enemy.front.indexOf(t), 1);
      enemy.deck.push(t.no);
      log(`${t.card.name}: ลงไปอยู่ใต้สุดของเด็คเจ้าของ`);
    },
  };

  // P-003 Roboco — [On Play] draw 1 with 4+ Event cards in your Outside Area.
  reg['UAPR-BTR-P-003'] = {
    onPlay(G, p, unit) {
      if (p.sideline.filter(no => byNo(no)?.type === 'Event').length < 4) return;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // P-004 Roboco — [Main][1 Per Turn] only on the turn it was played: give another character
  // [Impact (1)] this turn.
  reg['UAPR-BTR-P-004'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่เล่นการ์ดนี้'); return; }
      if (unit._robTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      const t = await pickOwnB(p, [...p.front, ...p.energy].filter(u => u !== unit), `${unit.card.name}: เลือก character รับ [Impact (1)]`);
      if (!t) return;
      unit._robTurn = Engine.G.turn;
      t.tempImpact = (t.tempImpact || 0) + 1;
      log(`${t.card.name}: ได้ [Impact (1)] เทิร์นนี้`);
    },
    mainLabel: 'ให้ character อื่น [Impact (1)]',
  };
})();
