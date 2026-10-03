# covid-tool

เครื่องมือให้พยาบาลคุยกับผู้ป่วยผ่าน LINE OA (prototype: มีแค่แชท, เก็บข้อมูลใน localStorage)

## รัน

```bash
cp .env.example .env   # CHANNEL_SECRET ต้องตรงกับของ line-sim
pnpm install
pnpm start             # http://localhost:3000
```

แล้วรัน line-sim อีกหน้าต่าง (`WEBHOOK_URL=http://localhost:3000/api/line/webhook`):

```bash
cd ../line-sim && pnpm start   # http://localhost:5531
```

เปิด http://localhost:5531 พิมพ์ข้อความเป็นผู้ป่วย → ขึ้นที่ http://localhost:3000 → พิมพ์ตอบ → กลับไปขึ้นที่ sim

## สไตล์

ใช้ Tailwind v4 (plugin `@tailwindcss/vite`) เขียน class ตรงใน JSX มี `cn()` ที่ `src/lib/utils.ts` และ alias `@/` → `src/`

## เปลี่ยนไปใช้ shared component (retro-ui)

เมื่อออกแบบเองถึงจุดหนึ่งแล้ว สลับไปใช้ component กลางได้ 3 ขั้น:

1. ติดตั้ง (lib อยู่ข้าง ๆ repo นี้)

   ```bash
   pnpm add "@ai-course/retro-ui@file:../shared-component"
   ```

2. ใน `src/index.css` แทน `@import "tailwindcss";` ด้วย

   ```css
   @import "@ai-course/retro-ui/styles.css";
   @source "../node_modules/@ai-course/retro-ui/dist";
   ```

3. เปลี่ยน element ธรรมดาเป็น component เช่น `<button>` → `<Button>`

   ```tsx
   import { Button, Input, Card } from "@ai-course/retro-ui";
   ```

Component ที่มี: Badge, Button, Card, Checkbox, Dialog, Input, Label, Progress, Select, Switch, Table, Tabs, Textarea, Toast

## ทำงานยังไง

- `vite.config.ts` มี plugin เล็ก ๆ รับ `POST /api/line/webhook` (เช็ค `x-line-signature`) แล้วส่งต่อให้หน้าเว็บผ่าน SSE ที่ `/api/events`
- หน้าเว็บเรียก LINE API ผ่าน proxy `/line/*` → `LINE_API_BASE`
- ข้อมูลแชททั้งหมดอยู่ใน `localStorage` key `covid-tool.chats`
