// ══════════ UA SIM — card effect scripts ══════════
// Batch 1: generic safe auto-effects + Macross (MCR) starters.
// Register per-card handlers into Effects.registry[cardNo].
// Cards without a script fall back to manual play (player reads the card
// and uses the unit menu: ±BP, rest/stand, sideline, removal).

(() => {
  const reg = Effects.registry;

  // ---------- helpers ----------
  const draw = (p, n) => Engine.draw(p, n);
  const log = m => Engine.log(m);

  async function discardFromHandToRemoval(p, title) {
    if (!p.hand.length) return;
    const i = await p.controller.chooseCardFromHand(p, title || 'เลือกการ์ดจากมือไป Removal');
    if (i == null) return;
    const no = p.hand.splice(i, 1)[0];
    p.removal.push(no);
    log(`${p.name} ส่ง ${UAData.byNo.get(no)?.name} จากมือไป Removal`);
  }

  // look at top card of deck; options = subset of ['top','bottom','removal']
  async function scryTop(p, places) {
    if (!p.deck.length) return;
    const top = p.deck[0];
    const c = UAData.byNo.get(top);
    const labels = { top: '⬆ วางไว้บนเด็คเหมือนเดิม', bottom: '⬇ วางใต้เด็ค', removal: '❌ ส่งไป Removal' };
    const opts = places.map(v => ({ label: labels[v], value: v }));
    const isHuman = !p.controller.isBot;
    const body = isHuman
      ? `<div style="text-align:center">${UAData.imgTag(c, 'thumb')}</div>`
      : '';
    const v = await p.controller.chooseOption(p, `การ์ดบนสุดของเด็ค: ${c?.name}`, opts, body);
    if (v === 'bottom') { p.deck.push(p.deck.shift()); log(`${p.name} ย้ายการ์ดบนเด็คไปใต้เด็ค`); }
    else if (v === 'removal') { p.removal.push(p.deck.shift()); log(`${p.name} ส่งการ์ดบนเด็คไป Removal`); }
    else log(`${p.name} เก็บการ์ดไว้บนเด็คเหมือนเดิม`);
  }

  // ---------- generic auto-effects (safe full-text patterns, all series) ----------
  const RX_ONPLAY_DRAW = /^\s*\[On Play\]\s*Draw (\d+) cards?\.?\s*$/i;
  const RX_ONPLAY_DRAW_DISCARD = /^\s*\[On Play\]\s*Draw (\d+) cards?,\s*place (\d+) cards? from your hand (?:in)?to the Outside Area\.?\s*$/i;
  const RX_AP_ACTIVE = /^\s*Choose up to (\d+) of your AP cards and set them to active\.?\s*$/i;
  const RX_SCRY_TOP_REMOVAL = /^\s*\[On Play\]\s*Look at the top card of your deck, place it on (?:the )?top of your deck or to the Outside Area\.?\s*$/i;
  const RX_SCRY_TOP_BOTTOM = /^\s*\[On Play\]\s*Look at the top card of your deck, place it on the top o[fr] bottom of your deck\.?\s*$/i;

  const origOnPlay = Effects.onPlay.bind(Effects);
  Effects.onPlay = async function (G, p, unit) {
    if (this.registry[unit.no]?.onPlay) return origOnPlay(G, p, unit);
    const fx = (unit.card.effect || '').trim();
    let m;
    if ((m = fx.match(RX_ONPLAY_DRAW))) {
      draw(p, parseInt(m[1]));
      log(`[On Play] ${unit.card.name}: ${p.name} จั่ว ${m[1]} ใบ`);
    } else if ((m = fx.match(RX_ONPLAY_DRAW_DISCARD))) {
      draw(p, parseInt(m[1]));
      log(`[On Play] ${unit.card.name}: จั่ว ${m[1]} ใบ`);
      for (let i = 0; i < parseInt(m[2]); i++) await discardFromHandToRemoval(p);
    } else if (fx.match(RX_SCRY_TOP_REMOVAL)) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'removal']);
    } else if (fx.match(RX_SCRY_TOP_BOTTOM)) {
      log(`[On Play] ${unit.card.name}: ดูการ์ดบนสุดของเด็ค`);
      await scryTop(p, ['top', 'bottom']);
    }
  };

  const origOnEvent = Effects.onEvent.bind(Effects);
  Effects.onEvent = async function (G, p, card) {
    if (this.registry[card.no]?.onEvent) return origOnEvent(G, p, card);
    const fx = (card.effect || '').trim();
    let m;
    if ((m = fx.match(RX_AP_ACTIVE))) {
      const n = Math.min(parseInt(m[1]), p.apRested);
      p.apRested -= n;
      log(`${card.name}: AP กลับมา Active ${n} ใบ`);
    } else {
      // unscripted event: show text so the player can apply it manually
      log(`Event ${card.name}: ${fx.split('@')[0]} (ทำ effect ตามการ์ด — manual)`);
      if (!p.controller.isBot) {
        await p.controller.chooseOption(p, `Event: ${card.name}`,
          [{ label: 'รับทราบ — ทำตามข้อความการ์ดเอง', value: 1 }],
          `<p class="fx" style="white-space:pre-wrap">${UAData.fxText(card.effect || '')}</p>`);
      }
    }
  };

  // ---------- MCR: scripted singles (batch 1) ----------
  // (การ์ดที่ generic patterns ครอบคลุมอยู่แล้วไม่ต้องลงทะเบียนซ้ำ)

  // Mikumo Guynemer — [Impact Negate] + BP bonus นับ Walküre (BP ส่วนนี้ยัง manual)
  // EX14BT-MCR-2-044: keyword ครอบคลุมโดย parser แล้ว

  // Mylene Flare Jenius — [Main] [Rest this card] เลือก character อื่น 1 ใบ +1000 BP ถึงจบเทิร์น
  reg['EX14BT-MCR-2-077'] = {
    async onMain(G, p, unit) {
      if (unit.rested) { p.controller.notify?.('การ์ดนอนอยู่ ใช้ ability ไม่ได้'); return; }
      const others = [...p.front, ...p.energy].filter(u => u !== unit && u.card.type === 'Character');
      if (!others.length) { p.controller.notify?.('ไม่มี character อื่นบนสนาม'); return; }
      const uid = await p.controller.chooseOwnCharacter(p, others, 'เลือก character รับ +1000 BP (เทิร์นนี้)');
      const t = others.find(u => u.uid === uid);
      if (!t) return;
      unit.rested = true; // cost: rest this card
      t.bpMod += 1000;
      log(`${unit.card.name}: ${t.card.name} ได้ +1000 BP ถึงจบเทิร์น`);
    },
  };

  // ตัวอย่างโครงสำหรับการ์ดที่ซับซ้อน — เติมเพิ่มเรื่อยๆ:
  // reg['UA36BT-MCR-1-055'] = {
  //   async onPlay(G, p, unit) { ... }
  // };
})();
