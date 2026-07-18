// ══════════ UA SIM — generic, series-agnostic card-effect patterns ══════════
// Many cards across every series print identical wording (e.g. "[On Play] Draw
// 1 card, place 1 card from your hand to the Outside Area."). Rather than
// scripting each card number individually, this file recognizes those patterns
// straight from the card's effect text and resolves them automatically.
// Per-card registry entries (js/effects/<series>.js) always take priority —
// this layer only runs when no specific script is registered for that card.
// It also exports UAEffectHelpers: small reusable actions that per-card
// scripts can call directly instead of re-implementing the same prompt flow.

(() => {
  const log = m => Engine.log(m);
  const draw = (p, n) => Engine.draw(p, n);

  // ---------- shared action helpers (used by generic patterns and per-card scripts) ----------

  async function discardFromHand(p, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || 'เลือกการ์ดจากมือไป Removal');
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    p.removal.push(no);
    log(`${p.name} ส่ง ${UAData.byNo.get(no)?.name} จากมือไป Removal`);
    return no;
  }

  // look at the top card of the deck, then place it per one of `places`: 'top'|'bottom'|'removal'
  async function scryTop(p, places) {
    if (!p.deck.length) return;
    const top = p.deck[0];
    const c = UAData.byNo.get(top);
    const labels = { top: '⬆ วางไว้บนเด็คเหมือนเดิม', bottom: '⬇ วางใต้เด็ค', removal: '❌ ส่งไป Removal' };
    const opts = places.map(v => ({ label: labels[v], value: v }));
    const body = !p.controller.isBot ? `<div style="text-align:center">${UAData.imgTag(c, 'thumb')}</div>` : '';
    const v = await p.controller.chooseOption(p, `การ์ดบนสุดของเด็ค: ${c?.name}`, opts, body);
    if (v === 'bottom') { p.deck.push(p.deck.shift()); log(`${p.name} ย้ายการ์ดบนเด็คไปใต้เด็ค`); }
    else if (v === 'removal') { p.removal.push(p.deck.shift()); log(`${p.name} ส่งการ์ดบนเด็คไป Removal`); }
    else log(`${p.name} เก็บการ์ดไว้บนเด็คเหมือนเดิม`);
  }

  // look at the top N cards of the deck; player may add up to `maxPick` matching `predicate`
  // to hand, remainder goes to the bottom of the deck in original order.
  async function lookTopAndTake(p, n, predicate, maxPick, title) {
    n = Math.min(n, p.deck.length);
    if (!n) return [];
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title || 'ดูการ์ดบนสุดของเด็ค', predicate, maxPick);
    const taken = [];
    picked.sort((a, b) => b - a).forEach(i => { taken.push(revealed.splice(i, 1)[0]); });
    for (const no of taken) { p.hand.push(no); log(`${p.name}: เพิ่ม ${UAData.byNo.get(no)?.name} เข้ามือ`); }
    p.deck.push(...revealed); // remainder to bottom, original relative order
    return taken;
  }

  async function buffOwnCharacter(p, delta, { excludeUnit, persist } = {}) {
    const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && u !== excludeUnit);
    if (!units.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, units, `เลือก character รับ ${delta > 0 ? '+' : ''}${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    if (persist) u.bpPersist += delta; else u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta > 0 ? '+' : ''}${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }

  async function debuffEnemyFront(p, delta, { persist } = {}) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character');
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู รับ ${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    if (persist) u.bpPersist += delta; else u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }

  async function restEnemyFront(p) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.rested);
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, 'เลือก character ศัตรูให้วางนอน', true);
    const u = units.find(x => x.uid === uid);
    if (u) { u.rested = true; log(`${p.name}: ${u.card.name} ถูกวางนอน`); }
    return u;
  }

  async function retireEnemyFront(p, bpLimit) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && (bpLimit == null || Engine.bp(u) <= bpLimit));
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู (BP ${bpLimit ?? '-'} หรือน้อยกว่า) ให้ retire`, true);
    const u = units.find(x => x.uid === uid);
    if (u) { await Engine.sidelineUnit(enemy, u, 'effect'); log(`${p.name}: ${u.card.name} ถูก retire`); }
    return u;
  }

  async function apUntap(p, n) {
    const amt = Math.min(n, p.apRested);
    p.apRested -= amt;
    log(`${p.name}: AP กลับมา Active ${amt} ใบ`);
  }

  // "return 1 other character (need <= maxNeed) to hand; if you cannot, return this one instead"
  async function bounceSelfOrOther(p, unit, maxNeed) {
    const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.need || 0) <= maxNeed);
    if (others.length) {
      const uid = await p.controller.chooseOwnCharacter(p, others, `เลือก character (Energy ${maxNeed} หรือน้อยกว่า) กลับมือ`);
      const u = others.find(x => x.uid === uid);
      if (u) { await Engine.returnUnitToHand(p, u); log(`${p.name}: ${u.card.name} กลับมือ`); return u; }
    }
    await Engine.returnUnitToHand(p, unit);
    log(`${p.name}: ${unit.card.name} กลับมือ (ไม่มีเป้าหมายอื่น)`);
    return unit;
  }

  // fetch a card from Removal/Outside Area straight to hand (very common "add ... from your
  // Outside Area to your hand" wording)
  async function fetchFromRemoval(p, predicate, title) {
    const i = await p.controller.chooseCardFromRemoval(p, title || 'เลือกการ์ดจาก Outside Area เข้ามือ', predicate);
    if (i == null) return null;
    const no = p.removal.splice(i, 1)[0];
    p.hand.push(no);
    log(`${p.name}: เพิ่ม ${UAData.byNo.get(no)?.name} จาก Outside Area เข้ามือ`);
    return no;
  }

  function countNoTrigger(p) {
    return [...p.front, ...p.energy].filter(u => !u.card.trigger).length;
  }
  function hasCardNamed(p, name) {
    return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(name));
  }
  function hasCardOfColor(units, color) {
    return units.some(u => (u.card.color || '').toLowerCase() === color.toLowerCase());
  }

  window.UAEffectHelpers = {
    discardFromHand, scryTop, lookTopAndTake, buffOwnCharacter, debuffEnemyFront,
    restEnemyFront, retireEnemyFront, apUntap, bounceSelfOrOther, fetchFromRemoval,
    countNoTrigger, hasCardNamed, hasCardOfColor,
  };

  // ---------- generic text-pattern layer ----------
  const RX = {
    onplayDraw: /^\[On Play\]\s*Draw (\d+) cards?\.?$/i,
    onplayDrawDiscard: /^\[On Play\]\s*Draw (\d+) cards?,\s*place (\d+) cards? from your hand (?:in)?to the Outside Area\.?$/i,
    apActive: /^Choose up to (\d+) of your AP cards and set them to active\.?$/i,
    scryTopRemoval: /^\[On Play\]\s*Look at the top card of your deck,? place it on (?:the )?top of your deck or to the Outside Area\.?$/i,
    scryTopBottom: /^\[On Play\]\s*Look at the top card of your deck,? place it on the top o[fr] bottom of your deck\.?$/i,
    onplayBuffOther: /^\[On Play\]\s*Choose up to 1 (other )?character on your area, it gets \+(\d+) BP during this turn\.?$/i,
    onplayDebuffEnemy: /^\[On Play\]\s*Choose up to 1 character on your opponent'?s Front Line, it gets -(\d+) BP during this turn\.?$/i,
    onplayRestEnemy: /^\[On Play\]\s*Choose up to 1 character on your opponent'?s Front Line and rest it\.?$/i,
    bounceSelfOrOther: /^\[On Play\]\s*Return 1 other character on your area with required energy of (\d+) or less to your hand\. If you cannot, return this character to your hand\.?$/i,
  };

  function firstLine(fx) { return (fx || '').split('@')[0].trim(); }

  const origOnPlay = Effects.onPlay.bind(Effects);
  Effects.onPlay = async function (G, p, unit) {
    if (unit.card.trigger === 'Get') p._getPlayedThisTurn = true; // tracked for "if a [Get] character was played this turn" cards
    if (this.registry[unit.no]?.onPlay) return origOnPlay(G, p, unit);
    const fx = firstLine(unit.card.effect);
    let m;
    if ((m = fx.match(RX.onplayDraw))) {
      draw(p, parseInt(m[1]));
      log(`[On Play] ${unit.card.name}: ${p.name} จั่ว ${m[1]} ใบ`);
    } else if ((m = fx.match(RX.onplayDrawDiscard))) {
      draw(p, parseInt(m[1]));
      log(`[On Play] ${unit.card.name}: จั่ว ${m[1]} ใบ`);
      for (let i = 0; i < parseInt(m[2]); i++) await discardFromHand(p);
    } else if (fx.match(RX.scryTopRemoval)) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'removal']);
    } else if (fx.match(RX.scryTopBottom)) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'bottom']);
    } else if ((m = fx.match(RX.onplayBuffOther))) {
      await buffOwnCharacter(p, parseInt(m[2]), { excludeUnit: m[1] ? unit : null });
    } else if ((m = fx.match(RX.onplayDebuffEnemy))) {
      await debuffEnemyFront(p, -parseInt(m[1]));
    } else if (fx.match(RX.onplayRestEnemy)) {
      await restEnemyFront(p);
    } else if ((m = fx.match(RX.bounceSelfOrOther))) {
      await bounceSelfOrOther(p, unit, parseInt(m[1]));
    }
  };

  const origOnEvent = Effects.onEvent.bind(Effects);
  Effects.onEvent = async function (G, p, card) {
    if (this.registry[card.no]?.onEvent) return origOnEvent(G, p, card);
    const fx = firstLine(card.effect);
    let m;
    if ((m = fx.match(RX.apActive))) {
      await apUntap(p, parseInt(m[1]));
    } else {
      log(`Event ${card.name}: ${fx} (ทำ effect ตามการ์ด — manual)`);
      if (!p.controller.isBot) {
        await p.controller.chooseOption(p, `Event: ${card.name}`,
          [{ label: 'รับทราบ — ทำตามข้อความการ์ดเอง', value: 1 }],
          `<p class="fx" style="white-space:pre-wrap">${UAData.fxText(card.effect || '')}</p>`);
      }
    }
  };
})();
