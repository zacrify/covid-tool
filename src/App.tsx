import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
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
    <div className="grid h-screen grid-cols-[300px_1fr] bg-gray-100 text-gray-800">
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
              <span className="font-semibold">{c.name}</span>
              <span className="truncate text-sm text-gray-500">{preview(c.messages.at(-1))}</span>
            </span>
            {c.unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{c.unread}</span>}
          </button>
        ))}
      </aside>
      <main className="flex h-screen flex-col">
        {selected ? <ChatPanel chat={selected} /> : <p className="m-auto p-4 text-center text-gray-400">เลือกแชทจากด้านซ้าย</p>}
      </main>
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
      <header className="flex flex-col border-b border-gray-200 bg-white px-5 py-3.5">
        <strong>{chat.name}</strong>
        <small className="text-gray-400">
          {chat.kind === "group" ? "กลุ่ม" : "แชทเดี่ยว"} · {chat.id}
        </small>
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
