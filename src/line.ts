// เรียก LINE Messaging API ผ่าน proxy ของ vite (/line → LINE_API_BASE)
const headers = { "Content-Type": "application/json", Authorization: "Bearer prototype-token" };

export async function getUserName(userId: string): Promise<string> {
  const r = await fetch(`/line/v2/bot/profile/${userId}`, { headers });
  return r.ok ? (await r.json()).displayName : userId;
}

export async function getGroupName(groupId: string): Promise<string> {
  const r = await fetch(`/line/v2/bot/group/${groupId}/summary`, { headers });
  return r.ok ? (await r.json()).groupName : groupId;
}

export async function getMemberName(groupId: string, userId: string): Promise<string> {
  const r = await fetch(`/line/v2/bot/group/${groupId}/member/${userId}`, { headers });
  return r.ok ? (await r.json()).displayName : userId;
}

export async function pushText(to: string, text: string): Promise<void> {
  const r = await fetch("/line/v2/bot/message/push", {
    method: "POST",
    headers,
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) throw new Error(`push failed: ${r.status} ${await r.text()}`);
}

export const contentUrl = (messageId: string) => `/line/v2/bot/message/${messageId}/content`;
