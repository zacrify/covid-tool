import { useSyncExternalStore } from "react";
import type { AtkResult, Chat, Message, Patient } from "./types";

// ฐานข้อมูล = localStorage อย่างเดียว (prototype)
const KEY = "covid-tool.chats";
let chats: Chat[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
const listeners = new Set<() => void>();

function commit(next: Chat[]) {
  chats = next;
  localStorage.setItem(KEY, JSON.stringify(chats));
  listeners.forEach((l) => l());
}

export function useChats(): Chat[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => chats,
  );
}

export function hasMessage(id: string): boolean {
  return chats.some((c) => c.messages.some((m) => m.id === id));
}

export function addMessage(chat: Omit<Chat, "messages" | "unread">, msg: Message) {
  const existing = chats.find((c) => c.id === chat.id);
  if (existing?.messages.some((m) => m.id === msg.id)) return;
  const unread = (existing?.unread ?? 0) + (msg.from === "patient" ? 1 : 0);
  // spread existing ก่อน เพื่อไม่ให้ patient ที่พยาบาลกรอกไว้หายไป
  const updated: Chat = { ...existing, ...chat, unread, messages: [...(existing?.messages ?? []), msg] };
  commit([updated, ...chats.filter((c) => c.id !== chat.id)]);
}

export function addAtkResult(chat: Chat, result: AtkResult) {
  if (chat.atkResults?.some((item) => item.id === result.id)) return;
  const message: Message = {
    id: `message-${result.id}`,
    from: "patient",
    name: chat.name,
    type: "atk",
    text: result.result === "negative" ? "ผลไม่พบเชื้อ" : "ผลพบเชื้อ",
    contentUrl: result.imageUrl,
    fileName: result.imageName,
    at: result.recordedAt,
  };
  const updated: Chat = {
    ...chat,
    unread: chat.unread + 1,
    atkResults: [result, ...(chat.atkResults ?? [])],
    messages: [...chat.messages, message],
  };
  commit([updated, ...chats.filter((c) => c.id !== chat.id)]);
}

export function markRead(chatId: string) {
  commit(chats.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)));
}

export function setPatient(chatId: string, patient: Patient | undefined) {
  commit(chats.map((c) => (c.id === chatId ? { ...c, patient } : c)));
}

export function clearAll() {
  commit([]);
}

export function createMockChat() {
  if (chats.some((chat) => chat.id === "mock-patient")) return;
  const now = Date.now();
  const mock: Chat = {
    id: "mock-patient",
    kind: "user",
    name: "คนไข้ตัวอย่าง",
    unread: 1,
    atkResults: [],
    messages: [{
      id: `mock-${now}`,
      from: "patient",
      name: "คนไข้ตัวอย่าง",
      type: "text",
      text: "สวัสดีค่ะ ต้องส่งผล ATK ทางนี้ใช่ไหมคะ",
      at: now,
    }],
  };
  commit([mock, ...chats]);
}
