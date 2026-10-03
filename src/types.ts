export type Message = {
  id: string;
  from: "patient" | "nurse";
  name: string;
  type: "text" | "image" | "file";
  text?: string;
  fileName?: string;
  contentUrl?: string;
  at: number;
};

export type Gender = "male" | "female" | "other";

// Patient info typed in by the nurse (not from LINE)
export type Patient = {
  name: string;
  gender?: Gender;
  age?: number;
  district?: string; // อำเภอ (Phuket only, see src/phuket.ts)
  subdistrict?: string; // ตำบล, used by the dashboard map
  address: string; // house number, moo, etc.
};

// One quarantine round. Started by a positive ATK result (or imported from seed data).
export type Quarantine = {
  id: string;
  from: number;
  to: number;
  atkResultId?: string;
};

export type AtkResult = {
  id: string;
  result: "negative" | "positive";
  imageUrl?: string; // data URL (uploaded) or /line/... content URL (picked from chat)
  imageName?: string;
  sourceMessageId?: string; // set when the photo came from a patient message
  recordedAt: number;
};

// Symptom note written by the nurse
export type SymptomNote = {
  id: string;
  text: string;
  at: number;
};

export type Chat = {
  id: string; // userId หรือ groupId
  kind: "user" | "group";
  name: string;
  messages: Message[];
  unread: number;
  patient?: Patient;
  atkResults?: AtkResult[];
  quarantines?: Quarantine[];
  notes?: SymptomNote[];
};

// รูปแบบ event ที่ LINE ส่งมา (เฉพาะส่วนที่ใช้)
export type LineEvent = {
  type: string;
  webhookEventId: string;
  timestamp: number;
  replyToken?: string;
  source: { type: "user" | "group"; userId?: string; groupId?: string };
  message?: {
    type: string;
    id: string;
    text?: string;
    fileName?: string;
  };
};
