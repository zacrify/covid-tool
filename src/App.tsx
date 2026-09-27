import { useEffect, useRef, useState } from "react";
import { pushText } from "./line";
import { addMessage, clearAll, markRead, setPatient, useChats } from "./store";
import type { Chat, Gender, Message, Patient } from "./types";
import { listenWebhook } from "./webhook";

const time = (t: number) => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export default function App() {
  const chats = useChats();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = chats.find((c) => c.id === selectedId) ?? null;

  useEffect(listenWebhook, []);
  useEffect(() => {
    if (selectedId) markRead(selectedId);
  }, [selectedId, selected?.messages.length]);

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>COVID LINE OA</h1>
          <button className="ghost" onClick={() => confirm("ล้างแชททั้งหมด?") && clearAll()}>
            ล้าง
          </button>
        </header>
        {chats.length === 0 && <p className="hint">ยังไม่มีแชท ส่งข้อความจาก LINE simulator ก่อน</p>}
        {chats.map((c) => (
          <button key={c.id} className={`chat-item ${c.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(c.id)}>
            <span className="avatar">{c.kind === "group" ? "👥" : "🧑"}</span>
            <span className="meta">
              <span className="name">{c.patient?.name || c.name}</span>
              <span className="preview">{preview(c.messages.at(-1))}</span>
            </span>
            {c.unread > 0 && <span className="badge">{c.unread}</span>}
          </button>
        ))}
      </aside>
      <main className="chat">{selected ? <ChatPanel chat={selected} /> : <p className="hint">เลือกแชทจากด้านซ้าย</p>}</main>
    </div>
  );
}

function preview(m?: Message) {
  if (!m) return "";
  const body = m.type === "text" ? m.text : m.type === "image" ? "📷 รูปภาพ" : `📎 ${m.fileName}`;
  return `${m.from === "nurse" ? "คุณ: " : ""}${body}`;
}

function ChatPanel({ chat }: { chat: Chat }) {
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
      <header>
        <div className="title">
          <div>
            <strong>{chat.patient?.name || chat.name}</strong>
            <small>
              {chat.kind === "group" ? "กลุ่ม" : "แชทเดี่ยว"} · LINE: {chat.name} · {chat.id}
            </small>
          </div>
          <button className="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "ปิด" : chat.patient ? "แก้ไขข้อมูลผู้ป่วย" : "เพิ่มข้อมูลผู้ป่วย"}
          </button>
        </div>
        {!editing && chat.patient && <PatientSummary patient={chat.patient} />}
        {editing && <PatientForm chat={chat} onDone={() => setEditing(false)} />}
      </header>
      <div className="messages">
        {chat.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>
            {chat.kind === "group" && m.from === "patient" && <span className="sender">{m.name}</span>}
            {m.type === "text" && <span>{m.text}</span>}
            {m.type === "image" && <img src={m.contentUrl} alt="รูปจากผู้ป่วย" />}
            {m.type === "file" && (
              <a href={m.contentUrl} target="_blank" rel="noreferrer">
                📎 {m.fileName}
              </a>
            )}
            <time>{time(m.at)}</time>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ข้อความถึงผู้ป่วย…" autoFocus />
        <button disabled={sending || !text.trim()}>ส่ง</button>
      </form>
      {error && <p className="error">{error}</p>}
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
  return <p className="patient-summary">{parts.join(" · ") || "ยังไม่มีรายละเอียด"}</p>;
}

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
    <form className="patient-form" onSubmit={save}>
      <label>
        ชื่อ-นามสกุล
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อผู้ป่วย" autoFocus />
      </label>
      <label>
        เพศ
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
          <option value="">ไม่ระบุ</option>
          <option value="male">ชาย</option>
          <option value="female">หญิง</option>
          <option value="other">อื่น ๆ</option>
        </select>
      </label>
      <label>
        อายุ
        <input type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} placeholder="ปี" />
      </label>
      <label className="wide">
        ที่อยู่
        <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด" />
      </label>
      <div className="actions">
        {p && (
          <button type="button" className="ghost" onClick={() => confirm("ลบข้อมูลผู้ป่วย?") && (setPatient(chat.id, undefined), onDone())}>
            ลบข้อมูล
          </button>
        )}
        <button type="button" className="ghost" onClick={onDone}>
          ยกเลิก
        </button>
        <button type="submit" className="primary">
          บันทึก
        </button>
      </div>
    </form>
  );
}
