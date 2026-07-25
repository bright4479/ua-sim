// ══════════ UA SIM — Dr. STONE (DST) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function villageCondMet(p, altName) {
    const units = [...p.front, ...p.energy];
    return units.filter(u => (u.card.traits || '').includes('Ishigami Village')).length >= 5 ||
      units.some(u => (u.card.name || '').includes(altName));
  }
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }
  // "You may declare 1 required energy number. Your opponent chooses 1 card in your hand.
  // Reveal it — if its required energy matches your declared number, the effect happens."
  async function declareAndPeekHand(p, title) {
    if (!p.hand.length) return false;
    const opts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(v => ({ label: `${v}`, value: v }));
    const n = await p.controller.chooseOption(p, title, opts);
    if (n == null) return false;
    const enemy = Engine.opponentOf(p);
    const i = await enemy.controller.chooseCardFromHand(p, `${enemy.name}: เลือกการ์ดจากมือของ ${p.name} มาเปิดเผย`);
    if (i == null) return false;
    const c = byNo(p.hand[i]);
    p._revealedHandCardThisTurn = Engine.G.turn;
    log(`${p.name}: เปิดเผย ${c?.name} (Energy ${c?.need}) — ประกาศไว้ ${n}`);
    return (c?.need || 0) === n;
  }

  // 003 Ishigami Senku — [On Play] choose 1: (a) look top 5, reveal up to 1 <Oil> to hand,
  // remainder to bottom; if added, discard 1 from hand; (b) may discard 1 non-Oil from hand; if
  // did, fetch up to 1 Oil from your Outside Area to hand.
  reg['DST-1-003'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูบนสุด 5 ใบ หา Oil', value: 'a' }, { label: 'ทิ้งการ์ด (ไม่ใช่ Oil) → ดึง Oil จาก Outside Area', value: 'b' },
      ]);
      if (v === 'a') {
        const taken = await H.lookTopAndTake(p, 5, c => c && (c.name || '').includes('Oil'), 1, `${unit.card.name}: ดูบนสุด 5 ใบ`);
        if (taken.length) await H.discardFromHand(p);
      } else {
        const i = p.hand.findIndex(no => !(byNo(no)?.name || '').includes('Oil'));
        if (i < 0) return;
        const no = p.hand.splice(i, 1)[0]; p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
        log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
        await H.fetchFromSideline(p, c => c && (c.name || '').includes('Oil'), `${unit.card.name}: เลือก Oil จาก Outside Area`);
      }
    },
  };

  // 013 Kinro — [On Play] if 5+ other Trait:Ishigami Village or a Ginro on your area, may discard
  // 1 from hand; if you did, set this character to active.
  reg['DST-1-013'] = {
    async onPlay(G, p, unit) {
      if (!villageCondMet(p, 'Ginro')) return;
      const no = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ดจากมือ? (ไม่บังคับ)`);
      if (no == null) return;
      unit.rested = false; log(`${unit.card.name}: ตั้งขึ้น Active`);
    },
  };

  // 014 Ginro — [When Attacking] if 5+ other Trait:Ishigami Village or a Kinro on your area,
  // choose up to 1 own character, +1000 BP.
  reg['DST-1-014'] = { async onAttack(G, p, unit) { if (villageCondMet(p, 'Kinro')) await H.buffOwnCharacter(p, 1000); } };

  // 023 Chalk — passive: if 5+ other Trait:Ishigami Village or a Suika on your area, +1000 BP
  // your turn.
  reg['DST-1-023'] = { bpBonus(p, unit) { return (isYourTurn(p) && villageCondMet(p, 'Suika')) ? 1000 : 0; } };

  // 027 Science Ship Perseus (Field) — [Main][Rest][1/turn] may discard 1 Oil from hand; if you
  // did, rest 1 enemy Front Line character. (Cost discount handled generically at the engine's
  // cost layer.)
  reg['DST-1-027'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const i = p.hand.findIndex(no => (byNo(no)?.name || '').includes('Oil'));
      if (i < 0) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(i, 1)[0]; p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      await H.restEnemyFront(p);
    },
  };

  // 028 "My sailor's instincts are never wrong!" — rest 1 enemy Front Line BP<=5000, it doesn't
  // stand next time; if there is a Nanami Ryusui on your area, retire it instead.
  reg['DST-1-028'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Nanami Ryusui')) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${card.name}: ${t.card.name} ถูก retire`); }
      else { t.rested = true; t.skipNextStand = true; log(`${card.name}: ${t.card.name} ถูกวางนอน (ไม่ลุกครั้งถัดไป)`); }
    },
  };

  // 032 "100 Tales" — all Trait:Ishigami Village on your area +1000 BP this turn; choose 1 own
  // Front Line, [Impact +1]; if a Ruri is on your area, draw 1.
  reg['DST-1-032'] = {
    async onEvent(G, p, card) {
      const villagers = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Ishigami Village'));
      for (const u of villagers) u.bpMod += 1000;
      if (villagers.length) log(`${card.name}: Trait:Ishigami Village ทุกใบ +1000 BP เทิร์นนี้`);
      if (p.front.length) {
        const uid = await p.controller.chooseOwnCharacter(p, p.front, `${card.name}: เลือก character บน Front Line`);
        const t = p.front.find(x => x.uid === uid);
        if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Ruri')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 035 Asagiri Gen — [On Play] you may declare a required-energy number; opponent reveals a card
  // from your hand; if it matches, choose up to 1 enemy Front Line character, -1000 BP this turn.
  reg['DST-1-035'] = {
    async onPlay(G, p, unit) {
      const match = await declareAndPeekHand(p, `${unit.card.name}: ประกาศเลข required energy (ไม่บังคับ)`);
      if (match) await H.debuffEnemyFront(p, -1000);
    },
  };

  // 043 Chrome — [Main][Rest+Retire] add up to 1 Asagiri Gen from your Outside Area to your hand.
  reg['DST-1-043'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Asagiri Gen'), `${unit.card.name}: เลือก Asagiri Gen จาก Outside Area`);
    },
  };

  // 052 Shishio Tsukasa — passive: if there is a Trait:Tsukasa Empire Field on your area, +1000 BP.
  reg['DST-1-052'] = { bpBonus(p, unit) { return [...p.front, ...p.energy].some(u => u.card.type === 'Field' && (u.card.traits || '').includes('Tsukasa Empire')) ? 1000 : 0; } };

  // 057 Hyoga — [Main][Pay 1 AP][1/turn] draw 1, +1500 BP this turn.
  reg['DST-1-057'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); unit.bpMod += 1500;
      log(`${unit.card.name}: จั่ว 1 ใบ, +1500 BP เทิร์นนี้`);
    },
  };

  // 060 Momiji Homura — [Main][Rest+Discard1+Retire] choose up to 1 AP card, set it to active.
  reg['DST-1-060'] = {
    async onMain(G, p, unit) {
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.apUntap(p, 1);
    },
  };

  // 061 Mobile Phone (Field) — [Main][Rest] may place 1 card from hand top/bottom of deck; add up
  // to 1 [purple] traitless character (need<=3, ap=1) from your Outside Area to your hand.
  reg['DST-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      if (p.hand.length) {
        const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: วางการ์ดจากมือ? (ไม่บังคับ)`);
        if (i != null) {
          const no = p.hand.splice(i, 1)[0];
          const dest = await p.controller.chooseOption(p, `${unit.card.name}: บนสุดหรือล่างสุดของเด็ค?`, [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
          if (dest === 'top') p.deck.unshift(no); else p.deck.push(no);
          log(`${unit.card.name}: วาง ${byNo(no)?.name} ${dest === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็ค`);
        }
      }
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && c.color === 'Purple' && !(c.traits || '').trim() && (c.need || 0) <= 3 && (c.ap || 0) === 1, `${unit.card.name}: เลือก character จาก Outside Area`);
    },
  };

  // 063 "Owari Kan-Ryu Spear Style" — choose 1 own Front Line, +2000 BP; if there is a Hyoga on
  // your area, also [Impact +1].
  reg['DST-1-063'] = {
    async onEvent(G, p, card) {
      if (!p.front.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, p.front, `${card.name}: เลือก character บน Front Line`);
      const t = p.front.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      if (H.hasCardNamed(p, 'Hyoga')) t.tempImpact = (t.tempImpact || 0) + 1;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้${H.hasCardNamed(p, 'Hyoga') ? ' + [Impact +1]' : ''}`);
    },
  };

  // 065 "Magic Show" — choose 1 enemy Front Line, -4000 BP; may declare a required-energy number
  // (opponent reveals a card from your hand) — if it matches, -5000 BP instead. (Cost discount
  // handled generically.)
  reg['DST-1-065'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const match = await declareAndPeekHand(p, `${card.name}: ประกาศเลข required energy (ไม่บังคับ)`);
      t.bpMod += match ? -5000 : -4000;
      log(`${card.name}: ${t.card.name} ${match ? -5000 : -4000} BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 073 Ogawa Yuzuriha — [On Play] place the top card of your deck face-down under this character.
  // @[Main][Rest][1/turn] choose up to 1 other character, +2000 BP; if Oki Taiju, also [Impact +1].
  // (Skipped: the static "cannot become active while a face-down card is under this character"
  // restriction — narrow one-off mechanic, same class of skip as MST's Rudeus-073.)
  reg['DST-1-073'] = {
    async onPlay(G, p, unit) { if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`); } },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      if ((t.card.name || '').includes('Oki Taiju')) t.tempImpact = (t.tempImpact || 0) + 1;
      log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
    },
  };

  // 104 Ogawa Yuzuriha (2) — [On Play] place the top card of your deck face-down under this
  // character. @[Main][Rest][1/turn] choose up to 2 other characters, +1000 BP each. (Skipped:
  // same static "cannot become active" restriction as 073.)
  reg['DST-1-104'] = {
    async onPlay(G, p, unit) { if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง`); } },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      for (let n = 0; n < 2; n++) {
        const remain = targets.filter(u => !u._pickedByYuzuriha104);
        if (!remain.length) break;
        const uid = await p.controller.chooseOwnCharacter(p, remain, `${unit.card.name}: เลือก character (${n + 1}/2)`, true);
        if (uid == null) break;
        const t = remain.find(x => x.uid === uid);
        if (!t) break;
        t._pickedByYuzuriha104 = true;
        t.bpMod += 1000;
        log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
      }
      for (const t of targets) delete t._pickedByYuzuriha104;
    },
  };

  // 079 Steam Gorilla — [On Play] play up to 1 green Trait:Kingdom of Science character (need<=4,
  // ap=1) from your hand to your area rested.
  reg['DST-1-079'] = {
    async onPlay(G, p, unit) {
      const i = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.traits || '').includes('Kingdom of Science') && (c.need || 0) <= 4 && (c.ap || 0) === 1; });
      if (i < 0 || p.front.length >= 4) return;
      await Engine.playCardFromZone(p, p.hand[i], 'hand', { line: 'front', active: false });
    },
  };

  // 085 Chrome — passive (opponent's turn): if you have a Trait:Craft card on your area, +500 BP.
  reg['DST-1-085'] = { bpBonus(p, unit) { return (!isYourTurn(p) && [...p.front, ...p.energy].some(u => (u.card.traits || '').includes('Craft'))) ? 500 : 0; } };

  // 098 "Dynamite" — choose 1 enemy Front Line BP<=5000, move to Energy Line; if 2+ own Trait:Craft
  // cards on your area, place it to the Remove Area instead.
  reg['DST-1-098'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length || enemy.energy.length >= 4 && [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Craft')).length < 2) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const craftCount = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Craft')).length;
      if (craftCount >= 2) await forceToRemoval(enemy, t, 'effect');
      else if (enemy.energy.length < 4) await Engine.moveUnitFree(enemy, t, 'energy');
    },
  };

  // 099 "Revival Fluid" — choose up to 1 own character with a face-down card under it, add that
  // card to hand, place 1 card from hand to the Outside Area; set the chosen character active,
  // untap 1 AP card.
  reg['DST-1-099'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.counters.length);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character ที่มีการ์ดคว่ำใต้ตัว`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const no = t.counters.shift();
      p.hand.push(no);
      log(`${card.name}: ${t.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
      await H.discardFromHand(p);
      t.rested = false;
      await H.apUntap(p, 1);
    },
  };

  // UAPR-DST-P-002 Gen Asagi — passive: if you revealed a card from your hand by your effect this
  // turn, +500 BP. @[On Play] declare a required-energy number; opponent reveals a card from your
  // hand; if it matches, place up to 1 traitless Character Card or Mobile Phone from your Outside
  // Area on top of your deck.
  reg['UAPR-DST-P-002'] = {
    bpBonus(p, unit) { return (isYourTurn(p) && p._revealedHandCardThisTurn === Engine.G.turn) ? 500 : 0; },
    async onPlay(G, p, unit) {
      const match = await declareAndPeekHand(p, `${unit.card.name}: ประกาศเลข required energy`);
      if (!match) return;
      const i = p.sideline.findIndex(no => { const c = byNo(no); return c && ((c.type === 'Character' && !(c.traits || '').trim()) || (c.name || '').includes('Mobile Phone')); });
      if (i < 0) return;
      const no = p.sideline.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`);
    },
  };
})();
