// ══════════ UA SIM — Gintama (GNT) effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js.

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  function countOtherTrait(owner, self, trait) {
    return [...owner.front, ...owner.energy].filter(u => u !== self && (u.card.traits || '').toLowerCase().includes(trait.toLowerCase())).length;
  }

  // 003 Sasaki Isaburo — [Skipped]: "[When in Energy Line] when a character on your area is
  // returned to your hand, you may move this character to the Front Line" — no broadcast hook
  // exists for "a card was returned to hand" (only onAnyPlay/onAnyAttack/onAnyWinBattle/
  // onAnyLoseBattle/onAnyUnblockedAttack are wired today).

  // 011 Hattori Zenzou — passive: on your turn, if own Tokugawa Shigeshige or Sarutobi Ayame,
  // +500 BP. @[On Play] may return 1 other own character to hand; if did, set self active.
  reg['GNT-1-011'] = {
    bpBonus(p, unit) { return (Engine.G.players[Engine.G.active] === p && (H.hasCardNamed(p, 'Tokugawa Shigeshige') || H.hasCardNamed(p, 'Sarutobi Ayame'))) ? 500 : 0; },
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: คืน character อื่นกลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      unit.rested = false;
      log(`${unit.card.name}: Active`);
    },
  };

  // 014 Okita Sougo — [On Retire] if 5+ other Trait:Shinsengumi on your area, draw 1.
  reg['GNT-1-014'] = { async onSideline(G, p, unit) { if (countOtherTrait(p, unit, 'Shinsengumi') >= 5) { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); } } };

  // 023 Hijikata Toushirou — [On Play] if 5+ Trait:Shinsengumi on your area, choose 1 other
  // Trait:Shinsengumi, +1500 BP this turn.
  reg['GNT-1-023'] = {
    async onPlay(G, p, unit) {
      if ([...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Shinsengumi')).length < 5) return;
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Shinsengumi'));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Shinsengumi`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod += 1500; log(`${unit.card.name}: ${t.card.name} +1500 BP เทิร์นนี้`); }
    },
  };

  // 025 Yamazaki Sagaru — [On Retire] look at top 3, reveal up to 1 Trait:Shinsengumi to hand,
  // remainder to the bottom.
  reg['GNT-1-025'] = { async onSideline(G, p, unit) { await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Shinsengumi'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`); } };

  // 028 "Ninja Village" (Field) — "Play this field in active." (kw.entersActive, generic)
  // @[On Play] free-play up to 1 of Sarutobi Ayame/Tokugawa Shigeshige/Hattori Zenzou from hand
  // rested. (Skipped: the end-of-Attack-Phase self-rest-to-move clause — end-of-Attack-Phase hook
  // gap, recurring this session.)
  reg['GNT-1-028'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => /Sarutobi Ayame|Tokugawa Shigeshige|Hattori Zenzou/.test(byNo(no)?.name || ''));
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 029 "Shinsengumi Code Of Conduct" — all own Trait:Shinsengumi +1000 BP this turn. Draw 1.
  reg['GNT-1-029'] = {
    async onEvent(G, p, card) {
      for (const u of [...p.front, ...p.energy].filter(x => (x.card.traits || '').includes('Shinsengumi'))) u.bpMod += 1000;
      log(`${card.name}: Trait:Shinsengumi ทั้งหมดของคุณ +1000 BP เทิร์นนี้`);
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
    },
  };

  // 030 "Orders In The Name Of The Shogun" — may return 1 own character to hand. Choose 1 enemy
  // Front Line character BP≤3000 (or ≤5000 if you returned a character) and retire it.
  reg['GNT-1-030'] = {
    async onEvent(G, p, card) {
      let bounced = false;
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      if (targets.length) {
        const v = await p.controller.chooseOption(p, `${card.name}: คืน character กลับมือ?`, [{ label: 'คืน', value: true }, { label: 'ข้าม', value: false }]);
        if (v) {
          const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character');
          const t = targets.find(x => x.uid === uid);
          if (t) { await Engine.returnUnitToHand(p, t); log(`${card.name}: ${t.card.name} กลับมือ`); bounced = true; }
        }
      }
      await H.retireEnemyFront(p, bounced ? 5000 : 3000);
    },
  };

  // 031 "Shinsengumi Bazooka" — choose 1 enemy Front Line character with BP < (own Trait:Shinsengumi
  // count × 1000) and retire it.
  reg['GNT-1-031'] = { async onEvent(G, p, card) { const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Shinsengumi')).length; await H.retireEnemyFront(p, n * 1000 - 1); } };

  // 032 "Ninja License" — look at top 5, reveal any number of characters with a combined BP total
  // of up to 5000 and add them to hand (a simple greedy fill, not necessarily optimal), remainder
  // to the bottom.
  reg['GNT-1-032'] = {
    async onEvent(G, p, card) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      let total = 0;
      const taken = [];
      for (let i = 0; i < revealed.length; i++) {
        const c = byNo(revealed[i]);
        if (c && c.type === 'Character' && total + (c.bp || 0) <= 5000) { total += c.bp || 0; taken.push(i); }
      }
      taken.sort((a, b) => b - a).forEach(i => { const no = revealed.splice(i, 1)[0]; p.hand.push(no); log(`${card.name}: เพิ่ม ${byNo(no)?.name} เข้ามือ`); });
      p.deck.push(...revealed);
    },
  };

  // 034 Oboro — [Main][1/turn] only if a card from your hand was placed to the Outside Area this
  // turn: self +1000 BP this turn.
  reg['GNT-1-034'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._placedToOutsideThisTurn) { p.controller.notify?.('เงื่อนไขไม่ครบ'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1000;
      log(`${unit.card.name}: +1000 BP เทิร์นนี้`);
    },
  };

  // 036 Sakamoto Tatsuma — [Skipped]: "[When in Frontline] when another card's [On Retire] effect
  // would activate, you may place 1 card from hand to Outside Area to prevent it" — a
  // replacement-effect that would need to intercept `sidelineUnit` before it fires for an
  // arbitrary unit, no supporting hook (same class as RNK's Shikijo skip).

  // 043 Okada Nizou — [Skipped]: "[When in Frontline] at the end of your Attack Phase, ..." —
  // end-of-Attack-Phase hook gap, recurring this session.

  // 045 Kawakami Bansai — when this character attacks and wins a battle, may draw 1; if did, place
  // 1 card from hand to Outside Area. @[Main][1/turn] place 1 Trait:Kiheitai/Space Pirates Harusame
  // card from hand to Outside Area; if did, self +500 BP until the start of your next turn.
  reg['GNT-1-045'] = {
    async onWinBattle(G, p, atk) {
      const v = await p.controller.chooseOption(p, `${atk.card.name}: จั่ว 1 ใบ?`, [{ label: 'จั่ว', value: true }, { label: 'ข้าม', value: false }]);
      if (v) { Engine.draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ`); await H.discardFromHand(p); }
      return false;
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const idx = p.hand.findIndex(no => /Kiheitai|Space Pirates Harusame/.test(byNo(no)?.traits || ''));
      if (idx < 0) { p.controller.notify?.('ไม่มีการ์ดที่ตรงเงื่อนไข'); return; }
      unit._usedTurn = Engine.G.turn;
      const no = p.hand.splice(idx, 1)[0];
      p.sideline.push(no);
      p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
      log(`${unit.card.name}: ส่ง ${byNo(no)?.name} ไป Outside Area`);
      unit.bpPersist += 500;
      log(`${unit.card.name}: +500 BP จนถึงต้นเทิร์นหน้า`);
    },
  };

  // 047 Kijima Matako — [On Play] may place 1 card from hand to Outside Area; if did, your
  // opponent places 1 card from their hand to their Outside Area.
  reg['GNT-1-047'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (!discarded) return;
      const enemy = Engine.opponentOf(p);
      if (!enemy.hand.length) return;
      const i = await enemy.controller.chooseCardFromHand(enemy, `${unit.card.name}: เลือกการ์ดจากมือไป Outside Area (ถูกบังคับ)`);
      if (i == null) return;
      const no = enemy.hand.splice(i, 1)[0];
      enemy.sideline.push(no);
      log(`${unit.card.name}: ${enemy.name} ส่ง ${byNo(no)?.name} จากมือไป Outside Area`);
    },
  };

  // 053 Katsura Kotarou — [On Play] choose up to 1 enemy Front Line character -1000 BP this turn.
  // @[On Retire] choose 1 own Front Line character -1000 BP this turn.
  reg['GNT-1-053'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${unit.card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
    async onSideline(G, p, unit) {
      const targets = p.front.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character บน Front Line`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.bpMod -= 1000; log(`${unit.card.name}: ${t.card.name} -1000 BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
  };

  // 058 Shouyou — [Skipped]: "when this card is placed from your hand to the Outside Area, ..." —
  // a hand-level reactive with no supporting hook, same recurring gap this session.

  // 063 "Sleep in Hell" — choose 1 enemy Front Line character. If 3+ own Trait:Kiheitai or 3+ own
  // Trait:Space Pirates Harusame cards in your Outside Area, draw 1 and the chosen character gets
  // -2000 BP this turn. (Skipped: the granted "must block your opponent's attack if possible"
  // clause — forced-block gap, recurring this session.)
  reg['GNT-1-063'] = {
    async onEvent(G, p, card) {
      const kiheitai = p.sideline.filter(no => (byNo(no)?.traits || '').includes('Kiheitai')).length;
      const pirates = p.sideline.filter(no => (byNo(no)?.traits || '').includes('Space Pirates Harusame')).length;
      if (kiheitai < 3 && pirates < 3) return;
      const enemy = Engine.opponentOf(p);
      const targets = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
      if (!targets.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, targets, `${card.name}: เลือก character ศัตรู`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      t.bpMod -= 2000; log(`${card.name}: ${t.card.name} -2000 BP เทิร์นนี้`);
      await Engine.checkBpZero();
    },
  };

  // 067 "Takasugi's Smoking Pipe" — add up to 1 character card from your Outside Area to your
  // hand. Draw 1 if own Takasugi Shinsuke.
  reg['GNT-1-067'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือกการ์ดจาก Outside Area`);
      if (H.hasCardNamed(p, 'Takasugi Shinsuke')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 068 Elizabeth — [Main][1/turn] only if you used an Event Card this turn: self +500 BP this turn.
  reg['GNT-1-068'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p._eventsUsedThisTurn) { p.controller.notify?.('ต้องใช้ Event Card มาก่อน'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 500;
      log(`${unit.card.name}: +500 BP เทิร์นนี้`);
    },
  };

  // 078 Tama — [On Play] look at the top card of your deck, place it on top or bottom.
  reg['GNT-1-078'] = { async onPlay(G, p, unit) { await H.scryTop(p, ['top', 'bottom']); } };

  // 088 Sakata Gintoki — [On Play]/[When Attacking] choose 1 other own Trait:Yorozuya, +500 BP this turn.
  async function gintokiBuffYorozuya(p, unit) {
    const targets = [...p.front, ...p.energy].filter(u => u !== unit && (u.card.traits || '').includes('Yorozuya'));
    if (!targets.length) return;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก Trait:Yorozuya`, true);
    const t = targets.find(x => x.uid === uid);
    if (t) { t.bpMod += 500; log(`${unit.card.name}: ${t.card.name} +500 BP เทิร์นนี้`); }
  }
  reg['GNT-1-088'] = {
    async onPlay(G, p, unit) { await gintokiBuffYorozuya(p, unit); },
    async onAttack(G, p, unit) { await gintokiBuffYorozuya(p, unit); },
  };

  // 091 Sadaharu — [Skipped]: "Your Trait:Yorozuya cards with [Raid] can use this card to raid" —
  // grants itself as a valid raid target for any Trait:Yorozuya raider regardless of the raider's
  // own printed target; would need changes to `raidTargetsFor`'s matching logic, not worth it for
  // one card.

  // 093 Shimura Shinpachi — passive: +500 BP for each own card named Sakata Gintoki, Kagura or
  // Sadaharu.
  reg['GNT-1-093'] = {
    bpBonus(p, unit) {
      const n = [...p.front, ...p.energy].filter(u => /Sakata Gintoki|Kagura|Sadaharu/.test(u.card.name || '')).length;
      return n * 500;
    },
  };

  // 094 Shimura Shinpachi — [On Play] look at top 5, free-play up to 1 Trait:Yorozuya (need≤3,
  // ap1) among them to your area rested, remainder to the bottom. (Skipped: the "or raid it"
  // alternative, same gap noted for several cards this session.)
  reg['GNT-1-094'] = {
    async onPlay(G, p, unit) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Yorozuya') && (c.need || 0) <= 3 && (c.ap || 0) === 1; });
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        p.deck.unshift(no);
        await Engine.playCardFromZone(p, no, 'deck', { line: 'energy', active: false });
        return;
      }
      p.deck.push(...revealed);
    },
  };

  // 095 "Kabukicho" (Field) — [On Play] may place 1 card from hand to Outside Area; if did, draw
  // 2. @[Main][Rest+Retire this card] choose 1 own character +500 BP this turn.
  reg['GNT-1-095'] = {
    async onPlay(G, p, unit) {
      const discarded = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือไป Outside Area?`);
      if (discarded) { Engine.draw(p, 2); log(`${unit.card.name}: จั่ว 2 ใบ`); }
    },
    async onMain(G, p, unit) { await Engine.sidelineUnit(p, unit, 'effect'); await H.buffOwnCharacter(p, 500); },
  };

  // 097 "I've Been Standing Here The Whole Time" — choose 1 own character, set it active. Draw 1.
  // If you have 5+ Event cards in your Outside Area, the chosen character also gains
  // [Impact +1] this turn.
  reg['GNT-1-097'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
      let chosen = null;
      if (targets.length) {
        const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character`, true);
        chosen = targets.find(x => x.uid === uid);
        if (chosen) { chosen.rested = false; log(`${card.name}: ${chosen.card.name} เป็น Active`); }
      }
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      if (chosen && p.sideline.filter(no => byNo(no)?.type === 'Event').length >= 5) { chosen.tempImpact += 1; log(`${card.name}: ${chosen.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 104 Sakata Gintoki — [On Play] choose up to 1 other own character BP≤3000, set it active.
  reg['GNT-1-104'] = {
    async onPlay(G, p, unit) {
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && u.rested && Engine.bp(u) <= 3000);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character (BP≤3000)`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 109 "Gochi Ni Nari Masu" — choose 1 own character +2000 BP this turn (also [Impact +1] if it
  // has Trait:Yorozuya).
  reg['GNT-1-109'] = {
    async onEvent(G, p, card) {
      const t = await H.buffOwnCharacter(p, 2000);
      if (t && (t.card.traits || '').includes('Yorozuya')) { t.tempImpact += 1; log(`${card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // UAPR-GNT-P-001 Hijikata Toushirou — [On Play] free-play 1 Trait:Shinsengumi card (need≤2,
  // ap1) from hand rested.
  reg['UAPR-GNT-P-001'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Shinsengumi') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // UAPR-GNT-P-002 Takasugi Shinsuke — [On Play] draw 1; if 5+ total Trait:Kiheitai and
  // Trait:Space Pirates Harusame cards in your Outside Area, set 1 of your AP cards active.
  reg['UAPR-GNT-P-002'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const n = p.sideline.filter(no => /Kiheitai|Space Pirates Harusame/.test(byNo(no)?.traits || '')).length;
      if (n >= 5) await H.apUntap(p, 1);
    },
  };

  // UAPR-GNT-P-003 Sakata Gintoki — [Main][Rest+Retire this card] look at top 5, free-play up to
  // 1 Trait:Yorozuya (need≤2, ap1) among them to your area rested, or free-play a named "Yorozuya
  // Gin-Chan" among them to your Energy Line rested, remainder to the bottom; if you didn't play a
  // card, add this card back to your hand.
  reg['UAPR-GNT-P-003'] = {
    async onMain(G, p, unit) {
      await Engine.sidelineUnit(p, unit, 'effect');
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      let idx = revealed.findIndex(no => (byNo(no)?.name || '').includes('Yorozuya Gin-Chan'));
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        p.deck.unshift(no);
        await Engine.playCardFromZone(p, no, 'deck', { line: 'energy', active: false });
        return;
      }
      idx = revealed.findIndex(no => { const c = byNo(no); return c && c.type === 'Character' && (c.traits || '').includes('Yorozuya') && (c.need || 0) <= 2 && (c.ap || 0) === 1; });
      if (idx >= 0) {
        const no = revealed.splice(idx, 1)[0];
        p.deck.push(...revealed);
        p.deck.unshift(no);
        await Engine.playCardFromZone(p, no, 'deck', { line: 'energy', active: false });
        return;
      }
      p.deck.push(...revealed);
      const sIdx = p.sideline.lastIndexOf(unit.no);
      if (sIdx >= 0) { p.sideline.splice(sIdx, 1); p.hand.push(unit.no); log(`${unit.card.name}: กลับเข้ามือ (ไม่ได้ลงการ์ดใด)`); }
    },
  };
})();
