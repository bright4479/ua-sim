// ══════════ UA SIM — That Time I Got Reincarnated as a Slime (TSK) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countHighBpInSideline(p, minBp) {
    return p.sideline.filter(no => { const c = byNo(no); return c && c.type === 'Character' && (c.bp || 0) >= minBp; }).length;
  }

  // ── EX09BT-TSK-2 (newer print run) ──────────────────────────────────────

  // 002 Diablo — [Main][1/turn] choose: set self Active if BP≥6000, or gain a [When Attacking]
  // conditional draw-if-BP≥6000 this turn.
  reg['EX09BT-TSK-2-002'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'Active ตัวเอง (ถ้า BP≥6000)', value: 'active' },
        { label: 'รับความสามารถ [When Attacking] จั่วถ้า BP≥6000 (เทิร์นนี้)', value: 'grant' },
      ]);
      if (v === 'active') {
        if (Engine.bp(unit) >= 6000) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
        else p.controller.notify?.('BP ไม่ถึง 6000');
      } else {
        unit._grantedConditionalAttackDraw = true;
        log(`${unit.card.name}: ได้รับความสามารถ [When Attacking] จั่วถ้า BP≥6000 เทิร์นนี้`);
      }
    },
    async onAttack(G, p, unit) {
      if (unit._grantedConditionalAttackDraw && Engine.bp(unit) >= 6000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 003 Rimuru — [Main][1/turn] only during the turn played; choose: own Diablo +2000 BP this
  // turn, or re-activate own Diablo's [On Play] effect.
  reg['EX09BT-TSK-2-003'] = {
    async onMain(G, p, unit) {
      if (unit.enteredTurn !== Engine.G.turn) { p.controller.notify?.('ใช้ได้เฉพาะเทิร์นที่ลงการ์ดนี้'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Diablo'));
      if (!targets.length) { p.controller.notify?.('ไม่มี Diablo'); return; }
      unit._usedTurn = Engine.G.turn;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'Diablo +2000 BP เทิร์นนี้', value: 'buff' },
        { label: 'เปิดใช้ [On Play] ของ Diablo อีกครั้ง', value: 'replay' },
      ]);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Diablo', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (v === 'buff') { t.bpMod += 2000; log(`${unit.card.name}: ${t.card.name} +2000 BP เทิร์นนี้`); }
      else { await Effects.onPlay(G, p, t); log(`${unit.card.name}: เปิดใช้ [On Play] ของ ${t.card.name} อีกครั้ง`); }
    },
  };

  // 004 Kurobe — [Main][Rest] choose 1 other Trait:Kijin, +500 BP this turn.
  reg['EX09BT-TSK-2-004'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kijin'));
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      unit.rested = true;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Trait:Kijin รับ +500 BP เทิร์นนี้', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
    },
  };

  // 008 Souei — passive targeting-tax ("opponent must discard extra to choose this") and a
  // Trait:Kijin double-counting modifier for OTHER cards' count conditions. (Skipped: no engine
  // primitive taxes an opponent's targeting choice, and no generic counter reads a per-card
  // "counts as 2" multiplier.)

  // 010 Benimaru — [On Play] if 3+ other Trait:Kijin on Front Line, draw 1.
  reg['EX09BT-TSK-2-010'] = {
    async onPlay(G, p, unit) {
      if (p.front.filter(u => u !== unit && (u.card.traits || '').includes('Kijin')).length >= 3) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 011 Benimaru — [On Play] may return 1 other Trait:Kijin (energy≤2) to hand; if did, the next
  // Trait:Kijin card played from hand this turn costs 1 less AP (approximated as a for-the-turn
  // discount rather than a strict one-shot). @[When Attacking] choose 1 other Trait:Kijin, +500 BP.
  reg['EX09BT-TSK-2-011'] = {
    costMod(p, card) {
      if (p._kijinApDiscountTurn === Engine.G.turn && (card.traits || '').includes('Kijin')) return { apDelta: -1 };
      return {};
    },
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kijin') && (u.card.need || 0) <= 2);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: คืนมือ Trait:Kijin (Energy≤2)? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      p._kijinApDiscountTurn = Engine.G.turn;
      log(`${unit.card.name}: การ์ด Trait:Kijin ใบถัดไปที่เล่นเทิร์นนี้ ลด AP 1`);
    },
    async onAttack(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Kijin'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Kijin รับ +500 BP เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
    },
  };

  // 012 Naming (Event) — draw 1; choose: all own Trait:Kijin on Front Line +1000 BP this turn, or
  // own Diablo +3000 BP until the start of your turn.
  reg['EX09BT-TSK-2-012'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'Trait:Kijin บน Front Line ทั้งหมด +1000 BP เทิร์นนี้', value: 'kijin' },
        { label: 'Diablo +3000 BP จนถึงต้นเทิร์นของคุณ', value: 'diablo' },
      ]);
      if (v === 'kijin') {
        let n = 0;
        for (const u of p.front) if ((u.card.traits || '').includes('Kijin')) { u.bpMod += 1000; n++; }
        log(`${card.name}: Trait:Kijin ${n} ใบ +1000 BP เทิร์นนี้`);
      } else {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Diablo'));
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Diablo`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.bpPersist += 3000; log(`${card.name}: ${t.card.name} +3000 BP จนถึงต้นเทิร์นของคุณ`); }
      }
    },
  };

  // 019 Shion — [On Play] if 4+ character cards BP≥4000 or 4+ Event cards in Outside Area, set
  // self Active.
  reg['EX09BT-TSK-2-019'] = {
    async onPlay(G, p, unit) {
      const highBp = countHighBpInSideline(p, 4000);
      const events = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      if (highBp >= 4 || events >= 4) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 021 Souei — [On Play] if 2+ Event cards in Outside Area, draw 1.
  reg['EX09BT-TSK-2-021'] = {
    async onPlay(G, p, unit) {
      if (p.sideline.filter(no => byNo(no)?.type === 'Event').length >= 2) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 022 Benimaru — "This character cannot block." now handled generically via kw.cannotBlock.

  // 023 Covert Agent (Event) — choose 1 own Front Line character +2000 BP this turn; if own Souei, also [Impact +1].
  reg['EX09BT-TSK-2-023'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 2000;
      log(`${card.name}: ${t.card.name} +2000 BP เทิร์นนี้`);
      if (H.hasCardNamed(p, 'Souei')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 024 Report (Event) — look at top 2, choose any number to keep on top (rest to Outside Area);
  // then play up to 1 blue character card (BP≤4000, energy≤2) from Outside Area, rested.
  reg['EX09BT-TSK-2-024'] = {
    async onEvent(G, p, card) {
      await H.lookTopAndDiscard(p, 2, 2, `${card.name}: ดูการ์ดบนสุด 2 ใบ`);
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.bp || 0) <= 4000 && (c.need || 0) <= 2;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก character สีน้ำเงิน (BP≤4000, Energy≤2) จาก Outside Area`, pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
  };

  // 025 Veldora — when this character attacks and wins, may draw 1 (then discard 1 if did).
  // (Skipped: the "would-be-retired → discard instead" replacement effect — no hook intercepts
  // sidelineUnit calls to redirect them per-unit.)
  reg['EX09BT-TSK-2-025'] = {
    async onWinBattle(G, p, atk, enemy, defender) {
      const v = await p.controller.chooseOption(p, `${atk.card.name}: จั่ว 1 ใบ (ไม่บังคับ)`,
        [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      return false;
    },
  };

  // 029 Souka — [Main][Rest][Retire] play/raid a purple character then force the opponent to play
  // one too, with both cards' [On Play] suppressed. (Skipped: no hook forces an opponent-side play
  // or selectively suppresses a specific play's [On Play] trigger.)

  // 030 Diablo — [On Play] if own Rimuru, choose: draw 2 + discard 1, force the opponent to retire
  // 1 of their own Front Line characters, or set self Active.
  reg['EX09BT-TSK-2-030'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, 'Rimuru')) return;
      const enemy = Engine.opponentOf(p);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 2 ใบ แล้วทิ้ง 1 ใบ', value: 'draw' },
        { label: 'ให้ศัตรู retire character 1 ใบบน Front Line ของตัวเอง', value: 'forceRetire' },
        { label: 'Active ตัวเอง', value: 'active' },
      ]);
      if (v === 'draw') { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); await H.discardFromHand(p); }
      else if (v === 'forceRetire') {
        const targets = enemy.front.filter(u => u.card.type === 'Character');
        if (targets.length) {
          const uid = await enemy.controller.chooseOwnCharacter(enemy, targets, `${unit.card.name}: เลือก character บน Front Line ของคุณเพื่อ retire (ถูกบังคับ)`);
          const t = targets.find(x => x.uid === uid);
          if (t) await Engine.sidelineUnit(enemy, t, 'effect');
        }
      } else { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 031 Hinata — [On Play] choose up to 1 other own Hinata, +1000 BP this turn.
  reg['EX09BT-TSK-2-031'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes('Hinata'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Hinata รับ +1000 BP เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 032 Hinata — [Main] manually raids this card onto another Front Line Hinata with [Raid].
  // (Skipped: this is a bespoke manual-trigger-Raid mechanic — implementing it wrong risks
  // corrupting the Raid-stack representation used elsewhere, so it's left unscripted.)

  // 035 Masayuki — cannot attack (now handled generically via kw.cannotAttack). [Main][Frontline]
  // [Rest] force the opponent to rest 1 of their own active Front Line characters. @[On Retire]
  // same forced rest.
  reg['EX09BT-TSK-2-035'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested);
      if (targets.length) {
        const uid = await enemy.controller.chooseOwnCharacter(enemy, targets, `${unit.card.name}: ศัตรูถูกบังคับให้เลือก character บน Front Line ของตัวเองวางนอน`);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกบังคับให้วางนอน`); }
      }
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested);
      if (!targets.length) return;
      const uid = await enemy.controller.chooseOwnCharacter(enemy, targets, `${unit.card.name}: ศัตรูถูกบังคับให้เลือก character บน Front Line ของตัวเองวางนอน`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกบังคับให้วางนอน`); }
    },
  };

  // 036 Myormile — [On Play] choose: look at top 4 (keep up to 1 on top, rest to bottom), or look
  // at the top card (add to hand if Rimuru/energy-4, otherwise place top or bottom).
  reg['EX09BT-TSK-2-036'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 4 ใบ (เลือก 1 ใบไว้บนสุด ที่เหลือไปใต้เด็ค)', value: 'look4' },
        { label: 'ดูการ์ดบนสุด 1 ใบ (Rimuru หรือ Energy=4 อาจเพิ่มเข้ามือ)', value: 'look1' },
      ]);
      if (v === 'look4') {
        const n = Math.min(4, p.deck.length);
        if (!n) return;
        const revealed = p.deck.splice(0, n);
        const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดไว้บนสุด (สูงสุด 1 ใบ)`, null, 1);
        const idx = picked[0];
        let top = null;
        if (idx != null) top = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        if (top != null) p.deck.unshift(top);
        log(`${unit.card.name}: จัดการ์ดบนสุดของเด็คใหม่`);
      } else {
        if (!p.deck.length) return;
        const top = p.deck[0];
        const c = byNo(top);
        if ((c.name || '').includes('Rimuru') || (c.need || 0) === 4) {
          const v2 = await p.controller.chooseOption(p, `${unit.card.name}: การ์ดบนสุด ${c.name} — เพิ่มเข้ามือ?`,
            [{ label: 'เพิ่มเข้ามือ', value: true }, { label: 'ไม่เอา', value: false }]);
          if (v2) { p.hand.push(p.deck.shift()); log(`${unit.card.name}: เพิ่ม ${c.name} เข้ามือ`); return; }
        }
        const v3 = await p.controller.chooseOption(p, `${unit.card.name}: วาง ${c.name} ไว้บนหรือใต้เด็ค?`,
          [{ label: 'บนสุด', value: 'top' }, { label: 'ล่างสุด', value: 'bottom' }]);
        if (v3 === 'bottom') p.deck.push(p.deck.shift());
      }
    },
  };

  // 039 Ranga — [When Attacking] +500 BP this turn if own Rimuru or own Gobta (choose which
  // condition triggers it when both apply).
  reg['EX09BT-TSK-2-039'] = {
    async onAttack(G, p, unit) {
      const opts = [];
      if (H.hasCardNamed(p, 'Rimuru')) opts.push({ label: '+500 BP (มี Rimuru)', value: 'rimuru' });
      if (H.hasCardNamed(p, 'Gobta')) opts.push({ label: '+500 BP (มี Gobta)', value: 'gobta' });
      if (!opts.length) return;
      await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 040 Louis — [On Retire] play up to 1 purple Hinata/Luminous (energy≤3, AP1) from hand, rested.
  reg['EX09BT-TSK-2-040'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Purple' && ((c.name || '').includes('Hinata') || (c.name || '').includes('Luminous')) && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 047 Luminous — [On Play] may retire 1 other own character to free-play 1 Hinata (energy≤2,
  // AP1) from Outside Area, rested. @[Main][Frontline][1/turn] draw 1, buff 1 own character +1000
  // BP this turn, then retire 1 other own character (mandatory).
  reg['EX09BT-TSK-2-047'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, others, `${unit.card.name}: Retire character อื่น? (ไม่บังคับ)`, true);
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, t, 'effect');
      const pred = c => c && c.type === 'Character' && (c.name || '').includes('Hinata') && (c.need || 0) <= 2 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Hinata จาก Outside Area', pred);
      if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่นให้ retire'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character อื่นเพื่อ retire (บังคับ)');
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid2 = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ +1000 BP เทิร์นนี้', true);
        const t2 = targets.find(x => x.uid === uid2);
        if (t2) { t2.bpMod += 1000; log(`${unit.card.name}: ${t2.card.name} +1000 BP เทิร์นนี้`); }
      }
      await Engine.sidelineUnit(p, t, 'effect');
    },
  };

  // 051 Shion — [Main][1/turn] if own Rimuru, gain a draw granted on attack conditioned on
  // being blocked / not blocked. (Skipped: no hook distinguishes a blocked vs. unblocked attack
  // outcome yet — same gap noted for ARK's "post-block-declaration hook".)

  // 055 The Founder's Festival (Field) — [On Play] choose: look at top 5 for up to 1
  // Rimuru/energy-4 card to hand, or draw 1 if own Rimuru.
  reg['EX09BT-TSK-2-055'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 5 ใบ (หา Rimuru หรือ Energy=4)', value: 'look' },
        { label: 'จั่ว 1 ใบ (ถ้ามี Rimuru)', value: 'draw' },
      ]);
      if (v === 'look') {
        await H.lookTopAndTake(p, 5, c => (c.name || '').includes('Rimuru') || (c.need || 0) === 4, 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      } else if (H.hasCardNamed(p, 'Rimuru')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 057 『Solution』(Event) — untap 1 AP. (Skipped: the "Choose 1 → Choose all" meta text-
  // replacement for your own purple cards' menus — no generic hook rewrites other cards' choice
  // structures.)
  reg['EX09BT-TSK-2-057'] = { async onEvent(G, p, card) { await H.apUntap(p, 1); } };

  // 058 Chef (Event) — choose 1 enemy Front Line character BP≤5000, then choose: nullify its
  // effects until the start of your next turn (approximated as until end of this turn), or retire
  // it. (Skipped: the "only usable if own Shion" precondition isn't enforced pre-play.)
  reg['EX09BT-TSK-2-058'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 5000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤5000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ล้าง effect ทั้งหมดจนถึงต้นเทิร์นถัดไปของคุณ', value: 'nullify' },
        { label: 'Retire', value: 'retire' },
      ]);
      if (v === 'nullify') { t.effectsNullified = true; log(`${card.name}: ${t.card.name} เสีย effect ทั้งหมดจนถึงต้นเทิร์นถัดไปของคุณ`); }
      else await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 061 Resurrection (Event) — fetch 1 character card from Outside Area to hand; if own Luminous, draw 1.
  reg['EX09BT-TSK-2-061'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก character จาก Outside Area`);
      if (H.hasCardNamed(p, 'Luminous')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 065 Milim — [On Play] if not played by your effect, gains "return to hand at the end of the
  // opponent's Attack Phase" until the start of your next turn. (Skipped: no hook fires at the end
  // of a specific attack phase.)

  // 067 Ramiris — [On Play] look at top 2, place up to 1 green Trait:Demon Lord card to Outside Area, remainder on top.
  reg['EX09BT-TSK-2-067'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => c.color === 'Green' && (c.traits || '').includes('Demon Lord'));
    },
  };

  // 073 It's Delicious (Event) — once per turn: choose 1 own character, +2 energy generation this
  // turn; if own Milim, untap 1 AP.
  reg['EX09BT-TSK-2-073'] = {
    async onEvent(G, p, card) {
      if (p._itsDeliciousTurn === Engine.G.turn) return;
      p._itsDeliciousTurn = Engine.G.turn;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character รับ +2 energy generation เทิร์นนี้`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) { t.tempGen += 2; log(`${card.name}: ${t.card.name} +2 energy generation เทิร์นนี้`); }
      }
      if (H.hasCardNamed(p, 'Milim')) await H.apUntap(p, 1);
    },
  };

  // ── TSK-1 (base set) ─────────────────────────────────────────────────────

  // 013 Rimuru — [On Play] and [When Attacking][When in Frontline] both offer the same choice: all
  // other own Front Line characters +1000 BP this turn, or 1 other own character +2000 BP this turn.
  function rimuru013Choice() {
    return async (p, unit) => {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่นบน Front Line ทั้งหมด +1000 BP เทิร์นนี้', value: 'mass' },
        { label: 'เลือก character อื่น 1 ใบ +2000 BP เทิร์นนี้', value: 'single' },
      ]);
      if (v === 'mass') {
        let n = 0;
        for (const u of p.front) if (u !== unit && u.card.type === 'Character') { u.bpMod += 1000; n++; }
        log(`${unit.card.name}: character บน Front Line ${n} ใบ +1000 BP เทิร์นนี้`);
      } else {
        await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
      }
    };
  }
  reg['TSK-1-013'] = {
    async onPlay(G, p, unit) { await rimuru013Choice()(p, unit); },
    async onAttack(G, p, unit) { if (p.front.includes(unit)) await rimuru013Choice()(p, unit); },
  };

  // 016 Shion — [On Play] may pay 1 AP to play 1 yellow Trait:Oni character (energy≤3, AP1) from hand, rested.
  reg['TSK-1-016'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.traits || '').includes('Oni') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx < 0 || Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อลง ${byNo(p.hand[idx]).name}?`,
        [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 019 Shuna — AP discount (4+ Trait:Kijin) is now handled generically via Engine.textApDelta.
  // [On Play] choose up to 2 own Trait:Kijin on Front Line, +500 BP and untargetable this turn
  // (approximates "until the start of your next turn").
  reg['TSK-1-019'] = {
    async onPlay(G, p, unit) {
      const targets = p.front.filter(u => (u.card.traits || '').includes('Kijin'));
      if (!targets.length) return;
      for (let i = 0; i < 2 && targets.length; i++) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Kijin บน Front Line (${i + 1}/2)`, true);
        const t = targets.find(x => x.uid === uid);
        if (!t) break;
        t.bpMod += 500;
        t.tempUntargetable = true;
        log(`${unit.card.name}: ${t.card.name} +500 BP และ untargetable เทิร์นนี้ (ประมาณค่าจาก "จนถึงต้นเทิร์นถัดไป")`);
        targets.splice(targets.indexOf(t), 1);
      }
    },
  };

  // 021 Souei — [On Block] self -1000 BP this turn (or +1000 BP instead if the attacker is in Raid State).
  reg['TSK-1-021'] = {
    async onBlock(G, p, unit, atkUnit) {
      if (atkUnit && atkUnit.under && atkUnit.under.length) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้ (ศัตรูอยู่ใน Raid State)`); }
      else { unit.bpMod -= 1000; log(`${unit.card.name}: -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 023 Hakurou — [On Play][When in Energy Line] may swap positions with an active own Front Line
  // character; if did, set self Active.
  reg['TSK-1-023'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      const targets = p.front.filter(u => !u.rested && u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: สลับตำแหน่งกับ character Active บน Front Line? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const iMe = p.energy.indexOf(unit), iT = p.front.indexOf(t);
      p.energy[iMe] = t; p.front[iT] = unit;
      unit.rested = false;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}, Active ตัวเอง`);
    },
  };

  // 028 Jura Tempest Federation (Field) — [1/turn] when one of your characters attacks and wins, draw 1.
  reg['TSK-1-028'] = {
    async onAnyWinBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 029 Daemon Summoning (Event) — fetch 1 Diablo from Outside Area to hand; the next Diablo
  // played from hand this turn costs 1 less AP.
  reg['TSK-1-029'] = {
    costMod(p, card) {
      if (p._diabloApDiscountTurn === Engine.G.turn && (card.name || '').includes('Diablo')) return { apDelta: -1 };
      return {};
    },
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && (c.name || '').includes('Diablo'), `${card.name}: เลือก Diablo จาก Outside Area`);
      p._diabloApDiscountTurn = Engine.G.turn;
      log(`${card.name}: การ์ด Diablo ใบถัดไปที่เล่นเทิร์นนี้ ลด AP 1`);
    },
  };

  // 031 Overdrive (Event) — rest 1 enemy Front Line character; choose up to 1 own Shuna, set Active.
  reg['TSK-1-031'] = {
    async onEvent(G, p, card) {
      await H.restEnemyFront(p);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Shuna') && u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Shuna ให้ Active`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 033 Harvest Festival (Event) — AP -1 if own Rimuru; choose 1 enemy Front Line character
  // BP≤4000, send to Remove Area (genuine).
  reg['TSK-1-033'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Rimuru') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 4000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู (BP≤4000) ส่งไป Remove Area`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      enemy.front.splice(enemy.front.indexOf(t), 1);
      enemy.removal.push(t.no);
      log(`${card.name}: ${t.card.name} ถูกส่งไป Remove Area ถาวร`);
    },
  };

  // 035 Veldora — [Main][Rest][Retire] draw 2, place 1 card from hand to Outside Area. (Skipped:
  // the "cannot be played/moved to Front Line" placement restriction — no hook constrains the
  // destination line offered when playing/moving a card.)
  reg['TSK-1-035'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 042 Shizu — [On Retire] choose 1 own character, +1000 BP this turn. (The unconditional "-1000
  // BP" clause is treated like other always-on flat BP text — assumed already reflected in the
  // printed BP stat, per the same convention buildBpEvaluator uses for always-on "+N BP" text.)
  reg['TSK-1-042'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.buffOwnCharacter(p, 1000);
    },
  };

  // 044 Souka — [Main][1/turn] only if you used an Event Card this turn, self +500 BP this turn.
  reg['TSK-1-044'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card ในเทิร์นนี้ก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 045 Souka — [Main][Frontline][Rest][1/turn] only if you used an Event Card this turn, draw 1.
  reg['TSK-1-045'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card ในเทิร์นนี้ก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
    },
  };

  // 047 Ranga — [On Play] choose: look at top 4 for up to 1 character (energy≥3) to hand
  // (remainder to bottom), or move 1 own character to the other line.
  reg['TSK-1-047'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ดูการ์ดบนสุด 4 ใบ (หา character Energy≥3)', value: 'look' },
        { label: 'ย้าย character ไปอีก line', value: 'move' },
      ]);
      if (v === 'look') {
        await H.lookTopAndTake(p, 4, c => c.type === 'Character' && (c.need || 0) >= 3, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      } else {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (!targets.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character เพื่อย้าย line', true);
        const t = targets.find(x => x.uid === uid);
        if (!t) return;
        const toLine = p.front.includes(t) ? 'energy' : 'front';
        let removeUid = null;
        const dest = toLine === 'front' ? p.front : p.energy;
        if (dest.length >= 4) removeUid = await p.controller.chooseOwnCharacter(p, dest, 'เลือกการ์ดส่งไป Remove Area (ไม่มีที่ว่าง)');
        await Engine.moveUnitFree(p, t, toLine, removeUid);
      }
    },
  };

  // 051 Rimuru — [On Play] if 2+ character cards BP≥4000 in your Outside Area, look at top 2,
  // keep any number on top (in order), remainder to bottom.
  reg['TSK-1-051'] = {
    async onPlay(G, p, unit) {
      if (countHighBpInSideline(p, 4000) < 2 || !p.deck.length) return;
      const n = Math.min(2, p.deck.length);
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือกการ์ดไว้บนสุด (เรียงลำดับเดิม)`, null, n);
      const top = [], rest = [];
      revealed.forEach((no, i) => { if (picked.includes(i)) top.push(no); else rest.push(no); });
      p.deck.push(...rest);
      p.deck.unshift(...top);
      log(`${unit.card.name}: จัดการ์ดบนสุดของเด็คใหม่`);
    },
  };

  // 053 Rimuru — [On Play] fetch 1 blue character card (energy≤4, AP1) from Outside Area to hand;
  // if 4+ high-BP characters or 4+ Event cards in Outside Area, may play it Active instead.
  reg['TSK-1-053'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 4 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const events = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      const canPlayActive = countHighBpInSideline(p, 4000) >= 4 || events >= 4;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก character สีน้ำเงิน (Energy≤4) จาก Outside Area`, pred);
      if (idx == null) return;
      if (canPlayActive) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: เพิ่มเข้ามือ หรือ ลงสนามทันที (Active)?`,
          [{ label: 'เพิ่มเข้ามือ', value: 'hand' }, { label: 'ลงสนามทันที (Active)', value: 'play' }]);
        if (v === 'play') { await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true }); return; }
      }
      const no = p.sideline.splice(idx, 1)[0];
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 055 Shion — [Main][Frontline][1/turn] choose 1 enemy character (any zone) BP≥1500, -1000 BP.
  reg['TSK-1-055'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.debuffEnemyAny(p, -1000, { min: 1500 });
    },
  };

  // 059 Souei — two independent [Main][1/turn] abilities: (1) if you used an Event this turn, self
  // +1000 BP; (2) place 2 Event cards from Outside Area to Remove Area, if did gain "cannot be
  // blocked by BP≥4000" this turn.
  reg['TSK-1-059'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (unit._usedTurn1 !== Engine.G.turn && p._eventsUsedThisTurn) opts.push({ label: '+1000 BP เทิร์นนี้', value: 'buff' });
      const eventsInSideline = p.sideline.filter(no => byNo(no)?.type === 'Event').length;
      if (unit._usedTurn2 !== Engine.G.turn && eventsInSideline >= 2) opts.push({ label: 'ย้าย Event 2 ใบจาก Outside Area ไป Remove Area (ไม่ถูก block โดย BP≥4000 เทิร์นนี้)', value: 'unblock' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'buff') { unit._usedTurn1 = Engine.G.turn; unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้`); }
      else {
        unit._usedTurn2 = Engine.G.turn;
        let moved = 0;
        for (let i = 0; i < 2; i++) {
          const idx = p.sideline.findIndex(no => byNo(no)?.type === 'Event');
          if (idx < 0) break;
          const no = p.sideline.splice(idx, 1)[0];
          p.removal.push(no);
          moved++;
        }
        if (moved) { unit.tempUnblockableBPMin = 4000; log(`${unit.card.name}: ย้าย Event ${moved} ใบไป Remove Area, ไม่ถูก block โดย character BP≥4000 เทิร์นนี้`); }
      }
    },
  };

  // 061 Great Jura Forest (Field) — [Main][Rest][Retire] fetch 1 blue character card from Outside Area to hand.
  reg['TSK-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && c.type === 'Character' && c.color === 'Blue';
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี character สีน้ำเงินใน Outside Area'); return; }
      await Engine.sidelineUnit(p, unit, 'effect');
      await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือก character สีน้ำเงินจาก Outside Area`);
    },
  };

  // 063 Anti-Magic Mask (Event) — choose 1 character (yours or the opponent's), it loses its
  // effects and its stacked cards go to Outside Area, until the start of your next turn
  // (approximated as until end of this turn); if the chosen character is Shizu, untap 1 AP.
  reg['TSK-1-063'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = [...p.front, ...p.energy, ...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character (ของคุณหรือศัตรู)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.effectsNullified = true;
      const owner = [p, enemy].find(pl => pl.front.includes(t) || pl.energy.includes(t));
      if (t.counters.length) { owner.sideline.push(...t.counters); t.counters = []; }
      log(`${card.name}: ${t.card.name} เสีย effect ทั้งหมดจนถึงต้นเทิร์นถัดไปของคุณ`);
      if ((t.card.name || '').includes('Shizu')) await H.apUntap(p, 1);
    },
  };

  // 064 Shion's Cooking (Event) — all enemy Front Line characters BP≥1500 get -1000 BP this turn; draw 1.
  reg['TSK-1-064'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      let n = 0;
      for (const u of enemy.front) if (u.card.type === 'Character' && Engine.bp(u) >= 1500) { u.bpMod -= 1000; n++; }
      log(`${card.name}: enemy Front Line ${n} ใบ -1000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 067 Predator (Event) — AP -1 if own Rimuru; retire 1 enemy Front Line character BP≤4000, draw 1, discard 1.
  reg['TSK-1-067'] = {
    costMod(p, card) { return { apDelta: H.hasCardNamed(p, 'Rimuru') ? -1 : 0 }; },
    async onEvent(G, p, card) {
      await H.retireEnemyFront(p, 4000);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 070 Veldora — [On Play] if this card was played by your effect, rest 1 enemy Front Line character BP≤3000.
  reg['TSK-1-070'] = {
    async onPlay(G, p, unit) {
      if (!unit._playedByEffect) return;
      await H.restEnemyFront(p, 3000);
    },
  };

  // 072 Beretta — [On Play] choose up to 1 other own character +1000 BP this turn (up to 2 if this
  // card was played by your effect).
  reg['TSK-1-072'] = {
    async onPlay(G, p, unit) {
      const max = unit._playedByEffect ? 2 : 1;
      const excluded = new Set([unit]);
      for (let i = 0; i < max; i++) {
        const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && !excluded.has(u));
        if (!targets.length) break;
        const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character รับ +1000 BP เทิร์นนี้', true);
        const t = targets.find(x => x.uid === uid);
        if (!t) break;
        t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`);
        excluded.add(t);
      }
    },
  };

  // 073 Ranga — [On Play] if this card was played by your effect, draw 1.
  reg['TSK-1-073'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 078 Clayman — "cannot be blocked by character with BP 4000 or higher" now handled generically
  // via kw.unblockableBPMin (widened to accept singular "character"/"or higher" wording).

  // 083 Milim — passive +1000 BP if 6+ own generated energy.
  reg['TSK-1-083'] = {
    bpBonus(p, unit) {
      const total = Object.values(Engine.energyGen(p)).reduce((a, b) => a + b, 0);
      return total >= 6 ? 1000 : 0;
    },
  };

  // 088 Ramiris — [On Play] play 1 green character (energy≤2, AP1) from hand, rested.
  // @[Main][Discard1][1/turn] gains front-line energy generation this turn.
  reg['TSK-1-088'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx < 0) return;
      await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.tempFrontGen = true;
      log(`${unit.card.name}: ได้ front-line energy generation เทิร์นนี้`);
    },
  };

  // 095 Feast of the True Demon Lords (Field) — [Main][Rest][Discard1] reveal top of deck, add to
  // hand; if it had Trait:Demon Lord, this Field +1 [green] energy generation this turn.
  reg['TSK-1-095'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      if (!p.deck.length) return;
      unit.rested = true;
      await H.discardFromHand(p);
      const top = p.deck.shift();
      const c = byNo(top);
      p.hand.push(top);
      log(`${unit.card.name}: เพิ่ม ${c?.name} เข้ามือ`);
      if ((c?.traits || '').includes('Demon Lord')) { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
    },
  };

  // 097 Drago Nova (Event) — choose: retire 1 enemy Field, or retire 1 enemy Front Line character
  // BP≤3000 (BP≤5000 if own Milim).
  reg['TSK-1-097'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const fields = enemy.energy.filter(u => u.card.type === 'Field');
      const opts = [];
      if (fields.length) opts.push({ label: 'Retire Field ของศัตรู', value: 'field' });
      opts.push({ label: 'Retire character ศัตรูบน Front Line', value: 'char' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'field') {
        const uid = await p.controller.chooseEnemyCharacter(p, fields, `${card.name}: เลือก Field ศัตรู`, true);
        const t = fields.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(enemy, t, 'effect');
      } else {
        await H.retireEnemyFront(p, H.hasCardNamed(p, 'Milim') ? 5000 : 3000);
      }
    },
  };

  // 099 An invitation from the Demon (Event) — look at top 3, play up to 1 green character
  // (energy≤4, AP1) among them, rested (Raid option not automated); remainder to bottom.
  reg['TSK-1-099'] = {
    async onEvent(G, p, card) {
      const n = Math.min(3, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const pred = c => c && c.type === 'Character' && c.color === 'Green' && (c.need || 0) <= 4 && (c.ap || 0) === 1;
      const idx = revealed.findIndex(no => pred(byNo(no)));
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        const v = await p.controller.chooseOption(p, `${card.name}: ลง ${byNo(no)?.name} ลงสนาม (rested)?`,
          [{ label: 'ลง', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { p.hand.push(no); await Engine.playCardFromZone(p, no, 'hand', { line: 'energy', active: false }); }
        else revealed.push(no);
      }
      p.deck.push(...revealed);
    },
  };

  // 104 Benimaru — [On Play] choose up to 1 enemy Front Line character BP≤3000, send to bottom of their deck.
  reg['TSK-1-104'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู (BP≤3000) ส่งไปใต้เด็ค`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      enemy.front.splice(enemy.front.indexOf(t), 1);
      enemy.deck.push(t.no);
      log(`${unit.card.name}: ${t.card.name} ถูกส่งไปใต้เด็คของ ${enemy.name}`);
    },
  };

  // 106 Rimuru — passive +1000 BP if 2+ character cards BP≥4000 in your Outside Area.
  reg['TSK-1-106'] = {
    bpBonus(p, unit) { return countHighBpInSideline(p, 4000) >= 2 ? 1000 : 0; },
  };

  // 108 Sealed Cave (Field) — [On Play] look at top 6, place up to 1 character card BP≥4000 under
  // this Field face-down, remainder to bottom. @[Main][Rest][Retire] add the stored card to hand.
  reg['TSK-1-108'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(6, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.bp || 0) >= 4000; });
      if (idx >= 0) { unit.counters.push(revealed.splice(idx, 1)[0]); log(`${unit.card.name}: เก็บการ์ดไว้ใต้ Field นี้ (คว่ำ)`); }
      p.deck.push(...revealed);
    },
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (!unit.counters.length) { p.controller.notify?.('ไม่มีการ์ดใต้ Field นี้'); return; }
      const no = unit.counters.shift();
      await Engine.sidelineUnit(p, unit, 'effect');
      p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 109 Great Sage (Event) — choose 1 own character +2000 BP this turn; untap 1 AP.
  reg['TSK-1-109'] = {
    async onEvent(G, p, card) { await H.buffOwnCharacter(p, 2000); await H.apUntap(p, 1); },
  };

  // ── UAPR-TSK-P (promo prints) ─────────────────────────────────────────

  // 001 Rimuru — [On Play] and [Main][Discard1][1/turn] both: choose up to 1 other own character, +1000 BP this turn.
  reg['UAPR-TSK-P-001'] = {
    async onPlay(G, p, unit) { await H.buffOwnCharacter(p, 1000, { excludeUnit: unit }); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 002 Shizu — [When Attacking] place up to 2 cards from deck to Outside Area; if 3 or fewer
  // character cards BP≥4000 in Outside Area, discard 1 from hand.
  reg['UAPR-TSK-P-002'] = {
    async onAttack(G, p, unit) {
      const n = Math.min(2, p.deck.length);
      if (n) { p.sideline.push(...p.deck.splice(0, n)); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`); }
      if (countHighBpInSideline(p, 4000) <= 3) await H.discardFromHand(p);
    },
  };

  // 003 Milim — [On Play] choose: +1 [green] energy generation this turn, or gains front-line energy generation this turn.
  reg['UAPR-TSK-P-003'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: '+1 energy generation เทิร์นนี้', value: 'gen' },
        { label: 'ได้ front-line energy generation เทิร์นนี้', value: 'frontgen' },
      ]);
      if (v === 'gen') { unit.tempGen += 1; log(`${unit.card.name}: +1 energy generation เทิร์นนี้`); }
      else { unit.tempFrontGen = true; log(`${unit.card.name}: ได้ front-line energy generation เทิร์นนี้`); }
    },
  };
})();
