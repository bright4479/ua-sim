// ══════════ UA SIM — Evangelion (EVA) card-specific effect scripts ══════════
// Generic series-agnostic patterns (draw+discard, AP untap, BP buff/debuff on
// play, cost reductions, etc.) live in js/effects/common.js and already cover
// a good chunk of this set automatically — see the coverage notes at the
// bottom of this file. Everything below is EVA-specific logic that needed a
// bespoke script.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // ---------- shared factories ----------

  // "[Main] [Rest this card] [1 Per Turn] This character gets +1 generated energy
  //  and 'At the end of your Main Phase, retire this character.' during this turn."
  // Printed identically on several 0-cost Rei/Kaworu generators.
  function selfGenRetireOnMain() {
    return {
      async onMain(G, p, unit) {
        if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่ ใช้ ability ไม่ได้'); return; }
        unit.rested = true; // cost: switch to resting
        unit.tempGen += 1;
        unit.retireAtEndOfMain = true;
        log(`${unit.card.name}: +1 energy generation เทิร์นนี้ (จะ retire เมื่อจบ Main Phase)`);
      },
    };
  }
  reg['UA44BT-EVA-1-001'] = selfGenRetireOnMain();
  reg['UA44BT-EVA-1-037'] = selfGenRetireOnMain();
  reg['UA44BT-EVA-1-069'] = selfGenRetireOnMain();

  // 005 — Rei Ayanami: when this leaves the field for any reason, may discard 1 to
  // replay a cheap yellow <Rei Ayanami> from the Outside Area, active.
  reg['UA44BT-EVA-1-005'] = {
    async onLeaveField(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'จะทิ้ง 1 ใบเพื่อเรียก Rei Ayanami กลับไหม? (ไม่บังคับ)');
      if (!discarded) return;
      const pred = c => c && c.color === 'Yellow' && (c.name || '').includes('Rei Ayanami') && (c.need || 0) <= 2;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Rei Ayanami (Energy 2 หรือน้อยกว่า) กลับสนาม (Active)', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 006 Misato — [Main][Rest this card][Retire this card] choose 1 yellow character, set active.
  reg['UA44BT-EVA-1-006'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active จึงใช้ ability นี้ได้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.card.color === 'Yellow');
      if (!targets.length) { p.controller.notify?.('ไม่มี yellow character บนสนาม'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก yellow character ให้ Active');
      const t = targets.find(x => x.uid === uid);
      await Engine.sidelineUnit(p, unit, 'effect'); // cost: retire this card
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} กลับมา Active`); }
    },
  };

  // 010 — [On Play] choose up to 1 own character, grant [Impact 1] this turn.
  reg['UA44BT-EVA-1-010'] = {
    async onPlay(G, p, unit) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, 'เลือก character รับ [Impact 1] เทิร์นนี้', true);
      const t = units.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact 1] เทิร์นนี้`); }
    },
  };

  // 012 — [On Play] you may retire 1 other character; if you did, choose Draw 2 / (Draw 1 + stand 1).
  reg['UA44BT-EVA-1-012'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      let retired = false;
      if (others.length) {
        const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character อื่นเพื่อ retire (ไม่บังคับ)', true);
        const t = others.find(x => x.uid === uid);
        if (t) { await Engine.sidelineUnit(p, t, 'effect'); retired = true; }
      }
      if (!retired) return;
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 2 ใบ', value: 'draw2' },
        { label: 'จั่ว 1 ใบ + Active character 1 ใบ', value: 'draw1stand' },
      ]);
      if (opt === 'draw2') { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
      else if (opt === 'draw1stand') {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (units.length) {
          const uid2 = await p.controller.chooseOwnCharacter(p, units, 'เลือก character ให้ Active', true);
          const u2 = units.find(x => x.uid === uid2);
          if (u2) { u2.rested = false; log(`${unit.card.name}: ${u2.card.name} เป็น Active`); }
        }
      }
    },
  };

  // 013 — [On Play] set active + choose (rest enemy front) or (retire own char -> retire enemy
  // <=5000 BP + discount next cheap Yellow character); [Main][Discard 2] +1000 BP & Impact(1).
  reg['UA44BT-EVA-1-013'] = {
    async onPlay(G, p, unit) {
      unit.rested = false;
      const opt = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: `วางนอน character ศัตรูบน Front Line 1 ใบ`, value: 'rest' },
        { label: `Retire character ของตัวเอง 1 ใบ เพื่อ retire ศัตรู BP≤5000 + ลด AP การ์ด Yellow ใบถัดไป`, value: 'retire' },
      ]);
      if (opt === 'rest') {
        await H.restEnemyFront(p);
      } else if (opt === 'retire') {
        const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
        if (!others.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character ของตัวเองเพื่อ retire', true);
        const t = others.find(x => x.uid === uid);
        if (!t) return;
        await Engine.sidelineUnit(p, t, 'effect');
        await H.retireEnemyFront(p, 5000);
        p.pendingDiscount = {
          predicate: c => c.color === 'Yellow' && c.type === 'Character' && (c.need || 0) <= 2,
          apDelta: -1,
        };
        log(`${unit.card.name}: การ์ด Yellow (Energy≤2) ใบถัดไปลด AP 1`);
      }
    },
    async onMain(G, p, unit) {
      const picked = await p.controller.chooseCardsFromHand(p, 2, '[Discard 2] เพื่อให้ +1000 BP และ [Impact 1] เทิร์นนี้');
      if (picked.length < 2) { p.controller.notify?.('ต้องทิ้ง 2 ใบ'); return; }
      picked.sort((a, b) => b - a).forEach(i => { p.removal.push(p.hand.splice(i, 1)[0]); });
      unit.bpMod += 1000;
      unit.tempImpact += 1;
      log(`${unit.card.name}: +1000 BP และ [Impact 1] เทิร์นนี้ (ทิ้ง 2 ใบ)`);
    },
  };

  // 017 — [On Play] look 4, fetch up to 1 character with [Get] trigger, discard 1 if you did.
  reg['UA44BT-EVA-1-017'] = {
    async onPlay(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 4, c => c.type === 'Character' && c.trigger === 'Get', 1,
        `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 019 (Field) — [On Play] optional discard -> fetch yellow character need<=3 from Outside Area.
  reg['UA44BT-EVA-1-019'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อดึงการ์ด Yellow (Energy≤3) จาก Outside Area? (ไม่บังคับ)');
      if (!discarded) return;
      await H.fetchFromSideline(p, c => c && c.color === 'Yellow' && c.type === 'Character' && (c.need || 0) <= 3,
        'เลือก Character สี Yellow (Energy 3 หรือน้อยกว่า)');
    },
  };

  // 020 Event "Are You Stupid?" — retire enemy BP<=3000 (or <=5000 if own Asuka on board)
  reg['UA44BT-EVA-1-020'] = {
    async onEvent(G, p, card) {
      const limit = H.hasCardNamed(p, 'Asuka Langley Shikinami') ? 5000 : 3000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 021 Event — stand 1 own character; if it's a Rei Ayanami, also stand 1 AP; if a non-yellow
  // Shinji Ikari is on your area, draw 1.
  reg['UA44BT-EVA-1-021'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, 'เลือก character ให้ Active');
      const u = units.find(x => x.uid === uid);
      if (!u) return;
      u.rested = false;
      log(`${card.name}: ${u.card.name} เป็น Active`);
      if ((u.card.name || '').includes('Rei Ayanami')) await H.apUntap(p, 1);
      if ([...p.front, ...p.energy].some(x => (x.card.name || '').includes('Shinji Ikari') && x.card.color !== 'Yellow')) {
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 022 Event — rest 1 enemy front character; draw 1 if it doesn't have Raid.
  reg['UA44BT-EVA-1-022'] = {
    async onEvent(G, p, card) {
      const u = await H.restEnemyFront(p);
      if (u && !u.kw.raidTargets.length) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 028 — [Main][Rest this card] place top card of deck to Outside Area.
  reg['UA44BT-EVA-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      if (p.deck.length) { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
    },
  };

  // 030 — [Main][When in Energy Line] move this character to the Front Line.
  reg['UA44BT-EVA-1-030'] = {
    async onMain(G, p, unit) {
      if (!p.energy.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Energy Line'); return; }
      if (p.front.length >= 4) { p.controller.notify?.('Front Line เต็ม'); return; }
      await Engine.moveUnitFree(p, unit, 'front');
    },
  };

  // 031 — dynamic: +1000 BP if another card with required energy >= 5 is on your area.
  reg['UA44BT-EVA-1-031'] = {
    bpBonus(p, unit) {
      const has5 = [...p.front, ...p.energy].some(u => u !== unit && (u.card.need || 0) >= 5);
      return has5 ? 1000 : 0;
    },
  };

  // 032 — [On Play] play up to 1 purple <Rei Ayanami (Tentative Name)>/<Kaworu Nagisa>/Field
  // (need<=2) from hand or Outside Area to your area rested; discard 1 if it came from Outside.
  reg['UA44BT-EVA-1-032'] = {
    async onPlay(G, p, unit) {
      const matches = c => c && c.color === 'Purple' && (c.need || 0) <= 2 &&
        ((c.name || '').includes('Rei Ayanami (Tentative Name)') || (c.name || '').includes('Kaworu Nagisa') || c.type === 'Field');
      const handIdx = p.hand.findIndex(no => matches(byNo(no)));
      if (handIdx >= 0) {
        const opts = [{ label: `ลง ${byNo(p.hand[handIdx]).name} จากมือ`, value: 'hand' }, { label: 'ข้าม', value: null }];
        const sidelineHas = p.sideline.some(no => matches(byNo(no)));
        if (sidelineHas) opts.splice(1, 0, { label: 'ลงจาก Outside Area แทน', value: 'sideline' });
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือกแหล่งการ์ด`, opts);
        if (v === 'hand') { await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line: 'energy', active: false }); return; }
        if (v !== 'sideline') return;
      }
      const idx = await p.controller.chooseCardFromSideline(p, `เลือกการ์ด Purple (Rei Tentative/Kaworu/Field, Energy≤2) จาก Outside Area`, matches);
      if (idx == null) return;
      const no = p.sideline[idx];
      const played = await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false });
      if (played) await H.discardFromHand(p);
    },
  };

  // 038 — [On Play] look 4, fetch up to 1 <Shinji Ikari>/<Evangelion Unit-13>/<Lilith>, discard 1 if you did.
  reg['UA44BT-EVA-1-038'] = {
    async onPlay(G, p, unit) {
      const pred = c => ['Shinji Ikari', 'Evangelion Unit-13', 'Lilith'].some(n => (c.name || '').includes(n));
      const taken = await H.lookTopAndTake(p, 4, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 039 Kaworu — [Main][Rest this card] choose up to 1 other character, +500 BP this turn.
  reg['UA44BT-EVA-1-039'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
      log(`${unit.card.name}: (ability ที่สอง [When in Energy Line] ยังไม่รองรับอัตโนมัติ — เล่นแบบ manual)`);
    },
  };

  // 041 — Raid <Asuka Langley Shikinami> (auto via keyword). On-play debuff already covered
  // generically. No script needed beyond the keyword parser.

  // 045 — [Main][Retire this card] choose 1 purple character with need>=5, grant [Impact 1] or [Damage 2] this turn.
  reg['UA44BT-EVA-1-045'] = {
    async onMain(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.color === 'Purple' && (u.card.need || 0) >= 5);
      if (!targets.length) { p.controller.notify?.('ไม่มี purple character (Energy≥5)'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ [Impact 1] หรือ [Damage 2]');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${t.card.name}: เลือก`, [
        { label: '[Impact 1]', value: 'impact' }, { label: '[Damage 2]', value: 'damage' },
      ]);
      await Engine.sidelineUnit(p, unit, 'effect'); // cost: retire this card
      if (v === 'impact') { t.tempImpact += 1; log(`${t.card.name}: ได้ [Impact 1] เทิร์นนี้`); }
      else { t.tempDmg = 2; log(`${t.card.name}: ได้ [Damage 2] เทิร์นนี้`); }
    },
  };

  // 050 — [Main][When in Frontline][1 Per Turn] discard 1 <Trait: WILLE> -> enemy front -1000 BP.
  reg['UA44BT-EVA-1-050'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedThisTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('WILLE'));
      if (idx < 0) { p.controller.notify?.('ไม่มีการ์ด Trait: WILLE ในมือ'); return; }
      p.sideline.push(p.hand.splice(idx, 1)[0]);
      unit._usedThisTurn = Engine.G.turn;
      await H.debuffEnemyFront(p, -1000);
    },
  };

  // 052 — [Main][Rest this card][Retire this card] fetch <Shinji Ikari> or Trait:WILLE from Outside Area to hand.
  reg['UA44BT-EVA-1-052'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && ((c.name || '').includes('Shinji Ikari') || (c.traits || '').includes('WILLE'));
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Shinji Ikari หรือการ์ด Trait:WILLE จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const no = p.sideline[idx]; p.sideline.splice(idx, 1); p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 055 — [On Play] look 3, fetch up to 1 Trait:WILLE card, discard 1 if you did.
  reg['UA44BT-EVA-1-055'] = {
    async onPlay(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('WILLE'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 057 — [When Attacking] optional discard -> play purple <Shinji Ikari> need<=3 ap1 from Outside Area, rested.
  reg['UA44BT-EVA-1-057'] = {
    async onAttack(G, p, unit) {
      const pred = c => c && c.color === 'Purple' && (c.name || '').includes('Shinji Ikari') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อเรียก Shinji Ikari จาก Outside Area? (ไม่บังคับ)`);
      if (!discarded) return;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Shinji Ikari (Purple, Energy≤3, AP1)', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 058 Lilith (Field) — place 2 deck cards as counters; retire self once empty (manual check via
  // onMain); on leaving, fetch a Character and optionally untap 1 AP.
  reg['UA44BT-EVA-1-058'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      unit.counters.push(...p.deck.splice(0, n));
      log(`${unit.card.name}: วางการ์ดคว่ำ ${n} ใบใต้ Field นี้`);
    },
    async onMain(G, p, unit) {
      if (unit.counters.length) { p.controller.notify?.('ยังมีการ์ดคว่ำใต้ Field นี้อยู่'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${unit.card.name}: เลือก Character จาก Outside Area เข้ามือ`);
      if (Engine.G.players[Engine.G.active] === p) {
        const yes = await p.controller.chooseOption(p, `${unit.card.name}: ตั้ง AP กลับมา Active 1 ใบไหม?`,
          [{ label: 'ตั้ง AP', value: true }, { label: 'ไม่', value: false }]);
        if (yes) await H.apUntap(p, 1);
      }
    },
  };

  // 060 Event — may rest 1 active own Front Line character -> draw 3.
  reg['UA44BT-EVA-1-060'] = {
    async onEvent(G, p, card) {
      const units = p.front.filter(u => !u.rested && u.card.type === 'Character');
      if (units.length) {
        const uid = await p.controller.chooseOwnCharacter(p, units, 'วางนอน character บน Front Line เพื่อจั่ว 3 ใบ? (ไม่บังคับ)', true);
        const u = units.find(x => x.uid === uid);
        if (u) { u.rested = true; Engine.draw(p, 3); log(`${card.name}: วางนอน ${u.card.name} แล้วจั่ว 3 ใบ`); return; }
      }
      log(`${card.name}: ไม่มีเป้าหมาย/เลือกไม่วางนอน`);
    },
  };

  // 062 Event — play purple <Shinji Ikari> from Outside Area to your area rested.
  reg['UA44BT-EVA-1-062'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.color === 'Purple' && (c.name || '').includes('Shinji Ikari');
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Shinji Ikari (Purple) จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 063 Event Spear of Gaius — retire enemy BP<=3000 (or <=5000 with Shinji/Unit-01 on board), draw 1, discard 1.
  reg['UA44BT-EVA-1-063'] = {
    async onEvent(G, p, card) {
      const has = H.hasCardNamed(p, 'Shinji Ikari') || H.hasCardNamed(p, 'Evangelion Unit-01 (Spear of Gaius)');
      await H.retireEnemyFront(p, has ? 5000 : 3000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 065 Event Spear of Longinus — AP cost -1 if Shinji Ikari/Unit-13 on board; retire enemy BP<=5000.
  reg['UA44BT-EVA-1-065'] = {
    costMod(p, card) {
      const has = H.hasCardNamed(p, 'Shinji Ikari') || H.hasCardNamed(p, 'Evangelion Unit-13');
      return { apDelta: has ? -1 : 0 };
    },
    async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); },
  };

  // 066 Event — enemy front -1000 BP this turn; untap 1 AP.
  reg['UA44BT-EVA-1-066'] = {
    async onEvent(G, p, card) { await H.debuffEnemyFront(p, -1000); await H.apUntap(p, 1); },
  };

  // 072 — [Main][Rest this card] draw 1, discard 1 from hand.
  reg['UA44BT-EVA-1-072'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 075 — [On Play] choose 1 own character on a different line, swap positions with this character.
  reg['UA44BT-EVA-1-075'] = {
    async onPlay(G, p, unit) {
      const otherLine = p.front.includes(unit) ? p.energy : p.front;
      const targets = otherLine.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'สลับตำแหน่งกับ character นี้? (ไม่บังคับ)', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const myLine = p.front.includes(unit) ? p.front : p.energy;
      const iMe = myLine.indexOf(unit), iT = otherLine.indexOf(t);
      myLine[iMe] = t; otherLine[iT] = unit;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
  };

  // 077 — Raid <Mari Makinami Illustrious> (auto). On-play conditional draw; on-retire rest 1 enemy.
  reg['UA44BT-EVA-1-077'] = {
    async onPlay(G, p, unit) {
      if (H.countNoTrigger(p) >= 4) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ (การ์ดไม่มี Trigger ≥4 ใบ)`); }
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.restEnemyFront(p);
    },
  };

  // 078 — [On Play] may retire own <Asuka Langley Shikinami>; if you did, set active + draw 1.
  reg['UA44BT-EVA-1-078'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes('Asuka Langley Shikinami'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'Retire Asuka Langley Shikinami เพื่อ Active ตัวเองและจั่ว 1 ใบ? (ไม่บังคับ)', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      unit.rested = false;
      Engine.draw(p, 1);
      log(`${unit.card.name}: retire ${t.card.name} แล้ว Active ตัวเอง + จั่ว 1 ใบ`);
    },
  };

  // 085 — [On Play] choose: (a) up to 1 other character +1000 BP, or (b) move 1 own character to another line.
  reg['UA44BT-EVA-1-085'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น +1000 BP เทิร์นนี้', value: 'buff' },
        { label: 'ย้าย character ไปอีก line', value: 'move' },
      ]);
      if (v === 'buff') { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); return; }
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, 'เลือก character ที่จะย้าย line');
      const t = units.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 088 — [On Play] look at top card; if it has no Trigger, may reveal & add to hand.
  reg['UA44BT-EVA-1-088'] = {
    async onPlay(G, p, unit) {
      if (!p.deck.length) return;
      const no = p.deck[0];
      const c = byNo(no);
      if (c.trigger) { log(`${unit.card.name}: การ์ดบนสุดมี Trigger — เก็บไว้บนเด็ค`); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุดคือ ${c.name} (ไม่มี Trigger)`,
        [{ label: 'เก็บเข้ามือ', value: true }, { label: 'วางไว้บนเด็คเหมือนเดิม', value: false }],
        !p.controller.isBot ? `<div style="text-align:center">${UAData.imgTag(c, 'thumb')}</div>` : '');
      if (v) { p.hand.push(p.deck.shift()); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); }
    },
  };

  // 090 — [On Play] look at top 2, may place up to 1 without Trigger to Outside Area, rest back on top.
  reg['UA44BT-EVA-1-090'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ (เลือกส่ง Outside Area ได้ 1 ใบ ต้องไม่มี Trigger)`,
        c => !c.trigger, 1);
      picked.sort((a, b) => b - a).forEach(i => { p.sideline.push(revealed.splice(i, 1)[0]); log(`${unit.card.name}: ส่ง ${byNo(p.sideline[p.sideline.length - 1])?.name} ไป Outside Area`); });
      p.deck.unshift(...revealed);
    },
  };

  // 091 — [On Play] look 3, fetch up to 1 "Unit-02"-named or no-Trigger character; discard 1 if you did.
  reg['UA44BT-EVA-1-091'] = {
    async onPlay(G, p, unit) {
      const pred = c => c.type === 'Character' && ((c.name || '').includes('Unit-02') || !c.trigger);
      const taken = await H.lookTopAndTake(p, 3, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 093 Field Operation Room — [On Play] look 5 fetch "Unit-00"/"Unit-01"-named; [Main][1/turn] stand 1 Energy Line card.
  reg['UA44BT-EVA-1-093'] = {
    async onPlay(G, p, unit) {
      const pred = c => (c.name || '').includes('Unit-00') || (c.name || '').includes('Unit-01');
      await H.lookTopAndTake(p, 5, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.energy.filter(u => u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มีการ์ดที่นอนอยู่บน Energy Line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือกการ์ดบน Energy Line ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; unit._usedTurn = Engine.G.turn; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 095 Event — retire enemy BP<=3000 (or <=5000 with Shinji/Unit-01 on board).
  reg['UA44BT-EVA-1-095'] = {
    async onEvent(G, p, card) {
      const has = H.hasCardNamed(p, 'Shinji Ikari') || [...p.front, ...p.energy].some(u => (u.card.name || '').includes('Unit-01'));
      await H.retireEnemyFront(p, has ? 5000 : 3000);
    },
  };

  // 098 Event — retire enemy BP<=2000, +1000 threshold per no-Trigger card on your area.
  reg['UA44BT-EVA-1-098'] = {
    async onEvent(G, p, card) {
      const limit = 2000 + H.countNoTrigger(p) * 1000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 099 Event — draw 2; if 4+ no-Trigger cards on your area, draw 1 more.
  reg['UA44BT-EVA-1-099'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      if (H.countNoTrigger(p) >= 4) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่มอีก 1 ใบ (การ์ดไม่มี Trigger ≥4 ใบ)`); }
    },
  };

  // 105 (ST) — Double Block keyword auto. [On Retire] draw 2, optional discard -> fetch Red Rei need<=1 rested.
  reg['UA44ST-EVA-1-105'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อเรียก Rei Ayanami (Red, Energy≤1) จาก Outside Area? (ไม่บังคับ)');
      if (!discarded) return;
      const pred = c => c && c.color === 'Red' && (c.name || '').includes('Rei Ayanami') && (c.need || 0) <= 1;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Rei Ayanami (Red, Energy≤1)', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 106 (ST) — Impact Negate auto. Dynamic: gains [Impact 1] if 4+ no-Trigger cards on your area.
  reg['UA44ST-EVA-1-106'] = {
    impactBonus(p, unit) { return H.countNoTrigger(p) >= 4 ? 1 : 0; },
  };

  // 108 (ST, Field) — [On Play] optional discard -> draw 2. [Main][Rest+Retire this card] draw 1.
  reg['UA44ST-EVA-1-108'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, 'ทิ้ง 1 ใบเพื่อจั่ว 2 ใบ? (ไม่บังคับ)');
      if (discarded) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 109 (ST) Event — buff <Shinji Ikari>/"Unit-01"-named +3000 BP until start of your next turn;
  // may rest an active <Rei Ayanami> to draw 1.
  reg['UA44ST-EVA-1-109'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Shinji Ikari') || (u.card.name || '').includes('Unit-01'));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character รับ +3000 BP จนถึงต้นเทิร์นถัดไป`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpPersist += 3000; log(`${card.name}: ${t.card.name} +3000 BP จนถึงต้นเทิร์นถัดไป`); }
      }
      const reis = [...p.front, ...p.energy].filter(u => !u.rested && (u.card.name || '').includes('Ayanami Rei'));
      if (reis.length) {
        const uid2 = await p.controller.chooseOwnCharacter(p, reis, 'วางนอน Rei Ayanami เพื่อจั่ว 1 ใบ? (ไม่บังคับ)', true);
        const r = reis.find(x => x.uid === uid2);
        if (r) { r.rested = true; Engine.draw(p, 1); log(`${card.name}: วางนอน ${r.card.name} แล้วจั่ว 1 ใบ`); }
      }
    },
  };

  // 110 (ST) — [On Retire] draw 1.
  reg['UA44ST-EVA-1-110'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 111 (ST) — [Main][Rest this card] choose 1 other character, +1000 BP this turn.
  reg['UA44ST-EVA-1-111'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 112 (ST) — [Main][Rest this card] may place this... simplified: place a face-down card from
  // deck under an <Evangelion Unit-13>; if you did, draw 2 and discard 1.
  reg['UA44ST-EVA-1-112'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Evangelion Unit-13'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Evangelion Unit-13 บนสนาม'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'วางการ์ดนี้คว่ำใต้ Evangelion Unit-13 ใบไหน?', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      const idx = p.front.includes(unit) ? p.front.indexOf(unit) : p.energy.indexOf(unit);
      (p.front.includes(unit) ? p.front : p.energy).splice(idx, 1);
      t.counters.push(unit.no);
      log(`${unit.card.name}: ถูกวางคว่ำใต้ ${t.card.name}`);
      Engine.draw(p, 2); log(`${t.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 113 (ST) — when raided on, choose: draw 1, or enemy front -1000 BP this turn.
  reg['UA44ST-EVA-1-113'] = {
    async onRaided(G, p, targetNo, raiderUnit) {
      const v = await p.controller.chooseOption(p, 'Asuka Langley Shikinami ถูก Raid — เลือก effect', [
        { label: 'จั่ว 1 ใบ', value: 'draw' },
        { label: 'character ศัตรูบน Front Line -1000 BP เทิร์นนี้', value: 'debuff' },
      ]);
      if (v === 'draw') { Engine.draw(p, 1); log('Asuka Langley Shikinami: จั่ว 1 ใบ (จาก Raid)'); }
      else await H.debuffEnemyFront(p, -1000);
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Coverage notes (108 EVA cards with printed effect text):
  //  • Fully scripted above: ~40 cards
  //  • Covered for free by generic patterns in common.js (draw+discard,
  //    on-play BP buff/debuff, rest/retire-enemy, AP untap, scry-top,
  //    self-bounce, cost reduction while in hand): ~25 cards
  //  • Keyword-only (Raid target / Impact / Damage / Step / Snipe /
  //    Double Attack / Double Block / Impact Negate already auto-apply via
  //    the keyword parser, but any EXTRA text on the card is not yet
  //    scripted): the big Raid "boss" units (033, 034, 041-043, 053, 077-082,
  //    104, 106's tiers) and a handful of reactive/opponent's-turn passives
  //    (002, 008, 018's trigger-swap, 087, 092, 094's play-gate) — these play
  //    correctly for their core stats/keywords, but their bonus text still
  //    needs manual adjudication via the unit's ±BP / rest / sideline menu.
  // ────────────────────────────────────────────────────────────────────────
})();
