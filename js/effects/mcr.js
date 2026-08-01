// ══════════ UA SIM — Macross (MCR) card-specific effect scripts ══════════
// Generic series-agnostic patterns (draw+discard, AP untap, scry, etc.) live in
// js/effects/common.js and apply automatically — only MCR-specific card
// numbers that need bespoke logic are registered here.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // Mylene Flare Jenius — [Main] [Rest this card] เลือก character อื่น 1 ใบ +1000 BP ถึงจบเทิร์น
  // (also covered by the generic mainRestBuffOther pattern now, kept for clarity/priority)
  reg['EX14BT-MCR-2-077'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่ ใช้ ability ไม่ได้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่นบนสนาม'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character รับ +1000 BP (เทิร์นนี้)');
      const t = others.find(u => u.uid === uid);
      if (!t) return;
      unit.rested = true;
      t.bpMod += 1000;
      log(`${unit.card.name}: ${t.card.name} ได้ +1000 BP ถึงจบเทิร์น`);
    },
  };

  // ---------- shared factories for this batch ----------

  // "[Your Turn] This character gets +N BP." (bpBonus applies only on the owner's own turn)
  function ownTurnBpBonus(n) {
    return { bpBonus(p) { return Engine.G.players[Engine.G.active] === p ? n : 0; } };
  }

  // "When this character attacks and wins a battle, draw 1 card and the opponent's character
  // that lost this battle returns to your opponent's hand instead of retire." — Basara Nekki family.
  function basaraWinBattle() {
    return {
      async onWinBattle(G, attackerP, atkUnit, defenderP, defUnit) {
        Engine.draw(attackerP, 1);
        log(`${atkUnit.card.name}: ชนะ battle — จั่ว 1 ใบ`);
        await Engine.returnUnitToHand(defenderP, defUnit);
        log(`${defUnit.card.name}: กลับมือแทนที่จะ Sideline`);
        return true; // handled — engine must not also sideline the defender
      },
    };
  }

  // 025 Mirage Farina Jenius — [On Play] if a Trait:Delta Flight raided character without "Mirage"
  // in its name is on Front Line, draw 1.
  reg['EX14BT-MCR-2-025'] = {
    async onPlay(G, p, unit) {
      const hit = p.front.some(u => u.under.length && (u.card.traits || '').includes('Delta Flight') && !(u.card.name || '').includes('Mirage'));
      if (hit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 029 Kaname Buccaneer — [On Play] play up to 1 purple Walküre character need<=2 ap1 from hand rested.
  reg['EX14BT-MCR-2-029'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.color === 'Purple' && (c.traits || '').includes('Walküre') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: ลง ${byNo(p.hand[idx]).name} ลงสนามฟรีไหม?`,
        [{ label: `ลง ${byNo(p.hand[idx]).name}`, value: true }, { label: 'ข้าม', value: false }]);
      if (opt) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 034 Freyja Wion — [Your Turn] +1000 BP if 3+ Walküre-trait cards with different names on own area.
  reg['EX14BT-MCR-2-034'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Walküre')).map(u => u.card.name));
      return names.size >= 3 ? 1000 : 0;
    },
  };

  // 040 Makina Nakajima — +1 gen if 2+ Walküre on Front Line; on-play conditional scry-2-rearrange.
  reg['EX14BT-MCR-2-040'] = {
    genMod(unit) {
      const p = Engine.G.players.find(pl => pl.energy.includes(unit));
      if (!p) return 0;
      return p.front.filter(u => (u.card.traits || '').includes('Walküre')).length >= 2 ? 1 : 0;
    },
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Reina Prowler')) return;
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (เก็บไว้บนสุดกี่ใบก็ได้)`, () => true, n);
      const keepTop = picked.map(i => revealed[i]);
      const rest = revealed.filter((_, i) => !picked.includes(i));
      p.sideline.push(...rest);
      p.deck.unshift(...keepTop);
      log(`${unit.card.name}: จัดการ์ดบนสุดของเด็ค`);
    },
  };

  // 041 Mikumo Guynemer — [On Play] look at top 2, place up to 1 Walküre-trait to Outside Area, rest back on top.
  reg['EX14BT-MCR-2-041'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (ส่ง Outside Area ได้ 1 ใบ ต้องมี Trait: Walküre)`,
        c => (c.traits || '').includes('Walküre'), 1);
      picked.sort((a, b) => b - a).forEach(i => { p.sideline.push(revealed.splice(i, 1)[0]); });
      p.deck.unshift(...revealed);
      if (picked.length) log(`${unit.card.name}: ส่งการ์ด Walküre ไป Outside Area`);
    },
  };

  // 048 Reina Prowler — [On Play] look top 3, reveal up to 1 Walküre and place it ON TOP of deck (not hand).
  reg['EX14BT-MCR-2-048'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx = revealed.findIndex(no => (byNo(no).traits || '').includes('Walküre'));
      if (idx >= 0) {
        const chosen = revealed.splice(idx, 1)[0];
        p.deck.unshift(chosen);
        log(`${unit.card.name}: วาง ${byNo(chosen).name} ไว้บนสุดของเด็ค`);
      }
      p.deck.push(...revealed);
    },
  };

  // 077 Maximilian Jenius — [Your Turn] +1000 BP if Milia/Mylene-named character on own area.
  reg['UA36BT-MCR-1-077'] = {
    bpBonus(p) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (H.hasCardNamed(p, 'Milia Fallyna Jenius') || H.hasCardNamed(p, 'Mylene Flare Jenius')) ? 1000 : 0;
    },
  };

  // Basara Nekki family — win-battle draw + bounce instead of sideline.
  reg['EX14BT-MCR-2-074'] = basaraWinBattle();
  reg['UA36BT-MCR-1-080'] = basaraWinBattle();
  reg['UA36BT-MCR-1-081'] = { ...basaraWinBattle(), bpBonus: ownTurnBpBonus(1000).bpBonus };
  reg['UA36BT-MCR-1-082'] = {
    ...basaraWinBattle(),
    async onPlay(G, p, unit) { Engine.draw(p, 1); Engine.draw(Engine.opponentOf(p), 1); log(`${unit.card.name}: ทั้งสองฝ่ายจั่ว 1 ใบ`); },
  };

  // 083 Veffidas Feaze — +1500 BP if 5+ cards in hand.
  reg['UA36BT-MCR-1-083'] = { bpBonus(p) { return p.hand.length >= 5 ? 1500 : 0; } };

  // 086 Mylene Flare Jenius — [On Play] if opponent drew a card this turn, draw up to 1.
  reg['UA36BT-MCR-1-086'] = {
    async onPlay(G, p, unit) {
      if (Engine.opponentOf(p)._drewThisTurn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 014 / ST-111 Ranka Lee — +BP if 3+ yellow Song(Ranka)-trait cards with different names in Outside Area.
  function rankaSongBonus(amount) {
    return {
      bpBonus(p) {
        const names = new Set(p.sideline.map(byNo).filter(c => c && c.color === 'Yellow' && (c.traits || '').includes('Song (Ranka)')).map(c => c.name));
        return names.size >= 3 ? amount : 0;
      },
    };
  }
  reg['UA36BT-MCR-1-014'] = rankaSongBonus(1500);
  reg['UA36ST-MCR-1-111'] = rankaSongBonus(1000);

  // 015 Ranka Lee — [On Play] look at top 2, place up to 1 Event card among them to Outside Area, rest to top.
  reg['UA36BT-MCR-1-015'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (ส่ง Outside Area ได้ 1 ใบ ต้องเป็น Event)`,
        c => c.type === 'Event', 1);
      picked.sort((a, b) => b - a).forEach(i => { p.sideline.push(revealed.splice(i, 1)[0]); });
      p.deck.unshift(...revealed);
    },
  };

  // 004 Sheryl Nome — [On Play] look at top 2, place any number of <Sheryl Nome> among them to Outside Area, rest to top.
  reg['UA36BT-MCR-1-004'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (ส่ง Sheryl Nome ไป Outside Area ได้กี่ใบก็ได้)`,
        c => (c.name || '').includes('Sheryl Nome'), n);
      picked.sort((a, b) => b - a).forEach(i => { p.sideline.push(revealed.splice(i, 1)[0]); });
      p.deck.unshift(...revealed);
    },
  };

  // 062 Aries Turner — [Main][When in Frontline][1/turn] active only: bottom 1 from hand, if did draw 1.
  reg['EX14BT-MCR-2-062'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('มือว่าง'); return; }
      const idx = await p.controller.chooseCardFromHand(p, 'เลือกการ์ดไปไว้ใต้เด็ค');
      if (idx == null) return;
      p.deck.push(p.hand.splice(idx, 1)[0]);
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 072 Elma Hoilie — [On Play] optional discard -> fetch <Basara Nekki> need<=3 from Outside Area.
  reg['EX14BT-MCR-2-072'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อดึง Basara Nekki (Energy≤3) จาก Outside Area? (ไม่บังคับ)');
      if (!discarded) return;
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Basara Nekki') && (c.need || 0) <= 3, 'เลือก Basara Nekki (Energy≤3)');
    },
  };

  // 002 Sheryl Nome — [Main][1/turn, only turn played] choose: (a) Life->hand + draw2/discard1, or (b) draw1 if did (a) this turn.
  reg['EX14BT-MCR-2-002'] = {
    async onMain(G, p, unit) {
      if (unit._playedTurn !== undefined && unit._playedTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงเท่านั้น'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'เพิ่มการ์ดจาก Life เข้ามือ แล้วจั่ว 2 ทิ้ง 1', value: 'life' },
        { label: 'จั่ว 1 ใบ (ถ้าทำอันแรกไปแล้วเทิร์นนี้)', value: 'draw' },
      ]);
      unit._usedTurn = Engine.G.turn;
      if (opt === 'life') {
        const got = await H.addLifeToHand(p);
        if (got) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); unit._didLifeThisTurn = Engine.G.turn; }
      } else if (opt === 'draw' && unit._didLifeThisTurn === Engine.G.turn) {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      }
    },
    async onPlay(G, p, unit) { unit._playedTurn = Engine.G.turn; },
  };

  // 007 Ranka Lee — [Main] only if added a card from Life this turn: set active, +500 BP until next turn.
  reg['EX14BT-MCR-2-007'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit.rested = false;
      unit.bpPersist += 500;
      unit._usedTurn = Engine.G.turn;
      log(`${unit.card.name}: Active + 500 BP จนถึงต้นเทิร์นถัดไป`);
    },
  };

  // 065 Sara Nome — [On Play] choice: buff other +1000, or (if played by an effect) stand a cheap other char.
  reg['EX14BT-MCR-2-065'] = {
    async onPlay(G, p, unit) {
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'buff' },
        { label: 'Active character (BP≤3500 เดิม) อื่น 1 ใบ', value: 'stand' },
      ]);
      if (opt === 'buff') { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.bp || 0) <= 3500);
      if (!others.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character ให้ Active', true);
      const t = others.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 050 Sv-262Ba Draken III — [On Play] optional discard -> fetch Character without Raid from Outside Area.
  reg['EX14BT-MCR-2-050'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อดึง Character (ไม่มี Raid) จาก Outside Area? (ไม่บังคับ)');
      if (!discarded) return;
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && !Engine.parseKeywords(c).raidTargets.length, 'เลือก Character (ไม่มี Raid)');
    },
  };

  // 055 Restaurant Nyan-Nyan (Field) — [Main][Rest+Retire] draw 1, play purple Character need<=3 ap1 rested.
  reg['EX14BT-MCR-2-055'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.color === 'Purple' && c.type === 'Character' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const opt = await p.controller.chooseOption(p, `ลง ${byNo(p.hand[idx]).name} ลงสนามฟรีไหม?`,
        [{ label: 'ลง', value: true }, { label: 'ข้าม', value: false }]);
      if (opt) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 024 Space Restaurant Nyan-Nyan (Field) — [On Play] optional discard -> draw 2; [Main][Rest+Retire] buff+500.
  reg['UA36BT-MCR-1-024'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อจั่ว 2 ใบ? (ไม่บังคับ)');
      if (discarded) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.buffOwnCharacter(p, 500);
    },
  };

  // 038 Yang Neumann — [Main][Rest this card] scry-1 top-or-bottom.
  reg['UA36BT-MCR-1-038'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 087 Ray Lovelock — [Main][Rest this card] only if 5+ cards in hand: scry-1 top-or-bottom.
  reg['UA36BT-MCR-1-087'] = {
    async onMain(G, p, unit) {
      if (p.hand.length < 5) { p.controller.notify?.('ต้องมีการ์ดในมือ 5 ใบขึ้นไป'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 096 Battle 7 (Field) — [On Play] look top 2 rearrange (any split top/bottom, simplified: choose keep-on-top subset);
  // [Main][Rest this card] scry-1 top-or-bottom.
  reg['UA36BT-MCR-1-096'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (เลือกเก็บไว้บนสุด)`, () => true, n);
      const top = picked.map(i => revealed[i]);
      const bottom = revealed.filter((_, i) => !picked.includes(i));
      p.deck.unshift(...top);
      p.deck.push(...bottom);
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 069 Misa Hayase — [Main][Rest this card][1/turn] choice: buff BP4000+ char +1000, or discard1->buff any +1000.
  reg['UA36BT-MCR-1-069'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น (BP≥4000) +1000 BP', value: 'a' },
        { label: 'ทิ้ง 1 ใบ เพื่อ character อื่นใดก็ได้ +1000 BP', value: 'b' },
      ]);
      unit.rested = true;
      if (opt === 'a') {
        const others = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.bp || 0) >= 4000);
        if (!others.length) { p.controller.notify?.('ไม่มี character BP≥4000'); return; }
        const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character', true);
        const t = others.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      } else {
        const discarded = await H.discardFromHand(p);
        if (discarded) await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      }
    },
  };

  // 068 VF-0S Phoenix (Roy Focker) — [On Play] play/raid red Character BP≤3500 from hand;
  // [Main][When in Frontline][1/turn] only if BP≥5000: stand + choice(draw1 / buff other +1000).
  reg['EX14BT-MCR-2-068'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.color === 'Red' && c.type === 'Character' && (c.bp || 0) <= 3500; });
      if (idx < 0) return;
      const opt = await p.controller.chooseOption(p, `ลง ${byNo(p.hand[idx]).name} ลงสนามรึเปล่า?`,
        [{ label: 'ลง (rested)', value: true }, { label: 'ข้าม', value: false }]);
      if (opt) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
    async onMain(G, p, unit) {
      if (Engine.bp(unit) < 5000) { p.controller.notify?.('ต้องมี BP 5000 ขึ้นไป'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit.rested = false;
      unit._usedTurn = Engine.G.turn;
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'draw' },
        { label: 'character อื่น +1000 BP', value: 'buff' },
      ]);
      if (opt === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // ---------- 2026-07-25 round: worst-covered-series pass (see CLAUDE.md "engine hook รอบ MCR") ----------
  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function hasNamed(p, name) { return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name)); }
  async function forceToRemoval(owner, unit, reason) {
    await Engine.sidelineUnit(owner, unit, reason || 'effect');
    const idx = owner.sideline.indexOf(unit.no);
    if (idx >= 0) { owner.sideline.splice(idx, 1); owner.removal.push(unit.no); log(`${unit.card.name} ถูกส่งไป Remove Area แทน Outside Area`); }
  }
  function distinctNamedInSideline(p, trait) {
    return new Set(p.sideline.filter(no => { const c = byNo(no); return c && (c.traits || '').includes(trait); }).map(no => byNo(no).name)).size;
  }

  // 009 Obelisk — choose 1 of 2: draw 2; OR choose 1 own character +3000 BP. (Skipped: the
  // "upgrade to choose 2" clause and the face-up-Life/self-remove 3rd bullet.)
  reg['EX14BT-MCR-2-009'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'จั่ว 2 ใบ', value: 'a' }, { label: 'character ตัวเอง +3000 BP', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); }
      else await H.buffOwnCharacter(p, 3000);
    },
  };

  // 010 Houkago Overflow — choose up to 1 own character +2000 BP; if 3+ distinct-named yellow
  // Trait:Song (Ranka) in your Outside Area, draw 2.
  reg['EX14BT-MCR-2-010'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2000);
      if (distinctNamedInSideline(p, 'Song (Ranka)') >= 3) { Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`); }
    },
  };

  // 011 VF-19EF/A Isamu Special — [On Play][Frontline][1/turn] set active. @[Frontline] at the end
  // of your Attack Phase, draw 1, place this character at the bottom of your deck, choose up to 1
  // character without "Isamu" on your Energy Line and move it to the Front Line.
  reg['EX14BT-MCR-2-011'] = {
    async onPlay(G, p, unit) {
      if (!p.front.includes(unit) || unit._usedTurn === Engine.G.turn) return;
      unit._usedTurn = Engine.G.turn; unit.rested = false;
      log(`${unit.card.name}: ตั้งขึ้น Active`);
    },
    async onAttackPhaseEnd(G, p, unit) {
      if (!p.front.includes(unit)) return;
      const idx = p.front.indexOf(unit);
      p.front.splice(idx, 1); p.deck.push(unit.no);
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ, ไปล่างสุดของเด็ค`);
      const targets = p.energy.filter(u => !(u.card.name || '').includes('Isamu'));
      if (!targets.length || p.front.length >= 4) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ย้ายไป Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, 'front');
    },
  };

  // 014 VF-27γSP Super Lucifer (Brera Sterne) — [Main][Frontline][Rest+Retire] gated by Ranka Lee:
  // retire enemy front BP<=3000; if you used "Sayonara No Tsubasa ~ the end of triangle" this
  // turn, draw 1.
  reg['EX14BT-MCR-2-014'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit) || !hasNamed(p, 'Ranka Lee')) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.retireEnemyFront(p, 3000);
      if (p._usedSayonaraThisTurn === Engine.G.turn) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 018 "Sayonara No Tsubasa ~ the end of triangle" — all enemy Front Line BP>=1500 get -1000 BP,
  // draw 1. (Cost discount + "1 per turn" limit handled generically / skipped.)
  reg['EX14BT-MCR-2-018'] = {
    async onEvent(G, p, card) {
      p._usedSayonaraThisTurn = Engine.G.turn;
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front) { if (Engine.bp(u) >= 1500 && !u.kw.untargetable && !u.tempUntargetable) u.bpMod -= 1000; }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await Engine.checkBpZero();
    },
  };

  // 019 Heinz Nehrich Windermere — [Main][Rest+Discard1][1/turn] gated by own Trait:Aerial Knights
  // on Front Line: all enemy Front Line get -1000 BP.
  reg['EX14BT-MCR-2-019'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (!p.front.some(u => (u.card.traits || '').includes('Aerial Knights'))) { p.controller.notify?.('ต้องมี Trait:Aerial Knights บน Front Line'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front) { if (!u.kw.untargetable && !u.tempUntargetable) u.bpMod -= 1000; }
      log(`${unit.card.name}: ศัตรูบน Front Line ทั้งหมด -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 022 Hayate Immelman — [Main][Frontline][Rest] +1000 BP this turn. @[When Attacking] if BP>=5000
  // look at top 2, keep any number on top, remainder to Outside Area. (Skipped: the "stand when
  // you draw with your effects" reactive clause.)
  reg['EX14BT-MCR-2-022'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit) || unit.rested) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit.rested = true; unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
    async onAttack(G, p, unit) { if (Engine.bp(unit) >= 5000) await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูบนสุด 2 ใบ`); },
  };

  // 035 Freyja Wion — [Main][Rest][1/turn] gated by a "Hayate"-named character on your Front Line:
  // choose 1 of: (a) draw 1, place 1 from hand to Outside Area; (b) add 1 from Life to hand, if you
  // did draw 2, place 1 from hand to Outside Area.
  reg['EX14BT-MCR-2-035'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (!p.front.some(u => (u.card.name || '').includes('Hayate'))) { p.controller.notify?.('ต้องมี character ชื่อ Hayate บน Front Line'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ + ทิ้ง 1 ใบ', value: 'a' }, { label: 'เพิ่มการ์ดจาก Life → จั่ว 2 + ทิ้ง 1 ใบ', value: 'b' },
      ]);
      if (v === 'a') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      else { const no = await H.addLifeToHand(p); if (no != null) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); } }
    },
  };

  // 043 Mikumo Guynemer (2) — [On Play] if 3+ distinct-named Trait:Walkure on your area, place up
  // to 1 Trait:Song (Walküre) (need<=2) from your Outside Area on top of your deck.
  reg['EX14BT-MCR-2-043'] = {
    async onPlay(G, p, unit) {
      if (new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Walkure')).map(u => u.card.name)).size < 3) return;
      const i = p.sideline.findIndex(no => { const c = byNo(no); return c && (c.traits || '').includes('Song (Walküre)') && (c.need || 0) <= 2; });
      if (i < 0) return;
      const no = p.sideline.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} บนสุดของเด็ค`);
    },
  };

  // 058 "AXIA~Daisuki de Daikirai~" — choose 1 Trait:Delta Flight or Walküre character +2000 BP;
  // untap 1 AP.
  reg['EX14BT-MCR-2-058'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Delta Flight') || (u.card.traits || '').includes('Walküre'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      await H.apUntap(p, 1);
    },
  };

  // 061 "GIRAFFE BLUES" — draw 1; choose 1 of: (a) choose up to 1 enemy Front Line, it cannot
  // attack until the start of your next turn; (b) choose up to 1 enemy Front Line character in
  // Raid State, place the top card of its raid stack to the Outside Area.
  reg['EX14BT-MCR-2-061'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ศัตรูห้ามโจมตี', value: 'a' }, { label: 'ยกเลิกชั้นบนของ Raid State ศัตรู', value: 'b' },
      ]);
      const enemy = Engine.opponentOf(p);
      if (v === 'a') {
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        t.tempCannotAttack = true;
        const dueTurn = Engine.G.turn + 2;
        Engine.scheduleDelayedAction(dueTurn, () => { t.tempCannotAttack = false; });
        log(`${card.name}: ${t.card.name} ห้ามโจมตีจนถึงต้นเทิร์นหน้าของคุณ`);
      } else {
        const targets = enemy.front.filter(u => u.under.length);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรูใน Raid State`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) await H.unraidTopLayer(enemy, t);
      }
    },
  };

  // 071 "Bird Human" — gated by 2+ own characters with BP 4000+: retire enemy Front Line BP<=5000;
  // may place 1 Sara Nome from your area to the bottom of your deck, if you did draw 1.
  reg['EX14BT-MCR-2-071'] = {
    async onEvent(G, p, card) {
      if ([...p.front, ...p.energy].filter(u => Engine.bp(u) >= 4000).length < 2) { p.controller.notify?.('ต้องมี character BP 4000+ อย่างน้อย 2 ใบ'); return; }
      await H.retireEnemyFront(p, 5000);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Sara Nome'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: ส่ง Sara Nome ไปล่างสุดของเด็ค? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [p.front, p.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      p.deck.push(t.no);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // UA36BT-MCR-1-028 "Diamond Crevasse" — add 1 Character Card with [Raid] from your Outside Area
  // to your hand; may rest 1 active Sheryl Nome on your Front Line, if you did untap 1 AP.
  reg['UA36BT-MCR-1-028'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && Engine.parseKeywords(c).raidTargets.length, `${card.name}: เลือกการ์ด [Raid] จาก Outside Area`);
      const targets = p.front.filter(u => !u.rested && (u.card.name || '').includes('Sheryl Nome'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: วางนอน Sheryl Nome? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      await H.apUntap(p, 1);
    },
  };

  // UA36BT-MCR-1-030 "Aimo" — gated by Ranka Lee on your Front Line: choose 1 of: (a) rest 1 enemy
  // Front Line character, it doesn't stand next time; (b) look top 5, add up to 2 Character Cards
  // to hand, remainder to bottom.
  reg['UA36BT-MCR-1-030'] = {
    async onEvent(G, p, card) {
      if (!p.front.some(u => (u.card.name || '').includes('Ranka Lee'))) { p.controller.notify?.('ต้องมี Ranka Lee บน Front Line'); return; }
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'วางนอนศัตรู (ไม่ลุกครั้งถัดไป)', value: 'a' }, { label: 'ดูบนสุด 5 ใบ หา Character', value: 'b' },
      ]);
      if (v === 'a') {
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = true; t.skipNextStand = true; log(`${card.name}: ${t.card.name} ถูกวางนอน (ไม่ลุกครั้งถัดไป)`); }
      } else {
        await H.lookTopAndTake(p, 5, c => c.type === 'Character', 2, `${card.name}: ดูบนสุด 5 ใบ`);
      }
    },
  };

  // UA36BT-MCR-1-031 "Interstellar Flight" — rest 1 enemy Front Line BP<=5000, doesn't stand next
  // time; if a Ranka Lee is on your area, may retire it instead.
  reg['UA36BT-MCR-1-031'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (hasNamed(p, 'Ranka Lee')) {
        const v = await p.controller.chooseOption(p, `${card.name}: Retire แทนได้`, [{ label: 'Retire', value: true }, { label: 'วางนอนแทน', value: false }]);
        if (v) { await Engine.sidelineUnit(enemy, t, 'effect'); return; }
      }
      t.rested = true; t.skipNextStand = true;
      log(`${card.name}: ${t.card.name} ถูกวางนอน (ไม่ลุกครั้งถัดไป)`);
    },
  };

  // UA36BT-MCR-1-032 "My Boyfriend Is A Pilot" — choose up to 1 own character +1000 BP; draw 1; if
  // 3+ distinct-named Trait:Song (Ranka) in your Outside Area, untap 1 AP.
  reg['UA36BT-MCR-1-032'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 1000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (distinctNamedInSideline(p, 'Song (Ranka)') >= 3) await H.apUntap(p, 1);
    },
  };

  // UA36BT-MCR-1-035 Guld Goa Bowman — [On Play] if there is an "Isamu"-named character on your
  // area, look at the top 2, keep any number on top, remainder to the bottom.
  reg['UA36BT-MCR-1-035'] = {
    async onPlay(G, p, unit) {
      if (!hasNamed(p, 'Isamu')) return;
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูบนสุด 2 ใบ`, null, n);
      const toBottom = [];
      picked.sort((a, b) => b - a).forEach(i => { toBottom.push(revealed.splice(i, 1)[0]); });
      p.deck.unshift(...revealed);
      p.deck.push(...toBottom);
      log(`${unit.card.name}: จัดเรียงการ์ดบนสุด ${n} ใบ`);
    },
  };

  // UA36BT-MCR-1-036 Guld Goa Bowman (2) — [When in Energy Line] if there is an "Isamu"-named
  // character on your Front Line, +1 generated energy.
  reg['UA36BT-MCR-1-036'] = { genMod(unit, p) { return (p.energy.includes(unit) && p.front.some(u => (u.card.name || '').includes('Isamu'))) ? 1 : 0; } };

  // UA36BT-MCR-1-040 Isamu Dyson — [On Play] if there is a "Guld"-named character on your area,
  // choose up to 1 enemy Front Line BP>=1500, -1000 BP.
  reg['UA36BT-MCR-1-040'] = {
    async onPlay(G, p, unit) {
      if (!hasNamed(p, 'Guld')) return;
      await H.debuffEnemyFront(p, -1000, {});
    },
  };

  // UA36BT-MCR-1-049 "Dogfight" — gated by an "Isamu"- or "Guld"-named character on your area:
  // retire enemy Front Line BP<=5000; if both an Isamu-named and a Guld-named character are on
  // your area, may pay 1 AP, if you did fetch an Isamu/Guld Character Card from your Outside Area
  // to your hand.
  reg['UA36BT-MCR-1-049'] = {
    async onEvent(G, p, card) {
      if (!hasNamed(p, 'Isamu') && !hasNamed(p, 'Guld')) { p.controller.notify?.('ต้องมี character ชื่อ Isamu หรือ Guld บนสนาม'); return; }
      await H.retireEnemyFront(p, 5000);
      if (!hasNamed(p, 'Isamu') || !hasNamed(p, 'Guld')) return;
      const v = await p.controller.chooseOption(p, `${card.name}: จ่าย 1 AP เพื่อดึงการ์ด?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && ((c.name || '').includes('Isamu') || (c.name || '').includes('Guld')), `${card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // UA36BT-MCR-1-051 Sheryl Nome (2) — [Main][Rest][1/turn] choose 1 of: (a) choose up to 1
  // "Alto"-named Front Line character, +1000 BP; (b) grant it "on unblocked attack, draw up to 1"
  // this turn. (Skipped: the "cannot repeat the same effect as other Sheryl Nome cards this turn"
  // exclusivity clause.)
  reg['UA36BT-MCR-1-051'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const targets = p.front.filter(u => (u.card.name || '').includes('Alto'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1000 BP', value: 'a' }, { label: 'โจมตีไม่ถูกบล็อค → จั่ว 1', value: 'b' },
      ]);
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ชื่อ Alto`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (v === 'a') { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
      else { t._grantedUnblockedDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "โจมตีไม่ถูกบล็อค จั่ว 1" เทิร์นนี้`); }
    },
  };

  // UA36BT-MCR-1-052 Ranka Lee — [Main][Rest][1/turn] choose 1 of: (a) if an "Alto"-named
  // character is on your Front Line, choose up to 1 enemy BP>=1500, -1000 BP; (b) grant an
  // "Alto"-named Front Line character "on win battle, draw up to 1" this turn. (Skipped: the
  // "cannot repeat the same effect" exclusivity clause.)
  reg['UA36BT-MCR-1-052'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ศัตรู -1000 BP (ต้องมี Alto บน Front Line)', value: 'a' }, { label: 'ชนะ battle → จั่ว 1 (Alto บน Front Line)', value: 'b' },
      ]);
      if (v === 'a') {
        if (!p.front.some(u => (u.card.name || '').includes('Alto'))) { p.controller.notify?.('ต้องมี Alto บน Front Line'); return; }
        await H.debuffEnemyAny(p, -1000, { min: 1500 });
      } else {
        const targets = p.front.filter(u => (u.card.name || '').includes('Alto'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ชื่อ Alto`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t._grantedOnWinDraw = true; log(`${unit.card.name}: ${t.card.name} ได้รับ "ชนะ battle จั่ว 1" เทิร์นนี้`); }
      }
    },
  };

  // UA36BT-MCR-1-068 Hikaru Ichijyo — [On Play] may pay 1 AP, if you did add up to 1 Lynn Minmay
  // or Misa Hayase from your Outside Area to your hand. @[Main][1/turn] if this character's BP is
  // 5000+, set this character to active.
  reg['UA36BT-MCR-1-068'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อดึงการ์ด?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      await H.fetchFromSideline(p, c => c && ((c.name || '').includes('Lynn Minmay') || (c.name || '').includes('Misa Hayase')), `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      if (Engine.bp(unit) < 5000) { p.controller.notify?.('BP ต้อง 5000 ขึ้นไป'); return; }
      unit._usedTurn = Engine.G.turn; unit.rested = false;
      log(`${unit.card.name}: ตั้งขึ้น Active`);
    },
  };

  // UA36BT-MCR-1-074 Exsedol Folmo — [On Play] gated by a "Maximilian Jenius"-named character on
  // your area: choose 1 of: (a) look top 2, keep any number on top, remainder to Outside Area; (b)
  // choose up to 1 other own character, +1000 BP.
  reg['UA36BT-MCR-1-074'] = {
    async onPlay(G, p, unit) {
      if (!hasNamed(p, 'Maximilian Jenius')) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูบนสุด 2 ใบ', value: 'a' }, { label: 'character อื่น +1000 BP', value: 'b' },
      ]);
      if (v === 'a') await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูบนสุด 2 ใบ`);
      else await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // UA36BT-MCR-1-094 Gigile — [Your Turn] if a "Basara"-named character is in the same line as
  // this character, +1000 BP. (Skipped: the replacement-effect "retire this instead of Sivil"
  // clause.)
  reg['UA36BT-MCR-1-094'] = {
    bpBonus(p, unit) {
      if (!isYourTurn(p)) return 0;
      const line = p.front.includes(unit) ? p.front : p.energy;
      return line.some(u => u !== unit && (u.card.name || '').includes('Basara')) ? 1000 : 0;
    },
  };

  // UA36BT-MCR-1-099 "Totsugeki Love Heart" — choose 1 enemy Front Line BP<=5000, place it on top
  // or bottom of your opponent's deck, by your opponent's choice; if a "Basara"-named character is
  // on your area, by your choice instead.
  reg['UA36BT-MCR-1-099'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      for (const line of [enemy.front, enemy.energy]) { const i = line.indexOf(t); if (i >= 0) line.splice(i, 1); }
      const chooser = hasNamed(p, 'Basara') ? p : enemy;
      const dest = await chooser.controller.chooseOption(chooser, `${t.card.name}: บนสุดหรือล่างสุดของเด็คเจ้าของ?`, [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
      if (dest === 'top') enemy.deck.unshift(t.no); else enemy.deck.push(t.no);
      log(`${card.name}: ${t.card.name} ไป${dest === 'top' ? 'บนสุด' : 'ล่างสุด'}ของเด็คเจ้าของ`);
    },
  };

  // UA36BT-MCR-1-100 "TRY AGAIN" — draw 2; choose up to 1 "Basara"-named own Front Line, set
  // active and [Impact +1]; choose up to 1 Sivil on your Front Line, set active.
  reg['UA36BT-MCR-1-100'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      const basaras = p.front.filter(u => (u.card.name || '').includes('Basara'));
      if (basaras.length) {
        const uid = await p.controller.chooseOwnCharacter(p, basaras, `${card.name}: เลือก character ชื่อ Basara`, true);
        const t = basaras.find(x => x.uid === uid);
        if (t) { t.rested = false; t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} ตั้งขึ้น + [Impact +1]`); }
      }
      const sivils = p.front.filter(u => (u.card.name || '').includes('Sivil'));
      if (sivils.length) {
        const uid = await p.controller.chooseOwnCharacter(p, sivils, `${card.name}: เลือก Sivil`, true);
        const t = sivils.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${card.name}: ${t.card.name} ตั้งขึ้น`); }
      }
    },
  };

  // UA36ST-MCR-1-109 "Sniper Rifle" (Field) — [On Play] if there is a "Michael"-named character on
  // your area, set this Field to active. @[Main][Rest+Retire] choose up to 1 Trait:S.M.S
  // character, [Impact +1]. (Skipped: the "[When in Outside Area] reactive to a Michael-named
  // character retiring" clause — recurring "activate from Outside Area" gap.)
  reg['UA36ST-MCR-1-109'] = {
    async onPlay(G, p, unit) { if (hasNamed(p, 'Michael')) { unit.rested = false; log(`${unit.card.name}: ตั้งขึ้น Active`); } },
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('S.M.S'));
      await Engine.sidelineUnit(p, unit, 'effect');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:S.M.S`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${unit.card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
    },
  };

  // UA36ST-MCR-1-110 Sheryl Nome (3) — [Main][Rest][1/turn] rest 1 active own Front Line
  // character, if you did +1 generated energy this turn.
  reg['UA36ST-MCR-1-110'] = {
    async onMain(G, p, unit) {
      if (unit.rested || unit._usedTurn === Engine.G.turn) return;
      const targets = p.front.filter(u => u !== unit && !u.rested);
      if (!targets.length) return;
      unit.rested = true; unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ให้วางนอน`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true;
      unit.tempGen += 1;
      log(`${unit.card.name}: ${t.card.name} ถูกวางนอน, +1 energy generation เทิร์นนี้`);
    },
  };

  // ─── residual pass ───────────────────────────────────────────────────────────

  const nameHas = (u, s) => (u.card.name || '').includes(s);
  const ownNameHas = (p, s) => [...p.front, ...p.energy].filter(u => nameHas(u, s));
  const confirmR = (p, q) => p.controller.chooseOption(p, q, [{ label: 'ตกลง', value: true }, { label: 'ข้าม', value: false }]);
  async function pickOwnR(p, list, title) {
    if (!list.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, list, title, true);
    return list.find(u => u.uid === uid) || null;
  }
  async function pickEnemyR(p, list, title) {
    if (!list.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, list, title, true);
    return list.find(u => u.uid === uid) || null;
  }

  // 2-003 Sheryl Nome — [Main][1 Per Turn] add 1 card from your Life to your hand.
  reg['EX14BT-MCR-2-003'] = {
    async onMain(G, p, unit) {
      if (unit._lifeTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      if (!p.life.length) { p.controller.notify?.('ไม่มีการ์ด Life'); return; }
      unit._lifeTurn = Engine.G.turn;
      await H.addLifeToHand(p);
    },
    mainLabel: 'เพิ่มการ์ด Life 1 ใบเข้ามือ',
  };

  // 2-016 YF-29 Durandal Valkyrie — [On Play] fetch the named Event from your Outside Area;
  // [On Retire] on your turn, replay one of its raid source cards in active.
  reg['EX14BT-MCR-2-016'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => /Sayonara No Tsubasa/i.test(c.name || ''),
        `${unit.card.name}: เลือก Sayonara No Tsubasa เข้ามือ`);
    },
    onBeforeLeaveField(G, p, leaving, ctx, unit) {
      if (leaving === unit) unit._raidSource = unit.under.slice();
      return false;
    },
    async onSideline(G, p, unit) {
      const src = unit._raidSource || [];
      unit._raidSource = null;
      if (Engine.G.players[Engine.G.active] !== p) return;
      const no = src.find(n => byNo(n)?.type === 'Character');
      if (!no) return;
      const i = p.sideline.lastIndexOf(no);
      if (i < 0) return;
      p.sideline.splice(i, 1);
      p.deck.unshift(no);
      await Engine.playCardFromZone(p, no, 'deck', { line: 'front', active: true });
      const placed = p.front.find(x => x.no === no);
      if (placed) {
        placed.tempUnblockableBP = 3000;
        log(`${byNo(no)?.name}: ไม่ถูกบล็อกโดย BP ≤3000 เทิร์นนี้`);
      }
    },
  };

  // 2-031 Kaname Buccaneer — [On Play] discard 1 to play a purple Walküre card (need <=2) from
  // your Outside Area rested.
  reg['EX14BT-MCR-2-031'] = {
    async onPlay(G, p, unit) {
      const fits = no => {
        const c = byNo(no);
        return c && c.type === 'Character' && (c.color || '').toLowerCase() === 'purple' &&
          (c.traits || '').includes('Walküre') && (c.need || 0) <= 2;
      };
      if (!p.hand.length || !p.sideline.some(fits)) return;
      if (!await confirmR(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อลง Walküre สีม่วง (energy ≤2) จาก Outside Area?`)) return;
      await H.discardFromHand(p);
      const i = p.sideline.findIndex(fits);
      if (i < 0) return;
      await Engine.playCardFromZone(p, p.sideline[i], 'sideline', { line: 'front', active: false });
    },
  };

  // 2-036 Freyja Wion — [When Attacking] with 3+ differently-named Walküre cards on your area, all
  // your characters gain +1000 BP this turn.
  reg['EX14BT-MCR-2-036'] = {
    onAttack(G, p, unit) {
      const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Walküre')).map(u => u.card.name));
      if (names.size < 3) return;
      for (const u of [...p.front, ...p.energy]) u.bpMod += 1000;
      log(`${unit.card.name}: character ทั้งหมดได้ +1000 BP เทิร์นนี้`);
    },
  };

  // 2-039 Makina Nakajima — [On Play] buff another character by +1000 BP, or +2000 with 5+
  // differently-named Walküre cards on your area.
  reg['EX14BT-MCR-2-039'] = {
    async onPlay(G, p, unit) {
      const names = new Set([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Walküre')).map(u => u.card.name));
      if (names.size < 3) return;
      const amount = names.size >= 5 ? 2000 : 1000;
      const t = await pickOwnR(p, [...p.front, ...p.energy].filter(u => u !== unit), `${unit.card.name}: เลือก character รับ +${amount} BP`);
      if (!t) return;
      t.bpMod += amount;
      log(`${t.card.name}: ได้ +${amount} BP เทิร์นนี้`);
    },
  };

  // 2-053 VF-31C Siegfried — [Main][When in Frontline][1 Per Turn] choose a "Hayate" character to
  // draw 1 and give it [Impact (1)] this turn.
  reg['EX14BT-MCR-2-053'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._hayateTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      const t = await pickOwnR(p, ownNameHas(p, 'Hayate'), `${unit.card.name}: เลือก character "Hayate"`);
      if (!t) return;
      unit._hayateTurn = Engine.G.turn;
      Engine.draw(p, 1);
      t.tempImpact = (t.tempImpact || 0) + 1;
      log(`${unit.card.name}: จั่ว 1 ใบ · ${t.card.name} ได้ [Impact (1)] เทิร์นนี้`);
    },
    mainLabel: 'จั่ว 1 + ให้ "Hayate" [Impact (1)]',
  };

  // 2-067 Roy Focker — [Main][1 Per Turn] usable only while this character's BP is above its
  // printed value; +1500 BP this turn.
  reg['EX14BT-MCR-2-067'] = {
    async onMain(G, p, unit) {
      if (unit._royTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      if (Engine.bp(unit) <= (unit.card.bp || 0)) { p.controller.notify?.('BP ต้องสูงกว่าค่าที่พิมพ์ไว้'); return; }
      unit._royTurn = Engine.G.turn;
      unit.bpMod += 1500;
      log(`${unit.card.name}: ได้ +1500 BP เทิร์นนี้`);
    },
    mainLabel: '+1500 BP',
  };

  // 1-009 Sheryl Nome — [Main][When in Frontline][Rest this card] draw 1.
  reg['UA36BT-MCR-1-009'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 3, 3, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่'); return; }
      unit.rested = true;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
    mainLabel: 'จั่ว 1 ใบ',
  };

  // 1-010 Sheryl Nome — [On Play] draw 1 and rest an enemy Front Line character; [Main][When in
  // Frontline][Rest this card] make a rested enemy skip its next Stand.
  reg['UA36BT-MCR-1-010'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.restEnemyFront(p);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่'); return; }
      const enemy = Engine.opponentOf(p);
      const t = await pickEnemyR(p, enemy.front.filter(u => u.rested), `${unit.card.name}: เลือก character ศัตรูที่นอนอยู่`);
      if (!t) return;
      unit.rested = true;
      t.skipNextStand = true;
      log(`${t.card.name}: จะไม่ตั้งขึ้นในรอบถัดไป`);
    },
    mainLabel: 'ศัตรูที่นอนอยู่ ไม่ตั้งขึ้นรอบถัดไป',
  };

  // 1-011 Sheryl Nome — [On Play] fetch a <Sheryl Nome> with required energy 4 or less from your
  // Outside Area.
  reg['UA36BT-MCR-1-011'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => /Sheryl Nome/.test(c.name || '') && (c.need || 0) <= 4,
        `${unit.card.name}: เลือก Sheryl Nome (energy ≤4) เข้ามือ`);
    },
    // [Your Turn] +1000 BP and [Impact (1)] with 3+ Sheryl Nome [Raid] cards in your Outside Area
    bpBonus(p, unit) { return isYourTurn(p) && sherylRaidInSideline(p) >= 3 ? 1000 : 0; },
    impactBonus(p, unit) { return isYourTurn(p) && sherylRaidInSideline(p) >= 3 ? 1 : 0; },
  };
  const sherylRaidInSideline = p => p.sideline.filter(no => {
    const c = byNo(no);
    return c && /Sheryl Nome/.test(c.name || '') && /\[Raid\]/i.test(c.effect || '');
  }).length;

  // 1-020 Ranka Lee — [Your Turn] +500 BP with 3+ differently-named yellow Song (Ranka) cards in
  // your Outside Area.
  reg['UA36BT-MCR-1-020'] = {
    bpBonus(p, unit) {
      if (!isYourTurn(p)) return 0;
      const names = new Set(p.sideline.map(byNo).filter(c =>
        c && (c.color || '').toLowerCase() === 'yellow' && (c.traits || '').includes('Song (Ranka)')).map(c => c.name));
      return names.size >= 3 ? 500 : 0;
    },
  };

  // 1-046 YF-19 (Isamu Dyson) — [On Play] debuff an enemy Front Line character with BP 2500+;
  // [When Attacking] repeat it while a "Guld" character is on your Front Line.
  const isamuDebuff = async (p, unit) => {
    const enemy = Engine.opponentOf(p);
    const t = await pickEnemyR(p, enemy.front.filter(u => Engine.bp(u) >= 2500), `${unit.card.name}: เลือก character ศัตรู (BP ≥2500) รับ -2000 BP`);
    if (!t) return;
    t.bpMod -= 2000;
    log(`${t.card.name}: -2000 BP เทิร์นนี้`);
  };
  reg['UA36BT-MCR-1-046'] = {
    async onPlay(G, p, unit) { await isamuDebuff(p, unit); },
    async onAttack(G, p, unit) {
      if (!p.front.some(u => nameHas(u, 'Guld'))) return;
      await isamuDebuff(p, unit);
    },
  };

  // 1-054 VF-27 Lucifer — [On Play] with a Ranka Lee on your area, discard 1 to bounce an enemy
  // Front Line character with BP 3500 or less.
  reg['UA36BT-MCR-1-054'] = {
    async onPlay(G, p, unit) {
      if (!ownNameHas(p, 'Ranka Lee').length || !p.hand.length) return;
      if (!await confirmR(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อคืน character ศัตรู (BP ≤3500) เข้ามือ?`)) return;
      await H.discardFromHand(p);
      await H.bounceEnemyFront(p, 3500);
    },
  };

  // 1-064 Macross Quarter — two [Main] abilities on one Field card.
  reg['UA36BT-MCR-1-064'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่'); return; }
      const opts = [{ label: 'จั่ว 1 ทิ้ง 1', value: 'draw' }];
      if (p.hand.length >= 2 && Engine.activeAP(p) >= 1) opts.push({ label: 'ทิ้ง 2 + จ่าย 1 AP → retire ศัตรู', value: 'retire' });
      opts.push({ label: 'ยกเลิก', value: null });
      const pick = await p.controller.chooseOption(p, `${unit.card.name}: เลือกความสามารถ`, opts);
      if (!pick) return;
      if (pick === 'draw') {
        if (unit._drawTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
        unit._drawTurn = Engine.G.turn;
        unit.rested = true;
        Engine.draw(p, 1);
        log(`${unit.card.name}: จั่ว 1 ใบ`);
        await H.discardFromHand(p);
        return;
      }
      if (unit._retireTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      if (!Engine.payApForEffect(p, 1)) return;
      unit._retireTurn = Engine.G.turn;
      unit.rested = true;
      await H.discardFromHand(p);
      await H.discardFromHand(p);
      await H.retireEnemyFront(p);
    },
    mainLabel: 'จั่ว 1 ทิ้ง 1 / ทิ้ง 2 + 1 AP → retire',
  };

  // 1-067 Lynn Minmay — [Main][When in Frontline][1 Per Turn] every other character on your area
  // gets +1000 BP this turn.
  reg['UA36BT-MCR-1-067'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._minmayTurn === Engine.G.turn) { p.controller.notify?.('ใช้ได้เทิร์นละครั้ง'); return; }
      unit._minmayTurn = Engine.G.turn;
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if (u !== unit) { u.bpMod += 1000; n++; }
      log(`${unit.card.name}: character อื่น ${n} ใบได้ +1000 BP เทิร์นนี้`);
    },
    mainLabel: 'character อื่นทั้งหมด +1000 BP',
  };
})();
