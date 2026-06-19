/**
 * WA Gateway — decoupled transport for sending WhatsApp messages.
 *
 * Why abstracted?
 *   The first iteration hardcoded Meta Cloud API (WA_PHONE_ID + WA_TOKEN), which
 *   requires WABA approval (multi-week PT Fan / Meta process). For the Week-5
 *   pilot with one or two real users, we route through a local HTTP relay that
 *   forwards to the existing Hermes WhatsApp bridge (port 3000, already running,
 *   already scanned). The Worker doesn't care which transport is behind the URL —
 *   it just POSTs {chatId, message} with a shared secret.
 *
 * Transport contract (any HTTPS endpoint that satisfies this works):
 *   POST {WA_PROVIDER_URL}
 *   Authorization: Bearer {WA_PROVIDER_SECRET}
 *   Content-Type: application/json
 *   Body: { "chatId": "<E.164 or JID>", "message": "<utf-8 text>" }
 *   Response 200: { "ok": true }            (or any 2xx with any JSON body)
 *   Response 4xx/5xx: { "ok": false, "error": "..." } or any error body
 *
 *   chatId formats accepted by the Hermes bridge (verified by watchdog script):
 *     - "+628xxxxxxxxxx"  (E.164 with leading +)
 *     - "628xxxxxxxxxx"   (E.164 without +)
 *     - "<jid>@s.whatsapp.net"  (full JID)
 *   We send with the leading "+" — bridge handles it.
 *
 * Config (set via wrangler secret put, or in wrangler.<env>.toml for dev):
 *   WA_PROVIDER_URL      e.g. "https://wa-relay.oatlet.com"  (tunnel to local relay)
 *   WA_PROVIDER_SECRET   shared secret for Authorization header
 *
 * Behavior when not configured:
 *   - No WA_PROVIDER_URL → log to console, return { sent: true, reason: "stub:console" }.
 *     This preserves the dev experience (no real WA required) and matches the
 *     pre-existing cron.ts stub semantics.
 *   - WA_PROVIDER_URL set, call fails → return { sent: false, reason: "..." } so
 *     the caller can decide whether to fail the request (OTP send) or just log
 *     (notification dispatch).
 *
 * No retries here: OTP requests should fail fast so the user can retry, and
 * the cron-based notification dispatcher handles retry via wa_sent=0 polling.
 */
import type { Bindings } from "../index";

export type WaSendResult =
  | { sent: true; reason: string }
  | { sent: false; reason: string };

export async function sendWa(
  env: Bindings,
  chatId: string,
  message: string,
  opts?: { timeoutMs?: number; log?: (line: string) => void }
): Promise<WaSendResult> {
  const log = opts?.log ?? ((l) => console.log(l));
  const timeoutMs = opts?.timeoutMs ?? 5000;

  if (!env.WA_PROVIDER_URL) {
    log(`[WA stub] → ${chatId}: ${message.slice(0, 200)}`);
    return { sent: true, reason: "stub:console" };
  }

  if (!env.WA_PROVIDER_SECRET) {
    log(`[WA] WA_PROVIDER_URL set but WA_PROVIDER_SECRET missing — refusing to send.`);
    return { sent: false, reason: "config:missing-secret" };
  }

  const url = `${env.WA_PROVIDER_URL.replace(/\/+$/, "")}/send`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WA_PROVIDER_SECRET}`,
      },
      body: JSON.stringify({ chatId, message }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log(`[WA] ${url} → HTTP ${res.status} ${body.slice(0, 200)}`);
      return { sent: false, reason: `http:${res.status}` };
    }
    return { sent: true, reason: "ok" };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : err instanceof Error
        ? `network:${err.message}`
        : "network:unknown";
    log(`[WA] ${url} → ${reason}`);
    return { sent: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
