// ══════════ UA SIM — Bleach (BLC) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  async function swapFrontEnergy(p, unit) {
    const fronts = p.front.filter(u => u.card.type === 'Character');
    const energies = p.energy.filter(u => u.card.type === 'Character');
    if (!fronts.length || !energies.length) return;
    const uidF = await p.controller.chooseOwnCharacter(p, fronts, 'เลือก character บน Front Line');
    const uidE = await p.controller.chooseOwnCharacter(p, energies, 'เลือก character บน Energy Line');
    const f = fronts.find(x => x.uid === uidF), e = energies.find(x => x.uid === uidE);
    if (f && e) {
      const iF = p.front.indexOf(f), iE = p.energy.indexOf(e);
      p.front[iF] = e; p.energy[iE] = f;
      log(`${unit.card.name}: สลับตำแหน่ง ${f.card.name} กับ ${e.card.name}`);
    }
  }

  // ── BLC-1 ──────────────────────────────────────────────────────────────

  // 003 As Nodt — passive +1000 BP for each rested enemy Front Line character.
  reg['BLC-1-003'] = {
    bpBonus(p, unit) {
      const enemy = Engine.opponentOf(p);
      return enemy.front.filter(u => u.rested && u.card.type === 'Character').length * 1000;
    },
  };

  // 005 Quilge Opie — [Main][Frontline][Rest] rest 1 enemy Front Line character.
  reg['BLC-1-005'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.restEnemyFront(p);
    },
  };

  // 006 Quilge Opie — [When Attacking] choose up to 1 rested enemy character (any zone), it
  // doesn't stand the next time it would. (Skipped: the "enters Active if opponent has a rested
  // character" conditional play-state — the generic entersActiveIf keyword only supports
  // name/trait-count conditions, not an opponent-rested-count condition.)
  reg['BLC-1-006'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.rested && u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูที่นอนอยู่ (จะไม่ stand ครั้งถัดไป)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 015 BG9 — [On Play] if enemy has a rested character (any zone), draw 1.
  reg['BLC-1-015'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if ([...enemy.front, ...enemy.energy].some(u => u.rested && u.card.type === 'Character')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 019 Jugram — passive +500 BP if 2+ enemy characters BP≥4000 on their area.
  reg['BLC-1-019'] = {
    bpBonus(p, unit) {
      const enemy = Engine.opponentOf(p);
      return enemy.front.filter(u => u.card.type === 'Character' && Engine.bp(u) >= 4000).length >= 2 ? 500 : 0;
    },
  };

  // 022 Yhwach — [On Play] opponent reveals the top of their deck; you choose to keep it on top or
  // send it to their Outside Area.
  reg['BLC-1-022'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (!enemy.deck.length) return;
      const top = enemy.deck[0];
      const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุดของศัตรู (${byNo(top)?.name}) — วางไว้บนเด็คหรือ Outside Area ของศัตรู?`,
        [{ label: 'บนสุดของเด็ค (เหมือนเดิม)', value: 'top' }, { label: 'Outside Area ของศัตรู', value: 'outside' }]);
      if (v === 'outside') { enemy.sideline.push(enemy.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของศัตรูไป Outside Area`); }
      else log(`${unit.card.name}: เก็บการ์ดของศัตรูไว้บนเด็คเหมือนเดิม`);
    },
  };

  // 023 Yhwach — [On Play] choose 1 of: un-raid 1 enemy Raid-stacked character (top layer to
  // Outside Area), or retire 1 enemy Front Line character BP≤2000.
  reg['BLC-1-023'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const raided = enemy.front.filter(u => u.under && u.under.length);
      const opts = [];
      if (raided.length) opts.push({ label: 'ลอกชั้นบนของการ์ด Raid ศัตรู', value: 'unraid' });
      opts.push({ label: 'Retire character ศัตรู (BP≤2000)', value: 'retire' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'unraid') {
        const uid = await p.controller.chooseEnemyCharacter(p, raided, `${unit.card.name}: เลือกการ์ด Raid ศัตรู`, true);
        const t = raided.find(x => x.uid === uid);
        if (t) await H.unraidTopLayer(enemy, t);
      } else {
        await H.retireEnemyFront(p, 2000);
      }
    },
  };

  // 025 Loyd Lloyd — [On Block] self -1000 BP this turn (or +1000 BP instead if the attacker is in Raid State).
  reg['BLC-1-025'] = {
    async onBlock(G, p, unit, atkUnit) {
      if (atkUnit && atkUnit.under && atkUnit.under.length) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้ (ศัตรูอยู่ใน Raid State)`); }
      else { unit.bpMod -= 1000; log(`${unit.card.name}: -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 026 Loyd Lloyd — "Your Character Cards with [Raid] can use this card to raid." (Skipped:
  // purely a Raid-material eligibility declaration, no discrete runtime action — Raid target
  // legality is resolved by the raiding card's own target rules, not this card's text.)

  // 027 Robert Accutrone — [On Play] if enemy has a character (any zone) BP≥4000, draw 1.
  reg['BLC-1-027'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if ([...enemy.front, ...enemy.energy].some(u => u.card.type === 'Character' && Engine.bp(u) >= 4000)) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 031 The Fear (Event) — rest 1 enemy Front Line character; if own As Nodt, also skip its next
  // stand and draw 1.
  reg['BLC-1-031'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูให้วางนอน`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      if (H.hasCardNamed(p, 'As Nodt')) { t.skipNextStand = true; Engine.draw(p, 1); log(`${card.name}: ${t.card.name} จะไม่ stand ครั้งถัดไป, จั่ว 1 ใบ`); }
    },
  };

  // 032 Blut (Event) — choose 1 of: own character +1000 BP this turn, or enemy Front Line
  // character -1000 BP this turn.
  reg['BLC-1-032'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'character ของคุณ +1000 BP เทิร์นนี้', value: 'buff' },
        { label: 'character ศัตรู -1000 BP เทิร์นนี้', value: 'debuff' },
      ]);
      if (v === 'buff') await H.buffOwnCharacter(p, 1000);
      else await H.debuffEnemyFront(p, -1000);
    },
  };

  // 038 Kisuke Urahara — [On Play] may place top 3 of deck to Outside Area; if did, fetch 1
  // purple character card from Outside Area to hand.
  reg['BLC-1-038'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็ค 3 ใบไป Outside Area?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const n = Math.min(3, p.deck.length);
      p.sideline.push(...p.deck.splice(0, n));
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Purple', `${unit.card.name}: เลือก character สีม่วงจาก Outside Area`);
    },
  };

  // 046 Renji Abarai — [Main][Frontline][1/turn] place top of deck to Outside Area; if did, choose
  // 1 other own character +500 BP this turn.
  reg['BLC-1-046'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) { p.controller.notify?.('เด็คหมด'); return; }
      unit._usedTurn = Engine.G.turn;
      p.sideline.push(p.deck.shift());
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`);
      await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
    },
  };

  // 054 Kurotsuchi Mayuri — [On Play] opponent places 1 card from their hand to their Outside Area.
  reg['BLC-1-054'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (!enemy.hand.length) return;
      const i = await enemy.controller.chooseCardFromHand(enemy, `${unit.card.name}: เลือกการ์ดจากมือไป Outside Area`);
      if (i == null) return;
      const no = enemy.hand.splice(i, 1)[0];
      enemy.sideline.push(no);
      log(`${unit.card.name}: ${enemy.name} ส่ง ${byNo(no)?.name} จากมือไป Outside Area`);
    },
  };

  // 055 Suì-Fēng — [Main][Frontline][Pay1AP][1/turn] choose 1 enemy Front Line character BP≤3500:
  // at the start of the opponent's next turn, retire it; rest this character and move it to Energy Line.
  reg['BLC-1-055'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (Engine.activeAP(p) < 1) { p.controller.notify?.('AP ไม่พอ'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3500);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3500)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      Engine.payAP(p, 1);
      unit._usedTurn = Engine.G.turn;
      let removeUid = null;
      if (p.energy.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, p.energy, 'เลือกการ์ดบน Energy Line ส่งไป Remove Area (ไม่มีที่ว่าง)');
      unit.rested = true;
      await Engine.moveUnitFree(p, unit, 'energy', removeUid);
      log(`${unit.card.name}: วางนอนและย้ายไป Energy Line`);
      Engine.scheduleDelayedAction(Engine.G.turn + 1, async () => {
        if ([...enemy.front, ...enemy.energy].includes(t)) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${unit.card.name}: retire ${t.card.name} (เอฟเฟกต์หน่วงเวลาจากเทิร์นก่อน)`); }
      });
    },
  };

  // 056 Kirinji Tenjiro — [Main][Rest][Retire] fetch 1 purple character card from Outside Area to hand.
  reg['BLC-1-056'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && c.type === 'Character' && c.color === 'Purple';
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี character สีม่วงใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก character สีม่วงจาก Outside Area`);
    },
  };

  // 058 Nimaiya Oetsu — [Main][Rest] choose 1 other own character +1000 BP this turn.
  reg['BLC-1-058'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 060 Hyosube Ichibe — [On Play] declare a required-energy number, reveal top 2, add up to 1
  // matching character card to hand, remainder to Outside Area.
  reg['BLC-1-060'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ประกาศเลข required energy`,
        [0, 1, 2, 3, 4, 5].map(n => ({ label: `${n}`, value: n })));
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => c.type === 'Character' && (c.need || 0) === v;
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดเข้ามือ (Energy=${v})`, pred, 1);
      const idx = picked[0];
      if (idx != null) { p.hand.push(revealed.splice(idx, 1)[0]); log(`${unit.card.name}: เพิ่ม ${byNo(p.hand[p.hand.length - 1])?.name} เข้ามือ`); }
      p.sideline.push(...revealed);
      if (revealed.length) log(`${unit.card.name}: ส่งการ์ดที่เหลือไป Outside Area`);
    },
  };

  // 061 Soul King Palace (Field) — [Main][Rest] look at the top card: if it's Trait:Zero Division
  // you may add it to hand; otherwise (or if declined) place it on top of deck or Outside Area.
  reg['BLC-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      if (!p.deck.length) return;
      const top = p.deck[0];
      const c = byNo(top);
      if ((c.traits || '').includes('Zero Division')) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุด ${c.name} — เพิ่มเข้ามือ?`,
          [{ label: 'เพิ่มเข้ามือ', value: true }, { label: 'ไม่เอา', value: false }]);
        if (v) { p.hand.push(p.deck.shift()); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); return; }
      }
      const v2 = await p.controller.chooseOption(p, `${unit.card.name}: วาง ${c.name} ไว้บนเด็คหรือ Outside Area?`,
        [{ label: 'บนสุดของเด็ค', value: 'top' }, { label: 'Outside Area', value: 'outside' }]);
      if (v2 === 'outside') { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่ง ${c.name} ไป Outside Area`); }
    },
  };

  // 062 Delicious Bread (Event) — own character +1000 BP this turn; untap 1 AP.
  reg['BLC-1-062'] = {
    async onEvent(G, p, card) { await H.buffOwnCharacter(p, 1000); await H.apUntap(p, 1); },
  };

  // 063 Technological Development Bureau (Event) — look at top 5, add 1 to hand and 1 to Outside
  // Area, remainder to bottom.
  reg['BLC-1-063'] = {
    async onEvent(G, p, card) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idxHand = (await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือกการ์ดเข้ามือ`, null, 1))[0];
      let handNo = null;
      if (idxHand != null) handNo = revealed.splice(idxHand, 1)[0];
      const idxOut = revealed.length ? (await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือกการ์ดไป Outside Area`, null, 1))[0] : null;
      if (handNo != null) { p.hand.push(handNo); log(`${card.name}: เพิ่ม ${byNo(handNo)?.name} เข้ามือ`); }
      if (idxOut != null) { const no = revealed.splice(idxOut, 1)[0]; p.sideline.push(no); log(`${card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`); }
      p.deck.push(...revealed);
    },
  };

  // 064 Getsuga Tensho (Event) — retire 1 enemy Front Line character BP≤3000 (BP≤5000 if own Kurosaki Ichigo).
  reg['BLC-1-064'] = {
    async onEvent(G, p, card) { await H.retireEnemyFront(p, H.hasCardNamed(p, 'Kurosaki Ichigo') ? 5000 : 3000); },
  };

  // 065 Senbonzakura Kageyoshi (Event) — AP -1 if own Byakuya Kuchiki; choose 1 enemy Front Line
  // character, -3000 BP or -1000 BP this turn (your choice of size).
  reg['BLC-1-065'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Byakuya Kuchiki') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'character ศัตรู -3000 BP เทิร์นนี้', value: 3000 },
        { label: 'character ศัตรู -1000 BP เทิร์นนี้', value: 1000 },
      ]);
      await H.debuffEnemyFront(p, -v);
    },
  };

  // 076 Kusajishi Yachiru — [On Play] choose up to 1 own Zaraki Kenpachi, set it Active.
  reg['BLC-1-076'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Zaraki Kenpachi') && u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Zaraki Kenpachi ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 079 Sasakibe Chojiro — [Main][Discard1][1/turn] +2 green energy generation this turn.
  reg['BLC-1-079'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.tempGen += 2;
      log(`${unit.card.name}: +2 energy generation เทิร์นนี้`);
    },
  };

  // 084 Hitsugaya Toshiro — passive +500 BP if 6+ other Trait:Gotei 13 on area.
  reg['BLC-1-084'] = {
    bpBonus(p, unit) {
      return [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Gotei 13')).length >= 6 ? 500 : 0;
    },
  };

  // 087 Hirako Shinji — [On Play] choose up to 1 own Trait:Gotei 13, it gains [Impact +1] this turn.
  reg['BLC-1-087'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Gotei 13'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Gotei 13 รับ [Impact +1] เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 096 Grand Crimson Lotus Ice Ring (Event) — rest 1 enemy Front Line character BP≤5000, it
  // doesn't stand next time; retire instead if own Hitsugaya Toshiro.
  reg['BLC-1-096'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Hitsugaya Toshiro')) { await H.retireEnemyFront(p, 5000); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; t.skipNextStand = true; log(`${card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป`); }
    },
  };

  // 097 Captain's Haori (Event) — all own Trait:Gotei 13 +1000 BP this turn; draw 1.
  reg['BLC-1-097'] = {
    async onEvent(G, p, card) {
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes('Gotei 13')) { u.bpMod += 1000; n++; }
      log(`${card.name}: Trait:Gotei 13 ${n} ใบ +1000 BP เทิร์นนี้`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 098 Squad's Funeral (Event) — may place 1 character card from Outside Area to Remove Area; if
  // did, draw 2.
  reg['BLC-1-098'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character';
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก character จาก Outside Area ส่งไป Remove Area (ไม่บังคับ)`, pred);
      if (idx == null) return;
      const no = p.sideline.splice(idx, 1)[0];
      p.removal.push(no);
      log(`${card.name}: ส่ง ${byNo(no)?.name} ไป Remove Area`);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 105 Renji Abarai — [On Play] choose up to 1 enemy Front Line character, -3000 BP this turn.
  reg['BLC-1-105'] = { async onPlay(G, p, unit) { await H.debuffEnemyFront(p, -3000); } };

  // 106 Rukia Kuchiki — [On Play] may move up to 3 character cards from Outside Area to Remove
  // Area; if did, draw 2.
  reg['BLC-1-106'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character';
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ย้ายการ์ด character จาก Outside Area ไป Remove Area สูงสุด 3 ใบ?`,
        [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        if (!p.sideline.some(no => pred(byNo(no)))) break;
        const idx = await p.controller.chooseCardFromSideline(p, `เลือก character (${moved}/3)`, pred);
        if (idx == null) break;
        const no = p.sideline.splice(idx, 1)[0];
        p.removal.push(no);
        moved++;
      }
      if (moved) { log(`${unit.card.name}: ย้าย ${moved} ใบไป Remove Area`); Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 108 Ichigo's Room (Field) — [Main][Rest][Retire] draw 2, place 1 card from hand to Outside Area.
  reg['BLC-1-108'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // ── BLC-2 ──────────────────────────────────────────────────────────────

  // 002 Uryu Ishida — [Main][Discard1][1/turn] choose 1 of 2 effects (both if own Yhwach): swap 1
  // Front/Energy Line character pair, or self +1000 BP this turn.
  reg['BLC-2-002'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      if (H.hasCardNamed(p, 'Yhwach')) {
        await swapFrontEnergy(p, unit);
        unit.bpMod += 1000;
        log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
        return;
      }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'สลับตำแหน่ง Front Line กับ Energy Line 1 คู่', value: 'swap' },
        { label: 'ตัวเอง +1000 BP เทิร์นนี้', value: 'buff' },
      ]);
      if (v === 'buff') { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else await swapFrontEnergy(p, unit);
    },
  };

  // 003 Bazz B — [Main][Frontline][Discard1][1/turn] choose 1 enemy character (any zone) BP≥1500, -1000 BP.
  reg['BLC-2-003'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 004 Jugram Haschwalth — [On Play] if own Yhwach and your hand is smaller than opponent's, draw 1.
  reg['BLC-2-004'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (H.hasCardNamed(p, 'Yhwach') && p.hand.length < enemy.hand.length) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 005 Toshiro Hitsugaya — [On Play] if this card was played by your character's effect, rest 1
  // enemy Front Line character.
  reg['BLC-2-005'] = {
    async onPlay(G, p, unit) {
      if (!unit._playedByEffect) return;
      await H.restEnemyFront(p);
    },
  };

  // 007 Candice Catnipp — [On Play] all enemy Front Line characters BP≥1000 get -500 BP this turn.
  reg['BLC-2-007'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      let n = 0;
      for (const u of enemy.front) if (u.card.type === 'Character' && Engine.bp(u) >= 1000) { u.bpMod -= 500; n++; }
      log(`${unit.card.name}: enemy Front Line ${n} ใบ -500 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 009 Giselle Gewelle — [On Play] if 3+ total Trait:Bambies/Trait:Zombie/Bambietta Basterbine on
  // area, draw 2 + discard 2. @[Main][Frontline][1/turn] retire 1 non-Zombie own character; if did,
  // free-play 1 yellow Trait:Zombie from Outside Area, Active.
  reg['BLC-2-009'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && ((u.card.traits || '').includes('Bambies') || (u.card.traits || '').includes('Zombie') || (u.card.name || '').includes('Bambietta Basterbine'))).length;
      if (n < 3) return;
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p); await H.discardFromHand(p);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && !(u.card.traits || '').includes('Zombie'));
      if (!others.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character (ไม่มี Trait:Zombie) เพื่อ retire');
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Zombie');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Zombie สีเหลือง', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 010 Meninas McAllon — [On Retire] choose up to 1 enemy Front Line character BP≤2000, rest it.
  reg['BLC-2-010'] = { async onSideline(G, p, unit, reason) { if (reason === 'battle') return; await H.restEnemyFront(p, 2000); } };

  // 012 Holy Servant (Event) — retire 1 enemy Front Line character BP ≤ 1000 × (own Trait:Bambies +
  // Bambietta Basterbine count).
  reg['BLC-2-012'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Bambies') || (u.card.name || '').includes('Bambietta Basterbine')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 013 Orihime Inoue / 047 Its name is Zangetsu — reactive "when this card is placed to your
  // Outside Area specifically by a blue Ichigo Kurosaki's effect" bonuses are skipped (no generic
  // hook tracks which specific card's effect caused a discard); the unconditional part of 047 (draw
  // 2) is still scripted below.

  // 014 Orihime Inoue — [On Play] may return 1 own character (energy≤2) to hand; if did, fetch 1
  // card (energy≤2) from Outside Area to hand.
  reg['BLC-2-014'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.need || 0) <= 2);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: คืนมือ character (Energy≤2) ของคุณ? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      await H.fetchFromSideline(p, c => c && (c.need || 0) <= 2, `${unit.card.name}: เลือกการ์ด (Energy≤2) จาก Outside Area`);
    },
  };

  // 018 Ichigo Kurosaki — [On Play] bounce 1 enemy Front Line character BP≤4000. @[Main][Frontline][1/turn] draw 1, discard 1.
  reg['BLC-2-018'] = {
    async onPlay(G, p, unit) { await H.bounceEnemyFront(p, 4000); },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 026 Renji Abarai — [On Play] choose up to 1 character with original AP cost ≥2, it gains [Impact +1] this turn.
  reg['BLC-2-026'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.ap || 0) >= 2);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (AP เดิม≥2) รับ [Impact +1] เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 027 Renji Abarai — passive: +500 BP for each own Front Line character with original AP cost ≥2.
  reg['BLC-2-027'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.front.filter(u => (u.card.ap || 0) >= 2).length * 500;
    },
  };

  // 033 Rukia Kuchiki — [On Play] draw 1 + discard 1; if an own Front Line character has original
  // AP cost ≥2, draw 1 with no discard instead.
  reg['BLC-2-033'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (!p.front.some(u => (u.card.ap || 0) >= 2)) await H.discardFromHand(p);
    },
  };

  // 035 Nemu Kurotsuchi — [Main][1/turn] retire 1 Trait:Kurotsuchi Corpse Unit character; if did,
  // look at top 4, add up to 1 Mayuri/Nemu/Trait:Kurotsuchi Corpse Unit card to hand.
  reg['BLC-2-035'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kurotsuchi Corpse Unit'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Kurotsuchi Corpse Unit เพื่อ retire');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.sidelineUnit(p, t, 'effect');
      const pred = c => (c.name || '').includes('Mayuri Kurotsuchi') || (c.name || '').includes('Nemu Kurotsuchi') || (c.traits || '').includes('Kurotsuchi Corpse Unit');
      await H.lookTopAndTake(p, 4, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
    },
  };

  // 037 Mayuri Kurotsuchi — [On Play] may retire own Trait:Kurotsuchi Corpse Unit; if did, retire 1
  // enemy Front Line character with BP ≤ that character's BP, draw 1.
  reg['BLC-2-037'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kurotsuchi Corpse Unit'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: Retire Trait:Kurotsuchi Corpse Unit? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const bpLimit = Engine.bp(t);
      await Engine.sidelineUnit(p, t, 'effect');
      const retired = await H.retireEnemyFront(p, bpLimit);
      if (retired) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 039 Charlotte Chuhlhourne — [On Retire] if it's your turn, rest 1 enemy Front Line character (once per turn).
  reg['BLC-2-039'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      if (Engine.G.players[Engine.G.active] !== p) return;
      if (p._charlotteUsedTurn === Engine.G.turn) return;
      p._charlotteUsedTurn = Engine.G.turn;
      await H.restEnemyFront(p);
    },
  };

  // 041 Dordoni Alessandro Del Socaccio — [Your Turn] +1000 BP if another own character was retired this turn.
  reg['BLC-2-041'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return Engine.G.retiredThisTurn ? 1000 : 0;
    },
  };

  // 043 Kensei Muguruma & Rojuro Otoribashi — [On Play] may pay 1 AP to play up to 1 more copy of
  // this same character from Outside Area, rested (once per turn).
  reg['BLC-2-043'] = {
    async onPlay(G, p, unit) {
      if (p._kensei043UsedTurn === Engine.G.turn) return;
      if (Engine.activeAP(p) < 1) return;
      const pred = c => c && c.name === unit.card.name;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อลงอีกใบจาก Outside Area (rested)?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      p._kensei043UsedTurn = Engine.G.turn;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 044 Kurotsuchi Corpse Unit (Field) — [Main][1/turn] retire 1 own Trait:Kurotsuchi Corpse Unit
  // character. @[Main][Rest][1/turn] (if a character was retired this turn) all Nemu/Trait:Kurotsuchi
  // Corpse Unit +1000 BP this turn.
  reg['BLC-2-044'] = {
    async onMain(G, p, unit) {
      const opts = [];
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kurotsuchi Corpse Unit'));
      if (unit._usedTurn1 !== Engine.G.turn && targets.length) opts.push({ label: 'Retire Trait:Kurotsuchi Corpse Unit', value: 'retire' });
      if (unit._usedTurn2 !== Engine.G.turn && !unit.rested && Engine.G.retiredThisTurn) opts.push({ label: '[Rest] Trait:Kurotsuchi Corpse Unit/Nemu ทั้งหมด +1000 BP', value: 'buff' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'retire') {
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Kurotsuchi Corpse Unit เพื่อ retire');
        const t = targets.find(x => x.uid === uid);
        if (t) { unit._usedTurn1 = Engine.G.turn; await Engine.sidelineUnit(p, t, 'effect'); }
      } else if (v === 'buff') {
        unit._usedTurn2 = Engine.G.turn;
        unit.rested = true;
        let n = 0;
        for (const u of [...p.front, ...p.energy]) if ((u.card.name || '').includes('Nemu Kurotsuchi') || (u.card.traits || '').includes('Kurotsuchi Corpse Unit')) { u.bpMod += 1000; n++; }
        log(`${unit.card.name}: ${n} ใบ +1000 BP เทิร์นนี้`);
      }
    },
  };

  // 045 Quit your yapping (Event) — retire 1 Trait:Kurotsuchi Corpse Unit; if did, draw 1 and
  // free-play up to 2 blue Nemu/Trait:Kurotsuchi Corpse Unit characters (energy met, AP1) from
  // Outside Area, Active.
  reg['BLC-2-045'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Kurotsuchi Corpse Unit'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Kurotsuchi Corpse Unit เพื่อ retire`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.ap || 0) === 1 && ((c.name || '').includes('Nemu Kurotsuchi') || (c.traits || '').includes('Kurotsuchi Corpse Unit')) && Engine.hasEnergyFor(p, c);
      for (let i = 0; i < 2; i++) {
        if (!p.sideline.some(no => pred(byNo(no)))) break;
        const idx = await p.controller.chooseCardFromSideline(p, `เลือกการ์ด (${i + 1}/2)`, pred);
        if (idx == null) break;
        await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
      }
    },
  };

  // 047 Its name is Zangetsu (Event) — draw 2.
  reg['BLC-2-047'] = { async onEvent(G, p, card) { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); } };

  // 060 Ichibe Hyosube — [On Play] look at top 4, reorder freely and put back on top. @[When
  // Attacking] declare a required-energy number; reveal the top card, add to hand + place 1 card
  // from hand to Remove Area if it matches, otherwise put it back on top.
  reg['BLC-2-060'] = {
    async onPlay(G, p, unit) { log(`${unit.card.name}: ดูการ์ดบนสุด 4 ใบแล้วจัดเรียงใหม่ (ลำดับเดิม)`); },
    async onAttack(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ประกาศเลข required energy`,
        [0, 1, 2, 3, 4, 5].map(n => ({ label: `${n}`, value: n })));
      if (!p.deck.length) return;
      const top = p.deck[0];
      const c = byNo(top);
      if ((c.need || 0) === v) {
        const v2 = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุด ${c.name} ตรงกับที่ประกาศ — เพิ่มเข้ามือ?`,
          [{ label: 'เพิ่มเข้ามือ', value: true }, { label: 'ไม่เอา', value: false }]);
        if (v2) {
          p.hand.push(p.deck.shift());
          log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`);
          await H.manualDiscardToRemoval(p);
          return;
        }
      }
      log(`${unit.card.name}: เก็บการ์ดไว้บนเด็คเหมือนเดิม`);
    },
  };

  // 062 Yumichika Ayasegawa — passive genMod +1 if 3+ other Trait:Gotei 13 on area.
  reg['BLC-2-062'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner) return 0;
      return [...owner.front, ...owner.energy].filter(u => u !== unit && (u.card.traits || '').includes('Gotei 13')).length >= 3 ? 1 : 0;
    },
  };

  // 064 Yachiru Kusajishi — [Main][Rest][Retire] choose up to 1 own Zaraki Kenpachi, it gains
  // [Impact +1] or [Damage +1] this turn (your choice).
  reg['BLC-2-064'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Zaraki Kenpachi'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Zaraki Kenpachi`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก bonus ให้ ${t.card.name}`, [
        { label: '[Impact +1] เทิร์นนี้', value: 'impact' },
        { label: '[Damage +1] เทิร์นนี้', value: 'damage' },
      ]);
      if (v === 'impact') { t.tempImpact += 1; log(`${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
      else { t.tempDmg += 1; log(`${t.card.name} ได้ [Damage +1] เทิร์นนี้`); }
    },
  };

  // 069 Toshiro Hitsugaya — [On Play] if 6+ other Trait:Gotei 13, may discard 1 to fetch a
  // same-name card from Outside Area to hand.
  reg['BLC-2-069'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Gotei 13')).length;
      if (n < 6 || !p.hand.length) return;
      const pred = c => c && (c.name || '').includes('Toshiro Hitsugaya');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อดึง Toshiro Hitsugaya จาก Outside Area?`);
      if (discarded) await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก Toshiro Hitsugaya จาก Outside Area`);
    },
  };

  // 070 Shinji Hirako — [On Play] choose 1 of: [Frontline] retire 2 enemy Front Line characters
  // BP≤2000 with matching BP, or rest 1 enemy Front Line character BP≥3000 and set self Active.
  reg['BLC-2-070'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (p.front.includes(unit)) opts.push({ label: 'Retire enemy 2 ใบ (BP≤2000 เท่ากัน)', value: 'retire2' });
      opts.push({ label: 'วางนอน enemy (BP≥3000) แล้ว Active ตัวเอง', value: 'restSelf' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      const enemy = Engine.opponentOf(p);
      if (v === 'retire2') {
        const pool = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 2000);
        const bpGroups = {};
        for (const u of pool) (bpGroups[Engine.bp(u)] ||= []).push(u);
        const validBps = Object.keys(bpGroups).filter(k => bpGroups[k].length >= 2);
        if (!validBps.length) return;
        const targets = validBps.flatMap(k => bpGroups[k]);
        const uid1 = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูตัวที่ 1`, true);
        const t1 = targets.find(x => x.uid === uid1);
        if (!t1) return;
        const sameBp = targets.filter(u => u !== t1 && Engine.bp(u) === Engine.bp(t1));
        if (!sameBp.length) return;
        const uid2 = await p.controller.chooseEnemyCharacter(p, sameBp, `${unit.card.name}: เลือก character ศัตรูตัวที่ 2 (BP เท่ากัน)`, true);
        const t2 = sameBp.find(x => x.uid === uid2);
        if (!t2) return;
        await Engine.sidelineUnit(enemy, t1, 'effect');
        await Engine.sidelineUnit(enemy, t2, 'effect');
      } else {
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) >= 3000);
        if (targets.length) {
          const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≥3000)`, true);
          const t = targets.find(x => x.uid === uid);
          if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
        }
        unit.rested = false;
        log(`${unit.card.name}: Active ตัวเอง`);
      }
    },
  };

  // 072 Rangiku Matsumoto — [On Play] if own Toshiro Hitsugaya, play 1 green character (energy≤2,
  // AP1) from hand, rested.
  reg['BLC-2-072'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Toshiro Hitsugaya')) return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // ── UA04NC-BLC-3 (newer print run) ───────────────────────────────────────

  // 003 Mayuri Kurotsuchi — [On Play] choose 1 of: other character +1000 BP this turn, or other
  // character +3000 BP this turn and retires at the end of this turn (approximates "after its next
  // attack" — no hook fires precisely at end-of-attack, so end-of-turn is used instead).
  reg['UA04NC-BLC-3-003'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'small' },
        { label: 'character อื่น +3000 BP เทิร์นนี้ (retire ปลายเทิร์น)', value: 'big' },
      ]);
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (v === 'small') { t.bpMod += 1000; log(`${t.card.name} +1000 BP เทิร์นนี้`); }
      else { t.bpMod += 3000; t.retireAtEndOfTurn = true; log(`${t.card.name} +3000 BP เทิร์นนี้ (จะ retire ปลายเทิร์นนี้)`); }
    },
  };

  // 004 Kisuke Urahara — [Main][Rest][1/turn] switch 1 active own Front Line character to resting;
  // if did, gains +1 energy generation this turn.
  reg['UA04NC-BLC-3-004'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.front.filter(u => !u.rested && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character Active บน Front Line ให้วางนอน');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      t.rested = true;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`);
      unit.tempGen += 1;
      log(`${unit.card.name}: +1 energy generation เทิร์นนี้`);
    },
  };

  // 007 Shunsui Kyoraku — [On Play] look at top 3, add up to 1 Trait:Thirteen Court Guard Squads
  // card to hand (remainder to bottom); if added, discard 1. (Source text has a "Rebeal"/"Reveal"
  // typo that breaks the generic look-at-top-fetch matcher, so scripted individually.)
  reg['UA04NC-BLC-3-007'] = {
    async onPlay(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Thirteen Court Guard Squads'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 010 Shinji Hirako — [On Play] look at top 2, place each on top and/or bottom of the deck in any order.
  reg['UA04NC-BLC-3-010'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      for (const no of revealed) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: วาง ${byNo(no)?.name} ไว้บนหรือใต้เด็ค?`,
          [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
        if (v === 'top') p.deck.unshift(no); else p.deck.push(no);
      }
      log(`${unit.card.name}: จัดการ์ดบนสุด ${n} ใบกลับเข้าเด็ค`);
    },
  };

  // 011 Jushiro Ukitake — passive +1 [green] energy generation while a face-down card sits under
  // this character (stored via the shared `unit.counters` "face-down card" convention). [On Play]
  // may place the top of deck face-down under itself. [Main][Rest] place that face-down card to
  // Outside Area; if did, +2 energy generation this turn (on top of losing the passive +1).
  reg['UA04NC-BLC-3-011'] = {
    genMod(unit) { return (unit.counters && unit.counters.length) ? 1 : 0; },
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็ค (คว่ำ) ไว้ใต้การ์ดนี้?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำ 1 ใบไว้ใต้การ์ดนี้`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!unit.counters || !unit.counters.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำใต้การ์ดนี้'); return; }
      unit.rested = true;
      const no = unit.counters.shift();
      p.sideline.push(no);
      unit.tempGen += 2;
      log(`${unit.card.name}: ส่งการ์ดคว่ำไป Outside Area, +2 energy generation เทิร์นนี้`);
    },
  };

  // ── Skipped (need engine primitives not yet built) ──────────────────────
  // BLC-1-006: the "enters Active if opponent has a rested character" conditional (partial: the
  //   [When Attacking] ability is scripted above).
  // BLC-1-026: pure Raid-material eligibility declaration, no discrete runtime action.
  // BLC-2-013 / BLC-2-047: "when this card is placed to Outside Area by a specific other card's
  //   effect" reactive — no hook tracks which card's effect caused a given discard.
})();
