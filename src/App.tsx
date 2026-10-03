import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pushText } from "./line";
import { addAtkResult, addMessage, addNote, clearAll, markRead, setPatient, useChats } from "./store";
import type { AtkResult, Chat, Gender, Message, Patient, SymptomNote } from "./types";
import { listenWebhook } from "./webhook";

const time = (t: number) => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const QUARANTINE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Days of quarantine left, counted from the latest positive ATK result.
// null = never had a positive result. 0 = finished quarantine (stays 0 until the next positive result).
function quarantineDaysLeft(chat: Chat, now: number): number | null {
  const positive = (chat.atkResults ?? []).filter((r) => r.result === "positive");
  if (positive.length === 0) return null;
  const start = Math.max(...positive.map((r) => r.recordedAt));
  const left = Math.ceil((start + QUARANTINE_DAYS * DAY_MS - now) / DAY_MS);
  return Math.max(0, left);
}

const dateTime = (t: number) =>
  new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function App() {
  const chats = useChats();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = chats.find((c) => c.id === selectedId) ?? null;
  // patient photo the nurse picked from the chat to attach to a new ATK result
  const [atkDraft, setAtkDraft] = useState<AtkDraft | null>(null);
  const [view, setView] = useState<"chat" | "notes">("chat");
  // prototype only: let the nurse pretend it is another day to test the quarantine countdown
  const [testDate, setTestDate] = useState<string | null>(null);
  const realNow = useNow();
  const now = testDate ? new Date(`${testDate}T12:00`).getTime() : realNow;

  useEffect(listenWebhook, []);
  useEffect(() => {
    setAtkDraft(null);
    setView("chat");
  }, [selectedId]);
  useEffect(() => {
    if (selectedId) markRead(selectedId);
  }, [selectedId, selected?.messages.length]);

  return (
    <div className="grid h-screen grid-cols-[300px_minmax(360px,1fr)_320px] bg-gray-100 text-gray-800">
      <aside className="flex flex-col overflow-y-auto border-r border-gray-200 bg-white">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5">
          <h1 className="text-base font-semibold">COVID LINE OA</h1>
          <button
            className="rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-500 hover:bg-gray-50"
            onClick={() => confirm("ล้างแชททั้งหมด?") && clearAll()}
          >
            ล้าง
          </button>
        </header>
        {chats.length === 0 && <p className="m-auto p-4 text-center text-gray-400">ยังไม่มีแชท ส่งข้อความจาก LINE simulator ก่อน</p>}
        {chats.map((c) => (
          <button
            key={c.id}
            className={cn(
              "flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50",
              c.id === selectedId && "bg-emerald-50",
            )}
            onClick={() => setSelectedId(c.id)}
          >
            <span className="text-2xl">{c.kind === "group" ? "👥" : "🧑"}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{c.patient?.name || c.name}</span>
              <span className="truncate text-sm text-gray-500">{preview(c.messages.at(-1))}</span>
            </span>
            <QuarantineChip daysLeft={quarantineDaysLeft(c, now)} />
            {c.unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{c.unread}</span>}
          </button>
        ))}
      </aside>
      {selected && view === "notes" ? (
        <NotesPage chat={selected} now={now} onBack={() => setView("chat")} />
      ) : (
        <>
          <main className="flex h-screen flex-col">
            {selected ? (
              <ChatPanel chat={selected} onUseAsAtk={setAtkDraft} />
            ) : (
              <p className="m-auto p-4 text-center text-gray-400">เลือกแชทจากด้านซ้าย</p>
            )}
          </main>
          {selected ? (
            <aside className="flex flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-4">
              <AtkPanel chat={selected} now={now} draft={atkDraft} onDraftUsed={() => setAtkDraft(null)} />
              <NotesSection chat={selected} now={now} onSeeAll={() => setView("notes")} />
            </aside>
          ) : (
            <aside className="border-l border-gray-200 bg-white" />
          )}
        </>
      )}
      <DateControl value={testDate} onChange={setTestDate} />
    </div>
  );
}

