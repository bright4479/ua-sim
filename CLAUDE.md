# UA SIM — Union Arena Simulator

Fan-made web simulator สำหรับเกมการ์ด UNION ARENA — vanilla HTML/CSS/JS ไม่มี build step
เล่นจริง: **https://bright4479.github.io/ua-sim/** (deploy อัตโนมัติเมื่อ push ขึ้น `main`)
คุยกับผู้ใช้เป็น**ภาษาไทย** (UI ของเกมก็เป็นภาษาไทย)

## เป้าหมายปัจจุบัน (งานต่อเนื่องหลาย session)

**ทำให้ effect ของการ์ดใช้งานได้จริงทุกใบ ทุก series รวมถึง Raid boss**
ลำดับที่ตกลงกับผู้ใช้: จับการ์ดที่มี pattern คล้ายกันก่อน (generic) → แล้วค่อยไล่ effect เฉพาะตัว/Raid boss ทีละใบ

สถานะล่าสุด (2026-07-19): การ์ดที่มี effect text 6,264 ใบ มี automatic handling แล้ว **~58.5%** (วัดด้วย `node tools/coverage-total.mjs` — มี ranking series ที่แย่สุดให้เลือกทำต่อ)
- MCR: 137/178 · EVA: ~65/108 · มีชั้น normalizeFx ใน common.js แปลงสำนวนแปลทุกแบบ (series ใหม่สะกดเลขเป็นคำ/"until the end of the turn", series เก่าอย่าง HTR แปลหยาบ) ให้ matcher ชุดเดียวใช้ได้หมด
- generic ครอบคลุมแล้ว: on-play (draw/draw+discard/scry/look-at-top-N-fetch/buff/debuff/rest/retire-conditional/bounce/cond-draw/free-play-from-hand/discard-fetch/fetch-outside), passive BP (Your Turn/Opponent's Turn/name/trait/hand-count — `Effects.genericBpBonus` + cache), เมื่อโจมตี (draw+discard/buff), [Main] (selfGenRetire/restBuffOther/discardImpact/restScryTopBottom), [On Retire] draw, AP untap event, keyword ครบ
- Raid boss ตัวใหญ่ (effect หลายชั้น/มี tier) ยังไม่ได้ script เลย — keyword พื้นฐานทำงาน แต่ bonus text ยังไม่

### ขั้นตอนทำงานต่อ (ทำตามนี้)
1. `node tools/uncovered-in-series.mjs <SERIES>` — ดูว่า series ไหนเหลือการ์ดที่ยังไม่ครอบคลุม
2. script รายใบลง `js/effects/<series>.js` (ดู mcr.js / eva.js เป็นแบบ; สร้างไฟล์ใหม่ต้องเพิ่ม `<script>` ใน index.html และรายชื่อไฟล์ใน tools/test-engine.mjs, tools/stress-test-all-series.mjs, tools/uncovered-in-series.mjs ด้วย)
3. หา pattern ซ้ำข้าม series → เพิ่มใน `js/effects/common.js` แทนการ script ทีละใบ (`node tools/analyze-patterns.mjs` ช่วยขุด)
4. **ก่อน commit ทุกครั้ง**: `node tools/stress-test-all-series.mjs` ต้องได้ `0 fail` (บอทชนบอท 1 เกม/series ทั้ง 55 series)
5. commit + push ขึ้น main → Pages deploy เอง (~1-2 นาที)

## ⚠️ กับดักสำคัญ (เคยพลาดมาแล้ว)

- **"Outside Area" ในข้อความการ์ด = โซน Sideline (`p.sideline`) ไม่ใช่ Removal Area!**
  `p.removal` ใช้เฉพาะ: ทิ้งมือเกิน 8 ใบ, line เต็ม 4 ต้องเอาออก, และข้อความที่เขียนว่า "Remove Area" ตรงๆ (หายาก)
- **ห้ามใช้ regex แบบ anchor ตายตัว** กับข้อความการ์ด — ข้อความเดียวกันสะกด/เรียงคำต่างกันนับสิบแบบ (place/put/discard, it/that card, top of/at the top, มี typo ในข้อมูลต้นทางด้วย) ใช้ keyword-based matcher ดู `findClause`/`findMatch` ใน common.js
- **clause คั่นด้วย `@`** และบางใบมี passive clause อยู่ก่อน `[On Play]` — ต้องหาทุก segment ไม่ใช่แค่ตัวแรก
- เด็ค: 50 ใบ series เดียว **สีเดียว** (กติกาที่ผู้ใช้กำหนดเพิ่มจาก manual), max 4/หมายเลข, trigger Special/Color/Final อย่างละ ≤4

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `js/game/engine.js` | กติกา + turn loop + `Effects` hook system (ท้ายไฟล์มี doc ของทุก hook) |
| `js/effects/common.js` | generic pattern ทุก series + `window.UAEffectHelpers` (helper ที่ script รายใบเรียกใช้) |
| `js/effects/mcr.js`, `eva.js` | script รายใบ (registry per cardNo — override generic เสมอ) |
| `js/game/bot.js` | bot AI + `buildBotDeck(series)` |
| `js/game/ui.js` | กระดาน 3D + human controller (modal prompts) |
| `js/deckbuilder.js`, `js/app.js` | deck builder + เมนู |
| `data/cards.js` | การ์ดทั้งหมด 10,473 ใบ (generated — อย่าแก้มือ) |
| `docs/rules-summary.md` | สรุปกติกาจาก Official Rule Manual v1.1 |

Effect hooks ที่มีให้ใช้ (ลง `Effects.registry[cardNo]`): `onPlay onAttack onBlock onEvent onMain onLeaveField onSideline(reason) onTurnStart onRaided onColorTrigger onWinBattle` (async) + `bpBonus impactBonus genMod costMod` (sync, คำนวณสด)
Unit state: `bpMod` (หมดเทิร์น) `bpPersist` (ถึงต้นเทิร์นหน้า) `tempImpact tempDmg tempGen counters retireAtEndOfMain`
Engine helpers: `sidelineUnit returnUnitToHand moveUnitFree playCardFromZone checkBpZero draw log payAP`

## ทดสอบ

```bash
node tools/test-engine.mjs MCR EVA          # bot vs bot 1 เกม ระบุ series
node tools/stress-test-all-series.mjs      # ทุก series — รันก่อน commit เสมอ
node tools/uncovered-in-series.mjs EVA     # การ์ดที่ยังไม่ครอบคลุมใน series
python -m http.server 8777                 # dev server แล้วเปิด localhost:8777
```

## Data pipeline (ปกติไม่ต้องแตะ)

การ์ดจาก `https://auth.exburst.dev/rest/v1/ua_cards` (Supabase, anon key ใน tools/scrape-cards.mjs)
→ `tools/scrape-cards.mjs` → `tools/build-data-js.mjs` → `data/cards.js` · รูปใน `assets/cards/` (7,608 ไฟล์)

## งานอื่นที่ค้างในคิว (รองจาก effect)

- Co-Op เชิญเพื่อนเล่นผ่าน WebRTC (ยังไม่เริ่ม — ปุ่มในเมนูขึ้น "เร็วๆ นี้")
