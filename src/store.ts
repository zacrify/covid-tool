import { useSyncExternalStore } from "react";
import type { AtkResult, Chat, Message, Patient, Quarantine, SymptomNote } from "./types";

// ฐานข้อมูล = localStorage อย่างเดียว (prototype)
const KEY = "covid-tool.chats";
export const QUARANTINE_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;

const quarantineFor = (r: AtkResult): Quarantine => ({
  id: `q-${r.id}`,
  from: r.recordedAt,
  to: r.recordedAt + QUARANTINE_DAYS * DAY_MS,
  atkResultId: r.id,
});

// Older data had no quarantine records: derive them from positive ATK results once
function migrate(chat: Chat): Chat {
  if (chat.quarantines) return chat;
  const positive = (chat.atkResults ?? []).filter((r) => r.result === "positive");
  return { ...chat, quarantines: positive.map(quarantineFor) };
}

let chats: Chat[] = (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Chat[]).map(migrate);
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
  // spread existing first so the nurse-entered patient info survives new webhook messages
  const updated: Chat = { ...existing, ...chat, unread, messages: [...(existing?.messages ?? []), msg] };
  commit([updated, ...chats.filter((c) => c.id !== chat.id)]);
}

export function markRead(chatId: string) {
  commit(chats.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)));
}

export function setPatient(chatId: string, patient: Patient | undefined) {
  commit(chats.map((c) => (c.id === chatId ? { ...c, patient } : c)));
}

// A positive result starts a new quarantine round
export function addAtkResult(chatId: string, result: AtkResult) {
  commit(chats.map((c) => c.id !== chatId ? c : {
    ...c,
    atkResults: [result, ...(c.atkResults ?? [])],
    quarantines: result.result === "positive" ? [quarantineFor(result), ...(c.quarantines ?? [])] : c.quarantines,
  }));
}

// Latest quarantine round, or null if the patient never had one
export function latestQuarantine(chat: Chat): Quarantine | null {
  const qs = chat.quarantines ?? [];
  return qs.length ? qs.reduce((a, b) => (b.from > a.from ? b : a)) : null;
}

// Seed data: replace chats with the same id, keep the rest
export function importChats(incoming: Chat[]) {
  const ids = new Set(incoming.map((c) => c.id));
  commit([...incoming, ...chats.filter((c) => !ids.has(c.id))]);
}

export function addNote(chatId: string, note: SymptomNote) {
  commit(chats.map((c) => (c.id === chatId ? { ...c, notes: [note, ...(c.notes ?? [])] } : c)));
}

export function clearAll() {
  commit([]);
}
