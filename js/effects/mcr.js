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
})();
