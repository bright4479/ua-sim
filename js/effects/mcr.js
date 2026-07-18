// ══════════ UA SIM — Macross (MCR) card-specific effect scripts ══════════
// Generic series-agnostic patterns (draw+discard, AP untap, scry, etc.) live in
// js/effects/common.js and apply automatically — only MCR-specific card
// numbers that need bespoke logic are registered here.

(() => {
  const reg = Effects.registry;
  const log = m => Engine.log(m);

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
})();
