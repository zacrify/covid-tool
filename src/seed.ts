import { importChats, QUARANTINE_DAYS, DAY_MS } from "./store";
import type { Chat, Gender } from "./types";

// Load public/seed-patients.csv into localStorage. Columns:
// line_id,name,gender,age,district,subdistrict,address,quarantine_from,quarantine_to
// One row per quarantine round; a person may appear more than once. No commas inside fields.
export async function loadSeed(): Promise<number> {
  const text = await (await fetch("/seed-patients.csv")).text();
  const [header, ...lines] = text.trim().split("\n");
  const cols = header.split(",");
  const byId = new Map<string, Chat>();
  for (const line of lines) {
    const row = Object.fromEntries(line.split(",").map((v, i) => [cols[i], v.trim()])) as Record<string, string>;
    const from = new Date(`${row.quarantine_from}T09:00`).getTime();
    const to = row.quarantine_to ? new Date(`${row.quarantine_to}T09:00`).getTime() : from + QUARANTINE_DAYS * DAY_MS;
    const atkId = `atk-seed-${row.line_id}-${row.quarantine_from}`;
    const chat = byId.get(row.line_id) ?? {
      id: row.line_id,
      kind: "user",
      name: row.name.split(" ")[0],
      unread: 0,
      messages: [{ id: `seed-${row.line_id}`, from: "patient", name: row.name.split(" ")[0], type: "text", text: "สวัสดีค่ะ ขอรายงานผลตรวจ", at: from }],
      patient: {
        name: row.name,
        gender: (row.gender || undefined) as Gender | undefined,
        age: row.age ? Number(row.age) : undefined,
        district: row.district,
        subdistrict: row.subdistrict,
        address: row.address,
      },
      atkResults: [],
      quarantines: [],
      notes: [],
    };
    chat.atkResults!.push({ id: atkId, result: "positive", recordedAt: from });
    chat.quarantines!.push({ id: `q-${atkId}`, from, to, atkResultId: atkId });
    byId.set(row.line_id, chat);
  }
  importChats([...byId.values()]);
  return byId.size;
}
