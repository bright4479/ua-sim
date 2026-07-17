# Union Arena — สรุปกติกาจาก Official Rule Manual Ver 1.1 (rule_manual.pdf)

## เด็ค
- เด็คมี **50 ใบพอดี** + **AP card 3 ใบ** (แยกจาก 50)
- ทุกใบต้องมี **source code เดียวกัน** (3 ตัวอักษรใน card no. เช่น MCR)
- การ์ดเลขเดียวกัน (card number) ได้สูงสุด **4 ใบ**
- การ์ด trigger ประเภท **Special / Color / Final** — แต่ละประเภทรวมกันได้ไม่เกิน 4 ใบ

## เตรียมเกม
1. สับเด็ค วางใน Deck Area
2. เลือก Player One / Player Two
3. จั่ว 7 ใบ — mulligan ได้ 1 ครั้ง (เอากลับใต้เด็ค สับ จั่วใหม่ 7 ใบ; P1 ตัดสินใจก่อน)
4. วางการ์ด 7 ใบจากบนเด็คคว่ำหน้าเป็น **Life Area**
5. Player One เริ่มเล่น

## ชนะเกม
- Life ของคู่ต่อสู้หมด (หลัง trigger check เสร็จ)
- คู่ต่อสู้จั่วไม่ได้ตอน Start Phase (เด็คหมด)

## สนาม (ต่อฝั่ง)
- **Front Line** สูงสุด 4 ใบ — เฉพาะ Character
- **Energy Line** สูงสุด 4 ใบ — Character + Site(Field); energy generation นับเฉพาะใบใน Energy Line
- **Life Area** — เริ่ม 7 ใบคว่ำ
- **AP Area** — สูงสุด 3 ใบ
- **Deck / Sideline (หงาย) / Removal Area (หงาย, ออกจากเกมถาวร)**
- ถ้า line เต็ม 4 แล้วจะลง/ย้ายเพิ่ม: ต้องเอาใบใน line นั้นไป **Removal Area** ก่อน (ไม่นับเป็น sidelined)

## สถานะการ์ด
- **Active (ตั้ง)** / **Resting (นอน)**
- Character/Site ลงสนามในสถานะ **Resting**
- เฉพาะ Active character จึงโจมตี/บล็อกได้ (การโจมตี/บล็อกทำให้ Resting)

## ลำดับเทิร์น
### 1. Start Phase
1. effect "จนถึงต้นเทิร์นถัดไป" หมดอายุ
2. การ์ด Resting ทั้งหมด (รวม AP) กลับเป็น Active
3. เติม AP ให้ครบตามตาราง: P1: เทิร์น1=1, เทิร์น2=2, เทิร์น3+=3 | P2: เทิร์น1=2, เทิร์น2=2, เทิร์น3+=3 (วางแบบ Active)
4. จั่ว 1 ใบ (P1 ไม่จั่วเทิร์นแรก)
5. **Extra draw**: จ่าย 1 AP จั่วเพิ่ม 1 ใบ (ครั้งเดียวต่อเทิร์น; P1 ทำได้แม้เทิร์นแรก)

### 2. Movement Phase
- ย้าย character จาก Energy Line → Front Line ได้ไม่จำกัดจำนวน (ย้ายพร้อมกันทั้งหมด)
- ย้ายกลับ Front→Energy ไม่ได้ ยกเว้นมี **Step**
- Site ย้ายไม่ได้
- ปลายทางเต็ม: เอาใบบนปลายทางเข้า Removal ก่อน (Step อาจสลับที่แทนได้)

### 3. Main Phase (ทำกี่ครั้งก็ได้ สลับลำดับได้)
- **A: ใช้การ์ด** — ลง Character (Front/Energy line), Raid, ลง Site (Energy line เท่านั้น), ใช้ Event (ใช้แล้วเข้า Sideline)
  - เงื่อนไข: energy generation รวมสีที่ตรงบน Energy Line ≥ required energy ของการ์ด และจ่าย AP cost (พลิก AP active → resting)
- **B: ใช้ ability [Activate: Main]** ของการ์ดบนสนาม (เงื่อนไขเพิ่ม เช่น Switch to Resting / Pay n AP / Sideline this card / Place n card from hand into sideline — ต้องครบทุกอัน) [Once Per Turn] = ครั้งเดียวต่อเทิร์นต่อสำเนา

