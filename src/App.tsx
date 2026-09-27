import { useEffect, useRef, useState } from "react";
import { pushText } from "./line";
import { addMessage, clearAll, markRead, useChats } from "./store";
import type { Chat, Message } from "./types";
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
              <span className="name">{c.name}</span>
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
        <strong>{chat.name}</strong>
        <small>{chat.kind === "group" ? "กลุ่ม" : "แชทเดี่ยว"} · {chat.id}</small>
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
