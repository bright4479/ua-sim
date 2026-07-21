// ══════════ UA SIM — Arknights (ARK) card-specific effect scripts ══════════
// Generic series-agnostic patterns live in js/effects/common.js. Everything below
// is ARK-specific logic that needed a bespoke script. ARK's mechanics lean on:
// rest-as-cost ("rest N of your actives, then ..."), the Remove Area as a real
// resource (Ch'en), Outside-Area size thresholds (Talulah 15+), and play-from-zone
// loops (Mephisto / FrostNova / Doctor).

(() => {
  const reg = Effects.registry;
  const H = window.UAEffectHelpers;
  const log = m => Engine.log(m);
  const byNo = no => UAData.byNo.get(no);

  // ---------- small ARK-local helpers ----------

  function ownerOf(u) {
    for (const pl of Engine.G.players) if (pl.front.includes(u) || pl.energy.includes(u)) return pl;
    return null;
  }

  // debuff targeting ANY opponent character (front OR energy line) with an optional BP floor
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

  // choose one of p's own characters matching `pred` and buff it (buffOwnCharacter has no
  // predicate parameter, several ARK buffs are condition-scoped)
  async function buffOwnWhere(p, pred, delta, title) {
    const units = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && pred(u));
    if (!units.length) return null;
    const uid = await p.controller.chooseOwnCharacter(p, units, title || `เลือก character รับ +${delta} BP เทิร์นนี้`, true);
    const u = units.find(x => x.uid === uid);
    if (u) { u.bpMod += delta; log(`${p.name}: ${u.card.name} +${delta} BP เทิร์นนี้`); }
    return u;
  }

  // "rest any number of your active characters" loop — returns how many were rested.
  // Bots cap at `botCap` so they don't dump their whole board into a single effect.
  async function restActivesLoop(p, { excludeUnit, max = Infinity, botCap = 2, needZero = false } = {}) {
    let count = 0;
    while (count < max) {
      const actives = [...p.front, ...p.energy].filter(u => !u.rested && u !== excludeUnit &&
        u.card.type === 'Character' && (!needZero || (u.card.need || 0) === 0));
      if (!actives.length) break;
      if (p.controller.isBot && count >= botCap) break;
      const uid = await p.controller.chooseOwnCharacter(p, actives, `เลือก character (Active) ให้วางนอน — วางแล้ว ${count} ใบ (ยกเลิกเพื่อหยุด)`, true);
      const u = actives.find(x => x.uid === uid);
      if (!u) break;
      u.rested = true;
      log(`${p.name}: วางนอน ${u.card.name}`);
      count++;
    }
    return count;
  }

  // "Talulah, the Fighter" flips to <Deathless Black Snake, Talulah> at 15+ Outside-Area cards
  function hasDeathless(p) {
    return [...p.front, ...p.energy].some(u =>
      (u.card.name || '').includes('Deathless Black Snake') ||
      ((u.card.name || '').includes('Talulah, the Fighter') && p.sideline.length >= 15));
  }

  // Kashchey's [On Retire]: tuck itself face-down under a Talulah-named character, then mill 3.
  // Reused by Talulah-the-Fighter 040's discard-flashback.
  async function kashcheyTuck(p, cardNo, sourceLabel) {
    const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Talulah'));
    if (!targets.length) return false;
    const uid = await p.controller.chooseOwnCharacter(p, targets, `${sourceLabel}: วาง Kashchey คว่ำใต้ Talulah ใบไหน? (ไม่บังคับ)`, true);
    const t = targets.find(x => x.uid === uid);
    if (!t) return false;
    const i = p.sideline.lastIndexOf(cardNo);
    if (i < 0) return false;
    p.sideline.splice(i, 1);
    t.counters.push(cardNo);
    const n = Math.min(3, p.deck.length);
    p.sideline.push(...p.deck.splice(0, n));
    log(`${sourceLabel}: Kashchey ถูกวางคว่ำใต้ ${t.card.name} และส่งการ์ดบนเด็ค ${n} ใบไป Outside Area`);
    return true;
  }

  // ---------- EX11BT-ARK-2 ----------

  // 001 Misha — rest up to 2 own active need-0 characters; if fewer than 2 rested, self-bounce.
  reg['EX11BT-ARK-2-001'] = {
    async onPlay(G, p, unit) {
      const n = await restActivesLoop(p, { excludeUnit: unit, max: 2, botCap: 2, needZero: true });
      if (n < 2) {
        await Engine.returnUnitToHand(p, unit);
        log(`${unit.card.name}: วางนอนไม่ครบ 2 ใบ — กลับมือ`);
      }
    },
  };

  // 003 W — [Main][When in Frontline][1/turn] swap positions with an Energy-Line character (need<=4).
  reg['EX11BT-ARK-2-003'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.energy.filter(u => u.card.type === 'Character' && (u.card.need || 0) <= 4);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมายบน Energy Line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Energy Line เพื่อสลับตำแหน่ง');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      const iF = p.front.indexOf(unit), iE = p.energy.indexOf(t);
      p.front[iF] = t; p.energy[iE] = unit;
      log(`${unit.card.name}: สลับตำแหน่งกับ ${t.card.name}`);
    },
  };

  // 005 Talulah — may rest 2 actives -> free-play a yellow character (need<=2, AP1) from hand rested.
  reg['EX11BT-ARK-2-005'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 2 && (c.ap || 0) === 1;
      if (!p.hand.some(no => pred(byNo(no)))) return;
      const actives = [...p.front, ...p.energy].filter(u => !u.rested && u !== unit && u.card.type === 'Character');
      if (actives.length < 2) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: วางนอน 2 ใบเพื่อลง character Yellow (Energy≤2) จากมือฟรี?`,
        [{ label: 'วางนอน 2 ใบ', value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      const n = await restActivesLoop(p, { excludeUnit: unit, max: 2, botCap: 2 });
      if (n < 2) return;
      const idx = p.hand.findIndex(no => pred(byNo(no)));
      if (idx >= 0) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 006 Patriot — opponent rests 2 of their own active characters (their choice).
  reg['EX11BT-ARK-2-006'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      for (let i = 0; i < 2; i++) {
        const actives = [...enemy.front, ...enemy.energy].filter(u => !u.rested && u.card.type === 'Character');
        if (!actives.length) break;
        const uid = await enemy.controller.chooseOwnCharacter(enemy, actives, `${unit.card.name}: เลือก character ของคุณให้วางนอน (${i + 1}/2)`);
        const u = actives.find(x => x.uid === uid) || actives[0];
        u.rested = true;
        log(`${unit.card.name}: ${enemy.name} วางนอน ${u.card.name}`);
      }
    },
  };

  // 008 Mephisto — [Your Turn] draw 1 whenever this leaves the area (approximates "by your own
  // effect": on your own turn, leaving the field is almost always effect-driven).
  reg['EX11BT-ARK-2-008'] = {
    async onLeaveField(G, p, unit) {
      if (Engine.G.players[Engine.G.active] !== p) return;
      Engine.draw(p, 1);
      log(`${unit.card.name}: จั่ว 1 ใบ (ออกจากสนามในเทิร์นของตัวเอง)`);
    },
  };

  // 010 FrostNova — draw 1 per 2 rested enemy characters.
  reg['EX11BT-ARK-2-010'] = {
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const rested = [...enemy.front, ...enemy.energy].filter(u => u.rested && u.card.type === 'Character').length;
      const n = Math.floor(rested / 2);
      if (n > 0) { Engine.draw(p, n); log(`${unit.card.name}: จั่ว ${n} ใบ (ศัตรูนอนอยู่ ${rested} ใบ)`); }
    },
  };

  // 011 Living Monster — draw 1; stand all rested Energy-Line cards; if 3+ stood, untap 1 AP.
  reg['EX11BT-ARK-2-011'] = {
    async onEvent(G, p, card) {
      Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`);
      let n = 0;
      for (const u of p.energy) if (u.rested) { u.rested = false; n++; }
      if (n) log(`${card.name}: การ์ดบน Energy Line กลับมา Active ${n} ใบ`);
      if (n >= 3) await H.apUntap(p, 1);
    },
  };

  // 012 Inherited Will — free-play a yellow character (need<=1, AP1) from Outside Area rested;
  // then all own characters with need<=2 get +1000 BP this turn.
  reg['EX11BT-ARK-2-012'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 1 && (c.ap || 0) === 1;
      if (p.sideline.some(no => pred(byNo(no)))) {
        const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก character Yellow (Energy≤1) จาก Outside Area`, pred);
        if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
      let n = 0;
      for (const u of [...p.front, ...p.energy]) if (u.card.type === 'Character' && (u.card.need || 0) <= 2) { u.bpMod += 1000; n++; }
      if (n) log(`${card.name}: character (Energy≤2) ${n} ใบ +1000 BP เทิร์นนี้`);
    },
  };

  // 014 Amiya — [On Play] stands if a BP4000+ character is on your Energy Line; [When Attacking]
  // choose: skip own next stand, or retire one of your characters. ("Must attack" not enforced.)
  reg['EX11BT-ARK-2-014'] = {
    async onPlay(G, p, unit) {
      if (p.energy.some(u => u.card.type === 'Character' && Engine.bp(u) >= 4000)) {
        unit.rested = false;
        log(`${unit.card.name}: เข้าสนามแบบ Active (มี character BP≥4000 บน Energy Line)`);
      }
    },
    async onAttack(G, p, unit) {
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      const opts = [{ label: 'ครั้งหน้าที่การ์ดนี้จะ Active มันจะไม่ Active', value: 'skip' }];
      if (others.length) opts.push({ label: 'Retire character ของตัวเอง 1 ใบ', value: 'retire' });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      if (v === 'retire') {
        const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character เพื่อ retire');
        const t = others.find(x => x.uid === uid);
        if (t) await Engine.sidelineUnit(p, t, 'effect');
      } else {
        unit.skipNextStand = true;
        log(`${unit.card.name}: จะไม่ Active ในครั้งถัดไป`);
      }
    },
  };

  // 015 Elysium — [Main][Rest][1/turn] look top 3, fetch Rhodes Island Pharmaceuticals; then
  // schedule self-retire at end of Main Phase.
  reg['EX11BT-ARK-2-015'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Rhodes Island Pharmaceuticals'), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: จะ retire เมื่อจบ Main Phase`);
    },
  };

  // 017 Kal'tsit — fetch a non-Kal'tsit character (need<=3) from Outside Area; may pay 1 AP
  // first to raise the range to need<=4.
  reg['EX11BT-ARK-2-017'] = {
    async onPlay(G, p, unit) {
      let maxNeed = 3;
      if (Engine.activeAP(p) >= 1 && !p.controller.isBot) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: จ่าย 1 AP เพื่อขยายเป็น Energy≤4?`,
          [{ label: 'ไม่จ่าย (Energy≤3)', value: false }, { label: 'จ่าย 1 AP (Energy≤4)', value: true }]);
        if (v && Engine.payAP(p, 1)) maxNeed = 4;
      }
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && !(c.name || '').includes("Kal'tsit") && (c.need || 0) <= maxNeed,
        `${unit.card.name}: เลือก character (Energy≤${maxNeed}) จาก Outside Area`);
    },
  };

  // 019 Warfarin — [Main][Rest][1/turn] buff another +2000; self +2000 and retire at end of Main.
  reg['EX11BT-ARK-2-019'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.buffOwnCharacter(p, 2000, { excludeUnit: unit });
      unit.bpMod += 2000;
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: +2000 BP และจะ retire เมื่อจบ Main Phase`);
    },
  };

  // 020 Blaze — [When Attacking] may discard 1 -> retire enemy front BP<=1000.
  reg['EX11BT-ARK-2-020'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      if (!enemy.front.some(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) <= 1000)) return;
      const discarded = await H.discardFromHand(p, `${unit.card.name}: ทิ้ง 1 ใบเพื่อ retire ศัตรู BP≤1000? (ไม่บังคับ)`);
      if (discarded) await H.retireEnemyFront(p, 1000);
    },
  };

  // 022 Rosmontis — [When Attacking] rest enemy front BP<=1500.
  reg['EX11BT-ARK-2-022'] = {
    async onAttack(G, p, unit) { await H.restEnemyFront(p, 1500); },
  };

  // 024 As You Wish — bounce enemy front BP<=5000 (retire instead if own Rosmontis present).
  reg['EX11BT-ARK-2-024'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'Rosmontis')) await H.retireEnemyFront(p, 5000);
      else await H.bounceEnemyFront(p, 5000);
    },
  };

  // 027 Alina — [On Retire] draw 1, mill 3 to Outside Area. (Energy-Line position-swap clause not automated.)
  reg['EX11BT-ARK-2-027'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const n = Math.min(3, p.deck.length);
      p.sideline.push(...p.deck.splice(0, n));
      log(`${unit.card.name}: ส่งการ์ดบนเด็ค ${n} ใบไป Outside Area`);
    },
  };

  // 029 Emperor's Blade — draw 1; retire an opponent Field card.
  reg['EX11BT-ARK-2-029'] = {
    async onPlay(G, p, unit) {
      Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`);
      const enemy = Engine.opponentOf(p);
      const fields = enemy.energy.filter(u => u.card.type === 'Field' && !u.kw.untargetable);
      if (!fields.length) return;
      const uid = await p.controller.chooseEnemyCharacter(p, fields, `${unit.card.name}: เลือก Field ศัตรูให้ retire`, true);
      const t = fields.find(x => x.uid === uid);
      if (t) await Engine.sidelineUnit(enemy, t, 'effect');
    },
  };

  // 030 Kashchey — [Main][Front][1/turn] grant another character front-line generation this turn;
  // [On Retire] may tuck under a Talulah, then mill 3.
  reg['EX11BT-ARK-2-030'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่น'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character รับ "สร้าง energy บน Front Line ได้" เทิร์นนี้');
      const t = others.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      t.tempFrontGen = true;
      log(`${unit.card.name}: ${t.card.name} สร้าง energy บน Front Line ได้เทิร์นนี้`);
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await kashcheyTuck(p, unit.no, unit.card.name);
    },
  };

  // 031 Sasha — [Main][Front][1/turn] scry top card (keep on top or send to Outside Area).
  reg['EX11BT-ARK-2-031'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.scryTop(p, ['top', 'outside']);
    },
  };

  // 032 W — choose one: 15+ Outside -> Impact+1 to a Reunion Movement character, or 9+ Remove ->
  // Impact+1 to a Rhodes Island Pharmaceuticals character.
  reg['EX11BT-ARK-2-032'] = {
    async onPlay(G, p, unit) {
      const opts = [];
      if (p.sideline.length >= 15) opts.push({ label: 'Impact +1 ให้ Trait: Reunion Movement (Outside ≥15)', value: 'reunion' });
      if (p.removal.length >= 9) opts.push({ label: 'Impact +1 ให้ Trait: Rhodes Island Pharmaceuticals (Remove ≥9)', value: 'rhodes' });
      if (!opts.length) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, opts);
      const trait = v === 'reunion' ? 'Reunion Movement' : 'Rhodes Island Pharmaceuticals';
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes(trait));
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `เลือก character รับ [Impact +1] เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.tempImpact += 1; log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`); }
    },
  };

  // 033 W — may reveal a (Special)-trigger card from hand -> tuck it + top-deck card face-down
  // under self and stand up; [On Retire] all tucked cards return to hand.
  reg['EX11BT-ARK-2-033'] = {
    async onPlay(G, p, unit) {
      const idx = p.hand.findIndex(no => byNo(no)?.trigger === 'Special');
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เปิดเผยการ์ด Trigger (Special) เพื่อวางคว่ำใต้ตัวเองและ Active?`,
        [{ label: `เปิดเผย ${byNo(p.hand[idx])?.name}`, value: true }, { label: 'ข้าม', value: false }]);
      if (!v) return;
      unit.counters.push(p.hand.splice(idx, 1)[0]);
      unit.rested = false;
      if (p.deck.length) unit.counters.push(p.deck.shift());
      log(`${unit.card.name}: วางการ์ดคว่ำใต้ตัวเอง 2 ใบ และกลับเป็น Active`);
    },
    async onBeforeLeaveCounters(G, p, unit, reason) {
      if (!unit.counters.length) return false;
      p.hand.push(...unit.counters);
      log(`${unit.card.name}: การ์ดคว่ำใต้ตัวเอง ${unit.counters.length} ใบเข้ามือ`);
      unit.counters = [];
      return true;
    },
  };

  // 035 Ch'en — may move 1 Outside-Area card to the Remove Area; if Remove has 3+, buff own +1000.
  reg['EX11BT-ARK-2-035'] = {
    async onPlay(G, p, unit) {
      if (p.sideline.length) {
        const v = await p.controller.chooseOption(p, `${unit.card.name}: ย้ายการ์ด 1 ใบจาก Outside Area ไป Remove Area?`,
          [{ label: 'ย้าย', value: true }, { label: 'ข้าม', value: false }]);
        if (v) { p.removal.push(p.sideline.pop()); log(`${unit.card.name}: ย้าย 1 ใบไป Remove Area`); }
      }
      if (p.removal.length >= 3) await H.buffOwnCharacter(p, 1000);
    },
  };

  // 036 Ch'en — [Your Turn] gains [Damage +1] while 3+ cards are in your Remove Area.
  reg['EX11BT-ARK-2-036'] = {
    dmgBonus(p, unit) { return p.removal.length >= 3 ? 1 : 0; },
  };

  // 039 Talulah, the Fighter — +1 generated energy at 15+ Outside-Area cards (the "Deathless
  // Black Snake" rename is handled by hasDeathless() where other cards check for it).
  reg['EX11BT-ARK-2-039'] = {
    genMod(u, p) { return (p || ownerOf(u))?.sideline.length >= 15 ? 1 : 0; },
  };

  // 040 Talulah, the Fighter — [On Play/Energy] place 1 hand card to Outside; if it was
  // Kashchey, may activate Kashchey's tuck-and-mill [On Retire].
  reg['EX11BT-ARK-2-040'] = {
    async onPlay(G, p, unit) {
      const no = await H.discardFromHand(p, `${unit.card.name}: วางการ์ดจากมือ 1 ใบไป Outside Area`);
      if (!no) return;
      if ((byNo(no)?.name || '').includes('Kashchey')) await kashcheyTuck(p, no, unit.card.name);
    },
  };

  // 041 Talulah, the Fighter — [Main][Rest][1/turn] move an own BP<=1000 character to the other line.
  reg['EX11BT-ARK-2-041'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && Engine.bp(u) <= 1000);
      if (!targets.length) { p.controller.notify?.('ไม่มี character BP≤1000'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character (BP≤1000) ที่จะย้าย line');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await Engine.moveUnitFree(p, t, p.front.includes(t) ? 'energy' : 'front');
    },
  };

  // 045 FrostNova — +500 BP per 5 cards in your Outside Area.
  reg['EX11BT-ARK-2-045'] = {
    bpBonus(p, unit) { return Math.floor(p.sideline.length / 5) * 500; },
  };

  // 046 FrostNova — discount: next BP<=1000 character card from hand costs 1 less AP this turn.
  reg['EX11BT-ARK-2-046'] = {
    async onPlay(G, p, unit) {
      p.pendingDiscount = { predicate: c => c.type === 'Character' && (c.bp || 0) <= 1000, apDelta: -1 };
      log(`${unit.card.name}: character (BP≤1000) ใบถัดไปจากมือลด AP 1`);
    },
  };

  // 048 Amiya — if own Ch'en present: choose draw 1, or move up to 2 Outside-Area cards to Remove.
  reg['EX11BT-ARK-2-048'] = {
    async onPlay(G, p, unit) {
      if (!H.hasCardNamed(p, "Ch'en")) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'จั่ว 1 ใบ', value: 'draw' },
        { label: 'ย้ายการ์ด 2 ใบจาก Outside Area ไป Remove Area', value: 'remove' },
      ]);
      if (v === 'draw') { Engine.draw(p, 1); log(`${unit.card.name}: จั่ว 1 ใบ`); }
      else {
        const n = Math.min(2, p.sideline.length);
        for (let i = 0; i < n; i++) p.removal.push(p.sideline.pop());
        log(`${unit.card.name}: ย้าย ${n} ใบไป Remove Area`);
      }
    },
  };

  // 053 Doctor — [On Play] buff a purple Rhodes/Ch'en (not Doctor) +1000; [On Retire] may move
  // itself to the Remove Area to re-run that buff. (Front-Line play restriction not enforced.)
  reg['EX11BT-ARK-2-053'] = {
    async onPlay(G, p, unit) {
      await buffOwnWhere(p, u => u.card.color === 'Purple' && !(u.card.name || '').includes('Doctor') &&
        ((u.card.traits || '').includes('Rhodes Island Pharmaceuticals') || (u.card.name || '').includes("Ch'en")), 1000,
        `${unit.card.name}: เลือก character Purple (Rhodes/Ch'en) รับ +1000 BP`);
    },
    async onSideline(G, p, unit, reason) {
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ย้ายไป Remove Area เพื่อใช้ effect [On Play] อีกครั้ง?`,
        [{ label: 'ย้ายไป Remove Area', value: true }, { label: 'อยู่ที่ Outside Area', value: false }]);
      if (!v) return;
      const i = p.sideline.lastIndexOf(unit.no);
      if (i < 0) return;
      p.sideline.splice(i, 1);
      p.removal.push(unit.no);
      log(`${unit.card.name}: ย้ายไป Remove Area`);
      await reg['EX11BT-ARK-2-053'].onPlay(G, p, unit);
    },
  };

  // 057 Deathless Inferno — enemy front -4000; if Deathless Black Snake Talulah present, all enemy front -1000.
  reg['EX11BT-ARK-2-057'] = {
    async onEvent(G, p, card) {
      await H.debuffEnemyFront(p, -4000);
      if (hasDeathless(p)) {
        const enemy = Engine.opponentOf(p);
        for (const u of enemy.front) if (u.card.type === 'Character') u.bpMod -= 1000;
        log(`${card.name}: ศัตรูทุกตัวบน Front Line -1000 BP เทิร์นนี้`);
        await Engine.checkBpZero();
      }
    },
  };

  // 059 Long Lasting Memories — look top 4, add up to 2 to hand, rest go to the Remove Area.
  reg['EX11BT-ARK-2-059'] = {
    async onEvent(G, p, card) {
      const n = Math.min(4, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือกเข้ามือได้ 2 ใบ (ที่เหลือไป Remove Area)`, null, 2);
      picked.sort((a, b) => b - a).forEach(i => { p.hand.push(revealed.splice(i, 1)[0]); });
      p.removal.push(...revealed);
      log(`${card.name}: เข้ามือ ${picked.length} ใบ, ไป Remove Area ${revealed.length} ใบ`);
    },
  };

  // 060 Unyielding — fetch a character from Outside Area; if a Talulah is on your area, draw 1.
  reg['EX11BT-ARK-2-060'] = {
    async onEvent(G, p, card) {
      await H.fetchFromSideline(p, c => c && c.type === 'Character', `${card.name}: เลือก character จาก Outside Area`);
      if (H.hasCardNamed(p, 'Talulah')) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ`); }
    },
  };

  // 061 In The Flames — only if no Character cards in Outside Area: draw 3, or Amiya +1000 & Impact+3.
  reg['EX11BT-ARK-2-061'] = {
    async onEvent(G, p, card) {
      if (p.sideline.some(no => byNo(no)?.type === 'Character')) { log(`${card.name}: ใช้ไม่ได้ (มี Character ใน Outside Area)`); return; }
      const amiyas = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('Amiya'));
      const opts = [{ label: 'จั่ว 3 ใบ', value: 'draw' }];
      if (amiyas.length) opts.push({ label: 'Amiya +1000 BP และ [Impact +3] เทิร์นนี้', value: 'amiya' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'amiya') {
        const uid = await p.controller.chooseOwnCharacter(p, amiyas, 'เลือก Amiya', true);
        const t = amiyas.find(x => x.uid === uid);
        if (t) { t.bpMod += 1000; t.tempImpact += 3; log(`${card.name}: ${t.card.name} +1000 BP และ [Impact +3] เทิร์นนี้`); }
      } else { Engine.draw(p, 3); log(`${card.name}: จั่ว 3 ใบ`); }
    },
  };

  // 063 Exusiai — -2000 BP on opponent's turn while on the Front Line; [On Retire] look top 3
  // fetch Penguin Logistics / red BP2500 character.
  reg['EX11BT-ARK-2-063'] = {
    bpBonus(p, unit) {
      const myTurn = Engine.G.players[Engine.G.active] === p;
      return (!myTurn && p.front.includes(unit)) ? -2000 : 0;
    },
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.lookTopAndTake(p, 3, c => (c.traits || '').includes('Penguin Logistics') ||
        (c.type === 'Character' && (c.color || '') === 'Red' && c.bp === 2500), 1, `${unit.card.name}: ดูการ์ดบนสุด 3 ใบ`);
    },
  };

  // 065 Sora — [Main][Rest] buff another +500, or +1500 and self-bounce. ("Cannot attack" not enforced.)
  reg['EX11BT-ARK-2-065'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const v = await p.controller.chooseOption(p, `${unit.card.name}: เลือก effect`, [
        { label: 'character อื่น +500 BP เทิร์นนี้', value: 'small' },
        { label: 'character อื่น +1500 BP เทิร์นนี้ แล้วการ์ดนี้กลับมือ', value: 'big' },
      ]);
      unit.rested = true;
      if (v === 'big') {
        await H.buffOwnCharacter(p, 1500, { excludeUnit: unit });
        await Engine.returnUnitToHand(p, unit);
        log(`${unit.card.name}: กลับมือ`);
      } else {
        await H.buffOwnCharacter(p, 500, { excludeUnit: unit });
      }
    },
  };

  // 073 A Logistics Company Full of Mysteries — look top 5, add red characters totalling <=7500 BP.
  reg['EX11BT-ARK-2-073'] = {
    async onEvent(G, p, card) {
      const n = Math.min(5, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const picked = await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือก character สีแดง (BP รวม ≤7500)`,
        c => c.type === 'Character' && c.color === 'Red', 5);
      let total = 0;
      const takeIdx = [];
      for (const i of picked) {
        const bp = byNo(revealed[i])?.bp || 0;
        if (total + bp <= 7500) { total += bp; takeIdx.push(i); }
      }
      takeIdx.sort((a, b) => b - a).forEach(i => { p.hand.push(revealed.splice(i, 1)[0]); });
      log(`${card.name}: เข้ามือ ${takeIdx.length} ใบ (BP รวม ${total})`);
      p.deck.push(...revealed);
    },
  };

  // ---------- UA30BT-ARK-1 ----------

  // 002 Misha — buff an own character with need<=2 by +2000.
  reg['UA30BT-ARK-1-002'] = {
    async onPlay(G, p, unit) {
      await buffOwnWhere(p, u => (u.card.need || 0) <= 2, 2000, `${unit.card.name}: เลือก character (Energy≤2) รับ +2000 BP`);
    },
  };

  // 003 Alex — [On Retire] fetch a [Raid] character from Outside Area to hand.
  reg['UA30BT-ARK-1-003'] = {
    async onSideline(G, p, unit, reason) {
      if (reason === 'battle') return;
      await H.fetchFromSideline(p, c => c && c.type === 'Character' && Engine.parseKeywords(c).raidTargets.length,
        `${unit.card.name}: เลือก character ที่มี [Raid] จาก Outside Area`);
    },
  };

  // 013 Talulah — [Main][1/turn] set an Energy-Line character to active or rest it.
  reg['UA30BT-ARK-1-013'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = p.energy.filter(u => u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character บน Energy Line'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character บน Energy Line');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      if (t.rested) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
      else { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 015 Talulah — rest N actives on play (retire N other rested on Main) -> retire enemy front
  // with BP <= 1000 + 1000*N.
  reg['UA30BT-ARK-1-015'] = {
    async onPlay(G, p, unit) {
      const n = await restActivesLoop(p, { excludeUnit: unit, botCap: 2 });
      await H.retireEnemyFront(p, 1000 + n * 1000);
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      let count = 0;
      for (;;) {
        const rested = [...p.front, ...p.energy].filter(u => u.rested && u !== unit && u.card.type === 'Character');
        if (!rested.length) break;
        if (p.controller.isBot && count >= 2) break;
        const uid = await p.controller.chooseOwnCharacter(p, rested, `เลือก character (นอนอยู่) เพื่อ retire — retire แล้ว ${count} ใบ (ยกเลิกเพื่อหยุด)`, true);
        const u = rested.find(x => x.uid === uid);
        if (!u) break;
        await Engine.sidelineUnit(p, u, 'effect');
        count++;
      }
      await H.retireEnemyFront(p, 1000 + count * 1000);
    },
  };

  // 019 Faust — [Main][1/turn] bottom-deck an own character -> debuff enemy (BP>=2000) -1500;
  // Mephisto bonus: untap 1 AP + self +500 until next turn.
  reg['UA30BT-ARK-1-019'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character อื่น'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character วางไว้ใต้เด็ค');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      const wasMephisto = (t.card.name || '').includes('Mephisto');
      for (const line of [p.front, p.energy]) {
        const i = line.indexOf(t);
        if (i >= 0) line.splice(i, 1);
      }
      for (const c of t.under) p.sideline.push(c);
      if (t.counters.length) p.sideline.push(...t.counters);
      p.deck.push(t.no);
      log(`${unit.card.name}: ${t.card.name} ถูกวางไว้ใต้เด็ค`);
      const enemy = Engine.opponentOf(p);
      const foes = enemy.front.filter(u => u.card.type === 'Character' && !u.kw.untargetable && Engine.bp(u) >= 2000);
      if (foes.length) {
        const uid2 = await p.controller.chooseEnemyCharacter(p, foes, 'เลือก character ศัตรู (BP≥2000) รับ -1500 BP เทิร์นนี้', true);
        const f = foes.find(x => x.uid === uid2);
        if (f) { f.bpMod -= 1500; log(`${unit.card.name}: ${f.card.name} -1500 BP เทิร์นนี้`); await Engine.checkBpZero(); }
      }
      if (p.front.includes(unit) && wasMephisto) {
        await H.apUntap(p, 1);
        unit.bpPersist += 500;
        log(`${unit.card.name}: +500 BP จนถึงต้นเทิร์นถัดไป (Mephisto bonus)`);
      }
    },
  };

  // 021 Mephisto — [Main][Rest][1/turn] discard a need>=1 card -> replay a yellow need-0 character
  // from the Outside Area rested; it retires at end of turn and goes to the REMOVE Area instead.
  reg['UA30BT-ARK-1-021'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const handIdx = p.hand.findIndex(no => (byNo(no)?.need || 0) >= 1);
      if (handIdx < 0) { p.controller.notify?.('ต้องมีการ์ด Energy≥1 ในมือ'); return; }
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) === 0;
      if (!p.sideline.some(no => pred(byNo(no)))) { p.controller.notify?.('ไม่มี character Yellow (Energy 0) ใน Outside Area'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      p.sideline.push(p.hand.splice(handIdx, 1)[0]);
      log(`${unit.card.name}: ทิ้งการ์ด 1 ใบไป Outside Area`);
      const idx = await p.controller.chooseCardFromSideline(p, 'เลือก character Yellow (Energy 0) จาก Outside Area', pred);
      if (idx == null) return;
      const played = await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      if (played) {
        played.retireAtEndOfTurn = true;
        (played._watchers ||= []).push(async (G2, owner2, u2) => {
          const i = owner2.sideline.lastIndexOf(u2.no);
          if (i >= 0) { owner2.sideline.splice(i, 1); owner2.removal.push(u2.no); log(`${u2.card.name}: ถูกส่งไป Remove Area (ผลของ Mephisto)`); }
        });
        log(`${played.card.name}: จะถูก retire ไป Remove Area ตอนจบเทิร์น`);
      }
    },
  };

  // 022 Reunion Movement Soldier — if played by an effect: stands and +2000 BP this turn.
  reg['UA30BT-ARK-1-022'] = {
    async onPlay(G, p, unit) {
      if (!unit._playedByEffect) return;
      unit.rested = false;
      unit.bpMod += 2000;
      log(`${unit.card.name}: Active + +2000 BP เทิร์นนี้ (ถูกลงสนามด้วย effect)`);
    },
  };

  // 023 Yeti Squadron — [Main][Front][Rest] set a FrostNova active. (Protection aura not automated.)
  reg['UA30BT-ARK-1-023'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.name || '').includes('FrostNova') && u.rested);
      if (!targets.length) { p.controller.notify?.('ไม่มี FrostNova ที่นอนอยู่'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก FrostNova ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit.rested = true;
      t.rested = false;
      log(`${unit.card.name}: ${t.card.name} เป็น Active`);
    },
  };

  // 025 FrostNova — play a Yeti Squadron from hand or Outside Area rested.
  reg['UA30BT-ARK-1-025'] = {
    async onPlay(G, p, unit) {
      const pred = c => c && (c.name || '').includes('Yeti Squadron');
      const handIdx = p.hand.findIndex(no => pred(byNo(no)));
      const inSideline = p.sideline.some(no => pred(byNo(no)));
      if (handIdx < 0 && !inSideline) return;
      const opts = [];
      if (handIdx >= 0) opts.push({ label: 'ลงจากมือ', value: 'hand' });
      if (inSideline) opts.push({ label: 'ลงจาก Outside Area', value: 'sideline' });
      opts.push({ label: 'ข้าม', value: null });
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ลง Yeti Squadron (rested)?`, opts);
      if (v === 'hand') await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line: 'energy', active: false });
      else if (v === 'sideline') {
        const idx = await p.controller.chooseCardFromSideline(p, 'เลือก Yeti Squadron', pred);
        if (idx != null) await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
      }
    },
  };

  // 026 FrostNova — [Main][Front][Rest] rest an enemy Front-Line character.
  reg['UA30BT-ARK-1-026'] = {
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      unit.rested = true;
      await H.restEnemyFront(p);
    },
  };

  // 028 Abandoned City (Field) — [Main][Rest][Discard 1] if opponent has 2+ rested characters:
  // set an own character active.
  reg['UA30BT-ARK-1-028'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const enemy = Engine.opponentOf(p);
      const restedN = [...enemy.front, ...enemy.energy].filter(u => u.rested && u.card.type === 'Character').length;
      if (restedN < 2) { p.controller.notify?.('ศัตรูต้องมี character นอนอยู่ ≥2 ใบ'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u.rested && u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character ที่นอนอยู่'); return; }
      unit.rested = true;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ให้ Active');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = false; log(`${unit.card.name}: ${t.card.name} เป็น Active`); }
    },
  };

  // 031 Lullabye — rest enemy BP<=5000 + it skips its next stand; retire instead if FrostNova present.
  reg['UA30BT-ARK-1-031'] = {
    async onEvent(G, p, card) {
      if (H.hasCardNamed(p, 'FrostNova')) {
        const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, [
          { label: 'Retire ศัตรู BP≤5000 (มี FrostNova)', value: 'retire' },
          { label: 'วางนอน + ห้าม Active ครั้งถัดไป', value: 'rest' },
        ]);
        if (v === 'retire') { await H.retireEnemyFront(p, 5000); return; }
      }
      const u = await H.restEnemyFront(p, 5000);
      if (u) { u.skipNextStand = true; log(`${card.name}: ${u.card.name} จะไม่ Active ในครั้งถัดไป`); }
    },
  };

  // 032 Reunion Movement — play up to 2 yellow characters (need<=2, AP1) from hand/Outside rested;
  // set one of them active. (Raid option not supported.)
  reg['UA30BT-ARK-1-032'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && c.color === 'Yellow' && (c.need || 0) <= 2 && (c.ap || 0) === 1;
      const played = [];
      for (let i = 0; i < 2; i++) {
        const handIdx = p.hand.findIndex(no => pred(byNo(no)));
        const inSideline = p.sideline.some(no => pred(byNo(no)));
        if (handIdx < 0 && !inSideline) break;
        const opts = [];
        if (handIdx >= 0) opts.push({ label: `ลงจากมือ (${byNo(p.hand[handIdx])?.name})`, value: 'hand' });
        if (inSideline) opts.push({ label: 'ลงจาก Outside Area', value: 'sideline' });
        opts.push({ label: 'หยุด', value: null });
        const v = await p.controller.chooseOption(p, `${card.name}: ลง character Yellow (Energy≤2) ใบที่ ${i + 1}/2`, opts);
        if (v === 'hand') {
          const u = await Engine.playCardFromZone(p, p.hand[handIdx], 'hand', { line: 'energy', active: false });
          if (u) played.push(u);
        } else if (v === 'sideline') {
          const idx = await p.controller.chooseCardFromSideline(p, 'เลือก character Yellow (Energy≤2)', pred);
          if (idx == null) break;
          const u = await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: false });
          if (u) played.push(u);
        } else break;
      }
      if (played.length) {
        const uid = await p.controller.chooseOwnCharacter(p, played, `${card.name}: เลือก 1 ใบให้ Active`, true);
        const t = played.find(x => x.uid === uid);
        if (t) { t.rested = false; log(`${card.name}: ${t.card.name} เป็น Active`); }
      }
    },
  };

  // 033 Spicy Candy — untap 1 AP; both players rest 1 own active front character; a FrostNova
  // rested this way stands right back up. (1-per-turn limit not enforced.)
  reg['UA30BT-ARK-1-033'] = {
    async onEvent(G, p, card) {
      await H.apUntap(p, 1);
      const enemy = Engine.opponentOf(p);
      const mine = p.front.filter(u => !u.rested && u.card.type === 'Character');
      if (mine.length) {
        const uid = await p.controller.chooseOwnCharacter(p, mine, `${card.name}: เลือก character ของคุณให้วางนอน`);
        const t = mine.find(x => x.uid === uid) || mine[0];
        t.rested = true;
        log(`${card.name}: ${p.name} วางนอน ${t.card.name}`);
        if ((t.card.name || '').includes('FrostNova')) { t.rested = false; log(`${card.name}: ${t.card.name} กลับเป็น Active (FrostNova)`); }
      }
      const theirs = enemy.front.filter(u => !u.rested && u.card.type === 'Character');
      if (theirs.length) {
        const uid = await enemy.controller.chooseOwnCharacter(enemy, theirs, `${card.name}: เลือก character ของคุณให้วางนอน`);
        const t = theirs.find(x => x.uid === uid) || theirs[0];
        t.rested = true;
        log(`${card.name}: ${enemy.name} วางนอน ${t.card.name}`);
      }
    },
  };

  // 034 FrostNova — retires itself at the end of this Main Phase.
  reg['UA30BT-ARK-1-034'] = {
    async onPlay(G, p, unit) {
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: จะ retire เมื่อจบ Main Phase`);
    },
  };

  // 035 Franka — [Main][1/turn] +1500 BP; retires at the end of the turn.
  reg['UA30BT-ARK-1-035'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.bpMod += 1500;
      unit.retireAtEndOfTurn = true;
      log(`${unit.card.name}: +1500 BP เทิร์นนี้ (จะ retire ตอนจบเทิร์น)`);
    },
  };

  // 036 Liskarm — [On Block] buff an own character +500.
  reg['UA30BT-ARK-1-036'] = {
    async onBlock(G, p, unit, atkUnit) { await H.buffOwnCharacter(p, 500); },
  };

  // 040 Amiya — [Main][Discard 1][1/turn] grant an Energy-Line character "will not be retired" this turn.
  reg['UA30BT-ARK-1-040'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const targets = p.energy.filter(u => u.card.type === 'Character');
      if (!targets.length) { p.controller.notify?.('ไม่มี character บน Energy Line'); return; }
      unit._usedTurn = Engine.G.turn;
      await H.discardFromHand(p);
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character ที่จะไม่ถูก retire เทิร์นนี้');
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noRetire = true; log(`${unit.card.name}: ${t.card.name} จะไม่ถูก retire เทิร์นนี้`); }
    },
  };

  // 044 Greythroat — debuff any enemy character (BP>=1500) -1000.
  reg['UA30BT-ARK-1-044'] = {
    async onPlay(G, p, unit) { await debuffEnemyAny(p, -1000, 1500); },
  };

  // 047 Kal'tsit — [On Play, Energy Line] look 7 fetch a BP4500 character; then free-play a blue
  // BP4500 AP1 character from hand rested.
  reg['UA30BT-ARK-1-047'] = {
    async onPlay(G, p, unit) {
      if (!p.energy.includes(unit)) return;
      await H.lookTopAndTake(p, 7, c => c.type === 'Character' && c.bp === 4500, 1, `${unit.card.name}: ดูการ์ดบนสุด 7 ใบ`);
      const idx = p.hand.findIndex(no => {
        const c = byNo(no);
        return c && c.type === 'Character' && c.color === 'Blue' && c.bp === 4500 && (c.ap || 0) === 1;
      });
      if (idx < 0) return;
      const v = await p.controller.chooseOption(p, `${unit.card.name}: ลง ${byNo(p.hand[idx]).name} (rested)?`,
        [{ label: 'ลงสนาม', value: true }, { label: 'ข้าม', value: false }]);
      if (v) await Engine.playCardFromZone(p, p.hand[idx], 'hand', { line: 'energy', active: false });
    },
  };

  // 050 Dobermann — aura: while on your Front Line, your other need-3 characters get +1000 BP.
  reg['UA30BT-ARK-1-050'] = {
    auraBp(owner, src, tgt) {
      if (!owner.front.includes(src)) return 0;
      if (tgt === src || (tgt.card.name || '').includes('Dobermann')) return 0;
      return (tgt.card.need || 0) === 3 && tgt.card.type === 'Character' ? 1000 : 0;
    },
  };

  // 052 Doctor — [Main][Rest][Discard 1][1/turn] look 5, free-play a blue non-Doctor character
  // (need<=3, AP1) rested; self-retires at end of Main. (Front-Line restriction not enforced.)
  reg['UA30BT-ARK-1-052'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await H.discardFromHand(p);
      const n = Math.min(5, p.deck.length);
      const revealed = p.deck.splice(0, n);
      const pred = c => c.type === 'Character' && c.color === 'Blue' && !(c.name || '').includes('Doctor') && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const picked = await p.controller.chooseRevealPick(p, revealed, `${unit.card.name}: เลือก character Blue (Energy≤3) ลงสนาม (rested)`, pred, 1);
      if (picked.length) {
        const no = revealed.splice(picked[0], 1)[0];
        p.sideline.push(no); // stage through sideline so playCardFromZone can move it
        await Engine.playCardFromZone(p, no, 'sideline', { line: 'energy', active: false });
      }
      p.deck.push(...revealed);
      unit.retireAtEndOfMain = true;
      log(`${unit.card.name}: จะ retire เมื่อจบ Main Phase`);
    },
  };

  // 055 Red — -2500 BP on the opponent's turn. (Bounce-discount clause not automated.)
  reg['UA30BT-ARK-1-055'] = {
    bpBonus(p, unit) {
      const myTurn = Engine.G.players[Engine.G.active] === p;
      return myTurn ? 0 : -2500;
    },
  };

  // 058 Blaze — grant an Energy-Line character "will not be retired" this turn.
  reg['UA30BT-ARK-1-058'] = {
    async onPlay(G, p, unit) {
      const targets = p.energy.filter(u => u.card.type === 'Character');
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${unit.card.name}: เลือก character ที่จะไม่ถูก retire เทิร์นนี้`, true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.noRetire = true; log(`${unit.card.name}: ${t.card.name} จะไม่ถูก retire เทิร์นนี้`); }
    },
  };

  // 060 Rosmontis — -1000 BP while on the Front Line; [On Play] mass-debuff enemy front (BP>=1500)
  // -500 (or -1000 with a BP4000+ on own Energy Line); [Main][1/turn] self-bounce another need<=3
  // character to re-run the debuff.
  reg['UA30BT-ARK-1-060'] = {
    bpBonus(p, unit) { return p.front.includes(unit) ? -1000 : 0; },
    async onPlay(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const big = p.energy.some(u => u.card.type === 'Character' && Engine.bp(u) >= 4000);
      const delta = big ? -1000 : -500;
      let n = 0;
      for (const u of enemy.front) if (u.card.type === 'Character' && Engine.bp(u) >= 1500) { u.bpMod += delta; n++; }
      if (n) { log(`${unit.card.name}: ศัตรู (BP≥1500) ${n} ใบ ${delta} BP เทิร์นนี้`); await Engine.checkBpZero(); }
    },
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      const targets = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character' && (u.card.need || 0) <= 3);
      if (!targets.length) { p.controller.notify?.('ไม่มี character (Energy≤3) ให้คืนมือ'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character (Energy≤3) คืนมือ');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      unit._usedTurn = Engine.G.turn;
      await Engine.returnUnitToHand(p, t);
      log(`${unit.card.name}: ${t.card.name} กลับมือ`);
      await reg['UA30BT-ARK-1-060'].onPlay(G, p, unit);
    },
  };

  // 063 Command: Meltdown — retire enemy BP<=4000, or self-bounce (need<=3) to free-play a blue
  // BP4500 AP1 character active with +1000 BP and [Sniper] this turn.
  reg['UA30BT-ARK-1-063'] = {
    async onEvent(G, p, card) {
      const bouncable = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.need || 0) <= 3);
      const playIdx = p.hand.findIndex(no => {
        const c = byNo(no);
        return c && c.type === 'Character' && c.color === 'Blue' && c.bp === 4500 && (c.ap || 0) === 1;
      });
      const opts = [{ label: 'Retire ศัตรู BP≤4000', value: 'retire' }];
      if (bouncable.length && playIdx >= 0) opts.push({ label: 'คืนมือ 1 ใบ → ลง character Blue BP4500 (Active, +1000, Sniper)', value: 'swap' });
      const v = await p.controller.chooseOption(p, `${card.name}: เลือก effect`, opts);
      if (v === 'swap') {
        const uid = await p.controller.chooseOwnCharacter(p, bouncable, 'เลือก character (Energy≤3) คืนมือ');
        const t = bouncable.find(x => x.uid === uid);
        if (!t) return;
        await Engine.returnUnitToHand(p, t);
        const played = await Engine.playCardFromZone(p, p.hand[playIdx], 'hand', { line: 'energy', active: true });
        if (played) {
          played.bpMod += 1000;
          played.tempSnipe = true;
          log(`${card.name}: ${played.card.name} ลงสนาม Active +1000 BP และ [Sniper] เทิร์นนี้`);
        }
      } else {
        await H.retireEnemyFront(p, 4000);
      }
    },
  };

  // 065 Unknown Technology — self-bounce a need<=3 character -> draw 3.
  reg['UA30BT-ARK-1-065'] = {
    async onEvent(G, p, card) {
      const targets = [...p.front, ...p.energy].filter(u => u.card.type === 'Character' && (u.card.need || 0) <= 3);
      if (!targets.length) return;
      const uid = await p.controller.chooseOwnCharacter(p, targets, `${card.name}: เลือก character (Energy≤3) คืนมือ เพื่อจั่ว 3 ใบ`, true);
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.returnUnitToHand(p, t);
      Engine.draw(p, 3);
      log(`${card.name}: ${t.card.name} กลับมือ — จั่ว 3 ใบ`);
    },
  };

  // 066 Hold My Hand!! — play a blue character (need<=3, AP1) from Outside Area to Energy Line
  // rested; a Doctor arrives active instead.
  reg['UA30BT-ARK-1-066'] = {
    async onEvent(G, p, card) {
      const pred = c => c && c.type === 'Character' && c.color === 'Blue' && (c.need || 0) <= 3 && (c.ap || 0) === 1;
      const idx = await p.controller.chooseCardFromSideline(p, `${card.name}: เลือก character Blue (Energy≤3) จาก Outside Area`, pred);
      if (idx == null) return;
      const isDoctor = (byNo(p.sideline[idx])?.name || '').includes('Doctor');
      await Engine.playCardFromZone(p, p.sideline[idx], 'sideline', { line: 'energy', active: isDoctor });
    },
  };

  // 067 Jessica — [Main][Rest][1/turn] buff another original-BP-2500 character +1500.
  reg['UA30BT-ARK-1-067'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = true;
      await buffOwnWhere(p, u => u !== unit && u.card.bp === 2500, 1500, 'เลือก character (BP ตั้งต้น 2500) รับ +1500 BP');
    },
  };

  // 069 Liskarm — [On Block] if an original-BP-2500 character is on your Front Line, buff own +500.
  reg['UA30BT-ARK-1-069'] = {
    async onBlock(G, p, unit, atkUnit) {
      if (!p.front.some(u => u.card.bp === 2500)) return;
      await H.buffOwnCharacter(p, 500);
    },
  };

  // 070 Exusiai — buff an original-BP-2500 character +1500.
  reg['UA30BT-ARK-1-070'] = {
    async onPlay(G, p, unit) {
      await buffOwnWhere(p, u => u.card.bp === 2500, 1500, `${unit.card.name}: เลือก character (BP ตั้งต้น 2500) รับ +1500 BP`);
    },
  };

  // 071 Exusiai — [Main][1/turn] self-stand at the cost of -2000 BP this turn.
  reg['UA30BT-ARK-1-071'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      unit.rested = false;
      unit.bpMod -= 2000;
      log(`${unit.card.name}: เป็น Active (-2000 BP เทิร์นนี้)`);
      await Engine.checkBpZero();
    },
  };

  // 095 Lungmen (Field) — [Main][Rest][Retire] grant a Lungmen-trait character [Impact +1] this turn.
  reg['UA30BT-ARK-1-095'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('ต้องอยู่ในสถานะ Active'); return; }
      const targets = [...p.front, ...p.energy].filter(u => (u.card.traits || '').includes('Lungmen'));
      if (!targets.length) { p.controller.notify?.('ไม่มี character Trait: Lungmen'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, targets, 'เลือก character Trait: Lungmen รับ [Impact +1] เทิร์นนี้');
      const t = targets.find(x => x.uid === uid);
      if (!t) return;
      await Engine.sidelineUnit(p, unit, 'effect');
      t.tempImpact += 1;
      log(`${unit.card.name}: ${t.card.name} ได้ [Impact +1] เทิร์นนี้`);
    },
  };

  // 098 Penguin Logistics — look top 7, fetch up to 1 Penguin Logistics character AND up to 1 BP2500 character.
  reg['UA30BT-ARK-1-098'] = {
    async onEvent(G, p, card) {
      const n = Math.min(7, p.deck.length);
      if (!n) return;
      const revealed = p.deck.splice(0, n);
      const p1 = await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือก character Trait: Penguin Logistics (สูงสุด 1)`,
        c => c.type === 'Character' && (c.traits || '').includes('Penguin Logistics'), 1);
      p1.sort((a, b) => b - a).forEach(i => { p.hand.push(revealed.splice(i, 1)[0]); });
      const p2 = await p.controller.chooseRevealPick(p, revealed, `${card.name}: เลือก character BP2500 (สูงสุด 1)`,
        c => c.type === 'Character' && c.bp === 2500, 1);
      p2.sort((a, b) => b - a).forEach(i => { p.hand.push(revealed.splice(i, 1)[0]); });
      log(`${card.name}: เข้ามือ ${p1.length + p2.length} ใบ`);
      p.deck.push(...revealed);
    },
  };

  // 109 Get Started — up to 3 effects: buff +2000; draw if BP4000+ on front; draw if BP4000+ on energy.
  reg['UA30ST-ARK-1-109'] = {
    async onEvent(G, p, card) {
      await H.buffOwnCharacter(p, 2000);
      if (p.front.some(u => u.card.type === 'Character' && Engine.bp(u) >= 4000)) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ (Front Line มี BP≥4000)`); }
      if (p.energy.some(u => u.card.type === 'Character' && Engine.bp(u) >= 4000)) { Engine.draw(p, 1); log(`${card.name}: จั่ว 1 ใบ (Energy Line มี BP≥4000)`); }
    },
  };

  // 111 FrostNova — [When Attacking] look N (= rested enemy characters) fetch Yeti Squadron;
  // [Main][Front][Discard 1] rest an enemy ENERGY-Line character.
  reg['UA30ST-ARK-1-111'] = {
    async onAttack(G, p, unit) {
      const enemy = Engine.opponentOf(p);
      const n = [...enemy.front, ...enemy.energy].filter(u => u.rested && u.card.type === 'Character').length;
      if (!n) return;
      await H.lookTopAndTake(p, n, c => (c.traits || '').includes('Yeti Squadron'), 1, `${unit.card.name}: ดูการ์ดบนสุด ${n} ใบ`);
    },
    async onMain(G, p, unit) {
      if (!p.front.includes(unit)) { p.controller.notify?.('ต้องอยู่บน Front Line'); return; }
      if (!p.hand.length) { p.controller.notify?.('ไม่มีการ์ดให้ทิ้ง'); return; }
      const enemy = Engine.opponentOf(p);
      const targets = enemy.energy.filter(u => u.card.type === 'Character' && !u.rested && !u.kw.untargetable);
      if (!targets.length) { p.controller.notify?.('ไม่มีเป้าหมายบน Energy Line ศัตรู'); return; }
      await H.discardFromHand(p);
      const uid = await p.controller.chooseEnemyCharacter(p, targets, 'เลือก character ศัตรูบน Energy Line ให้วางนอน', true);
      const t = targets.find(x => x.uid === uid);
      if (t) { t.rested = true; log(`${unit.card.name}: ${t.card.name} ถูกวางนอน`); }
    },
  };

  // 112 Exusiai — [Main][1/turn] move itself to the other line.
  reg['UA30ST-ARK-1-112'] = {
    async onMain(G, p, unit) {
      if (unit._usedTurn === Engine.G.turn) { p.controller.notify?.('ใช้ไปแล้วเทิร์นนี้'); return; }
      unit._usedTurn = Engine.G.turn;
      await Engine.moveUnitFree(p, unit, p.front.includes(unit) ? 'energy' : 'front');
    },
  };

  // ────────────────────────────────────────────────────────────────────────
  // Covered by generic patterns after this round's normalizeFx fixes (no script needed):
  //  • 2-016 Kal'tsit (look-top place-to-Outside, remainder on top), 2-049 Amiya ("add it into
  //    your hand"), 2-067 Swire ([On Retire] buff other), UAPR-ARK-P-002 (AP untap, leading-digit
  //    artifact), plus every "Look at top N" old-style wording.
  // Skipped (needs engine mechanisms that don't exist yet / too risky):
  //  • 2-043 Patriot — "your BP<=1000 characters are immune to BP reduction" (no debuff-interception layer)
  //  • 2-062 Mostima — grants enemy blockers "move to Energy Line on block-win" (no per-grant block-win hook)
  //  • 2-072 / 1-094 Lin — "teammates cannot be chosen by opponent's events/characters" aura (no
  //    field-wide targeting-protection layer; kw.untargetable is per-card-self only)
  //  • 1-011 W — "attacks and is NOT blocked -> draw to 2" (no post-block-declaration hook)
  //  • 1-106 Ace — substitute-retire replacement (same class as HTR White Goreinu)
  // ────────────────────────────────────────────────────────────────────────
})();
