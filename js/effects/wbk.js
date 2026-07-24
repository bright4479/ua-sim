// ══════════ UA SIM — Windbreaker (WBK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function hasBofurin(u) { return /furin/i.test(u.card.traits || ''); }
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
  async function sendEnemyToDeck(p, enemy, unit, chooserIsP) {
    for (const line of [enemy.front, enemy.energy]) { const i = line.indexOf(unit); if (i >= 0) { line.splice(i, 1); break; } }
    for (const c of unit.under) enemy.sideline.push(c); unit.under = [];
    if (unit.counters.length) { enemy.sideline.push(...unit.counters); unit.counters = []; }
    const chooser = chooserIsP ? p : enemy;
    const dest = await chooser.controller.chooseOption(chooser, `${unit.card.name}: วางไว้บนสุดหรือล่างสุดของเด็คเจ้าของ?`, [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
    if (dest === 'top') enemy.deck.unshift(unit.no); else enemy.deck.push(unit.no);
    log(`${unit.card.name}: กลับเด็คของ ${enemy.name} (${dest === 'top' ? 'บนสุด' : 'ล่างสุด'})`);
    await Effects.onLeaveField(Engine.G, enemy, unit);
  }

  // 001 Haruka Sakura (both prints) — [On Play] free-play 1 green Trait:Tamon Team (need<=2, ap1)
  // from your hand rested.
  const haruka001 = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.traits || '').includes('Tamon Team') && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };
  reg['UA01PC-WBK-1-001'] = haruka001;
  reg['UA38BT-WBK-1-001'] = haruka001;

  // 004 Minoru Kanuma — [Main][Rest] place this card and 1 Yukinari Arima from your Outside Area
  // to the Remove Area; if you did, draw 2.
  reg['UA38BT-WBK-1-004'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const idx = p.sideline.findIndex(no => (byNo(no)?.name || '').includes('Yukinari Arima'));
      if (idx < 0) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      unit.rested = true;
      const arimaNo = p.sideline.splice(idx, 1)[0];
      p.removal.push(arimaNo);
      await Engine.sidelineUnit(p, unit, 'effect');
      const si = p.sideline.indexOf(unit.no);
      if (si >= 0) { p.sideline.splice(si, 1); p.removal.push(unit.no); }
      log(`${unit.card.name}: ตัวเองและ ${byNo(arimaNo)?.name} ไป Remove Area`);
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 010 Jo Togame — [On Play] look at the top 2, place any number on top and the rest on the
  // bottom of your deck, in any order.
  reg['UA38BT-WBK-1-010'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 025 Hayato Suo — [On Play] look at the top 2, place up to 1 yellow Trait:Bofurin among them to
  // the Outside Area, remainder to the top.
  reg['UA38BT-WBK-1-025'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.color === 'Yellow' && hasBofurin({ card: c })); } };

  // 030 Akihiko Nirei — [Main][Rest+Retire] free-play 1 yellow Trait:Bofurin (other than this
  // card, need<=1) from your Outside Area to your area rested.
  reg['UA38BT-WBK-1-030'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && c.name !== 'Akihiko Nirei' && (c.traits || '').includes('furin') && (c.need || 0) <= 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 032 Toma Hiragi — [When Attacking] if there is a Hajime Umemiya on your area, draw 1.
  reg['UA38BT-WBK-1-032'] = { async onAttack(G, p, unit) { if (H.hasCardNamed(p, 'Hajime Umemiya')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 035 "I Will Not Lose, 100%" — choose 1 enemy Front Line character with BP <= (Trait:Bofurin
  // cards on your area x1000) and retire it.
  reg['UA38BT-WBK-1-035'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(hasBofurin).length; await H.retireEnemyFront(p, n * 1000); } };

  // 036 "This Is Not A Place For Trash" — reduce the AP cost of the next Trait:Shishitoren card you
  // use this turn by 1. Place up to 2 Trait:Shishitoren cards from your Outside Area to the Remove
  // Area. Then, if you have no Character Cards in your Outside Area, draw up to 1.
  reg['UA38BT-WBK-1-036'] = {
    async onEvent(G, p, card) {
      p.pendingDiscount = { predicate: c => (c.traits || '').includes('Shishitoren'), apDelta: -1 };
      log(`${card.name}: Trait:Shishitoren ใบถัดไป ลด AP cost 1`);
      for (let i = 0; i < 2; i++) {
        const idx = p.sideline.findIndex(no => (byNo(no)?.traits || '').includes('Shishitoren'));
        if (idx < 0) break;
        p.removal.push(p.sideline.splice(idx, 1)[0]);
      }
      if (!p.sideline.some(no => byNo(no)?.type === 'Character')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 037 "A Fight Is A 'Conversation'" — choose any number of Trait:Bofurin characters on your area
  // (no duplicate names), +1000 BP and "when wins a battle, draw up to 1" this turn.
  reg['UA38BT-WBK-1-037'] = {
    async onEvent(G, p, card) {
      const seen = new Set();
      const targets = [...p.front, ...p.energy].filter(u => hasBofurin(u) && !seen.has(u.card.name) && seen.add(u.card.name));
      for (const t of targets) { t.bpMod += 1000; t._grantedOnWinDraw = true; }
      if (targets.length) log(`${card.name}: Trait:Bofurin (ชื่อไม่ซ้ำ) ${targets.length} ใบ +1000 BP และ "ชนะแล้วจั่ว 1 ใบ" เทิร์นนี้`);
    },
  };

  // 044 Hajime Umemiya — [On Play] add up to 1 green Character (need<=2) and up to 1 green
  // Character (need>=3, other than this card) from your Outside Area to your hand. If Kotoha
  // Tachibana was added this way, set this character active.
  reg['UA38BT-WBK-1-044'] = {
    async onPlay(G, p, unit) {
      const added = [];
      const no1 = await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2, `${unit.card.name}: เลือก Character สีเขียว (Energy 2 หรือน้อยกว่า)`);
      if (no1 != null) added.push(no1);
      const no2 = await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) >= 3 && c.name !== 'Hajime Umemiya', `${unit.card.name}: เลือก Character สีเขียว (Energy 3+)`);
      if (no2 != null) added.push(no2);
      if (added.some(no => (byNo(no)?.name || '').includes('Kotoha Tachibana'))) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 049 Mitsuki Kiryu — [Main][Rest] choose up to 1 other character on your area, +1000 BP this
  // turn. Return this card to your hand.
  reg['UA38BT-WBK-1-049'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 051 Yuto Kusumi — [On Play] choose up to 1 Ren Kaji on your area, it gains "when attacks and
  // wins, draw up to 1" this turn.
  reg['UA38BT-WBK-1-051'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Ren Kaji'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Ren Kaji`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedOnWinDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "ชนะแล้วจั่ว 1 ใบ" เทิร์นนี้`); }
    },
  };

  // 054 Haruka Sakura — [Main][Frontline][1/turn] choose 1 character on your Energy Line, either
  // rest it or set it active.
  reg['UA38BT-WBK-1-054'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.energy.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, p.energy, `${unit.card.name}: เลือกการ์ดบน Energy Line`);
      const t = p.energy.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอนหรือ Active?`, [{ label: 'วางนอน', value: 'rest' }, { label: 'Active', value: 'active' }]);
      t.rested = v === 'rest';
      log(`${unit.card.name}: ${t.card.name} ${v === 'rest' ? 'ถูกวางนอน' : 'Active'}`);
    },
  };

  // 057 Hayato Suo — [Main][When in Energy Line][1/turn] only if this character is resting: look
  // at the top of your deck, place it on top or the Outside Area.
  reg['UA38BT-WBK-1-057'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Energy Line'); return; }
      if (!unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Rest'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 059 Hayato Suo — [On Play] you may rest 1 active Hayato Suo on your area; if you did, look at
  // the top 2, add 1 to your hand, remainder to the Outside Area.
  reg['UA38BT-WBK-1-059'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => !u.rested && (u.card.name || '').includes('Hayato Suo'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน Hayato Suo?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Hayato Suo');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const i = await p.controller.chooseOption(p, `${unit.card.name}: เลือกการ์ดเข้ามือ`, revealed.map((no, idx) => ({ label: byNo(no)?.name || no, value: idx })));
      const no = revealed.splice(i ?? 0, 1)[0];
      p.hand.push(no);
      p.sideline.push(...revealed);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ ที่เหลือไป Outside Area`);
    },
  };

  // 060 Hayato Suo — [On Play] choose up to 1 character on your area, it gains (approximated as
  // untargetable) "opponent must pay 1 additional AP to choose this character" until the start of
  // your next turn. (Skipped: the "[When in Energy Line] when rested by your character's effect,
  // ..." reactive — no hook distinguishes "rested by an effect" from ordinary resting.)
  reg['UA38BT-WBK-1-060'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy];
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUntargetable = true; log(`${unit.card.name}: ${t.card.name} ป้องกันการเป็นเป้าหมายเทิร์นนี้`); }
    },
  };

  // 063 Kyotaro Sugishita — [Main][Frontline][1/turn] only if this character is active: rest 3
  // active characters on your area; if you did, this character gains "[When Attacking] draw up to
  // 1" this turn.
  reg['UA38BT-WBK-1-063'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const actives = [...p.front, ...p.energy].filter(u => !u.rested);
      if (actives.length < 3) { p.controller.notify?.('ต้องมี character Active อย่างน้อย 3 ใบ'); return; }
      unit._usedTurn = Engine.G.turn;
      for (let i = 0; i < 3; i++) {
        const uid = await p.controller.chooseOwnCharacter(p, actives.filter(u => !u.rested), `${unit.card.name}: เลือก character วางนอน (${i + 1}/3)`);
        const t = actives.find(x => x.uid === uid);
        if (t) t.rested = true;
      }
      unit._grantedAttackDraw = true;
      log(`${unit.card.name}: ได้รับ "โจมตีแล้วจั่ว 1 ใบ" เทิร์นนี้`);
    },
  };

  // 064 Kyotaro Sugishita — when this character attacks and is blocked, you may draw 1; if you
  // did, place 1 card from hand to the Outside Area.
  async function sugishita064(p, unit) {
    const v = await p.controller.chooseOption(p, `${unit.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
    if (!v) return;
    Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    await H.discardFromHand(p);
  }
  reg['UA38BT-WBK-1-064'] = {
    async onWinBattle(G, p, atk) { await sugishita064(p, atk); return false; },
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) { if (atk === self) await sugishita064(p, atk); },
  };

  // 068 Akihiko Nirei — [On Play] choose up to 1 other Trait:Bofurin character on your area, +1000
  // BP this turn.
  reg['UA38BT-WBK-1-068'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && hasBofurin(u));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Bofurin`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 069 Akihiko Nirei — [Main][Rest+Retire] add 1 green Character (need<=3) from your Outside Area
  // to your hand.
  reg['UA38BT-WBK-1-069'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 3, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 072 Toma Hiragi — [Main][Frontline][1/turn] choose 1 other character on your area, +500 BP
  // this turn.
  reg['UA38BT-WBK-1-072'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
    },
  };

  // 075 "Shall We Climb The Stairs To Adulthood?" — choose 1 enemy Front Line character with BP
  // 5000 or less and place it on top or bottom of their deck, by their choice (by your choice
  // instead if there is a Hayato Suo on your area).
  reg['UA38BT-WBK-1-075'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await sendEnemyToDeck(p, enemy, t, H.hasCardNamed(p, 'Hayato Suo'));
    },
  };

  // 077 "It Was Hard, You Know... For Me" — add up to 1 Hayato Suo from your Outside Area to your
  // hand. Free-play up to 1 Hayato Suo (fulfilled energy) from your hand rested (skipped: the "or
  // raid it" alternative).
  reg['UA38BT-WBK-1-077'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Hayato Suo'), `${card.name}: เลือกการ์ดจาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes('Hayato Suo') && Engine.hasEnergyFor(p, c); });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };
})();
