// ══════════ UA SIM — card data helpers ══════════
const UAData = (() => {
  const cards = window.UA_CARDS || [];
  const seriesNames = window.UA_SERIES_NAMES || {};

  const byNo = new Map();
  const seriesSet = new Set();
  for (const c of cards) {
    byNo.set(c.no, c);
    if (c.series) seriesSet.add(c.series);
  }

  // series list sorted by display name
  const seriesList = [...seriesSet].sort((a, b) =>
    (seriesNames[a] || a).localeCompare(seriesNames[b] || b));

  // local image with remote fallback (handled via onerror in render)
  function localImg(c) {
    try {
      const base = c.img.split('?')[0].split('/').pop();
      return 'assets/cards/' + base;
    } catch { return c.img; }
  }

  function imgTag(c, cls = '') {
    const local = localImg(c);
    return `<img class="${cls}" src="${local}" loading="lazy" alt="${escapeHtml(c.name || '')}"
      onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${c.img}'}">`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // effect text uses '@' as line separator on exburst
  function fxText(s) { return escapeHtml(s || '').replace(/@/g, '\n').trim(); }

  const COLOR_HEX = { Yellow: '#e6b800', Purple: '#8e24aa', Red: '#d32f2f', Blue: '#1565c0', Green: '#2e7d32' };

  function seriesName(code) { return seriesNames[code] || code; }

  // ---- deck storage (localStorage) ----
  const LS_KEY = 'uasim_decks_v1';
  function loadDecks() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function saveDecks(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

  // ---- deck validation per official rules ----
  const RESTRICTED_TRIGGERS = ['Special', 'Color', 'Final'];
  function validateDeck(deckCards) { // deckCards: array of {no, count}
    const problems = [];
    let total = 0;
    const series = new Set();
    const colors = new Set();
    const trigCount = { Special: 0, Color: 0, Final: 0 };
    for (const { no, count } of deckCards) {
      const c = byNo.get(no);
      if (!c) { problems.push(`ไม่พบการ์ด ${no}`); continue; }
      total += count;
      if (c.series) series.add(c.series);
      if (c.color) colors.add(c.color);
      if (count > 4) problems.push(`${c.name} (${no}) เกิน 4 ใบ`);
      if (RESTRICTED_TRIGGERS.includes(c.trigger)) trigCount[c.trigger] += count;
    }
    if (total !== 50) problems.push(`ต้องมี 50 ใบพอดี (ตอนนี้ ${total})`);
    if (series.size > 1) problems.push(`ทุกใบต้องเป็น series เดียวกัน (พบ ${[...series].join(', ')})`);
    if (colors.size > 1) problems.push(`ทุกใบต้องเป็นสีเดียวกัน (พบ ${[...colors].join(', ')})`);
    for (const t of RESTRICTED_TRIGGERS)
      if (trigCount[t] > 4) problems.push(`Trigger ${t} เกิน 4 ใบ (${trigCount[t]})`);
    return problems;
  }

  return { cards, byNo, seriesList, seriesName, imgTag, localImg, escapeHtml, fxText,
           COLOR_HEX, loadDecks, saveDecks, validateDeck };
})();

// shared card detail modal
function showCardModal(no) {
  const c = UAData.byNo.get(no);
  if (!c) return;
  const esc = UAData.escapeHtml;
  document.getElementById('cm-img').src = UAData.localImg(c);
  document.getElementById('cm-img').onerror = function () {
    if (!this.dataset.f) { this.dataset.f = 1; this.src = c.img; }
  };
  const rows = [
    ['Card No.', c.no], ['Series', `${esc(UAData.seriesName(c.series))} (${esc(c.series)})`],
    ['Type', c.type], ['Color', c.color], ['Rarity', c.rarity],
    ['BP', c.bp ?? '—'], ['AP Cost', c.ap ?? '—'],
    ['Required Energy', c.need ?? '—'], ['Energy Gen.', c.gen ?? '—'],
    ['Traits', c.traits || '—'],
  ].map(([k, v]) => `<tr><td>${k}</td><td>${esc(v ?? '—')}</td></tr>`).join('');
  document.getElementById('cm-info').innerHTML = `
    <h3>${esc(c.name)}</h3>
    <table>${rows}</table>
    ${c.effect ? `<div class="fx"><b>Effect</b>\n${UAData.fxText(c.effect)}</div>` : ''}
    ${c.trigger ? `<div class="tg"><b>Trigger [${esc(c.trigger)}]</b>\n${UAData.fxText(c.triggerText || '')}</div>` : ''}
  `;
  document.getElementById('card-modal').classList.remove('hidden');
}
