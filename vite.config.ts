import { createHmac } from "node:crypto";
import type { ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), lineWebhook(env.CHANNEL_SECRET ?? "")],
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
