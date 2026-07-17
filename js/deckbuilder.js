// ══════════ UA SIM — Deck Builder ══════════
const DeckBuilder = (() => {
  let deck = {};            // { cardNo: count }
  let deckName = '';
  let currentSavedName = ''; // name under which deck is stored
  let filtered = [];
  let renderLimit = 120;

  const $ = id => document.getElementById(id);

  function init() {
    // series filter
    const fs = $('f-series');
    fs.innerHTML = '<option value="">ทุก series</option>' + UAData.seriesList
      .map(s => `<option value="${s}">${UAData.escapeHtml(UAData.seriesName(s))} (${s})</option>`).join('');
    // rarity filter (from data)
    const rarities = [...new Set(UAData.cards.map(c => c.rarity).filter(Boolean))].sort();
    $('f-rarity').innerHTML = '<option value="">Rarity ทั้งหมด</option>' +
      rarities.map(r => `<option>${r}</option>`).join('');

    for (const id of ['f-series', 'f-color', 'f-type', 'f-rarity', 'f-trigger'])
      $(id).addEventListener('change', applyFilters);
    $('f-search').addEventListener('input', debounce(applyFilters, 250));

    $('db-cards').addEventListener('scroll', () => {
      const el = $('db-cards');
      if (el.scrollTop + el.clientHeight > el.scrollHeight - 600 && renderLimit < filtered.length) {
        renderLimit += 120;
        renderPool(true);
      }
    });

    $('db-save').onclick = saveDeck;
    $('db-new').onclick = newDeck;
    $('db-delete').onclick = deleteDeck;
    $('db-deck-select').onchange = () => loadDeck($('db-deck-select').value);
    $('db-deck-name').addEventListener('input', e => { deckName = e.target.value; });

    refreshDeckSelect();
    applyFilters();
    renderDeck();
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- filters ----------
  function applyFilters() {
    const s = $('f-series').value, col = $('f-color').value, ty = $('f-type').value,
          ra = $('f-rarity').value, tr = $('f-trigger').value,
          q = $('f-search').value.trim().toLowerCase();
    filtered = UAData.cards.filter(c => {
      if (!c.main) return false;
      if (s && c.series !== s) return false;
      if (col && c.color !== col) return false;
      if (ty && c.type !== ty) return false;
      if (ra && c.rarity !== ra) return false;
      if (tr && c.trigger !== tr) return false;
      if (q && !((c.name || '').toLowerCase().includes(q) ||
                 (c.effect || '').toLowerCase().includes(q) ||
                 (c.no || '').toLowerCase().includes(q))) return false;
      return true;
    });
    renderLimit = 120;
    $('f-count').textContent = `${filtered.length} ใบ`;
    renderPool();
  }

  function renderPool(append = false) {
    const el = $('db-cards');
    const slice = filtered.slice(0, renderLimit);
    const html = slice.map(c => {
      const n = deck[c.no] || 0;
      return `<div class="pool-card" data-no="${c.no}">
        ${UAData.imgTag(c)}
        ${n ? `<div class="qty">${n}</div>` : ''}
        <div class="add-bar">
          <button onclick="DeckBuilder.remove('${c.no}');event.stopPropagation()">−</button>
          <button onclick="DeckBuilder.add('${c.no}');event.stopPropagation()">＋</button>
        </div>
      </div>`;
    }).join('');
    el.innerHTML = html;
    el.querySelectorAll('.pool-card').forEach(d => {
      d.querySelector('img').onclick = () => showCardModal(d.dataset.no);
    });
    if (!append) el.scrollTop = 0;
  }

  // ---------- deck ops ----------
  function deckTotal() { return Object.values(deck).reduce((a, b) => a + b, 0); }

  function add(no) {
    const c = UAData.byNo.get(no);
    if (!c) return;
    const cur = deck[no] || 0;
    if (cur >= 4) return toast('การ์ดเลขเดียวกันได้สูงสุด 4 ใบ');
    if (deckTotal() >= 50) return toast('เด็คเต็ม 50 ใบแล้ว');
    // same-series + same-color rule (1 เด็ค = 1 series + 1 สี)
    const existing = Object.keys(deck).find(n => deck[n] > 0);
    if (existing) {
      const c0 = UAData.byNo.get(existing);
      if (c0?.series && c.series !== c0.series)
        return toast(`เด็คนี้เป็น series ${c0.series} — ทุกใบต้องเป็น series เดียวกัน`);
      if (c0?.color && c.color && c.color !== c0.color)
        return toast(`เด็คนี้เป็นสี ${c0.color} — ทุกใบต้องเป็นสีเดียวกัน`);
    }
    // restricted trigger total ≤ 4 per type
    if (['Special', 'Color', 'Final'].includes(c.trigger)) {
      let t = 0;
      for (const [n, cnt] of Object.entries(deck))
        if (UAData.byNo.get(n)?.trigger === c.trigger) t += cnt;
      if (t >= 4) return toast(`Trigger ${c.trigger} รวมได้ไม่เกิน 4 ใบ`);
    }
    deck[no] = cur + 1;
    renderDeck(); renderPool(true);
  }

  function remove(no) {
    if (!deck[no]) return;
    deck[no]--;
    if (!deck[no]) delete deck[no];
    renderDeck(); renderPool(true);
  }

  function renderDeck() {
    const entries = Object.entries(deck).map(([no, count]) => ({ c: UAData.byNo.get(no), count }))
      .filter(e => e.c);
    const total = deckTotal();
    $('db-count').textContent = total;
    // group by type
    const order = ['Character', 'Event', 'Field', 'AP'];
    let html = '';
    for (const ty of order) {
      const grp = entries.filter(e => e.c.type === ty)
        .sort((a, b) => (a.c.need ?? 0) - (b.c.need ?? 0) || a.c.no.localeCompare(b.c.no));
      if (!grp.length) continue;
      const n = grp.reduce((a, e) => a + e.count, 0);
      html += `<div class="deck-sec">${ty} (${n})</div>`;
      html += grp.map(e => `
        <div class="deck-row">
          ${UAData.imgTag(e.c)}
          <span class="nm" title="${UAData.escapeHtml(e.c.name)}">${UAData.escapeHtml(e.c.name)}<br>
            <small style="color:#999">${e.c.no}${e.c.trigger ? ' · ' + e.c.trigger : ''}</small></span>
          <span class="cnt">×${e.count}</span>
          <button onclick="DeckBuilder.remove('${e.c.no}')">−</button>
          <button onclick="DeckBuilder.add('${e.c.no}')">＋</button>
        </div>`).join('');
    }
    $('db-decklist').innerHTML = html || '<p style="color:#999;font-size:.8rem;padding:10px">ยังไม่มีการ์ด — กด ＋ บนการ์ดเพื่อเพิ่ม</p>';
    document.querySelectorAll('#db-decklist .deck-row img').forEach((img, i) => { /* click detail */ });

    const problems = UAData.validateDeck(Object.entries(deck).map(([no, count]) => ({ no, count })));
    $('db-deck-warnings').innerHTML = problems.length
      ? problems.map(p => `⚠️ ${UAData.escapeHtml(p)}`).join('<br>')
      : '<span class="ok">✔ เด็คถูกต้องตามกติกา พร้อมใช้เล่น</span>';
  }

  // ---------- save / load ----------
  function refreshDeckSelect() {
    const decks = UAData.loadDecks();
    const names = Object.keys(decks).sort();
    $('db-deck-select').innerHTML = '<option value="">— เด็คที่บันทึก —</option>' +
      names.map(n => `<option ${n === currentSavedName ? 'selected' : ''}>${UAData.escapeHtml(n)}</option>`).join('');
  }

  function saveDeck() {
    const name = ($('db-deck-name').value || '').trim();
    if (!name) return toast('ตั้งชื่อเด็คก่อนบันทึก');
    const decks = UAData.loadDecks();
    decks[name] = { cards: { ...deck }, savedAt: Date.now() };
    UAData.saveDecks(decks);
    currentSavedName = name;
    refreshDeckSelect();
    toast(`บันทึก "${name}" แล้ว ✔`);
  }

  function loadDeck(name) {
    if (!name) return;
    const decks = UAData.loadDecks();
    if (!decks[name]) return;
    deck = { ...decks[name].cards };
    deckName = name;
    currentSavedName = name;
    $('db-deck-name').value = name;
    renderDeck(); renderPool(true);
  }

  function newDeck() {
    deck = {}; deckName = ''; currentSavedName = '';
    $('db-deck-name').value = '';
    $('db-deck-select').value = '';
    renderDeck(); renderPool(true);
  }

  function deleteDeck() {
    const name = $('db-deck-select').value || currentSavedName;
    if (!name) return toast('เลือกเด็คที่จะลบก่อน');
    if (!confirm(`ลบเด็ค "${name}" ?`)) return;
    const decks = UAData.loadDecks();
    delete decks[name];
    UAData.saveDecks(decks);
    newDeck(); refreshDeckSelect();
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('ua-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ua-toast';
      el.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:10px;z-index:200;font-size:.9rem;transition:.2s';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = 0; }, 2200);
  }

  return { init, add, remove, toast, get deck() { return deck; } };
})();
