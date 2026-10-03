// Phuket districts and subdistricts, same names as public/phuket-subdistricts.json
export const PHUKET: Record<string, string[]> = {
  "เมืองภูเก็ต": [
    "ตลาดใหญ่",
    "ตลาดเหนือ",
    "เกาะแก้ว",
    "รัษฎา",
    "ฉลอง",
    "ราไวย์",
    "กะรน"
  ],
  "กะทู้": [
    "กะทู้",
    "ป่าตอง",
    "กมลา"
  ],
  "ถลาง": [
    "เทพกระษัตรี",
    "ศรีสุนทร",
    "เชิงทะเล",
    "ป่าคลอก",
    "ไม้ขาว",
    "สาคู"
  ]
};

export const DISTRICTS = Object.keys(PHUKET);
