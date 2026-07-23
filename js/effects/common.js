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
    p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1;
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
    else if (v === 'outside') { p.sideline.push(p.deck.shift()); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${p.name} ส่งการ์ดบนเด็คไป Outside Area (Sideline)`); }
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
    for (const no of taken) {
      p.hand.push(no);
      log(`${p.name}: เพิ่ม ${UAData.byNo.get(no)?.name} เข้ามือ`);
      const c = UAData.byNo.get(no);
      if (c && c.color !== 'Yellow' && Engine.parseKeywords(c).raidTargets.length) p._revealedNonYellowRaidThisTurn = true;
    }
    p.deck.push(...revealed); // remainder to bottom, original relative order
    return taken;
  }

  // "Look at the top N cards of your deck. Place up to M card(s) among them to the Outside Area.
  // Place the remaining at/on top of your deck in any order." — a mill-style variant of the above
  // where the *unpicked* cards go back to the TOP of the deck instead of the bottom.
  async function lookTopAndDiscard(p, n, maxDiscard, title, predicate) {
    n = Math.min(n, p.deck.length);
    if (!n) return [];
    const revealed = p.deck.splice(0, n);
    const picked = await p.controller.chooseRevealPick(p, revealed, title || 'ดูการ์ดบนสุดของเด็ค (เลือกส่ง Outside Area ได้)', predicate || null, maxDiscard);
    const sent = [];
    picked.sort((a, b) => b - a).forEach(i => { sent.push(revealed.splice(i, 1)[0]); });
    for (const no of sent) { p.sideline.push(no); p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + 1; log(`${p.name}: ส่ง ${UAData.byNo.get(no)?.name} ไป Outside Area`); }
    p.deck.unshift(...revealed); // remainder back on top, original relative order
    return sent;
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
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable);
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู รับ ${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    if (persist) u.bpPersist += delta; else u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }

  // debuff targeting ANY opponent character (front OR energy line), gated by a BP floor or ceiling
  // — several cards say "on your opponent's area" (both lines) rather than "Front Line".
  async function debuffEnemyAny(p, delta, { min, max } = {}) {
    const enemy = Engine.opponentOf(p);
    const units = [...enemy.front, ...enemy.energy].filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable &&
      (min == null || Engine.bp(u) >= min) && (max == null || Engine.bp(u) <= max));
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู รับ ${delta} BP`, true);
    const u = units.find(x => x.uid === uid);
    if (!u) return null;
    u.bpMod += delta;
    log(`${p.name}: ${u.card.name} ${delta} BP`);
    await Engine.checkBpZero();
    return u;
  }

  async function restEnemyFront(p, bpLimit) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable && !u.tempUntargetable &&
      (bpLimit == null || Engine.bp(u) <= bpLimit));
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, 'เลือก character ศัตรูให้วางนอน', true);
    const u = units.find(x => x.uid === uid);
    if (u) { u.rested = true; log(`${p.name}: ${u.card.name} ถูกวางนอน`); }
    return u;
  }

  async function retireEnemyFront(p, bpLimit) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (bpLimit == null || Engine.bp(u) <= bpLimit));
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
    discardFromHand, manualDiscardToRemoval, scryTop, lookTopAndTake, lookTopAndDiscard, buffOwnCharacter,
    debuffEnemyFront, debuffEnemyAny, restEnemyFront, retireEnemyFront, apUntap, bounceSelfOrOther,
    fetchFromSideline, addLifeToHand, countNoTrigger, hasCardNamed, hasCardOfColor,
  };

  // ---------- generic text-pattern layer ----------
  // Card text wording varies a lot across the ~10k cards in this game (different
  // prepositions, "that card"/"it", trailing periods vs commas, even outright typos
  // in the source data). Rather than one fragile anchored regex per pattern, these
  // matchers key off a handful of unambiguous fragments so minor wording drift
  // doesn't silently break the whole pattern.
  const RX = {
    onplayDraw: /^\[On Play\]\s*Draw (\d+)(?: cards?)?\.?$/i,
    apActive: /^Choose up to (\d+) (?:of your )?AP [Cc]ards? and (?:(?:set|switch) (?:it|them) to active|activate (?:it|them)|active (?:it|them))\.?$/i,
    onplayBuffOther: /^\[On Play\]\s*(?:Choose up to 1|1 of your)\s+(other )?[Cc]haracters?(?: on your (?:area|field))?[.,]?\s*(?:then\s*)?(?:(?:it (?:gets|gains)|give it)\s*)?\+(\d+) ?BP(?: during this turn)?\.?$/i,
    onplayDebuffEnemy: /^\[On Play\]\s*Choose (?:up to )?1 character on your opponent'?s Front Line[.,]?\s*(?:it (?:gets|gains)|give it) -(\d+) ?BP during this turn\.?$/i,
    onplayRestEnemy: /^\[On Play\]\s*Choose up to 1 character on your opponent'?s Front Line(?: with BP (\d+) or less)? and rest it\.?$/i,
    bounceSelfOrOther: /^(?:\[On Play\]\s*)?Return 1 (?:other )?character(?:\s+on your area|\s+from your field)? with\s+(?:required\s+energy\s+of\s+(\d+)(?:\s+or less)|a\s+cost\s+of\s+(\d+)\s+or less\s+energy|(\d+)\s+energy\s+required\s+or less) to your hand\.\s*If you (?:cannot|can'?t), return this (?:character|card) to your hand(?: instead)?\.?$/i,
    onRetireDraw: /^\[On Retire\]\s*Draw (\d+)(?: cards?)?\.?$/i,
    mainRestBuffOther: /^\[Main\]\s*\[Rest this card\]\s*Choose (?:(?:up to )?1 (?:of your )?other|another) [Cc]haracters?(?: in your (?:area|field))?(?: on your (?:area|field))?[.,]?\s*(?:and )?(?:it (?:gets|gains)|give (?:it|them|it a)|)\s*\+?(\d+) ?BP(?: during this turn)?\.?$/i,
    mainDiscardImpact: /^\[Main\]\s*\[Discard (\d+)\]\s*\[1 Per Turn\]\s*(?:During this turn,\s*)?this character gains \[Impact\s*\(?(\d+)\)?\s*\](?: during this turn)?\.?$/i,
  };
  // "[Main] [Rest this card] [N Per Turn] This character gets +N generated energy ... retire this
  // character at the end of your Main Phase." — printed near-identically on ~90 cards across the
  // whole game (a cheap "burn a body for a temporary energy boost" archetype piece).
  const RX_SELF_GEN_RETIRE = /^\[Main\]\s*\[Rest this card\]\s*\[1 Per Turn\]\s*This (?:character|Field) gets \+(\d+)(?:\s*\[?\w*\]?)? generated(?:\s*\[?\w*\]?)? energy(?:\s*\[?\w*\]?)?\s*(?:and "At the end of your Main Phase, retire this (?:character|Field)\."|during this turn|for this turn)/i;
  // newer-series wording: "This character gains [purple] energy generation and 'At the end of
  // the main phase, retire this character' until the end of the turn." (always +1)
  const RX_SELF_GEN_RETIRE2 = /^\[Main\]\s*\[Rest this card\]\s*\[1 Per Turn\]\s*This (?:character|Field) gains (?:\[?\w+\]?\s*)?energy generation and ["“']*At the end of (?:your|the) [Mm]ain [Pp]hase, retire this (?:character|Field)\.?["”']*\s*during this turn\.?$/i;

  // Newer series (SLG, MST, IYS, CSM, KJN, ...) use a different translation style: spelled-out
  // numbers ("draw a card", "top three cards"), "until the end of the turn", "gains 1000 BP"
  // without a plus sign, "into your Outside Area", "{X} instead" braces, etc. Normalizing every
  // clause into the older style before matching lets one set of matchers cover both styles.
  const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20 };
  function normalizeFx(s) {
    let t = s;
    // strip the leading numeric artifact many cards carry (the printed gen value leaking into the
    // text: "2 [Your Turn] ...", "-0[On Play] ...", "7For each ...") — only when what follows looks
    // like the actual clause start (bracket tag / capital / <name> / bullet), so genuine leading
    // numbers in prose ("1 of your other...") are left alone.
    t = t.replace(/^\s*-?\d+\s*(?=\[|[A-Z<•])/, '');
    t = t.replace(/\binto (?:your|the) hand\b/gi, 'to your hand');
    t = t.replace(/\bLook at (?:your )?top (\d+)/gi, 'Look at the top $1');
    t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\b/gi, w => NUM_WORDS[w.toLowerCase()]);
    t = t.replace(/\ba card\b/gi, '1 card');
    t = t.replace(/\buntil the end of the turn\b/gi, 'during this turn');
    t = t.replace(/\bfor the turn\b/gi, 'during this turn');
    t = t.replace(/(\d)BP\b/g, '$1 BP');                      // "+1000BP" / "3000BP or less" -> spaced
    t = t.replace(/\bBP\+(\d+)/gi, '+$1 BP');                 // "gets BP+1000" -> "gets +1000 BP" (swapped word order)
    t = t.replace(/\b(gains|gets) (\d+) ?BP\b/gi, '$1 +$2 BP');
    t = t.replace(/\bwith (\d+) BP or (less|more)\b/gi, 'with BP $1 or $2');
    t = t.replace(/\bput it to rest\b/gi, 'rest it');
    t = t.replace(/\bFrontline\b/g, 'Front Line');
    t = t.replace(/\bwith (\d+) or (less|more|lower|higher) required energy\b/gi, 'with required energy of $1 or $2');
    t = t.replace(/\binto (?:your|the) Outside Area\b/gi, 'to the Outside Area');
    t = t.replace(/\b(?:on|in) your field\b/gi, 'on your area');
    t = t.replace(/\bfront line\b/gi, 'Front Line');
    t = t.replace(/\bswitch (it|them) to active\b/gi, 'set $1 to active');
    t = t.replace(/[{}]/g, '');
    return t;
  }

  function firstLine(fx) { return normalizeFx((fx || '').split('@')[0].trim()); }
  // Some cards list a passive clause BEFORE their "[On Play]"/etc. clause (joined by '@'), so the
  // relevant clause isn't always segment 0 — find whichever '@'-separated segment actually starts
  // with the given marker. Returned clause is normalized.
  function findClause(fx, markerRegex) {
    const segs = (fx || '').split('@').map(s => normalizeFx(s.trim()));
    return segs.find(s => markerRegex.test(s)) || null;
  }
  // same idea, but returns the regex match result from whichever segment matches (for patterns
  // without a fixed bracket-marker prefix, like the AP-untap event text).
  function findMatch(fx, regex) {
    for (const s of (fx || '').split('@').map(s => normalizeFx(s.trim()))) {
      const m = s.match(regex);
      if (m) return m;
    }
    return null;
  }

  // "[On Play] Draw N card(s), place/put/discard M card(s) from your hand to the Outside
  // Area/Remove Area." — extremely common, but with many small wording variants. The "[On Play]"
  // marker is optional so the same matcher covers Event cards with identical bare wording.
  function matchDrawDiscard(fx) {
    const m = fx.match(/^(?:\[On Play\]\s*)?Draw (\d+)(?: cards?)?(?:,| and|, then| then)\s*(.*)$/i);
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
  // general card predicate from a free-text criteria fragment (names / traits / color / type /
  // cost threshold) — shared by look-at-top, fetch-from-outside, free-play-from-hand patterns.
  const buildCardPredicate = buildLookAtTopPredicate;

  function matchLookAtTopFetch(fx) {
    if (!/^\d*\s*(?:\[On Play\]\s*)?(?:From among them,?\s*)?Look (?:at )?(?:the )?top \d+(?: cards?)?/i.test(fx)) return null;
    const nMatch = fx.match(/top (\d+) cards?/i);
    const n = nMatch ? parseInt(nMatch[1]) : 1;
    let m = fx.match(/(?:Reveal|Add) up to (\d+)\s+(.+?)\s+among them(?:,)?\s*and add (?:it|them|1 card|a card)?\s*to (?:your hand|the hand)/i);
    if (!m) m = fx.match(/From among them,?\s*reveal up(?: to)? (\d+)?\s*(?:to )?(.+?),?\s*and add (?:it|them)?\s*to (?:your hand|the hand)/i);
    if (!m) m = fx.match(/Add up to (\d+)\s+(.+?)\s+among them to (?:the hand|your hand)/i);
    if (!m) m = fx.match(/Reveal up to (\d+)\s+(.+?)\s+and add it to your hand/i);
    if (!m) m = fx.match(/Reveal and [Aa]dd (?:up to )?(\d+) (?:cards? with )?(.+?)(?: among them| to hand|\.)/i);
    // broader fallbacks: "Reveal/Add/Choose (up to) N ... [among them/those cards] and add ... to hand"
    // — covers wording that skips "up to" (exact-N pick) or "among them" (no explicit source callout).
    if (!m) m = fx.match(/(?:Reveal|Add|Choose) up to (\d+)\s+(.+?)\s*(?:among (?:them|those cards))?,?\s*and add (?:it|them|1 card|a card)?\s*to (?:your hand|the hand)/i);
    if (!m) m = fx.match(/(?:Reveal|Add|Choose) (\d+)\s+(?:cards? with )?(.+?)\s*(?:among (?:them|those cards))?,?\s*and add (?:it|them)?\s*to (?:your hand|the hand)/i);
    if (!m) return null;
    const maxPick = parseInt(m[1]) || 1;
    const predicate = buildLookAtTopPredicate(m[2].replace(/^to\s+/, ''));
    const hasDiscard = /(?:place|put) 1 card from your hand to|discard 1 card from your hand/i.test(fx);
    return { n, maxPick, predicate, hasDiscard };
  }

  // "[On Play] If there is a <X> (card) on your area, draw N card(s)."
  function matchCondDraw(fx) {
    const m = fx.match(/^\[On Play\]\s*If there (?:is|are) (?:a |an )?(?:(\d+) or more )?(.+?) (?:cards? |characters? )?on your (area|field|Front Line), draw (\d+) cards?\.?$/i);
    if (!m) return null;
    return { n: m[1] ? parseInt(m[1]) : 1, criteria: m[2], zone: parseZone(m[3]), drawN: parseInt(m[4]) };
  }

  // "[On Play] Play up to 1 <criteria> card with required energy of N or less (and AP cost of 1)
  //  from your hand to your area (as) rested."
  function matchFreePlayFromHand(fx) {
    const m = fx.match(/^\[On Play\]\s*Play up to 1 (.+?) (?:card )?with (?:a )?(?:required energy|energy cost) of (\d+) or less(?: and (?:an? )?AP(?: cost(?: of)?)? (\d+))? from your hand to your (area|Front Line|Energy Line),? (?:as )?rested\.?$/i);
    if (!m) return null;
    return { criteria: m[1], maxNeed: parseInt(m[2]), apCost: m[3] ? parseInt(m[3]) : null,
             line: /front/i.test(m[4]) ? 'front' : 'energy' };
  }

  // "[On Play] You may place 1 card from your hand to the Outside Area. If you did, add up to 1
  //  <criteria> (card) (with required energy of N or less) from your Outside Area to your hand."
  function matchDiscardFetch(fx) {
    const m = fx.match(/^\[On Play\]\s*You may (?:place|put) 1 card from your hand (?:in)?to (?:the|your) Outside Area\. If you did, add up to 1 (.+?) (?:cards? )?(?:with (?:a )?required energy of (\d+) or less )?from (?:the|your) Outside Area to (?:the|your) hand\.?\s*$/i);
    if (!m) return null;
    return { criteria: m[1], maxNeed: m[2] ? parseInt(m[2]) : null };
  }

  // "[On Play] Add up to 1 <criteria> card from your Outside Area to the/your hand."
  function matchFetchOutside(fx) {
    const m = fx.match(/^\[On Play\]\s*Add up to 1 (.+?) (?:card )?from (?:the|your) Outside Area to (?:the|your) hand\.?$/i);
    if (!m) return null;
    return { criteria: m[1] };
  }

  // "[When Attacking] Choose up to 1 <criteria> (character) on your area and it gets +N BP..."
  function matchAttackBuff(fx) {
    const m = fx.match(/^\[When Attacking\]\s*Choose up to 1 (.+?) (?:character |Character )?(?:card )?on your (?:area|field),? and it (?:gets|gains) \+(\d+) ?BP during this turn\.?$/i);
    if (!m) return null;
    return { criteria: m[1], amount: parseInt(m[2]) };
  }

  // "[When Attacking] This character gets +N BP (during this turn)." — bare self-buff, no target choice.
  function matchAttackSelfBuff(fx) {
    const m = fx.match(/^\[When Attacking\]\s*This character (?:gets|gains) \+(\d+) ?BP(?: during this turn)?\.?$/i);
    return m ? parseInt(m[1]) : null;
  }
  // "[On Play] All characters on your area/Front Line get +N BP during this turn." — unconditional,
  // no target choice, applies to every own character at once.
  function matchAllOwnBuff(fx) {
    const m = fx.match(/^\[On Play\]\s*All characters (?:on|in) your (area|field|Front Line) (?:gets?|gains?) \+(\d+) ?BP(?: during this turn)?\.?$/i);
    if (!m) return null;
    return { zone: parseZone(m[1]), amount: parseInt(m[2]) };
  }
  // "Place N cards from the top of your deck to the Outside Area." (unconditional mill, no choice)
  // — `fx` still carries its "[On Play]"/"[On Retire]" marker prefix (findClause doesn't strip it).
  function matchPlainMillOutside(fx) {
    const body = fx.replace(/^\[On (?:Play|Retire)\]\s*/i, '');
    let m = body.match(/^Place (\d+) cards? from the top of your deck to the Outside Area\.?$/i);
    if (!m) m = body.match(/^Place the top (\d+) cards? of your deck to the Outside Area\.?$/i);
    return m ? parseInt(m[1]) : null;
  }

  // "[On Play] Look at the top card of your deck ... place (that card/it) ... top of your deck
  // or (to/on) (your/the) Outside Area." — top-or-outside variant.
  function matchScryTopOutside(fx) {
    if (!/^(?:\[On Play\]\s*)?Look at the top card of your deck/i.test(fx)) return null;
    if (!/outside area/i.test(fx) || /top or bottom|bottom of/i.test(fx)) return null;
    return true;
  }
  // ... or "top or bottom of your deck" — top-or-bottom variant.
  function matchScryTopBottom(fx) {
    if (!/^(?:\[On Play\]\s*)?Look at (?:the top card|1 card from the top) of your deck/i.test(fx)) return null;
    if (!/top or bottom|top of[^.]*bottom/i.test(fx)) return null;
    return true;
  }
  // "[On Play] Look at the top N cards of your deck. Place up to M card(s) among them to the
  // Outside Area. Place the remaining at/on top of your deck in any order." — mill-style variant
  // (unpicked cards return to the TOP of the deck, unlike the reveal-and-fetch-to-hand pattern).
  function matchScryDiscardTop(fx) {
    const m = fx.match(/^(?:\[On Play\]\s*)?Look at the top (\d+) cards? of your deck[.,]\s*[Pp]lace up to (\d+)(?: of them| cards?(?: among them)?) to the Outside Area[.,]?\s*(?:then\s*)?[Pp]lace the remaining(?: cards?)? (?:at|on) (?:the )?top of your deck/i);
    if (!m) return null;
    return { n: parseInt(m[1]), maxDiscard: parseInt(m[2]) };
  }

  // "Choose 1 character on your opponent's Front Line with BP N or less and retire it. If there
  // is a <NAME> on your area, it's BP M or less instead." — common Event/On-Play text with an
  // optional name-gated BP-threshold upgrade.
  function matchRetireEnemyConditional(fx) {
    let m = fx.match(/Choose (?:up to )?1 character on your opponent'?s Front Line with [\["]?BP (\d+) or less[\]"]? and (?:retire it|sideline it|Outside Area it)\.?(?:\s*If there is an? <([^>]+)> on your area, it'?s [\["]?BP (\d+) or less[\]"]? instead\.?)?/i);
    if (m) return { baseBP: parseInt(m[1]), name: m[2] || null, upgradedBP: m[3] ? parseInt(m[3]) : null };
    // newer-series word order: "Choose 1 character with 3000 or less BP on your opponent's
    // front line and retire/sideline/Outside-Area it. If <NAME> is on your area, 5000 or less BP instead."
    m = fx.match(/Choose (?:up to )?1 character with (\d+) or less BP on your opponent'?s Front Line and (?:retire it|sideline it|Outside Area it)\.?(?:\s*If <([^>]+)> is on your area, (\d+) or less BP instead\.?)?/i);
    if (m) return { baseBP: parseInt(m[1]), name: m[2] || null, upgradedBP: m[3] ? parseInt(m[3]) : null };
    return null;
  }
  // bare (no "[On Play]" prefix) debuff/rest text, common on Event cards.
  function matchBareDebuffEnemy(fx) {
    const m = fx.match(/^Choose (?:up to )?1 character on your opponent'?s Front Line,\s*it (?:gets|gains) [\["]?-(\d+) ?BP[\]"]? during this turn\.?$/i);
    return m ? parseInt(m[1]) : null;
  }
  // "Choose up to 1 character on your opponent's area with BP N or higher/less, it gets -M BP
  // during this turn." — targets BOTH lines (not just Front Line).
  function matchDebuffEnemyAny(fx) {
    const m = fx.match(/Choose (?:up to )?1 character on your opponent'?s area with BP (\d+) or (higher|more|less)\s*,?\s*it (?:gets|gains) -(\d+) ?BP during this turn\.?/i);
    if (!m) return null;
    const threshold = parseInt(m[1]), delta = -parseInt(m[3]);
    return /higher|more/i.test(m[2]) ? { min: threshold, delta } : { max: threshold, delta };
  }
  function matchBareRestEnemy(fx) {
    return /^Choose (?:up to )?1 character on your opponent'?s Front Line and rest it\.?$/i.test(fx);
  }
  // "Choose (up to) 1 character on your opponent's Front Line with BP N or less and return it to
  // the hand." — enemy bounce with BP cap (Event or [On Play])
  function matchBounceEnemy(fx) {
    const m = fx.match(/Choose (?:up to )?1 character on your opponent'?s Front Line with BP (\d+) or less and return it to (?:the|your opponent'?s) hand\.?/i);
    return m ? parseInt(m[1]) : null;
  }
  async function bounceEnemyFront(p, bpLimit) {
    const enemy = Engine.opponentOf(p);
    const units = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && !u.tempUntargetable && (bpLimit == null || Engine.bp(u) <= bpLimit));
    if (!units.length) return null;
    const uid = await p.controller.chooseEnemyCharacter(p, units, `เลือก character ศัตรู (BP ${bpLimit ?? '-'} หรือน้อยกว่า) กลับมือ`, true);
    const u = units.find(x => x.uid === uid);
    if (u) { await Engine.returnUnitToHand(enemy, u); log(`${p.name}: ${u.card.name} ถูกส่งกลับมือ`); }
    return u;
  }
  // "un-raids" the top layer of a Raid-stacked unit: the current top card goes to Outside Area,
  // revealing whatever card was stacked underneath (which becomes the new live unit, keeping the
  // same uid so board position/UI stays stable). Returns the newly-exposed unit, or null if
  // `unit` had no Raid stack (`.under` empty).
  async function unraidTopLayer(owner, unit) {
    if (!unit.under.length) return null;
    const lineArr = owner.front.includes(unit) ? owner.front : owner.energy;
    const idx = lineArr.indexOf(unit);
    if (idx < 0) return null;
    const newNo = unit.under.shift();
    owner.sideline.push(unit.no);
    const newUnit = {
      uid: unit.uid, no: newNo, card: UAData.byNo.get(newNo), rested: unit.rested, under: unit.under,
      counters: [], bpMod: 0, bpPersist: 0, tempImpact: 0, tempDmg: 0, tempGen: 0, tempFrontGen: false,
      frontGenPersist: false, retireAtEndOfMain: false, retireAtEndOfTurn: false, noBlock: false,
      skipNextStand: false, noRetire: false, tempSnipe: false, tempUnblockableBP: null, tempUnblockableBPMin: null,
      effectsNullified: false, enteredTurn: Engine.G.turn, attackedThisTurn: 0, blockedThisTurn: 0,
      kw: Engine.parseKeywords(UAData.byNo.get(newNo)),
    };
    lineArr[idx] = newUnit;
    log(`${owner.name}: ${unit.card.name} ถูกส่งไป Outside Area เผย ${newUnit.card.name}`);
    return newUnit;
  }
  Object.assign(window.UAEffectHelpers, { bounceEnemyFront, unraidTopLayer });

  const origOnPlay = Effects.onPlay.bind(Effects);
  async function dispatchOnPlay(G, p, unit) {
    if (unit.card.trigger === 'Get') p._getPlayedThisTurn = true; // tracked for "if a [Get] character was played this turn" cards
    if (Effects.registry[unit.no]?.onPlay) return origOnPlay(G, p, unit);
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
    } else if ((dd = matchScryDiscardTop(fx))) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      await lookTopAndDiscard(p, dd.n, dd.maxDiscard, `${unit.card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
    } else if ((m = fx.match(RX.onplayBuffOther))) {
      await buffOwnCharacter(p, parseInt(m[2]), { excludeUnit: m[1] ? unit : null });
    } else if ((m = fx.match(RX.onplayDebuffEnemy))) {
      await debuffEnemyFront(p, -parseInt(m[1]));
    } else if ((dd = matchDebuffEnemyAny(fx))) {
      await debuffEnemyAny(p, dd.delta, dd);
    } else if ((m = fx.match(RX.onplayRestEnemy))) {
      await restEnemyFront(p, m[1] ? parseInt(m[1]) : null);
    } else if ((m = fx.match(RX.bounceSelfOrOther))) {
      await bounceSelfOrOther(p, unit, parseInt(m[1] || m[2] || m[3]));
    } else if ((rc = matchRetireEnemyConditional(fx))) {
      const limit = rc.name && hasCardNamed(p, rc.name) ? rc.upgradedBP : rc.baseBP;
      await retireEnemyFront(p, limit);
    } else if ((dd = matchCondDraw(fx))) {
      const pred = buildCardPredicate(dd.criteria);
      const pool = dd.zone === 'front' ? p.front : [...p.front, ...p.energy];
      const count = pool.filter(u => u !== unit && pred(u.card)).length;
      if (count >= dd.n) { draw(p, dd.drawN); log(`[On Play] ${unit.card.name}: จั่ว ${dd.drawN} ใบ`); }
    } else if ((dd = matchFreePlayFromHand(fx))) {
      const pred = buildCardPredicate(dd.criteria);
      const idx = p.hand.findIndex(no => {
        const c = UAData.byNo.get(no);
        return c && pred(c) && (c.need || 0) <= dd.maxNeed && (dd.apCost == null || (c.ap || 0) === dd.apCost);
      });
      if (idx >= 0) {
        const c = UAData.byNo.get(p.hand[idx]);
        const opt = await p.controller.chooseOption(p, `${unit.card.name}: ลง ${c.name} ลงสนามฟรีไหม?`,
          [{ label: `ลง ${c.name} (rested)`, value: true }, { label: 'ข้าม', value: false }]);
        if (opt) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: dd.line || 'energy', active: false });
      }
    } else if ((dd = matchDiscardFetch(fx))) {
      const pred = buildCardPredicate(dd.criteria);
      const full = c => c && pred(c) && (dd.maxNeed == null || (c.need || 0) <= dd.maxNeed);
      if (p.sideline.some(no => full(UAData.byNo.get(no)))) {
        const discarded = await discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อดึงการ์ดจาก Outside Area? (ไม่บังคับ)`);
        if (discarded) await fetchFromSideline(p, full, `${unit.card.name}: เลือกการ์ดจาก Outside Area`);
      }
    } else if ((dd = matchFetchOutside(fx))) {
      const pred = buildCardPredicate(dd.criteria);
      await fetchFromSideline(p, c => c && pred(c), `${unit.card.name}: เลือกการ์ดจาก Outside Area เข้ามือ`);
    } else if ((m = fx.match(/^\[On Play\]\s*If a character was retired during this turn, draw (\d+)(?: cards?)?\.?$/i))) {
      if (Engine.G.retiredThisTurn) { draw(p, parseInt(m[1])); log(`[On Play] ${unit.card.name}: จั่ว ${m[1]} ใบ`); }
    } else if ((m = fx.match(/^\[On Play\]\s*If a character was retired during this turn, choose (?:up to )?1 character (?:on|from) your opponent'?s Front Line, it gets -(\d+) ?BP during this turn\.?$/i))) {
      if (Engine.G.retiredThisTurn) await debuffEnemyFront(p, -parseInt(m[1]));
    } else if (/^\[On Play\]/i.test(fx) && (m = matchBounceEnemy(fx))) {
      await bounceEnemyFront(p, m);
    } else if ((rc = matchAllOwnBuff(fx))) {
      const pool = rc.zone === 'front' ? p.front : [...p.front, ...p.energy];
      for (const u of pool) u.bpMod += rc.amount;
      log(`[On Play] ${unit.card.name}: character ทุกตัวของคุณ +${rc.amount} BP เทิร์นนี้`);
    } else if ((m = matchPlainMillOutside(fx))) {
      const n = Math.min(m, p.deck.length);
      if (n) {
        const sent = p.deck.splice(0, n);
        p.sideline.push(...sent);
        p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + sent.length;
        log(`[On Play] ${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
      }
    }
  }

  // wraps dispatchOnPlay so the "when a card is played" broadcast (onAnyPlay) always fires exactly
  // once per play regardless of which of onPlay's 4 call sites triggered it (playCard/raidCard/
  // raidFromTrigger/playCardFromZone), and regardless of whether a per-card registry.onPlay exists.
  Effects.onPlay = async function (G, p, unit) {
    await dispatchOnPlay(G, p, unit);
    for (const u of [...p.front, ...p.energy]) {
      if (u === unit) continue;
      const h = Effects.registry[u.no]?.onAnyPlay;
      if (h) await h(G, p, unit, u);
    }
  };

  // ---------- generic [When Attacking] patterns ----------
  const origOnAttack = Effects.onAttack.bind(Effects);
  Effects.onAttack = async function (G, p, unit) {
    if (unit.effectsNullified) return;
    if (this.registry[unit.no]?.onAttack) return origOnAttack(G, p, unit);
    const fx = findClause(unit.card.effect, /^\[When Attacking\]/i);
    if (!fx) return;
    let m;
    // "[When Attacking] Draw N card(s)." — plain draw
    if ((m = fx.match(/^\[When Attacking\]\s*Draw (\d+)(?: cards?)?\.?$/i))) {
      draw(p, parseInt(m[1]));
      log(`[When Attacking] ${unit.card.name}: จั่ว ${m[1]} ใบ`);
      return;
    }
    // "[When Attacking] Draw N card(s), place M card(s) from your hand to the Outside Area."
    if ((m = fx.match(/^\[When Attacking\]\s*Draw (\d+) cards?,?\s*(?:and\s*|then\s*)?(?:place|put) (\d+) cards? from (?:your )?hand/i))) {
      draw(p, parseInt(m[1]));
      log(`[When Attacking] ${unit.card.name}: จั่ว ${m[1]} ใบ`);
      const toRemoval = /remove area/i.test(fx);
      for (let i = 0; i < parseInt(m[2]); i++) {
        if (toRemoval) await manualDiscardToRemoval(p); else await discardFromHand(p);
      }
    } else if ((m = matchAttackBuff(fx))) {
      const pred = buildCardPredicate(m.criteria);
      const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && pred(u.card));
      if (!units.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, units, `เลือก character รับ +${m.amount} BP เทิร์นนี้`, true);
      const t = units.find(x => x.uid === uid);
      if (t) { t.bpMod += m.amount; log(`[When Attacking] ${unit.card.name}: ${t.card.name} +${m.amount} BP เทิร์นนี้`); await Engine.checkBpZero(); }
    } else if ((m = matchAttackSelfBuff(fx))) {
      unit.bpMod += m;
      log(`[When Attacking] ${unit.card.name}: +${m} BP เทิร์นนี้`);
    }
  };

  const origOnEvent = Effects.onEvent.bind(Effects);
  // tries `matcherFn` against every '@'-separated (normalized) segment of `effect` in turn,
  // returning the first non-null result — lets Event cards reuse the onPlay-style matchers even
  // though Events have no "[On Play]" marker to anchor a single findClause() lookup.
  function findSeg(effect, matcherFn) {
    for (const seg of (effect || '').split('@').map(s => normalizeFx(s.trim()))) {
      const r = matcherFn(seg);
      if (r) return r;
    }
    return null;
  }

  Effects.onEvent = async function (G, p, card) {
    if (this.registry[card.no]?.onEvent) return origOnEvent(G, p, card);
    const fx = firstLine(card.effect);
    let m, rc, dd;
    if ((m = findMatch(card.effect, RX.apActive))) {
      await apUntap(p, parseInt(m[1]));
    } else if ((rc = matchRetireEnemyConditional(fx))) {
      const limit = rc.name && hasCardNamed(p, rc.name) ? rc.upgradedBP : rc.baseBP;
      await retireEnemyFront(p, limit);
    } else if ((m = matchBareDebuffEnemy(fx))) {
      await debuffEnemyFront(p, -m);
    } else if ((dd = matchDebuffEnemyAny(fx))) {
      await debuffEnemyAny(p, dd.delta, dd);
    } else if (matchBareRestEnemy(fx)) {
      await restEnemyFront(p);
    } else if ((m = matchBounceEnemy(fx))) {
      await bounceEnemyFront(p, m);
    } else if ((dd = findSeg(card.effect, matchDrawDiscard))) {
      draw(p, dd.drawN);
      log(`${card.name}: จั่ว ${dd.drawN} ใบ`);
      for (let i = 0; i < dd.discardN; i++) {
        if (dd.toRemoval) await manualDiscardToRemoval(p); else await discardFromHand(p);
      }
    } else if ((dd = findSeg(card.effect, matchLookAtTopFetch))) {
      log(`${card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      const taken = await lookTopAndTake(p, dd.n, dd.predicate, dd.maxPick, `${card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      if (taken.length && dd.hasDiscard) await discardFromHand(p);
    } else if (findSeg(card.effect, matchScryTopOutside)) {
      log(`${card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'outside']);
    } else if (findSeg(card.effect, matchScryTopBottom)) {
      log(`${card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'bottom']);
    } else if ((dd = findSeg(card.effect, matchScryDiscardTop))) {
      log(`${card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
      await lookTopAndDiscard(p, dd.n, dd.maxDiscard, `${card.name}: ดูการ์ดบนสุด ${dd.n} ใบ`);
    } else {
      log(`Event ${card.name}: ${fx} (ทำ effect ตามการ์ด — manual)`);
      if (!p.controller.isBot) {
        await p.controller.chooseOption(p, `Event: ${card.name}`,
          [{ label: 'รับทราบ — ทำตามข้อความการ์ดเอง', value: 1 }],
          `<p class="fx" style="white-space:pre-wrap">${UAData.fxText(card.effect || '')}</p>`);
      }
    }
  };

  // ---------- generic passive BP bonuses ----------
  // Conditional always-on BP boosts, re-evaluated live every time Engine.bp() is read:
  //   "[Your Turn] This character gets +N BP."
  //   "[Your Turn] If there is a <NAME> on your area, this character gets +N BP."
  //   "[Your Turn] If there are N or more (other) <Trait:X>/<NAME> cards on your area/Front Line, ..."
  //   "[Opponent's Turn] This character gets +N BP."
  //   "If you have N or more cards in your hand, this character gets +N BP."
  //   "If there are N or more (other) <...> cards on your area/field, this character gets +N BP."
  // Parsed once per card number and cached (bp() is called from render loops and bot sorting).
  const bpEvalCache = new Map();

  function parseZone(zoneWord) { return /front/i.test(zoneWord || '') ? 'front' : 'field'; }

  // "<NAME> and/or other <Trait:X>" combined condition (KMY's Hashira-synergy cards): counts each
  // matching unit once whether it matches by name or by trait, excluding the evaluated unit itself
  // from the trait side only (mirrors the printed "and/or OTHER <Trait:X>" wording).
  function countNameOrTrait(owner, unit, { name, trait, zone }) {
    const pool = zone === 'front' ? owner.front : [...owner.front, ...owner.energy];
    return pool.filter(u => {
      const nameHit = (u.card.name || '').includes(name);
      const traitHit = trait && u !== unit && (u.card.traits || '').toLowerCase().includes(trait);
      return nameHit || traitHit;
    }).length;
  }

  function countMatching(owner, unit, { name, altName, trait, other, zone }) {
    const pool = zone === 'front' ? owner.front : [...owner.front, ...owner.energy];
    return pool.filter(u => {
      if (other && u === unit) return false;
      if (name) {
        const hits = n => (u.card.name || '').includes(n) || (u.kw?.alsoTreatedAs || []).some(a => a.includes(n));
        if (!hits(name) && !(altName && hits(altName))) return false;
      }
      if (trait && !(u.card.traits || '').toLowerCase().includes(trait)) return false;
      return true;
    }).length;
  }

  function buildBpEvaluator(card) {
    const rules = [];
    for (const clause of (card.effect || '').split('@').map(s => normalizeFx(s.trim()))) {
      let m;
      let when = 'always';
      let rest = clause;
      if ((m = rest.match(/^\[Your Turn\]\s*(.*)$/i))) { when = 'my'; rest = m[1]; }
      else if ((m = rest.match(/^\[Opponent'?s Turn\]\s*(.*)$/i))) { when = 'opp'; rest = m[1]; }

      // unconditional: "This character gets/gains +N BP." (or bare "This Character +1000BP.") — also
      // covers a turn-gated negative flat modifier like "[Opponent's Turn] This character gains -1500 BP."
      if ((m = rest.match(/^This [Cc]haracter (?:(?:gets|gains) )?([+-]?\d+) ?BP\.?$/i))) {
        if (when !== 'always') rules.push({ when, cond: null, amount: parseInt(m[1]) }); // always-on flat bonus would be printed BP, skip
        continue;
      }
      // "If there is a character with <NAME> in its name on your area, ... +N BP."
      if ((m = rest.match(/^If there is a character with <([^>]+)>(?: or <([^>]+)>)? in its name (?:on|in) (?:your area|the same line|your field|your Front Line), this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { name: m[1].trim(), altName: m[2] ? m[2].trim() : null, n: 1, zone: 'field' }, amount: parseInt(m[3]) });
        continue;
      }
      // "If there is a <NAME> on your area/Front Line, this character gets +N BP." (or "If you
      // have <NAME> on your area, ...")
      if ((m = rest.match(/^If (?:there is an?|you have) <([^>]+)> (?:card )?on your (area|field|Front Line)(?: or [^,]+)?, this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        const name = m[1].trim();
        if (/^Trait:?/i.test(name)) {
          rules.push({ when, cond: { trait: name.replace(/^Trait:?\s*/i, '').toLowerCase(), n: 1, zone: parseZone(m[2]) }, amount: parseInt(m[3]) });
        } else {
          rules.push({ when, cond: { name, n: 1, zone: parseZone(m[2]) }, amount: parseInt(m[3]) });
        }
        continue;
      }
      // "If there are N or more (other) <Trait:X>/<NAME> cards/characters on/in your area/field/Front Line, ... +N BP"
      if ((m = rest.match(/^If (?:there are|you have) (\d+) or more (other )?<([^>]+)>(?: (?:cards?|characters?))?(?: with different names)? (?:on|in) your (area|field|Front Line), this character (?:gets|gains) (?:BP)?\+(\d+) ?(?:BP)?\.?$/i))) {
        const raw = m[3].trim();
        const cond = { n: parseInt(m[1]), other: !!m[2], zone: parseZone(m[4]) };
        if (/^Trait:?/i.test(raw)) cond.trait = raw.replace(/^Trait:?\s*/i, '').toLowerCase();
        else cond.name = raw;
        if (/with different names/i.test(rest)) cond.differentNames = true;
        rules.push({ when, cond, amount: parseInt(m[5]) });
        continue;
      }
      // "If you have N or more cards in your hand, this character gets +N BP."
      if ((m = rest.match(/^If you have (\d+) or more cards in your hand, this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { hand: parseInt(m[1]) }, amount: parseInt(m[2]) });
        continue;
      }
      // "If there are a total of N or more <NAME> and/or other <Trait:X> cards on your area, this
      // character gets +N BP." (KMY's Hashira-synergy phrasing)
      if ((m = rest.match(/^If there (?:are|is) a total of (\d+) or more <([^>]+)> (?:and\/or other|and) <Trait:?\s*([^>]+)>(?: (?:cards?|characters?))? (?:on|in) your (area|field|Front Line), this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { nameOrTrait: { name: m[2].trim(), trait: m[3].trim().toLowerCase() }, n: parseInt(m[1]), zone: parseZone(m[4]) }, amount: parseInt(m[5]) });
        continue;
      }
      // "If you placed a card from your hand (or deck) to the Outside Area during this turn, this character gets +N BP."
      if ((m = rest.match(/^If you placed (?:a|1) cards? from your (?:hand or deck|hand|deck) to the Outside Area during this turn, this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { placedOutside: true }, amount: parseInt(m[1]) });
        continue;
      }
      // "If your opponent's Life is N or less, this character gets/gains +M BP."
      if ((m = rest.match(/^If your opponent'?s Life is (\d+) or less, this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { oppLifeMax: parseInt(m[1]) }, amount: parseInt(m[2]) });
        continue;
      }
      // "If there is a character on your opponent's area/Front Line with BP N or more, this
      // character gets/gains +M BP."
      if ((m = rest.match(/^If there is a character on your opponent'?s (area|field|Front Line) with BP (\d+) or more, this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { oppBpMin: parseInt(m[2]), zone: parseZone(m[1]) }, amount: parseInt(m[3]) });
        continue;
      }
      // "If there are N or more other characters on your area/Front Line, this character gets/gains
      // +M BP." — bare count, no name/trait qualifier (unlike the <NAME>/<Trait:X> rule above).
      if ((m = rest.match(/^If there are (\d+) or more other characters (?:on|in) your (area|field|Front Line), this character (?:gets|gains) \+(\d+) ?BP\.?$/i))) {
        rules.push({ when, cond: { bareOtherCount: parseInt(m[1]), zone: parseZone(m[2]) }, amount: parseInt(m[3]) });
        continue;
      }
    }
    if (!rules.length) return null;
    return (owner, unit) => {
      const myTurn = Engine.G.players[Engine.G.active] === owner;
      let total = 0;
      for (const r of rules) {
        if (r.when === 'my' && !myTurn) continue;
        if (r.when === 'opp' && myTurn) continue;
        if (r.cond) {
          if (r.cond.hand != null) { if (owner.hand.length < r.cond.hand) continue; }
          else if (r.cond.placedOutside) { if (!owner._placedToOutsideThisTurn) continue; }
          else if (r.cond.nameOrTrait) { if (countNameOrTrait(owner, unit, { ...r.cond.nameOrTrait, zone: r.cond.zone }) < r.cond.n) continue; }
          else if (r.cond.oppLifeMax != null) { if ((Engine.opponentOf(owner).life || []).length > r.cond.oppLifeMax) continue; }
          else if (r.cond.oppBpMin != null) {
            const enemy = Engine.opponentOf(owner);
            const pool = r.cond.zone === 'front' ? enemy.front : [...enemy.front, ...enemy.energy];
            if (!pool.some(u => u.card.type === 'Character' && Engine.bp(u) >= r.cond.oppBpMin)) continue;
          }
          else if (r.cond.bareOtherCount != null) {
            const pool = r.cond.zone === 'front' ? owner.front : [...owner.front, ...owner.energy];
            if (pool.filter(u => u !== unit && u.card.type === 'Character').length < r.cond.bareOtherCount) continue;
          }
          else if (r.cond.differentNames) {
            const pool = r.cond.zone === 'front' ? owner.front : [...owner.front, ...owner.energy];
            const names = new Set(pool.filter(u => (!r.cond.other || u !== unit) &&
              (!r.cond.trait || (u.card.traits || '').toLowerCase().includes(r.cond.trait)) &&
              (!r.cond.name || (u.card.name || '').includes(r.cond.name))).map(u => u.card.name));
            if (names.size < r.cond.n) continue;
          }
          else if (countMatching(owner, unit, r.cond) < r.cond.n) continue;
        }
        total += r.amount;
      }
      return total;
    };
  }

  Effects.genericBpBonus = function (owner, unit) {
    if (!bpEvalCache.has(unit.no)) bpEvalCache.set(unit.no, buildBpEvaluator(unit.card));
    const f = bpEvalCache.get(unit.no);
    return f ? f(owner, unit) : 0;
  };
  // introspection for coverage tooling: does this card's text parse into any passive BP rule?
  Effects.hasGenericBp = function (card) {
    if (!bpEvalCache.has(card.no)) bpEvalCache.set(card.no, buildBpEvaluator(card));
    return !!bpEvalCache.get(card.no);
  };

  // ---------- generic conditional energy generation ----------
  // "If there are N or more (other) <Trait:X> (cards) in/on your field/area, this field/character
  // generates additional N [color] energy." — evaluated live from the energy line.
  const genEvalCache = new Map();
  function buildGenEvaluator(card) {
    for (const clause of (card.effect || '').split('@').map(s => normalizeFx(s.trim()))) {
      const m = clause.match(/^If there are (\d+) or more (other )?<Trait:?\s*([^>]+)> (?:cards? |characters? )?(?:on|in) your (?:area|field), this (?:field|character|card)'?s? generates? additional (\d+)/i);
      if (m) {
        const need = parseInt(m[1]), other = !!m[2], trait = m[3].trim().toLowerCase(), amt = parseInt(m[5]);
        return (owner, unit) => {
          const n = [...owner.front, ...owner.energy].filter(u => (!other || u !== unit) &&
            (u.card.traits || '').toLowerCase().includes(trait)).length;
          return n >= need ? amt : 0;
        };
      }
    }
    return null;
  }
  Effects.genericGenMod = function (owner, unit) {
    if (!genEvalCache.has(unit.no)) genEvalCache.set(unit.no, buildGenEvaluator(unit.card));
    const f = genEvalCache.get(unit.no);
    return f ? f(owner, unit) : 0;
  };
  Effects.hasGenericGen = function (card) {
    if (!genEvalCache.has(card.no)) genEvalCache.set(card.no, buildGenEvaluator(card));
    return !!genEvalCache.get(card.no);
  };

  // ---------- generic "also generates energy on the Front Line" (conditional) ----------
  // The unconditional form ("This character also generates energy on the Front Line.", printed
  // with no gating clause) is handled as a static keyword (kw.frontGen, parsed in engine.js) since
  // it never changes. This evaluator covers the live-conditional self forms — re-checked every
  // time Engine.energyGen() reads the front line, same pattern as genericBpBonus.
  const frontGenEvalCache = new Map();
  function buildFrontGenEvaluator(card) {
    const grantTail = '(?:generates? energy (?:on|when in) (?:your |the )?Front Line|["“]This character (?:also |can )?generates? energy (?:on|when in) (?:your |the )?Front Line["”]?)\\.?$';
    for (const clause of (card.effect || '').split('@').map(s => normalizeFx(s.trim()))) {
      let rest = clause;
      let when = 'always';
      let m;
      if ((m = rest.match(/^\[Your Turn\]\s*(.*)$/i))) { when = 'my'; rest = m[1]; }
      else if ((m = rest.match(/^\[Opponent'?s Turn\]\s*(.*)$/i))) { when = 'opp'; rest = m[1]; }

      // "If there is another character on the/your Front Line, this character also generates..."
      if (new RegExp('^If there is another character on (?:the|your) Front Line, this character (?:also |can )?' + grantTail, 'i').test(rest))
        return (owner, unit) => owner.front.some(u => u !== unit);

      // "If there is a character with "NAME" in its name [and a character with "NAME2" in its
      // name] on/in your area, this character gains/gets '...generates energy on Front Line...'"
      m = rest.match(/^If there is a character with ["“]([^"”]+)["”] in its name(?: and a character with ["“]([^"”]+)["”] in its name)? (?:on|in) your area, this character (?:gets|gains) /i);
      if (m && new RegExp(grantTail, 'i').test(rest)) {
        const n1 = m[1].trim(), n2 = m[2] ? m[2].trim() : null;
        return (owner) => {
          const pool = [...owner.front, ...owner.energy];
          const hit = n => pool.some(u => (u.card.name || '').includes(n));
          return hit(n1) && (!n2 || hit(n2));
        };
      }

      // "If there is a <NAME> (on|in) your area/Outside Area, this character gets/gains '...Front Line...'"
      m = rest.match(/^If there is (?:an? )?<([^>]+)> (?:on|in) your area, this character (?:gets|gains) /i);
      if (m && new RegExp(grantTail, 'i').test(rest)) {
        const name = m[1].trim();
        return (owner) => [...owner.front, ...owner.energy].some(u => (u.card.name || '').includes(name));
      }

      // "If there are N or more (other) <Trait:X> cards on your area, this character (also/can)
      // generates energy on the Front Line" (mirrors the plain-BP evaluator's count-gate)
      m = rest.match(/^If there are (\d+) or more (other )?<Trait:?\s*([^>]+)> (?:cards?|characters?) (?:on|in) your area, this character (?:also |can )?/i);
      if (m && new RegExp(grantTail, 'i').test(rest)) {
        const need = parseInt(m[1]), other = !!m[2], trait = m[3].trim().toLowerCase();
        return (owner, unit) => [...owner.front, ...owner.energy].filter(u =>
          (!other || u !== unit) && (u.card.traits || '').toLowerCase().includes(trait)).length >= need;
      }
    }
    return null;
  }
  Effects.genericFrontGen = function (owner, unit) {
    if (!frontGenEvalCache.has(unit.no)) frontGenEvalCache.set(unit.no, buildFrontGenEvaluator(unit.card));
    const f = frontGenEvalCache.get(unit.no);
    return f ? !!f(owner, unit) : false;
  };
  Effects.hasGenericFrontGen = function (card) {
    if (!frontGenEvalCache.has(card.no)) frontGenEvalCache.set(card.no, buildFrontGenEvaluator(card));
    return !!frontGenEvalCache.get(card.no);
  };

  // "[When in Frontline] You may extra draw without paying AP." — a per-card registry declaration
  // (`freeExtraDraw: true`) checked live from the Start Phase's extra-draw step, rather than a hook
  // function, since the grant is a simple static flag with no board-state condition to evaluate.
  Effects.hasFreeExtraDraw = function (p) {
    return p.front.some(u => Effects.registry[u.no]?.freeExtraDraw);
  };

  // ---------- generic [Main] and [On Retire] patterns ----------
  function matchOnMain(card) {
    const fx = findClause(card.effect, /^\[Main\]/i);
    if (!fx) return null;
    let m;
    if ((m = fx.match(RX_SELF_GEN_RETIRE))) return { kind: 'selfGenRetire', n: parseInt(m[1]) };
    if (fx.match(RX_SELF_GEN_RETIRE2)) return { kind: 'selfGenRetire', n: 1 };
    // HTR-style: "This character generates 1 additional [blue] energy. At the end of the main phase, retire this character."
    if ((m = fx.match(/^\[Main\]\s*\[Rest this card\]\s*\[1 Per Turn\]\s*(?:During this turn,\s*)?this (?:character|field) generates (\d+) additional (?:\[?\w+\]?\s*)?energy\.?\s*At the end of the [Mm]ain [Pp]hase, retire this (?:character|field)\.?$/i)))
      return { kind: 'selfGenRetire', n: parseInt(m[1]) };
    if ((m = fx.match(RX.mainRestBuffOther))) return { kind: 'restBuffOther', n: parseInt(m[1]) };
    if ((m = fx.match(RX.mainDiscardImpact))) return { kind: 'discardImpact', discardN: parseInt(m[1]), impact: parseInt(m[2]) };
    // "[Main] [Rest this card] Look at the top card / 1 card from the top ... top or bottom"
    if (/^\[Main\]\s*\[Rest this card\]\s*Look at (?:the top card|1 card from the top|the top 1 cards?) of your deck/i.test(fx) &&
        /top or bottom|top of[^.]*bottom/i.test(fx))
      return { kind: 'restScryTopBottom' };
    // "[Main] [Pay N AP] [1 Per Turn] Draw N card(s)."
    if ((m = fx.match(/^\[Main\]\s*\[Pay (\d+) AP\]\s*\[1 Per Turn\]\s*Draw (\d+)(?: cards?)?\.?$/i)))
      return { kind: 'payApDraw', ap: parseInt(m[1]), drawN: parseInt(m[2]) };
    // "[Main] [Rest this card] Choose 1 character on your opponent's Front Line, it gets -N BP during this turn"
    if ((m = fx.match(/^\[Main\]\s*\[Rest this card\]\s*Choose (?:up to )?1 (?:character on your opponent'?s Front Line|of your opponent'?s Front Line [Cc]haracters?),? it gets -(\d+) ?BP during this turn\.?$/i)))
      return { kind: 'restDebuffEnemy', n: parseInt(m[1]) };
    return null;
  }

  const origOnMain = Effects.onMain.bind(Effects);
  Effects.onMain = async function (G, p, unit) {
    if (unit.effectsNullified) return;
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
    } else if (mm.kind === 'restScryTopBottom') {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await scryTop(p, ['top', 'bottom']);
    } else if (mm.kind === 'payApDraw') {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!Engine.payAP(p, mm.ap)) { p.controller.notify?.('AP ไม่พอ'); return; }
      unit._usedTurn = Engine.G.turn;
      draw(p, mm.drawN);
      log(`${unit.card.name}: จ่าย ${mm.ap} AP จั่ว ${mm.drawN} ใบ`);
    } else if (mm.kind === 'restDebuffEnemy') {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await debuffEnemyFront(p, -mm.n);
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
    let m = fx.match(RX.onRetireDraw);
    if (m) { draw(p, parseInt(m[1])); log(`[On Retire] ${unit.card.name}: จั่ว ${m[1]} ใบ`); return; }
    // "[On Retire] Draw N card(s), place M card(s) from your hand to the Outside Area."
    if ((m = fx.match(/^\[On Retire\]\s*Draw (\d+)(?: cards?)?(?:,| and| then|, then)\s*(?:place|put) (\d+) cards? from (?:your )?hand/i))) {
      draw(p, parseInt(m[1]));
      log(`[On Retire] ${unit.card.name}: จั่ว ${m[1]} ใบ`);
      const toRemoval = /remove area/i.test(fx);
      for (let i = 0; i < parseInt(m[2]); i++) {
        if (toRemoval) await manualDiscardToRemoval(p); else await discardFromHand(p);
      }
      return;
    }
    // "[On Retire] Choose 1 character on your opponent's Front Line and rest it."
    if (/^\[On Retire\]\s*Choose (?:up to )?1 character on your opponent'?s Front Line and rest it\.?$/i.test(fx)) {
      await restEnemyFront(p);
      return;
    }
    // "[On Retire] Choose up to 1 other character on your area, it gets +N BP during this turn."
    if ((m = fx.match(/^\[On Retire\]\s*Choose (?:up to )?1 other character on your area,?\s*it (?:gets|gains) \+(\d+) ?BP during this turn\.?$/i))) {
      await buffOwnCharacter(p, parseInt(m[1]), { excludeUnit: unit });
      return;
    }
    // "[On Retire] Place N cards from the top of your deck to the Outside Area." (unconditional mill)
    if ((m = matchPlainMillOutside(fx))) {
      const n = Math.min(m, p.deck.length);
      if (n) {
        const sent = p.deck.splice(0, n);
        p.sideline.push(...sent);
        p._placedToOutsideThisTurn = (p._placedToOutsideThisTurn || 0) + sent.length;
        log(`[On Retire] ${unit.card.name}: ส่งการ์ดบนสุดของเด็ค ${n} ใบไป Outside Area`);
      }
    }
  };
})();
