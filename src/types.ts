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
  address: string;
};

export type AtkResult = {
  id: string;
  result: "negative" | "positive";
  imageUrl?: string; // data URL, kept in localStorage
  imageName?: string;
  recordedAt: number;
};

export type Chat = {
  id: string; // userId หรือ groupId
  kind: "user" | "group";
  name: string;
  messages: Message[];
  unread: number;
  patient?: Patient;
  atkResults?: AtkResult[];
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
