// ══════════ UA SIM — Blue Lock (BLK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. This series' core theme is a
// "face-down card under a character" resource, stored via the shared unit.counters convention
// (same one used for BLC/TSK/KGR's individual face-down cards) — local helpers below cover the
// recurring plant/move/consume-for-bonus actions so each card doesn't reimplement them.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  const hasAnyFaceDown = p => [...p.front, ...p.energy].some(u => u.counters.length);
  const faceDownHolders = p => [...p.front, ...p.energy].filter(u => u.counters.length);
  const noFaceDownTargets = p => [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && !u.counters.length);

  async function plantUnderSelf(p, unit) {
    if (!p.deck.length) return false;
    unit.counters.push(p.deck.shift());
    log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ตัวเอง`);
    return true;
  }

  async function moveFaceDown(p) {
    const holders = faceDownHolders(p);
    if (!holders.length) return false;
    const uidFrom = await p.controller.chooseOwnCharacter(p, holders, 'เลือก character ที่มีการ์ดคว่ำอยู่ใต้');
    const from = holders.find(x => x.uid === uidFrom);
    if (!from) return false;
    const targets = noFaceDownTargets(p).filter(u => u !== from);
    if (!targets.length) return false;
    const uidTo = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ปลายทาง (ไม่มีการ์ดคว่ำ)');
    const to = targets.find(x => x.uid === uidTo);
    if (!to) return false;
    to.counters.push(from.counters.shift());
    log(`ย้ายการ์ดคว่ำจาก ${from.card.name} ไป ${to.card.name}`);
    return true;
  }

  // ── BLK-1 ──────────────────────────────────────────────────────────────

  // 003 Isagi Yoichi — [On Play] choose: move a face-down card onto this character then look at
  // top 5 for a [Raid] card to hand, or (if no face-down cards exist anywhere) plant one under self.
  reg['BLK-1-003'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (faceDownHolders(p).filter(u => u !== unit).length) opts.push({ label: 'ย้ายการ์ดคว่ำมาไว้ใต้ตัวเอง แล้วดูการ์ดบนสุด 5 ใบ (หา [Raid])', value: 'move' });
      if (!hasAnyFaceDown(p)) opts.push({ label: 'วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง', value: 'plant' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'move') {
        const holders = faceDownHolders(p).filter(u => u !== unit);
        const uid = await p.controller.chooseOwnCharacter(p, holders, 'เลือก character ที่มีการ์ดคว่ำอยู่ใต้');
        const from = holders.find(x => x.uid === uid);
        if (!from) return;
        unit.counters.push(from.counters.shift());
        log(`${unit.card.name}: ย้ายการ์ดคว่ำจาก ${from.card.name} มาไว้ใต้ตัวเอง`);
        await H.lookTopAndTake(p, 5, c => Engine.parseKeywords(c).raidTargets.length > 0, 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      } else await plantUnderSelf(p, unit);
    },
  };

  // 005 Ego Jinpachi — [On Play] if no face-down cards exist anywhere, may plant under another own
  // character. @[Main][1/turn] move a face-down card to another character without one.
  reg['BLK-1-005'] = {
    async onPlay(G, p, unit) {
      if (hasAnyFaceDown(p) || !p.deck.length) return;
      const targets = noFaceDownTargets(p).filter(u => u !== unit);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ให้วางการ์ดคว่ำไว้ใต้ตัว (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (await moveFaceDown(p)) unit._usedTurn = Engine.G.turn;
    },
  };

  // 007 Tsurugi Zantetsu — [Main][Rest][Retire] draw 2, discard 1.
  reg['BLK-1-007'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 009 Tsurugi Zantetsu — [On Play] may discard 1 to set self Active. @[When Attacking] rest 1 enemy Front Line character.
  reg['BLK-1-009'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
    async onAttack(G, p, unit) { await H.restEnemyFront(p); },
  };

  // 013 Nagi Seishiro — [On Play] may discard 1 to rest 1 enemy Front Line character.
  reg['BLK-1-013'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อวางนอน character ศัตรู?`);
      if (discarded) await H.restEnemyFront(p);
    },
  };

  // 014 Nagi Seishiro — [On Play] play 1 yellow Isagi Yoichi/Baro Shoei (energy≤3, AP1) from
  // hand/Outside Area, rested. @[When Attacking] if any own character has a face-down card, may draw 1, discard 1.
  reg['BLK-1-014'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && ((c.name || '').includes('Isagi Yoichi') || (c.name || '').includes('Baro Shoei')) && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const handIdx = p.hand.findIndex(no => pred(byNo(no)));
      if (handIdx >= 0) { await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line: 'energy', active: false }); return; }
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ดจาก Outside Area', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
    async onAttack(G, p, unit) {
      if (!hasAnyFaceDown(p)) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 020 Baro Shoei — [On Play] choose: move a face-down card onto this character then rest 1
  // enemy Front Line character BP≤2500 (it skips its next stand), or (if none exist) plant under self.
  reg['BLK-1-020'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (faceDownHolders(p).filter(u => u !== unit).length) opts.push({ label: 'ย้ายการ์ดคว่ำมาไว้ใต้ตัวเอง แล้ววางนอน character ศัตรู (BP≤2500)', value: 'move' });
      if (!hasAnyFaceDown(p)) opts.push({ label: 'วางการ์ดบนสุดของเด็คคว่ำไว้ใต้ตัวเอง', value: 'plant' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'move') {
        const holders = faceDownHolders(p).filter(u => u !== unit);
        const uid = await p.controller.chooseOwnCharacter(p, holders, 'เลือก character ที่มีการ์ดคว่ำอยู่ใต้');
        const from = holders.find(x => x.uid === uid);
        if (!from) return;
        unit.counters.push(from.counters.shift());
        log(`${unit.card.name}: ย้ายการ์ดคว่ำมาไว้ใต้ตัวเอง`);
        const enemy = Engine.opponentOf(p);
        const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 2500);
        if (!targets.length) return;
        const uid2 = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤2500)`, true);
        const t = targets.find(x => x.uid === uid2);
        if (t) { t.rested = true; t.skipNextStand = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน จะไม่ stand ครั้งถัดไป`); }
      } else await plantUnderSelf(p, unit);
    },
  };

  // 021 Baro Shoei — "[When in Frontline] Characters with a face-down card under them cannot be
  // chosen by your opponent's Event effects used from hand." (Skipped: a live conditional
  // untargetable scoped only to Event-card targeting — the untargetable checks in common.js's enemy
  // helpers are all-or-nothing per unit, not scoped to a specific source type, so applying this
  // would over-grant immunity against character effects too.)

  // 029 (untitled) Event — rest 1 enemy Front Line character, draw 1, discard 1.
  reg['BLK-1-029'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 030 Evil King (Event) — choose: retire 1 enemy Front Line character BP≤4000 (then, if no
  // face-down cards exist anywhere, may plant one under own Baro Shoei), or (if own Baro Shoei)
  // retire 1 enemy Front Line character BP≤5000.
  reg['BLK-1-030'] = {
    async onEvent(G, p, card) {
      const hasBaro = H.hasCardNamed(p, 'Baro Shoei');
      const opts = [{ label: 'Retire character ศัตรู (BP≤4000)', value: 'a' }];
      if (hasBaro) opts.push({ label: 'Retire character ศัตรู (BP≤5000, มี Baro Shoei)', value: 'b' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'b') { await H.retireEnemyFront(p, 5000); return; }
      await H.retireEnemyFront(p, 4000);
      if (hasAnyFaceDown(p) || !p.deck.length) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Baro Shoei') && !u.counters.length);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: วางการ์ดคว่ำไว้ใต้ Baro Shoei? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
  };

  // 032 This Is My Territory (Event) — discard 1; if did, choose 1 own Tsurugi Zantetsu, gains [Snipe] this turn.
  reg['BLK-1-032'] = {
    async onEvent(G, p, card) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p);
      if (!discarded) return;
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Tsurugi Zantetsu'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Tsurugi Zantetsu`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempSnipe = true; log(`${card.name}: ${t.card.name} ได้ [Snipe] เทิร์นนี้`); }
    },
  };

  // 043 Isagi Yoichi — [Main][1/turn] move a face-down card to another character without one.
  reg['BLK-1-043'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (await moveFaceDown(p)) unit._usedTurn = Engine.G.turn;
    },
  };

  // 044 Isagi Yoichi — [On Play] if any face-down card exists, choose up to 1 own Trait:Team Z on
  // Front Line, it gains [Impact +1] this turn.
  reg['BLK-1-044'] = {
    async onPlay(G, p, unit) {
      if (!hasAnyFaceDown(p)) return;
      const targets = p.front.filter(u => (u.card.traits || '').includes('Team Z'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Team Z บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 045 Isagi Yoichi — [When Attacking] may place own face-down card to Outside Area for a draw
  // (2 if 5+ other Trait:Team Z on area).
  reg['BLK-1-045'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อจั่วการ์ด?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Team Z')).length;
      const drawN = n >= 5 ? 2 : 1;
      Engine.draw(p, drawN); log(`${unit.card.name}: จั่ว ${drawN} ใบ`);
    },
  };

  // 047 Gagamaru Gin — [When Attacking] may place own face-down card to Outside Area for +2000 BP this turn.
  reg['BLK-1-047'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อรับ +2000 BP?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 2000;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
    },
  };

  // 050 Kunigami Rensuke — [When Attacking] if 5+ other Trait:Team Z on area, draw 1.
  reg['BLK-1-050'] = {
    async onAttack(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Team Z')).length;
      if (n >= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 051 Kunigami Rensuke — [On Play] if no face-down cards exist anywhere, may plant one under
  // self. @[When Attacking] may place own face-down card to Outside Area to rest 1 enemy Front Line character BP≤3000.
  reg['BLK-1-051'] = {
    async onPlay(G, p, unit) { if (!hasAnyFaceDown(p)) await plantUnderSelf(p, unit); },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อวางนอน character ศัตรู?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 052 Hyoma Chigiri — [On Play] if no face-down cards exist anywhere, may plant one under self.
  // @[When Attacking] may place own face-down card to Outside Area for draw 1, discard 1.
  reg['BLK-1-052'] = {
    async onPlay(G, p, unit) { if (!hasAnyFaceDown(p)) await plantUnderSelf(p, unit); },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อจั่วการ์ด?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 053 Hyoma Chigiri — [On Play] look at top 2, split any number to top and the rest to bottom, in any order.
  reg['BLK-1-053'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดไว้บนสุด (ที่เหลือไปล่างสุด)`, null, n);
      const top = [], bottom = [];
      revealed.forEach((no, i) => { if (picked.includes(i)) top.push(no); else bottom.push(no); });
      p.deck.push(...bottom);
      p.deck.unshift(...top);
      log(`${unit.card.name}: จัดการ์ดบนสุดของเด็คใหม่`);
    },
  };

  // 054 Hyoma Chigiri — [On Play][once ever] if own Isagi/Nagi/Baro, may discard 1 to untap up to 2 AP.
  // @[Main][Frontline][1/turn] if no face-down cards exist anywhere, plant one under a character.
  reg['BLK-1-054'] = {
    async onPlay(G, p, unit) {
      if (unit._usedEver) return;
      if (!H.hasCardNamed(p, 'Isagi Yoichi') || !H.hasCardNamed(p, 'Seishiro Nagi') || !H.hasCardNamed(p, 'Shoei Baro')) return;
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้งการ์ด 1 ใบเพื่อ Active AP สูงสุด 2 ใบ?`);
      if (!discarded) return;
      unit._usedEver = true;
      await H.apUntap(p, 2);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (hasAnyFaceDown(p) || !p.deck.length) { p.controller.notify?.('มีการ์ดคว่ำอยู่แล้ว หรือเด็คหมด'); return; }
      const targets = noFaceDownTargets(p);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้วางการ์ดคว่ำไว้ใต้ตัว');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
  };

  // 055 Hyoma Chigiri — [Main][Discard1][1/turn] if this character has a face-down card, set self
  // Active. @[When Attacking] may place own face-down card to Outside Area for +2000 BP (and draw
  // 1 if 5+ other Trait:Team Z).
  reg['BLK-1-055'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!unit.counters.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำใต้การ์ดนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.rested = false;
      log(`${unit.card.name}: Active ตัวเอง`);
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อรับ +2000 BP?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 2000;
      log(`${unit.card.name}: +2000 BP เทิร์นนี้`);
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Team Z')).length;
      if (n >= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 061 Blue Lock (Field) — [1/turn] when one of your characters attacks and wins, draw 1.
  reg['BLK-1-061'] = {
    async onAnyWinBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 063 Goal's Formula (Event) — choose 1 own blue Front Line character +2000 BP; if it has a
  // face-down card, it also gains [Impact +1] this turn.
  reg['BLK-1-063'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.color === 'Blue' && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character สีน้ำเงินบน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if (t.counters.length) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 065 Direct Shot (Event) — bounce 1 enemy Front Line character BP≤5000 (retire instead if own Isagi Yoichi).
  reg['BLK-1-065'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Isagi Yoichi')) await H.retireEnemyFront(p, 5000);
      else await H.bounceEnemyFront(p, 5000);
    },
  };

  // 067 I'm The Next 9 Tactic (Event) — move/swap any number of own characters between lines (a
  // simplified bounded loop, up to 4 iterations), untap 1 AP.
  reg['BLK-1-067'] = {
    async onEvent(G, p, card) {
      for (let i = 0; i < 4; i++) {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (!targets.length) break;
        const v = await p.controller.chooseOption(p, `${card.name}: ย้าย/สลับ character เพิ่มอีกหรือไม่? (${i + 1})`,
          [{ label: 'ย้าย/สลับ', value: true }, { label: 'จบ', value: false }]);
        if (!v) break;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
        const t = targets.find(x => x.uid === uid);
        if (!t) break;
        const toLine = p.front.includes(t) ? 'energy' : 'front';
        let removeUid = null;
        const dest = toLine === 'front' ? p.front : p.energy;
        if (dest.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, dest, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
        await Engine.moveUnitFree(p, t, toLine, removeUid);
      }
      await H.apUntap(p, 1);
    },
  };

  // 072 Itoshi Rin — passive genMod +1 if this character has a face-down card and only red cards are on your area.
  reg['BLK-1-072'] = {
    genMod(unit, p) {
      const owner = p || Engine.G.players.find(pl => pl.front.includes(unit) || pl.energy.includes(unit));
      if (!owner || !unit.counters.length) return 0;
      return [...owner.front, ...owner.energy].every(u => u.card.color === 'Red') ? 1 : 0;
    },
  };

  // 076 Ego Jinpachi — [Main][Rest][Retire] fetch 1 red character card (energy≤2) from Outside Area to hand.
  reg['BLK-1-076'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 2;
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีเป้าหมายใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก character สีแดงจาก Outside Area`);
    },
  };

  // 078 Rensuke Kunigami — [Main][Pay1AP][1/turn] draw 1, choose up to 1 own character +500 BP this turn.
  reg['BLK-1-078'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.buffOwnCharacter(p, 500);
    },
  };

  // 082 Chigiri Hyoma — [On Play] play 1 red character card (energy≤2, AP1) from hand, rested.
  reg['BLK-1-082'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Red' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 093 Mikage Reo — [Main][Frontline][1/turn] choose: all other own characters +500 BP this turn,
  // or 1 other own character +1500 BP this turn.
  reg['BLK-1-093'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่นทั้งหมด +500 BP เทิร์นนี้', value: 'mass' },
        { label: 'เลือก character อื่น 1 ใบ +1500 BP เทิร์นนี้', value: 'single' },
      ]);
      if (v === 'mass') {
        let n = 0;
        for (const u of [...p.front, ...p.energy]) if (u !== unit && u.card.type === 'Character') { u.bpMod += 500; n++; }
        log(`${unit.card.name}: character อื่น ${n} ใบ +500 BP เทิร์นนี้`);
      } else await H.buffOwnCharacter(p, 1500, { excludeUnit: unit });
    },
  };

  // 094 Battlefield (Field) — [On Play] if no face-down cards exist anywhere, may plant one under
  // a character. @[Main][Rest][1/turn] may place a face-down card (from any holder) to Outside
  // Area for draw 1, discard 1.
  reg['BLK-1-094'] = {
    async onPlay(G, p, unit) {
      if (hasAnyFaceDown(p) || !p.deck.length) return;
      const targets = noFaceDownTargets(p);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางการ์ดคว่ำไว้ใต้ character? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const holders = faceDownHolders(p);
      if (!holders.length) { p.controller.notify?.('ไม่มีการ์ดคว่ำ'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำ 1 ใบไป Outside Area?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, holders, 'เลือก character ที่มีการ์ดคว่ำอยู่ใต้');
      const t = holders.find(x => x.uid === uid);
      if (!t) return;
      p.sideline.push(t.counters.shift());
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 095 Try Section (Field) — [Your Turn] your red Kunigami/Chigiri/Mikage gain "[When Attacking]
  // may place a face-down card to Outside Area to rest 1 enemy Front Line character with the same
  // BP" this turn (implemented via this Field's own onAnyAttack hook, checked live). @[Main][1/turn]
  // if no face-down cards exist anywhere, plant one under a character.
  reg['BLK-1-095'] = {
    async onAnyAttack(G, p, atk, self) {
      if (Engine.G.players[Engine.G.active] !== p) return;
      if (atk.card.color !== 'Red' || !((atk.card.name || '').includes('Kunigami Rensuke') || (atk.card.name || '').includes('Chigiri Hyoma') || (atk.card.name || '').includes('Mikage Reo'))) return;
      if (!atk.counters.length) return;
      const v = await p.controller.chooseOption(p, `${atk.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อวางนอน character ศัตรู BP เท่ากัน?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(atk.counters.shift());
      const enemy = Engine.opponentOf(p);
      const bpVal = Engine.bp(atk);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) === bpVal);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${self.card.name}: เลือก character ศัตรู (BP=${bpVal})`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${self.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (hasAnyFaceDown(p) || !p.deck.length) { p.controller.notify?.('มีการ์ดคว่ำอยู่แล้ว หรือเด็คหมด'); return; }
      const targets = noFaceDownTargets(p);
      if (!targets.length) return;
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้วางการ์ดคว่ำไว้ใต้ตัว', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
  };

  // 096 Stylish Pose (Event) — draw 1 (2 if own Aryu Jube); if no face-down cards exist anywhere, may also plant one.
  reg['BLK-1-096'] = {
    async onEvent(G, p, card) {
      const n = H.hasCardNamed(p, 'Aryu Jube') ? 2 : 1;
      Engine.draw(p, n); log(`${card.name}: จั่ว ${n} ใบ`);
      if (hasAnyFaceDown(p) || !p.deck.length) return;
      const targets = noFaceDownTargets(p);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: วางการ์ดคว่ำไว้ใต้ character? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
  };

  // 099 No-Break Dribble (Event) — retire 1 enemy Front Line character with BP ≤ 1000 × (own
  // Kunigami/Chigiri/Mikage count).
  reg['BLK-1-099'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Kunigami Rensuke') || (u.card.name || '').includes('Chigiri Hyoma') || (u.card.name || '').includes('Mikage Reo')).length;
      await H.retireEnemyFront(p, n * 1000);
    },
  };

  // 103 Isagi Yoichi — [On Play] if no face-down cards exist anywhere, may plant one under self.
  // @[Main][1/turn] move own face-down card to another character without one. @[Main][Pay1AP]
  // re-activate this character's own [On Play] effect.
  reg['BLK-1-103'] = {
    async onPlay(G, p, unit) { if (!hasAnyFaceDown(p)) await plantUnderSelf(p, unit); },
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && unit.counters.length) opts.push({ label: 'ย้ายการ์ดคว่ำใต้ตัวเองไปที่อื่น', value: 'move' });
      if (Engine.activeAP(p) >= 1) opts.push({ label: 'จ่าย 1 AP เพื่อเปิดใช้ [On Play] อีกครั้ง', value: 'replay' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'move') {
        const targets = noFaceDownTargets(p).filter(u => u !== unit);
        if (!targets.length) return;
        unit._usedTurn1 = Engine.G.turn;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ปลายทาง');
        const t = targets.find(x => x.uid === uid);
        if (t) { t.counters.push(unit.counters.shift()); log(`${unit.card.name}: ย้ายการ์ดคว่ำไป ${t.card.name}`); }
      } else if (Engine.payApForEffect(p, 1)) { await Effects.onPlay(G, p, unit); log(`${unit.card.name}: เปิดใช้ [On Play] อีกครั้ง`); }
    },
  };

  // 109 Kickoff (Field) — [On Play] if no face-down cards exist anywhere, may plant one under a
  // character. @[Main][1/turn] move a face-down card. @[Main][Pay1AP] re-activate this Field's own
  // [On Play] effect.
  reg['BLK-1-109'] = {
    async onPlay(G, p, unit) {
      if (hasAnyFaceDown(p) || !p.deck.length) return;
      const targets = noFaceDownTargets(p);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางการ์ดคว่ำไว้ใต้ character? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
    },
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && faceDownHolders(p).length) opts.push({ label: 'ย้ายการ์ดคว่ำไปที่อื่น', value: 'move' });
      if (Engine.activeAP(p) >= 1) opts.push({ label: 'จ่าย 1 AP เพื่อเปิดใช้ [On Play] อีกครั้ง', value: 'replay' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'move') { unit._usedTurn1 = Engine.G.turn; await moveFaceDown(p); }
      else if (Engine.payApForEffect(p, 1)) { await Effects.onPlay(G, p, unit); log(`${unit.card.name}: เปิดใช้ [On Play] อีกครั้ง`); }
    },
  };

  // ── UA03NC-BLK-2 (newer print run) ───────────────────────────────────────

  // 001 Yoichi Isagi — [Main][Frontline][once ever] gated on a face-down card under own Yoichi
  // Isagi/Shoei Baro; choose: gain front-line energy generation until the start of your next turn,
  // or choose 1 face-down-card holder +500 BP until the start of your next turn.
  reg['UA03NC-BLK-2-001'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedEver) { p.controller.notify?.('ใช้ไปแล้ว'); return; }
      const gated = [...p.front, ...p.energy].some(u => ((u.card.name || '').includes('Yoichi Isagi') || (u.card.name || '').includes('Shoei Baro')) && u.counters.length);
      if (!gated) { p.controller.notify?.('ต้องมีการ์ดคว่ำใต้ Yoichi Isagi หรือ Shoei Baro'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ได้ front-line energy generation จนถึงต้นเทิร์นถัดไป', value: 'gen' },
        { label: 'เลือก character ที่มีการ์ดคว่ำ +500 BP จนถึงต้นเทิร์นถัดไป', value: 'buff' },
      ]);
      unit._usedEver = true;
      if (v === 'gen') { unit.frontGenPersist = true; log(`${unit.card.name}: ได้ front-line energy generation จนถึงต้นเทิร์นถัดไป`); }
      else {
        const targets = faceDownHolders(p);
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ที่มีการ์ดคว่ำ', true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpPersist += 500; log(`${unit.card.name}: ${t.card.name} +500 BP จนถึงต้นเทิร์นถัดไป`); }
      }
    },
  };

  // 002 Zantetsu Tsurugi — [When Attacking] may place own face-down card to Outside Area for +1000
  // BP this turn. (Skipped: the reactive "when you place a card via your own effect, stash it
  // face-down under this character" clause — no hook tracks which effect caused a given discard,
  // same source-tracking gap noted for BLC-2-013/KMY-3-066/KMY-3-067.)
  reg['UA03NC-BLK-2-002'] = {
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อรับ +1000 BP?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 004 Reo Mikage — [On Play][When Attacking] look at top 5, fetch 1 Seishiro Nagi/Zantetsu
  // Tsurugi to hand, remainder to bottom. @[Main][1/turn] choose 1 Nagi/Tsurugi +1000 BP this turn.
  function mikage004Look() {
    return async (p, unit) => { await H.lookTopAndTake(p, 5, c => (c.name || '').includes('Seishiro Nagi') || (c.name || '').includes('Zantetsu Tsurugi'), 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`); };
  }
  reg['UA03NC-BLK-2-004'] = {
    async onPlay(G, p, unit) { await mikage004Look()(p, unit); },
    async onAttack(G, p, unit) { await mikage004Look()(p, unit); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Seishiro Nagi') || (u.card.name || '').includes('Zantetsu Tsurugi'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Nagi หรือ Tsurugi รับ +1000 BP เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 005 Seishiro Nagi — [On Play] if no other character has a face-down card, may plant one under
  // self. @[When Attacking] may place own face-down card to Outside Area for +1000 BP this turn.
  // (Skipped: the granted "unblocked attack draws a card" clause — no blocked/unblocked detection hook.)
  reg['UA03NC-BLK-2-005'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit);
      if (others.some(u => u.counters.length) || !p.deck.length) return;
      unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ตัวเอง`);
    },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อรับ +1000 BP?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 006 Yoichi Isagi — [Main][Frontline][1/turn] choose 1 own character with a printed [When
  // Attacking] effect on Energy Line, swap positions with this character; then, if no face-down
  // cards exist anywhere, may plant one under the chosen character. @[Main][1/turn] move a
  // face-down card to another character without one.
  reg['UA03NC-BLK-2-006'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && p.front.includes(unit)) opts.push({ label: 'สลับตำแหน่งกับ character ที่มี [When Attacking] บน Energy Line', value: 'swap' });
      if (unit._usedTurn2 !== Engine.G.turn && faceDownHolders(p).length) opts.push({ label: 'ย้ายการ์ดคว่ำไปที่อื่น', value: 'move' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'swap') {
        const targets = p.energy.filter(u => u.card.type === 'Character' && (u.card.effect || '').includes('[When Attacking]'));
        if (!targets.length) return;
        unit._usedTurn1 = Engine.G.turn;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Energy Line');
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        const iF = p.front.indexOf(unit), iE = p.energy.indexOf(t);
        p.front[iF] = t; p.energy[iE] = unit;
        log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
        if (!hasAnyFaceDown(p) && p.deck.length) { t.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดคว่ำไว้ใต้ ${t.card.name}`); }
      } else { unit._usedTurn2 = Engine.G.turn; await moveFaceDown(p); }
    },
  };

  // 007 Meguru Bachira — [On Play] if this card was played by your character/Event effect, draw 1.
  // @[When Attacking] may place own face-down card to Outside Area for draw 1, self -1000 BP this turn.
  reg['UA03NC-BLK-2-007'] = {
    async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
    async onAttack(G, p, unit) {
      if (!unit.counters.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางการ์ดคว่ำใต้การ์ดนี้ไป Outside Area เพื่อจั่วการ์ด?`,
        [{ label: 'วาง', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      p.sideline.push(unit.counters.shift());
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.bpMod -= 1000; log(`${unit.card.name}: -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 009 Rensuke Kunigami — [Main][Frontline][Pay1AP][1/turn] gated on own Hyoma Chigiri and Reo
  // Mikage on the same line; draw 1, choose up to 1 own character +1500 BP this turn.
  reg['UA03NC-BLK-2-009'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const line = p.front.includes(unit) ? p.front : p.energy;
      if (!line.some(u => (u.card.name || '').includes('Hyoma Chigiri')) || !line.some(u => (u.card.name || '').includes('Reo Mikage'))) { p.controller.notify?.('ต้องมี Hyoma Chigiri และ Reo Mikage อยู่ line เดียวกัน'); return; }
      if (!Engine.payApForEffect(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.buffOwnCharacter(p, 1500);
    },
  };

  // 010 Hyoma Chigiri — [On Play] look at top 5, play up to 1 red character/Field card (energy≤2,
  // AP1) among them, rested, remainder to bottom; if own Rensuke Kunigami and Reo Mikage are on the
  // same line as this character, set self Active.
  reg['UA03NC-BLK-2-010'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(5, p.deck.length);
      if (n) {
        const revealed = p.deck.splice(0, n);
        const pred = c => c && (c.type === 'Character' || c.type === 'Field') && c.color === 'Red' && (c.need || 0) <= 2 && (c.ap || 0) === 1;
        const idx = revealed.findIndex(no => pred(byNo(no)));
        if (idx >= 0) {
          const no = revealed.splice(idx, 1)[0];
          p.hand.push(no);
          await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false });
        }
        p.deck.push(...revealed);
      }
      const line = p.front.includes(unit) ? p.front : p.energy;
      if (line.some(u => (u.card.name || '').includes('Rensuke Kunigami')) && line.some(u => (u.card.name || '').includes('Reo Mikage'))) {
        unit.rested = false;
        log(`${unit.card.name}: Active ตัวเอง`);
      }
    },
  };

  // 011 Reo Mikage — [Main][Frontline][1/turn] +500 BP this turn (+1000 if own Rensuke Kunigami or
  // Hyoma Chigiri on the same line; +1500 if both).
  reg['UA03NC-BLK-2-011'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const line = p.front.includes(unit) ? p.front : p.energy;
      const hasKuni = line.some(u => (u.card.name || '').includes('Rensuke Kunigami'));
      const hasChigiri = line.some(u => (u.card.name || '').includes('Hyoma Chigiri'));
      let amount = 500;
      if (hasKuni && hasChigiri) amount = 1500; else if (hasKuni || hasChigiri) amount = 1000;
      unit.bpMod += amount;
      log(`${unit.card.name}: +${amount} BP เทิร์นนี้`);
    },
  };
})();
