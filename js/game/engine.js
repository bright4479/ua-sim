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
    return kw;
  }

  function makeUnit(cardNo) {
    const c = UAData.byNo.get(cardNo);
    return {
      uid: uidSeq++,
      no: cardNo,
      card: c,
      rested: true,          // enters play resting
      under: [],             // raid stack beneath
      bpMod: 0,              // manual/effect BP modification (until end of turn it's managed by UI/user)
      attackedThisTurn: 0,
      blockedThisTurn: 0,
      kw: parseKeywords(c),
    };
  }

  function bp(unit) { return Math.max(0, (unit.card.bp || 0) + unit.bpMod); }

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
  function energyGen(p) {
    const gen = {}; // color -> amount
    for (const u of p.energy) {
      const col = u.card.color || 'None';
      gen[col] = (gen[col] || 0) + (u.card.gen || 0);
    }
    return gen;
  }
  function hasEnergyFor(p, c) {
    if (!c.need) return true;
    const gen = energyGen(p);
    return (gen[c.color] || 0) + (gen['rainbow'] || 0) >= c.need;
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
    G.turn = 0; G.active = 0; G.over = false; G.winner = null; G.log = [];

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
    // 1-2: ready everything
    for (const u of [...p.front, ...p.energy]) { u.rested = false; u.attackedThisTurn = 0; u.blockedThisTurn = 0; }
    // expire "until start of next turn" – manual BP mods reset conservatively at controller's discretion
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
    // 5: extra draw (once, pay 1 AP)
    if (activeAP(p) >= 1 && p.deck.length > 0) {
      const want = await p.controller.chooseExtraDraw(p);
      if (want && payAP(p, 1)) {
        p.extraDrawUsed = true;
        draw(p, 1);
        log(`${p.name} จ่าย 1 AP จั่วเพิ่ม (extra draw)`);
      }
    }
    update();
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
    }
    update();
    return true;
  }

  async function movementPhase(p) {
    G.phase = 'Movement';
    update();
    // controller returns list of moves {uid, to:'front'|'energy'}
    const moves = await p.controller.chooseMovements(p);
    for (const mv of moves || []) {
      const fromLine = mv.to === 'front' ? p.energy : p.front;
      const toLine = mv.to === 'front' ? p.front : p.energy;
      const idx = fromLine.findIndex(u => u.uid === mv.uid);
      if (idx < 0) continue;
      const u = fromLine[idx];
      if (u.card.type !== 'Character') continue;
      if (mv.to === 'energy' && !u.kw.step) continue;   // only Step can go back
      if (toLine.length >= 4) {
        // must remove one card from destination to removal area
        const removedUid = mv.removeUid;
        const ri = toLine.findIndex(x => x.uid === removedUid);
        if (ri < 0) continue;
        removeToArea(p, toLine[ri], 'removal');
        toLine.splice(ri, 1);
      }
      fromLine.splice(idx, 1);
      toLine.push(u);
      log(`${p.name} ย้าย ${u.card.name} ไป ${mv.to === 'front' ? 'Front Line' : 'Energy Line'}`);
    }
    update();
  }

  function removeToArea(p, unit, area) {
    // raid stack: only top card moves; under-cards go to sideline
    for (const c of unit.under) p.sideline.push(c);
    unit.under = [];
    p[area].push(unit.no);
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
        else if (act.type === 'bpmod') { // manual effect application
          const u = findUnit(p, act.uid) || findUnit(opponentOf(p), act.uid);
          if (u) { u.bpMod += act.delta; log(`${p.name} ปรับ BP ${u.card.name} ${act.delta > 0 ? '+' : ''}${act.delta}`); }
        }
        else if (act.type === 'rest' ) { const u = findUnit(p, act.uid); if (u) u.rested = true; }
        else if (act.type === 'stand') { const u = findUnit(p, act.uid); if (u) u.rested = false; }
        else if (act.type === 'sideline') { manualZoneMove(p, act.uid, 'sideline'); }
        else if (act.type === 'removal')  { manualZoneMove(p, act.uid, 'removal'); }
        else if (act.type === 'payap') { payAP(p, act.n || 1); }
      } catch (e) {
        console.error(e);
      }
      update();
    }
  }

  function findUnit(p, uid) {
    return p.front.find(u => u.uid === uid) || p.energy.find(u => u.uid === uid);
  }

  function manualZoneMove(p, uid, area) {
    for (const line of [p.front, p.energy]) {
      const i = line.findIndex(u => u.uid === uid);
      if (i >= 0) {
        const u = line.splice(i, 1)[0];
        removeToArea(p, u, area);
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
    if (!hasEnergyFor(p, c)) { p.controller.notify?.('Energy ไม่พอ'); return; }
    if (activeAP(p) < (c.ap || 0)) { p.controller.notify?.('AP ไม่พอ'); return; }

    const line = act.line === 'front' ? p.front : p.energy;
    if (line.length >= 4) {
      if (act.removeUid == null) { p.controller.notify?.('Line เต็ม — ต้องเลือกใบที่จะส่งไป Removal'); return; }
      const ri = line.findIndex(u => u.uid === act.removeUid);
      if (ri < 0) return;
      const rem = line.splice(ri, 1)[0];
      removeToArea(p, rem, 'removal');
      log(`${p.name} ส่ง ${rem.card.name} ไป Removal (line เต็ม)`);
    }
    payAP(p, c.ap || 0);
    p.hand.splice(hi, 1);
    const u = makeUnit(act.no);
    u.rested = true; // enters resting
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
      if (activeAP(p) < (c.ap || 0)) { p.controller.notify?.('AP ไม่พอ'); return; }
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
      payAP(p, c.ap || 0);
      p.hand.splice(p.hand.indexOf(act.no), 1);
      raider = makeUnit(act.no);
    } else return;

    // stack: raider on top, target (and its stack) beneath
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
    await Effects.onPlay(G, p, raider);
    update();
  }

  async function playEvent(p, act) {
    const hi = p.hand.indexOf(act.no);
    if (hi < 0) return;
    const c = UAData.byNo.get(act.no);
    if (c.type !== 'Event') return;
    if (!hasEnergyFor(p, c)) { p.controller.notify?.('Energy ไม่พอ'); return; }
    if (activeAP(p) < (c.ap || 0)) { p.controller.notify?.('AP ไม่พอ'); return; }
    payAP(p, c.ap || 0);
    p.hand.splice(hi, 1);
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
      if (!atk || atk.rested) continue;

      atk.rested = true;
      atk.attackedThisTurn++;

      let targetUnit = null;
      if (decl.targetUid != null && atk.kw.snipe) {
        targetUnit = enemy.front.find(u => u.uid === decl.targetUid) || null;
      }
      log(`${p.name}: ${atk.card.name} โจมตี ${targetUnit ? targetUnit.card.name : enemy.name}`);
      await Effects.onAttack(G, p, atk);

      // blocking (not allowed vs snipe-target attacks)
      let blocker = null;
      if (!targetUnit) {
        const candidates = enemy.front.filter(u => !u.rested && u.card.type === 'Character');
        if (candidates.length) {
          const b = await enemy.controller.chooseBlocker(enemy, atk, candidates);
          if (b) {
            blocker = candidates.find(u => u.uid === b);
            if (blocker) {
              blocker.rested = true;
              blocker.blockedThisTurn++;
              log(`${enemy.name}: ${blocker.card.name} บล็อก!`);
              await Effects.onBlock(G, enemy, blocker);
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
          sidelineUnit(enemy, defender);
          log(`${defender.card.name} แพ้ battle → Sideline`);
          const impact = atk.kw.nullifiedImpact ? 0 : atk.kw.impact;
          if (impact > 0 && !defender.kw.nullifyImpact) {
            log(`[Impact ${impact}]!`);
            await dealDamage(p, enemy, impact, atk);
            if (G.over) return;
          }
        } else {
          log(`${atk.card.name} แพ้ battle (ไม่ถูก sideline)`);
        }
      } else {
        // direct damage
        const dmg = atk.kw.dmg || 1;
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

  function sidelineUnit(owner, unit) {
    for (const line of [owner.front, owner.energy]) {
      const i = line.indexOf(unit);
      if (i >= 0) line.splice(i, 1);
    }
    removeToArea(owner, unit, 'sideline');
  }

  // attacker picks life cards; defender checks triggers
  async function dealDamage(attackerP, defenderP, n, atkUnit) {
    n = Math.min(n, defenderP.life.length);
    if (n <= 0) { checkLifeWin(attackerP, defenderP); return; }
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
          if (u) { sidelineUnit(enemy, u); log(`Trigger [Special] — ${u.card.name} ถูก retire`); }
        }
        break;
      }
      case 'Final':
        if (p.life.length === 0 && p.deck.length > 0) {
          p.life.push(p.deck.shift());
          log(`Trigger [Final] — ${p.name} ได้ Life กลับ 1 ใบ!`);
        }
        break;
      case 'Color':
        // card-specific: show text; effect scripting layer may handle known ones
        log(`Trigger [Color]: ${c.triggerText || '(ดูการ์ด)'} — ทำตามข้อความ (manual)`);
        await p.controller.manualTrigger?.(p, c);
        break;
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
        for (const t of kw.raidTargets) {
          if (t.kind === 'name' && (u.card.name || '').includes(t.value)) out.push(u);
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
    await Effects.onPlay(G, p, raider);
  }

  async function endPhase(p) {
    G.phase = 'End';
    update();
    // ready characters/sites (AP stays)
    for (const u of [...p.front, ...p.energy]) u.rested = false;
    // hand limit 8 -> removal
    while (p.hand.length > 8) {
      const idx = await p.controller.chooseDiscard(p);
      const no = p.hand.splice(idx, 1)[0];
      p.removal.push(no);
      log(`${p.name} ทิ้ง ${UAData.byNo.get(no)?.name} ไป Removal (เกิน 8 ใบ)`);
    }
    // expire until-end-of-turn BP mods
    for (const pl of G.players)
      for (const u of [...pl.front, ...pl.energy]) u.bpMod = 0;
    update();
  }

  return {
    G, startGame, energyGen, hasEnergyFor, activeAP, bp, parseKeywords,
    raidTargetsFor, opponentOf, findUnit,
    // API for the effects layer
    draw, log, payAP, sidelineUnit, update,
  };
})();

// ══════════ Effects layer (per-card scripts filled in js/effects/) ══════════
const Effects = {
  registry: {}, // cardNo -> {onPlay, onAttack, onBlock, onEvent}
  async onPlay(G, p, unit) {
    const h = this.registry[unit.no]?.onPlay;
    if (h) await h(G, p, unit);
  },
  async onAttack(G, p, unit) {
    const h = this.registry[unit.no]?.onAttack;
    if (h) await h(G, p, unit);
  },
  async onBlock(G, p, unit) {
    const h = this.registry[unit.no]?.onBlock;
    if (h) await h(G, p, unit);
  },
  async onEvent(G, p, card) {
    const h = this.registry[card.no]?.onEvent;
    if (h) await h(G, p, card);
  },
};
