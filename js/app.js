// ══════════ UA SIM — App navigation ══════════
const App = (() => {
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    if (name === 'deckbuilder' && !App._dbInit) { DeckBuilder.init(); App._dbInit = true; }
  }

  async function startSinglePlayer() {
    // pick player's deck: saved valid deck or auto deck
    const decks = UAData.loadDecks();
    const valid = Object.entries(decks).filter(([name, d]) => {
      const arr = Object.entries(d.cards || {}).map(([no, count]) => ({ no, count }));
      return UAData.validateDeck(arr).length === 0;
    });

    const choice = await pickModal('เลือกเด็คของคุณ', [
      ...valid.map(([name]) => ({ label: `🃏 ${name}`, value: { kind: 'saved', name } })),
      { label: '🎲 เด็คสุ่มอัตโนมัติ (เลือก series)', value: { kind: 'auto' } },
      { label: 'ยกเลิก', value: null },
    ]);
    if (!choice) return;

    let playerDeck;
    if (choice.kind === 'saved') {
      const d = decks[choice.name].cards;
      playerDeck = [];
      for (const [no, count] of Object.entries(d))
        for (let i = 0; i < count; i++) playerDeck.push(no);
    } else {
      const s = await pickSeries('เลือก series สำหรับเด็คของคุณ');
      if (!s) return;
      playerDeck = buildBotDeck(s);
      if (playerDeck.length < 50) { DeckBuilder.toast('series นี้การ์ดไม่พอสร้างเด็ค 50 ใบ'); return; }
    }

    const botSeries = await pickSeries('เลือก series ของบอทคู่ต่อสู้');
    if (!botSeries) return;
    const botDeck = buildBotDeck(botSeries);
    if (botDeck.length < 50) { DeckBuilder.toast('series นี้การ์ดไม่พอสร้างเด็ค 50 ใบ'); return; }

    show('game');
    GameUI.start(playerDeck, botDeck, `Bot (${UAData.seriesName(botSeries)})`);
  }

  function startCoop() {
    alert('โหมด Co-Op (เชิญเพื่อนผ่าน WebRTC) กำลังพัฒนา — เร็วๆ นี้!');
  }

  function pickModal(title, options) {
    return new Promise(res => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `<div class="modal-card" style="flex-direction:column;max-width:420px;max-height:80vh">
        <h3 style="color:var(--red)">${title}</h3>
        <div class="choice-btns" style="overflow-y:auto">${options.map((b, i) =>
          `<button class="btn" data-i="${i}">${b.label}</button>`).join('')}</div>
      </div>`;
      document.body.appendChild(wrap);
      wrap.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { document.body.removeChild(wrap); res(options[parseInt(btn.dataset.i)].value); };
      });
    });
  }

  async function pickSeries(title) {
    // only series that can form a 50-card mono-color deck (max 4 copies each)
    const counts = {}; // series -> color -> playable card count
    for (const c of UAData.cards) {
      if (!c.main || !c.color || !['Character', 'Event', 'Field'].includes(c.type)) continue;
      (counts[c.series] ??= {})[c.color] = (counts[c.series][c.color] || 0) + 4;
    }
    const options = UAData.seriesList
      .filter(s => Object.values(counts[s] || {}).some(n => n >= 50))
      .map(s => ({ label: UAData.seriesName(s) + ` (${s})`, value: s }));
    options.push({ label: 'ยกเลิก', value: null });
    return await pickModal(title, options);
  }

  function init() {
    document.getElementById('menu-card-count').textContent = UAData.cards.length.toLocaleString();
    document.getElementById('menu-series-count').textContent = UAData.seriesList.length;
  }

  return { show, startSinglePlayer, startCoop, init };
})();

window.addEventListener('DOMContentLoaded', App.init);
