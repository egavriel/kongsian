/**
 * kongsian-api WA relay — small Node service that bridges HTTP requests to the
 * local Hermes WhatsApp bridge. The kongisan-api Worker (deployed on
 * Cloudflare) cannot reach localhost directly, so it POSTs to this relay,
 * which then forwards to the bridge on 127.0.0.1:3000.
 *
 * Why a separate process (and not just have the Worker call the bridge
 * directly)?
 *   - Workers run on Cloudflare's edge — no access to localhost.
 *   - The bridge is on 127.0.0.1:3000, only reachable from this host.
 *   - We expose this relay on a public URL (e.g. via `cloudflared tunnel`)
 *     so the Worker can call it. Or run the whole stack locally for trial.
 *
 * Endpoints:
 *   POST /send
 *     Headers: Authorization: Bearer <WA_RELAY_SECRET>
 *              Content-Type: application/json
 *     Body:    { "phone": "+628xxxxxxxxxx" }   ← preferred (E.164)
 *              OR  { "chatId": "628xxx@s.whatsapp.net" }   ← JID (advanced)
 *              { "message": "Hello!" }
 *     Response 200: { "ok": true, "messageId": "..." }
 *     Response 4xx/5xx: { "ok": false, "error": "..." }
 *
 *   GET /health
 *     Returns 200 if the relay is alive, plus a ping of the bridge status.
 *
 *   POST /typing  (optional convenience — proxies to bridge)
 *   POST /send-media (optional — proxies to bridge)
 *
 * Run:
 *   WA_RELAY_PORT=3031 \
 *   WA_RELAY_SECRET=<random-32-bytes> \
 *   WA_BRIDGE_URL=http://127.0.0.1:3000 \
 *   npx tsx scripts/wa-relay.ts
 *
 * Or for production-ish, build a tiny standalone server and run under
 * nohup / a process supervisor. We don't bother with PM2 for the pilot.
 *
 * Exposing to the internet for the deployed Worker to call:
 *   cloudflared tunnel --url http://localhost:3031
 *   → gives a https://...trycloudflare.com URL (changes on restart)
 *   For a stable URL, set up a named tunnel (cloudflared tunnel create + route
 *   a DNS record). For the pilot, the trycloudflare quick tunnel is fine.
 *
 * Config (env):
 *   WA_RELAY_PORT       port to listen on (default 3031)
 *   WA_RELAY_SECRET     shared secret — Worker sends it as Bearer; relay rejects if mismatch
 *   WA_BRIDGE_URL       base URL of the Hermes bridge (default http://127.0.0.1:3000)
 *   WA_BRIDGE_TIMEOUT_MS  per-call timeout (default 8000)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = parseInt(process.env.WA_RELAY_PORT ?? "3031", 10);
const SECRET = process.env.WA_RELAY_SECRET;
const BRIDGE_URL = (process.env.WA_BRIDGE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const BRIDGE_TIMEOUT_MS = parseInt(process.env.WA_BRIDGE_TIMEOUT_MS ?? "8000", 10);

if (!SECRET) {
  console.error("[wa-relay] FATAL: WA_RELAY_SECRET env var is required.");
  console.error("[wa-relay] Set it to a long random string and put the same value");
  console.error("[wa-relay] in the kongisan-api Worker's WA_PROVIDER_SECRET secret.");
  process.exit(1);
}

// ---------- Helpers ----------

function readJson(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function logRequest(req: IncomingMessage, status: number, ms: number, extra?: string): void {
  const reqId = (req.headers["x-request-id"] as string) || randomUUID().slice(0, 8);
  const line = `[wa-relay] ${reqId} ${req.method} ${req.url} → ${status} ${ms}ms${extra ? " " + extra : ""}`;
  console.log(line);
}

function requireAuth(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  if (!auth) return false;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return false;
  return m[1] === SECRET;
}

function phoneToJid(phone: string): string | null {
  // Accept "+628xxx", "628xxx", "62 8xx" with optional spaces.
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (!/^[1-9]\d+$/.test(digits)) return null;
  return `${digits}@s.whatsapp.net`;
}

// ---------- Handlers ----------

async function handleHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Liveness check; don't fail the relay if the bridge is down (the relay is
  // still useful for diagnosing problems). We probe the bridge by sending an
  // empty POST to /send — the bridge returns 400 (missing chatId/message) when
  // it's up, 503 when its WhatsApp connection is down, or a network error when
  // nothing is listening. That gives us three distinct states.
  const start = Date.now();
  let bridgeStatus: "up" | "wa-down" | "unreachable" = "unreachable";
  try {
    const r = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(1500),
    });
    if (r.status === 400) bridgeStatus = "up";          // bridge alive, valid 400
    else if (r.status === 503) bridgeStatus = "wa-down"; // bridge alive, WhatsApp disconnected
    else bridgeStatus = "up";                            // any other response = bridge up
  } catch {
    bridgeStatus = "unreachable";
  }
  send(res, 200, { ok: true, relay: "kongsian-wa-relay", bridgeStatus, bridgePingMs: Date.now() - start });
}

async function handleSend(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJson(req)) as { phone?: string; chatId?: string; message?: string };
  const message = (body.message ?? "").toString();
  if (!message) return send(res, 400, { ok: false, error: "message required" });

  let chatId = body.chatId;
  if (!chatId && body.phone) {
    const jid = phoneToJid(body.phone);
    if (!jid) return send(res, 400, { ok: false, error: `phone not valid E.164: ${body.phone}` });
    chatId = jid;
  }
  if (!chatId) return send(res, 400, { ok: false, error: "phone or chatId required" });

  try {
    const r = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    if (!r.ok) {
      return send(res, 502, {
        ok: false,
        error: `bridge ${r.status}`,
        bridgeResponse: parsed,
      });
    }
    const p = parsed as { messageId?: string; messageIds?: string[] };
    return send(res, 200, {
      ok: true,
      chatId,
      messageId: p.messageId,
      messageIds: p.messageIds,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return send(res, 502, { ok: false, error: `bridge unreachable: ${reason}` });
  }
}

async function handlePassthrough(req: IncomingMessage, res: ServerResponse, bridgePath: string): Promise<void> {
  // Generic passthrough for /typing, /send-media — same auth + body forward.
  let body: unknown = {};
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, 400, { ok: false, error: (e as Error).message });
  }
  try {
    const r = await fetch(`${BRIDGE_URL}${bridgePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
    const text = await r.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    send(res, r.status, { ok: r.ok, bridgeResponse: parsed });
  } catch (err) {
    send(res, 502, { ok: false, error: `bridge unreachable: ${(err as Error).message}` });
  }
}

// ---------- Server ----------

const server = createServer(async (req, res) => {
  const start = Date.now();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && req.url === "/health") {
      await handleHealth(req, res);
      logRequest(req, res.statusCode, Date.now() - start);
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { ok: false, error: "method not allowed" });
      logRequest(req, 405, Date.now() - start);
      return;
    }
    if (!requireAuth(req)) {
      send(res, 401, { ok: false, error: "invalid or missing Authorization header" });
      logRequest(req, 401, Date.now() - start, "(auth fail)");
      return;
    }
    if (req.url === "/send") {
      await handleSend(req, res);
    } else if (req.url === "/typing") {
      await handlePassthrough(req, res, "/typing");
    } else if (req.url === "/send-media") {
      await handlePassthrough(req, res, "/send-media");
    } else {
      send(res, 404, { ok: false, error: "not found" });
    }
    logRequest(req, res.statusCode, Date.now() - start);
  } catch (err) {
    console.error("[wa-relay] handler crash:", err);
    if (!res.headersSent) send(res, 500, { ok: false, error: "internal relay error" });
    logRequest(req, 500, Date.now() - start, "(crash)");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[wa-relay] listening on http://0.0.0.0:${PORT}`);
  console.log(`[wa-relay]   bridge   : ${BRIDGE_URL}`);
  console.log(`[wa-relay]   auth     : Bearer <${SECRET.length}-char secret>`);
  console.log(`[wa-relay]   endpoints: GET /health, POST /send, POST /typing, POST /send-media`);
});

function shutdown(sig: string): void {
  console.log(`[wa-relay] ${sig} received, closing…`);
  server.close(() => process.exit(0));
  // Hard exit if it takes too long.
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
