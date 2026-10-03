import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// รวม class ของ Tailwind แบบไม่ชนกัน (แบบเดียวกับ shadcn)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
