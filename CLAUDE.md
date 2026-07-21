# UA SIM — Union Arena Simulator

Fan-made web simulator สำหรับเกมการ์ด UNION ARENA — vanilla HTML/CSS/JS ไม่มี build step
เล่นจริง: **https://bright4479.github.io/ua-sim/** (deploy อัตโนมัติเมื่อ push ขึ้น `main`)
คุยกับผู้ใช้เป็น**ภาษาไทย** (UI ของเกมก็เป็นภาษาไทย)

## เป้าหมายปัจจุบัน (งานต่อเนื่องหลาย session)

**ทำให้ effect ของการ์ดใช้งานได้จริงทุกใบ ทุก series รวมถึง Raid boss**
ลำดับที่ตกลงกับผู้ใช้: จับการ์ดที่มี pattern คล้ายกันก่อน (generic) → แล้วค่อยไล่ effect เฉพาะตัว/Raid boss ทีละใบ

สถานะล่าสุด (2026-07-20): การ์ดที่มี effect text 6,264 ใบ มี automatic handling แล้ว **~64.2%** (วัดด้วย `node tools/coverage-total.mjs` — มี ranking series ที่แย่สุดให้เลือกทำต่อ; ใช้ `node tools/coverage-report-full.mjs` เพื่อดูตารางทั้ง 55 series + "bonus text ค้าง" ของ Raid boss ด้วย)
- MCR: 137/178 · EVA: ~65/108 · **HTR: 175/179 (98%)** · **ARK: 168/174 (97%, เสร็จเกือบหมด — เหลือ 6 ใบ skip เพราะต้อง engine mechanism ที่ยังไม่มี ดู comment ท้าย ark.js)**
- มีชั้น normalizeFx ใน common.js แปลงสำนวนแปลทุกแบบ (series ใหม่สะกดเลขเป็นคำ/"until the end of the turn"/"for the turn"/เลข gen หลุดติดหน้าข้อความ, series เก่าอย่าง HTR แปลหยาบ) ให้ matcher ชุดเดียวใช้ได้หมด
- generic ครอบคลุมแล้ว: on-play (draw/draw+discard/scry/look-at-top-N-fetch/scry-discard-to-top/buff/debuff/rest/retire-conditional/bounce/cond-draw/free-play-from-hand/discard-fetch/fetch-outside), passive BP (Your Turn/Opponent's Turn/name/trait/hand-count — `Effects.genericBpBonus` + cache), aura BP hook (`auraBp`, การ์ดหนึ่งให้บวก BP การ์ดอื่นบนสนามเดียวกัน), passive front-line energy generation (`Effects.genericFrontGen` + `kw.frontGen` + per-card `frontGenBonus` hook), untargetable keyword ("cannot be chosen by opponent's effect"), skip-next-stand mechanic (`unit.skipNextStand` — "the next time it would set to active it doesn't", พบ 63 ใบทั้งฐานข้อมูล), hand-based cost-discount coverage-measurement fix (`Engine.hasTextCostDiscount`), เมื่อโจมตี (draw+discard/buff), [Main] (selfGenRetire/restBuffOther/discardImpact/restScryTopBottom/payApDraw/restDebuffEnemy), [On Retire] draw(+discard)/rest-enemy/buff-other, keyword ครบ
- Raid boss ตัวใหญ่ (effect หลายชั้น/มี tier) ส่วนใหญ่ยังไม่ได้ script — keyword พื้นฐานทำงาน แต่ bonus text ยังไม่ (ดู `coverage-report-full.mjs` คอลัมน์ "เหลือ script")
- **engine hook ใหม่ที่เพิ่มรอบนี้ (ARK pass)** (ใช้ต่อได้กับ series อื่น): `unit.skipNextStand`/`unit.noRetire`/`unit.tempSnipe`/`unit._playedByEffect` fields, `auraBp(owner,srcUnit,tgtUnit)` hook (aura BP ที่ไม่ใช่ passive ของตัวเอง), `Engine.opponentOf`/`Engine.bp`/`Engine.moveUnitFree` ใช้บ่อยขึ้นใน per-card scripts, `H.lookTopAndDiscard` (mill top-N ไป Outside Area ที่เหลือกลับไปบนเด็ค แทนที่จะไปเข้ามือ)
- **engine hook ที่เพิ่มรอบก่อน (HTR pass)**: `onBeforeLeaveCounters` (ดัก [On Retire] ที่ต้องอ่าน counters ก่อนโดนล้าง), `unit._watchers` array (reactive "ถ้า unit ศัตรูที่ mark ไว้ retire ให้ทำ X" — ไม่ผูกกับ card no), `onAnyWinBattle`/`onAnyLoseBattle` (Field/passive ที่ตอบสนองเมื่อ "character ใดๆของคุณ" ชนะ/แพ้ battle ไม่ใช่แค่ attacker เอง), `retireAtEndOfTurn`/`noBlock`/`_grantedOnWinDraw` unit fields, `_playedTraitsThisTurn` (เช็ค "เล่นการ์ด Trait:X จากมือเทิร์นนี้"), `onBlock` ส่ง attacker unit เป็น param ที่ 4

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
| `js/effects/mcr.js`, `eva.js`, `htr.js`, `ark.js` | script รายใบ (registry per cardNo — override generic เสมอ) |
| `js/game/bot.js` | bot AI + `buildBotDeck(series)` |
| `js/game/ui.js` | กระดาน 3D + human controller (modal prompts) |
| `js/deckbuilder.js`, `js/app.js` | deck builder + เมนู |
| `data/cards.js` | การ์ดทั้งหมด 10,473 ใบ (generated — อย่าแก้มือ) |
| `docs/rules-summary.md` | สรุปกติกาจาก Official Rule Manual v1.1 |

Effect hooks ที่มีให้ใช้ (ลง `Effects.registry[cardNo]`): `onPlay onAttack onBlock(atkUnit) onEvent onMain onLeaveField onSideline(reason) onTurnStart onRaided onColorTrigger onWinBattle onAnyWinBattle onAnyLoseBattle onBeforeLeaveCounters(reason)` (async) + `bpBonus impactBonus genMod costMod frontGenBonus auraBp(owner,srcUnit,tgtUnit)` (sync, คำนวณสด — `auraBp` ห้ามเรียก `Engine.bp()` ซ้ำ จะ recursion)
Unit state: `bpMod` (หมดเทิร์น) `bpPersist` (ถึงต้นเทิร์นหน้า) `tempImpact tempDmg tempGen tempFrontGen frontGenPersist counters retireAtEndOfMain retireAtEndOfTurn noBlock skipNextStand noRetire tempSnipe _grantedOnWinDraw _playedByEffect _watchers[]`
Engine helpers: `sidelineUnit returnUnitToHand moveUnitFree playCardFromZone checkBpZero draw log payAP hasTextCostDiscount opponentOf bp parseKeywords activeAP hasEnergyFor`
Player state: `p._playedTraitsThisTurn` (Set ของ trait ตัวพิมพ์เล็กที่เล่นจากมือเทิร์นนี้), `p._drewThisTurn` `p._getPlayedThisTurn`

## ทดสอบ

```bash
node tools/test-engine.mjs MCR EVA HTR      # bot vs bot 1 เกม ระบุ series
node tools/stress-test-all-series.mjs      # ทุก series — รันก่อน commit เสมอ
node tools/uncovered-in-series.mjs EVA     # การ์ดที่ยังไม่ครอบคลุมใน series
node tools/coverage-report-full.mjs        # ตารางทุก series + แยก "ยังไม่ครอบคลุมเลย" vs "covered จาก keyword แต่ยังมี bonus text ค้าง" (--json ได้)
python -m http.server 8777                 # dev server แล้วเปิด localhost:8777
```

## Data pipeline (ปกติไม่ต้องแตะ)

การ์ดจาก `https://auth.exburst.dev/rest/v1/ua_cards` (Supabase, anon key ใน tools/scrape-cards.mjs)
→ `tools/scrape-cards.mjs` → `tools/build-data-js.mjs` → `data/cards.js` · รูปใน `assets/cards/` (7,608 ไฟล์)

## งานอื่นที่ค้างในคิว (รองจาก effect)

- Co-Op เชิญเพื่อนเล่นผ่าน WebRTC (ยังไม่เริ่ม — ปุ่มในเมนูขึ้น "เร็วๆ นี้")
