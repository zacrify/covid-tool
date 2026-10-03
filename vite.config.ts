import { createHmac } from "node:crypto";
import type { ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

// รับ webhook จาก LINE (หรือ line-sim) แล้วส่งต่อให้หน้าเว็บผ่าน SSE ที่ /api/events
// เก็บ event ล่าสุดไว้ในหน่วยความจำ เผื่อเปิดหน้าเว็บทีหลัง (หน้าเว็บกันซ้ำด้วย webhookEventId)
function lineWebhook(secret: string): Plugin {
  const clients = new Set<ServerResponse>();
  const recent: string[] = [];
  return {
    name: "line-webhook",
    configureServer(server) {
      server.middlewares.use("/api/events", (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(":ok\n\n");
        for (const body of recent) res.write(`data: ${body}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
      });
      server.middlewares.use("/api/line/webhook", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const expected = createHmac("sha256", secret).update(raw).digest("base64");
        if (req.headers["x-line-signature"] !== expected) {
          res.statusCode = 401;
          return res.end("bad x-line-signature");
        }
        recent.push(raw);
        if (recent.length > 200) recent.shift();
        for (const c of clients) c.write(`data: ${raw}\n\n`);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end("{}");
      });
    },
  };
}

// Prototype helpers that need a server: hold generated files in memory and call Gemini with the server-side key.
function prototypeApi(geminiKey: string): Plugin {
  const files = new Map<string, { type: string; bytes: Buffer }>();
  return {
    name: "prototype-api",
    configureServer(server) {
      // POST raw bytes → { url } ; GET /api/files/<id> → the bytes. Gone on restart.
      server.middlewares.use("/api/files", async (req, res) => {
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          files.set(id, { type: req.headers["content-type"] ?? "application/octet-stream", bytes: Buffer.concat(chunks) });
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ url: `/api/files/${id}` }));
        }
        const file = files.get((req.url ?? "").slice(1).split("?")[0]);
        if (!file) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("Content-Type", file.type);
        res.end(file.bytes);
      });
      // POST { prompt } → { text } via Gemini. Key stays on the server.
      server.middlewares.use("/api/ai/summary", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        if (!geminiKey) {
          res.statusCode = 500;
          return res.end("GEMINI_API_KEY is not set in .env");
        }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const { prompt } = JSON.parse(raw) as { prompt: string };
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!r.ok) {
          res.statusCode = 502;
          return res.end(`Gemini ${r.status}: ${await r.text()}`);
        }
        const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ text }));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), lineWebhook(env.CHANNEL_SECRET ?? ""), prototypeApi(env.GEMINI_API_KEY ?? "")],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: Number(env.PORT ?? 3000),
      // หน้าเว็บเรียก /line/... แล้ว vite ส่งต่อไป LINE API (line-sim) ให้ ไม่ติด CORS
      proxy: {
        "/line": {
          target: env.LINE_API_BASE ?? "http://localhost:5531",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/line/, ""),
        },
      },
    },
  };
});
