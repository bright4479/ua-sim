// ══════════ UA SIM — Kamen Rider (KMR) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. This series has an unusually
// high density of multi-clause, bespoke combo mechanics (raid chains, tiered effect grants, a
// "bury a whole character face-down under another" resource, a "place N same-cost cards" cost).
// Cards with a mechanic requiring net-new engine infrastructure that would only ever serve 1-2
// cards are left unscripted with a documented reason rather than guessed at.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // "Place 3 cards with the same required energy from your hand to the Outside Area." — a cost
  // shape unique to this series' OOO Combo cards. Simplified: picks the first need-value with
  // enough cards rather than offering a choice among multiple valid groups.
  async function placeSameNeedCost(p, n) {
    if (p.hand.length < n) return false;
    const groups = {};
    for (const no of p.hand) { const c = byNo(no); const need = c?.need ?? 0; (groups[need] ||= []).push(no); }
    const validNeeds = Object.keys(groups).filter(k => groups[k].length >= n);
    if (!validNeeds.length) return false;
    const need = validNeeds[0];
    const pool = groups[need].slice(0, n);
    for (const no of pool) {
      const idx = p.hand.indexOf(no);
      if (idx < 0) continue;
      p.hand.splice(idx, 1);
      p.sideline.push(no);
    }
    log(`${p.name}: ส่งการ์ด Energy=${need} จำนวน ${n} ใบไป Outside Area`);
    return true;
  }

  // ── EX12BT-KMR-2 ──────────────────────────────────────────────────────

  // 001 Valen Chocodan Form — [On Play] look at top 2, place up to 1 Gavv/Valen/Vram-named or
  // Gochizo-named card to Outside Area, remainder on top.
  reg['EX12BT-KMR-2-001'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => ['Gavv', 'Valen', 'Vram'].some(n => (c.name || '').includes(n)) || (c.name || '').includes('Gochizo'));
    },
  };

  // 002 Valen Frappe Custom — [Main][1/turn] gated on self-resting: retire own Gochizo to set self
  // Active. @[Main][Frontline][Rest][1/turn] rest 1 enemy Front Line character BP≤3000.
  reg['EX12BT-KMR-2-002'] = {
    async onMain(G, p, unit) {
      const opts = [];
      const gochizo = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gochizo'));
      if (unit._usedTurn1 !== Engine.G.turn && unit.rested && gochizo.length) opts.push({ label: 'Retire Gochizo เพื่อ Active ตัวเอง', value: 'a' });
      if (unit._usedTurn2 !== Engine.G.turn && p.front.includes(unit) && !unit.rested) opts.push({ label: '[Rest] วางนอน character ศัตรู (BP≤3000)', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseOwnCharacter(p, gochizo, 'เลือก Gochizo เพื่อ retire');
        const t = gochizo.find(x => x.uid === uid);
        if (!t) return;
        unit._usedTurn1 = Engine.G.turn;
        await Engine.sidelineUnit(p, t, 'effect');
        unit.rested = false;
        log(`${unit.card.name}: Active ตัวเอง`);
      } else {
        unit._usedTurn2 = Engine.G.turn;
        unit.rested = true;
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
        if (!targets.length) return;
        const uid2 = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3000)`, true);
        const t2 = targets.find(x => x.uid === uid2);
        if (t2) { t2.rested = true; log(`${unit.card.name}: ${t2.card.name} ถูกวางนอน`); }
      }
    },
  };

  // 004 Vram Pudding Custom — [On Play] may rest own active Gochizo; if did, draw 1.
  reg['EX12BT-KMR-2-004'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gochizo') && !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางนอน Gochizo? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 005 Gavv Over Mode — [On Play][When Attacking] fetch 1 Gochizo from Outside Area to hand.
  // (Skipped: the raid-chain "return top card + re-raid" mechanic and the played-by-effect
  // +3000BP/untargetable grant — too complex/risky to reimplement faithfully.)
  reg['EX12BT-KMR-2-005'] = {
    async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.name || '').includes('Gochizo'), `${unit.card.name}: เลือก Gochizo จาก Outside Area`); },
    async onAttack(G, p, unit) { await H.fetchFromSideline(p, c => c && (c.name || '').includes('Gochizo'), `${unit.card.name}: เลือก Gochizo จาก Outside Area`); },
  };

  // 006 Gavv Caking Form — [Main][1/turn] gated on 3+ Gochizo (area+Outside Area), +1 energy
  // generation this turn (approximates "until the start of your next turn"). @[Main][Rest] may
  // retire own Gochizo to free-play a yellow traitless character (energy≤1) from hand, rested.
  reg['EX12BT-KMR-2-006'] = {
    async onMain(G, p, unit) {
      const gochizoCount = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gochizo')).length +
        p.sideline.filter(no => (byNo(no)?.name || '').includes('Gochizo')).length;
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && gochizoCount >= 3) opts.push({ label: '+1 energy generation เทิร์นนี้', value: 'gen' });
      const gochizo = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gochizo'));
      if (!unit.rested && gochizo.length) opts.push({ label: '[Rest] Retire Gochizo แล้วลง character สีเหลืองไม่มี trait (Energy≤1) จากมือ', value: 'retire' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'gen') { unit._usedTurn1 = Engine.G.turn; unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
      else {
        const uid = await p.controller.chooseOwnCharacter(p, gochizo, 'เลือก Gochizo เพื่อ retire');
        const t = gochizo.find(x => x.uid === uid);
        if (!t) return;
        unit.rested = true;
        await Engine.sidelineUnit(p, t, 'effect');
        const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 1 && !(c.traits || '').trim(); });
        if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      }
    },
  };

  // 007 Gavv Zakuzakuchips Form — [Main][Frontline][1/turn] retire own Gochizo; self +2000 BP this turn.
  reg['EX12BT-KMR-2-007'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Gochizo'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Gochizo'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Gochizo เพื่อ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      unit.bpMod += 2000;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 008 Gavv Blizzard Sorbet Form — passive +1000 BP on your turn if a character was retired this
  // turn (approximates "if a Gochizo was retired" with the general retirement counter). (Skipped:
  // the granted "move to Front Line at end of attack while in Energy Line" ability.)
  reg['EX12BT-KMR-2-008'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && Engine.G.retiredThisTurn) ? 1000 : 0; },
  };

  // 014 Happy Birthday (Field) — enters Active (kw.entersActive). [Main][Rest][Discard1][Pay1AP]
  // play 1 Gochizo from Outside Area to Energy Line, Active.
  reg['EX12BT-KMR-2-014'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const pred = c => c && (c.name || '').includes('Gochizo');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Gochizo ใน Outside Area'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Gochizo', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 015 (Event) — choose 1 enemy Front Line character BP≤5000, place top/bottom of their deck
  // (opponent's choice; your choice instead if own Gavv-named).
  reg['EX12BT-KMR-2-015'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const chooser = H.hasCardNamed(p, 'Gavv') ? p : enemy;
      const v = await chooser.controller.chooseOption(chooser, `${card.name}: วาง ${t.card.name} ไว้บนหรือใต้เด็ค?`,
        [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      enemy.front.splice(enemy.front.indexOf(t), 1);
      if (v === 'top') enemy.deck.unshift(t.no); else enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป${v === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็ค`);
    },
  };

  // 017 Woz Futuring Shinobi — [Main][Rest][1/turn] may rest 1 active own Front Line character; if did, +1 energy generation this turn.
  reg['EX12BT-KMR-2-017'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = p.front.filter(u => u !== unit && !u.rested && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางนอน character บน Front Line? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      unit.tempGen += 1;
      log(`${unit.card.name}: +1 energy generation เทิร์นนี้`);
    },
  };

  // 018 Geiz Wizard Armor — [On Play] choose: draw 1, discard 1; or reveal a non-yellow [Raid] card
  // (BP≤4000) from hand for draw 2, discard 1.
  reg['EX12BT-KMR-2-018'] = {
    async onPlay(G, p, unit) {
      const pred = no => { const c = byNo(no); return c && c.color !== 'Yellow' && Engine.parseKeywords(c).raidTargets.length && (c.bp || 0) <= 4000; };
      const opts = [{ label: 'จั่ว 1 ใบ แล้วทิ้ง 1 ใบ', value: 'a' }];
      if (p.hand.some(pred)) opts.push({ label: 'เปิดเผยการ์ด [Raid] ที่ไม่ใช่สีเหลือง (BP≤4000) แล้วจั่ว 2 ใบ ทิ้ง 1 ใบ', value: 'b' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'b') { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); }
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 023 Ex-Aid Hunter Action Gamer Level 5 — passive +1500 BP on your turn if this character has a
  // face-down card. (Skipped: the "bury a chosen Ex-Aid character face-down under this one, draw 1,
  // free-play a Doctor" [On Play] clause — same bury mechanic as the UA29BT Ex-Aid line below, but
  // this one is left partial for time.)
  reg['EX12BT-KMR-2-023'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && unit.counters.length) ? 1500 : 0; },
  };

  // 025 OOO Burakawani Combo — [On Play] fetch up to 2 need-0 OOO-named cards from Outside Area to
  // hand (discard 1 if both added). @[Main][1/turn] place 3 same-need cards from hand to Outside
  // Area; if did, choose 1 own character +1000 BP this turn, draw 3.
  reg['EX12BT-KMR-2-025'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && (c.type === 'Field' || c.type === 'Event' || c.type === 'Character') && (c.name || '').includes('OOO') && (c.need || 0) === 0;
      let added = 0;
      for (let i = 0; i < 2; i++) {
        if (!p.sideline.some(no => pred(byNo(no)))) break;
        const idx = await p.controller.chooseCardFromSideline(p, `เลือกการ์ด OOO (${i + 1}/2)`, pred);
        if (idx == null) break;
        const no = p.sideline.splice(idx, 1)[0];
        p.hand.push(no);
        added++;
      }
      if (added === 2) await H.discardFromHand(p);
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const ok = await placeSameNeedCost(p, 3);
      if (!ok) { p.controller.notify?.('ไม่มีการ์ด Energy เท่ากัน 3 ใบในมือ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.buffOwnCharacter(p, 1000);
      Engine.draw(p, 3); log(`${unit.card.name}: จั่ว 3 ใบ`);
    },
  };

  // 031 Fourze Fire States — passive genMod +1 if 3+ other Trait:Amanogawa cards on area.
  reg['EX12BT-KMR-2-031'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner) return 0;
      return [...owner.front, ...owner.energy].filter(u => u !== unit && (u.card.traits || '').includes('Amanogawa')).length >= 3 ? 1 : 0;
    },
  };

  // 042 Space is here! (Event) — draw 2; may send 1 own Fourze-named character to Remove Area for draw 1.
  reg['EX12BT-KMR-2-042'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Fourze'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: ส่ง Fourze ไป Remove Area เพื่อจั่วเพิ่ม? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      p.removal.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป Remove Area`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 048 W CycloneJoker — [On Play] look at top 5, fetch 1 Memory Change card to hand, discard 1 if
  // added. (Skipped: the "if played by Memory Change, pay 1 AP for a set-active-when-blocked" clause.)
  reg['EX12BT-KMR-2-048'] = {
    async onPlay(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 5, c => (c.name || '').includes('Memory Change'), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 051 W CycloneMetal — passive "[Opponent's Turn] -1500 BP" now handled generically (bpEvaluator
  // widened to accept a negative flat modifier).

  // 052 W HeatJoker — [On Play] choose 1 character (energy≤2, "W" in name) +2000 BP this turn.
  reg['EX12BT-KMR-2-052'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.need || 0) <= 2 && (u.card.name || '').includes('W'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (Energy≤2, มี "W" ในชื่อ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
    },
  };

  // 056 W LunaJoker — [On Play][Frontline][once ever] free-play 1 green character (BP≤1500, "W" in name) from hand, rested.
  reg['EX12BT-KMR-2-056'] = {
    async onPlay(G, p, unit) {
      if (unit._usedEver || !p.front.includes(unit)) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.bp || 0) <= 1500 && (c.name || '').includes('W'); });
      if (idx < 0) return;
      unit._usedEver = true;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 057 W LunaTrigger — [On Play] draw 1.
  reg['EX12BT-KMR-2-057'] = { async onPlay(G, p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };

  // 060 Don't Question Me (Event) — draw 1, free-play 1 green character (energy≤1, AP1) from hand, rested.
  reg['EX12BT-KMR-2-060'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 1 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 061 Now, Count up your Sins (Event) — retire 1 enemy Front Line character with BP ≤ 1000 × (own "W"-named + Memory Change count).
  reg['EX12BT-KMR-2-061'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('W') || (u.card.name || '').includes('Memory Change')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 075 Blade (DCD) — passive +1000 BP on your turn if own Decade-named card.
  reg['EX12BT-KMR-2-075'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && H.hasCardNamed(p, 'Decade')) ? 1000 : 0; },
  };

  // 080 Sieg — [On Play] look at top 3, place 1 to Outside Area, remainder to bottom. (Skipped:
  // the "retire self at the start of your Main Phase, free-play an Imagin from Outside Area" clause
  // — no hook fires specifically at the start of Main Phase.)
  reg['EX12BT-KMR-2-080'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ด 1 ใบส่งไป Outside Area`, null, 1);
      const idx = picked[0] ?? 0;
      const no = revealed.splice(idx, 1)[0];
      p.sideline.push(no);
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      p.deck.push(...revealed);
    },
  };

  // 084 Ouja — [On Play] may pay 1 AP and discard a Final Vent card to retire 1 enemy Front Line
  // character BP≤5000, then fetch a card with the same BP from Outside Area to hand.
  reg['EX12BT-KMR-2-084'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.name || '').includes('Final Vent'));
      if (idx < 0 || Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP และทิ้ง Final Vent เพื่อ retire ศัตรู?`,
        [{ label: 'ทำ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payApForEffect(p, 1)) return;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const bpVal = Engine.bp(t);
      await Engine.sidelineUnit(enemy, t, 'effect');
      await H.fetchFromSideline(p, c => c && (c.bp || 0) === bpVal, `${unit.card.name}: เลือกการ์ด (BP=${bpVal}) จาก Outside Area`);
    },
  };

  // 085 Zolda — [Main][1/turn] discard a Final Vent card; self +1000 BP this turn. (Skipped: the
  // "can attack from Energy Line this turn" grant — no engine field represents this restriction lift.)
  reg['EX12BT-KMR-2-085'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const idx = p.hand.findIndex(no => (byNo(no)?.name || '').includes('Final Vent'));
      if (idx < 0) { p.controller.notify?.('ไม่มี Final Vent ในมือ'); return; }
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 086 Knight — [On Play] look at top 2, place up to 1 Ryuki/Knight-named or Trait:Mirror Monster card to Outside Area, remainder on top.
  reg['EX12BT-KMR-2-086'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => ['Ryuki', 'Knight'].some(n => (c.name || '').includes(n)) || (c.traits || '').includes('Mirror Monster'));
    },
  };

  // 091 Ryuki — passive +1000 BP on your turn if own Knight-named card.
  reg['EX12BT-KMR-2-091'] = { bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && H.hasCardNamed(p, 'Knight')) ? 1000 : 0; } };

  // 093 Ryuki — [On Play] if own Knight-named card, draw 1.
  reg['EX12BT-KMR-2-093'] = { async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Knight')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 097 Sword Vent (Field) — enters Active. [Main][Rest] choose 1 own character +1000 BP this turn.
  reg['EX12BT-KMR-2-097'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 099 Advent (Event) — choose: draw 1, discard 1, free-play 1 Trait:Mirror Monster from Outside
  // Area, rested; or re-activate 1 own Trait:Mirror Monster's [On Play] effect and untap 1 AP.
  reg['EX12BT-KMR-2-099'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ ทิ้ง 1 ใบ แล้วลง Trait:Mirror Monster จาก Outside Area', value: 'a' },
        { label: 'เปิดใช้ [On Play] ของ Trait:Mirror Monster อีกครั้ง + Active AP', value: 'b' },
      ]);
      if (v === 'a') {
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
        await H.discardFromHand(p);
        const pred = c => c && (c.traits || '').includes('Mirror Monster');
        if (p.sideline.some(no => pred(byNo(no)))) {
          const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Mirror Monster', pred);
          if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
        }
      } else {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Mirror Monster'));
        if (targets.length) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Mirror Monster', true);
          const t = targets.find(x => x.uid === uid);
          if (t) { await Effects.onPlay(G, p, t); log(`${card.name}: เปิดใช้ [On Play] ของ ${t.card.name} อีกครั้ง`); }
        }
        await H.apUntap(p, 1);
      }
    },
  };

  // 100 Final Vent (Event) — choose 1 own character +2500 BP and a granted on-win draw this turn; if Ryuki-named, also [Snipe] this turn.
  reg['EX12BT-KMR-2-100'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2500;
      t._grantedOnWinDraw = true;
      log(`${card.name}: ${t.card.name} +2500 BP เทิร์นนี้ (ได้จั่วการ์ดถ้าชนะ battle)`);
      if ((t.card.name || '').includes('Ryuki')) { t.tempSnipe = true; log(`${card.name}: ${t.card.name} ได้ [Snipe] เทิร์นนี้`); }
    },
  };

  // ── UA29BT-KMR-1 ──────────────────────────────────────────────────────

  // 002 Kamen Rider Woz — passive +1500 BP on your turn if you revealed and added a non-yellow
  // [Raid] card from your deck to hand this turn (Engine's lookTopAndTake tracks this generically).
  reg['UA29BT-KMR-1-002'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && p._revealedNonYellowRaidThisTurn) ? 1500 : 0; },
  };

  // 003 Kamen Rider Woz Ginga Finaly — [Main][1/turn] gated on the same reveal condition; choose:
  // draw 1 discard 1, or self +1000 BP this turn.
  reg['UA29BT-KMR-1-003'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._revealedNonYellowRaidThisTurn) { p.controller.notify?.('ต้องเปิดเผยการ์ด [Raid] ที่ไม่ใช่สีเหลืองในเทิร์นนี้ก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ แล้วทิ้ง 1 ใบ', value: 'a' },
        { label: '+1000 BP เทิร์นนี้', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
    },
  };

  // 009 Kamen Rider GeizRevive Shippu — [Your Turn] +1000 BP. (Skipped: the "not affected by
  // BP-reducing effects" static immunity — would need every debuff call site to check it, too
  // invasive to retrofit for 1 card — and the end-of-Attack-Phase self-retire-and-replace clause.)
  reg['UA29BT-KMR-1-009'] = { bpBonus(p, unit) { return Engine.G.players[Engine.G.active] === p ? 1000 : 0; } };

  // 011 Kamen Rider Zi-O II — [On Play] look at top 2, split any number to top and the rest to bottom, any order.
  reg['UA29BT-KMR-1-011'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดไว้บนสุด`, null, n);
      const top = [], bottom = [];
      revealed.forEach((no, i) => { if (picked.includes(i)) top.push(no); else bottom.push(no); });
      p.deck.push(...bottom);
      p.deck.unshift(...top);
      log(`${unit.card.name}: จัดการ์ดบนสุดของเด็คใหม่`);
    },
  };

  // 014 Kamen Rider Zi-O BuildArmor — [On Play] may reveal the top of your deck: add to hand if
  // it's a non-yellow [Raid] card, otherwise place it on top or bottom.
  reg['UA29BT-KMR-1-014'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เปิดเผยการ์ดบนสุดของเด็ค?`,
        [{ label: 'เปิดเผย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const top = p.deck[0];
      const c = byNo(top);
      if (c.color !== 'Yellow' && Engine.parseKeywords(c).raidTargets.length) {
        p.deck.shift(); p.hand.push(top);
        p._revealedNonYellowRaidThisTurn = true;
        log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`);
      } else {
        const v2 = await p.controller.chooseOption(p, `${unit.card.name}: วาง ${c.name} ไว้บนหรือใต้เด็ค?`,
          [{ label: 'บนสุด (เหมือนเดิม)', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
        if (v2 === 'bottom') p.deck.push(p.deck.shift());
      }
    },
  };

  // 027 Kamen Rider Horobi — [Main][Discard1][1/turn] self +1000 BP this turn. @[Main][Frontline][1/turn] scry the top card (top or Outside Area).
  reg['UA29BT-KMR-1-027'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && p.hand.length) opts.push({ label: 'ทิ้ง 1 ใบ เพื่อ +1000 BP เทิร์นนี้', value: 'a' });
      if (unit._usedTurn2 !== Engine.G.turn && p.front.includes(unit)) opts.push({ label: 'ดูการ์ดบนสุดของเด็ค (วางบนเด็คหรือ Outside Area)', value: 'b' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'a') { unit._usedTurn1 = Engine.G.turn; await H.discardFromHand(p); unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else { unit._usedTurn2 = Engine.G.turn; await H.scryTop(p, ['top', 'outside']); }
    },
  };

  // 029 Satellite Ark (Field) — [Main][Rest][Retire] look at top 4, fetch 1 Trait:MetsubouJinrai
  // or Assault/Ark-named card to hand, remainder to bottom. (Skipped: the "[When in Outside Area]
  // [Pay1AP] replay this card if generated energy ≥3" clause — an ability usable while the card
  // sits in the Outside Area, not on the field, same class of gap noted for UA29ST-1-111.)
  reg['UA29BT-KMR-1-029'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('MetsubouJinrai') || (c.name || '').includes('Assault') || (c.name || '').includes('Ark'), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 030 IWAE! (Event) — look at top 7, fetch 1 Zi-O-named card and 1 non-yellow [Raid] card to hand, remainder to bottom.
  reg['UA29BT-KMR-1-030'] = {
    async onEvent(G, p, card) {
      const n = Math.min(7, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx1 = revealed.findIndex(no => (byNo(no)?.name || '').includes('Zi-O'));
      let picked1 = null;
      if (idx1 >= 0) picked1 = revealed.splice(idx1, 1)[0];
      const idx2 = revealed.findIndex(no => { const c = byNo(no); return c && c.color !== 'Yellow' && Engine.parseKeywords(c).raidTargets.length; });
      let picked2 = null;
      if (idx2 >= 0) picked2 = revealed.splice(idx2, 1)[0];
      if (picked1) { p.hand.push(picked1); log(`${card.name}: เพิ่ม ${byNo(picked1)?.name} เข้ามือ`); }
      if (picked2) { p.hand.push(picked2); p._revealedNonYellowRaidThisTurn = true; log(`${card.name}: เพิ่ม ${byNo(picked2)?.name} เข้ามือ`); }
      p.deck.push(...revealed);
    },
  };

  // 033 Rising Impact (Event) — rest 1 enemy Front Line character BP≤5000 (it skips its next
  // stand), retire instead if own Zero-One-named.
  reg['UA29BT-KMR-1-033'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Zero-One')) { await H.retireEnemyFront(p, 5000); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; t.skipNextStand = true; log(`${card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 034 / 035 Kamen Rider OOO Gatakiriba/Sagozo Combo — [Main][Frontline][1/turn] place 3 same-need
  // cards from hand to Outside Area; if did, play an OOO-named character (034) or rest an enemy
  // (035), then draw 3 at end of Main (drawn immediately here as an approximation of timing).
  reg['UA29BT-KMR-1-034'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const ok = await placeSameNeedCost(p, 3);
      if (!ok) { p.controller.notify?.('ไม่มีการ์ด Energy เท่ากัน 3 ใบในมือ'); return; }
      unit._usedTurn = Engine.G.turn;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.name || '').includes('OOO') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
      Engine.draw(p, 3); log(`${unit.card.name}: จั่ว 3 ใบ`);
    },
  };
  reg['UA29BT-KMR-1-035'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const ok = await placeSameNeedCost(p, 3);
      if (!ok) { p.controller.notify?.('ไม่มีการ์ด Energy เท่ากัน 3 ใบในมือ'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.restEnemyFront(p);
      Engine.draw(p, 3); log(`${unit.card.name}: จั่ว 3 ใบ`);
    },
  };

  // 041 Kamen Rider OOO Putotyra Combo — [On Play] choose up to 1 enemy Front Line character
  // BP≤4000, send to bottom of their deck; if your Life is 2+, place 1 Life card to the bottom of
  // your deck. (Skipped: the mandatory-raid and opponent-cannot-Active-trigger clauses.)
  reg['UA29BT-KMR-1-041'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (targets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤4000) ส่งไปใต้เด็ค`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { enemy.front.splice(enemy.front.indexOf(t), 1); enemy.deck.push(t.no); log(`${unit.card.name}: ${t.card.name} ถูกส่งไปใต้เด็ค`); }
      }
      if (p.life.length >= 2 && p.deck.length) {
        const no = p.life.shift();
        p.deck.push(no);
        log(`${unit.card.name}: ส่งการ์ดจาก Life ไปใต้เด็ค`);
      }
    },
  };

  // 044 Kamen Rider Genm Zombie Gamer Level X — [On Play] place 1 card from hand to Outside Area.
  // (Skipped: the "all-blue → return to hand on retire" and Remove-Area-retirement clauses.)
  reg['UA29BT-KMR-1-044'] = { async onPlay(G, p, unit) { await H.discardFromHand(p); } };

  // 045 Kamen Rider Birth — [Main][Rest][1/turn] choose 1 other own character +1000 BP this turn, return self to hand.
  reg['UA29BT-KMR-1-045'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 047 Birth-Day — [Main][1/turn] the next Cell Medal card you use this turn costs 1 less AP.
  reg['UA29BT-KMR-1-047'] = {
    costMod(p, card) {
      if (p._cellMedalDiscountTurn === Engine.G.turn && (card.name || '').includes('Cell Medal')) return { apDelta: -1 };
      return {};
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      p._cellMedalDiscountTurn = Engine.G.turn;
      log(`${unit.card.name}: การ์ด Cell Medal ใบถัดไปที่เล่นเทิร์นนี้ ลด AP 1`);
    },
  };

  // 048 / 050 / 051 Kamen Rider Ex-Aid (Action/Double Action/Maximum Gamer) — [On Play] "bury" a
  // chosen other Ex-Aid-named character (energy-gated) face-down under this character, taking its
  // own stacked face-down cards along with it (represented via unit.counters, mirroring the
  // face-down-card convention used elsewhere this session).
  reg['UA29BT-KMR-1-048'] = {
    genMod(unit) { return unit.counters.length ? 1 : 0; },
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.need || 0) <= 1 && (u.card.name || '').includes('Ex-Aid'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Ex-Aid (Energy≤1) ฝังไว้ใต้ตัวนี้? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      unit.counters.push(...t.counters, t.no);
      t.counters = [];
      log(`${unit.card.name}: ฝัง ${t.card.name} ไว้ใต้ตัวเอง`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };
  reg['UA29BT-KMR-1-050'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.need || 0) <= 3 && (u.card.name || '').includes('Ex-Aid'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Ex-Aid (Energy≤3) ฝังไว้ใต้ตัวนี้? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      unit.counters.push(...t.counters, t.no);
      t.counters = [];
      log(`${unit.card.name}: ฝัง ${t.card.name} ไว้ใต้ตัวเอง`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.need || 0) <= 3 && (c.name || '').includes('Ex-Aid'); });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };
  reg['UA29BT-KMR-1-051'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.need || 0) <= 5 && (u.card.name || '').includes('Ex-Aid'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Ex-Aid (Energy≤5) ฝังไว้ใต้ตัวนี้? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      unit.counters.push(...t.counters, t.no);
      t.counters = [];
      log(`${unit.card.name}: ฝัง ${t.card.name} ไว้ใต้ตัวเอง`);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const etargets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!etargets.length) return;
      const uid2 = await p.controller.chooseEnemyCharacter(p, etargets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t2 = etargets.find(x => x.uid === uid2);
      if (t2) { t2.effectsNullified = true; log(`${unit.card.name}: ${t2.card.name} เสีย effect ทั้งหมดจนถึงต้นเทิร์นถัดไปของคุณ`); }
    },
  };

  // 058 Kamen Rider Brave Fantasy Gamer Level 50 — [On Play] choose: place a face-down card under a
  // Trait:Doctor for +1000 BP, or free-play a blue Trait:Doctor (energy≤1, AP1) from hand, rested.
  reg['UA29BT-KMR-1-058'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      const doctors = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Doctor'));
      if (doctors.length && p.deck.length) opts.push({ label: 'วางการ์ดคว่ำใต้ Trait:Doctor +1000 BP', value: 'a' });
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('Doctor') && (c.need || 0) <= 1 && (c.ap || 0) === 1; });
      if (idx >= 0) opts.push({ label: 'ลง Trait:Doctor สีน้ำเงินจากมือ', value: 'b' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'a') {
        const uid = await p.controller.chooseOwnCharacter(p, doctors, 'เลือก Trait:Doctor');
        const t = doctors.find(x => x.uid === uid);
        if (!t) return;
        t.counters.push(p.deck.shift());
        t.bpMod += 1000;
        log(`${unit.card.name}: วางการ์ดคว่ำใต้ ${t.card.name}, +1000 BP เทิร์นนี้`);
      } else await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 060 Kamen Rider Paradox Puzzle Gamer Level 50 — [On Play] choose 1 other own character +1000
  // BP this turn. @[Main][Rest] bury self face-down under an Ex-Aid-named character.
  reg['UA29BT-KMR-1-060'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes('Ex-Aid'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character Ex-Aid');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(unit); if (i >= 0) line.splice(i, 1); }
      t.counters.push(...unit.counters, unit.no);
      log(`${unit.card.name}: ฝังตัวเองไว้ใต้ ${t.card.name}`);
    },
  };

  // 062 Ankh (Field) — [Main][Rest][1/turn] gated on 3+ cards placed to Outside Area this turn
  // (approximated with the general tracker, not scoped to specifically an OOO-named card's effect); draw 1.
  reg['UA29BT-KMR-1-062'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if ((p._placedToOutsideThisTurn || 0) < 3) { p.controller.notify?.('ต้องส่งการ์ดไป Outside Area อย่างน้อย 3 ใบในเทิร์นนี้ (ประมาณค่า)'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 063 / 065 Core Medal / Cell Medal — base draw effects. (Skipped: the "return from Outside Area
  // to hand at the end of your Attack Phase if OOO/Birth attacked" reactive — no end-of-Attack-Phase hook.)
  reg['UA29BT-KMR-1-063'] = { async onEvent(G, p, card) { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); } };
  reg['UA29BT-KMR-1-065'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.buffOwnCharacter(p, 500);
    },
  };

  // 068 Autobagin — [Main][Rest][Retire] fetch 1 Sparkle Cut from Outside Area to hand.
  reg['UA29BT-KMR-1-068'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.name || '').includes('Sparkle Cut');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Sparkle Cut ใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Sparkle Cut จาก Outside Area`);
    },
  };

  // 070 Kamen Rider Kaixa — passive +1000 BP if your Front Line has space. @[When Attacking] may retire 1 own Front Line character.
  reg['UA29BT-KMR-1-070'] = {
    bpBonus(p, unit) { return p.front.length < 4 ? 1000 : 0; },
    async onAttack(G, p, unit) {
      const targets = p.front.filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: Retire character บน Front Line? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(p, t, 'effect');
    },
  };

  // 071 Kamen Rider Zeronos Altair Form — [On Play] discard 1. @[Main][Frontline][only the turn
  // played] free-play 1 Deneb Imagin from hand, rested.
  reg['UA29BT-KMR-1-071'] = {
    async onPlay(G, p, unit) { await H.discardFromHand(p); },
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const idx = p.hand.findIndex(no => (byNo(no)?.name || '').includes('Deneb Imagin'));
      if (idx < 0) { p.controller.notify?.('ไม่มี Deneb Imagin ในมือ'); return; }
      unit._usedTurn = Engine.G.turn;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 076 Kamen Rider Den-O Climax Form — tiered multi-effect grant based on distinct Momotaros/
  // Urataros/Kintaros/Ryutaros count. (Skipped: too open-ended to hook in generically for a single card.)

  // 081 Kamen Rider Next Faiz — [When Attacking] draw up to 1 if you placed a card to the Outside
  // Area via your own effect this turn (p._placedToOutsideThisTurn). (Skipped: the reactive
  // "stash a discarded Trait:Faiz Gear card back on top of deck" clause and the meta BP-range-
  // increase clause, same class as KGR-1-071.)
  reg['UA29BT-KMR-1-081'] = {
    async onAttack(G, p, unit) {
      if (p._placedToOutsideThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 084 Kamen Rider Faiz — [On Play] may discard 1 to draw 2. @[Your Turn] +500 BP if you played a
  // Trait:Faiz Gear card from hand this turn.
  reg['UA29BT-KMR-1-084'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อจั่ว 2 ใบ?`);
      if (discarded) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p._playedTraitsThisTurn?.has('faiz gear') ? 500 : 0;
    },
  };

  // 085 Kamen Rider Faiz Axel Form — Raid-only card with an end-of-Attack-Phase reactive and a
  // once-per-turn attack trigger. (Skipped: too many interlocking bespoke mechanics for 1 card.)

  // ── UA29ST-KMR-1 ──────────────────────────────────────────────────────

  // 109 The Only One Who Can Stop You Is Me! (Event) — look at top 4, play up to 1 yellow
  // Trait:Hiden Intelligence character (energy≤4, AP1) among them, rested (Raid option not
  // automated), remainder to bottom.
  reg['UA29ST-KMR-1-109'] = {
    async onEvent(G, p, card) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Hiden Intelligence') && (c.need || 0) <= 4 && (c.ap || 0) === 1;
      const idx = revealed.findIndex(no => pred(byNo(no)));
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        p.hand.push(no);
        await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false });
      }
      p.deck.push(...revealed);
    },
  };

  // 110 Kamen Rider OOO Tatoba Combo — passive +500 BP per "Medal"-named card in your Outside Area.
  // @[On Play] place 3 same-need cards from hand to Outside Area; if did, retire 1 enemy Front Line
  // character BP≤4000, draw 3.
  reg['UA29ST-KMR-1-110'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.sideline.filter(no => (byNo(no)?.name || '').includes('Medal')).length * 500;
    },
    async onPlay(G, p, unit) {
      const ok = await placeSameNeedCost(p, 3);
      if (!ok) return;
      await H.retireEnemyFront(p, 4000);
      Engine.draw(p, 3); log(`${unit.card.name}: จั่ว 3 ใบ`);
    },
  };

  // 111 Kamen Rider Genm Action Gamer Level 0 — [On Retire][battle] choose 1 enemy character (any
  // zone) BP≥1500, -1000 BP. (Skipped: the "[Main][When in Outside Area]" play-from-Outside-Area
  // ability — same class of gap as UA29BT-1-029.)
  reg['UA29ST-KMR-1-111'] = {
    async onSideline(G, p, unit, reason) {
      if (reason !== 'battle') return;
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 113 Kamen Rider Muez — [On Play] opponent reveals the top of their deck; you choose to keep it
  // on top or send it to their Outside Area. @[On Retire] look at top 4, fetch 1 Faiz-named card to
  // hand, discard 1 if added.
  reg['UA29ST-KMR-1-113'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (!enemy.deck.length) return;
      const top = enemy.deck[0];
      const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุดของศัตรู (${byNo(top)?.name}) — วางไว้บนเด็คหรือ Outside Area ของศัตรู?`,
        [{ label: 'บนสุดของเด็ค (เหมือนเดิม)', value: 'top' }, { label: 'Outside Area ของศัตรู', value: 'outside' }]);
      if (v === 'outside') { enemy.sideline.push(enemy.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของศัตรูไป Outside Area`); }
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const taken = await H.lookTopAndTake(p, 4, c => (c.name || '').includes('Faiz'), 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };
})();
