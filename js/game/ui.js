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
        ({ label: `🛡 ${u.card.name} (BP ${Engine.bp(u)})`, value: u.uid }));
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
        ({ label: `${u.card.name} (BP ${Engine.bp(u)})${u.rested ? ' [นอน]' : ''}`, value: u.uid }));
      if (allowSkip) btns.push({ label: 'ข้าม (ไม่เลือก)', value: null });
      return await modalChoice(prompt, '', btns);
    },
    async chooseEnemyCharacter(p, units, prompt, allowSkip = false) {
      const btns = units.map(u => ({ label: `${u.card.name} (BP ${Engine.bp(u)})`, value: u.uid }));
      if (allowSkip) btns.push({ label: 'ข้าม (ไม่เลือก)', value: null });
      return await modalChoice(prompt, '', btns);
    },
    async chooseRaidFromTrigger(p, c, targets) {
      const btns = targets.map(u => ({ label: `⚡ Raid ทับ ${u.card.name}`, value: u.uid }));
      btns.push({ label: '✋ เก็บเข้ามือแทน', value: null });
      return await modalChoice(`Trigger [Raid] — ${UAData.escapeHtml(c.name)}`, cardThumb(c), btns);
    },
    async chooseDiscard(p) {
      const btns = p.hand.map((no, i) =>
        ({ label: UAData.byNo.get(no)?.name || no, value: i }));
      return await modalChoice('มือเกิน 8 ใบ — เลือกทิ้ง (ไป Removal)', '', btns);
    },
    async chooseOption(p, title, options, bodyHtml = '') {
      return await modalChoice(title, bodyHtml, options);
    },
    async chooseCardFromHand(p, title) {
      if (!p.hand.length) return null;
      const btns = p.hand.map((no, i) => {
        const c = UAData.byNo.get(no);
        return { label: `${c?.name || no} (E${c?.need ?? '-'})`, value: i };
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
          return { label: `${c?.name || p.hand[i]} (E${c?.need ?? '-'})`, value: i };
        });
        const i = await modalChoice(`${title} (${k + 1}/${n})`, '', btns);
        if (i == null) break;
        picked.push(i);
        remaining.splice(remaining.indexOf(i), 1);
      }
      return picked;
    },
    // pick 1 card from Removal/Outside Area matching a predicate, or null to skip
    async chooseCardFromRemoval(p, title, predicate) {
      const idxs = p.removal.map((no, i) => i).filter(i => !predicate || predicate(UAData.byNo.get(p.removal[i])));
      if (!idxs.length) return null;
      const btns = idxs.map(i => {
        const c = UAData.byNo.get(p.removal[i]);
        return { label: c?.name || p.removal[i], value: i };
      });
      btns.push({ label: 'ไม่เลือก', value: null });
      return await modalChoice(title, '', btns);
    },
    // look-at-top-N flow: choose up to maxPick matching cards to add to hand;
    // the rest return to the bottom of the deck in their original relative order.
    async chooseRevealPick(p, revealedNos, title, predicate, maxPick) {
      const cards = revealedNos.map(no => UAData.byNo.get(no));
      const body = `<div class="hand-preview">${cards.map(c => UAData.imgTag(c)).join('')}</div>`;
      const eligible = revealedNos.map((no, i) => i).filter(i => !predicate || predicate(cards[i]));
      if (!eligible.length) { await modalChoice(title, body, [{ label: 'ไม่มีใบที่ตรงเงื่อนไข — วางคืน', value: null }]); return []; }
      const picked = [];
      for (let k = 0; k < maxPick; k++) {
        const remaining = eligible.filter(i => !picked.includes(i));
        if (!remaining.length) break;
        const btns = remaining.map(i => ({ label: cards[i].name, value: i }));
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
  function showPhaseBanner(text, sub) {
    document.querySelectorAll('.phase-banner').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'phase-banner';
    el.innerHTML = `<div class="pb-strip"><span class="pb-text">${text}</span><div class="pb-sub">${sub || ''}</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 950);
    setTimeout(() => el.remove(), 1350);
  }

  function unitHtml(u, mine) {
    return `<div class="unit ${u.rested ? 'rested' : ''} ${mine ? 'mine' : 'foe'}"
        draggable="${mine}" data-uid="${u.uid}" data-mine="${mine ? 1 : 0}">
      ${UAData.imgTag(u.card)}
      <div class="unit-bp">${u.card.bp != null ? Engine.bp(u) : ''}${(u.bpMod || u.bpPersist) ? `<span class="bpmod">${(u.bpMod + u.bpPersist) > 0 ? '+' : ''}${u.bpMod + u.bpPersist}</span>` : ''}${u.under.length ? `<span class="raidn">⚡${u.under.length}</span>` : ''}${u.counters.length ? `<span class="raidn">●${u.counters.length}</span>` : ''}</div>
    </div>`;
  }

  // 4 card-size slots per line
  function lineHtml(p, mine, lineName) {
    const units = lineName === 'front' ? p.front : p.energy;
    let slots = '';
    for (let i = 0; i < 4; i++) {
      slots += `<div class="cardslot">${units[i] ? unitHtml(units[i], mine) : ''}</div>`;
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
  function render() {
    const G = Engine.G;
    if (!G.players.length) return;
    const me = G.players[0], foe = G.players[1];
    const el = root();
    if (!el) return;
    const myTurn = G.players[G.active] === me;
    maybeShowPhaseBanner();

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

  async function onDropOnLine(e, line) {
    e.preventDefault();
    const d = readDrag(e);
    if (!d) return;
    const me = Engine.G.players[0];

    if (d.kind === 'hand' && pendingKind === 'main') {
      const c = UAData.byNo.get(d.no);
      if (!c) return;
      if (c.type === 'Event') { resolve({ type: 'event', no: d.no }); return; }
      if (c.type === 'Field' && line !== 'energy') { DeckBuilder.toast('Site ลงได้เฉพาะ Energy Line'); return; }
      if (c.type !== 'Character' && c.type !== 'Field') { DeckBuilder.toast('การ์ดนี้ลงสนามไม่ได้'); return; }
      const dest = line === 'front' ? me.front : me.energy;
      let removeUid = null;
      if (dest.length >= 4) {
        removeUid = await modalChoice('Line เต็ม — เลือกใบที่จะส่งไป Removal', '',
          [...dest.map(u => ({ label: u.card.name, value: u.uid })), { label: 'ยกเลิก', value: null }]);
        if (removeUid == null) return;
      }
      resolve({ type: 'play', no: d.no, line, removeUid });
      return;
    }

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
      if (Effects.registry[u.no]?.onMain)
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
      wrap.innerHTML = `<div class="modal-card ${opts.wide ? 'wide' : ''}" style="flex-direction:column;${opts.wide ? '' : 'max-width:460px;'}max-height:88vh;overflow:auto">
        <h3 style="color:var(--red)">${title}</h3>
        ${bodyHtml || ''}
        <div class="choice-btns">${buttons.map((b, i) =>
          `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>
      </div>`;
      document.body.appendChild(wrap);
      wrap.querySelectorAll('.choice-btns button').forEach(btn => {
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
    Engine.G.onLog = () => {};
    await Engine.startGame(playerDeck, botDeck, humanController, makeBotController(), 'คุณ', botName);
  }

  return { start, render, humanController };
})();
