# covid-tool

เครื่องมือให้พยาบาลคุยกับผู้ป่วยผ่าน LINE OA (prototype: มีแค่แชท, เก็บข้อมูลใน localStorage)

## รัน

```bash
cp .env.example .env   # CHANNEL_SECRET ต้องตรงกับของ line-sim
pnpm install
pnpm dev               # http://localhost:3000
```

แล้วรัน line-sim อีกหน้าต่าง (`WEBHOOK_URL=http://localhost:3000/api/line/webhook`):

```bash
cd ../line-sim && pnpm start   # http://localhost:5531
```

เปิด http://localhost:5531 พิมพ์ข้อความเป็นผู้ป่วย → ขึ้นที่ http://localhost:3000 → พิมพ์ตอบ → กลับไปขึ้นที่ sim

## ทำงานยังไง

- `vite.config.ts` มี plugin เล็ก ๆ รับ `POST /api/line/webhook` (เช็ค `x-line-signature`) แล้วส่งต่อให้หน้าเว็บผ่าน SSE ที่ `/api/events`
- หน้าเว็บเรียก LINE API ผ่าน proxy `/line/*` → `LINE_API_BASE`
- ข้อมูลแชททั้งหมดอยู่ใน `localStorage` key `covid-tool.chats`
