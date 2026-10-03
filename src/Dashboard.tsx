import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { loadSeed } from "./seed";
import { DAY_MS, useChats } from "./store";
import type { Chat, Quarantine } from "./types";

type Feature = { properties: { code: string; name: string; district: string }; geometry: { coordinates: number[][][][] } };
type GeoJson = { features: Feature[] };

const dateInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 10);
};
const dateShort = (t: number) => new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

// A patient counts for the range when any quarantine round overlaps it
type Row = { chat: Chat; q: Quarantine };
function inRange(chat: Chat, start: number, end: number): Row | null {
  const q = (chat.quarantines ?? []).find((q) => q.from <= end && q.to >= start);
  return q ? { chat, q } : null;
}

// Equirectangular projection is fine for an island this small
function usePaths(geo: GeoJson | null) {
  return useMemo(() => {
    if (!geo) return null;
    // frame the main island: use each subdistrict's biggest ring so tiny far islands don't shrink the map
    const pts = geo.features.flatMap((f) => f.geometry.coordinates.map((p) => p[0]).sort((a, b) => b.length - a.length)[0]);
    const minX = Math.min(...pts.map((p) => p[0]));
    const maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    const W = 600;
    const pad = 0.01;
    const scale = W / (maxX - minX + pad * 2);
    const H = (maxY - minY + pad * 2) * scale;
    const px = (lon: number) => (lon - minX + pad) * scale;
    const py = (lat: number) => (maxY + pad - lat) * scale;
    const paths = geo.features.map((f) => {
      const d = f.geometry.coordinates.map((poly) => "M" + poly[0].map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join("L") + "Z").join("");
      // label at the centroid of the biggest ring
      const ring = f.geometry.coordinates.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
      const cx = ring.reduce((s, p) => s + px(p[0]), 0) / ring.length;
      const cy = ring.reduce((s, p) => s + py(p[1]), 0) / ring.length;
      return { name: f.properties.name, district: f.properties.district, d, cx, cy };
    });
    return { W, H, paths };
  }, [geo]);
}

const fill = (n: number, max: number) => (n === 0 ? "#f3f4f6" : `rgba(220, 38, 38, ${0.25 + 0.65 * (n / Math.max(max, 1))})`);

export function Dashboard({ now, onBack, onOpenChat }: { now: number; onBack: () => void; onOpenChat: (id: string) => void }) {
  const chats = useChats();
  const [geo, setGeo] = useState<GeoJson | null>(null);
  const [from, setFrom] = useState(dateInput(now));
  const [to, setTo] = useState(dateInput(now));
  const [picked, setPicked] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const map = usePaths(geo);

  useEffect(() => {
    fetch("/phuket-subdistricts.json").then((r) => r.json()).then(setGeo).catch(console.error);
  }, []);

  const start = new Date(`${from}T00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  const rows = chats.map((c) => inRange(c, start, end)).filter((r): r is Row => r != null);
  const bySub = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.chat.patient?.subdistrict ?? "ไม่ระบุตำบล";
    bySub.set(key, [...(bySub.get(key) ?? []), r]);
  }
  const max = Math.max(0, ...[...bySub.values()].map((v) => v.length));
  const list = picked ? (bySub.get(picked) ?? []) : rows;

  async function seed() {
    setSeeding(true);
    try {
      await loadSeed();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <button type="button" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50" onClick={onBack}>
          ← กลับไปแชท
        </button>
        <h1 className="text-base font-semibold">แผนที่ผู้กักตัว · ภูเก็ต</h1>
        <label className="ml-auto flex items-center gap-1 text-sm text-gray-600">
          ช่วงวันที่
          <input type="date" className="rounded-md border border-gray-300 px-2 py-1 text-sm" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          ถึง
          <input type="date" className="rounded-md border border-gray-300 px-2 py-1 text-sm" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50" onClick={() => { setFrom(dateInput(now)); setTo(dateInput(now)); }}>
          วันนี้
        </button>
        <button type="button" className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50" onClick={seed} disabled={seeding}>
          {seeding ? "กำลังโหลด…" : "โหลดข้อมูลตัวอย่าง"}
        </button>
      </header>

      <div className="grid flex-1 grid-cols-[1fr_380px] overflow-hidden">
        <div className="flex flex-col items-center overflow-auto p-4">
          <p className="mb-2 text-sm text-gray-500">
            กักตัวในช่วงนี้ทั้งหมด <strong className="text-gray-800">{rows.length}</strong> คน · คลิกตำบลเพื่อดูรายชื่อ
          </p>
          {map ? (
            <svg viewBox={`0 0 ${map.W} ${map.H}`} className="w-full max-w-[460px] shrink-0">
              {map.paths.map((p) => {
                const n = bySub.get(p.name)?.length ?? 0;
                return (
                  <g key={p.name} className="cursor-pointer" onClick={() => setPicked(picked === p.name ? null : p.name)}>
                    <title>{`ต.${p.name} อ.${p.district}: ${n} คน`}</title>
                    <path d={p.d} fill={fill(n, max)} stroke={picked === p.name ? "#111" : "#9ca3af"} strokeWidth={picked === p.name ? 2.5 : 1} />
                    <text x={p.cx} y={p.cy - 8} textAnchor="middle" fontSize="12" fill="#374151" pointerEvents="none">{p.name}</text>
                    <text x={p.cx} y={p.cy + 12} textAnchor="middle" fontSize="18" fontWeight="700" fill={n ? "#7f1d1d" : "#9ca3af"} pointerEvents="none">{n}</text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <p className="m-auto text-gray-400">กำลังโหลดแผนที่…</p>
          )}
        </div>

        <aside className="flex flex-col overflow-y-auto border-l border-gray-200 bg-white">
          <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <strong>{picked ? `ต.${picked}` : "ทุกตำบล"}</strong>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-600">{list.length} คน</span>
              {picked && (
                <button type="button" className="text-sm text-gray-500 hover:underline" onClick={() => setPicked(null)}>
                  × ทุกตำบล
                </button>
              )}
            </span>
          </header>
          {!picked && (
            <ul className="flex flex-wrap gap-1 border-b border-gray-200 px-4 py-2">
              {[...bySub.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, v]) => (
                <li key={name}>
                  <button type="button" className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200" onClick={() => setPicked(name)}>
                    {name} {v.length}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.length === 0 && <p className="m-auto p-4 text-center text-gray-400">ไม่มีผู้กักตัวในช่วงนี้</p>}
          {list.map(({ chat, q }) => {
            const left = Math.max(0, Math.ceil((q.to - now) / DAY_MS));
            return (
              <button key={chat.id} type="button" className="flex flex-col border-b border-gray-100 px-4 py-2.5 text-left hover:bg-gray-50" onClick={() => onOpenChat(chat.id)}>
                <span className="flex w-full items-center justify-between">
                  <span className="font-semibold">{chat.patient?.name || chat.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", left ? "bg-amber-100 text-amber-800" : "bg-gray-200 text-gray-600")}>
                    {left ? `🏠 ${left} วัน` : "✓ ครบแล้ว"}
                  </span>
                </span>
                <span className="text-xs text-gray-500">
                  {dateShort(q.from)} – {dateShort(q.to)} · ต.{chat.patient?.subdistrict ?? "-"} อ.{chat.patient?.district ?? "-"} {chat.patient?.address}
                </span>
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
