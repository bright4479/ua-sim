// ══════════ UA SIM — Game Engine (Official Rule Manual Ver 1.1) ══════════
// Turn-based engine. Each player has a "controller" (human UI or bot) that
// answers decision prompts as Promises.

const Engine = (() => {
  let uidSeq = 1;

  // ---------- keyword parsing from effect text ----------
  function parseKeywords(c) {
    const fx = (c.effect || '');
    const kw = {
      step: /\[Step\]/i.test(fx),
      snipe: /\[Snipe\]/i.test(fx),
      doubleAttack: /\[Double Attack\]/i.test(fx),
      doubleBlock: /\[Double Block\]/i.test(fx),
      nullifyImpact: /\[(Nullify Impact|Impact Negate)\]/i.test(fx),
      impact: 0,
      dmg: 1,
      raidTargets: [],
      entersActive: false,       // "This character/Field is played in active."
      entersActiveIf: null,      // conditional variant: {kind:'name'|'traitCount', ...}
      unblockableBP: null,       // "This character cannot be blocked by characters with BP N or less."
      unblockableBPMin: null,    // "This character cannot be blocked by characters with BP N or more."
      alsoTreatedAs: [],         // "This card is also treated as <NAME>" — for Raid name-matching
      frontGen: false,           // "This character also generates energy on the Front Line." (unconditional)
      untargetable: false,       // "cannot be chosen by your opponent's (character's) effect / Event Card" (approximated as full immunity)
      cannotBlock: false,        // "This character cannot block." (permanent, unlike the per-turn unit.noBlock field)
      cannotAttack: false,       // "This character cannot attack." (permanent)
      unblockableByRaided: false, // "This character cannot be blocked by characters in raided state." (permanent)
      cannotMove: false,          // "This character cannot move." (permanent)
      cannotEnterFront: false,    // "This card cannot be played to the Front Line." (permanent)
    };
    const im = fx.match(/\[Impact\s*\(?(\d)\)?\s*\]/i);
    if (im) kw.impact = parseInt(im[1]);
    else if (/\[Impact\]/i.test(fx)) kw.impact = 1;
    const dm = fx.match(/\[Damage\s*\(?(\d)\)?\s*\]/i);
    if (dm) kw.dmg = parseInt(dm[1]);
    // [Raid] <Name> or [Raid] [Affinity]
    const raidLine = fx.match(/\[Raid\]\s*(<[^>]+>|\[[^\]]+\])/i);
    if (raidLine) {
      const t = raidLine[1];
      if (t.startsWith('<')) kw.raidTargets.push({ kind: 'name', value: t.slice(1, -1).trim() });
      else kw.raidTargets.push({ kind: 'trait', value: t.slice(1, -1).trim() });
    }
    // wording variants: "Play this field (to your area) in active." / "Play this site set to
    // active." / "Play this character set to active."
    if (/Play this (?:field|site|character|card) (?:to your area )?(?:in an? active(?: state)?|set to active|as active|and set (?:it|this character) to active)/i.test(fx)) kw.entersActive = true;
    if (/This (?:field|site|character|card) is played as active/i.test(fx)) kw.entersActive = true;
    if (/This (?:field|site|character|card) comes (?:in)?to play as [Aa]ctive/i.test(fx)) kw.entersActive = true;
    if (/This (?:field|site|character|card) is active when played (?:onto|to|in) (?:the|your) (?:field|area)/i.test(fx)) kw.entersActive = true;
    // "This character/Field is played in active." (sometimes gated by a condition clause first)
    if (/(?:this character|this field|this card) is played in active/i.test(fx)) {
      const nameCond = fx.match(/If there is a character on your area that includes <([^>]+)> in its name, (?:this character|this field) is played in active/i);
      const traitCond = fx.match(/If there are (\d+) or more <Trait:?\s*([^>]+)> cards? on your area, (?:this character|this field) is played in active/i);
      if (nameCond) kw.entersActiveIf = { kind: 'name', value: nameCond[1].trim() };
      else if (traitCond) kw.entersActiveIf = { kind: 'traitCount', n: parseInt(traitCond[1]), trait: traitCond[2].trim().toLowerCase() };
      else kw.entersActive = true;
    }
    // "This character cannot be blocked by characters with BP N or less." (or "N BP or less")
    const unblock = fx.match(/cannot be blocked by characters? with (?:BP ?(\d+)|(\d+) ?BP) or (?:less|lower)/i);
    if (unblock) kw.unblockableBP = parseInt(unblock[1] || unblock[2]);
    // ... or "BP N or more/higher" — the opposite direction (only weak characters may block).
    const unblockMin = fx.match(/cannot be blocked by characters? with (?:BP ?(\d+)|(\d+) ?BP) or (?:more|higher)/i);
    if (unblockMin) kw.unblockableBPMin = parseInt(unblockMin[1] || unblockMin[2]);
    // "This character cannot block." / "cannot attack." / "cannot attack or block." (permanent,
    // printed as its own bare clause — the combined form covers both flags from one match).
    {
      const cannotSeg = fx.split('@').find(seg => /^\s*\d*\s*This character cannot (?:attack|block)(?: or (?:attack|block))?\.?\s*$/i.test(seg.trim()));
      if (cannotSeg) {
        if (/attack/i.test(cannotSeg)) kw.cannotAttack = true;
        if (/block/i.test(cannotSeg)) kw.cannotBlock = true;
      }
    }
    // "This character cannot move." (permanent — blocks both Movement Phase moves and effect-driven moves)
    if (fx.split('@').some(seg => /^\s*\d*\s*This character cannot move\.?\s*$/i.test(seg.trim()))) kw.cannotMove = true;
    // "This character cannot be blocked by characters in raided state." (permanent)
    if (/cannot be blocked by characters? in raided state/i.test(fx)) kw.unblockableByRaided = true;
    // "This card cannot be played to the Front Line." (permanent zone restriction — hand-play only)
    if (/This card cannot be played to the Front Line\.?/i.test(fx)) kw.cannotEnterFront = true;
    // "This card is also treated as <NAME>" (alternate identity for Raid-target name matching)
    const treated = fx.matchAll(/This (?:card|character) (?:is )?also treated as <([^>]+)>/gi);
    for (const t of treated) kw.alsoTreatedAs.push(t[1].trim());
    // "This character (also/can) generates energy on/when in (your/the) Front Line." (unconditional,
    // self, printed as its own clause — conditional/granted-to-others variants are handled by
    // Effects.genericFrontGen in common.js, evaluated live)
    for (const clause of fx.split('@')) {
      if (/^\s*\d*\s*This character (?:also |can )?generates? energy (?:on|when in) (?:your |the )?Front Line\.?\s*$/i.test(clause.trim())) {
        kw.frontGen = true;
        break;
      }
    }
    // "cannot be chosen by your opponent's character's effect / Event Card (from hand) / effect" —
    // approximated as blanket immunity from opponent targeting (a slight over-grant when the
    // printed text is actually scoped to only Character-effects or only Event-cards, but safe).
    if (/cannot be chosen by your opponent'?s (?:character'?s effect|event card(?: from hand)?|event'?s effect|effect)/i.test(fx)) kw.untargetable = true;
    // "This character cannot be rested, moved or returned to the hand by your opponent's effects."
    // — a narrower bodyguard-style protection than full untargetability, approximated as the same
    // blanket kw.untargetable flag (slight over-grant, consistent with the approximation above).
    if (/cannot be rested,? moved,? or returned to (?:the|your) hand by (?:your )?opponent'?s effects/i.test(fx)) kw.untargetable = true;
    return kw;
  }

  // resolves whether a unit should enter active based on its (possibly conditional) keyword
  function shouldEnterActive(p, kw) {
    if (kw.entersActive) return true;
    if (!kw.entersActiveIf) return false;
    if (kw.entersActiveIf.kind === 'name') {
      return [...p.front, ...p.energy].some(u => (u.card.name || '').includes(kw.entersActiveIf.value));
    }
    if (kw.entersActiveIf.kind === 'traitCount') {
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').toLowerCase().includes(kw.entersActiveIf.trait)).length;
      return n >= kw.entersActiveIf.n;
    }
    return false;
  }

  function makeUnit(cardNo) {
    const c = UAData.byNo.get(cardNo);
    return {
      uid: uidSeq++,
      no: cardNo,
      card: c,
      rested: true,          // enters play resting
      under: [],             // raid stack beneath (covered cards)
      counters: [],           // face-down cards placed under by effects (deck-sourced, not Raid)
      bpMod: 0,               // BP modification cleared every End Phase ("during this turn")
      bpPersist: 0,           // BP modification cleared at owner's next Start Phase ("until start of your next turn")
      tempImpact: 0,          // extra Impact granted "during this turn"
      tempDmg: 0,             // Damage(N) override granted "during this turn" (0 = use printed value)
      tempGen: 0,             // extra energy generation granted "during this turn"
      genPersist: 0,          // extra energy generation granted "until start of your next turn"
      tempFrontGen: false,    // granted front-line energy generation "during this turn"
      frontGenPersist: false, // granted front-line energy generation "until start of your next turn"
      retireAtEndOfMain: false, // scheduled self-retire at the end of this Main Phase
      retireAtEndOfTurn: false, // scheduled self-retire at the beginning of this End Phase
      noBlock: false,           // "cannot block during this turn" (cleared every End Phase)
      effectsNullified: false, // "loses all of its (original) effects during this turn" — suppresses
                                // registry/generic onPlay/onAttack/onMain and bp/gen bonuses for this unit
      tempUntargetable: false, // granted "cannot be chosen by opponent's effects" this turn (temp
                                // counterpart to the static kw.untargetable keyword)
      skipNextStand: false,     // "the next time it would set to active, it doesn't" — consumed by
                                 // whichever ready-up step (this End Phase or owner's next Start Phase) comes first
      noRetire: false,          // "this character will not be retired" (cleared every End Phase)
      tempSnipe: false,         // granted [Sniper] "during this turn" (cleared every End Phase)
      tempUnblockableBP: null,    // granted "cannot be blocked by characters with BP N or less" this turn
      tempUnblockableBPMin: null, // granted "cannot be blocked by characters with BP N or more" this turn
      tempRaidable: false,      // granted "your [Raid] cards can raid on this character" this turn (any raider qualifies)
      tempCannotMove: false,    // granted "cannot move" until a scheduled point (temp counterpart to kw.cannotMove) —
                                // cleared by whatever Engine.scheduleDelayedAction the granting effect scheduled
      enteredTurn: G.turn,      // G.turn at the moment this unit entered the field — for "a character
                                // that came into play this turn" conditions, from ANY source (play/raid/zone)
      attackedThisTurn: 0,
      blockedThisTurn: 0,
      kw: parseKeywords(c),
    };
  }

  function bp(unit) {
    const owner = G.players[findOwnerIdx(unit)];
    const hook = Effects.registry[unit.no]?.bpBonus;
    // per-card script wins; otherwise the generic text-pattern evaluator (set up by common.js)
    // — suppressed entirely if this unit "lost all of its effects" this turn.
    const bonus = unit.effectsNullified ? 0 : hook ? (hook(owner, unit) || 0)
      : (Effects.genericBpBonus ? (Effects.genericBpBonus(owner, unit) || 0) : 0);
    // aura bonuses granted by units on the same player's field ("All your <X> characters get
    // +N BP") — auraBp(owner, sourceUnit, targetUnit) on the SOURCE card's registry entry.
    // Implementations must not call Engine.bp() (recursion).
    let aura = 0;
    for (const u2 of [...owner.front, ...owner.energy]) {
      const ah = Effects.registry[u2.no]?.auraBp;
      if (ah) aura += ah(owner, u2, unit) || 0;
    }
    return Math.max(0, (unit.card.bp || 0) + unit.bpMod + unit.bpPersist + bonus + aura);
  }

  function findOwnerIdx(unit) {
    for (let i = 0; i < G.players.length; i++) {
      const p = G.players[i];
      if (p.front.includes(unit) || p.energy.includes(unit)) return i;
    }
    return 0;
  }

  // ---------- game state ----------
  function newPlayer(name, deckNos, controller, isBot) {
    return {
      name, controller, isBot,
      deck: shuffle([...deckNos]),
      hand: [], life: [],
      front: [], energy: [],       // arrays of units (max 4)
      apTotal: 0, apRested: 0,
      sideline: [], removal: [],
      extraDrawUsed: false,
      turnCount: 0,
    };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const G = {
    players: [], turn: 0, active: 0, phase: '', over: false, winner: null,
    log: [], onUpdate: null, onLog: null,
  };

  function log(msg) {
    G.log.push(msg);
    if (G.onLog) G.onLog(msg);
  }
  function update() { if (G.onUpdate) G.onUpdate(); }

  function opponentOf(p) { return G.players[1 - G.players.indexOf(p)]; }

  // ---------- energy ----------
  // "If this character is active, increase this character's generated energy by N[color]." — printed
  // identically (with only the number/color varying) on characters across every series, so it is
  // handled generically here rather than per-card.
  const RX_SELF_GEN_WHEN_ACTIVE = [
    /If this character is active, increase this character'?s generated energy by (\d+)/i,
    /If this (?:character|card) is active, increase the energy it generates by (\d+)/i,
    /If this character is active, this character generates addition\w* \+?(\d+)/i,
    /If this character is active, this character generates (\d+) addition\w*/i,
  ];
  // newer-series wording without a number ("it gains [purple] energy generation") — always +1
  const RX_SELF_GEN_NO_NUM = /If this (?:character|card) is active, it gains \[?\w+\]? energy generation/i;
  function selfGenBonus(u) {
    if (u.rested) return 0;
    const fx = u.card.effect || '';
    for (const rx of RX_SELF_GEN_WHEN_ACTIVE) {
      const m = fx.match(rx);
      if (m) return parseInt(m[1]);
    }
    if (RX_SELF_GEN_NO_NUM.test(fx)) return 1;
    return 0;
  }
  function addUnitGen(gen, p, u) {
    const col = u.card.color || 'None';
    const hook = Effects.registry[u.no]?.genMod;
    const modBonus = u.effectsNullified ? 0 : hook ? (hook(u, p) || 0)
      : (Effects.genericGenMod ? (Effects.genericGenMod(p, u) || 0) : 0);
    const bonus = (u.effectsNullified ? 0 : selfGenBonus(u)) + (u.tempGen || 0) + (u.genPersist || 0) + modBonus;
    gen[col] = (gen[col] || 0) + (u.card.gen || 0) + bonus;
  }
  // "This character also generates energy on the Front Line" — printed unconditionally (kw.frontGen),
  // granted temporarily by another effect (tempFrontGen/frontGenPersist), or conditionally live
  // (Effects.genericFrontGen, set up by common.js from the card's own text).
  function hasFrontGen(p, u) {
    const hook = Effects.registry[u.no]?.frontGenBonus;
    if (hook) return !!hook(p, u);
    return u.kw.frontGen || u.tempFrontGen || u.frontGenPersist ||
      (typeof Effects !== 'undefined' && Effects.genericFrontGen ? Effects.genericFrontGen(p, u) : false);
  }
  function energyGen(p) {
    const gen = {}; // color -> amount
    for (const u of p.energy) addUnitGen(gen, p, u);
    for (const u of p.front) if (hasFrontGen(p, u)) addUnitGen(gen, p, u);
    return gen;
  }

  // ---------- dynamic cost reduction ----------
  // Text-driven, series-agnostic required-energy discounts printed on many cards.
  function textNeedDelta(p, card) {
    const fx = card.effect || '';
    let delta = 0;
    let m = fx.match(/Reduce the required energy of this card in your hand(?: and Outside Area)? by (\d+)/i);
    if (m) delta -= parseInt(m[1]);
    m = fx.match(/If there (?:is|are) no cards? on your area, reduce the energy requirement of this card in your hand by (\d+)/i);
    if (m && p.front.length === 0 && p.energy.length === 0) delta -= parseInt(m[1]);
    m = fx.match(/If there is an? \[?(\w+)\]?(?: or (?:an? )?\[?(\w+)\]?)? [Cc]ard on your opponent'?s area,?\s*(?:reduce this card'?s required energy in your hand by (\d+)|reduce (?:the|this card'?s) energy requirement (?:of this card )?in your hand by (\d+)|in your hand, this card'?s energy requirement is reduced by (\d+))/i);
    if (m) {
      const enemy = opponentOf(p);
      const colors = [m[1], m[2]].filter(Boolean).map(s => s.toLowerCase());
      const hasColor = [...enemy.front, ...enemy.energy].some(u => colors.includes((u.card.color || '').toLowerCase()));
      if (hasColor) delta -= parseInt(m[3] || m[4] || m[5]);
    }
    // "If there is a <NAME> on/in your Outside Area, reduce the energy requirement of this card
    // in your hand by N." — sideline-gated discount
    m = fx.match(/If there is an? <([^>]+)> (?:on|in) your Outside Area, reduce the (?:energy requirement|required energy) of this card in your hand by (\d+)/i);
    if (m) {
      const name = m[1].trim();
      if (p.sideline.some(no => (UAData.byNo.get(no)?.name || '').includes(name))) delta -= parseInt(m[2]);
    }
    // "If there is a <NAME> on your area, reduce the required energy of this card in your hand by N."
    m = fx.match(/If there is an? <([^>]+)> on your area, reduce the (?:energy requirement|required energy) of this card in your hand by (\d+)/i);
    if (m) {
      const name = m[1].trim();
      if ([...p.front, ...p.energy].some(u => (u.card.name || '').includes(name))) delta -= parseInt(m[2]);
    }
    // loose old-set wording: "If your opponent has [red] or [yellow] Characters/card (on their
    // field), you can reduce this card's/character's energy consumption ... by N"
    m = fx.match(/If your opponent has \[?(\w+)\]?(?: or \[?(\w+)\]?)? (?:card|[Cc]haracters?)[^.]*?reduce this (?:card|character)'?s energy consumption\w*[^.]*?by -?(\d+)/i);
    if (!m) {
      // bare variant: "...in their field, this card's energy consumption -N [color] from your hand."
      m = fx.match(/If your opponent has \[?(\w+)\]?(?: or \[?(\w+)\]?)? (?:card|[Cc]haracters?)[^.]*?this (?:card|character)'?s energy consumption -(\d+)/i);
    }
    if (m) {
      const enemy = opponentOf(p);
      const colors = [m[1], m[2]].filter(Boolean).map(s => s.toLowerCase());
      const hasColor = [...enemy.front, ...enemy.energy].some(u => colors.includes((u.card.color || '').toLowerCase()));
      if (hasColor) delta -= parseInt(m[3]);
    }
    return delta;
  }
  // AP-cost equivalent of the above (kept separate since it feeds effectiveAp, not effectiveNeed)
  function textApDelta(p, card) {
    const fx = card.effect || '';
    const m = fx.match(/If there is a <([^>]+)> on your area, reduce the AP cost of this card in your hand by (\d+)/i);
    if (m && [...p.front, ...p.energy].some(u => (u.card.name || '').includes(m[1]))) return -parseInt(m[2]);
    const tm = fx.match(/If there are (\d+) or more <Trait:?\s*([^>]+)> (?:cards?|characters?) on your area, reduce (?:this card'?s|the) AP cost (?:of this card )?in your hand by (\d+)/i);
    if (tm) {
      const need = parseInt(tm[1]), trait = tm[2].trim().toLowerCase();
      const n = [...p.front, ...p.energy].filter(u => (u.card.traits || '').toLowerCase().includes(trait)).length;
      if (n >= need) return -parseInt(tm[3]);
    }
    // "If there are a total of N or more <NAME> and <Trait:X> cards on your area, reduce the AP
    // cost of this card in your hand by M." (KMY's Hashira-synergy phrasing, also covers the "of
    // of" typo some cards carry)
    const nm = fx.match(/If there (?:are|is) a total of (\d+) or more <([^>]+)> (?:and\/or other|and) <Trait:?\s*([^>]+)>(?: (?:cards?|characters?))? on your area, reduce the AP cost of (?:of )?this card in your hand by (\d+)/i);
    if (nm) {
      const need = parseInt(nm[1]), name = nm[2].trim(), trait = nm[3].trim().toLowerCase();
      const n = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes(name) || (u.card.traits || '').toLowerCase().includes(trait)).length;
      if (n >= need) return -parseInt(nm[4]);
    }
    return 0;
  }
  // does this card's own text carry ANY of the hand-based cost-discount patterns above,
  // regardless of whether the condition currently holds? Used only by the coverage-measurement
  // tools (tools/uncovered-in-series.mjs, tools/coverage-total.mjs) so cards whose only effect is
  // an automatically-applied cost discount aren't misreported as "uncovered".
  function hasTextCostDiscount(card) {
    const fx = card.effect || '';
    return /Reduce the required energy of this card in your hand(?: and Outside Area)? by \d+/i.test(fx) ||
      /If there (?:is|are) no cards? on your area, reduce the energy requirement of this card in your hand by \d+/i.test(fx) ||
      /If there is an? \[?\w+\]?(?: or (?:an? )?\[?\w+\]?)? [Cc]ard on your opponent'?s area,?\s*(?:reduce this card'?s required energy in your hand by \d+|reduce (?:the|this card'?s) energy requirement (?:of this card )?in your hand by \d+|in your hand, this card'?s energy requirement is reduced by \d+)/i.test(fx) ||
      /If there is an? <[^>]+> (?:on|in) your Outside Area, reduce the (?:energy requirement|required energy) of this card in your hand by \d+/i.test(fx) ||
      /If there is an? <[^>]+> on your area, reduce the (?:energy requirement|required energy) of this card in your hand by \d+/i.test(fx) ||
      /If your opponent has \[?\w+\]?(?: or \[?\w+\]?)? (?:card|[Cc]haracters?)[^.]*?reduce this (?:card|character)'?s energy consumption\w*[^.]*?by -?\d+/i.test(fx) ||
      /If your opponent has \[?\w+\]?(?: or \[?\w+\]?)? (?:card|[Cc]haracters?)[^.]*?this (?:card|character)'?s energy consumption -\d+/i.test(fx) ||
      /If there is a <[^>]+> on your area, reduce the AP cost of this card in your hand by \d+/i.test(fx) ||
      /If there are \d+ or more <Trait:?\s*[^>]+> (?:cards?|characters?) on your area, reduce (?:this card'?s|the) AP cost (?:of this card )?in your hand by \d+/i.test(fx) ||
      /If there (?:are|is) a total of \d+ or more <[^>]+> (?:and\/or other|and) <Trait:?\s*[^>]+>(?: (?:cards?|characters?))? on your area, reduce the AP cost of (?:of )?this card in your hand by \d+/i.test(fx);
  }
  function peekDiscount(p, card) {
    if (p.pendingDiscount && p.pendingDiscount.predicate(card))
      return { needDelta: p.pendingDiscount.needDelta || 0, apDelta: p.pendingDiscount.apDelta || 0 };
    return { needDelta: 0, apDelta: 0 };
  }
  function consumeDiscount(p, card) {
    if (p.pendingDiscount && p.pendingDiscount.predicate(card)) p.pendingDiscount = null;
  }
  function effectiveNeed(p, card) {
    const mod = Effects.registry[card.no]?.costMod?.(p, card) || {};
    const disc = peekDiscount(p, card);
    return Math.max(0, (card.need || 0) + textNeedDelta(p, card) + (mod.needDelta || 0) + disc.needDelta);
  }
  function effectiveAp(p, card) {
    const mod = Effects.registry[card.no]?.costMod?.(p, card) || {};
    const disc = peekDiscount(p, card);
    return Math.max(0, (card.ap || 0) + textApDelta(p, card) + (mod.apDelta || 0) + disc.apDelta);
  }
  function hasEnergyFor(p, c) {
    const need = effectiveNeed(p, c);
    if (!need) return true;
    const gen = energyGen(p);
    return (gen[c.color] || 0) + (gen['rainbow'] || 0) >= need;
  }
  function activeAP(p) { return p.apTotal - p.apRested; }
  function payAP(p, n) {
    if (activeAP(p) < n) return false;
    p.apRested += n;
    return true;
  }

  // ---------- setup ----------
  async function startGame(deckA, deckB, ctrlA, ctrlB, nameA = 'Player', nameB = 'Bot') {
    uidSeq = 1;
    G.players = [
      newPlayer(nameA, deckA, ctrlA, false),
      newPlayer(nameB, deckB, ctrlB, true),
    ];
    G.turn = 0; G.active = 0; G.over = false; G.winner = null; G.log = []; G._delayedActions = [];

    for (const p of G.players) {
      p.hand = p.deck.splice(0, 7);
    }
    update();
    // mulligan — P1 decides first
    for (const p of G.players) {
      const redo = await p.controller.chooseMulligan(p);
      if (redo) {
        p.deck.push(...p.hand);
        p.hand = [];
        shuffle(p.deck);
        p.hand = p.deck.splice(0, 7);
        log(`${p.name} ทำ mulligan จั่วมือใหม่`);
      }
    }
    // life 7
    for (const p of G.players) p.life = p.deck.splice(0, 7);
    log('เกมเริ่ม! ' + G.players[0].name + ' เล่นก่อน');
    update();
    await runTurn();
  }

  // ---------- turn loop ----------
  async function runTurn() {
    while (!G.over) {
      const p = G.players[G.active];
      p.turnCount++;
      G.turn++;

      await startPhase(p);       if (G.over) break;
      await movementPhase(p);    if (G.over) break;
      await mainPhase(p);        if (G.over) break;
      await attackPhase(p);      if (G.over) break;
      await endPhase(p);         if (G.over) break;

      G.active = 1 - G.active;
    }
    update();
  }

  function apForTurn(p) {
    const isP1 = G.players.indexOf(p) === 0;
    const t = p.turnCount;
    if (isP1) return t === 1 ? 1 : t === 2 ? 2 : 3;
    return t === 1 ? 2 : t === 2 ? 2 : 3;
  }

  async function startPhase(p) {
    G.phase = 'Start';
    log(`— เทิร์นที่ ${p.turnCount} ของ ${p.name} —`);
    // per-turn-number delayed effects (e.g. "at the start of your opponent's next turn, ...") —
    // scheduled via `Engine.scheduleDelayedAction(G.turn + 1, fn)` from wherever the effect fires.
    if (G._delayedActions && G._delayedActions.length) {
      const due = G._delayedActions.filter(a => a.turn === G.turn);
      G._delayedActions = G._delayedActions.filter(a => a.turn !== G.turn);
      for (const a of due) { try { await a.fn(); } catch (e) { console.error(e); } }
    }
    // 1: abilities lasting "until the start of your next turn" expire
    for (const u of [...p.front, ...p.energy]) { u.bpPersist = 0; u.frontGenPersist = false; u.genPersist = 0; u._movedThisTurn = false; }
    p._getPlayedThisTurn = false;
    p._drewThisTurn = 0;
    p._playedTraitsThisTurn = new Set();
    p._playedApCostsThisTurn = new Set();
    p._eventsUsedThisTurn = 0;
    p._placedToOutsideThisTurn = 0;
    p._paidApByEffectThisTurn = 0;
    G.retiredThisTurn = 0;
    G._triggerActivatedThisTurn = false;
    p._dealtDamageThisTurn = false;
    p._revealedNonYellowRaidThisTurn = false;
    p._grantedRaidDraw = false;
    // "at the start of your turn" effects (checked before readying, in case they read carried-over state)
    for (const u of [...p.front, ...p.energy]) await Effects.onTurnStart(G, p, u);
    if (G.over) return;
    // 2: ready everything (unless "the next time it would set to active, it doesn't" is pending)
    for (const u of [...p.front, ...p.energy]) {
      if (u.skipNextStand) u.skipNextStand = false; else u.rested = false;
      u.attackedThisTurn = 0; u.blockedThisTurn = 0;
    }
    p.apRested = 0;
    // 3: AP count
    p.apTotal = apForTurn(p);
    p.extraDrawUsed = false;
    // 4: draw (P1 skips very first draw)
    const skipDraw = G.players.indexOf(p) === 0 && p.turnCount === 1;
    if (!skipDraw) {
      if (!draw(p, 1)) return; // deck out -> lose
    }
    update();
    // 5: extra draw (once per turn; normally costs 1 AP, free if a Front Line card grants it)
    if (p.deck.length > 0) {
      const free = Effects.hasFreeExtraDraw?.(p);
      if (free || activeAP(p) >= 1) {
        const want = await p.controller.chooseExtraDraw(p);
        if (want && (free || payAP(p, 1))) {
          p.extraDrawUsed = true;
          draw(p, 1);
          log(`${p.name} ${free ? '' : 'จ่าย 1 AP '}จั่วเพิ่ม (extra draw)`);
        }
      }
    }
    update();
  }

  // records the traits (and AP cost) of a card played from hand this turn — for "if you
  // used/played a Trait:X card from your hand during this turn" and "if you've used a card with
  // N AP consumption during this turn" conditions. Reset each Start Phase.
  function trackPlayedTraits(p, c) {
    for (const t of (c.traits || '').split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean))
      p._playedTraitsThisTurn.add(t);
    p._playedApCostsThisTurn.add(c.ap || 0);
  }
  function draw(p, n) {
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        G.over = true; G.winner = opponentOf(p);
        log(`${p.name} จั่วไม่ได้ (เด็คหมด) — ${G.winner.name} ชนะ!`);
        update();
        return false;
      }
      p.hand.push(p.deck.shift());
      p._drewThisTurn = (p._drewThisTurn || 0) + 1; // tracked for "if you drew N+ cards this turn" / "if opponent drew a card" cards
    }
    update();
    return true;
  }

  async function movementPhase(p) {
    G.phase = 'Movement';
    update();
    // controller returns list of moves {uid, to:'front'|'energy'}
    const moves = await p.controller.chooseMovements(p);
    const blockEnergyToFront = p._blockEnergyToFrontNextMove;
    p._blockEnergyToFrontNextMove = false; // consumed on this, the very next Move Phase for this player
    for (const mv of moves || []) {
      const fromLine = mv.to === 'front' ? p.energy : p.front;
      const toLine = mv.to === 'front' ? p.front : p.energy;
      const idx = fromLine.findIndex(u => u.uid === mv.uid);
      if (idx < 0) continue;
      const u = fromLine[idx];
      if (u.card.type !== 'Character') continue;
      if (u.kw.cannotMove || u.tempCannotMove) continue;
      if (mv.to === 'energy' && !u.kw.step) continue;   // only Step can go back
      if (mv.to === 'front' && blockEnergyToFront) continue; // "opponent cannot move Energy Line to Front Line during their next Move Phase"
      if (toLine.length >= 4) {
        // must remove one card from destination to removal area
        const removedUid = mv.removeUid;
        const ri = toLine.findIndex(x => x.uid === removedUid);
        if (ri < 0) continue;
        await removeToArea(p, toLine[ri], 'removal');
        toLine.splice(ri, 1);
      }
      fromLine.splice(idx, 1);
      toLine.push(u);
      u._movedThisTurn = true; // for "if this character is moving/moved during this turn, ..." cards
      log(`${p.name} ย้าย ${u.card.name} ไป ${mv.to === 'front' ? 'Front Line' : 'Energy Line'}`);
    }
    update();
  }

  async function mainPhase(p) {
    G.phase = 'Main';
    update();
    // controller performs actions in a loop, engine validates each
    let guard = 0;
    for (;;) {
      if (G.over) return;
      if (++guard > 200) { log('(main phase หยุดอัตโนมัติ — action เกินลิมิต)'); break; }
      const act = await p.controller.chooseMainAction(p);
      if (!act || act.type === 'done') break;
      try {
        if (act.type === 'play') await playCard(p, act);
        else if (act.type === 'raid') await raidCard(p, act);
        else if (act.type === 'event') await playEvent(p, act);
        else if (act.type === 'ability') {
          const u = findUnit(p, act.uid);
          if (u) await Effects.onMain(G, p, u);
        }
        else if (act.type === 'bpmod') { // manual effect application
          const u = findUnit(p, act.uid) || findUnit(opponentOf(p), act.uid);
          if (u) { u.bpMod += act.delta; log(`${p.name} ปรับ BP ${u.card.name} ${act.delta > 0 ? '+' : ''}${act.delta}`); }
        }
        else if (act.type === 'rest' ) { const u = findUnit(p, act.uid); if (u) u.rested = true; }
        else if (act.type === 'stand') { const u = findUnit(p, act.uid); if (u) u.rested = false; }
        else if (act.type === 'sideline') { await manualZoneMove(p, act.uid, 'sideline'); }
        else if (act.type === 'removal')  { await manualZoneMove(p, act.uid, 'removal'); }
        else if (act.type === 'payap') { payAP(p, act.n || 1); }
      } catch (e) {
        console.error(e);
      }
      await checkBpZero();
      update();
    }
    // resolve any "retire this character at the end of your Main Phase" schedules
    for (const u of [...p.front, ...p.energy]) {
      if (u.retireAtEndOfMain) {
        u.retireAtEndOfMain = false;
        log(`${u.card.name}: ครบกำหนด retire ที่ตั้งไว้ตอน Main Phase`);
        await sidelineUnit(p, u, 'effect');
      }
    }
    update();
  }

  function findUnit(p, uid) {
    return p.front.find(u => u.uid === uid) || p.energy.find(u => u.uid === uid);
  }

  async function manualZoneMove(p, uid, area) {
    for (const line of [p.front, p.energy]) {
      const i = line.findIndex(u => u.uid === uid);
      if (i >= 0) {
        const u = line.splice(i, 1)[0];
        await removeToArea(p, u, area);
        log(`${p.name} ส่ง ${u.card.name} ไป ${area === 'sideline' ? 'Sideline' : 'Removal'}`);
        return;
      }
    }
  }

  // play character/site from hand: act = {no, line:'front'|'energy', removeUid?}
  async function playCard(p, act) {
    const hi = p.hand.indexOf(act.no);
    if (hi < 0) return;
    const c = UAData.byNo.get(act.no);
    if (!c) return;
    if (c.type === 'Field' && act.line !== 'energy') throw new Error('Site ลงได้เฉพาะ Energy Line');
    if (c.type !== 'Character' && c.type !== 'Field') throw new Error('ลงสนามได้เฉพาะ Character/Site');
    if (c.type === 'Character' && act.line === 'front' && parseKeywords(c).cannotEnterFront) throw new Error('การ์ดนี้ลง Front Line ไม่ได้');
    if (!hasEnergyFor(p, c)) { p.controller.notify?.('Energy ไม่พอ'); return; }
    const apCost = effectiveAp(p, c);
    if (activeAP(p) < apCost) { p.controller.notify?.('AP ไม่พอ'); return; }

    const line = act.line === 'front' ? p.front : p.energy;
    if (line.length >= 4) {
      if (act.removeUid == null) { p.controller.notify?.('Line เต็ม — ต้องเลือกใบที่จะส่งไป Removal'); return; }
      const ri = line.findIndex(u => u.uid === act.removeUid);
      if (ri < 0) return;
      const rem = line.splice(ri, 1)[0];
      await removeToArea(p, rem, 'removal');
      log(`${p.name} ส่ง ${rem.card.name} ไป Removal (line เต็ม)`);
    }
    payAP(p, apCost);
    consumeDiscount(p, c);
    p.hand.splice(hi, 1);
    trackPlayedTraits(p, c);
    const u = makeUnit(act.no);
    u.rested = !shouldEnterActive(p, u.kw); // enters resting, unless "played in active"
    line.push(u);
    log(`${p.name} ลง ${c.name} (${c.type}) ที่ ${act.line === 'front' ? 'Front' : 'Energy'} Line`);
    await Effects.onPlay(G, p, u);
    update();
  }

  // raid: act = {no(from hand) | uid(from field), targetUid}
  async function raidCard(p, act) {
    const c = act.no ? UAData.byNo.get(act.no) : null;
    let raider = null, fromHand = false;
    if (act.no) {
      if (!p.hand.includes(act.no)) return;
      if (!hasEnergyFor(p, c)) { p.controller.notify?.('Energy ไม่พอ'); return; }
      if (activeAP(p) < effectiveAp(p, c)) { p.controller.notify?.('AP ไม่พอ'); return; }
      fromHand = true;
    }
    // find target on either of p's lines
    let targetLine = null, ti = -1;
    for (const line of [p.front, p.energy]) {
      ti = line.findIndex(u => u.uid === act.targetUid);
      if (ti >= 0) { targetLine = line; break; }
    }
    if (!targetLine) return;
    const target = targetLine[ti];

    if (fromHand) {
      payAP(p, effectiveAp(p, c));
      consumeDiscount(p, c);
      p.hand.splice(p.hand.indexOf(act.no), 1);
      trackPlayedTraits(p, c);
      raider = makeUnit(act.no);
    } else return;

    // stack: raider on top, target (and its stack) beneath
    if (target.counters.length) { p.sideline.push(...target.counters); target.counters = []; }
    raider.under = [target.no, ...target.under];
    raider.rested = false;           // if resting -> active (raider arrives active per rule: switch to active)
    targetLine[ti] = raider;
    log(`${p.name} Raid! ${raider.card.name} ทับ ${target.card.name}`);
    // may move to front if on energy line
    if (targetLine === p.energy && p.front.length < 4) {
      const mv = await p.controller.chooseRaidMove(p, raider);
      if (mv) {
        p.energy.splice(p.energy.indexOf(raider), 1);
        p.front.push(raider);
        log(`${raider.card.name} ย้ายขึ้น Front Line`);
      }
    }
    await Effects.onRaided(G, p, target.no, raider);
    await Effects.onPlay(G, p, raider);
    // temporary "when your character raids, draw 1 card" grant (from an Event card this turn)
    if (p._grantedRaidDraw) { draw(p, 1); log(`${p.name}: จั่ว 1 ใบ (ได้รับความสามารถชั่วคราวจาก raid)`); }
    update();
  }

  async function playEvent(p, act) {
    const hi = p.hand.indexOf(act.no);
    if (hi < 0) return;
    const c = UAData.byNo.get(act.no);
    if (c.type !== 'Event') return;
    if (!hasEnergyFor(p, c)) { p.controller.notify?.('Energy ไม่พอ'); return; }
    const apCost = effectiveAp(p, c);
    if (activeAP(p) < apCost) { p.controller.notify?.('AP ไม่พอ'); return; }
    payAP(p, apCost);
    consumeDiscount(p, c);
    p.hand.splice(hi, 1);
    trackPlayedTraits(p, c);
    p._eventsUsedThisTurn = (p._eventsUsedThisTurn || 0) + 1;
    log(`${p.name} ใช้ Event: ${c.name}`);
    await Effects.onEvent(G, p, c);
    p.sideline.push(act.no);
    update();
  }

  // ---------- attack phase ----------
  async function attackPhase(p) {
    G.phase = 'Attack';
    update();
    const enemy = opponentOf(p);
    for (;;) {
      if (G.over) return;
      const decl = await p.controller.chooseAttacker(p, enemy);
      if (!decl) break; // end phase
      const atk = p.front.find(u => u.uid === decl.uid);
      if (!atk || atk.rested || atk.kw.cannotAttack) continue;
      // per-card conditional attack restriction ("this character can only attack if ...") —
      // registry-defined and evaluated live, unlike the permanent kw.cannotAttack flag.
      if (Effects.registry[atk.no]?.canAttack && !Effects.registry[atk.no].canAttack(p, atk)) continue;

      atk.rested = true;
      atk.attackedThisTurn++;

      let targetUnit = null;
      if (decl.targetUid != null && (atk.kw.snipe || atk.tempSnipe)) {
        targetUnit = enemy.front.find(u => u.uid === decl.targetUid) || null;
      }
      log(`${p.name}: ${atk.card.name} โจมตี ${targetUnit ? targetUnit.card.name : enemy.name}`);
      await Effects.onAttack(G, p, atk);
      // temporary "[When Attacking] draw up to 1 card" grant (from another card's effect)
      if (atk._grantedAttackDraw && p.deck.length) { draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ (ได้รับความสามารถชั่วคราว)`); }
      // Field/other-unit passive watchers: "When one of your <Trait:X> characters attacks, ..." —
      // not keyed to the attacker's own card no (fires for every OTHER unit p controls too).
      for (const u of [...p.front, ...p.energy]) {
        if (u === atk) continue;
        const h = Effects.registry[u.no]?.onAnyAttack;
        if (h) await h(G, p, atk, u);
      }

      // blocking (not allowed vs snipe-target attacks)
      let blocker = null;
      if (!targetUnit) {
        const candidates = enemy.front.filter(u => !u.rested && u.card.type === 'Character' && !u.noBlock && !u.kw.cannotBlock &&
          (atk.kw.unblockableBP == null || bp(u) > atk.kw.unblockableBP) &&
          (atk.kw.unblockableBPMin == null || bp(u) < atk.kw.unblockableBPMin) &&
          (atk.tempUnblockableBP == null || bp(u) > atk.tempUnblockableBP) &&
          (atk.tempUnblockableBPMin == null || bp(u) < atk.tempUnblockableBPMin) &&
          (!atk.kw.unblockableByRaided || !u.under.length));
        if (candidates.length) {
          const b = await enemy.controller.chooseBlocker(enemy, atk, candidates);
          if (b) {
            blocker = candidates.find(u => u.uid === b);
            if (blocker) {
              blocker.rested = true;
              blocker.blockedThisTurn++;
              log(`${enemy.name}: ${blocker.card.name} บล็อก!`);
              await Effects.onBlock(G, enemy, blocker, atk);
              if (blocker.kw.doubleBlock && blocker.blockedThisTurn === 1) {
                blocker.rested = false;
                log(`[Double Block] ${blocker.card.name} กลับเป็น Active`);
              }
            }
          }
        }
      }

      const defender = targetUnit || blocker;
      if (defender) {
        // battle
        const aBP = bp(atk), dBP = bp(defender);
        log(`⚔ ${atk.card.name} (${aBP}) vs ${defender.card.name} (${dBP})`);
        if (aBP >= dBP) {
          const winHook = Effects.registry[atk.no]?.onWinBattle;
          const handled = winHook ? await winHook(G, p, atk, enemy, defender) : false;
          if (!handled) {
            await sidelineUnit(enemy, defender, 'battle');
            log(`${defender.card.name} แพ้ battle → Sideline`);
          }
          const impactBonusHook = Effects.registry[atk.no]?.impactBonus?.(p, atk) || 0;
          const impact = (atk.kw.nullifiedImpact ? 0 : atk.kw.impact) + (atk.tempImpact || 0) + impactBonusHook;
          if (impact > 0 && !defender.kw.nullifyImpact) {
            log(`[Impact ${impact}]!`);
            await dealDamage(p, enemy, impact, atk);
            if (G.over) return;
          }
          // temporary "when this character attacks and wins a battle, draw 1 card" grant (from
          // another card's effect, not this unit's own printed text)
          if (atk._grantedOnWinDraw) { draw(p, 1); log(`${atk.card.name}: จั่ว 1 ใบ (ได้รับความสามารถชั่วคราว)`); }
          // Field/other-unit passive watchers: "[1 Per Turn] When a character from your area
          // attacks and wins a battle, draw 1 card." — not keyed to the attacker's own card no.
          for (const u of [...p.front, ...p.energy]) {
            const h = Effects.registry[u.no]?.onAnyWinBattle;
            if (h) await h(G, p, atk, enemy, defender, u);
          }
        } else {
          log(`${atk.card.name} แพ้ battle (ไม่ถูก sideline)`);
          // the defender (usually a blocker) "wins" this battle — fires on the DEFENDER's own
          // registry entry, e.g. "[Opponent's Turn] When this character wins a battle, draw 1 card."
          if (defender) {
            const dh = Effects.registry[defender.no]?.onDefenderWinBattle;
            if (dh) await dh(G, enemy, defender, p, atk);
          }
          // Field/other-unit passive watchers: "[1 Per Turn] When a character on your area
          // attacks and loses a battle, ..." — not keyed to the attacker's own card no.
          for (const u of [...p.front, ...p.energy]) {
            const h = Effects.registry[u.no]?.onAnyLoseBattle;
            if (h) await h(G, p, atk, enemy, defender, u);
          }
        }
      } else {
        // direct damage — [Damage +N] (additive, from a granted/conditional effect) stacks on
        // top of the printed [Damage(N)]/default-1 base, unlike tempDmg which overrides it outright.
        const dmgBonusHook = Effects.registry[atk.no]?.dmgBonus?.(p, atk) || 0;
        const dmg = (atk.tempDmg || atk.kw.dmg || 1) + dmgBonusHook;
        await dealDamage(p, enemy, dmg, atk);
        if (G.over) return;
      }

      if (atk.kw.doubleAttack && atk.attackedThisTurn === 1) {
        atk.rested = false;
        log(`[Double Attack] ${atk.card.name} กลับเป็น Active`);
      }
      update();
    }
    update();
  }

  // attacker picks life cards; defender checks triggers
  async function dealDamage(attackerP, defenderP, n, atkUnit) {
    n = Math.min(n, defenderP.life.length);
    if (n <= 0) { checkLifeWin(attackerP, defenderP); return; }
    attackerP._dealtDamageThisTurn = true; // for "if a character on your area dealt damage to your opponent this turn" cards
    const picked = await attackerP.controller.chooseLifeCards(attackerP, defenderP, n);
    const revealed = [];
    for (const idx of picked.sort((a, b) => b - a)) {
      revealed.push(defenderP.life.splice(idx, 1)[0]);
    }
    log(`${defenderP.name} เสีย ${revealed.length} Life — เช็ค Trigger`);
    update();
    // defender resolves triggers in any order
    const order = await defenderP.controller.orderTriggers(defenderP, revealed);
    for (const no of order) {
      const c = UAData.byNo.get(no);
      defenderP._triggerConsumed = false;
      if (c.trigger) {
        const used = await defenderP.controller.chooseUseTrigger(defenderP, c);
        if (used) await resolveTrigger(defenderP, c);
      }
      // card goes to sideline unless the trigger moved it elsewhere (Get / Raid)
      if (!defenderP._triggerConsumed) defenderP.sideline.push(no);
      defenderP._triggerConsumed = false;
      update();
      if (G.over) return;
    }
    checkLifeWin(attackerP, defenderP);
  }

  function checkLifeWin(attackerP, defenderP) {
    if (defenderP.life.length === 0) {
      G.over = true; G.winner = attackerP;
      log(`💥 ${defenderP.name} Life หมด — ${attackerP.name} ชนะ!`);
      update();
    }
  }

  async function resolveTrigger(p, c) {
    const enemy = opponentOf(p);
    G._triggerActivatedThisTurn = true; // for "if you/opponent activated a Trigger effect this turn" cards
    switch (c.trigger) {
      case 'Draw':
        draw(p, 1);
        log(`Trigger [Draw] — ${p.name} จั่ว 1 ใบ`);
        break;
      case 'Get':
        p.hand.push(c.no);
        p._triggerConsumed = true;
        log(`Trigger [Get] — ${c.name} เข้ามือ`);
        break;
      case 'Active': {
        const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character');
        if (units.length) {
          const uid = await p.controller.chooseOwnCharacter(p, units, 'เลือก character เพื่อ Active + 3000BP');
          const u = units.find(x => x.uid === uid);
          if (u) { u.rested = false; u.bpMod += 3000; log(`Trigger [Active] — ${u.card.name} ตั้งขึ้น +3000BP`); }
        }
        break;
      }
      case 'Raid': {
        // add to hand, or raid immediately if energy ok and target exists
        const targets = raidTargetsFor(p, c);
        let raided = false;
        if (targets.length && hasEnergyFor(p, c)) {
          const t = await p.controller.chooseRaidFromTrigger(p, c, targets);
          if (t != null) {
            p._triggerConsumed = true;
            await raidFromTrigger(p, c, t);
            raided = true;
          }
        }
        if (!raided) {
          p.hand.push(c.no);
          p._triggerConsumed = true;
          log(`Trigger [Raid] — ${c.name} เข้ามือ`);
        }
        break;
      }
      case 'Special': {
        const cand = enemy.front.filter(u => u.card.type === 'Character');
        if (cand.length) {
          const uid = await p.controller.chooseEnemyCharacter(p, cand, 'Trigger [Special] — เลือก character ศัตรูเพื่อ retire');
          const u = cand.find(x => x.uid === uid);
          if (u) { await sidelineUnit(enemy, u, 'effect'); log(`Trigger [Special] — ${u.card.name} ถูก retire`); }
        }
        break;
      }
      case 'Final':
        if (p.life.length === 0 && p.deck.length > 0) {
          p.life.push(p.deck.shift());
          log(`Trigger [Final] — ${p.name} ได้ Life กลับ 1 ใบ!`);
        }
        break;
      case 'Color': {
        const h = Effects.registry[c.no]?.onColorTrigger;
        if (h) { log(`Trigger [Color] — ${c.name}`); await h(G, p, c); }
        else {
          log(`Trigger [Color]: ${c.triggerText || '(ดูการ์ด)'} — ทำตามข้อความ (manual)`);
          await p.controller.manualTrigger?.(p, c);
        }
        break;
      }
    }
    update();
  }

  function raidTargetsFor(p, c) {
    const kw = parseKeywords(c);
    const out = [];
    for (const line of [p.front, p.energy]) {
      for (const u of line) {
        if (u.card.type !== 'Character') continue;
        if (u.kw.raidTargets.length) continue; // target must not possess Raid
        if (u.tempRaidable) { out.push(u); continue; } // "your [Raid] cards can raid on this character" grant — any raider qualifies
        for (const t of kw.raidTargets) {
          if (t.kind === 'name' && ((u.card.name || '').includes(t.value) || u.kw.alsoTreatedAs.some(a => a.includes(t.value) || t.value.includes(a)))) out.push(u);
          else if (t.kind === 'trait' && (u.card.traits || '').includes(t.value)) out.push(u);
        }
      }
    }
    return out;
  }

  async function raidFromTrigger(p, c, targetUid) {
    let targetLine = null, ti = -1;
    for (const line of [p.front, p.energy]) {
      ti = line.findIndex(u => u.uid === targetUid);
      if (ti >= 0) { targetLine = line; break; }
    }
    if (!targetLine) { p.hand.push(c.no); return; }
    const target = targetLine[ti];
    if (target.counters.length) { p.sideline.push(...target.counters); target.counters = []; }
    const raider = makeUnit(c.no);
    raider.under = [target.no, ...target.under];
    raider.rested = false;
    targetLine[ti] = raider;
    log(`Trigger [Raid]! ${raider.card.name} ทับ ${target.card.name}`);
    if (targetLine === p.energy && p.front.length < 4) {
      const mv = await p.controller.chooseRaidMove(p, raider);
      if (mv) {
        p.energy.splice(p.energy.indexOf(raider), 1);
        p.front.push(raider);
      }
    }
    await Effects.onRaided(G, p, target.no, raider);
    await Effects.onPlay(G, p, raider);
  }

  async function endPhase(p) {
    G.phase = 'End';
    update();
    // "at the beginning of the End Phase, retire that character" schedules
    for (const u of [...p.front, ...p.energy]) {
      if (u.retireAtEndOfTurn) {
        u.retireAtEndOfTurn = false;
        log(`${u.card.name}: ครบกำหนด retire ที่ตั้งไว้ตอน End Phase`);
        await sidelineUnit(p, u, 'effect');
      }
    }
    // ready characters/sites (AP stays), unless "the next time it would set to active, it doesn't" is pending
    for (const u of [...p.front, ...p.energy]) { if (u.skipNextStand) u.skipNextStand = false; else u.rested = false; }
    // hand limit 8 -> removal
    while (p.hand.length > 8) {
      const idx = await p.controller.chooseDiscard(p);
      const no = p.hand.splice(idx, 1)[0];
      p.removal.push(no);
      log(`${p.name} ทิ้ง ${UAData.byNo.get(no)?.name} ไป Removal (เกิน 8 ใบ)`);
    }
    // expire until-end-of-turn modifiers
    for (const pl of G.players)
      for (const u of [...pl.front, ...pl.energy]) { u.bpMod = 0; u.tempImpact = 0; u.tempDmg = 0; u.tempGen = 0; u.tempFrontGen = false; u.noBlock = false; u._grantedOnWinDraw = false; u._grantedAttackDraw = false; u.noRetire = false; u.tempSnipe = false; u.tempUnblockableBP = null; u.tempUnblockableBPMin = null; u.effectsNullified = false; u.tempUntargetable = false; u.tempRaidable = false; }
    p.pendingDiscount = null;
    update();
  }

  // ---------- generic zone helpers (used by the effects layer) ----------
  // unit must already be spliced out of its line by the caller; places it in `area`
  // ('sideline' | 'removal') and fires the leave-field / sideline hooks.
  async function removeToArea(p, unit, area) {
    for (const c of unit.under) p.sideline.push(c);
    unit.under = [];
    if (unit.counters.length) { p.sideline.push(...unit.counters); unit.counters = []; }
    p[area].push(unit.no);
    await Effects.onLeaveField(G, p, unit);
    if (area === 'sideline') await Effects.onSideline(G, p, unit, 'effect');
  }

  // finds & removes `unit` from owner's front/energy line, sends it to Sideline.
  // reason: 'battle' | 'effect' | 'bp0'
  async function sidelineUnit(owner, unit, reason = 'effect') {
    if (unit.noRetire) { log(`${unit.card.name}: ไม่ถูก retire (ผล "will not be retired")`); return; }
    G.retiredThisTurn = (G.retiredThisTurn || 0) + 1; // tracked for "if a character was retired this turn" cards
    for (const line of [owner.front, owner.energy]) {
      const i = line.indexOf(unit);
      if (i >= 0) line.splice(i, 1);
    }
    for (const c of unit.under) owner.sideline.push(c);
    unit.under = [];
    // per-card hook to inspect/redistribute counters BEFORE the generic auto-dump (needed for
    // "[On Retire] look at the cards under this character..." effects) — returns true if it
    // already handled unit.counters itself, skipping the default dump-to-sideline.
    const handled = unit.counters.length && await Effects.onBeforeLeaveCounters(G, owner, unit, reason);
    if (!handled && unit.counters.length) { owner.sideline.push(...unit.counters); unit.counters = []; }
    owner.sideline.push(unit.no);
    await Effects.onLeaveField(G, owner, unit);
    await Effects.onSideline(G, owner, unit, reason);
    // per-unit reactive watchers (e.g. "when THIS opponent's character retires, do X"), registered
    // ad-hoc via `(unit._watchers ||= []).push(fn)` by whatever effect marked this specific unit —
    // not tied to the unit's card number, so it survives Raid-covering and works cross-player.
    if (unit._watchers) {
      for (const fn of unit._watchers) { try { await fn(G, owner, unit, reason); } catch (e) { console.error(e); } }
    }
  }

  // returns `unit` from owner's front/energy line back to owner's hand.
  async function returnUnitToHand(owner, unit) {
    for (const line of [owner.front, owner.energy]) {
      const i = line.indexOf(unit);
      if (i >= 0) line.splice(i, 1);
    }
    for (const c of unit.under) owner.sideline.push(c);
    unit.under = [];
    if (unit.counters.length) { owner.sideline.push(...unit.counters); unit.counters = []; }
    owner.hand.push(unit.no);
    await Effects.onLeaveField(G, owner, unit);
  }

  // moves `unit` to the other line outside of Movement Phase (effect-driven, e.g.
  // "choose 1 character on your area, move it to another line"). If the destination
  // is full, `removeUid` (already chosen via the controller) picks the card evicted
  // to Removal. Returns true on success.
  async function moveUnitFree(owner, unit, toLine, removeUid) {
    if (unit.kw.cannotMove || unit.tempCannotMove) return false;
    const from = owner.front.includes(unit) ? owner.front : owner.energy;
    const dest = toLine === 'front' ? owner.front : owner.energy;
    if (from === dest) return false;
    const idx = from.indexOf(unit);
    if (idx < 0) return false;
    if (dest.length >= 4) {
      if (removeUid == null) return false;
      const ri = dest.findIndex(u => u.uid === removeUid);
      if (ri < 0) return false;
      const rem = dest.splice(ri, 1)[0];
      await removeToArea(owner, rem, 'removal');
    }
    from.splice(idx, 1);
    dest.push(unit);
    unit._movedThisTurn = true; // for "if this character is moving/moved during this turn, ..." cards
    log(`${owner.name}: ${unit.card.name} ย้ายไป ${toLine === 'front' ? 'Front' : 'Energy'} Line`);
    return true;
  }

  // plays card `no` from `zone` ('hand' | 'removal') onto owner's line, bypassing the
  // normal hand-play energy gate (the calling effect script is responsible for any
  // condition check printed on the card). Optionally spends the card's AP cost.
  async function playCardFromZone(owner, no, zone, { line = 'energy', active = false, payApCost = false, removeUid } = {}) {
    const idx = owner[zone].indexOf(no);
    if (idx < 0) return null;
    const c = UAData.byNo.get(no);
    if (!c) return null;
    const dest = line === 'front' ? owner.front : owner.energy;
    if (dest.length >= 4) {
      if (removeUid == null) return null;
      const ri = dest.findIndex(u => u.uid === removeUid);
      if (ri < 0) return null;
      const rem = dest.splice(ri, 1)[0];
      await removeToArea(owner, rem, 'removal');
    }
    if (payApCost && !payAP(owner, c.ap || 0)) return null;
    owner[zone].splice(idx, 1);
    const u = makeUnit(no);
    u._playedByEffect = true; // for "[On Play] If this character was played by your effect, ..." cards
    u.rested = !active;
    dest.push(u);
    const zoneLabel = zone === 'hand' ? 'มือ' : zone === 'sideline' ? 'Outside Area (Sideline)' : 'Removal';
    log(`${owner.name}: ${c.name} ถูกนำลง ${line === 'front' ? 'Front' : 'Energy'} Line จาก${zoneLabel}`);
    await Effects.onPlay(G, owner, u);
    return u;
  }

  // sidelines any unit whose effective BP has been reduced to 0 or less.
  async function checkBpZero() {
    for (const p of G.players) {
      for (const u of [...p.front, ...p.energy]) {
        if (u.card.bp != null && bp(u) <= 0) {
          log(`${u.card.name} BP เหลือ 0 หรือต่ำกว่า → Sideline`);
          await sidelineUnit(p, u, 'bp0');
        }
      }
    }
  }

  function scheduleDelayedAction(turn, fn) { G._delayedActions.push({ turn, fn }); }

  // for "[Pay N AP]" ability costs specifically (as opposed to a card's normal hand-play AP cost) —
  // tracks p._paidApByEffectThisTurn for "if you have paid an AP by your character's effect during
  // this turn, ..." cards. Per-card scripts should call this instead of payAP() directly whenever
  // the cost being paid is an activated-ability cost, not a play/raid/event cost.
  function payApForEffect(p, n) {
    const ok = payAP(p, n);
    if (ok) p._paidApByEffectThisTurn = (p._paidApByEffectThisTurn || 0) + 1;
    return ok;
  }

  return {
    G, startGame, energyGen, hasEnergyFor, effectiveNeed, effectiveAp, activeAP, bp, parseKeywords,
    raidTargetsFor, opponentOf, findUnit, hasTextCostDiscount,
    // API for the effects layer
    draw, log, payAP, sidelineUnit, returnUnitToHand, moveUnitFree, playCardFromZone, checkBpZero, update,
    scheduleDelayedAction, payApForEffect,
  };
})();

// ══════════ Effects layer (per-card scripts filled in js/effects/) ══════════
// registry[cardNo] may define any of:
//   onPlay(G,p,unit)          — when the card enters the field (normal play or Raid)
//   onAttack(G,p,unit)        — when the unit declares an attack
//   onBlock(G,p,unit)         — when the unit is declared as a blocker
//   onEvent(G,p,card)         — when an Event card is used
//   onMain(G,p,unit)          — [Activate: Main] ability, invoked by the player via the unit menu
//   onLeaveField(G,p,unit)    — unit leaves front/energy line for any reason
//   onSideline(G,p,unit,reason) — unit specifically sidelined ('battle'|'effect'|'bp0')
//   onTurnStart(G,p,unit)     — start of the unit owner's turn
//   onRaided(G,p,targetNo,raiderUnit) — fires on the covered card's own script when raided on
//   onColorTrigger(G,p,card)  — card-specific text for a [Color] life trigger
//   onDefenderWinBattle(G,p,unit,atkP,atkUnit) — fires on a successful BLOCKER's own card (the
//     attacker's BP was not enough), e.g. "[Opponent's Turn] When this character wins a battle, ..."
//   onAnyAttack(G,p,atkUnit,selfUnit) — fires on EVERY other unit p controls whenever ANY of them
//     declares an attack, e.g. "When one of your <Trait:X> characters attacks, you may rest this
//     character to ..." (selfUnit is NOT the attacker; atkUnit !== selfUnit is guaranteed)
//   bpBonus(p,unit) -> number       — dynamic passive BP addition, re-evaluated every time bp() is read
//   auraBp(owner,srcUnit,tgtUnit) -> number — aura printed on srcUnit granting BP to OTHER units on the
//                                     same field ("All your <X> get +N BP"); must not call Engine.bp()
//   impactBonus(p,unit) -> number   — dynamic passive Impact addition, added when a battle is won
//   dmgBonus(p,unit) -> number      — dynamic passive [Damage +N] addition, added on unblocked (direct-damage) attacks
//   genMod(unit) -> number          — dynamic passive energy-generation addition (energy line only)
//   frontGenBonus(p,unit) -> boolean — dynamic "also generates energy on the Front Line" grant
//   costMod(p,card) -> {needDelta,apDelta} — dynamic passive cost modifier while the card is in hand
//   canAttack(p,unit) -> boolean    — dynamic conditional attack eligibility (checked in attackPhase AND
//                                     bot.js's chooseAttacker candidate filter — both must agree, or the
//                                     bot can loop forever re-declaring an attacker attackPhase rejects)
const Effects = {
  registry: {},
  async onPlay(G, p, unit) {
    if (unit.effectsNullified) return;
    const h = this.registry[unit.no]?.onPlay;
    if (h) await h(G, p, unit);
  },
  async onAttack(G, p, unit) {
    if (unit.effectsNullified) return;
    const h = this.registry[unit.no]?.onAttack;
    if (h) await h(G, p, unit);
  },
  async onBlock(G, p, unit, atkUnit) {
    if (unit.effectsNullified) return;
    const h = this.registry[unit.no]?.onBlock;
    if (h) await h(G, p, unit, atkUnit);
  },
  async onEvent(G, p, card) {
    const h = this.registry[card.no]?.onEvent;
    if (h) await h(G, p, card);
  },
  // [Activate: Main] ability, invoked by the player via the unit menu
  async onMain(G, p, unit) {
    if (unit.effectsNullified) return;
    const h = this.registry[unit.no]?.onMain;
    if (h) await h(G, p, unit);
  },
  // fires whenever `unit` leaves the front/energy line for any reason (sideline, hand, removal)
  async onLeaveField(G, p, unit) {
    const h = this.registry[unit.no]?.onLeaveField;
    if (h) await h(G, p, unit);
  },
  // fires specifically when `unit` is sidelined. reason: 'battle' | 'effect' | 'bp0'
  async onSideline(G, p, unit, reason) {
    const h = this.registry[unit.no]?.onSideline;
    if (h) await h(G, p, unit, reason);
  },
  // fires for every one of p's own units at the start of p's turn
  async onTurnStart(G, p, unit) {
    const h = this.registry[unit.no]?.onTurnStart;
    if (h) await h(G, p, unit);
  },
  // fires on the covered (defending) card's own script when it gets raided on
  async onRaided(G, p, targetNo, raiderUnit) {
    const h = this.registry[targetNo]?.onRaided;
    if (h) await h(G, p, targetNo, raiderUnit);
  },
  // fires just before sidelineUnit auto-dumps unit.counters to the sideline; a script that wants
  // to redistribute them itself (e.g. "[On Retire] look at the cards under this character, add 1
  // to hand and the rest to Outside Area") should mutate unit.counters and return true to skip
  // the automatic dump.
  async onBeforeLeaveCounters(G, p, unit, reason) {
    const h = this.registry[unit.no]?.onBeforeLeaveCounters;
    return h ? !!(await h(G, p, unit, reason)) : false;
  },
  // predicate: does this card have SOME [Activate: Main] ability available (registry script or a
  // generic pattern)? Used by the UI/bot to decide whether to show/attempt the ability at all,
  // without actually running it. common.js extends this to also check generic onMain patterns.
  hasMain(card) {
    return !!this.registry[card.no]?.onMain;
  },
};