function preview(m?: Message) {
  if (!m) return "";
  const body = m.type === "text" ? m.text : m.type === "image" ? "📷 รูปภาพ" : `📎 ${m.fileName}`;
  return `${m.from === "nurse" ? "คุณ: " : ""}${body}`;
}

type AtkDraft = { messageId: string; imageUrl: string };

function ChatPanel({ chat, onUseAsAtk }: { chat: Chat; onUseAsAtk: (d: AtkDraft) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await pushText(chat.id, body);
      addMessage(chat, { id: `nurse-${Date.now()}`, from: "nurse", name: "พยาบาล", type: "text", text: body, at: Date.now() });
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <strong>{chat.patient?.name || chat.name}</strong>
            <small className="truncate text-gray-400">
              {chat.kind === "group" ? "กลุ่ม" : "แชทเดี่ยว"} · LINE: {chat.name} · {chat.id}
            </small>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-500 hover:bg-gray-50"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "ปิด" : chat.patient ? "แก้ไขข้อมูลผู้ป่วย" : "เพิ่มข้อมูลผู้ป่วย"}
          </button>
        </div>
        {!editing && chat.patient && <PatientSummary patient={chat.patient} />}
        {editing && <PatientForm chat={chat} onDone={() => setEditing(false)} />}
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
        {chat.messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex max-w-[65%] flex-col gap-1 rounded-2xl px-3 py-2 shadow-sm wrap-break-word whitespace-pre-wrap",
              m.from === "nurse" ? "self-end rounded-br-sm bg-[#06c755] text-white" : "self-start rounded-bl-sm bg-white",
            )}
          >
            {chat.kind === "group" && m.from === "patient" && <span className="text-xs text-gray-500">{m.name}</span>}
            {m.type === "text" && <span>{m.text}</span>}
            {m.type === "image" && <img className="max-w-[260px] rounded-lg" src={m.contentUrl} alt="รูปจากผู้ป่วย" />}
            {m.type === "image" && m.from === "patient" && m.contentUrl && (
              <AtkEvidenceButton used={isAtkEvidence(chat, m.id)} onClick={() => onUseAsAtk({ messageId: m.id, imageUrl: m.contentUrl! })} />
            )}
            {m.type === "file" && (
              <a className="underline" href={m.contentUrl} target="_blank" rel="noreferrer">
                📎 {m.fileName}
              </a>
            )}
            <time className="self-end text-[11px] opacity-60">{time(m.at)}</time>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t border-gray-200 bg-white px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-full border border-gray-300 px-3.5 py-2.5 outline-none focus:border-[#06c755]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความถึงผู้ป่วย…"
          autoFocus
        />
        <button
          className="rounded-full bg-[#06c755] px-5 py-2.5 font-semibold text-white disabled:cursor-default disabled:opacity-50"
          disabled={sending || !text.trim()}
        >
          ส่ง
        </button>
      </form>
      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}
    </>
  );
}

const GENDER_LABEL: Record<Gender, string> = { male: "ชาย", female: "หญิง", other: "อื่น ๆ" };

function PatientSummary({ patient }: { patient: Patient }) {
  const parts = [
    patient.gender && GENDER_LABEL[patient.gender],
    patient.age != null && `${patient.age} ปี`,
    patient.address && `ที่อยู่: ${patient.address}`,
  ].filter(Boolean);
  return <p className="text-sm text-gray-600">{parts.join(" · ") || "ยังไม่มีรายละเอียด"}</p>;
}

const field = "mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-[#06c755]";
const ghost = "rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50";

