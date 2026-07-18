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

  // "Outside Area" (per card text) is the Sideline zone — NOT the Removal Area. The Removal
  // Area is a separate, genuinely permanent zone only used for hand-limit discard, evicting a
  // full line, and any card text that explicitly says "Remove Area".
  async function discardFromHand(p, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || 'เลือกการ์ดจากมือไป Outside Area (Sideline)');
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    p.sideline.push(no);
    log(`${p.name} ส่ง ${UAData.byNo.get(no)?.name} จากมือไป Outside Area (Sideline)`);
    return no;
  }

  // genuinely permanent Removal Area — only for card text that explicitly says "Remove Area"
  // (rare) or "[Discard N]" activation costs, as opposed to "Outside Area" (Sideline).
  async function manualDiscardToRemoval(p, title) {
    if (!p.hand.length) return null;
    const i = await p.controller.chooseCardFromHand(p, title || 'เลือกการ์ดจากมือไป Removal Area');
    if (i == null) return null;
    const no = p.hand.splice(i, 1)[0];
    p.removal.push(no);
    log(`${p.name} ส่ง ${UAData.byNo.get(no)?.name} จากมือไป Removal Area (ถาวร)`);
    return no;
  }

  // look at the top card of the deck, then place it per one of `places`: 'top'|'bottom'|'outside'
  async function scryTop(p, places) {
    if (!p.deck.length) return;
    const top = p.deck[0];
    const c = UAData.byNo.get(top);
    const labels = { top: '⬆ วางไว้บนเด็คเหมือนเดิม', bottom: '⬇ วางใต้เด็ค', outside: '❌ ส่งไป Outside Area (Sideline)' };
    const opts = places.map(v => ({ label: labels[v], value: v }));
    const body = !p.controller.isBot ? `<div style="text-align:center">${UAData.imgTag(c, 'thumb')}</div>` : '';
    const v = await p.controller.chooseOption(p, `การ์ดบนสุดของเด็ค: ${c?.name}`, opts, body);
    if (v === 'bottom') { p.deck.push(p.deck.shift()); log(`${p.name} ย้ายการ์ดบนเด็คไปใต้เด็ค`); }
    else if (v === 'outside') { p.sideline.push(p.deck.shift()); log(`${p.name} ส่งการ์ดบนเด็คไป Outside Area (Sideline)`); }
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

  // fetch a card from the Outside Area (= Sideline) straight to hand — very common "add ... from
  // your Outside Area to your hand" wording.
  async function fetchFromSideline(p, predicate, title) {
    const i = await p.controller.chooseCardFromSideline(p, title || 'เลือกการ์ดจาก Outside Area เข้ามือ', predicate);
    if (i == null) return null;
    const no = p.sideline.splice(i, 1)[0];
    p.hand.push(no);
    log(`${p.name}: เพิ่ม ${UAData.byNo.get(no)?.name} จาก Outside Area เข้ามือ`);
    return no;
  }

  // "Add 1 card from your Life to your hand." — Life cards are face-down, so the choice is by
  // position only (revealed once it moves to hand).
  async function addLifeToHand(p) {
    if (!p.life.length) return null;
    const opts = p.life.map((_, i) => ({ label: `🂠 Life ใบที่ ${i + 1}`, value: i }));
    const i = await p.controller.chooseOption(p, 'เลือกการ์ด Life 1 ใบเพิ่มเข้ามือ', opts);
    if (i == null) return null;
    const no = p.life.splice(i, 1)[0];
    p.hand.push(no);
    log(`${p.name}: เพิ่ม ${UAData.byNo.get(no)?.name} จาก Life เข้ามือ`);
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
    discardFromHand, manualDiscardToRemoval, scryTop, lookTopAndTake, buffOwnCharacter,
    debuffEnemyFront, restEnemyFront, retireEnemyFront, apUntap, bounceSelfOrOther,
    fetchFromSideline, addLifeToHand, countNoTrigger, hasCardNamed, hasCardOfColor,
  };

  // ---------- generic text-pattern layer ----------
  // Card text wording varies a lot across the ~10k cards in this game (different
  // prepositions, "that card"/"it", trailing periods vs commas, even outright typos
  // in the source data). Rather than one fragile anchored regex per pattern, these
  // matchers key off a handful of unambiguous fragments so minor wording drift
  // doesn't silently break the whole pattern.
  const RX = {
    onplayDraw: /^\[On Play\]\s*Draw (\d+) cards?\.?$/i,
    apActive: /^Choose up to (\d+) of your AP [Cc]ards and set (?:it|them) to active\.?$/i,
    onplayBuffOther: /^\[On Play\]\s*Choose up to 1 (other )?character on your area, it (?:gets|gains) \+(\d+) BP during this turn\.?$/i,
    onplayDebuffEnemy: /^\[On Play\]\s*Choose up to 1 character on your opponent'?s Front Line, it gets -(\d+) BP during this turn\.?$/i,
    onplayRestEnemy: /^\[On Play\]\s*Choose up to 1 character on your opponent'?s Front Line and rest it\.?$/i,
    bounceSelfOrOther: /^\[On Play\]\s*Return 1 other character on your area with required energy of (\d+) or less to your hand\. If you cannot, return this (?:character|card) to your hand\.?$/i,
    onRetireDraw: /^\[On Retire\]\s*Draw (\d+) cards?\.?$/i,
    mainRestBuffOther: /^\[Main\]\s*\[Rest this card\]\s*Choose (?:up to )?1 other character on your (?:area|field),?\s*(?:it gets|give (?:it|them|it a)) \+?(\d+) ?BP(?: during this turn)?\.?$/i,
    mainDiscardImpact: /^\[Main\]\s*\[Discard (\d+)\]\s*\[1 Per Turn\]\s*(?:During this turn,\s*)?this character gains \[Impact\s*\(?(\d+)\)?\s*\](?: during this turn)?\.?$/i,
  };
  // "[Main] [Rest this card] [N Per Turn] This character gets +N generated energy ... retire this
  // character at the end of your Main Phase." — printed near-identically on ~90 cards across the
  // whole game (a cheap "burn a body for a temporary energy boost" archetype piece).
  const RX_SELF_GEN_RETIRE = /^\[Main\]\s*\[Rest this card\]\s*\[1 Per Turn\]\s*This character gets \+(\d+)(?:\s*\[?\w*\]?)? generated energy (?:and "At the end of your Main Phase, retire this character\."|during this turn|for this turn)/i;

  function firstLine(fx) { return (fx || '').split('@')[0].trim(); }
  // Some cards list a passive clause BEFORE their "[On Play]"/etc. clause (joined by '@'), so the
  // relevant clause isn't always segment 0 — find whichever '@'-separated segment actually starts
  // with the given marker.
  function findClause(fx, markerRegex) {
    const segs = (fx || '').split('@').map(s => s.trim());
    return segs.find(s => markerRegex.test(s)) || null;
  }
  // same idea, but returns the regex match result from whichever segment matches (for patterns
  // without a fixed bracket-marker prefix, like the AP-untap event text).
  function findMatch(fx, regex) {
    for (const s of (fx || '').split('@').map(s => s.trim())) {
      const m = s.match(regex);
      if (m) return m;
    }
    return null;
  }

  // "[On Play] Draw N card(s), place/put/discard M card(s) from your hand to the Outside
  // Area/Remove Area." — extremely common, but with many small wording variants.
  function matchDrawDiscard(fx) {
    const m = fx.match(/^\[On Play\]\s*Draw (\d+) cards?,\s*(.*)$/i);
    if (!m) return null;
    const rest = m[2];
    const dm = rest.match(/(?:place|put|discard)\s+(\d+)\s+cards?/i);
    if (!dm) return null;
    return { drawN: parseInt(m[1]), discardN: parseInt(dm[1]), toRemoval: /remove area/i.test(rest) };
  }

  // "[On Play] Look at the top N cards of your deck. Reveal up to M <criteria> among them and
  // add it to your hand. Place the remaining at the bottom of your deck in any order. [If you
  // added ..., place 1 card from your hand to the Outside Area.]" — the single biggest generic
  // pattern in the game (500+ cards), with heavy wording variation. `criteria` covers named
  // cards, [Trait: X], color/type, and cost thresholds; anything unrecognized falls back to
  // "any card" (the reveal-and-take flow degrades gracefully rather than doing nothing).
  function buildLookAtTopPredicate(criteriaRaw) {
    const t = (criteriaRaw || '').trim();
    const traits = [...t.matchAll(/<\s*Trait:?\s*([^>]+)>/gi)].map(m => m[1].trim().toLowerCase());
    if (traits.length) return c => (c.traits || '').toLowerCase().split(/[,;]/).map(s => s.trim())
      .some(tr => traits.some(want => tr.includes(want) || want.includes(tr)));
    const names = [...t.matchAll(/<([^>]+)>/g)].map(m => m[1].trim()).filter(n => !/^trait:/i.test(n));
    if (names.length) return c => names.some(n => (c.name || '').includes(n));
    const costMatch = t.match(/required energy of (\d+) or (higher|less|more)/i);
    if (costMatch) { const n = parseInt(costMatch[1]), hi = /higher|more/i.test(costMatch[2]); return c => hi ? (c.need || 0) >= n : (c.need || 0) <= n; }
    const colorMatch = t.match(/\[?(yellow|red|blue|green|purple)\]?/i);
    const typeMatch = t.match(/\b(Character|Event|Field)\b/i);
    if (colorMatch || typeMatch) {
      const color = colorMatch ? colorMatch[1].toLowerCase() : null;
      const type = typeMatch ? typeMatch[1] : null;
      return c => (!color || (c.color || '').toLowerCase() === color) && (!type || c.type === type);
    }
    if (/without a trait/i.test(t)) return c => !c.traits;
    if (/character card/i.test(t)) return c => c.type === 'Character';
    if (/event card/i.test(t)) return c => c.type === 'Event';
    if (/field card/i.test(t)) return c => c.type === 'Field';
    return () => true;
  }
  function matchLookAtTopFetch(fx) {
    if (!/^\d*\s*\[On Play\]\s*(?:From among them,?\s*)?Look at the top \d+ cards?/i.test(fx)) return null;
    const nMatch = fx.match(/top (\d+) cards?/i);
    const n = nMatch ? parseInt(nMatch[1]) : 1;
    let m = fx.match(/(?:Reveal|Add) up to (\d+)\s+(.+?)\s+among them(?:,)?\s*and add (?:it|them|1 card|a card)?\s*to (?:your hand|the hand)/i);
    if (!m) m = fx.match(/From among them,?\s*reveal up(?: to)? (\d+)?\s*(?:to )?(.+?),?\s*and add (?:it|them)?\s*to (?:your hand|the hand)/i);
    if (!m) m = fx.match(/Add up to (\d+)\s+(.+?)\s+among them to (?:the hand|your hand)/i);
    if (!m) m = fx.match(/Reveal up to (\d+)\s+(.+?)\s+and add it to your hand/i);
    if (!m) return null;
    const maxPick = parseInt(m[1]) || 1;
    const predicate = buildLookAtTopPredicate(m[2].replace(/^to\s+/, ''));
    const hasDiscard = /place 1 card from your hand to/i.test((fx.split(/among them/i).pop() || ''));
    return { n, maxPick, predicate, hasDiscard };
  }

  // "[On Play] Look at the top card of your deck ... place (that card/it) ... top of your deck
  // or (to/on) (your/the) Outside Area." — top-or-outside variant.
  function matchScryTopOutside(fx) {
    if (!/^\[On Play\]\s*Look at the top card of your deck/i.test(fx)) return null;
    if (!/outside area/i.test(fx) || /top or bottom|bottom of/i.test(fx)) return null;
    return true;
  }
  // ... or "top or bottom of your deck" — top-or-bottom variant.
  function matchScryTopBottom(fx) {
    if (!/^\[On Play\]\s*Look at the top card of your deck/i.test(fx)) return null;
    if (!/top or bottom|top of[^.]*bottom/i.test(fx)) return null;
    return true;
  }

  // "Choose 1 character on your opponent's Front Line with BP N or less and retire it. If there
  // is a <NAME> on your area, it's BP M or less instead." — common Event/On-Play text with an
  // optional name-gated BP-threshold upgrade.
  function matchRetireEnemyConditional(fx) {
    const m = fx.match(/Choose (?:up to )?1 character on your opponent'?s Front Line with [\["]?BP (\d+) or less[\]"]? and retire it\.?(?:\s*If there is an? <([^>]+)> on your area, it'?s [\["]?BP (\d+) or less[\]"]? instead\.?)?/i);
    if (!m) return null;
    return { baseBP: parseInt(m[1]), name: m[2] || null, upgradedBP: m[3] ? parseInt(m[3]) : null };
  }
  // bare (no "[On Play]" prefix) debuff/rest text, common on Event cards.
  function matchBareDebuffEnemy(fx) {
    const m = fx.match(/^Choose (?:up to )?1 character on your opponent'?s Front Line,\s*it (?:gets|gains) [\["]?-(\d+) ?BP[\]"]? during this turn\.?$/i);
    return m ? parseInt(m[1]) : null;
  }
  function matchBareRestEnemy(fx) {
    return /^Choose (?:up to )?1 character on your opponent'?s Front Line and rest it\.?$/i.test(fx);
  }

  const origOnPlay = Effects.onPlay.bind(Effects);
  Effects.onPlay = async function (G, p, unit) {
    if (unit.card.trigger === 'Get') p._getPlayedThisTurn = true; // tracked for "if a [Get] character was played this turn" cards
    if (this.registry[unit.no]?.onPlay) return origOnPlay(G, p, unit);
    const fx = findClause(unit.card.effect, /^\[On Play\]/i);
    if (!fx) return;
    let m, dd, rc;
    if ((m = fx.match(RX.onplayDraw))) {
      draw(p, parseInt(m[1]));
      log(`[On Play] ${unit.card.name}: ${p.name} จั่ว ${m[1]} ใบ`);
    } else if ((dd = matchDrawDiscard(fx))) {
      draw(p, dd.drawN);
      log(`[On Play] ${unit.card.name}: จั่ว ${dd.drawN} ใบ`);
      for (let i = 0; i < dd.discardN; i++) {
        if (dd.toRemoval) await manualDiscardToRemoval(p);
        else await discardFromHand(p);
      }
    } else if ((dd = matchLookAtTopFetch(fx))) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      const taken = await lookTopAndTake(p, dd.n, dd.predicate, dd.maxPick, `${unit.card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      if (taken.length && dd.hasDiscard) await discardFromHand(p);
    } else if (matchScryTopOutside(fx)) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'outside']);
    } else if (matchScryTopBottom(fx)) {
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
    } else if ((rc = matchRetireEnemyConditional(fx))) {
      const limit = rc.name && hasCardNamed(p, rc.name) ? rc.upgradedBP : rc.baseBP;
      await retireEnemyFront(p, limit);
    }
  };

  const origOnEvent = Effects.onEvent.bind(Effects);
  Effects.onEvent = async function (G, p, card) {
    if (this.registry[card.no]?.onEvent) return origOnEvent(G, p, card);
    const fx = firstLine(card.effect);
    let m, rc;
    if ((m = findMatch(card.effect, RX.apActive))) {
      await apUntap(p, parseInt(m[1]));
    } else if ((rc = matchRetireEnemyConditional(fx))) {
      const limit = rc.name && hasCardNamed(p, rc.name) ? rc.upgradedBP : rc.baseBP;
      await retireEnemyFront(p, limit);
    } else if ((m = matchBareDebuffEnemy(fx))) {
      await debuffEnemyFront(p, -m);
    } else if (matchBareRestEnemy(fx)) {
      await restEnemyFront(p);
    } else {
      log(`Event ${card.name}: ${fx} (ทำ effect ตามการ์ด — manual)`);
      if (!p.controller.isBot) {
        await p.controller.chooseOption(p, `Event: ${card.name}`,
          [{ label: 'รับทราบ — ทำตามข้อความการ์ดเอง', value: 1 }],
          `<p class="fx" style="white-space:pre-wrap">${UAData.fxText(card.effect || '')}</p>`);
      }
    }
  };

  // ---------- generic [Main] and [On Retire] patterns ----------
  function matchOnMain(card) {
    const fx = findClause(card.effect, /^\[Main\]/i);
    if (!fx) return null;
    let m;
    if ((m = fx.match(RX_SELF_GEN_RETIRE))) return { kind: 'selfGenRetire', n: parseInt(m[1]) };
    if ((m = fx.match(RX.mainRestBuffOther))) return { kind: 'restBuffOther', n: parseInt(m[1]) };
    if ((m = fx.match(RX.mainDiscardImpact))) return { kind: 'discardImpact', discardN: parseInt(m[1]), impact: parseInt(m[2]) };
    return null;
  }

  const origOnMain = Effects.onMain.bind(Effects);
  Effects.onMain = async function (G, p, unit) {
    if (this.registry[unit.no]?.onMain) return origOnMain(G, p, unit);
    const mm = matchOnMain(unit.card);
    if (!mm) return;
    if (mm.kind === 'selfGenRetire') {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่ ใช้ ability ไม่ได้'); return; }
      unit.rested = true;
      unit.tempGen += mm.n;
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: +${mm.n} energy generation เทิร์นนี้ (จะ retire เมื่อจบ Main Phase)`);
    } else if (mm.kind === 'restBuffOther') {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่ ใช้ ability ไม่ได้'); return; }
      unit.rested = true;
      await buffOwnCharacter(p, mm.n, { excludeUnit: unit });
    } else if (mm.kind === 'discardImpact') {
      if (p.hand.length < mm.discardN) { p.controller.notify?.(`ต้องทิ้ง ${mm.discardN} ใบ`); return; }
      const picked = await p.controller.chooseCardsFromHand(p, mm.discardN, `[Discard ${mm.discardN}] เพื่อให้ [Impact ${mm.impact}] เทิร์นนี้`);
      if (picked.length < mm.discardN) return;
      picked.sort((a, b) => b - a).forEach(i => { p.sideline.push(p.hand.splice(i, 1)[0]); });
      unit.tempImpact += mm.impact;
      log(`${unit.card.name}: ได้ [Impact ${mm.impact}] เทิร์นนี้ (ทิ้ง ${mm.discardN} ใบ)`);
    }
  };

  const origHasMain = Effects.hasMain.bind(Effects);
  Effects.hasMain = function (card) {
    if (origHasMain(card)) return true;
    return !!matchOnMain(card);
  };

  // "[On Retire] Draw N card(s)." — fires whenever the card is sidelined by an effect (not battle).
  const origOnSideline = Effects.onSideline.bind(Effects);
  Effects.onSideline = async function (G, p, unit, reason) {
    if (this.registry[unit.no]?.onSideline) return origOnSideline(G, p, unit, reason);
    if (reason === 'battle') return;
    const fx = findClause(unit.card.effect, /^\[On Retire\]/i);
    if (!fx) return;
    const m = fx.match(RX.onRetireDraw);
    if (m) { draw(p, parseInt(m[1])); log(`[On Retire] ${unit.card.name}: จั่ว ${m[1]} ใบ`); }
  };
})();
