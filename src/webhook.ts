import { contentUrl, getGroupName, getMemberName, getUserName } from "./line";
import { addMessage, hasMessage } from "./store";
import type { Chat, LineEvent, Message } from "./types";

const nameCache = new Map<string, Promise<string>>();
const cached = (key: string, load: () => Promise<string>) => {
  if (!nameCache.has(key)) nameCache.set(key, load());
  return nameCache.get(key)!;
};

async function handleEvent(ev: LineEvent) {
  if (ev.type !== "message" || !ev.message || hasMessage(ev.message.id)) return;
  const { source, message } = ev;

  let chat: Omit<Chat, "messages" | "unread">;
  let sender: string;
  if (source.type === "group" && source.groupId) {
    const groupId = source.groupId;
    chat = { id: groupId, kind: "group", name: await cached(groupId, () => getGroupName(groupId)) };
    sender = source.userId
      ? await cached(`${groupId}:${source.userId}`, () => getMemberName(groupId, source.userId!))
      : "ผู้ใช้";
  } else {
    const userId = source.userId ?? "unknown";
    sender = await cached(userId, () => getUserName(userId));
    chat = { id: userId, kind: "user", name: sender };
  }

  const type = message.type === "image" ? "image" : message.type === "file" ? "file" : "text";
  const msg: Message = {
    id: message.id,
    from: "patient",
    name: sender,
    type,
    text: type === "text" ? (message.text ?? `[${message.type}]`) : undefined,
    fileName: message.fileName,
    contentUrl: type === "text" ? undefined : contentUrl(message.id),
    at: ev.timestamp,
  };
  addMessage(chat, msg);
}

// ต่อ SSE จาก vite plugin แล้วเอา event มาลง store
export function listenWebhook(): () => void {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => {
    const body = JSON.parse(e.data) as { events: LineEvent[] };
    for (const ev of body.events ?? []) handleEvent(ev).catch(console.error);
  };
  return () => es.close();
}