function PatientForm({ chat, onDone }: { chat: Chat; onDone: () => void }) {
  const p = chat.patient;
  const [name, setName] = useState(p?.name ?? chat.name);
  const [gender, setGender] = useState<Gender | "">(p?.gender ?? "");
  const [age, setAge] = useState(p?.age != null ? String(p.age) : "");
  const [address, setAddress] = useState(p?.address ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const ageNum = age.trim() === "" ? undefined : Number(age);
    setPatient(chat.id, {
      name: name.trim() || chat.name,
      gender: gender || undefined,
      age: ageNum != null && Number.isFinite(ageNum) ? ageNum : undefined,
      address: address.trim(),
    });
    onDone();
  }

  return (
    <form className="grid grid-cols-[2fr_1fr_1fr] gap-x-3 gap-y-2 rounded-lg bg-gray-50 p-3" onSubmit={save}>
      <label className="text-xs text-gray-500">
        ชื่อ-นามสกุล
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อผู้ป่วย" autoFocus />
      </label>
      <label className="text-xs text-gray-500">
        เพศ
        <select className={field} value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
          <option value="">ไม่ระบุ</option>
          <option value="male">ชาย</option>
          <option value="female">หญิง</option>
          <option value="other">อื่น ๆ</option>
        </select>
      </label>
      <label className="text-xs text-gray-500">
        อายุ
        <input className={field} type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} placeholder="ปี" />
      </label>
      <label className="col-span-3 text-xs text-gray-500">
        ที่อยู่
        <textarea className={field} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด" />
      </label>
      <div className="col-span-3 flex justify-end gap-2">
        {p && (
          <button type="button" className={cn(ghost, "mr-auto text-red-600")} onClick={() => confirm("ลบข้อมูลผู้ป่วย?") && (setPatient(chat.id, undefined), onDone())}>
            ลบข้อมูล
          </button>
        )}
        <button type="button" className={ghost} onClick={onDone}>
          ยกเลิก
        </button>
        <button type="submit" className="rounded-md bg-[#06c755] px-4 py-1.5 text-sm font-semibold text-white">
          บันทึก
        </button>
      </div>
    </form>
  );
}

const isAtkEvidence = (chat: Chat, messageId: string) => (chat.atkResults ?? []).some((r) => r.sourceMessageId === messageId);

function AtkEvidenceButton({ used, onClick }: { used: boolean; onClick: () => void }) {
  if (used) return <span className="text-xs text-emerald-700">🧪 ใช้เป็นหลักฐาน ATK แล้ว</span>;
  return (
    <button type="button" className="self-start rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50" onClick={onClick}>
      🧪 ใช้เป็นหลักฐาน ATK
    </button>
  );
}

