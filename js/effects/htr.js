// ══════════ UA SIM — Hunter x Hunter (HTR) card-specific effect scripts ══════════
// Generic series-agnostic patterns (draw+discard, look-at-top fetch, BP buff/debuff
// on play, cost reductions, front-line energy generation, cannot-be-chosen immunity,
// etc.) live in js/effects/common.js and already cover a chunk of this set
// automatically. Everything below is HTR-specific logic that needed a bespoke script.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // ---------- small HTR-local helpers ----------

  // debuff targeting ANY opponent character (front OR energy line), not just Front Line —
  // several HTR cards explicitly say "opponent Character"/"opponent's area" rather than
  // "opponent's Front Line".
  async function debuffEnemyAny(p, delta, bpFloor) {
    const enemy = Engine.opponentOf(p);
    const units = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' &&
      !u.kw.untargetable && (bpFloor == null || Engine.bp(u) >= bpFloor));
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู รับ ${delta} BP เทิร์นนี้`, true);
    const u = units.find(x => x.uid === uid);
    if (u) { u.bpMod += delta; log(`${p.name}: ${u.card.name} ${delta} BP เทิร์นนี้`); await Engine.checkBpZero(); }
    return u;
  }

  // "All characters on your area get +/-N BP during this turn." — no target choice.
  function massBuffOwn(p, delta) {
    for (const u of [...p.front, ...p.energy]) if (u.card.type === 'Character') u.bpMod += delta;
    log(`${p.name}: character ทุกใบบนสนาม ${delta > 0 ? '+' : ''}${delta} BP เทิร์นนี้`);
  }

  function distinctNameCount(p, names) {
    const pool = [...p.front, ...p.energy];
    const found = new Set();
    for (const n of names) if (pool.some(u => (u.card.name || '').includes(n))) found.add(n);
    return found.size;
  }

  // ---------- HTR-1 ----------

  // 001 Abengane — choose 1 opponent Field card, send to the bottom of their deck.
  reg['HTR-1-001'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Field');
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก Field ของศัตรูส่งไปใต้เด็ค`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      enemy.energy.splice(enemy.energy.indexOf(t), 1);
      enemy.deck.push(t.no);
      log(`${unit.card.name}: ส่ง ${t.card.name} ไปใต้เด็คของ ${enemy.name}`);
    },
  };

  // 006 Gon Freecss — look top 7, fetch 1 Trait:Specified Slot.
  reg['HTR-1-006'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndTake(p, 7, c => (c.traits || '').includes('Specified Slot'), 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
    },
  };

  // 011 Bisky — [Main][Rest][Retire] fetch Trait:Specified Slot from Outside Area to hand.
  reg['HTR-1-011'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.traits || '').includes('Specified Slot');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มีการ์ด Trait: Specified Slot ใน Outside Area'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือกการ์ด Trait: Specified Slot จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.sidelineUnit(p, unit, 'effect'); // cost: rest + retire this card
      const no = p.sideline[idx]; p.sideline.splice(idx, 1); p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 012 Bisky — reveal hand (auto-reveal all matching, no downside), retire enemy
  // BP<=(count of Trait:Specified Slot with different names on area+hand)*1000.
  reg['HTR-1-012'] = {
    async onPlay(G, p, unit) {
      const pred = c => (c.traits || '').includes('Specified Slot');
      const names = new Set();
      for (const u of [...p.front, ...p.energy]) if (pred(u.card)) names.add(u.card.name);
      for (const no of p.hand) { const c = byNo(no); if (c && pred(c)) names.add(c.name); }
      const limit = names.size * 1000;
      log(`${unit.card.name}: เปิดเผยมือ — นับ Trait:Specified Slot ต่างชื่อ ${names.size} ใบ (BP ${limit} หรือน้อยกว่า)`);
      await H.retireEnemyFront(p, limit);
    },
  };

  // 016 Toraemon — [Main][Rest] stack 1 top-deck card face-down under self.
  // [On Retire] reveal the stack, 1 to hand, rest to Outside Area (uses onBeforeLeaveCounters
  // to intercept before the engine's default counters-to-sideline dump).
  reg['HTR-1-016'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      if (p.deck.length) { unit.counters.push(p.deck.shift()); log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ตัวเอง`); }
    },
    async onBeforeLeaveCounters(G, p, unit, reason) {
      if (reason === 'battle' || !unit.counters.length) return false;
      const idxs = await p.controller.chooseRevealPick(p, unit.counters, `${unit.card.name}: เลือกการ์ดใต้ตัวเอง 1 ใบเข้ามือ`, null, 1);
      const pick = idxs[0];
      const rest = unit.counters.filter((_, i) => i !== pick);
      if (pick != null) { p.hand.push(unit.counters[pick]); log(`${unit.card.name}: เพิ่ม ${byNo(unit.counters[pick])?.name} เข้ามือจากใต้ตัวเอง`); }
      p.sideline.push(...rest);
      unit.counters = [];
      return true;
    },
  };

  // 022 Genthru — draw 1; may place 1 hand card on top of deck, if so bounce enemy BP<=3000.
  reg['HTR-1-022'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไว้บนเด็ค เพื่อคืนการ์ดศัตรู BP≤3000 กลับมือ`);
      if (i == null) return;
      const no = p.hand.splice(i, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} ไว้บนเด็ค`);
      await H.bounceEnemyFront(p, 3000);
    },
  };

  // 024 Sub — look top 4, fetch Trait:Bomber or named Risky Dice, discard 1 if added.
  reg['HTR-1-024'] = {
    async onPlay(G, p, unit) {
      const pred = c => (c.traits || '').includes('Bomber') || (c.name || '').includes('Risky Dice');
      const taken = await H.lookTopAndTake(p, 4, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 025 Bara — [Main][When in Frontline][1/turn] reveal top card; if need>=2, enemy front
  // (BP>=1500) -1000 BP this turn; then scry the revealed card top/bottom.
  reg['HTR-1-025'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.deck.length) return;
      unit._usedTurn = Engine.G.turn;
      const top = byNo(p.deck[0]);
      log(`${unit.card.name}: เปิดเผยการ์ดบนสุด ${top?.name}`);
      if ((top?.need || 0) >= 2) {
        const units = Engine.opponentOf(p).front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) >= 1500);
        if (units.length) {
          const uid = await p.controller.chooseEnemyCharacter(p, units, 'เลือก character ศัตรู (BP≥1500) รับ -1000 BP เทิร์นนี้', true);
          const t = units.find(x => x.uid === uid);
          if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
        }
      }
      await H.scryTop(p, ['top', 'bottom']);
    },
  };

  // 028 Paladin's Necklace — peel the top card off any Raid stack (either player's), send it
  // to Outside Area, reveal the card that was underneath; draw 1.
  reg['HTR-1-028'] = {
    async onEvent(G, p, card) {
      const spots = [];
      for (const pl of [p, Engine.opponentOf(p)]) {
        for (const line of [pl.front, pl.energy]) {
          for (const u of line) if (u.under.length) spots.push({ pl, line, u });
        }
      }
      if (spots.length) {
        const opts = spots.map((s, i) => ({ label: `${s.u.card.name} (${s.pl === p ? 'ของคุณ' : 'ของศัตรู'})`, value: i }));
        const v = await p.controller.chooseOption(p, `${card.name}: เลือกการ์ดในสถานะ Raid ที่จะลอกชั้นบนออก`, opts);
        const s = spots[v];
        if (s) {
          const { pl, line, u } = s;
          const idx = line.indexOf(u);
          const newNo = u.under.shift();
          pl.sideline.push(u.no);
          const newUnit = {
            uid: u.uid, no: newNo, card: byNo(newNo), rested: u.rested, under: u.under,
            counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempDmg: 0, tempGen: 0,
            tempFrontGen: false, frontGenPersist: false, retireAtEndOfMain: false, retireAtEndOfTurn: false,
            noBlock: false, attackedThisTurn: 0, blockedThisTurn: 0, kw: Engine.parseKeywords(byNo(newNo)),
          };
          line[idx] = newUnit;
          log(`${card.name}: ${u.card.name} ถูกส่งไป Outside Area เผย ${newUnit.card.name}`);
        }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 029 Angel's Breath — pay 1 AP flat, play 1 energy-fulfilled Character from Outside Area
  // rested (Raid-from-Outside-Area option not supported by the engine — Play only).
  reg['HTR-1-029'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && Engine.hasEnergyFor(p, c);
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      if (Engine.activeAP(p) < 1) { p.controller.notify?.('AP ไม่พอ'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก Character จาก Outside Area ลงสนาม (rested)`, pred);
      if (idx == null) return;
      if (!Engine.payAP(p, 1)) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      log(`${card.name}: (ตัวเลือก Raid จาก Outside Area ยังไม่รองรับอัตโนมัติ — เล่นแบบ Play เท่านั้น)`);
    },
  };

  // 030 Accompany — move up to 1 own character to the other line; draw 1.
  reg['HTR-1-030'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (units.length) {
        const uid = await p.controller.chooseOwnCharacter(p, units, `${card.name}: เลือก character ย้าย line? (ไม่บังคับ)`, true);
        const t = units.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 031 Jajanken — retire enemy BP<=3000 (or <=5000 with own Gon Freecss).
  reg['HTR-1-031'] = {
    async onEvent(G, p, card) {
      const limit = H.hasCardNamed(p, 'Gon Freecss') ? 5000 : 3000;
      await H.retireEnemyFront(p, limit);
    },
  };

  // 033 Release — AP cost -1 if 3+ Trait:Bomberman cards on area+hand; retire enemy BP<=5000.
  reg['HTR-1-033'] = {
    costMod(p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Bomberman')).length +
        p.hand.filter(no => (byNo(no)?.traits || '').includes('Bomberman')).length;
      return { apDelta: n >= 3 ? -1 : 0 };
    },
    async onEvent(G, p, card) { await H.retireEnemyFront(p, 5000); },
  };

  // 036 Chrollo — look top 4, fetch Trait:Phantom Troupe (not self), discard 1 if added.
  reg['HTR-1-036'] = {
    async onPlay(G, p, unit) {
      const pred = c => (c.traits || '').includes('Phantom Troupe') && c.name !== unit.card.name;
      const taken = await H.lookTopAndTake(p, 4, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 039 Shalnark — play up to 1 Trait:Phantom Troupe (not self, need<=3, ap1) from Outside
  // Area rested; retire it at the beginning of the End Phase.
  reg['HTR-1-039'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Phantom Troupe') &&
        c.name !== 'Shalnark' && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:Phantom Troupe (Energy≤3, AP1) จาก Outside Area`, pred);
      if (idx == null) return;
      const played = await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      if (played) { played.retireAtEndOfTurn = true; log(`${played.card.name}: จะถูก retire ตอนต้น End Phase`); }
    },
  };

  // 040 Nobunaga — if 3+ other Trait:Phantom Troupe on area, enemy front -1000 BP this turn.
  reg['HTR-1-040'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Phantom Troupe')).length;
      if (n >= 3) await H.debuffEnemyFront(p, -1000);
    },
  };

  // 042 Hisoka — choose 1 opponent character, cannot block during this turn (approximates
  // "cannot block on first attack" as "cannot block this turn").
  reg['HTR-1-042'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู ห้าม block เทิร์นนี้ (จำลองแบบง่าย)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noBlock = true; log(`${unit.card.name}: ${t.card.name} ไม่สามารถ block ได้เทิร์นนี้`); }
    },
  };

  // 045 Feltan — enemy front -2000 BP this turn (-3000 if own life <=4).
  reg['HTR-1-045'] = {
    async onPlay(G, p, unit) {
      const delta = p.life.length <= 4 ? -3000 : -2000;
      await H.debuffEnemyFront(p, delta);
    },
  };

  // 046 Franklin — all enemy Front Line characters -500 BP this turn.
  reg['HTR-1-046'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      for (const u of enemy.front) if (u.card.type === 'Character') u.bpMod -= 500;
      log(`${unit.card.name}: ศัตรูทุกตัวบน Front Line -500 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 047 Bonolenov & Kortopi — choose: move 1 character to another line, or swap 1 Front<->Energy pair.
  reg['HTR-1-047'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ย้าย character 1 ใบไปอีก line', value: 'move' },
        { label: 'สลับตำแหน่ง Front Line กับ Energy Line 1 คู่', value: 'swap' },
      ]);
      if (v === 'move') {
        const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (!units.length) return;
        const uid = await p.controller.chooseOwnCharacter(p, units, 'เลือก character ที่จะย้าย line');
        const t = units.find(x => x.uid === uid);
        if (t) await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
      } else {
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
    },
  };

  // 052 Kikyo — [On Retire] look top 3, fetch Trait:Zoldyck.
  reg['HTR-1-052'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Zoldyck'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
    },
  };

  // 055 Silva — mark 1 opponent character; if it retires on your own turn, fetch a
  // Trait:Zoldyck (not Silva) from Outside Area to hand. Uses the generic per-unit watcher hook.
  reg['HTR-1-055'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้จับตาดู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      log(`${unit.card.name}: จับตาดู ${t.card.name} — ถ้า retire ในเทิร์นของคุณจะได้การ์ด Trait:Zoldyck กลับมือ`);
      (t._watchers ||= []).push(async (G2, owner2, unit2) => {
        if (Engine.G.players[Engine.G.active] !== p) return;
        const pred = c => c && (c.traits || '').includes('Zoldyck') && c.name !== 'Silva';
        if (!p.sideline.some(no => pred(byNo(no)))) return;
        await H.fetchFromSideline(p, pred, `${unit.card.name}: เลือกการ์ด Trait:Zoldyck จาก Outside Area`);
      });
    },
  };

  // 057 Zeno — [Main][When in Frontline][Rest] retire enemy front BP<=4000, sent to the
  // opponent's own Removal Area instead of Sideline (genuine "Remove Area" text).
  reg['HTR-1-057'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= 4000);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
      const uid = await p.controller.chooseEnemyCharacter(p, targets, 'เลือก character ศัตรู (BP≤4000) ส่งไป Removal Area ถาวร', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      await Engine.sidelineUnit(enemy, t, 'effect');
      const i = enemy.sideline.lastIndexOf(t.no);
      if (i >= 0) { enemy.sideline.splice(i, 1); enemy.removal.push(t.no); }
      log(`${unit.card.name}: ${t.card.name} ถูก retire และส่งไป Removal Area ถาวร`);
    },
  };

  // 061 The Testing Gate (Field) — [Main][Rest] rest 1 own active character, draw 1 + discard 1;
  // draw 1 more instead if the rested card is BP>=3000.
  reg['HTR-1-061'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => !u.rested && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character ที่ Active'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character (Active) ให้วางนอน', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      t.rested = true;
      Engine.draw(p, 1); log(`${unit.card.name}: วางนอน ${t.card.name} แล้วจั่ว 1 ใบ`);
      await H.discardFromHand(p);
      if (Engine.bp(t) >= 3000) { Engine.draw(p, 1); log(`${unit.card.name}: จั่วเพิ่มอีก 1 ใบ (BP≥3000)`); }
    },
  };

  // 063 Terrifying Speed Knifehand — bare enemy front -2000 BP.
  reg['HTR-1-063'] = { async onEvent(G, p, card) { await H.debuffEnemyFront(p, -2000); } };

  // 064 Spider Tattoo — look top 4, fetch up to 2 Trait:Phantom Troupe.
  reg['HTR-1-064'] = { async onEvent(G, p, card) { await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('Phantom Troupe'), 2, `${card.name}: ดูการ์ดบนสุด 4 ใบ`); } };

  // 065 Skill Hunter — enemy front -3000 BP; if own Chrollo present, re-activate the [On Play]
  // of 1 other Trait:Phantom Troupe character (need<=3) already on the field.
  reg['HTR-1-065'] = {
    async onEvent(G, p, card) {
      await H.debuffEnemyFront(p, -3000);
      if (H.hasCardNamed(p, 'Chrollo')) {
        const targets = [...p.front, ...p.energy].filter(u => (u.card.need || 0) <= 3 &&
          (u.card.traits || '').includes('Phantom Troupe') && u.card.name !== 'Chrollo');
        if (targets.length) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character เพื่อ activate [On Play] อีกครั้ง`, true);
          const t = targets.find(x => x.uid === uid);
          if (t) { log(`${card.name}: activate [On Play] ของ ${t.card.name} อีกครั้ง`); await Effects.onPlay({}, p, t); }
        }
      }
    },
  };

  // 066 Dragon Head — retire enemy BP<=3000 (or <=5000 if 3+ Trait:Zoldyck on own area).
  reg['HTR-1-066'] = {
    async onEvent(G, p, card) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Zoldyck')).length;
      await H.retireEnemyFront(p, n >= 3 ? 5000 : 3000);
    },
  };

  // 067 Bungee Gum — fetch 1 Character from Outside Area to hand.
  reg['HTR-1-067'] = { async onEvent(G, p, card) { await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก Character จาก Outside Area เข้ามือ`); } };

  // 072 Kurapika — passive: +1000 BP if total energy generation is 6 or more.
  reg['HTR-1-072'] = {
    bpBonus(p, unit) {
      const gen = Engine.energyGen(p);
      const total = Object.values(gen).reduce((a, b) => a + b, 0);
      return total >= 6 ? 1000 : 0;
    },
  };

  // 077 / UA03PB-1-077 Gon Freecss — [On Play][When in Frontline] retire enemy front
  // BP<=(count of other own characters)*1000.
  function gonFreecss077() {
    return {
      async onPlay(G, p, unit) {
        if (!p.front.includes(unit)) return;
        const n = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character').length;
        await H.retireEnemyFront(p, n * 1000);
      },
    };
  }
  reg['HTR-1-077'] = gonFreecss077();
  reg['UA03PB-HTR-1-077'] = gonFreecss077();

  // 083 Tonpa / 2-067 Squala — debuff any opponent character (BP>=1500) -1000 BP this turn.
  reg['HTR-1-083'] = { async onPlay(G, p, unit) { await debuffEnemyAny(p, -1000, 1500); } };
  reg['HTR-2-067'] = { async onPlay(G, p, unit) { await debuffEnemyAny(p, -1000, 1500); } };

  // 091 Leorio — fetch 1 green Character from Outside Area to hand.
  reg['HTR-1-091'] = { async onPlay(G, p, unit) { await H.fetchFromSideline(p, c => c && c.color === 'Green' && c.type === 'Character', `${unit.card.name}: เลือก Character สีเขียวจาก Outside Area`); } };

  // 093 Hisoka — [1/turn] draw 1 on winning a battle (the [Main][Pay 1 AP] "opponent must
  // block" sub-ability isn't auto-enforced — the engine has no forced-block mechanism).
  reg['HTR-1-093'] = {
    async onWinBattle(G, p, atk, enemy, defender) {
      if (atk._wonThisTurn !== Engine.G.turn) {
        atk._wonThisTurn = Engine.G.turn;
        Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ (ชนะ battle)`);
      }
      await Engine.sidelineUnit(enemy, defender, 'battle');
      log(`${defender.card.name}: แพ้ battle → Sideline`);
      return true;
    },
  };

  // 094 Killua Zoldyck — combined menu for its two independent [Main] abilities (BP floor
  // never goes below 0 anyway via Engine.bp's own clamp, so that clause needs no code).
  reg['HTR-1-094'] = {
    async onMain(G, p, unit) {
      const opts = [];
      if (Engine.bp(unit) >= 4000 && unit._standUsedTurn !== Engine.G.turn) opts.push({ label: 'Active ตัวเอง (ใช้ได้เมื่อ BP≥4000)', value: 'stand' });
      if (!unit.rested) opts.push({ label: '[Rest] เลือก character ศัตรู (BP≥1500) -1000 BP เทิร์นนี้', value: 'debuff' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      if (v === 'stand') { unit.rested = false; unit._standUsedTurn = Engine.G.turn; log(`${unit.card.name}: Active ตัวเอง (BP≥4000)`); }
      else if (v === 'debuff') { unit.rested = true; await debuffEnemyAny(p, -1000, 1500); }
    },
  };

  // 095 Heaven Arena (Field) — [1/turn] draw 1 whenever ANY of your own characters wins a
  // battle (not tied to the attacker's own card no — uses the generic onAnyWinBattle hook).
  reg['HTR-1-095'] = {
    async onAnyWinBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn) return;
      self._usedTurn = Engine.G.turn;
      Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ (character ของคุณชนะ battle)`);
    },
  };

  // 096 Emperor Time — choose 1 own character, +3000 BP and a temporary "draw 1 on winning a
  // battle" grant this turn (the Kurapika-only bonus <Sniper> grant isn't auto-applied).
  reg['HTR-1-096'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, `${card.name}: เลือก character รับ +3000 BP และจั่วเมื่อชนะ battle เทิร์นนี้`, true);
      const t = units.find(x => x.uid === uid);
      if (!t) return;
      t.bpMod += 3000;
      t._grantedOnWinDraw = true;
      log(`${card.name}: ${t.card.name} +3000 BP และได้ "ชนะ battle แล้วจั่ว 1 ใบ" เทิร์นนี้`);
      if ((t.card.name || '').includes('Kurapika')) log(`${card.name}: (โบนัส <Sniper> ให้ Kurapika ยังไม่รองรับอัตโนมัติ)`);
    },
  };

  // 097 Fishing Rod — bounce (or retire, with own Gon Freecss) enemy front BP<=own highest BP.
  reg['HTR-1-097'] = {
    async onEvent(G, p, card) {
      const mine = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!mine.length) return;
      const maxBP = Math.max(...mine.map(u => Engine.bp(u)));
      if (H.hasCardNamed(p, 'Gon Freecss')) await H.retireEnemyFront(p, maxBP);
      else await H.bounceEnemyFront(p, maxBP);
    },
  };

  // 098 Two-choices Quiz — opponent chooses whether to retire 1 of 2 marked characters;
  // if they decline, draw 1 and untap 1 AP.
  reg['HTR-1-098'] = {
    async onEvent(G, p, card) {
      const enemy = Engine.opponentOf(p);
      const frontTargets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      const energyTargets = enemy.energy.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!frontTargets.length && !energyTargets.length) return;
      const uidF = frontTargets.length ? await p.controller.chooseEnemyCharacter(p, frontTargets, `${card.name}: เลือก character ศัตรูบน Front Line`, true) : null;
      const uidE = energyTargets.length ? await p.controller.chooseEnemyCharacter(p, energyTargets, `${card.name}: เลือก character ศัตรูบน Energy Line`, true) : null;
      const chosen = [frontTargets.find(u => u.uid === uidF), energyTargets.find(u => u.uid === uidE)].filter(Boolean);
      if (!chosen.length) return;
      const opts = [{ label: 'ไม่ retire', value: null }, ...chosen.map(u => ({ label: `Retire ${u.card.name}`, value: u.uid }))];
      const v = await enemy.controller.chooseOption(enemy, `${p.name} ใช้ ${card.name}: จะ retire ตัวไหนไหม?`, opts);
      if (v != null) {
        const t = chosen.find(u => u.uid === v);
        await Engine.sidelineUnit(enemy, t, 'effect');
        log(`${card.name}: ${enemy.name} เลือก retire ${t.card.name}`);
      } else {
        Engine.draw(p, 1); log(`${card.name}: ${enemy.name} ไม่ retire — ${p.name} จั่ว 1 ใบ`);
        await H.apUntap(p, 1);
      }
    },
  };

  // 100 Water Divination Test — look top 2 (pure reorder, no real choice impact), draw 2.
  reg['HTR-1-100'] = {
    async onEvent(G, p, card) {
      log(`${card.name}: ดูการ์ดบนสุด 2 ใบแล้วจัดเรียงใหม่ (ลำดับเดิม)`);
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
    },
  };

  // 106 Killua Zoldyck — retire enemy front BP<=(highest BP among own other characters).
  reg['HTR-1-106'] = {
    async onPlay(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) return;
      const maxBP = Math.max(...others.map(u => Engine.bp(u)));
      await H.retireEnemyFront(p, maxBP);
    },
  };

  // 109 Ging's Photo — look top 5, fetch up to 1 Character; draw 1 more if it was Gon Freecss.
  reg['HTR-1-109'] = {
    async onEvent(G, p, card) {
      const taken = await H.lookTopAndTake(p, 5, c => c.type === 'Character', 1, `${card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.some(no => (byNo(no)?.name || '').includes('Gon Freecss'))) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ (เจอ Gon Freecss)`); }
    },
  };

  // ---------- HTR-2 ----------

  // 001 Abengane — choose: opponent sends 2 Outside-Area cards to Remove Area, OR retire an
  // opponent Field card (gen<=1) and they draw 1.
  reg['HTR-2-001'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'ศัตรูส่งการ์ด 2 ใบจาก Outside Area ไป Remove Area', value: 'discard' },
        { label: 'Retire Field การ์ดศัตรู (gen≤1) แล้วศัตรูจั่ว 1 ใบ', value: 'retire' },
      ]);
      if (v === 'discard') {
        const n = Math.min(2, enemy.sideline.length);
        for (let i = 0; i < n; i++) enemy.removal.push(enemy.sideline.pop());
        log(`${unit.card.name}: ${enemy.name} ส่ง ${n} ใบจาก Outside Area ไป Remove Area`);
      } else {
        const targets = enemy.energy.filter(u => u.card.type === 'Field' && !u.kw.untargetable && (u.card.gen || 0) <= 1);
        if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมาย'); return; }
        const uid = await p.controller.chooseEnemyCharacter(p, targets, 'เลือก Field ศัตรู (gen≤1) ให้ retire', true);
        const t = targets.find(x => x.uid === uid);
        if (t) { await Engine.sidelineUnit(enemy, t, 'effect'); Engine.draw(enemy, 1); log(`${unit.card.name}: retire ${t.card.name} — ${enemy.name} จั่ว 1 ใบ`); }
      }
    },
  };

  // 005 Razor — passive [Your Turn]: +1000 BP if (Trait:Nen Beast count + total face-down
  // cards under own characters) >= 2.
  reg['HTR-2-005'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      const pool = [...p.front, ...p.energy];
      const nenBeasts = pool.filter(u => (u.card.traits || '').includes('Nen Beast')).length;
      const faceDown = pool.reduce((sum, u) => sum + (u.counters?.length || 0) + (u.under?.length || 0), 0);
      return (nenBeasts + faceDown) >= 2 ? 1000 : 0;
    },
  };

  // 009 No.13 — +1000 BP per own face-down counter [Your Turn]; [On Play] stack 1
  // Trait:Nen Beast from Outside Area face-down under self.
  reg['HTR-2-009'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (unit.counters?.length || 0) * 1000;
    },
    async onPlay(G, p, unit) {
      const pred = c => c && (c.traits || '').includes('Nen Beast');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Trait:Nen Beast จาก Outside Area วางคว่ำใต้ตัวเอง`, pred);
      if (idx == null) return;
      const no = p.sideline.splice(idx, 1)[0];
      unit.counters.push(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} คว่ำใต้ตัวเอง`);
    },
  };

  // 010 No.0 — same counter-BP passive; [On Play] look top 5 fetch Nen Beast/Dodgeball Coat, discard 1.
  reg['HTR-2-010'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (unit.counters?.length || 0) * 1000;
    },
    async onPlay(G, p, unit) {
      const pred = c => (c.traits || '').includes('Nen Beast') || (c.name || '').includes('Dodgeball Coat');
      const taken = await H.lookTopAndTake(p, 5, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 5 ใบ`);
      if (taken.length) await H.discardFromHand(p);
    },
  };

  // 011 Razor's Nen beasts — same counter-BP passive (deck-limit-14 clause is a deckbuilder
  // rule, not enforced here); [On Retire] may slot itself as a face-down counter under another
  // Trait:Nen Beast instead of going to Outside Area.
  reg['HTR-2-011'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return (unit.counters?.length || 0) * 1000;
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Nen Beast'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: วางใต้ Trait:Nen Beast ใบไหนคว่ำ? (ไม่บังคับ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const i = p.sideline.lastIndexOf(unit.no);
      if (i >= 0) { p.sideline.splice(i, 1); t.counters.push(unit.no); log(`${unit.card.name}: ถูกวางคว่ำใต้ ${t.card.name} แทนที่จะไป Outside Area`); }
    },
  };

  // 018 Tsezguerra — +500 BP to all own characters on play, and again via a paid [Main] ability.
  reg['HTR-2-018'] = {
    async onPlay(G, p, unit) { massBuffOwn(p, 500); },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      massBuffOwn(p, 500);
    },
  };

  // 021 Bisky — draw 1 on play; [Main][Rest][Retire] draw 1.
  reg['HTR-2-021'] = {
    async onPlay(G, p, unit) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); },
    async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ (retire ตัวเอง)`); },
  };

  // 022 Hisoka — passive +1000 BP if own Gon Freecss AND own Killua Zoldyck both present.
  reg['HTR-2-022'] = {
    bpBonus(p, unit) {
      const pool = [...p.front, ...p.energy];
      const has = n => pool.some(u => (u.card.name || '').includes(n));
      return (has('Gon Freecss') && has('Killua Zoldyck')) ? 1000 : 0;
    },
  };

  // 023 Hisoka — [1/turn] when a character on your area loses a battle, may set this character active.
  reg['HTR-2-023'] = {
    async onAnyLoseBattle(G, p, atk, enemy, defender, self) {
      if (self._usedTurn === Engine.G.turn || !self.rested) return;
      self._usedTurn = Engine.G.turn;
      self.rested = false;
      log(`${self.card.name}: เป็น Active (character ของคุณแพ้ battle)`);
    },
  };

  // 025 Black Goreinu — choose 1 enemy Front Line character; opponent moves it to Energy Line
  // (or swaps it with 1 of their Energy Line characters if Energy Line is full).
  reg['HTR-2-025'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้ย้ายไป Energy Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if (enemy.energy.length < 4) {
        await Engine.moveUnitFree(enemy, t, 'energy');
      } else {
        const energyTargets = enemy.energy.filter(u => u.card.type === 'Character');
        if (!energyTargets.length) return;
        const uid2 = await enemy.controller.chooseOwnCharacter(enemy, energyTargets, `สลับตำแหน่งกับ ${t.card.name}?`);
        const e = energyTargets.find(x => x.uid === uid2);
        if (e) {
          const iF = enemy.front.indexOf(t), iE = enemy.energy.indexOf(e);
          enemy.front[iF] = e; enemy.energy[iE] = t;
          log(`${unit.card.name}: สลับ ${t.card.name} กับ ${e.card.name}`);
        }
      }
    },
  };

  // 030 Dodgeball court (Field) — combined menu for its two independent [Main] abilities.
  reg['HTR-2-030'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.traits || '').includes('Nen Beast');
      const nenOnField = [...p.front, ...p.energy].filter(u => u !== unit && pred(u.card));
      const opts = [];
      if (p.sideline.some(no => pred(byNo(no))) && nenOnField.length) opts.push({ label: 'วาง Nen Beast จาก Outside Area คว่ำใต้ Nen Beast บนสนาม', value: 'stack' });
      if (p.sideline.some(no => pred(byNo(no))) && p.hand.length && Engine.activeAP(p) >= 1) opts.push({ label: '[Discard 1][Pay 1 AP] เล่น Nen Beast จาก Outside Area ลงสนาม (rested)', value: 'play' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      unit.rested = true;
      if (v === 'stack') {
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Nen Beast จาก Outside Area', pred);
        if (idx == null) return;
        const no = p.sideline.splice(idx, 1)[0];
        const uid = await p.controller.chooseOwnCharacter(p, nenOnField, 'วางคว่ำใต้ Nen Beast ใบไหน');
        const t = nenOnField.find(x => x.uid === uid);
        if (t) { t.counters.push(no); log(`${unit.card.name}: วาง ${byNo(no)?.name} คว่ำใต้ ${t.card.name}`); }
        else p.sideline.push(no);
      } else if (v === 'play') {
        if (!Engine.payAP(p, 1)) { p.controller.notify?.('AP ไม่พอ'); return; }
        await H.discardFromHand(p);
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Nen Beast จาก Outside Area ลงสนาม', pred);
        if (idx == null) return;
        await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 031 Combine — conditional draw/buff/AP-untap bundle keyed on named own characters.
  reg['HTR-2-031'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Gon Freecss')) await H.buffOwnCharacter(p, 2000);
      if (H.hasCardNamed(p, 'Killua Zoldyck')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
      if (H.hasCardNamed(p, 'Hisoka')) await H.apUntap(p, 1);
    },
  };

  // 033 Vertical Jump — bounce 1 own character, untap 1 AP; draw 1 more if it was Tsezguerra.
  reg['HTR-2-033'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, `${card.name}: เลือก character กลับมือ`, true);
      const t = units.find(x => x.uid === uid);
      if (!t) return;
      const wasTsezguerra = (t.card.name || '').includes('Tsezguerra');
      await Engine.returnUnitToHand(p, t);
      log(`${card.name}: ${t.card.name} กลับมือ`);
      await H.apUntap(p, 1);
      if (wasTsezguerra) { Engine.draw(p, 1); log(`${card.name}: จั่วเพิ่ม 1 ใบ (Tsezguerra)`); }
    },
  };

  // 035 Back — play up to 1 Trait:Razor Capture Team/named Razor from Outside Area rested
  // (the "cannot use if <Back> already in Outside Area" gate and the self-redirect-to-Removal
  // clause aren't enforced — Raid-from-Outside-Area also not supported by the engine).
  reg['HTR-2-035'] = {
    async onEvent(G, p, card) {
      const pred = c => c && ((c.traits || '').includes('Razor Capture Team') || (c.name || '').includes('Razor')) && Engine.hasEnergyFor(p, c);
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      if (Engine.activeAP(p) < 1) { p.controller.notify?.('AP ไม่พอ'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือกการ์ด Trait:Razor Capture Team หรือ Razor จาก Outside Area`, pred);
      if (idx == null) return;
      if (!Engine.payAP(p, 1)) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      log(`${card.name}: (ตัวเลือก Raid จาก Outside Area ยังไม่รองรับอัตโนมัติ — เล่นแบบ Play เท่านั้น)`);
    },
  };

  // 037 Razor and the 14 Devils — look top 5, fetch up to 2 Trait:Nen Beast/named Razor.
  reg['HTR-2-037'] = {
    async onEvent(G, p, card) {
      const pred = c => (c.traits || '').includes('Nen Beast') || (c.name || '').includes('Razor');
      await H.lookTopAndTake(p, 5, pred, 2, `${card.name}: ดูการ์ดบนสุด 5 ใบ`);
    },
  };

  // 039 Bubble Horse — [On Block] +3000 BP this turn if the attacker's BP is 4500 or higher.
  reg['HTR-2-039'] = {
    async onBlock(G, p, unit, atkUnit) {
      if (atkUnit && Engine.bp(atkUnit) >= 4500) { unit.bpMod += 3000; log(`${unit.card.name}: +3000 BP เทิร์นนี้ (บล็อกตัวที่ BP≥4500)`); await Engine.checkBpZero(); }
    },
  };

  // 040 Bisky — passive +1000 BP [Your Turn] if a Trait:Specified Slot card was played from
  // hand this turn (the "cannot be blocked by BP>=4000" grant isn't auto-enforced).
  reg['HTR-2-040'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p._playedTraitsThisTurn?.has('specified slot') ? 1000 : 0;
    },
  };

  // 042 Motaricke — [On Retire] look top 7, fetch a Field card.
  reg['HTR-2-042'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.lookTopAndTake(p, 7, c => c.type === 'Field', 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
    },
  };

  // 043 Killua Zoldyck — [Main][When in Frontline][1/turn], gated on having played a
  // Trait:Specified Slot card from hand this turn: set 1 other own character active.
  reg['HTR-2-043'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._playedTraitsThisTurn?.has('specified slot')) { p.controller.notify?.('ต้องเล่นการ์ด Trait:Specified Slot จากมือในเทิร์นนี้ก่อน'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มี character ที่นอนอยู่'); return; }
      unit._usedTurn = Engine.G.turn;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 047 Mimicry — may discard 1 to Removal, then draw 1 and play a Trait:Specified Slot
  // Character/Field from Outside Area to the Energy Line active.
  reg['HTR-2-047'] = {
    async onEvent(G, p, card) {
      if (p.energy.length >= 4) { log(`${card.name}: ไม่มีที่ว่างบน Energy Line — ใช้การ์ดนี้ไม่ได้`); return; }
      if (!p.hand.length) return;
      const i = await p.controller.chooseCardFromHand(p, `${card.name}: ทิ้ง 1 ใบไป Remove Area เพื่อจั่ว 1 ใบ และเล่น Trait:Specified Slot จาก Outside Area?`);
      if (i == null) return;
      p.removal.push(p.hand.splice(i, 1)[0]);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const pred = c => c && (c.traits || '').includes('Specified Slot') && (c.type === 'Character' || c.type === 'Field');
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Specified Slot จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 048 Second coming — bounce 1 own character; if so, draw 2.
  reg['HTR-2-048'] = {
    async onEvent(G, p, card) {
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, `${card.name}: เลือก character กลับมือ`, true);
      const t = units.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      Engine.draw(p, 2); log(`${card.name}: ${t.card.name} กลับมือ แล้วจั่ว 2 ใบ`);
    },
  };

  // 050 Chrollo — look top 4, fetch Trait:Phantom Troupe, discard 1 if added; if the discarded
  // card was Trait:Phantom Troupe (not self, need<=3), flashback-activate its [On Play].
  reg['HTR-2-050'] = {
    async onPlay(G, p, unit) {
      const pred = c => (c.traits || '').includes('Phantom Troupe');
      const taken = await H.lookTopAndTake(p, 4, pred, 1, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (!taken.length) return;
      const discardedNo = await H.discardFromHand(p);
      if (!discardedNo) return;
      const c = byNo(discardedNo);
      if (c && (c.traits || '').includes('Phantom Troupe') && c.name !== 'Chrollo' && (c.need || 0) <= 3) {
        log(`${unit.card.name}: activate [On Play] ของ ${c.name} อีกครั้ง (จากการ์ดที่ถูกทิ้ง)`);
        const flashUnit = { no: discardedNo, card: c, rested: false, under: [], counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempDmg: 0, tempGen: 0 };
        await Effects.onPlay(G, p, flashUnit);
      }
    },
  };

  // 051 Kortopi — may reveal 1 Trait:Phantom Troupe from hand; if so, fetch 1 same-named card
  // from Outside Area to the top of the deck.
  reg['HTR-2-051'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('Phantom Troupe'));
      if (idx < 0) return;
      const revealedName = byNo(p.hand[idx])?.name;
      log(`${unit.card.name}: เปิดเผย ${revealedName}`);
      const pred = c => c && c.name === revealedName;
      const sidx = await p.controller.chooseCardFromSideline(p, `เลือกการ์ดชื่อเดียวกับ ${revealedName} จาก Outside Area วางบนเด็ค`, pred);
      if (sidx == null) return;
      const no = p.sideline.splice(sidx, 1)[0];
      p.deck.unshift(no);
      log(`${unit.card.name}: วาง ${byNo(no)?.name} ไว้บนสุดของเด็ค`);
    },
  };

  // 053 Nobunaga & Machi — [On Retire] enemy front -1000 BP this turn (the granted
  // "cannot be chosen by opponent's Event Card" aura for teammates isn't auto-applied — that's
  // a field-wide protection granted to OTHER units, not this card's own immunity).
  reg['HTR-2-053'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.debuffEnemyFront(p, -1000);
    },
  };

  // 054 Hisoka — if opponent has 3+ hand cards, they discard 1 to Outside Area.
  reg['HTR-2-054'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (enemy.hand.length < 3) return;
      const i = await enemy.controller.chooseCardFromHand(enemy, `${unit.card.name}: เลือกการ์ดจากมือไป Outside Area`);
      if (i == null) return;
      const no = enemy.hand.splice(i, 1)[0];
      enemy.sideline.push(no);
      log(`${unit.card.name}: ${enemy.name} ส่ง ${byNo(no)?.name} ไป Outside Area`);
    },
  };

  // 055 Illumi — if 3+ Trait:Zoldyck Family on own area, choose 1 enemy front character +1000 BP
  // this turn (the "must block if able" grant isn't auto-enforced).
  reg['HTR-2-055'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Zoldyck Family')).length;
      if (n < 3) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู +1000 BP (บังคับ block เทิร์นนี้ ยังไม่รองรับอัตโนมัติ)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 058 Killua Zoldyck — bare enemy front -1000 BP.
  reg['HTR-2-058'] = { async onPlay(G, p, unit) { await H.debuffEnemyFront(p, -1000); } };

  // 060 Family Vows — look top 4, fetch up to 2 Trait:Zoldyck Family.
  reg['HTR-2-060'] = { async onEvent(G, p, card) { await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('Zoldyck Family'), 2, `${card.name}: ดูการ์ดบนสุด 4 ใบ`); } };

  // 061 Requiem — draw 2, discard 1; if own Outside Area has Uvogin, all enemy Front Line -1000 BP.
  reg['HTR-2-061'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 2); log(`${card.name}: จั่ว 2 ใบ`);
      await H.discardFromHand(p);
      if (p.sideline.some(no => (byNo(no)?.name || '').includes('Uvogin'))) {
        const enemy = Engine.opponentOf(p);
        for (const u of enemy.front) if (u.card.type === 'Character') u.bpMod -= 1000;
        log(`${card.name}: ศัตรูทุกตัวบน Front Line -1000 BP เทิร์นนี้ (มี Uvogin ใน Outside Area)`);
        await Engine.checkBpZero();
      }
    },
  };

  // 062 Wing — [Main][When in Frontline][Discard 1][1/turn] choose 1 other own character +1000 BP.
  reg['HTR-2-062'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
    },
  };

  // 063 Kastro — may pay 1 AP to play another Kastro from Outside Area active (the "only if
  // played from hand, not Raided" gate is approximated as always-allowed).
  reg['HTR-2-063'] = {
    async onPlay(G, p, unit) {
      if (Engine.activeAP(p) < 1) return;
      const pred = c => c && (c.name || '').includes('Kastro');
      if (!p.sideline.some(no => pred(byNo(no)))) return;
      if (!Engine.payAP(p, 1)) return;
      const idx = await p.controller.chooseCardFromSideline(p, `${unit.card.name}: เลือก Kastro จาก Outside Area ลงสนาม (Active)`, pred);
      if (idx == null) return;
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
    },
  };

  // 065 Kurapika — tiered abilities based on distinct-named Gon/Killua/Leorio on own area:
  // 1+: [On Play] rest enemy front (BP<=2500 or Trait:Phantom Troupe). 2+: [When Attacking]
  // draw 1 + discard 1.
  reg['HTR-2-065'] = {
    async onPlay(G, p, unit) {
      if (distinctNameCount(p, ['Gon Freecss', 'Killua Zoldyck', 'Leorio']) < 1) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable &&
        (Engine.bp(u) <= 2500 || (u.card.traits || '').includes('Phantom Troupe')));
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรูให้วางนอน`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
    async onAttack(G, p, unit) {
      if (distinctNameCount(p, ['Gon Freecss', 'Killua Zoldyck', 'Leorio']) < 2) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      await H.discardFromHand(p);
    },
  };

  // 070 Leorio — tiered: 1+ distinct Gon/Killua/Kurapika grants front-line energy generation;
  // 3+ grants +1000 BP [Your Turn].
  reg['HTR-2-070'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return distinctNameCount(p, ['Gon Freecss', 'Killua Zoldyck', 'Kurapika']) >= 3 ? 1000 : 0;
    },
    frontGenBonus(p, unit) {
      return distinctNameCount(p, ['Gon Freecss', 'Killua Zoldyck', 'Kurapika']) >= 1;
    },
  };

  // 073 Constraints and Covenants — all own characters +1000 BP this turn (the "discard any
  // number for +500 BP each" optional add-on isn't automated — the bot conservatively skips it).
  reg['HTR-2-073'] = {
    async onEvent(G, p, card) {
      massBuffOwn(p, 1000);
      log(`${card.name}: (ตัวเลือก "ทิ้งการ์ดเพิ่มเพื่อ +500 BP ต่อใบ" ยังไม่รองรับอัตโนมัติ — ข้าม)`);
    },
  };

  // ---------- promo / UAPR ----------

  // UAPR-HTR-2-074 Killua Zoldyck — [Main][1/turn], gated on own Gon Freecss on Front Line:
  // swap with 1 character on the other line, +2000 BP this turn.
  reg['UAPR-HTR-2-074'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.front.some(u => (u.card.name || '').includes('Gon Freecss'))) { p.controller.notify?.('ต้องมี Gon Freecss บน Front Line'); return; }
      const otherLine = p.front.includes(unit) ? p.energy : p.front;
      const targets = otherLine.filter(u => u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character อีก line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character อีก line เพื่อสลับตำแหน่ง');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      const myLine = p.front.includes(unit) ? p.front : p.energy;
      const iMe = myLine.indexOf(unit), iT = otherLine.indexOf(t);
      myLine[iMe] = t; otherLine[iT] = unit;
      unit.bpMod += 2000;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name} และรับ +2000 BP เทิร์นนี้`);
    },
  };

  // UAPR-HTR-2-076 Illumi — when Raided, mark 1 opponent character; if it retires later this
  // turn, draw 1 (uses the generic per-unit watcher hook, scoped to the current turn number).
  reg['UAPR-HTR-2-076'] = {
    async onRaided(G, p, targetNo, raiderUnit) {
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, 'Illumi ถูก Raid — เลือก character ศัตรู (ถ้า retire เทิร์นนี้จะได้จั่ว 1 ใบ)', true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      const turnMarked = Engine.G.turn;
      (t._watchers ||= []).push(async () => {
        if (Engine.G.turn !== turnMarked) return;
        Engine.draw(p, 1); log(`Illumi: ${t.card.name} ถูก retire ในเทิร์นนี้ — จั่ว 1 ใบ`);
      });
      log(`Illumi: จับตาดู ${t.card.name} เทิร์นนี้`);
    },
  };

  // UAPR-HTR-2-077 Kurapika — [Main][Discard 1][1/turn] gain front-line energy generation this
  // turn; [When Attacking] draw up to 1 if total energy generation is 6+.
  reg['UAPR-HTR-2-077'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.tempFrontGen = true;
      log(`${unit.card.name}: ได้ front-line energy generation เทิร์นนี้`);
    },
    async onAttack(G, p, unit) {
      const gen = Engine.energyGen(p);
      const total = Object.values(gen).reduce((a, b) => a + b, 0);
      if (total >= 6) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ (energy generation ≥6)`); }
    },
  };

  // UAPR-HTR-P-001 Gon Freecss — [When Attacking] if 4+ distinct-named Trait:Specified Slot
  // cards on area+hand (auto-reveal all matching), choose 1 own character for [Impact +1] this turn.
  reg['UAPR-HTR-P-001'] = {
    async onAttack(G, p, unit) {
      const names = new Set();
      for (const u of [...p.front, ...p.energy]) if ((u.card.traits || '').includes('Specified Slot')) names.add(u.card.name);
      for (const no of p.hand) { const c = byNo(no); if (c && (c.traits || '').includes('Specified Slot')) names.add(c.name); }
      if (names.size < 4) return;
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, `${unit.card.name}: เลือก character รับ [Impact +1] เทิร์นนี้`, true);
      const t = units.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // UAPR-HTR-P-002 Killua Zoldyck — [When Attacking] +1000 BP if a character was retired this
  // turn (approximated as "any" retirement, not opponent-specific); [Main][1/turn] gated the
  // same way: move this character to the other line.
  reg['UAPR-HTR-P-002'] = {
    async onAttack(G, p, unit) {
      if (Engine.G.retiredThisTurn) { unit.bpMod += 1000; log(`${unit.card.name}: +1000 BP เทิร์นนี้ (มีการ์ด retire เทิร์นนี้)`); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.G.retiredThisTurn) { p.controller.notify?.('ต้องมีการ์ด retire ในเทิร์นนี้ก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, unit, p.front.includes(unit) ? 'energy' : 'front');
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Skipped (too narrow/architecturally risky for the current hook system):
  //  • 2-024 Hisoka — reactive "opponent must discard when targeting my named units" punishment
  //  • 2-026 White Goreinu — substitute-retire-for-another-unit reactive replacement
  //  • 2-046 Out-!! — rewrites another specific card's own [Main] target selection
  //  • 2-068 Zushi — "when this gets a BP increase, gain more BP" (self-referential loop risk)
  // ────────────────────────────────────────────────────────────────────────
})();
