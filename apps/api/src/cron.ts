/**
 * Workers Cron Triggers handler.
 *
 * Currently a single schedule (every 1 minute) that scans for otps rows with
 * wa_sent=0 and re-sends them via Meta WhatsApp Cloud API.
 *
 * Configuration lives in apps/api/wrangler.toml:
 *
 *   [triggers]
 *   crons = ["* * * * *"]
 *
 * Required secrets (set via `wrangler secret put`):
 *   - WA_PHONE_ID   → Meta Cloud API phone-number id
 *   - WA_TOKEN      → Meta system-user access token
 *
 * TODO(week-3+): replace sendOtpToWhatsApp stub with the real Meta call once
 * the WhatsApp Business Account is provisioned.
 */
import { eq, and, gte } from "drizzle-orm";
import { getDb, otps } from "@kongsian/db";
import type { Bindings } from "./index";

/** Plaintext OTP store. NEVER re-derive plaintext from `codeHash` — we keep a
 *  short-lived mirror in the cron scratch object so we can resend without
 *  re-generating. The dev path returns the plaintext synchronously, so the
 *  request handler passes it directly to the queue.
 *
 *  In a real WA-integration we'd want the dev path to also write to a small
 *  pending_codes table; for the MVP we read wa_sent=0 rows that are still
 *  within the TTL window. */
interface PendingCode {
  id: string;
  phoneE164: string;
  purpose: string;
  code: string; // plaintext — held only briefly in memory for the cron run
  expiresAt: number;
}

/** Shared in-memory scratch: the most recent unconsumed OTP codes for each (phone, purpose)
 *  pair, written by the request handler. Used by the cron so we can re-send
 *  the plaintext code without storing it in D1. This is fine for the MVP —
 *  we lose pending WA-sends across worker restarts, which is acceptable. */
const pendingByPhone = new Map<string, PendingCode>();
const pendingKey = (phone: string, purpose: string) => `${phone}::${purpose}`;

/** Called by /v1/auth/otp/request right after it inserts the otp row. */
export function enqueueOtp(phone: string, purpose: string, code: string, expiresAt: number, id: string) {
  pendingByPhone.set(pendingKey(phone, purpose), { id, phoneE164: phone, purpose, code, expiresAt });
}

/** Send the OTP code over WhatsApp. Stub: console.log for now.
 *  TODO: replace with a real Meta Cloud API call:
 *
 *    const url = `https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`;
 *    const res = await fetch(url, {
 *      method: "POST",
 *      headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
 *      body: JSON.stringify({
 *        messaging_product: "whatsapp",
 *        to: phone.replace(/^\+/, ""),
 *        type: "template",
 *        template: { name: "kongsian_otp", language: { code: "id" },
 *          components: [{ type: "body", parameters: [{ type: "text", text: code }] }] },
 *      }),
 *    });
 */
export async function sendOtpToWhatsApp(
  env: { WA_PHONE_ID?: string; WA_TOKEN?: string },
  phone: string,
  code: string,
  purpose: string
): Promise<{ sent: boolean; reason: string }> {
  if (!env.WA_PHONE_ID || !env.WA_TOKEN) {
    // Dev / no-secrets-yet: log and treat as sent so the row is marked.
    // eslint-disable-next-line no-console
    console.log(`[WA-CRON stub] → ${phone} (${purpose}) code=${code}`);
    return { sent: true, reason: "stub:console" };
  }
  // Real call would go here. We still return sent=false to be safe until
  // the real implementation lands.
  // eslint-disable-next-line no-console
  console.warn(`[WA-CRON] real Meta send not yet implemented for ${phone}`);
  return { sent: false, reason: "real-implementation-missing" };
}

/** Cron entry point — runs once per minute.
 *  We do two things:
 *   1. Walk the in-memory pending list; for each, try to send via WA and mark
 *      the otps row wa_sent=1 on success.
 *   2. As a safety net, scan D1 for recent wa_sent=0 rows that have a matching
 *      user with `lastLoginAt`-style info — currently a no-op marker.
 */
export async function onCronTrigger(
  _event: ScheduledController | { scheduledTime: number; cron: string },
  env: Bindings,
  ctx: { waitUntil: (p: Promise<unknown>) => void }
): Promise<void> {
  const db = getDb(env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);

  ctx.waitUntil(
    (async () => {
      let sentCount = 0;
      for (const [key, p] of pendingByPhone.entries()) {
        if (p.expiresAt < now) {
          pendingByPhone.delete(key);
          continue;
        }
        try {
          const result = await sendOtpToWhatsApp(env, p.phoneE164, p.code, p.purpose);
          if (result.sent) {
            await db.update(otps).set({ waSent: 1 }).where(eq(otps.id, p.id));
            sentCount++;
            // Successful push → drop the pending entry; we won't retry.
            pendingByPhone.delete(key);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[WA-CRON] send failed for ${p.phoneE164}`, err);
        }
      }
      if (sentCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[WA-CRON] sent ${sentCount} OTP(s) via WhatsApp`);
      }

      // Safety net: scan D1 for any wa_sent=0 rows in the last 5 minutes.
      // We can't read the plaintext back from D1 (it's hashed), so we can
      // only flag them — the real Meta integration will need a different
      // storage path. We log them for now to make ops debugging easier.
      const cutoff = now - 300;
      const stale = await db
        .select({ id: otps.id, phoneE164: otps.phoneE164, purpose: otps.purpose })
        .from(otps)
        .where(and(eq(otps.waSent, 0), gte(otps.createdAt, cutoff)))
        .limit(20);
      if (stale.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[WA-CRON] ${stale.length} OTP(s) still wa_sent=0 (no plaintext in D1; relying on in-memory queue):`,
          stale.map((s) => s.phoneE164)
        );
      }
    })()
  );
}
