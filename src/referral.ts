import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import type { Chat } from "./types";

const dateTime = (t: number) =>
  new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Everything the AI needs, as plain text, newest last so the story reads in order
export function buildSummaryPrompt(chat: Chat): string {
  const atk = [...(chat.atkResults ?? [])].sort((a, b) => a.recordedAt - b.recordedAt);
  const notes = [...(chat.notes ?? [])].sort((a, b) => a.at - b.at);
  const p = chat.patient;
  return [
    "คุณเป็นพยาบาลที่กำลังเขียนสรุปอาการผู้ป่วย COVID-19 เพื่อแนบในใบส่งตัวไปโรงพยาบาล",
    "สรุปเป็นภาษาไทย ย่อหน้าเดียว ไม่เกิน 6 ประโยค ใช้ภาษาทางการ ไม่ต้องขึ้นต้นด้วยคำทักทาย",
    "ครอบคลุม: ผลตรวจ ATK และวันที่, ลำดับอาการตามเวลา, แนวโน้ม (ดีขึ้น/แย่ลง), และเหตุผลที่ควรส่งต่อ",
    "ห้ามแต่งข้อมูลที่ไม่มีในบันทึก ถ้าไม่มีบันทึกอาการให้ระบุว่าไม่มีบันทึก",
    "",
    `ผู้ป่วย: ${p?.name || chat.name}${p?.gender ? ` เพศ ${p.gender}` : ""}${p?.age != null ? ` อายุ ${p.age} ปี` : ""}`,
    "",
    "ผลตรวจ ATK:",
    ...(atk.length ? atk.map((r) => `- ${dateTime(r.recordedAt)}: ${r.result === "positive" ? "พบเชื้อ" : "ไม่พบเชื้อ"}`) : ["- ไม่มี"]),
    "",
    "บันทึกอาการโดยพยาบาล:",
    ...(notes.length ? notes.map((n) => `- ${dateTime(n.at)}: ${n.text}`) : ["- ไม่มี"]),
  ].join("\n");
}

export async function summarize(prompt: string): Promise<string> {
  const r = await fetch("/api/ai/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!r.ok) throw new Error(`AI summary failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { text: string }).text.trim();
}

// Render the letter element to an image and lay it out on A4 pages
export async function elementToPdf(el: HTMLElement): Promise<Blob> {
  // JPEG keeps the file small (a PNG of a full A4 page is ~10 MB)
  const img = await toJpeg(el, { pixelRatio: 2, quality: 0.85, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (el.offsetHeight / el.offsetWidth) * pageW;
  for (let y = 0; y < imgH; y += pageH) {
    if (y > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, -y, pageW, imgH);
  }
  return pdf.output("blob");
}

// Hand the file to the vite dev server; returns a URL the chat and line-sim can open
export async function uploadFile(blob: Blob): Promise<string> {
  const r = await fetch("/api/files", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  return ((await r.json()) as { url: string }).url;
}
