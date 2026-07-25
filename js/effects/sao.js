// ══════════ UA SIM — Sword Art Online (SAO) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
  function usedTraitThisTurn(p, sub) { return [...(p._playedTraitsThisTurn || [])].some(t => t.includes(sub.toLowerCase())); }

  // 2-001 Administrator — [On Play] free-play 1 yellow Trait:Integrity Knights (need<=1) from your
  // Outside Area rested. Look at the top 7, reveal up to 1 (Armament Full Control Art or Release
  // Recollection Technique) among them and add it to your hand, remainder to the bottom.
  reg['EX08BT-SAO-2-001'] = {
    async onPlay(G, p, unit) {
      const idx = p.sideline.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Integrity Knights') && (c.need || 0) <= 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      await H.lookTopAndTake(p, 7, c => /Armament Full Control Art|Release Recollection Technique/.test(c.name || ''), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
    },
  };

  // 2-006 Bercouli Synthesis One — passive: if 4+ other Trait:Integrity Knights on your area, +1
  // generated energy.
  reg['EX08BT-SAO-2-006'] = { genMod(unit, p) { return [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Integrity Knights')).length >= 4 ? 1 : 0; } };

  // 2-012 "Armament Full Control Art" — all Trait:Integrity Knights on your area +1000 BP this
  // turn. Choose 1 Trait:Integrity Knights on your Front Line, [Impact +1] this turn. If 4+ other
  // Trait:Integrity Knights on your area, draw 1.
  reg['EX08BT-SAO-2-012'] = {
    async onEvent(G, p, card) {
      const own = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Integrity Knights'));
      for (const u of own) u.bpMod += 1000;
      if (own.length) log(`${card.name}: Trait:Integrity Knights ทุกใบ +1000 BP เทิร์นนี้`);
      const targets = p.front.filter(u => (u.card.traits || '').includes('Integrity Knights'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Trait:Integrity Knights บน Front Line`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempImpact = (t.tempImpact || 0) + 1; log(`${card.name}: ${t.card.name} [Impact +1] เทิร์นนี้`); }
      }
      if (own.length >= 5) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 2-013 "Release Recollection Technique" — choose 1 enemy Front Line character with BP <=
  // (Trait:Integrity Knights cards on your area x1000) and retire it.
  reg['EX08BT-SAO-2-013'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Integrity Knights')).length; await H.retireEnemyFront(p, n * 1000); } };

  // 2-014 Asuna — [Your Turn][1/turn] when this character moves outside your Move Phase, it gains
  // "[When Attacking] draw 1" this turn.
  reg['EX08BT-SAO-2-014'] = {
    async onAnyMove(G, p, movedUnit, self) {
      if (movedUnit !== self || self._usedTurn === Engine.G.turn) return;
      if (!isYourTurn(p)) return;
      self._usedTurn = Engine.G.turn;
      self._grantedAttackDraw = true;
      log(`${self.card.name}: ได้รับ "โจมตีแล้วจั่ว 1 ใบ" เทิร์นนี้`);
    },
  };

  // 2-017 Silica — [On Play] look at the top 2, keep any number on top (any order), remainder to
  // the Outside Area.
  reg['EX08BT-SAO-2-017'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 2-018 X'rphan the White Wyrm — [On Retire] look at the top 5, reveal up to 1 (Crystallite
  // Ingot, Kirito, or Lisbeth) among them and add it to hand, remainder to the bottom; if added,
  // place 1 card from hand to the Outside Area.
  reg['EX08BT-SAO-2-018'] = {
    async onSideline(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 5, c => /Crystallite Ingot|Kirito|Lisbeth/.test(c.name || ''), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 2-021 Kirito — [Main][Discard 1][1/turn] +1500 BP this turn.
  reg['EX08BT-SAO-2-021'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1500; log(`${unit.card.name}: +1500 BP เทิร์นนี้`);
    },
  };

  // 2-022 Yui — [On Play] draw 1. The next time a Kirito with Trait:ALO is played this turn, draw
  // up to 1 [1/turn].
  reg['EX08BT-SAO-2-022'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit._grantTurn = Engine.G.turn;
    },
    async onAnyPlay(G, p, playedUnit, self) {
      if (self._grantTurn !== Engine.G.turn || self._usedTurn === Engine.G.turn) return;
      if (playedUnit === self) return;
      if (!(playedUnit.card.name || '').includes('Kirito') || !(playedUnit.card.traits || '').includes('ALO')) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ (ได้รับความสามารถชั่วคราว)`);
    },
  };

  // 2-025 "Crystallite Ingot" — draw 2. If there is a Lisbeth on your area, draw 1 more and place
  // 1 card from hand to the Outside Area.
  reg['EX08BT-SAO-2-025'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (H.hasCardNamed(p, 'Lisbeth')) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 2-030 Yuna — [On Play] look at the top 2, keep any number on top (any order), remainder to the
  // Outside Area.
  reg['EX08BT-SAO-2-030'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 2-034 Eiji — [When Attacking] place up to 1 card from the top of your deck to the Outside Area.
  reg['EX08BT-SAO-2-034'] = {
    async onAttack(G, p, unit) {
      if (!p.deck.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดบนสุดของเด็คไป Outside Area?`, [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const no = p.deck.shift();
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ${byNo(no)?.name} ไป Outside Area`);
    },
  };

  // 2-037 Klein — [On Retire] place up to 2 cards from the top of your deck to the Outside Area.
  reg['EX08BT-SAO-2-037'] = {
    async onSideline(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const sent = p.deck.splice(0, n);
      p.sideline.push(...sent);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + n;
      log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
    },
  };

  // 2-038 Silica — [On Play] if you used a Trait:Song card this turn, draw 1.
  reg['EX08BT-SAO-2-038'] = { async onPlay(G, p, unit) { if (usedTraitThisTurn(p, 'song')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 2-039 Lisbeth — [Your Turn] if you used a Trait:Song card this turn, +1000 BP.
  reg['EX08BT-SAO-2-039'] = { bpBonus(p, unit) { return (isYourTurn(p) && usedTraitThisTurn(p, 'song')) ? 1000 : 0; } };

  // 2-043 Argo — [Main][Frontline][Discard 1][1/turn] choose 1 enemy Front Line character with BP
  // 1500 or more, -1000 BP this turn.
  async function discardDebuffFront(p, unit) {
    if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
    if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
    const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
    if (!discarded) return;
    unit._usedTurn = Engine.G.turn;
    await H.debuffEnemyFront(p, -1000, {});
  }
  reg['EX08BT-SAO-2-043'] = { async onMain(G, p, unit) { await discardDebuffFront(p, unit); } };

  // 2-052 Mito — same ability as Argo-2-043.
  reg['EX08BT-SAO-2-052'] = { async onMain(G, p, unit) { await discardDebuffFront(p, unit); } };

  // 2-053 Mito — [On Play] choose up to 1 enemy character, grant it "cannot block while its BP is
  // lower than its printed BP" this turn (approximated: evaluated once at grant time).
  reg['EX08BT-SAO-2-053'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (t.card.bp != null && Engine.bp(t) < t.card.bp) { t.noBlock = true; log(`${unit.card.name}: ${t.card.name} block ไม่ได้เทิร์นนี้`); }
    },
  };

  // 2-056 Akihiko Kayaba (Field) — [On Play] you may retire 1 character on your area; if you did,
  // look at the top 5, reveal up to 2 Trait:Progressive among them and add them to hand, remainder
  // to the bottom.
  reg['EX08BT-SAO-2-056'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: retire character?`, [{ label: 'retire', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      log(`${unit.card.name}: ${t.card.name} ถูก retire`);
      await H.lookTopAndTake(p, 5, c => (c.traits || '').includes('Progressive'), 2, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
    },
  };

  // 2-060 "smile for you" — add up to 1 Character card from your Outside Area to your hand.
  // Free-play up to 1 purple Trait:SAO Survivor (ap1) from hand active; grant it protection from
  // opponent's character effects until the start of your next turn (approximated as this turn).
  reg['EX08BT-SAO-2-060'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือกการ์ดจาก Outside Area`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && (c.traits || '').includes('SAO Survivor') && (c.ap || 0) === 1; });
      if (idx < 0) return;
      const u = await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: true });
      if (u) { u.tempUntargetable = true; log(`${card.name}: ${u.card.name} ป้องกันการเป็นเป้าหมายเทิร์นนี้`); }
    },
  };

  // 2-064 Kirito — [Frontline] grants own Asuna a targeting tax. (Skipped: recurring gap.)

  // 2-065 Klein — passive: if there is no Freyja on your area, -500 BP.
  reg['EX08BT-SAO-2-065'] = { bpBonus(p, unit) { return H.hasCardNamed(p, 'Freyja') ? 0 : -500; } };

  // 2-066 Sinon — [On Play] look at the top 2, place up to 1 green Trait:ALO among them to the
  // Outside Area, remainder to the top.
  reg['EX08BT-SAO-2-066'] = { async onPlay(G, p, unit) { await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.color === 'Green' && (c.traits || '').includes('ALO')); } };

  // 2-068 Yuuki — [Main][Rest][Discard 1][Retire] free-play 1 green Asuna (need<=3, ap1) from hand
  // to the Front Line active, +1000 BP this turn.
  reg['EX08BT-SAO-2-068'] = {
    async onMain(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.name || '').includes('Asuna') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const idx2 = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.name || '').includes('Asuna') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx2 < 0) return;
      const u = await Engine.playCardFromZone(p, p.hand[idx2], 'hand', { line: 'front', active: true });
      if (u) { u.bpMod += 1000; log(`${unit.card.name}: ${u.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 2-074 Tonky (Field) — [On Play] reduce the AP cost of the next Trait:ALO card with printed BP
  // 3500 used this turn by 1.
  reg['EX08BT-SAO-2-074'] = { async onPlay(G, p, unit) { p.pendingDiscount = { predicate: c => (c.traits || '').includes('ALO') && (c.bp || 0) === 3500, apDelta: -1 }; log(`${unit.card.name}: Trait:ALO (BP 3500) ใบถัดไป ลด AP cost 1`); } };

  // 1-020 Asuna (Goddess of Creation Stacia) — passive: if your Life is 4 or less, +500 BP.
  reg['SAO-1-020'] = { bpBonus(p, unit) { return p.life.length <= 4 ? 500 : 0; } };

  // 1-021 Asuna (Goddess of Creation Stacia) — [On Play] you may add 1 card from your Life Area to
  // your hand; if you did, draw 1.
  reg['SAO-1-021'] = { async onPlay(G, p, unit) { const no = await H.addLifeToHand(p); if (no != null) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 1-024 Sinon (Sun Goddess Solus) — [Main][Discard 1][1/turn] gains [Sniper] this turn
  // (approximated: does not separately enforce the BP 2500+ Sniper-targeting restriction).
  reg['SAO-1-024'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.tempSnipe = true; log(`${unit.card.name}: [Sniper] เทิร์นนี้`);
    },
  };

  // 1-029 Gigas Cedar (Field) — [Main][Rest+Retire] only if there is a Eugeo with BP 4000+ on your
  // area: draw 2.
  reg['SAO-1-029'] = {
    async onMain(G, p, unit) {
      if (![...p.front, ...p.energy].some(u => (u.card.name || '').includes('Eugeo') && Engine.bp(u) >= 4000)) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
    },
  };

  // 1-033 "Unlimited Terrain Manipulation" — choose 1 of: choose up to 1 enemy Front Line and up to
  // 1 enemy Energy Line character (gen<=1) and rest them, swap positions if both chosen; or choose
  // up to 1 enemy Field card (gen<=1) and retire it.
  reg['SAO-1-033'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'วางนอน character ศัตรู Front/Energy Line', value: 'a' }, { label: 'retire Field ศัตรู', value: 'b' },
      ]);
      if (v === 'b') {
        const targets = enemy.energy.filter(u => u.card.type === 'Field' && (u.card.gen || 0) <= 1);
        if (!targets.length) return;
        const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก Field ศัตรู`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); log(`${card.name}: ${t.card.name} ถูก retire`); }
        return;
      }
      let a = null, b = null;
      if (enemy.front.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, enemy.front, `${card.name}: เลือก character บน Front Line ศัตรู`, true);
        a = enemy.front.find(x => x.uid === uid);
      }
      const elTargets = enemy.energy.filter(u => (u.card.gen || 0) <= 1);
      if (elTargets.length) {
        const uid = await p.controller.chooseEnemyCharacter(p, elTargets, `${card.name}: เลือก character บน Energy Line ศัตรู`, true);
        b = elTargets.find(x => x.uid === uid);
      }
      if (a) { a.rested = true; log(`${card.name}: ${a.card.name} ถูกวางนอน`); }
      if (b) { b.rested = true; log(`${card.name}: ${b.card.name} ถูกวางนอน`); }
      if (a && b) {
        const swap = await p.controller.chooseOption(p, `${card.name}: สลับตำแหน่ง?`, [{ label: 'สลับ', value: true }, { label: 'ข้าม', value: false }]);
        if (swap) {
          const fi = enemy.front.indexOf(a), ei = enemy.energy.indexOf(b);
          enemy.front[fi] = b; enemy.energy[ei] = a;
          log(`${card.name}: สลับตำแหน่ง ${a.card.name} กับ ${b.card.name}`);
        }
      }
    },
  };

  // 1-034 "Radiant Light" — choose 1 enemy Front Line character with BP 5000 or less, rest it and
  // it won't stand next time (retire instead if your Life is 4 or less).
  reg['SAO-1-034'] = {
    async onEvent(G, p, card) {
      if (p.life.length <= 4) { await H.retireEnemyFront(p, 5000); return; }
      const t = await H.restEnemyFront(p, 5000);
      if (t) t.skipNextStand = true;
    },
  };

  // 1-036 Asuna — [1/turn] if this character moves outside your Move Phase, +1000 BP this turn.
  reg['SAO-1-036'] = {
    async onAnyMove(G, p, movedUnit, self) {
      if (movedUnit !== self || self._usedTurn === Engine.G.turn) return;
      self._usedTurn = Engine.G.turn;
      self.bpMod += 1000; log(`${self.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 1-043 Silica — [On Play] free-play 1 Pina from your Outside Area rested.
  reg['SAO-1-043'] = { async onPlay(G, p, unit) { const idx = p.sideline.findIndex(no => (byNo(no)?.name || '').includes('Pina')); if (idx >= 0) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false }); } };

  // 1-048 Lizbeth — [Your Turn][1/turn] when a character on your area moves outside your Move
  // Phase, you may draw 1; if you did, place 1 card from hand to the Outside Area.
  reg['SAO-1-048'] = {
    async onAnyMove(G, p, movedUnit, self) {
      if (self._usedTurn === Engine.G.turn || !isYourTurn(p)) return;
      self._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${self.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 1-049 Asuna — cannot be played to or moved to the Front Line. @[On Play] look at the top 4,
  // free-play up to 1 Trait:ALO character (fulfilled energy, ap1) among them to the Front Line
  // active, remainder to the bottom.
  reg['SAO-1-049'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('ALO') && Engine.hasEnergyFor(p, c) && (c.ap || 0) === 1; });
      if (idx >= 0 && p.front.length < 4) {
        const no = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        p.sideline.push(no);
        await Engine.playCardFromZone(p, no, 'sideline', { line: 'front', active: true });
      } else p.deck.push(...revealed);
    },
  };

  // 1-053 Kirito — [On Play] free-play 1 blue Trait:ALO (need<=1, ap1) from hand to the Front Line
  // rested (need<=3 instead if you have 5+ cards in hand).
  reg['SAO-1-053'] = {
    async onPlay(G, p, unit) {
      const cap = p.hand.length >= 5 ? 3 : 1;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.traits || '').includes('ALO') && (c.need || 0) <= cap && (c.ap || 0) === 1; });
      if (idx >= 0 && p.front.length < 4) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'front', active: false });
    },
  };

  // 1-056 Yui — [On Play] choose 1 of: look at the top 2, reveal up to 1 Character/Field card
  // among them and add it to hand, remainder to the bottom; or free-play 1 blue Character (need<=2,
  // ap1) from hand rested.
  reg['SAO-1-056'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 2 ใบ', value: 'a' }, { label: 'ลง Character สีน้ำเงินจากมือ', value: 'b' },
      ]);
      if (v === 'a') await H.lookTopAndTake(p, 2, c => c.type === 'Character' || c.type === 'Field', 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`);
      else { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); }
    },
  };

  // 1-067 "Ragout Rabbit Stew" — choose up to 1 character on your Front Line, +2000 BP this turn.
  // Draw 1.
  reg['SAO-1-067'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpMod += 2000; log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 1-076 Sleeping Knights — [On Play] free-play 1 Trait:ALO (need<=2, ap1) from hand rested.
  reg['SAO-1-076'] = { async onPlay(G, p, unit) { const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('ALO') && (c.need || 0) <= 2 && (c.ap || 0) === 1; }); if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false }); } };

  // 1-079 Yuuki — [On Retire] choose up to 1 character, +1000 BP this turn.
  reg['SAO-1-079'] = { async onSideline(G, p, unit) { await H.buffOwnCharacter(p, 1000); } };

  // 1-083 Lizbeth — [On Play] add up to 1 green Trait:ALO card from your Outside Area to your hand.
  reg['SAO-1-083'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.color === 'Green' && (c.traits || '').includes('ALO'), `${unit.card.name}: เลือกการ์ดจาก Outside Area`); } };

  // 1-085 Kirito — [When Attacking] if this character's BP is 5000 or more, draw 1.
  reg['SAO-1-085'] = { async onAttack(G, p, unit) { if (Engine.bp(unit) >= 5000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 1-096 Buggy (Field) — [Main][Discard 1][1/turn] +2 green generated energy this turn.
  reg['SAO-1-096'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const discarded = await H.manualDiscardToRemoval(p, `${unit.card.name}: [Discard 1]`);
      if (!discarded) return;
      unit._usedTurn = Engine.G.turn;
      unit.tempGen += 2; log(`${unit.card.name}: +2 generated energy เทิร์นนี้`);
    },
  };

  // 1-097 "Ultima Ratio Hecate II" — choose 1 character, +2500 BP and "when attacks and wins, draw
  // 1" this turn. If the chosen is Sinon, also [Sniper] this turn.
  reg['SAO-1-097'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2500; t._grantedOnWinDraw = true;
      let msg = `${card.name}: ${t.card.name} +2500 BP และ "ชนะแล้วจั่ว 1 ใบ" เทิร์นนี้`;
      if ((t.card.name || '').includes('Sinon')) { t.tempSnipe = true; msg += ' และ [Sniper]'; }
      log(msg);
    },
  };

  // 1-099 "Photon Sword" — choose 1 character, +2000 BP. If there is a Kirito on your area, also
  // [Impact +1] this turn.
  reg['SAO-1-099'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      let msg = `${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`;
      if (H.hasCardNamed(p, 'Kirito')) { t.tempImpact = (t.tempImpact || 0) + 1; msg += ' และ [Impact +1]'; }
      log(msg);
    },
  };

  // 1-100 "Mother's Rosario" — choose up to 1 enemy Front Line character with BP 5000 or less and
  // return it to hand (retire instead if 3+ total Yuuki/Mother's Rosario cards in your Outside Area).
  reg['SAO-1-100'] = {
    async onEvent(G, p, card) {
      const n = p.sideline.filter(no => /Yuuki|Mother's Rosario/.test(byNo(no)?.name || '')).length;
      if (n >= 3) await H.retireEnemyFront(p, 5000);
      else await H.bounceEnemyFront(p, 5000);
    },
  };

  // 1-103 Kirito — [On Play] choose up to 1 character and move it to another line.
  reg['SAO-1-103'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy];
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };
})();
