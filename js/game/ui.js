// ══════════ UA SIM — Game board UI (3D tilted playmat) + human controller ══════════
const GameUI = (() => {
  const root = () => document.getElementById('game-root');
  let pendingResolve = null;      // resolver for current human decision
  let pendingKind = null;
  let movesBuffer = [];

  // ---------- decision plumbing ----------
  function waitFor(kind) {
    return new Promise(res => { pendingResolve = res; pendingKind = kind; render(); });
  }
  function resolve(v) {
    if (!pendingResolve) return;
    const r = pendingResolve;
    pendingResolve = null; pendingKind = null;
    r(v);
  }

  // ---------- human controller (Engine interface) ----------
  const humanController = {
    isBot: false,
    async chooseMulligan(p) {
      return await modalChoice('มือเริ่มต้นของคุณ', renderHandPreview(p, true),
        [{ label: '✔ เก็บมือนี้', value: false }, { label: '🔄 Mulligan (จั่วใหม่)', value: true }],
        { wide: true });
    },
    async chooseExtraDraw(p) {
      if (Engine.activeAP(p) < 1) return false;
      return await waitFor('extradraw'); // click deck = draw, big button = skip
    },
    async chooseMovements(p) {
      movesBuffer = [];
      movedUpThisPhase = new Set();
      await waitFor('movement');
      movedUpThisPhase = new Set();
      return movesBuffer;
    },
    async chooseMainAction(p) { return await waitFor('main'); },
    async chooseRaidMove(p, unit) {
      return await modalConfirm('Raid สำเร็จ', `<p>ย้าย ${UAData.escapeHtml(unit.card.name)} ขึ้น Front Line เลยไหม?</p>`,
        '⬆ ย้ายขึ้น Front', 'อยู่ Energy Line ต่อ');
    },
    async chooseAttacker(p, enemy) { return await waitFor('attack'); },
    async chooseBlocker(p, atkUnit, candidates) {
      const btns = candidates.map(u =>
        ({ label: `${u.card.name} · BP ${Engine.bp(u)}`, value: u.uid, card: u.card }));
      btns.push({ label: '✘ ไม่บล็อก (รับ damage)', value: null });
      return await modalChoice(`${UAData.escapeHtml(atkUnit.card.name)} (BP ${Engine.bp(atkUnit)}) กำลังโจมตีคุณ!`,
        cardThumb(atkUnit.card), btns);
    },
    async chooseLifeCards(p, defender, n) {
      const btns = defender.life.map((_, i) => ({ label: `🂠 Life ใบที่ ${i + 1}`, value: i }));
      const picked = [];
      while (picked.length < n) {
        const v = await modalChoice(`เลือก Life ของ ${defender.name} (${picked.length + 1}/${n})`, '',
          btns.filter(b => !picked.includes(b.value)));
        picked.push(v);
      }
      return picked;
    },
    async orderTriggers(p, revealed) { return revealed; },
    async chooseUseTrigger(p, c) {
      if (!c.trigger) return false;
      return await modalConfirm(`Trigger [${c.trigger}] — ${UAData.escapeHtml(c.name)}`,
        cardThumb(c) + `<p class="tg">${UAData.fxText(c.triggerText || '')}</p>`,
        '⚡ ใช้ Trigger', 'ไม่ใช้');
    },
    async chooseOwnCharacter(p, units, prompt, allowSkip = false) {
      const btns = units.map(u =>
        ({ label: `${u.card.name} · BP ${Engine.bp(u)}${u.rested ? ' · นอน' : ''}`, value: u.uid, card: u.card }));
      if (allowSkip) btns.push({ label: 'ข้าม (ไม่เลือก)', value: null });
      return await modalChoice(prompt, '', btns);
    },
    async chooseEnemyCharacter(p, units, prompt, allowSkip = false) {
      const btns = units.map(u => ({ label: `${u.card.name} · BP ${Engine.bp(u)}`, value: u.uid, card: u.card }));
      if (allowSkip) btns.push({ label: 'ข้าม (ไม่เลือก)', value: null });
      return await modalChoice(prompt, '', btns);
    },
    async chooseRaidFromTrigger(p, c, targets) {
      const btns = targets.map(u => ({ label: `Raid ทับ ${u.card.name}`, value: u.uid, card: u.card }));
      btns.push({ label: '✋ เก็บเข้ามือแทน', value: null });
      return await modalChoice(`Trigger [Raid] — ${UAData.escapeHtml(c.name)}`, cardThumb(c), btns);
    },
    async chooseDiscard(p) {
      const btns = p.hand.map((no, i) =>
        ({ label: UAData.byNo.get(no)?.name || no, value: i, card: UAData.byNo.get(no) }));
      return await modalChoice('มือเกิน 8 ใบ — เลือกทิ้ง (ไป Removal)', '', btns);
    },
    async chooseOption(p, title, options, bodyHtml = '') {
      return await modalChoice(title, bodyHtml, options);
    },
    async chooseCardFromHand(p, title) {
      if (!p.hand.length) return null;
      const btns = p.hand.map((no, i) => {
        const c = UAData.byNo.get(no);
        return { label: `${c?.name || no} · E${c?.need ?? '-'}`, value: i, card: c };
      });
      return await modalChoice(title, '', btns);
    },
    // pick `n` distinct cards from hand (cost payment, e.g. [Discard 2]) — one at a time
    async chooseCardsFromHand(p, n, title) {
      const picked = [];
      const remaining = p.hand.map((no, i) => i);
      for (let k = 0; k < n && remaining.length; k++) {
        const btns = remaining.map(i => {
          const c = UAData.byNo.get(p.hand[i]);
          return { label: `${c?.name || p.hand[i]} · E${c?.need ?? '-'}`, value: i, card: c };
        });
        const i = await modalChoice(`${title} (${k + 1}/${n})`, '', btns);
        if (i == null) break;
        picked.push(i);
        remaining.splice(remaining.indexOf(i), 1);
      }
      return picked;
    },
    // pick 1 card from the (permanent) Removal Area matching a predicate, or null to skip
    async chooseCardFromRemoval(p, title, predicate) {
      const idxs = p.removal.map((no, i) => i).filter(i => !predicate || predicate(UAData.byNo.get(p.removal[i])));
      if (!idxs.length) return null;
      const btns = idxs.map(i => {
        const c = UAData.byNo.get(p.removal[i]);
        return { label: c?.name || p.removal[i], value: i, card: c };
      });
      btns.push({ label: 'ไม่เลือก', value: null });
      return await modalChoice(title, '', btns);
    },
    // pick 1 card from the Sideline (a.k.a. "Outside Area" in card text) matching a predicate
    async chooseCardFromSideline(p, title, predicate) {
      const idxs = p.sideline.map((no, i) => i).filter(i => !predicate || predicate(UAData.byNo.get(p.sideline[i])));
      if (!idxs.length) return null;
      const btns = idxs.map(i => {
        const c = UAData.byNo.get(p.sideline[i]);
        return { label: c?.name || p.sideline[i], value: i, card: c };
      });
      btns.push({ label: 'ไม่เลือก', value: null });
      return await modalChoice(title, '', btns);
    },
    // look-at-top-N flow: choose up to maxPick matching cards to add to hand;
    // the rest return to the bottom of the deck in their original relative order.
    async chooseRevealPick(p, revealedNos, title, predicate, maxPick) {
      const cards = revealedNos.map(no => UAData.byNo.get(no));
      const eligible = revealedNos.map((no, i) => i).filter(i => !predicate || predicate(cards[i]));
      // the pickable cards already show as tiles, so only preview the reveal when some of it is
      // NOT pickable — otherwise every card would appear twice
      const body = eligible.length === cards.length ? ''
        : `<div class="hand-preview">${cards.map(c => UAData.imgTag(c)).join('')}</div>`;
      if (!eligible.length) { await modalChoice(title, body, [{ label: 'ไม่มีใบที่ตรงเงื่อนไข — วางคืน', value: null }]); return []; }
      const picked = [];
      for (let k = 0; k < maxPick; k++) {
        const remaining = eligible.filter(i => !picked.includes(i));
        if (!remaining.length) break;
        const btns = remaining.map(i => ({ label: cards[i].name, value: i, card: cards[i] }));
        btns.push({ label: picked.length ? 'จบการเลือก' : 'ไม่เลือกใบไหนเลย', value: null });
        const i = await modalChoice(`${title} (เลือกได้สูงสุด ${maxPick})`, body, btns);
        if (i == null) break;
        picked.push(i);
      }
      return picked;
    },
    async manualTrigger(p, c) {
      await modalConfirm(`Trigger [Color] — ${UAData.escapeHtml(c.name)}`,
        cardThumb(c) + `<p class="tg">${UAData.fxText(c.triggerText || '')}</p>
        <p style="color:#a00">การ์ดใบนี้ยังไม่รองรับอัตโนมัติ — ใช้เมนูการ์ดปรับสนามเอง</p>`,
        'รับทราบ', null);
    },
    notify(msg) { DeckBuilder.toast(msg); },
  };

  // ---------- small html helpers ----------
  function cardThumb(c) {
    return `<div style="text-align:center">${UAData.imgTag(c, 'thumb')}</div>`;
  }
  function renderHandPreview(p, onerow = false) {
    return `<div class="hand-preview ${onerow ? 'onerow' : ''}">` + p.hand.map(no =>
      UAData.imgTag(UAData.byNo.get(no))).join('') + `</div>`;
  }

  // ── phase banner (Yu-Gi-Oh style) ──
  let lastBannerKey = '';
  const BANNER_NAMES = { Start: 'DRAW PHASE', Movement: 'MOVE PHASE', Main: 'MAIN PHASE', Attack: 'ATTACK PHASE', End: 'END PHASE' };
  function maybeShowPhaseBanner() {
    const G = Engine.G;
    if (!G.players.length || G.over || !G.phase) return;
    const active = G.players[G.active];
    const key = `${G.active}|${G.phase}|${active.turnCount}`;
    if (key === lastBannerKey) return;
    lastBannerKey = key;
    const name = BANNER_NAMES[G.phase];
    if (!name) return;
    showPhaseBanner(name, active.isBot ? `เทิร์นของ ${active.name}` : 'เทิร์นของคุณ');
  }
  // Every engine log line is a finished, human-readable sentence, so the feed just surfaces them
  // as they happen. Without this the player has no way to tell an effect fired at all — the log
  // panel is opt-in and used to be the only place these ever appeared.
  const TOAST_MAX = 4;         // keep the stack short; a bot turn can emit a burst
  const TOAST_MS = 2600;
  // board-changing effects, as opposed to routine bookkeeping like drawing for turn
  const TOAST_HOT = /\[Impact|\[Sniper|\[Damage|\[Double|Trigger|BP|retire|Retire|บล็อก|ถูกวางนอน|กลับมือ|ตั้งขึ้น|Remove Area/;
  function showEventToast(msg) {
    if (!msg) return;
    let box = document.getElementById('gb-toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'gb-toasts';
      box.className = 'gb-toasts';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'gb-toast' + (TOAST_HOT.test(msg) ? ' hot' : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > TOAST_MAX) box.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, TOAST_MS);
  }

  function showPhaseBanner(text, sub) {
    document.querySelectorAll('.phase-banner').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'phase-banner';
    el.innerHTML = `<div class="pb-strip"><span class="pb-text">${text}</span><div class="pb-sub">${sub || ''}</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 950);
    setTimeout(() => el.remove(), 1350);
  }

  // Status badges. These show the EFFECTIVE state, so they include keywords granted for the turn
  // and ones whose printed condition is currently met — that is the whole point for the player:
  // if a badge is showing, the engine will act on it this turn.
  function keywordBadges(u, owner) {
    const kw = u.kw || {};
    const live = (kind) => Effects.genericKeywordActive?.(owner, u, kind) || false;
    const out = [];
    const add = (label, granted, title) => out.push(
      `<span class="kwb${granted ? ' granted' : ''}" title="${title}">${label}</span>`);

    const impact = (kw.impact || 0) + (u.tempImpact || 0) + (Effects.genericImpactBonus?.(owner, u) || 0);
    if (impact > 0) add(`⚡${impact}`, !kw.impact, `Impact ${impact} — ทะลุเข้า Life เมื่อชนะ battle`);

    const dmg = (u.tempDmg || kw.dmg || 1) + (Effects.genericDmgBonus?.(owner, u) || 0);
    if (dmg > 1) add(`✖${dmg}`, !(kw.dmg > 1), `Damage ${dmg} — โจมตีไม่ถูกบล็อกเสีย Life ${dmg}`);

    if (kw.snipe || u.tempSnipe || live('snipe')) add('🎯', !kw.snipe, 'Sniper — เลือกโจมตี character ศัตรูได้โดยตรง');
    if (kw.doubleAttack || u.tempDoubleAttack || live('doubleAttack')) add('⚔²', !kw.doubleAttack, 'Double Attack — โจมตีได้ 2 ครั้ง');
    if (kw.doubleBlock || live('doubleBlock')) add('🛡²', !kw.doubleBlock, 'Double Block — บล็อกได้ 2 ครั้ง');
    if (kw.nullifyImpact || live('nullifyImpact')) add('Ø', !kw.nullifyImpact, 'Impact Negate — กัน Impact ของศัตรู');
    if (kw.step) add('↷', false, 'Step — ย้ายขึ้น Front Line ได้อิสระ');

    if (kw.unblockableBP != null || kw.unblockableBPMin != null || u.tempUnblockableBP != null ||
        u.tempUnblockableBPMin != null || u.tempUnblockableNeedMin != null)
      add('⇢', !(kw.unblockableBP != null || kw.unblockableBPMin != null), 'บล็อกได้ยาก — จำกัดว่าใครบล็อกได้');
    if (kw.untargetable || u.tempUntargetable) add('🔒', !kw.untargetable, 'ไม่ถูกเลือกเป็นเป้าหมายโดยเอฟเฟกต์ศัตรู');
    if (kw.mustBeBlocked || u.tempMustBeBlocked) add('❗', !kw.mustBeBlocked, 'ศัตรูต้องบล็อกการโจมตีนี้');
    if (kw.mustBlock || u.tempMustBlock) add('🛑', !kw.mustBlock, 'character นี้ต้องบล็อก');
    if (kw.cannotAttack || u.tempCannotAttack) add('🚫⚔', !kw.cannotAttack, 'โจมตีไม่ได้');
    if (kw.cannotBlock || u.tempCannotBlock) add('🚫🛡', !kw.cannotBlock, 'บล็อกไม่ได้');
    if (u.skipNextStand) add('💤', true, 'ครั้งถัดไปจะไม่ลุกขึ้น');

    return out.length ? `<div class="kwbadges">${out.join('')}</div>` : '';
  }

  function unitHtml(u, mine, owner) {
    return `<div class="unit ${u.rested ? 'rested' : ''} ${mine ? 'mine' : 'foe'}"
        draggable="${mine}" data-uid="${u.uid}" data-no="${u.no}" data-mine="${mine ? 1 : 0}">
      ${UAData.imgTag(u.card)}
      ${keywordBadges(u, owner)}
      <div class="unit-bp">${u.card.bp != null ? Engine.bp(u) : ''}${(u.bpMod || u.bpPersist) ? `<span class="bpmod">${(u.bpMod + u.bpPersist) > 0 ? '+' : ''}${u.bpMod + u.bpPersist}</span>` : ''}${u.under.length ? `<span class="raidn">⚡${u.under.length}</span>` : ''}${u.counters.length ? `<span class="raidn">●${u.counters.length}</span>` : ''}</div>
    </div>`;
  }

  // 4 card-size slots per line
  function lineHtml(p, mine, lineName) {
    const units = lineName === 'front' ? p.front : p.energy;
    let slots = '';
    for (let i = 0; i < 4; i++) {
      slots += `<div class="cardslot">${units[i] ? unitHtml(units[i], mine, p) : ''}</div>`;
    }
    return `<div class="line-zone ${lineName}" data-owner="${mine ? 'me' : 'foe'}" data-line="${lineName}">
      <span class="zone-tag">${lineName === 'front' ? 'FRONT LINE' : 'ENERGY LINE'}</span>${slots}</div>`;
  }

  function deckSlot(p, mine) {
    const canExtra = mine && pendingKind === 'extradraw';
    return `<div class="stack-wrap ${canExtra ? 'pulse' : ''}">
      <div class="cardslot deck-zone ${canExtra ? 'clickable' : ''}" data-owner="${mine ? 'me' : 'foe'}" data-zone="deck">
        <div class="card-back big">${p.deck.length}</div>
      </div><span class="stack-label">Deck</span></div>`;
  }
  function pileSlot(p, mine, zone, label) {
    const arr = p[zone];
    const top = arr.length ? UAData.byNo.get(arr[arr.length - 1]) : null;
    return `<div class="stack-wrap">
      <div class="cardslot pile-zone clickable" data-owner="${mine ? 'me' : 'foe'}" data-zone="${zone}">
        ${top ? UAData.imgTag(top) : ''}<div class="pile-count">${arr.length}</div>
      </div><span class="stack-label">${label}</span></div>`;
  }

  function matHtml(p, mine) {
    const rows = mine
      ? lineHtml(p, true, 'front') + lineHtml(p, true, 'energy')
      : lineHtml(p, false, 'energy') + lineHtml(p, false, 'front');
    const left = mine
      ? `<div class="mat-side">${pileSlot(p, true, 'removal', 'Removal')}</div>`
      : `<div class="mat-side">${pileSlot(p, false, 'sideline', 'Sideline')}${deckSlot(p, false)}</div>`;
    const right = mine
      ? `<div class="mat-side">${deckSlot(p, true)}${pileSlot(p, true, 'sideline', 'Sideline')}</div>`
      : `<div class="mat-side">${pileSlot(p, false, 'removal', 'Removal')}</div>`;
    return `<div class="mat ${mine ? 'me' : 'foe'}">${left}<div class="mat-center">${rows}</div>${right}</div>`;
  }

  // AP row (small, bottom-left of player zone / overlay for foe)
  function apHtml(p, cls) {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const exists = i < p.apTotal;
      const rested = exists && i >= p.apTotal - p.apRested;
      s += `<div class="ap-card ${exists ? '' : 'empty'} ${rested ? 'rested' : ''}">AP</div>`;
    }
    return `<div class="ap-row ${cls || ''}">${s}</div>`;
  }

  // big round action button label per state
  function actionLabel() {
    switch (pendingKind) {
      case 'extradraw': return 'Skip<br>Extra Draw';
      case 'movement': return 'Begin<br>Main Phase';
      case 'main': return 'Begin<br>Attack Phase';
      case 'attack': return 'End<br>Turn';
      default: return '';
    }
  }
  function hintText() {
    const map = {
      extradraw: '🃏 คลิกที่ Deck ของคุณเพื่อจั่วเพิ่ม 1 ใบ (1 AP) หรือกดปุ่มแดงเพื่อข้าม',
      movement: '🚶 คลิก/ลากการ์ดของคุณเพื่อสลับ Front ⇄ Energy ได้อิสระกี่รอบก็ได้ พอใจแล้วกดปุ่มแดง',
      main: '🎴 ลากการ์ดจากมือไปวางบน line (หรือคลิกเลือก) เสร็จแล้วกดปุ่มแดง',
      attack: '⚔️ คลิก character ที่ตั้งอยู่บน Front Line เพื่อโจมตี เสร็จแล้วกดปุ่มแดง',
    };
    return map[pendingKind] || '';
  }

  const PHASES = [['Main', 'Main Phase'], ['Attack', 'Attack Phase'], ['End', 'End Phase']];

  // ---------- main render ----------
  // ══════════ portrait (phone) board ══════════
  // A phone held upright gets a purpose-built vertical layout rather than a squeezed copy of the
  // desktop mat: both players' lines stack down the middle, the phase button sits between them,
  // and the hand runs along the bottom. Same engine, same controller — only the view differs.
  const isPortrait = () => window.innerHeight > window.innerWidth;

  function ptSlotHtml(u, mine, owner) {
    if (!u) return '<div class="pt-slot"></div>';
    const bp = u.card.bp != null ? Engine.bp(u) : '';
    const mod = (u.bpMod || u.bpPersist) ? `<span class="bpmod">${(u.bpMod + u.bpPersist) > 0 ? '+' : ''}${u.bpMod + u.bpPersist}</span>` : '';
    return `<div class="pt-slot filled">
      <div class="pt-unit ${u.rested ? 'rested' : ''} ${mine ? 'mine' : 'foe'}"
           data-uid="${u.uid}" data-no="${u.no}" data-mine="${mine ? 1 : 0}">
        ${UAData.imgTag(u.card)}
        ${keywordBadges(u, owner)}
        ${bp !== '' ? `<div class="pt-bp">${bp}${mod}</div>` : ''}
      </div></div>`;
  }

  function ptLineHtml(p, mine, line, owner) {
    const arr = line === 'front' ? p.front : p.energy;
    let s = '';
    for (let i = 0; i < 4; i++) s += ptSlotHtml(arr[i], mine, owner);
    return `<div class="pt-line ${line} ${mine ? 'me' : 'foe'}" data-owner="${mine ? 'me' : 'foe'}" data-line="${line}">
      <span class="pt-line-tag">${line === 'front' ? 'FRONT' : 'ENERGY'}</span>${s}</div>`;
  }

  function ptPile(p, mine, zone, label) {
    return `<button class="pt-pile" data-owner="${mine ? 'me' : 'foe'}" data-zone="${zone}">
      <span class="pt-pile-n">${p[zone].length}</span><span class="pt-pile-l">${label}</span></button>`;
  }

  function ptPhaseLabel(myTurn) {
    if (!myTurn) return { main: 'เทิร์นบอท', sub: Engine.G.phase };
    const map = {
      extradraw: { main: 'ข้ามจั่วเพิ่ม', sub: 'Draw Phase' },
      movement: { main: 'ไป Main Phase', sub: 'Move Phase' },
      main: { main: 'ไป Attack Phase', sub: 'Main Phase' },
      attack: { main: 'จบเทิร์น', sub: 'Attack Phase' },
    };
    return map[pendingKind] || { main: '…', sub: Engine.G.phase };
  }

  function renderPortrait() {
    const G = Engine.G;
    const me = G.players[0], foe = G.players[1];
    const el = root();
    const myTurn = G.players[G.active] === me;
    const ph = ptPhaseLabel(myTurn);
    const maxLife = me.lifeMax || Math.max(me.life.length, 7);

    el.innerHTML = `
      <div class="pt-root">
        <div class="pt-top">
          <div class="pt-life">LIFE <b>${me.life.length}/${maxLife}</b></div>
          <div class="pt-ap">${[0, 1, 2].map(i => {
            const exists = i < me.apTotal;
            const rested = exists && i >= me.apTotal - me.apRested;
            return `<span class="pt-apdot ${exists ? '' : 'empty'} ${rested ? 'rested' : ''}"></span>`;
          }).join('')}<em>AP</em></div>
          <div class="pt-top-right">
            <button class="pt-icon" id="pt-log-btn">📜</button>
            <button class="pt-icon danger" id="pt-quit">ออก</button>
          </div>
        </div>

        <div class="pt-board">
          <div class="pt-rail left">
            <div class="pt-foe-name">🤖 ${UAData.escapeHtml(foe.name)}</div>
            ${ptPile(foe, false, 'removal', 'RM')}
            <div class="pt-spacer"></div>
            ${ptPile(me, true, 'removal', 'RM')}
          </div>

          <div class="pt-rows">
            <!-- Energy sits behind each player and Front faces the middle, matching the desktop mat -->
            ${ptLineHtml(foe, false, 'energy', foe)}
            ${ptLineHtml(foe, false, 'front', foe)}
            <button class="pt-phase ${myTurn && pendingKind ? '' : 'idle'}" id="pt-phase">
              <b>${ph.main}</b><span>${ph.sub}</span></button>
            ${ptLineHtml(me, true, 'front', me)}
            ${ptLineHtml(me, true, 'energy', me)}
          </div>

          <div class="pt-rail right">
            <div class="pt-deck" data-owner="foe">${foe.deck.length}<em>เด็คบอท</em></div>
            ${ptPile(foe, false, 'sideline', 'SL')}
            <div class="pt-spacer"></div>
            ${ptPile(me, true, 'sideline', 'SL')}
            <div class="pt-deck" data-owner="me">${me.deck.length}<em>เด็ค</em></div>
          </div>
        </div>

        <div class="pt-hint">${hintText()}</div>

        <div class="pt-handbar" id="pt-handbar" style="--hand-n:${Math.min(Math.max(me.hand.length, 1), 9)}">
          <div class="pt-grip" id="pt-grip"><span></span></div>
          <div class="pt-hand" id="pt-hand">
            ${me.hand.map((no, i) => {
              const c = UAData.byNo.get(no);
              return `<div class="pt-hcard" data-i="${i}" data-no="${no}">
                ${UAData.imgTag(c)}<div class="pt-hcost">${c.need ?? ''}·${c.ap ?? 0}AP</div></div>`;
            }).join('')}
          </div>
          <button class="pt-draw ${myTurn && pendingKind === 'extradraw' ? 'pulse' : ''}" id="pt-draw">จั่ว</button>
        </div>

        <div id="gb-log" class="gb-log hidden">
          ${G.log.slice(-100).map(l => `<div>${UAData.escapeHtml(l)}</div>`).join('')}
        </div>

        ${G.over ? `<div class="gb-over"><div class="gb-over-box">
            <h2>${G.winner === me ? '🏆 คุณชนะ!' : '💀 คุณแพ้'}</h2>
            <button class="btn primary" onclick="App.show('menu')">กลับเมนู</button>
          </div></div>` : ''}
      </div>`;
    bindPortraitEvents();
  }

  function bindPortraitEvents() {
    const G = Engine.G;
    const me = G.players[0], foe = G.players[1];

    document.getElementById('pt-phase')?.addEventListener('click', () => {
      if (pendingKind === 'main') resolve({ type: 'done' });
      else if (pendingKind === 'attack') resolve(null);
      else if (pendingKind === 'movement') resolve(movesBuffer);
      else if (pendingKind === 'extradraw') resolve(false);
    });
    document.getElementById('pt-draw')?.addEventListener('click', () => {
      if (pendingKind === 'extradraw') resolve(true);
      else DeckBuilder.toast('จั่วเพิ่มได้เฉพาะช่วง Draw Phase');
    });
    document.getElementById('pt-quit')?.addEventListener('click', () => {
      if (confirm('ออกจากเกม?')) { Engine.G.over = true; App.show('menu'); }
    });
    document.getElementById('pt-log-btn')?.addEventListener('click', () => {
      document.getElementById('gb-log').classList.toggle('hidden');
    });
    document.querySelectorAll('.pt-pile').forEach(el => {
      el.addEventListener('click', () => openPileViewer(el.dataset.owner === 'me' ? me : foe, el.dataset.zone));
    });
    document.querySelectorAll('.pt-unit').forEach(el => {
      el.addEventListener('click', () => onUnitClick(parseInt(el.dataset.uid), el.dataset.mine === '1'));
    });

    // Swiping up enlarges the hand in place rather than opening a separate screen, so the very same
    // card elements stay draggable — sliding one down onto a line still plays it.
    const bar = document.getElementById('pt-handbar');
    document.getElementById('pt-grip')?.addEventListener('click', () => bar?.classList.toggle('expanded'));

    let swipeY = null;
    bar?.addEventListener('touchstart', e => { swipeY = e.touches[0].clientY; }, { passive: true });
    bar?.addEventListener('touchmove', e => {
      if (swipeY == null) return;
      const dy = swipeY - e.touches[0].clientY;
      if (dy > 40) { bar.classList.add('expanded'); swipeY = null; }
      else if (dy < -40) { bar.classList.remove('expanded'); swipeY = null; }
    }, { passive: true });
    bar?.addEventListener('touchend', () => { swipeY = null; });

    document.querySelectorAll('.pt-hcard').forEach(el => attachPortraitDrag(el));
  }

  // Drag a hand card onto a line. The gesture starts as soon as the finger moves — no long press —
  // and a tap that never moves opens the card's detail instead.
  function attachPortraitDrag(el) {
    const no = el.dataset.no;
    let ghost = null, startX = 0, startY = 0, dragging = false, pid = null;

    const cleanup = () => {
      ghost?.remove(); ghost = null; dragging = false; pid = null;
      document.querySelectorAll('.pt-line.drop').forEach(z => z.classList.remove('drop'));
    };
    const lineUnder = (x, y) => {
      const hit = document.elementFromPoint(x, y)?.closest('.pt-line[data-owner="me"]');
      return hit ? hit.dataset.line : null;
    };

    el.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      startX = e.clientX; startY = e.clientY; pid = e.pointerId;
      el.setPointerCapture?.(pid);
    });

    el.addEventListener('pointermove', e => {
      if (pid == null) return;
      if (!dragging) {
        const dx = e.clientX - startX, dy = e.clientY - startY;
        // a mostly-sideways swipe is the player scrolling the row, not picking a card up
        if (Math.abs(dy) < 12 || Math.abs(dx) > Math.abs(dy)) return;
        if (pendingKind !== 'main') return;                    // only placeable during Main Phase
        dragging = true;
        // collapse the enlarged hand so the lines underneath become visible drop targets
        document.getElementById('pt-handbar')?.classList.remove('expanded');
        ghost = el.cloneNode(true);
        ghost.className = 'pt-ghost';
        document.body.appendChild(ghost);
      }
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      const line = lineUnder(e.clientX, e.clientY);
      document.querySelectorAll('.pt-line.drop').forEach(z => z.classList.remove('drop'));
      if (line) document.querySelector(`.pt-line[data-owner="me"][data-line="${line}"]`)?.classList.add('drop');
    });

    el.addEventListener('pointerup', async e => {
      if (pid == null) return;
      const wasDragging = dragging;
      const line = wasDragging ? lineUnder(e.clientX, e.clientY) : null;
      cleanup();
      if (!wasDragging) { showCardModal(no); return; }         // a tap inspects the card
      if (line) await playHandCardToLine(no, line);
    });
    el.addEventListener('pointercancel', cleanup);
  }

  function render() {
    const G = Engine.G;
    if (!G.players.length) return;
    const me = G.players[0], foe = G.players[1];
    const el = root();
    if (!el) return;
    const myTurn = G.players[G.active] === me;
    maybeShowPhaseBanner();
    if (isPortrait()) { renderPortrait(); return; }

    el.innerHTML = `
      <div class="gb-top">
        <b>🤖 ${UAData.escapeHtml(foe.name)}</b>
        <span class="gb-turninfo">Turn ${Math.ceil(G.turn / 2)} · <b>${G.phase}</b> · ${myTurn ? '🟢 เทิร์นคุณ' : '🔴 เทิร์นบอท'}</span>
        <span style="margin-left:auto"></span>
        <button class="btn" id="gb-log-btn">📜</button>
        <button class="btn danger" id="gb-quit">ออก</button>
      </div>

      <div class="board3d">
        <div class="field">
          ${matHtml(foe, false)}
          <div class="mid-divider"></div>
          ${matHtml(me, true)}
        </div>

        <!-- flat overlays -->
        <div class="foe-hand-fan">${foe.hand.map((_, i) =>
          `<div class="mini-back" style="--r:${(i - (foe.hand.length - 1) / 2) * 6}deg"></div>`).join('')}</div>
        ${apHtml(foe, 'foe-ap')}
        <div class="life-badge foe-life"><span>LIFE</span><b>${foe.life.length}</b></div>
        <div class="life-badge my-life"><span>LIFE</span><b>${me.life.length}</b></div>

        <div class="phase-rail">
          ${PHASES.map(([k, label]) =>
            `<div class="prail ${myTurn && G.phase === k ? 'on' : ''}">${label}</div>`).join('')}
        </div>
        ${myTurn && pendingKind
          ? `<button class="big-action" id="gb-endphase">${actionLabel()}</button>` : ''}
        <div class="gb-hint">${hintText()}</div>
      </div>

      <div class="gb-bottom">
        ${apHtml(me, 'my-ap')}
        <div class="hand-fan" id="gb-hand">
          ${me.hand.map((no, i) => {
            const n = me.hand.length;
            const r = (i - (n - 1) / 2) * Math.min(5, 40 / Math.max(n, 1));
            const y = Math.abs(i - (n - 1) / 2) * 6;
            const c = UAData.byNo.get(no);
            return `<div class="hcard" draggable="true" data-i="${i}" data-no="${no}"
              style="--r:${r}deg;--y:${y}px;z-index:${i + 1}">
              ${UAData.imgTag(c)}
              <div class="hcost">${c.need ?? ''}·${c.ap ?? 0}AP</div></div>`;
          }).join('')}
        </div>
      </div>

      <div id="gb-log" class="gb-log hidden">
        ${G.log.slice(-100).map(l => `<div>${UAData.escapeHtml(l)}</div>`).join('')}
      </div>

      ${G.over ? `<div class="gb-over"><div class="gb-over-box">
          <h2>${G.winner === me ? '🏆 คุณชนะ!' : '💀 คุณแพ้'}</h2>
          <button class="btn primary" onclick="App.show('menu')">กลับเมนู</button>
        </div></div>` : ''}
    `;
    bindEvents();
  }

  // ---------- events ----------
  function bindEvents() {
    const G = Engine.G;
    const me = G.players[0], foe = G.players[1];

    document.getElementById('gb-endphase')?.addEventListener('click', () => {
      if (pendingKind === 'main') resolve({ type: 'done' });
      else if (pendingKind === 'attack') resolve(null);
      else if (pendingKind === 'movement') resolve(movesBuffer);
      else if (pendingKind === 'extradraw') resolve(false);
    });
    document.getElementById('gb-quit')?.addEventListener('click', () => {
      if (confirm('ออกจากเกม?')) { Engine.G.over = true; App.show('menu'); }
    });
    document.getElementById('gb-log-btn')?.addEventListener('click', () => {
      document.getElementById('gb-log').classList.toggle('hidden');
    });

    // hand: click + drag
    document.querySelectorAll('#gb-hand .hcard').forEach(el => {
      el.onclick = () => onHandClick(parseInt(el.dataset.i), el.dataset.no);
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'hand', i: parseInt(el.dataset.i), no: el.dataset.no }));
      });
      addLongPressPreview(el, () => el.dataset.no);
    });

    // units: click + drag (mine) + raid drop target
    document.querySelectorAll('.unit').forEach(el => {
      const uid = parseInt(el.dataset.uid);
      const mine = el.dataset.mine === '1';
      el.onclick = e => { e.stopPropagation(); onUnitClick(uid, mine); };
      if (mine) {
        el.addEventListener('dragstart', e => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'unit', uid }));
        });
      }
      el.addEventListener('dragover', e => { e.preventDefault(); });
      el.addEventListener('drop', e => onDropOnUnit(e, uid, mine));
      addLongPressPreview(el, () => el.dataset.no);
    });

    // my lines: drop targets
    document.querySelectorAll('.line-zone[data-owner="me"]').forEach(el => {
      el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('dragover'); });
      el.addEventListener('dragleave', () => el.classList.remove('dragover'));
      el.addEventListener('drop', e => { el.classList.remove('dragover'); onDropOnLine(e, el.dataset.line); });
    });

    // deck click = extra draw
    document.querySelector('.deck-zone[data-owner="me"]')?.addEventListener('click', () => {
      if (pendingKind === 'extradraw') resolve(true);
    });

    // sideline / removal viewers
    document.querySelectorAll('.pile-zone').forEach(el => {
      el.addEventListener('click', () => {
        const p = el.dataset.owner === 'me' ? me : foe;
        openPileViewer(p, el.dataset.zone);
      });
    });
  }

  async function openPileViewer(p, zone) {
    const arr = p[zone];
    const label = zone === 'removal' ? 'Removal Area' : 'Sideline';
    const body = arr.length
      ? `<div class="hand-preview">${arr.map(no => {
          const c = UAData.byNo.get(no);
          return `<div class="pv-card" onclick="showCardModal('${no}')">${UAData.imgTag(c)}</div>`;
        }).join('')}</div>`
      : '<p style="color:#999">ว่าง</p>';
    await modalChoice(`${label} ของ ${UAData.escapeHtml(p.name)} (${arr.length})`, body,
      [{ label: 'ปิด', value: null }]);
  }

  // ---------- drag & drop actions ----------
  function readDrag(e) {
    try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; }
  }

  // shared by the desktop drop handler and the portrait drag-to-place gesture
  async function playHandCardToLine(no, line) {
    if (pendingKind !== 'main') return;
    const me = Engine.G.players[0];
    const c = UAData.byNo.get(no);
    if (!c) return;
    if (c.type === 'Event') { resolve({ type: 'event', no }); return; }
    if (c.type === 'Field' && line !== 'energy') { DeckBuilder.toast('Site ลงได้เฉพาะ Energy Line'); return; }
    if (c.type !== 'Character' && c.type !== 'Field') { DeckBuilder.toast('การ์ดนี้ลงสนามไม่ได้'); return; }
    const dest = line === 'front' ? me.front : me.energy;
    let removeUid = null;
    if (dest.length >= 4) {
      removeUid = await modalChoice('Line เต็ม — เลือกใบที่จะส่งไป Removal', '',
        [...dest.map(u => ({ label: u.card.name, value: u.uid })), { label: 'ยกเลิก', value: null }]);
      if (removeUid == null) return;
    }
    resolve({ type: 'play', no, line, removeUid });
  }

  async function onDropOnLine(e, line) {
    e.preventDefault();
    const d = readDrag(e);
    if (!d) return;
    const me = Engine.G.players[0];

    if (d.kind === 'hand' && pendingKind === 'main') { await playHandCardToLine(d.no, line); return; }

    if (d.kind === 'unit' && pendingKind === 'movement') {
      const u = Engine.findUnit(me, d.uid);
      if (u) freeMove(u, line);
    }
  }

  async function onDropOnUnit(e, targetUid, targetMine) {
    e.preventDefault();
    e.stopPropagation();
    const d = readDrag(e);
    if (!d || d.kind !== 'hand' || pendingKind !== 'main' || !targetMine) return;
    const me = Engine.G.players[0];
    const c = UAData.byNo.get(d.no);
    if (!c) return;
    const kw = Engine.parseKeywords(c);
    if (!kw.raidTargets.length) return;
    const targets = Engine.raidTargetsFor(me, c);
    if (targets.some(u => u.uid === targetUid)) {
      resolve({ type: 'raid', no: d.no, targetUid });
    } else {
      DeckBuilder.toast('Raid ทับใบนี้ไม่ได้ (เงื่อนไขไม่ตรง)');
    }
  }

  // free movement during Move Phase:
  // - energy → front: อิสระ กี่รอบก็ได้
  // - front → energy: ต้องมี [Step] เท่านั้น (ยกเว้น "ย้อน" ใบที่เพิ่งย้ายขึ้นใน phase นี้)
  let movedUpThisPhase = new Set();
  function freeMove(u, to) {
    const me = Engine.G.players[0];
    const from = me.front.includes(u) ? me.front : me.energy;
    const dest = to === 'front' ? me.front : me.energy;
    if (from === dest) return;
    if (u.card.type !== 'Character') { DeckBuilder.toast('Site ย้ายไม่ได้'); return; }
    if (to === 'energy' && !u.kw.step && !movedUpThisPhase.has(u.uid)) {
      DeckBuilder.toast(`${u.card.name} ไม่มี [Step] — ย้ายลง Energy Line ไม่ได้`);
      return;
    }
    if (dest.length >= 4) { DeckBuilder.toast('ปลายทางเต็ม (4 ใบ) — ย้ายใบอื่นออกก่อน'); return; }
    from.splice(from.indexOf(u), 1);
    dest.push(u);
    if (to === 'front') movedUpThisPhase.add(u.uid);
    else movedUpThisPhase.delete(u.uid);
    Engine.log(`คุณ ย้าย ${u.card.name} ไป ${to === 'front' ? 'Front' : 'Energy'} Line`);
    render();
  }

  // ---------- click interactions ----------
  async function onHandClick(i, no) {
    const me = Engine.G.players[0];
    const c = UAData.byNo.get(no);
    if (pendingKind !== 'main') { showCardModal(no); return; }

    const opts = [];
    if (c.type === 'Character') {
      opts.push({ label: '⬆ ลง Front Line', value: 'front' });
      opts.push({ label: '⬇ ลง Energy Line', value: 'energy' });
      const kw = Engine.parseKeywords(c);
      if (kw.raidTargets.length && Engine.raidTargetsFor(me, c).length)
        opts.push({ label: '⚡ Raid', value: 'raid' });
    } else if (c.type === 'Field') {
      opts.push({ label: '⬇ ลง Energy Line', value: 'energy' });
    } else if (c.type === 'Event') {
      opts.push({ label: '✨ ใช้ Event', value: 'event' });
    }
    opts.push({ label: '🔍 ดูการ์ด', value: 'view' });
    opts.push({ label: 'ยกเลิก', value: null });

    const v = await modalChoice(`${UAData.escapeHtml(c.name)} — Energy ${c.need ?? '-'} / AP ${c.ap ?? '-'}`,
      cardThumb(c), opts);
    if (!v) return;
    if (v === 'view') { showCardModal(no); return; }
    if (v === 'raid') {
      const targets = Engine.raidTargetsFor(me, c);
      const t = await modalChoice('เลือกเป้าหมาย Raid', '', [...targets.map(u =>
        ({ label: `${u.card.name} (${me.front.includes(u) ? 'Front' : 'Energy'})`, value: u.uid })),
        { label: 'ยกเลิก', value: null }]);
      if (t != null) resolve({ type: 'raid', no, targetUid: t });
      return;
    }
    if (v === 'event') { resolve({ type: 'event', no }); return; }
    const line = v === 'front' ? me.front : me.energy;
    let removeUid = null;
    if (line.length >= 4) {
      removeUid = await modalChoice('Line เต็ม — เลือกใบที่จะส่งไป Removal', '',
        [...line.map(u => ({ label: u.card.name, value: u.uid })), { label: 'ยกเลิก', value: null }]);
      if (removeUid == null) return;
    }
    resolve({ type: 'play', no, line: v, removeUid });
  }

  async function onUnitClick(uid, mine) {
    const G = Engine.G;
    const me = G.players[0], foe = G.players[1];
    const owner = mine ? me : foe;
    const u = Engine.findUnit(owner, uid);
    if (!u) return;

    if (!mine) { showCardModal(u.no); return; }

    if (pendingKind === 'movement') {
      // one click = instantly swap line (move freely, any number of times)
      if (u.card.type !== 'Character') { showCardModal(u.no); return; }
      const inEnergy = me.energy.includes(u);
      freeMove(u, inEnergy ? 'front' : 'energy');
      return;
    }

    if (pendingKind === 'attack') {
      if (me.front.includes(u) && !u.rested) {
        const opts = [{ label: `⚔ โจมตีผู้เล่น (${foe.name})`, value: 'player' }];
        if (u.kw.snipe && foe.front.length)
          opts.push({ label: '🎯 [Snipe] โจมตี character', value: 'snipe' });
        opts.push({ label: '🔍 ดูการ์ด', value: 'view' });
        opts.push({ label: 'ยกเลิก', value: null });
        const v = await modalChoice(`${u.card.name} (BP ${Engine.bp(u)})`, cardThumb(u.card), opts);
        if (v === 'view') { showCardModal(u.no); return; }
        if (v === 'player') { resolve({ uid }); return; }
        if (v === 'snipe') {
          const t = await modalChoice('เลือกเป้าหมาย Snipe', '', [...foe.front.map(x =>
            ({ label: `${x.card.name} (BP ${Engine.bp(x)})${x.rested ? ' [นอน]' : ''}`, value: x.uid })),
            { label: 'ยกเลิก', value: null }]);
          if (t != null) resolve({ uid, targetUid: t });
        }
        return;
      }
      showCardModal(u.no);
      return;
    }

    if (pendingKind === 'main') {
      const opts = [];
      if (Effects.hasMain(u.card))
        opts.push({ label: '⚡ ใช้ Ability [Main]', value: 'ability' });
      opts.push(
        { label: '🔍 ดูการ์ด', value: 'view' },
        { label: '＋1000 BP', value: '+bp' },
        { label: '−1000 BP', value: '-bp' },
        { label: u.rested ? '↕ ตั้งขึ้น (Active)' : '↷ วางนอน (Rest)', value: 'flip' },
        { label: '🗑 ส่งไป Sideline', value: 'side' },
        { label: '❌ ส่งไป Removal', value: 'rmv' },
        { label: 'ยกเลิก', value: null },
      );
      const v = await modalChoice(`${u.card.name} — จัดการ (manual)`, cardThumb(u.card), opts);
      if (!v) return;
      if (v === 'ability') { resolve({ type: 'ability', uid }); return; }
      if (v === 'view') { showCardModal(u.no); return; }
      if (v === '+bp') resolve({ type: 'bpmod', uid, delta: 1000 });
      else if (v === '-bp') resolve({ type: 'bpmod', uid, delta: -1000 });
      else if (v === 'flip') resolve({ type: u.rested ? 'stand' : 'rest', uid });
      else if (v === 'side') { if (confirm('ยืนยันส่งไป Sideline?')) resolve({ type: 'sideline', uid }); }
      else if (v === 'rmv') { if (confirm('ยืนยันส่งไป Removal? (ออกจากเกมถาวร)')) resolve({ type: 'removal', uid }); }
      return;
    }

    showCardModal(u.no);
  }

  // ---------- generic modals ----------
  function modalChoice(title, bodyHtml, buttons, opts = {}) {
    return new Promise(res => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      // Buttons carrying a `card` render as a picture tile — picking a character or a card in hand
      // is much easier from the art than from a name. Plain buttons (skip, effect menus) stay text.
      const cardBtns = buttons.filter(b => b.card);
      const textBtns = buttons.filter(b => !b.card);
      const tiles = cardBtns.length ? `<div class="choice-cards">${cardBtns.map(b =>
        `<button class="choice-card" data-i="${buttons.indexOf(b)}" title="${UAData.escapeHtml(b.label)}">
          ${UAData.imgTag(b.card)}
          <span class="cc-label">${UAData.escapeHtml(b.label)}</span>
        </button>`).join('')}</div>` : '';
      const rows = textBtns.length ? `<div class="choice-btns">${textBtns.map(b =>
        `<button class="btn ${buttons.indexOf(b) === 0 ? 'primary' : ''}" data-i="${buttons.indexOf(b)}">${b.label}</button>`).join('')}</div>` : '';
      wrap.innerHTML = `<div class="modal-card ${opts.wide || cardBtns.length > 3 ? 'wide' : ''}" style="flex-direction:column;${(opts.wide || cardBtns.length > 3) ? '' : 'max-width:460px;'}max-height:88vh;overflow:auto">
        <h3 style="color:var(--red)">${title}</h3>
        ${bodyHtml || ''}
        ${tiles}${rows}
      </div>`;
      document.body.appendChild(wrap);
      wrap.querySelectorAll('.choice-btns button, .choice-card').forEach(btn => {
        btn.onclick = () => { document.body.removeChild(wrap); res(buttons[parseInt(btn.dataset.i)].value); };
      });
    });
  }
  function modalConfirm(title, bodyHtml, yesLabel, noLabel) {
    const btns = [{ label: yesLabel, value: true }];
    if (noLabel) btns.push({ label: noLabel, value: false });
    return modalChoice(title, bodyHtml, btns);
  }

  // ---------- start ----------
  async function start(playerDeck, botDeck, botName) {
    Engine.G.onUpdate = render;
    Engine.G.onLog = showEventToast;
    fitStage();
    await Engine.startGame(playerDeck, botDeck, humanController, makeBotController(), 'คุณ', botName);
  }

  // ---------- long-press to inspect ----------
  // A phone has no hover, and a tap plays the card, so there was no way to read one before
  // committing to it. Holding for ~450ms opens the full-size card modal instead; the modal lives
  // on document.body, outside the scaled stage, so it renders at full resolution.
  function addLongPressPreview(el, getNo) {
    let timer = null, startX = 0, startY = 0, fired = false;
    const clear = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('touchstart', e => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; fired = false;
      timer = setTimeout(() => { fired = true; showCardModal(getNo()); }, 450);
    }, { passive: true });
    // a scroll/drag past a few pixels is not a long press
    el.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) clear();
    }, { passive: true });
    el.addEventListener('touchend', e => {
      clear();
      if (fired) e.preventDefault();   // swallow the click that would otherwise play the card
    });
    el.addEventListener('touchcancel', clear);
  }

  // ---------- scale-to-fit ----------
  // The board is built at a fixed height (STAGE_H) and scaled as a single piece, so every screen
  // sees the desktop layout rather than a reflowed one. Width follows the screen's aspect ratio so
  // there are no side bars on wide phones, clamped so the mat never becomes absurdly stretched.
  const STAGE_H = 860, STAGE_W_MIN = 1180, STAGE_W_MAX = 2200;
  function fitStage() {
    const el = root();
    if (!el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;
    const w = Math.min(STAGE_W_MAX, Math.max(STAGE_W_MIN, Math.round((vw / vh) * STAGE_H)));
    el.style.setProperty('--stage-w', w + 'px');
    el.style.setProperty('--stage-h', STAGE_H + 'px');
    el.style.setProperty('--stage-scale', Math.min(vw / w, vh / STAGE_H).toFixed(4));
  }
  // rotating swaps between the landscape mat and the portrait board, so re-render too
  let lastPortrait = isPortrait();
  const onViewportChange = () => {
    fitStage();
    if (isPortrait() !== lastPortrait) { lastPortrait = isPortrait(); if (Engine.G.players.length) render(); }
  };
  addEventListener('resize', onViewportChange);
  addEventListener('orientationchange', () => setTimeout(onViewportChange, 120));
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', fitStage);
  else fitStage();

  return { start, render, humanController, fitStage };
})();
