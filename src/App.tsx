import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, Toaster, toast } from "@ai-course/retro-ui";
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
    <div className="grid h-screen grid-cols-[300px_1fr] bg-background text-foreground">
      <aside className="flex flex-col overflow-y-auto border-r-4 border-border bg-card">
        <header className="flex items-center justify-between border-b-4 border-border px-4 py-3.5">
          <h1 className="text-xs">COVID LINE OA</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!confirm("ล้างแชททั้งหมด?")) return;
              clearAll();
              toast("ล้างแชททั้งหมดแล้ว");
            }}
          >
            ล้าง
          </Button>
        </header>
        {chats.length === 0 && <p className="m-auto p-4 text-center font-mono-retro text-xl text-muted-foreground">ยังไม่มีแชท ส่งข้อความจาก LINE simulator ก่อน</p>}
        {chats.map((c) => (
          <button
            key={c.id}
            className={cn(
              "flex w-full items-center gap-2.5 border-b-2 border-border px-4 py-3 text-left hover:bg-muted",
              c.id === selectedId && "bg-secondary",
            )}
            onClick={() => setSelectedId(c.id)}
          >
            <span className="text-2xl">{c.kind === "group" ? "👥" : "🧑"}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px]">{c.name}</span>
              <span className="truncate font-mono-retro text-lg text-muted-foreground">{preview(c.messages.at(-1))}</span>
            </span>
            {c.unread > 0 && <Badge variant="destructive">{c.unread}</Badge>}
          </button>
        ))}
      </aside>
      <main className="flex h-screen flex-col">
        {selected ? <ChatPanel chat={selected} /> : <p className="m-auto p-4 text-center font-mono-retro text-xl text-muted-foreground">เลือกแชทจากด้านซ้าย</p>}
      </main>
      <Toaster />
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
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex flex-col border-b-4 border-border bg-card px-5 py-3.5">
        <strong className="text-xs">{chat.name}</strong>
        <small className="font-mono-retro text-lg text-muted-foreground">
          {chat.kind === "group" ? "กลุ่ม" : "แชทเดี่ยว"} · {chat.id}
        </small>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
        {chat.messages.map((m) => (
          <Card
            key={m.id}
            className={cn(
              "flex max-w-[65%] flex-col gap-1 px-3 py-2 font-mono-retro text-xl wrap-break-word whitespace-pre-wrap",
              m.from === "nurse" ? "self-end bg-accent" : "self-start",
            )}
          >
            {chat.kind === "group" && m.from === "patient" && <span className="text-base text-muted-foreground">{m.name}</span>}
            {m.type === "text" && <span>{m.text}</span>}
            {m.type === "image" && <img className="max-w-[260px] rounded-lg" src={m.contentUrl} alt="รูปจากผู้ป่วย" />}
            {m.type === "file" && (
              <a className="underline" href={m.contentUrl} target="_blank" rel="noreferrer">
                📎 {m.fileName}
              </a>
            )}
            <time className="self-end text-base opacity-60">{time(m.at)}</time>
          </Card>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t-4 border-border bg-card px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          className="flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความถึงผู้ป่วย…"
          autoFocus
        />
        <Button disabled={sending || !text.trim()}>ส่ง</Button>
      </form>
      {error && <p className="px-5 pb-3 font-mono-retro text-lg text-destructive">{error}</p>}
    </>
  );
}