function AtkPanel({ chat, now, draft, onDraftUsed }: { chat: Chat; now: number; draft: AtkDraft | null; onDraftUsed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<AtkResult["result"]>("negative");
  const [recordedAt, setRecordedAt] = useState(toDateTimeInput(now));
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [imageError, setImageError] = useState<string | null>(null);
  const [sourceMessageId, setSourceMessageId] = useState<string | undefined>();
  const results = chat.atkResults ?? [];

  // nurse clicked "use as ATK evidence" on a patient photo: open the form with it attached
  useEffect(() => {
    if (!draft) return;
    setImageUrl(draft.imageUrl);
    setImageName("รูปจากแชท");
    setSourceMessageId(draft.messageId);
    setImageError(null);
    setEditing(true);
  }, [draft]);

  function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setImageError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
    if (file.size > 2 * 1024 * 1024) return setImageError("รูปต้องมีขนาดไม่เกิน 2 MB");
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(String(reader.result));
      setImageName(file.name);
      setSourceMessageId(undefined);
      setImageError(null);
    };
    reader.onerror = () => setImageError("อ่านไฟล์รูปไม่สำเร็จ กรุณาลองใหม่");
    reader.readAsDataURL(file);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const timestamp = new Date(recordedAt).getTime();
    if (!Number.isFinite(timestamp)) return;
    addAtkResult(chat.id, { id: `atk-${Date.now()}`, result, recordedAt: timestamp, imageUrl, imageName, sourceMessageId });
    reset();
  }

  function reset() {
    setEditing(false);
    setRecordedAt(toDateTimeInput(now));
    setImageUrl(undefined);
    setImageName(undefined);
    setSourceMessageId(undefined);
    setImageError(null);
    onDraftUsed();
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">ข้อมูลสุขภาพ</span>
          <h2 className="text-base font-semibold">ผลตรวจ ATK</h2>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-600">{results.length}</span>
      </header>

      <button
        type="button"
        className={cn(
          "rounded-md border px-3 py-2 text-sm font-semibold",
          editing ? "border-gray-300 text-gray-500 hover:bg-gray-50" : "border-[#06c755] bg-[#06c755] text-white",
        )}
        onClick={() => (editing ? reset() : setEditing(true))}
      >
        {editing ? "ปิดฟอร์ม" : "+ บันทึกผล ATK"}
      </button>

      {editing && (
        <form className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3" onSubmit={save}>
          <label className="text-xs text-gray-500">
            ผลตรวจ
            <select className={field} value={result} onChange={(e) => setResult(e.target.value as AtkResult["result"])}>
              <option value="negative">ไม่พบเชื้อ</option>
              <option value="positive">พบเชื้อ</option>
            </select>
          </label>
          <label className="text-xs text-gray-500">
            วันและเวลาตรวจ
            <input className={field} type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} required />
          </label>
          <label className="text-xs text-gray-500">
            รูปผลตรวจ (ถ้ามี)
            <input className="mt-1 block w-full text-sm" type="file" accept="image/*" onChange={(e) => selectImage(e.target.files?.[0])} />
          </label>
          {imageUrl && <img className="max-h-40 rounded-md border border-gray-200 object-contain" src={imageUrl} alt="ตัวอย่างรูปผลตรวจ ATK" />}
          {sourceMessageId && <span className="text-xs text-emerald-700">📎 รูปจากแชทของผู้ป่วย</span>}
          {imageError && <span className="text-xs text-red-600">{imageError}</span>}
          <button type="submit" className="rounded-md bg-[#06c755] px-4 py-1.5 text-sm font-semibold text-white">
            บันทึกผลตรวจ
          </button>
        </form>
      )}

      {results.length === 0 ? (
        <div className="m-auto flex flex-col items-center gap-1 text-center text-gray-400">
          <span className="text-3xl">🧪</span>
          <strong className="text-gray-500">ยังไม่มีผลตรวจ</strong>
          <small>บันทึกผล ATK ของผู้ป่วยได้ที่นี่</small>
        </div>
      ) : (
        results.map((item) => (
          <article key={item.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
            {item.imageUrl && (
              <img className="max-h-40 rounded-md object-contain" src={item.imageUrl} alt={`รูปผลตรวจ ATK${item.imageName ? ` ${item.imageName}` : ""}`} />
            )}
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5",
                item.result === "negative" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              <span className="text-lg font-bold">{item.result === "negative" ? "✓" : "!"}</span>
              <div className="flex flex-col leading-tight">
                <small className="text-xs opacity-70">ผลตรวจ</small>
                <strong>{item.result === "negative" ? "ไม่พบเชื้อ" : "พบเชื้อ"}</strong>
              </div>
            </div>
            {item.sourceMessageId && <small className="text-xs text-gray-500">📎 รูปจากแชทของผู้ป่วย</small>}
            <div className="flex items-center gap-2 text-gray-500">
              <span>◷</span>
              <div className="flex flex-col leading-tight">
                <small className="text-xs">บันทึกเมื่อ</small>
                <time className="text-sm text-gray-700">{dateTime(item.recordedAt)} น.</time>
              </div>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

// re-render once a minute so the quarantine countdown stays current
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function QuarantineChip({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft == null) return null;
  const done = daysLeft === 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
        done ? "bg-gray-200 text-gray-600" : "bg-amber-100 text-amber-800",
      )}
      title={done ? "กักตัวครบแล้ว รอผล ATK บวกครั้งถัดไปจึงเริ่มรอบใหม่" : "นับจากผล ATK บวกล่าสุด"}
    >
      {done ? "✓" : "🏠"} {daysLeft} วัน
    </span>
  );
}

// Floating "droplet" at the bottom-right: pick a fake "today" to test date-based UI
function DateControl({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const today = toDateTimeInput(Date.now()).slice(0, 10);
  return (
    <div className="fixed right-5 bottom-5 flex flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <span className="text-xs text-gray-500">วันนี้คือวันที่ (สำหรับทดสอบ)</span>
          <input className={field} type="date" value={value ?? today} onChange={(e) => onChange(e.target.value || null)} autoFocus />
          <button type="button" className={ghost} onClick={() => onChange(null)} disabled={!value}>
            กลับเป็นวันจริง
          </button>
        </div>
      )}
      <button
        type="button"
        title="เปลี่ยนวันที่สำหรับทดสอบ"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-lg",
          value ? "bg-amber-400" : "bg-white",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        💧
      </button>
      {value && !open && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">ทดสอบ: {value}</span>}
    </div>
  );
}

const NOTES_PREVIEW = 3;

function NoteForm({ chat, now }: { chat: Chat; now: number }) {
  const [text, setText] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    addNote(chat.id, { id: `note-${Date.now()}`, text: body, at: now });
    setText("");
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={save}>
      <textarea
        className={field}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="เช่น ไข้ 38.5 ไอแห้ง ไม่หอบ"
      />
      <button type="submit" className="self-end rounded-md bg-[#06c755] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!text.trim()}>
        เพิ่มบันทึก
      </button>
    </form>
  );
}

function NoteCard({ note }: { note: SymptomNote }) {
  return (
    <article className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3">
      <time className="text-xs text-gray-400">{dateTime(note.at)} น.</time>
      <p className="whitespace-pre-wrap text-sm">{note.text}</p>
    </article>
  );
}

function NotesSection({ chat, now, onSeeAll }: { chat: Chat; now: number; onSeeAll: () => void }) {
  const notes = chat.notes ?? [];
  return (
    <section className="flex flex-col gap-3 border-t border-gray-200 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">ติดตามอาการ</span>
          <h2 className="text-base font-semibold">บันทึกอาการ</h2>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-600">{notes.length}</span>
      </header>
      <NoteForm chat={chat} now={now} />
      {notes.length === 0 ? (
        <p className="text-center text-sm text-gray-400">ยังไม่มีบันทึกอาการ</p>
      ) : (
        notes.slice(0, NOTES_PREVIEW).map((n) => <NoteCard key={n.id} note={n} />)
      )}
      {notes.length > NOTES_PREVIEW && (
        <button type="button" className="text-sm font-semibold text-[#06c755] hover:underline" onClick={onSeeAll}>
          ดูทั้งหมด ({notes.length})
        </button>
      )}
    </section>
  );
}

function NotesPage({ chat, now, onBack }: { chat: Chat; now: number; onBack: () => void }) {
  const notes = chat.notes ?? [];
  return (
    <main className="col-span-2 flex h-screen flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-3.5">
        <button type="button" className={ghost} onClick={onBack}>
          ← กลับไปแชท
        </button>
        <div className="flex flex-col">
          <strong>บันทึกอาการทั้งหมด · {chat.patient?.name || chat.name}</strong>
          <small className="text-gray-400">{notes.length} รายการ</small>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <div className="max-w-2xl">
          <NoteForm chat={chat} now={now} />
        </div>
        {notes.length === 0 && <p className="m-auto text-gray-400">ยังไม่มีบันทึกอาการ</p>}
        <div className="flex max-w-2xl flex-col gap-3">
          {notes.map((n) => <NoteCard key={n.id} note={n} />)}
        </div>
      </div>
    </main>
  );
}

function toDateTimeInput(timestamp: number) {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
