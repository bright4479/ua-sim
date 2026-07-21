// ══════════ UA SIM — Solo Leveling (SLG) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. SLG's wording
// style spells numbers out ("a card", "one character") and uses "sideline"/
// "Outside Area" as verbs — normalizeFx + the retire-conditional matcher were
// extended to handle both (see common.js). Card-specific mechanics here lean on
// Trait:Shadow Army / Fourth Jeju Island Raid / Japanese Hunters field-count
// synergy and several "rest a support unit when a teammate attacks" reactions.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // 001 Han Song-yi — passive +500 BP if 5+ own Outside Area cards.
  reg['UA51BT-SLG-1-001'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.sideline.length >= 5 ? 500 : 0;
    },
  };

  // 002 Han Song-yi — choose: draw 1 + discard 1, or (on your turn) buff another +1000 this turn.
  reg['UA51BT-SLG-1-002'] = {
    async onPlay(G, p, unit) {
      const myTurn = Engine.G.players[Engine.G.active] === p;
      const opts = [{ label: 'จั่ว 1 ใบ แล้วทิ้ง 1 ใบ', value: 'draw' }];
      if (myTurn) opts.push({ label: 'character อื่น +1000 BP เทิร์นนี้', value: 'buff' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'buff') await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      else { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 003 Han Song-yi — [When Attacking] scry the top card. (The reactive "when THIS card is
  // fetched from Outside Area by one of your abilities" grant and its conditional energy
  // generation aren't automated — no generic hook watches for a specific card being fetched.)
  reg['UA51BT-SLG-1-003'] = {
    async onAttack(G, p, unit) { await H.scryTop(p, ['top', 'outside']); },
  };

  // 009 Cha Hae-in — [Main][Discard 1][1/turn] +1500 BP this turn.
  reg['UA51BT-SLG-1-009'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      unit.bpMod += 1500;
      log(`${unit.card.name}: +1500 BP เทิร์นนี้`);
    },
  };

  // 010 Cha Hae-in — passive +1000 BP if 10+ own Outside Area cards.
  reg['UA51BT-SLG-1-010'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return p.sideline.length >= 10 ? 1000 : 0;
    },
  };

  // 011 Cha Hae-in — [On Play] mill top card to Outside Area. (The reactive fetch-trigger and its
  // conditional "cannot be blocked by BP>=4000" grant aren't automated — same class of gap as 003.)
  reg['UA51BT-SLG-1-011'] = {
    async onPlay(G, p, unit) {
      if (p.deck.length) { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
    },
  };

  // 012 Go Gunhee — draw 1 if own Sung Jinwoo present.
  reg['UA51BT-SLG-1-012'] = {
    async onPlay(G, p, unit) { if (H.hasCardNamed(p, 'Sung Jinwoo')) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } },
  };

  // 014 Park Kyunghye — [On Play] mill top card to Outside Area. (Reactive fetch-trigger and the
  // Front-Line placement restriction aren't automated.)
  reg['UA51BT-SLG-1-014'] = {
    async onPlay(G, p, unit) {
      if (p.deck.length) { p.sideline.push(p.deck.shift()); log(`${unit.card.name}: ส่งการ์ดบนสุดของเด็คไป Outside Area`); }
    },
  };

  // 019 Sung Jinwoo — [On Play] may discard a Trait:Shadow Army card from hand to draw 1.
  // (The "[Main][When in Outside Area]" self-fetch ability isn't automated — abilities usable
  // while a card sits off the field have no menu/hook in this engine.)
  reg['UA51BT-SLG-1-019'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => (byNo(no)?.traits || '').includes('Shadow Army'));
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ทิ้งการ์ด Trait:Shadow Army จากมือเพื่อจั่ว 1 ใบ?`,
        [{ label: 'ทิ้ง', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { p.sideline.push(p.hand.splice(idx, 1)[0]); Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 024 Kang Taeshik — static "cannot be blocked by BP>=4000" already handled by kw.unblockableBPMin.
  // [On Retire] the OPPONENT chooses one of their own characters to grant the same immunity this turn.
  reg['UA51BT-SLG-1-024'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      const enemy = Engine.opponentOf(p);
      const targets = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await enemy.controller.chooseOwnCharacter(enemy, targets, `${unit.card.name}: เลือก character ของคุณรับ "ห้าม block ด้วย BP≥4000" เทิร์นนี้`);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempUnblockableBPMin = 4000; log(`${unit.card.name}: ${enemy.name} เลือก ${t.card.name} รับ "ห้าม block ด้วย BP≥4000" เทิร์นนี้`); }
    },
  };

  // 025 Lee Joohee — choose: draw 2, or draw 1 + fetch a traitless character (need<=3) from
  // Outside Area to hand.
  reg['UA51BT-SLG-1-025'] = {
    async onPlay(G, p, unit) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 2 ใบ', value: 'draw2' },
        { label: 'จั่ว 1 ใบ + ดึง character ไม่มี Trait (Energy≤3) จาก Outside Area', value: 'fetch' },
      ]);
      if (v === 'draw2') { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
      else {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
        await H.fetchFromSideline(p, c => c && c.type === 'Character' && !c.traits && (c.need || 0) <= 3, `${unit.card.name}: เลือก character ไม่มี Trait (Energy≤3)`);
      }
    },
  };

  // 027 Iron — passive +500 BP per resting Trait:Shadow Army (base BP<=2500) on own area.
  reg['UA51BT-SLG-1-027'] = {
    bpBonus(p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return 0;
      return [...p.front, ...p.energy].filter(u => u.rested && (u.card.traits || '').includes('Shadow Army') && (u.card.bp || 0) <= 2500).length * 500;
    },
  };

  // 029 Kaisel / 031 Tusk — reactive: when a Trait:Shadow Army (base BP<=2000) attacks, may rest
  // this active character for a one-shot bonus (each sub-ability usable once per turn).
  reg['UA51BT-SLG-1-029'] = {
    async onAnyAttack(G, p, atk, self) {
      if (self.rested) return;
      if (!((atk.card.traits || '').includes('Shadow Army') && (atk.card.bp || 0) <= 2000)) return;
      self._usedOpts = self._usedOpts || new Set();
      const opts = [];
      if (!self._usedOpts.has('unblock')) opts.push({ label: `${atk.card.name} ได้ "ห้าม block ด้วย BP≥4000" เทิร์นนี้`, value: 'unblock' });
      if (!self._usedOpts.has('untargetable')) opts.push({ label: `${atk.card.name} ได้ "ห้ามถูกเลือกโดย ability ศัตรู" เทิร์นนี้`, value: 'untargetable' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: วางนอนตัวเองเพื่อให้ ${atk.card.name} รับ effect? (ไม่บังคับ)`, [...opts, { label: 'ข้าม', value: null }]);
      if (!v) return;
      self.rested = true;
      self._usedOpts.add(v);
      if (v === 'unblock') { atk.tempUnblockableBPMin = 4000; log(`${self.card.name}: ${atk.card.name} ห้าม block ด้วย BP≥4000 เทิร์นนี้`); }
      else { atk.tempUntargetable = true; log(`${self.card.name}: ${atk.card.name} ห้ามถูกเลือกโดย ability ศัตรูเทิร์นนี้`); }
    },
  };
  reg['UA51BT-SLG-1-031'] = {
    async onAnyAttack(G, p, atk, self) {
      if (self.rested) return;
      if (!((atk.card.traits || '').includes('Shadow Army') && (atk.card.bp || 0) <= 2000)) return;
      self._usedOpts = self._usedOpts || new Set();
      const opts = [];
      if (!self._usedOpts.has('buff')) opts.push({ label: `${atk.card.name} +1500 BP เทิร์นนี้`, value: 'buff' });
      if (!self._usedOpts.has('draw')) opts.push({ label: 'จั่ว 1 ใบ แล้วทิ้ง 1 ใบ', value: 'draw' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${self.card.name}: วางนอนตัวเองเพื่อใช้ effect? (ไม่บังคับ)`, [...opts, { label: 'ข้าม', value: null }]);
      if (!v) return;
      self.rested = true;
      self._usedOpts.add(v);
      if (v === 'buff') { atk.bpMod += 1500; log(`${self.card.name}: ${atk.card.name} +1500 BP เทิร์นนี้`); }
      else { Engine.draw(p, 1); log(`${self.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
    },
  };

  // 030 Shadow Soldiers — [On Play] if another Trait:Shadow Army on field, look top 2, mill up to
  // 1 Shadow-Army/Sung-Jinwoo card to Outside Area, remainder back on top.
  reg['UA51BT-SLG-1-030'] = {
    async onPlay(G, p, unit) {
      if (![...p.front, ...p.energy].some(u => u !== unit && (u.card.traits || '').includes('Shadow Army'))) return;
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Shadow Army') || (c.name || '').includes('Sung Jinwoo'));
    },
  };

  // 033 Beru — [When Attacking][1/turn] if 4+ resting Trait:Shadow Army (base BP<=3000) on own
  // area, may discard 1 to stand self.
  reg['UA51BT-SLG-1-033'] = {
    async onAttack(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      const n = [...p.front, ...p.energy].filter(u => u.rested && (u.card.traits || '').includes('Shadow Army') && (u.card.bp || 0) <= 3000).length;
      if (n < 4 || !p.hand.length) return;
      unit._usedTurn = Engine.G.turn;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อ Active ตัวเอง?`);
      if (discarded) { unit.rested = false; log(`${unit.card.name}: Active ตัวเอง`); }
    },
  };

  // 037 Elixir of Life — fetch a character (BP<=4000) from Outside Area; draw 1.
  reg['UA51BT-SLG-1-037'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.bp || 0) <= 4000, `${card.name}: เลือก Character (BP≤4000) จาก Outside Area`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 039 Shadow Monarch — choose: play 1 Trait:Shadow Army from Outside Area active, or play up to
  // 2 Trait:Shadow Army (need<=3) from Outside Area rested.
  reg['UA51BT-SLG-1-039'] = {
    async onEvent(G, p, card) {
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
        { label: 'ลง Trait:Shadow Army 1 ใบจาก Outside Area (Active)', value: 'one' },
        { label: 'ลง Trait:Shadow Army (Energy≤3) สูงสุด 2 ใบจาก Outside Area (rested)', value: 'two' },
      ]);
      if (v === 'one') {
        const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Shadow Army');
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Trait:Shadow Army จาก Outside Area', pred);
        if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: true });
      } else {
        const pred = c => c && c.type === 'Character' && (c.traits || '').includes('Shadow Army') && (c.need || 0) <= 3;
        for (let i = 0; i < 2; i++) {
          if (!p.sideline.some(no => pred(byNo(no)))) break;
          const idx = await p.controller.chooseCardFromSideline(p, `เลือก Trait:Shadow Army (Energy≤3) ใบที่ ${i + 1}/2`, pred);
          if (idx == null) break;
          await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
        }
      }
    },
  };

  // 050 Lee Joohee — [Main][Rest][Retire] fetch Sung Jinwoo from Outside Area to hand.
  reg['UA51BT-SLG-1-050'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const pred = c => c && (c.name || '').includes('Sung Jinwoo');
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี Sung Jinwoo ใน Outside Area'); return; }
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Sung Jinwoo จาก Outside Area', pred);
      if (idx == null) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      const no = p.sideline[idx]; p.sideline.splice(idx, 1); p.hand.push(no);
      log(`${unit.card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`);
    },
  };

  // 051 Lee Joohee — fetch a character (need<=2) from Outside Area to hand. (The pay-AP-and-Raid
  // alternative from Outside Area isn't supported — the engine's Raid action only works from hand.)
  reg['UA51BT-SLG-1-051'] = {
    async onPlay(G, p, unit) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && (c.need || 0) <= 2, `${unit.card.name}: เลือก character (Energy≤2) จาก Outside Area`);
    },
  };

  // 054 Lim Tae-gyu — look top 2, mill up to 1 Trait:Fourth Jeju Island Raid, remainder to top.
  reg['UA51BT-SLG-1-054'] = {
    async onPlay(G, p, unit) {
      await H.lookTopAndDiscard(p, 2, 1, `${unit.card.name}: ดูการ์ดบนสุด 2 ใบ`, c => (c.traits || '').includes('Fourth Jeju Island Raid'));
    },
  };

  // 057 Cha Hae-in — [On Play][1/turn] if 5+ Trait:Fourth Jeju Island Raid on field: stand self,
  // but it won't stand again the next time it would (modeled via skipNextStand on itself).
  reg['UA51BT-SLG-1-057'] = {
    async onPlay(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) return;
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Fourth Jeju Island Raid')).length;
      if (n < 5) return;
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      unit.skipNextStand = true;
      log(`${unit.card.name}: Active ตัวเอง แต่จะไม่ Active ในครั้งถัดไป`);
    },
  };

  // 059 Baek Yoonho — may discard 1 to stand self +1000 BP; [When Attacking] look top 4, fetch up
  // to 2 Trait:Fourth Jeju Island Raid, remainder to bottom — if any added, won't stand next time.
  reg['UA51BT-SLG-1-059'] = {
    async onPlay(G, p, unit) {
      if (!p.hand.length) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อ Active ตัวเอง +1000 BP?`);
      if (discarded) { unit.rested = false; unit.bpMod += 1000; log(`${unit.card.name}: Active ตัวเอง +1000 BP เทิร์นนี้`); }
    },
    async onAttack(G, p, unit) {
      const taken = await H.lookTopAndTake(p, 4, c => (c.traits || '').includes('Fourth Jeju Island Raid'), 2, `${unit.card.name}: ดูการ์ดบนสุด 4 ใบ`);
      if (taken.length) { unit.skipNextStand = true; log(`${unit.card.name}: จะไม่ Active ในครั้งถัดไป`); }
    },
  };

  // 061 Min Byung-gu — buff another Trait:Fourth Jeju Island Raid +1000 (persists to next turn if
  // it's Baek Yoonho). (The "at the end of your attack phase" reactive stand isn't automated —
  // there's no distinct end-of-attack-phase hook.)
  reg['UA51BT-SLG-1-061'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Fourth Jeju Island Raid'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character Trait:Fourth Jeju Island Raid รับ +1000 BP`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      if ((t.card.name || '').includes('Baek Yoonho')) { t.bpPersist += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP จนถึงต้นเทิร์นถัดไป`); }
      else { t.bpMod += 1000; log(`${unit.card.name}: ${t.card.name} +1000 BP เทิร์นนี้`); }
    },
  };

  // 067 Tawata Kanae — if 3+ Trait:Japanese Hunters on field, draw 1 and stand self +1000 BP.
  reg['UA51BT-SLG-1-067'] = {
    async onPlay(G, p, unit) {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Japanese Hunters')).length;
      if (n < 3) return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      unit.rested = false; unit.bpMod += 1000;
      log(`${unit.card.name}: Active ตัวเอง +1000 BP เทิร์นนี้`);
    },
  };

  // 070 Fujishima Tatsumi — grants a reactive AP-tax-on-target. Left unscripted: no AP-cost-on-
  // targeting mechanism exists in the engine (same class of gap as AND-1-053 Gina).

  // 071 Ishida Mari — [Main][Rest][1/turn] buff another +1000 this turn, then bounce self.
  reg['UA51BT-SLG-1-071'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.buffOwnCharacter(p, 1000, { excludeUnit: unit });
      await Engine.returnUnitToHand(p, unit);
      log(`${unit.card.name}: กลับมือ`);
    },
  };

  // 072 Shimizu Akari — draw 1 if 3+ Trait:Japanese Hunters on field.
  reg['UA51BT-SLG-1-072'] = {
    async onPlay(G, p, unit) {
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Japanese Hunters')).length >= 3) {
        Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      }
    },
  };

  // 075 Daily Quest (Field) — combined menu for its two independent [Main] abilities.
  reg['UA51BT-SLG-1-075'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const hasJinwoo = H.hasCardNamed(p, 'Sung Jinwoo');
      const allCounters = [...p.front, ...p.energy].flatMap(u => u.counters.map(no => ({ owner: u, no })));
      const opts = [];
      if (hasJinwoo && p.deck.length) opts.push({ label: 'วางการ์ดบนสุดของเด็คคว่ำใต้การ์ดนี้', value: 'stack' });
      if (allCounters.length && p.hand.length) opts.push({ label: '[Discard 1] ย้ายการ์ดคว่ำ 1 ใบไป Sideline เพื่อดึง Sung Jinwoo (Energy 0) จาก Outside Area', value: 'fetch' });
      if (!opts.length) { p.controller.notify?.('ใช้ ability ไม่ได้ตอนนี้'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก ability`, opts);
      unit.rested = true;
      if (v === 'stack') {
        unit.counters.push(p.deck.shift());
        log(`${unit.card.name}: วางการ์ดบนสุดของเด็คคว่ำใต้ตัวเอง`);
      } else {
        await H.discardFromHand(p);
        const pickOpts = allCounters.map((c, idx) => ({ label: byNo(c.no)?.name || c.no, value: idx }));
        const idx = await p.controller.chooseOption(p, 'เลือกการ์ดคว่ำย้ายไป Sideline', pickOpts);
        const picked = allCounters[idx];
        picked.owner.counters.splice(picked.owner.counters.indexOf(picked.no), 1);
        p.sideline.push(picked.no);
        log(`${unit.card.name}: ย้าย ${byNo(picked.no)?.name} ไป Sideline`);
        await H.fetchFromSideline(p, c => c && (c.name || '').includes('Sung Jinwoo') && (c.need || 0) === 0, 'เลือก Sung Jinwoo (Energy 0) จาก Outside Area');
      }
    },
  };

  // 080 The Dancer — draw 1; grant a Cha Hae-in "[When Attacking] draw up to 1 card" this turn.
  reg['UA51BT-SLG-1-080'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Cha Hae-in'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก Cha Hae-in รับ "เมื่อโจมตีจั่วได้สูงสุด 1 ใบ" เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t._grantedAttackDraw = true; log(`${card.name}: ${t.card.name} ได้รับความสามารถชั่วคราว`); }
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Skipped (needs engine mechanisms that don't exist yet):
  //  • 1-070 Fujishima Tatsumi — reactive AP-tax on being targeted
  //  • 1-003 / 1-011 — "when THIS card is fetched from Outside Area by your own ability" reactive
  //    grant (no generic fetch-source hook watches for a specific card)
  //  • 1-061 — "at the end of your attack phase" reactive stand (no distinct end-of-attack hook)
  // ────────────────────────────────────────────────────────────────────────
})();
