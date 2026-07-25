// ══════════ UA SIM — Fullmetal Alchemist (FMA) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function totalGen(p) { return Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0); }
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
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }

  // 003 Alphonse Elric — [Main][Rest+Retire] place 1 Edward Elric without [Raid] from your Outside
  // Area face-up under 1 Edward Elric with [Raid] on your Front Line not in Raid State; if you did,
  // set that character active (manual Raid-state creation).
  reg['UA37BT-FMA-1-003'] = {
    async onMain(G, p, unit) {
      const targets = p.front.filter(u => (u.card.name || '').includes('Edward Elric') && Engine.parseKeywords(u.card).raidTargets.length && !u.under.length);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Edward Elric') && !Engine.parseKeywords(c).raidTargets.length; });
      if (idx < 0) { p.controller.notify?.('ไม่มีการ์ดใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Edward Elric ที่มี [Raid]`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const idx2 = p.sideline.findIndex(no => { const c = byNo(no); return c && (c.name || '').includes('Edward Elric') && !Engine.parseKeywords(c).raidTargets.length; });
      if (idx2 < 0) return;
      const no = p.sideline.splice(idx2, 1)[0];
      t.under.unshift(no);
      t.rested = false;
      log(`${unit.card.name}: วาง ${byNo(no)?.name} ใต้ ${t.card.name} (เข้าสถานะ Raid) — Active`);
    },
  };

  // 016 Yoki — [Opponent's Turn][Frontline] grant other own characters a targeting tax. (Skipped:
  // recurring targeting-tax gap.)

  // 018 Fu — [Your Turn] if you have 7+ generated energy, +1000 BP.
  reg['UA37BT-FMA-1-018'] = { bpBonus(p, unit) { return (isYourTurn(p) && totalGen(p) >= 7) ? 1000 : 0; } };

  // 025 Ling Yao — [On Play] free-play 1 yellow Trait:Xing Country (need<=2, ap1) from hand rested.
  reg['UA37BT-FMA-1-025'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Xing Country') && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 030 "Traveler from Xing" — choose 1 enemy Front Line character with BP <= (Trait:Xing Country
  // cards on your area x1000) and retire it.
  reg['UA37BT-FMA-1-030'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Xing Country')).length; await H.retireEnemyFront(p, n * 1000); } };

  // 032 "Why are there only two choices?" — choose 1 of: look at the top 3, split any between top
  // and bottom; or draw 2. (Both, if there is an Alphonse Elric on your area.)
  reg['UA37BT-FMA-1-032'] = {
    async onEvent(G, p, card) {
      const doA = async () => { await lookTopSplitTopBottom(p, 3, `${card.name}: ดูการ์ดบนสุด 3 ใบ`); };
      const doB = async () => { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); };
      if (H.hasCardNamed(p, 'Alphonse Elric')) { await doA(); await doB(); return; }
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [{ label: 'ดูการ์ดบนสุด 3 ใบ', value: 'a' }, { label: 'จั่ว 2 ใบ', value: 'b' }]);
      if (v === 'a') await doA(); else await doB();
    },
  };

  // 038 Izumi Curtis — when this character attacks and is not blocked, draw 1.
  reg['UA37BT-FMA-1-038'] = { async onAnyUnblockedAttack(G, p, atkUnit, self) { if (atkUnit === self) { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); } } };

  // 042 Jean Havoc — [On Retire] free-play 1 blue Character (other than this card, need<=3, ap1)
  // from hand rested.
  reg['UA37BT-FMA-1-042'] = { async onSideline(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && c.name !== 'Jean Havoc' && (c.need || 0) <= 3 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 046 Maes Hughes — [Main][Discard 1][1/turn] +1000 BP this turn. @[On Retire] if you have 2 or
  // fewer cards in hand, draw 1.
  reg['UA37BT-FMA-1-046'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onSideline(G, p, unit) { if (p.hand.length <= 2) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 050 Riza Hawkeye — [On Play] look at the top 2, split any between top and bottom.
  reg['UA37BT-FMA-1-050'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 053 Roy Mustang — [On Play] choose up to 1 enemy Front Line character with BP 1500 or more,
  // -1000 BP this turn.
  reg['UA37BT-FMA-1-053'] = { async onPlay(G, p, unit) { await H.debuffEnemyAny(p, -1000, { min: 1500 }); } };

  // 054 Roy Mustang — [Your Turn] if 2 or fewer cards in hand, +1000 BP. @[When Attacking] if 0
  // cards in hand, draw up to 1.
  reg['UA37BT-FMA-1-054'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p.hand.length <= 2) ? 1000 : 0; },
    async onAttack(G, p, unit) { if (!p.hand.length) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 059 Olivier Mira Armstrong — [On Play][1/turn] if you played a card with a printed AP cost of
  // 2 or more on your area this turn, untap 1 AP.
  reg['UA37BT-FMA-1-059'] = { async onPlay(G, p, unit) { if ([...(p._playedApCostsThisTurn || [])].some(ap => ap >= 2)) await H.apUntap(p, 1); } };

  // 062 Miles — passive: if 3+ Trait:Briggs cards on your area, +1 generated energy.
  reg['UA37BT-FMA-1-062'] = { genMod(unit, p) { return [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Briggs')).length >= 3 ? 1 : 0; } };

  // 063 Fort Briggs (Field) — [On Play] reduce the AP cost of the next Trait:Briggs card used this
  // turn by 1. @[Main][Rest][1/turn] only if you played a card with printed AP 2+ this turn: draw 1.
  reg['UA37BT-FMA-1-063'] = {
    async onPlay(G, p, unit) { p.pendingDiscount = { predicate: c => (c.traits || '').includes('Briggs'), apDelta: -1 }; log(`${unit.card.name}: Trait:Briggs ใบถัดไป ลด AP cost 1`); },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (![...(p._playedApCostsThisTurn || [])].some(ap => ap >= 2)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 064 "The military is crazy!!" — draw 2. Then if you have exactly 2 cards in hand, draw 1 more.
  reg['UA37BT-FMA-1-064'] = { async onEvent(G, p, card) { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); if (p.hand.length === 2) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`); } } };

  // 066 "The Northern Wall of Briggs" — choose 1 enemy Front Line character with BP 5000 or less,
  // rest it and it won't stand next time (retire instead if there is an Olivier Mira Armstrong on
  // your area).
  reg['UA37BT-FMA-1-066'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Olivier Mira Armstrong')) { await H.retireEnemyFront(p, 5000); return; }
      const t = await H.restEnemyFront(p, 5000);
      if (t) t.skipNextStand = true;
    },
  };

  // 069 Shou Tucker — [On Play] you may place 2 cards from hand to the Outside Area; if you did,
  // free-play 1 Nina & Alexander from your Outside Area rested (skipped: "or raid it").
  reg['UA37BT-FMA-1-069'] = {
    async onPlay(G, p, unit) {
      if (p.hand.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ด 2 ใบจากมือไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: เลือกการ์ดจากมือ (${i + 1}/2)`); if (idx == null) return; p.sideline.push(p.hand.splice(idx, 1)[0]); }
      const idx = p.sideline.findIndex(no => (byNo(no)?.name || '').includes('Nina & Alexander'));
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 071 Solf J. Kimblee — [On Play] choose up to 1 enemy Front Line character, -1000 BP this turn.
  reg['UA37BT-FMA-1-071'] = { async onPlay(G, p, unit) { await H.debuffEnemyFront(p, -1000); } };

  // 072 Solf J. Kimblee — [On Play] you may place 1 card from hand to the Outside Area; if you did,
  // draw 1 (2 instead if the placed card was Philosopher's Stone).
  reg['UA37BT-FMA-1-072'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      const n = (byNo(no)?.name || '').includes("Philosopher's Stone") ? 2 : 1;
      Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ`);
    },
  };

  // 076 Envy — your Character Cards with [Raid] can raid this card even without the printed
  // Raided-name match. @[On Play] if 10+ cards in your Outside Area, choose up to 1 enemy Front
  // Line character with BP 3000 or less and rest it.
  reg['UA37BT-FMA-1-076'] = {
    async onPlay(G, p, unit) { if (p.sideline.length >= 10) await H.restEnemyFront(p, 3000); },
  };

  // 095 "Nationwide Transmutation Circle" (Field) — [Main][Rest][1/turn] place the top card of your
  // deck to the Outside Area; if you then have 20+ cards in your Outside Area, draw 1.
  reg['UA37BT-FMA-1-095'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      const no = p.deck.shift();
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`);
      if (p.sideline.length >= 20) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 096 "I hate perceptive brats like you" — your opponent claims whether you have Nina & Alexander
  // in hand; you draw 3 and reveal your hand; if the claim was correct, place 3 cards from your
  // hand to the Remove Area.
  reg['UA37BT-FMA-1-096'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const guess = await enemy.controller.chooseOption(enemy, `${card.name}: ทายว่าฝ่ายตรงข้ามมี Nina & Alexander ในมือหรือไม่`, [
        { label: 'มี Nina & Alexander ในมือ', value: true }, { label: 'ไม่มี Nina & Alexander ในมือ', value: false },
      ]);
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
      const actual = p.hand.some(no => (byNo(no)?.name || '').includes('Nina & Alexander'));
      log(`${card.name}: เปิดเผยมือของ ${p.name}`);
      if (guess === actual) {
        for (let i = 0; i < 3 && p.hand.length; i++) { const idx = await p.controller.chooseCardFromHand(p, `${card.name}: เลือกการ์ดไป Remove Area (${i + 1}/3)`); if (idx == null) break; p.removal.push(p.hand.splice(idx, 1)[0]); }
      }
    },
  };

  // 099 "Homunculus" — place the top 2 cards of your deck to the Outside Area. Add up to 1 purple
  // Trait:Homunculus card from your Outside Area to your hand.
  reg['UA37BT-FMA-1-099'] = {
    async onEvent(G, p, card) {
      const n = Math.min(2, p.deck.length);
      if (n) { const sent = p.deck.splice(0, n); p.sideline.push(...sent); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n; log(`${card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      await H.fetchFromSideline(p, c => c && c.color === 'Purple' && (c.traits || '').includes('Homunculus'), `${card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 101 Alphonse Elric (ST) — [On Play] if played by your effect, draw 1. @[Main][Discard 2][1/turn]
  // set self active, +500 BP this turn.
  reg['UA37ST-FMA-1-101'] = {
    async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (p.hand.length < 2) return;
      for (let i = 0; i < 2; i++) { const idx = await p.controller.chooseCardFromHand(p, `${unit.card.name}: [Discard 2] (${i + 1}/2)`); if (idx == null) return; p.removal.push(p.hand.splice(idx, 1)[0]); }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false; unit.bpMod += 500;
      log(`${unit.card.name}: Active และ +500 BP เทิร์นนี้`);
    },
  };

  // 102 Edward Elric (ST) — [On Play] look at the top 2, keep any number on top (any order),
  // remainder to the Outside Area.
  reg['UA37ST-FMA-1-102'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 107 Roy Mustang (ST) — [On Play] choose up to 1 enemy Front Line character with BP 3000 or
  // less and place it in the Remove Area.
  reg['UA37ST-FMA-1-107'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await forceToRemoval(enemy, t, 'effect');
    },
  };

  // 109 "Let's Go Home Together" — add up to 1 (Edward Elric or Alphonse Elric) from your Outside
  // Area to your hand. Free-play up to 1 same (fulfilled energy, ap1) from hand rested (skipped:
  // "or raid it").
  reg['UA37ST-FMA-1-109'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && /Edward Elric|Alphone Elric|Alphonse Elric/.test(c.name || ''), `${card.name}: เลือกการ์ดจาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && /Edward Elric|Alphonse Elric/.test(c.name || '') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 113 King Bradley — [On Play] choose up to 1 other character, grant "cannot be chosen by your
  // opponent's Trigger effects" this turn (approximated as full untargetable protection).
  reg['UA37ST-FMA-1-113'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ป้องกันการเป็นเป้าหมายจาก Trigger effect เทิร์นนี้`); }
    },
  };
})();
