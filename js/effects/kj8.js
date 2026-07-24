// ══════════ UA SIM — Kaiju No. 8 (KJ8) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function isYourTurn(p) { return Engine.G.players[Engine.G.active] === p; }
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

  // 003 Mina Ashiro — [On Play] if there is a Bakko on the same line, choose up to 1 enemy Front
  // Line character and rest it.
  reg['UA28BT-KJ8-1-003'] = {
    async onPlay(G, p, unit) {
      const line = p.front.includes(unit) ? p.front : p.energy;
      if (!line.some(u => u !== unit && (u.card.name || '').includes('Bakko'))) return;
      await H.restEnemyFront(p);
    },
  };

  // 008 Haruichi Izumo — [On Play] if this character was played by your effect, draw 1.
  reg['UA28BT-KJ8-1-008'] = { async onPlay(G, p, unit) { if (unit._playedByEffect) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 018 Kikoru Shinomiya — [Your Turn] if there is another character with required energy of 3 on
  // the same line, +500 BP. (Skipped: "this card is also treated as required energy 3" — a static
  // override affecting how OTHER cards' board-state checks read this card's own required energy.)
  reg['UA28BT-KJ8-1-018'] = {
    bpBonus(p, unit) {
      if (!isYourTurn(p)) return 0;
      const line = p.front.includes(unit) ? p.front : p.energy;
      return line.some(u => u !== unit && (u.card.need || 0) === 3) ? 500 : 0;
    },
  };

  // 019 Kikoru Shinomiya — [On Play] if it's your turn and this character was played by your
  // effect, untap 1 AP.
  reg['UA28BT-KJ8-1-019'] = { async onPlay(G, p, unit) { if (isYourTurn(p) && unit._playedByEffect) await H.apUntap(p, 1); } };

  // 022 Bakko — [On Play] choose up to 1 character on your area and move it to another line.
  reg['UA28BT-KJ8-1-022'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy];
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 023 Bakko — [Opponent's Turn][Frontline] your Mina Ashiro gains protection requiring the
  // opponent to pay an additional cost to target it. (Skipped: recurring targeting-tax gap.)

  // 024 Kafka Hibino — [On Play] if it's your turn, you may pay 1 AP; if you did, draw 1 and
  // free-play 1 yellow Character (need<=3, ap1) from hand rested.
  reg['UA28BT-KJ8-1-024'] = {
    async onPlay(G, p, unit) {
      if (!isYourTurn(p) || Engine.activeAP(p) < 1) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP?`, [{ label: 'จ่าย', value: true }, { label: 'ข้าม', value: false }]);
      if (!v || !Engine.payAP(p, 1)) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 028 Iharu Furuhashi — [On Play] choose up to 1 other character, +500 BP this turn. If this
  // character was played by your effect, set self active.
  reg['UA28BT-KJ8-1-028'] = {
    async onPlay(G, p, unit) {
      await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
      if (unit._playedByEffect) { unit.rested = false; log(`${unit.card.name}: Active`); }
    },
  };

  // 030 Soshiro Hoshina — [Main][Frontline][Rest] choose 1 enemy Front Line character and rest it.
  reg['UA28BT-KJ8-1-030'] = { async onMain(G, p, unit) { if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; } if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; } unit.rested = true; await H.restEnemyFront(p); } };

  // 034 "A6-Grade Black Wagyu Beef Marble-Cut Course" — all characters +500 BP this turn. Draw 2,
  // place 1 card from hand to the Outside Area.
  reg['UA28BT-KJ8-1-034'] = {
    async onEvent(G, p, card) {
      for (const u of [...p.front, ...p.energy]) u.bpMod += 500;
      log(`${card.name}: character ทุกใบ +500 BP เทิร์นนี้`);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 037 "Now It's My Turn To Shoot" — choose 1 Mina Ashiro on your area, +2000 BP and "can attack
  // from your Energy Line" this turn.
  reg['UA28BT-KJ8-1-037'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Mina Ashiro'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Mina Ashiro`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 2000; t.tempCanAttackFromEnergy = true; log(`${card.name}: ${t.card.name} +2000 BP และโจมตีจาก Energy Line ได้เทิร์นนี้`); }
    },
  };

  // 038 "Selection Test" — look at the top 4, free-play up to 1 yellow Character (need<=4, ap1)
  // among them rested (skipped: "or raid it"), remainder to the bottom.
  reg['UA28BT-KJ8-1-038'] = {
    async onEvent(G, p, card) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 4 && (c.ap || 0) === 1; });
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        p.sideline.push(no);
        await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false });
      } else p.deck.push(...revealed);
    },
  };

  // 043 Mina Ashiro — [On Play] look at the top 2, keep any number on top (any order), remainder to
  // the bottom.
  reg['UA28BT-KJ8-1-043'] = { async onPlay(G, p, unit) { await lookTopSplitTopBottom(p, 2, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`); } };

  // 044 Mina Ashiro — [Main][Frontline][1/turn] only if this character is active: choose 1 other
  // character that changed from active to rest this turn, set it active. (Skipped: no tracker for
  // "changed from active to rest by any means during this turn" — the recurring gap noted since NGR.)

  // 045 Ryo Ikaruga — [Main][Rest+Retire] draw 1.
  reg['UA28BT-KJ8-1-045'] = { async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } };

  // 067 Soshiro Hoshina — [On Play] choose up to 1 Soshiro Hoshina on your area and move it to
  // another line.
  reg['UA28BT-KJ8-1-067'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Soshiro Hoshina'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Soshiro Hoshina`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 069 Soshiro Hoshina — [Main][Frontline][1/turn] only if this character attacked earlier this
  // turn and has since become active again (approximation of "was rested this turn"): set this
  // character active.
  reg['UA28BT-KJ8-1-069'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (!unit.rested && unit.attackedThisTurn > 0) { unit.rested = false; log(`${unit.card.name}: Active`); }
      else p.controller.notify?.('เงื่อนไขไม่ครบ');
    },
  };

  // 070 Soshiro Hoshina — [On Play] look at N cards from the top of your deck (N = number of other
  // Soshiro Hoshina on your area), reveal up to 1 Soshiro Hoshina among them and add it to hand,
  // remainder to the bottom; if added, place 1 card from hand to the Outside Area. You may rest 1
  // active Soshiro Hoshina on your Front Line; if you did, set this character active.
  reg['UA28BT-KJ8-1-070'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.name || '').includes('Soshiro Hoshina')).length;
      if (n) {
        const taken = await H.lookTopAndTake(p, n, c => (c.name || '').includes('Soshiro Hoshina'), 1, `${unit.card.name}: ดูการ์ดบนสุด ${n} ใบ`);
        if (taken.length) await H.discardFromHand(p);
      }
      const targets = p.front.filter(u => u !== unit && !u.rested && (u.card.name || '').includes('Soshiro Hoshina'));
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน Soshiro Hoshina?`, [{ label: 'วางนอน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก Soshiro Hoshina');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; unit.rested = false; log(`${unit.card.name}: ${t.card.name} วางนอน — ${unit.card.name} Active`); }
    },
  };

  // 073 "Monster Sweeper Inc." (Field) — [On Play] you may place 1 card from hand to the Outside
  // Area; if you did, add up to 1 (Kafka Hibana or Reno Ichikawa, need<=3) from your Outside Area
  // to your hand.
  reg['UA28BT-KJ8-1-073'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area? (ไม่บังคับ)`);
      if (no == null) return;
      await H.fetchFromSideline(p, c => c && /Kafka Hibana|Reno Ichikawa/.test(c.name || '') && (c.need || 0) <= 3, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
    },
  };

  // 075 "The Promise Of That Day" — choose 1 character on your area and set it active. If the
  // chosen is Kafka Hibana, Kaiju no. 8, or Mina Ashiro, also untap 1 AP.
  reg['UA28BT-KJ8-1-075'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = false; log(`${card.name}: ${t.card.name} Active`);
      if (/Kafka Hibana|Kaiju no\. 8|Mina Ashiro/.test(t.card.name || '')) await H.apUntap(p, 1);
    },
  };

  // 076 "Special Training" — rest 1 active character on your Front Line; if you did, draw 3.
  reg['UA28BT-KJ8-1-076'] = {
    async onEvent(G, p, card) {
      const targets = p.front.filter(u => !u.rested);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character บน Front Line`);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      t.rested = true; log(`${card.name}: ${t.card.name} ถูกวางนอน`);
      Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`);
    },
  };

  // 077 "Clenched Teeth" — choose up to 1 enemy Front Line character, move it to their Energy Line
  // and draw 1 (retire instead if there is a Kafka Hibino or Kaiju no. 8 on your area).
  reg['UA28BT-KJ8-1-077'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (H.hasCardNamed(p, 'Kafka Hibino') || H.hasCardNamed(p, 'Kaiju no. 8')) {
        await Engine.sidelineUnit(enemy, t, 'effect');
        log(`${card.name}: ${t.card.name} ถูก retire`);
      } else {
        await Engine.moveUnitFree(enemy, t, 'energy');
        Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 078 "Fortitude 9.8" — choose up to 1 Kafka Hibino or Kaiju no. 8 on your area, +1000 BP and
  // ([Impact +1] or [Damage +1], player's choice) this turn. Draw 1.
  reg['UA28BT-KJ8-1-078'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => /Kafka Hibino|Kaiju no\. 8/.test(u.card.name || ''));
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        const t = targets.find(x => x.uid === uid);
        if (t) {
          t.bpMod += 1000;
          const v = await p.controller.chooseOption(p, `${card.name}: เลือก`, [{ label: '[Impact +1]', value: 'i' }, { label: '[Damage +1]', value: 'd' }]);
          if (v === 'i') t.tempImpact = (t.tempImpact || 0) + 1; else t.tempDmg = (t.tempDmg || 0) + 1;
          log(`${card.name}: ${t.card.name} +1000 BP และ ${v === 'i' ? '[Impact +1]' : '[Damage +1]'} เทิร์นนี้`);
        }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };
})();