#### Raid
- ประกาศ Raid: วางทับ character เป้าหมายที่ระบุ (`<ชื่อ>` / `[affinity]`) ที่ไม่มี Raid
- ต้องมี required energy + จ่าย AP cost ปกติ
- ability ของใบที่ถูกทับหายไป; ถ้าใบที่ถูกทับ Resting → เปลี่ยนเป็น Active
- ถ้าอยู่ Energy Line ย้ายไป Front Line ได้ทันที
- [When Played] ของใบ Raid ทำงาน
- ใบ Raid ออกจากสนาม → เฉพาะใบบนไปปลายทาง ใบที่อยู่ใต้เข้า Sideline (ไม่นับ sidelined)

### 4. Attack Phase
- เลือก Active character บน Front Line ทีละใบ พลิกเป็น Resting เพื่อโจมตี **ผู้เล่น** (หรือ character ฝั่งตรงข้ามบน Front Line ถ้ามี **Snipe** — Snipe บล็อกไม่ได้)
- [When Attacking] ทำงาน → ฝ่ายรับเลือกบล็อกด้วย Active character บน Front Line (พลิก Resting, [When Blocking] ทำงาน)
- **ปะทะ character**: เทียบ BP — ผู้โจมตี BP ≥ ผู้ถูกโจมตี: ผู้ถูกโจมตีเข้า Sideline ([When Sidelined], Impact ฯลฯ) | BP น้อยกว่า: ผู้โจมตีแพ้ (ไม่เข้า Sideline)
- **โจมตีผู้เล่นโดยตรง**: damage 1 (damage② = 2) → ผู้โจมตีเลือกการ์ดใน Life ของฝ่ายรับตามจำนวน damage → ฝ่ายรับหงายเช็ค **Trigger** (เลือกใช้ได้) แล้วการ์ดเข้า Sideline ของเจ้าของ
- โจมตีเสร็จ เลือกโจมตีใบต่อไปได้เรื่อยๆ

### 5. End Phase
1. effect ต้นทาง end phase ทำงาน
2. character/site Resting ทั้งหมดกลับ Active (**AP ที่นอนยังนอนต่อ**)
3. ถือเกิน 8 ใบ → เลือกเก็บ 8 ที่เหลือเข้า **Removal Area**
4. effect "จนจบเทิร์น" หมดอายุ

## Keyword
| Keyword | ผล |
|---|---|
| Step | ย้าย Front → Energy ได้ตอน Movement Phase |
| Snipe | โจมตี character ฝั่งตรงข้ามได้ (active หรือ resting) คู่ต่อสู้บล็อกไม่ได้, [When Blocking] ไม่ทำงาน |
| Double Attack | โจมตีครั้งแรกของเทิร์น → กลับเป็น Active |
| Double Block | บล็อกครั้งแรกของเทิร์น → กลับเป็น Active |
| Impact ① | โจมตีชนะ battle → damage 1 แก่ผู้เล่น (ซ้ำไม่สะสม) |
| Impact +1 | Impact +1 (ถ้าไม่มี Impact ให้เป็น Impact ①) |
| damage② | โจมตีตรงผู้เล่น = 2 damage (หงายเช็ค trigger พร้อมกัน 2 ใบ) |
| damage+1 | damage ตรง +1 |
| Nullify Impact | character ที่ปะทะกับใบนี้เสีย Impact ระหว่าง battle |

## Trigger (เมื่อการ์ด Life ถูกหงาย — เลือกใช้ได้)
- **Draw**: จั่ว 1 ใบ
- **Get**: เก็บใบนี้เข้ามือ
- **Active**: ตั้ง character ของเรา 1 ใบ + ให้ +3000 BP ถึงจบเทิร์น
- **Raid**: เก็บเข้ามือ หรือ Raid ทันทีถ้า energy พอ (ไม่ต้องจ่าย AP)
- **Color**: effect ตามที่เขียนบนการ์ด (ต่างกันเป็นรายใบ)
- **Special**: retire character บน Front Line ฝั่งตรงข้าม 1 ใบ
- **Final**: ถ้า Life เหลือ 0 — วางการ์ดบนสุดของเด็คเป็น Life 1 ใบ

## Timing / อื่นๆ
- [When Played] ทำงานเมื่อลงสนาม รวมถึงถูก "play" โดย effect หรือ Raid จาก trigger
- ability พร้อมกันหลายอัน: เจ้าของเทิร์น resolve ของตัวเองก่อนทั้งหมด แล้วค่อยฝ่ายตรงข้าม, ลำดับตามใจผู้ควบคุม
- BP ≤ 0 จาก ability → เข้า Sideline
- `{A} ... {B} instead` = phrase substitution: ถ้าเงื่อนไขครบ ใช้ข้อความ B แทน A
- `<ABC>` = การ์ดชื่อ ABC, `[XYZ]` = affinity XYZ
