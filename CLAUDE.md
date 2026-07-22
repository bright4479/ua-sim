# UA SIM — Union Arena Simulator

Fan-made web simulator สำหรับเกมการ์ด UNION ARENA — vanilla HTML/CSS/JS ไม่มี build step
เล่นจริง: **https://bright4479.github.io/ua-sim/** (deploy อัตโนมัติเมื่อ push ขึ้น `main`)
คุยกับผู้ใช้เป็น**ภาษาไทย** (UI ของเกมก็เป็นภาษาไทย)

## เป้าหมายปัจจุบัน (งานต่อเนื่องหลาย session)

**ทำให้ effect ของการ์ดใช้งานได้จริงทุกใบ ทุก series รวมถึง Raid boss**
ลำดับที่ตกลงกับผู้ใช้: จับการ์ดที่มี pattern คล้ายกันก่อน (generic) → แล้วค่อยไล่ effect เฉพาะตัว/Raid boss ทีละใบ

สถานะล่าสุด (2026-07-22): การ์ดที่มี effect text 6,264 ใบ มี automatic handling แล้ว **~77.0%** (วัดด้วย `node tools/coverage-total.mjs` — มี ranking series ที่แย่สุดให้เลือกทำต่อ; ใช้ `node tools/coverage-report-full.mjs` เพื่อดูตารางทั้ง 55 series + "bonus text ค้าง" ของ Raid boss ด้วย)
- MCR: 137/178 · EVA: ~65/108 · **HTR: 175/179 (98%)** · **ARK: 168/174 (97%)** · **CGH: 168/169 (99%)** · **AND: 69/72 (96%)** · **SLG: 74/75 (99%)** · **JJK: 176/179 (98%)** · **BLC: 171/173 (99%)** · **TSK: 163/168 (97%)** · **KMY: 174/184 (95%)** · **KGR: 74/78 (95%)** · **SMD: 70/77 (91%)** · **GMR: 73/75 (97%)** · **BLK: 112/113 (99%)** · **KMR: 187/202 (93%)**
- **งานเรียงตาม series ที่แย่สุดก่อน** (ผู้ใช้สั่ง "/goal" ให้ทำต่อเนื่องจนกว่าจะจบ) — ทำ HTR→ARK→CGH→AND→SLG→JJK→BLC→TSK→KMY→KGR→SMD→GMR→BLK→KMR แล้ว ถัดไป: **OPM (61%)** ตามด้วย KIN/YYH/HIQ — ดูจาก `coverage-total.mjs` ranking สดทุกครั้ง (อย่าพึ่งลิสต์เก่าใน CLAUDE.md เพราะเปลี่ยนทุกรอบ)
- **บทเรียนสำคัญที่ยืนยันซ้ำแล้วซ้ำอีกทุก series**: ก่อน script รายใบ ให้ตรวจสอบก่อนเสมอว่าการ์ดที่ "uncovered" อยู่นั้น จริงๆ แล้วแค่ regex ใน common.js/engine.js ไม่ทนต่อ wording variant เล็กๆ (เว้นวรรคเกิน, "a/an" หาย, ลำดับคำสลับ, ตัวสะกดผิด) หรือเปล่า — ทุก series ที่ทำมาเจอแบบนี้ 30-50% ของรายการเสมอ แก้ regex ทีเดียวได้ coverage เพิ่มโดยไม่ต้อง script อะไรเลย เร็วกว่า script รายใบมาก
- มีชั้น normalizeFx ใน common.js แปลงสำนวนแปลทุกแบบ (series ใหม่สะกดเลขเป็นคำ/"until the end of the turn"/"for the turn"/เลข gen หลุดติดหน้าข้อความ, series เก่าอย่าง HTR แปลหยาบ) ให้ matcher ชุดเดียวใช้ได้หมด
- generic ครอบคลุมแล้ว: on-play **และ on-event ใช้ matcher ชุดเดียวกันแล้ว** (draw/draw+discard/scry/look-at-top-N-fetch/scry-discard-to-top/buff/debuff/rest/retire-conditional/bounce/cond-draw/free-play-from-hand/discard-fetch/fetch-outside — ก่อนหน้านี้ event การ์ดใช้ matcher แยกที่แคบกว่ามาก แก้แล้วรอบ CGH ได้ coverage เพิ่มทันที ~120 ใบทั้งฐานข้อมูลโดยไม่ต้อง script อะไรเลย), passive BP (Your Turn/Opponent's Turn/name/trait/hand-count/"if you have" แบบ singular — `Effects.genericBpBonus` + cache), aura BP hook (`auraBp`, การ์ดหนึ่งให้บวก BP การ์ดอื่นบนสนามเดียวกัน), passive front-line energy generation (`Effects.genericFrontGen` + `kw.frontGen` + per-card `frontGenBonus` hook), untargetable keyword, skip-next-stand mechanic (`unit.skipNextStand`, พบ 63 ใบทั้งฐานข้อมูล), temp unblockable-BP grants (`tempUnblockableBP`/`tempUnblockableBPMin`), hand-based cost-discount coverage-measurement fix (`Engine.hasTextCostDiscount`, รวม "energy consumption -N" แบบไม่มีคำว่า reduce...by ด้วยแล้ว), เมื่อโจมตี (draw+discard/buff), [Main] (selfGenRetire/restBuffOther/discardImpact/restScryTopBottom/payApDraw/restDebuffEnemy), [On Retire] draw(+discard)/rest-enemy/buff-other, keyword ครบ
- Raid boss ตัวใหญ่ (effect หลายชั้น/มี tier) ส่วนใหญ่ยังไม่ได้ script — keyword พื้นฐานทำงาน แต่ bonus text ยังไม่ (ดู `coverage-report-full.mjs` คอลัมน์ "เหลือ script")
- **engine hook รอบ SLG/AND/CGH (เก่า, สรุปย่อ)**: `onAnyAttack`, `unit.tempUntargetable`/`_grantedAttackDraw`, `unit.effectsNullified`, `kw.unblockableBPMin`, `onDefenderWinBattle`, `H.unraidTopLayer`, `p._playedApCostsThisTurn`/`_eventsUsedThisTurn`, `unit.enteredTurn`, `findSeg()` (เชื่อม on-event เข้ากับ on-play matcher — ผลกระทบสูงสุดตอนนั้น)
- **engine hook รอบ ARK/HTR**: `unit.skipNextStand`/`noRetire`/`tempSnipe`/`_playedByEffect`, `auraBp`, `H.lookTopAndDiscard`, `onBeforeLeaveCounters`, `unit._watchers[]`, `onAnyWinBattle`/`onAnyLoseBattle`, `retireAtEndOfTurn`/`noBlock`/`_grantedOnWinDraw`, `_playedTraitsThisTurn`, `onBlock(atkUnit)`
- **engine hook รอบ BLC**: `Engine.scheduleDelayedAction(turn, fn)` (คิวเอฟเฟกต์แบบ "at the start of your opponent's next turn, ..." เช็คใน `startPhase` ทุกเทิร์น), `p._placedToOutsideThisTurn` (นับจำนวนครั้งที่ส่งการ์ดไป Outside Area เทิร์นนี้ — เพิ่ม generic bpEvaluator clause "if you placed a card...to the Outside Area during this turn, +N BP" ด้วย), generic pattern ใหม่: `matchAttackSelfBuff` ("[When Attacking] This character gets +N BP" แบบไม่มีเลือกเป้าหมาย), `matchPlainMillOutside` ("Place N cards from top of deck to Outside Area" แบบไม่มีเงื่อนไข ใช้ได้ทั้ง onPlay/onSideline)
- **engine hook รอบ TSK**: `kw.cannotBlock`/`kw.cannotAttack` (permanent keyword — `cannotAttack` ต้อง filter ออกจาก bot.js's `chooseAttacker` candidate list ด้วย ไม่งั้น bot จะเลือกซ้ำจนวนลูปไม่รู้จบ เพราะ engine แค่ `continue` ข้ามโดยไม่ rest ยูนิต), `Engine.textApDelta` รองรับเงื่อนไขแบบ trait-count แล้ว (ไม่ใช่แค่ named-condition), coverage tool ทั้ง 3 ตัว + scratchpad dump script เพิ่ม `addNamedAlly()` (สร้างพันธมิตรชื่อเดียวกับ `<NAME>` ที่การ์ดอ้างถึงบนกระดานสังเคราะห์ ลดการรายงาน "uncovered" ผิดพลาดจากเงื่อนไข "if there is a &lt;NAME&gt; on your area")
- **engine hook รอบ KMY**: `unit._movedThisTurn` (ติดตามว่า unit นี้ย้าย line เทิร์นนี้หรือไม่ — เซ็ตทั้งใน `moveUnitFree` และ Movement Phase ของ turn loop เอง, reset ทุก `startPhase`), generic bpEvaluator/genEvaluator/AP-discount รองรับเงื่อนไขผสม "`<NAME>` and/or other `<Trait:X>`" แล้ว (ธีม Hashira-synergy ของ series นี้ — `countNameOrTrait()` helper ใหม่ใน common.js), แก้ normalizeFx ให้สลับลำดับคำ "BP+N" เป็น "+N BP" (series นี้สะกดสลับที่บ่อยมาก), ขยาย `mainRestBuffOther`/`onplayBuffOther` ให้รองรับ "another character"/"give it"/"on your field" และ onAttack draw+discard ให้รองรับ "and" เป็นตัวเชื่อมประโยค
- **engine hook รอบ KGR**: `Engine.payApForEffect(p, n)` (จ่าย AP ผ่าน "ability cost" โดยเฉพาะ — ต่างจากจ่าย AP ตอนเล่นการ์ดปกติ — เพิ่ม `p._paidApByEffectThisTurn` counter คู่กัน สำหรับการ์ดที่เช็ค "if you have paid an AP by your character's effect during this turn" ซึ่งพบ 5 ใบใน series นี้), bpEvaluator รองรับเงื่อนไข "if your opponent's Life is N or less, +M BP" แล้ว, แก้ `matchScryDiscardTop` ให้รองรับจุด/comma ทั้งสองตำแหน่ง (ก่อน "Place up to" และหลัง "Outside Area") — เจอบั๊กจากการเดา separator ผิดตำแหน่งเดียวทำให้ 2 ใบไม่ match ทั้งที่ widen มาแล้วรอบก่อน (บทเรียน: debug ด้วย node -e ทดสอบ regex ทีละส่วนเร็วกว่าเดา)
- **engine hook รอบ SMD**: `p.extraDrawUsed` (มีอยู่แล้วจากกติกา extra-draw ปกติ — เพิ่ม `Effects.hasFreeExtraDraw(p)` ให้การ์ด registry ประกาศ `freeExtraDraw: true` แล้วทำให้ Start Phase ข้ามการจ่าย AP ให้), `G._triggerActivatedThisTurn` (มีการ์ดเช็คว่าฝ่ายใดฝ่ายหนึ่งเปิด Trigger ในเทิร์นนี้หรือไม่), `unit.tempRaidable` (การ์ดที่ปกติไม่มี [Raid] ได้รับอนุญาตให้ถูก raid ทับได้ชั่วคราว — เช็คใน `raidTargetsFor`), `kw.unblockableByRaided` (static "cannot be blocked by characters in raided state"), `p._blockEnergyToFrontNextMove` (บล็อกฝ่ายตรงข้ามย้าย Energy→Front ใน Move Phase ถัดไปของเขา) — **พบ mechanic ใหม่ที่ตัดสินใจ skip ทั้ง series**: "face-up card ใน deck/Life" (Sakamoto Days เฉพาะตัว ต้องมี persistent overlay state ใหม่ที่กระทบ UI ด้วย ไม่คุ้มสำหรับ 3-4 ใบ), "activate การ์ดอื่นเปิด Trigger ของตัวเอง" (ต้อง export `resolveTrigger` ออกจาก engine)
- **engine hook รอบ GMR**: `p._dealtDamageThisTurn` (เช็คว่า player นี้สร้างความเสียหายให้ฝ่ายตรงข้ามในเทิร์นนี้หรือไม่ — เซ็ตใน `dealDamage()`) ใช้กับ "if a character on your area dealt damage to your opponent this turn" — series นี้ยังพบ gap เดิมซ้ำ 2 แบบที่เจอมาตลอด: "unblocked attack" detection (onAttack ยิงก่อน block resolve เสมอ) และ "post-attack-resolution" hook ที่ยังไม่มี
- **BLK (Blue Lock) — ไม่มี engine hook ใหม่**: ธีมหลักคือ "face-down card ใต้ character" ซึ่งใช้ `unit.counters` convention เดิมที่มีอยู่แล้ว (เหมือน BLC/TSK/KGR) — เขียน local helper 3 ตัวใน `blk.js` เอง (ไม่ยกเป็น common.js เพราะ wording เฉพาะ series นี้): `hasAnyFaceDown/faceDownHolders/noFaceDownTargets` + `plantUnderSelf`/`moveFaceDown` — ทำได้ 112/113 (99%) เหลือ skip แค่ 1 ใบ (live conditional untargetable เฉพาะ Event-targeting เท่านั้น ไม่คุ้มจะทำเพราะ helper เดิมเป็น all-or-nothing)
- **KMR (Kamen Rider) — series ใหญ่ที่สุดและ effect ซับซ้อนที่สุดที่เจอมา** (202 ใบ, ยอมรับ skip มากกว่าปกติสำหรับการ์ด multi-clause แบบ raid-chain/tier-based-grant ที่ต้องสร้าง infra ใหม่เพื่อการ์ดเดียว) ได้ 187/202 (93%) เพิ่ม `p._revealedNonYellowRaidThisTurn` (เซ็ตใน `H.lookTopAndTake` — ใช้กับการ์ดที่เช็คว่า reveal-แล้วเพิ่มการ์ด non-yellow [Raid] เข้ามือเทิร์นนี้หรือไม่), ขยาย unconditional-BP-modifier regex ให้รองรับเครื่องหมายลบ (`-1500 BP`), ขยาย `kw.entersActive` ให้รองรับ "This X is played as active" (อีกสำนวนหนึ่ง), เพิ่ม local helper `placeSameNeedCost()` ใน `kmr.js` (cost แบบ "ส่งการ์ด Energy เท่ากัน 3 ใบจากมือไป Outside Area" เฉพาะ OOO Combo cards), นำ `unit.counters` มาใช้แบบใหม่สำหรับ Ex-Aid line: "ฝัง" character ทั้งใบ (ไม่ใช่แค่การ์ดคว่ำ) ไว้ใต้ character อื่น

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
| `js/effects/mcr.js`, `eva.js`, `htr.js`, `ark.js`, `cgh.js`, `and.js`, `slg.js`, `jjk.js`, `blc.js`, `tsk.js`, `kmy.js`, `kgr.js`, `smd.js`, `gmr.js`, `blk.js`, `kmr.js` | script รายใบ (registry per cardNo — override generic เสมอ) |
| `js/game/bot.js` | bot AI + `buildBotDeck(series)` |
| `js/game/ui.js` | กระดาน 3D + human controller (modal prompts) |
| `js/deckbuilder.js`, `js/app.js` | deck builder + เมนู |
| `data/cards.js` | การ์ดทั้งหมด 10,473 ใบ (generated — อย่าแก้มือ) |
| `docs/rules-summary.md` | สรุปกติกาจาก Official Rule Manual v1.1 |

Effect hooks ที่มีให้ใช้ (ลง `Effects.registry[cardNo]`): `onPlay onAttack onBlock(atkUnit) onEvent onMain onLeaveField onSideline(reason) onTurnStart onRaided onColorTrigger onWinBattle onDefenderWinBattle(atkP,atkUnit) onAnyWinBattle onAnyLoseBattle onAnyAttack(atkUnit,selfUnit) onBeforeLeaveCounters(reason)` (async) + `bpBonus impactBonus genMod costMod frontGenBonus auraBp(owner,srcUnit,tgtUnit)` (sync, คำนวณสด — `auraBp` ห้ามเรียก `Engine.bp()` ซ้ำ จะ recursion)
Unit state: `bpMod` (หมดเทิร์น) `bpPersist` (ถึงต้นเทิร์นหน้า) `tempImpact tempDmg tempGen tempFrontGen frontGenPersist counters retireAtEndOfMain retireAtEndOfTurn noBlock skipNextStand noRetire tempSnipe tempUnblockableBP tempUnblockableBPMin tempUntargetable effectsNullified enteredTurn _grantedOnWinDraw _grantedAttackDraw _playedByEffect _watchers[] _movedThisTurn tempRaidable`
Player state: `p._playedTraitsThisTurn` (Set ของ trait ตัวพิมพ์เล็กที่เล่นจากมือเทิร์นนี้), `p._drewThisTurn` `p._getPlayedThisTurn` `p.extraDrawUsed` `p._blockEnergyToFrontNextMove`
Engine helpers: `sidelineUnit returnUnitToHand moveUnitFree playCardFromZone checkBpZero draw log payAP hasTextCostDiscount opponentOf bp parseKeywords activeAP hasEnergyFor scheduleDelayedAction payApForEffect`
Keyword flags (จาก `parseKeywords`, ถาวรไม่รีเซ็ตรายเทิร์น): `step snipe doubleAttack doubleBlock nullifyImpact impact dmg raidTargets entersActive entersActiveIf unblockableBP unblockableBPMin alsoTreatedAs frontGen untargetable cannotBlock cannotAttack unblockableByRaided`

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
