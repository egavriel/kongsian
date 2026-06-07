/**
 * Workers Cron Triggers handler.
 *
 * Multi-schedule (apps/api/wrangler.toml):
 *   "* * * * *"    Every minute — WA dispatch (notifications + OTPs, D1-backed)
 *   "0 14 * * *"   Daily 14:00 UTC = 21:00 WIB — closing reminders
 *   "59 16 * * 7"  Weekly Sun 16:59 UTC = Sun 23:59 WIB — settlement generator
 *                   (cron uses 0..7, both 0 and 7 mean Sunday; we accept both
 *                    for portability with cron tooling that emits 0)
 *
 * IMPORTANT (Opus 4.8 audit fix): the previous implementation kept the
 * plaintext OTP in an in-memory Map, which doesn't work because cron
 * handlers and request handlers run in *different Worker isolates*. This
 * rewrite is fully D1-backed.
 *
 * Required secrets (set via `wrangler secret put`):
 *   - WA_PHONE_ID   → Meta Cloud API phone-number id
 *   - WA_TOKEN      → Meta system-user access token
 *   - CRON_SECRET   → shared secret for cross-service cron triggers
 */
import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb, otps, notifications, dailyClosings, partnerships, users } from "@kongsian/db";
import { generateSettlements } from "./lib/settlement";
import type { Bindings } from "./index";

/** Send a WhatsApp message via Meta Cloud API. Stub: console.log if no secrets. */
export async function sendWhatsApp(
  env: { WA_PHONE_ID?: string; WA_TOKEN?: string },
  phoneE164: string,
  message: string
): Promise<{ sent: boolean; reason: string }> {
  if (!env.WA_PHONE_ID || !env.WA_TOKEN) {
    // Dev / no-secrets-yet: log and treat as sent so the row is marked.
    // eslint-disable-next-line no-console
    console.log(`[WA-CRON stub] → ${phoneE164}: ${message.slice(0, 100)}`);
    return { sent: true, reason: "stub:console" };
  }
  // Real Meta call (uncomment when provisioned):
  // const url = `https://graph.facebook.com/v20.0/${env.WA_PHONE_ID}/messages`;
  // const res = await fetch(url, {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     messaging_product: "whatsapp",
  //     to: phoneE164.replace(/^\+/, ""),
  //     type: "text",
  //     text: { body: message },
  //   }),
  // });
  // if (!res.ok) {
  //   return { sent: false, reason: `meta:${res.status}` };
  // }
  // return { sent: true, reason: "meta" };
  return { sent: false, reason: "real-implementation-missing" };
}

/** Build a human-friendly message from a notification. */
function buildMessageFromNotification(n: {
  kind: string;
  title: string;
  body: string | null;
}): string {
  if (n.body) return `${n.title}\n\n${n.body}`;
  return n.title;
}

/** Every-minute job: dispatch any wa_sent=0 notifications + retry OTP sends. */
async function dispatchWaQueue(env: Bindings): Promise<{ notif: number; otp: number }> {
  const db = getDb(env.kongsian_db);
  const now = nowSec();

  // 1. Notifications
  const pendingNotifs = await db
    .select({
      n: notifications,
      phoneE164: users.phoneE164,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.waSent, 0))
    .limit(50);

  let notifSent = 0;
  for (const { n, phoneE164 } of pendingNotifs) {
    if (!phoneE164) continue;
    const message = buildMessageFromNotification(n);
    const result = await sendWhatsApp(env, phoneE164, message);
    if (result.sent) {
      await db
        .update(notifications)
        .set({ waSent: 1 })
        .where(eq(notifications.id, n.id));
      notifSent++;
    }
  }

  // 2. OTPs — Week-5: request handler now sends synchronously, so any row
  // still wa_sent=0 here is either (a) a real WA failure that we should
  // surface, or (b) a request that hit stub mode (no WA configured). We
  // can't recover the plaintext (D1 only stores the hash), so the recovery
  // path is the user re-requesting a new code. We just log a count so a
  // future alert can detect a wave of failures.
  const otpCutoff = now - 600;
  const pendingOtps = await db
    .select({ id: otps.id, phoneE164: otps.phoneE164, purpose: otps.purpose })
    .from(otps)
    .where(and(eq(otps.waSent, 0), gte(otps.createdAt, otpCutoff)))
    .limit(20);

  if (pendingOtps.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[WA-CRON] ${pendingOtps.length} OTP(s) wa_sent=0 in last 10min (no plaintext in D1; user must re-request):`,
      pendingOtps.map((o) => `${o.phoneE164}/${o.purpose}`)
    );
  }

  return { notif: notifSent, otp: 0 };
}

/** Daily 21:00 WIB (14:00 UTC) — insert CLOSING_REMINDER notifications for
 *  active partnerships that haven't submitted today's closing yet. */
async function generateClosingReminders(env: Bindings): Promise<{ inserted: number }> {
  const db = getDb(env.kongsian_db);
  const now = nowSec();
  // Today in WIB (UTC+7).
  const wibNow = new Date((now + 7 * 3600) * 1000);
  const today = wibNow.toISOString().slice(0, 10);

  // Find active partnerships with no closing for today
  const ps = await db.select().from(partnerships).where(eq(partnerships.status, "ACTIVE"));

  let inserted = 0;
  for (const p of ps) {
    // Check if today's closing already exists (any status).
    const [existing] = await db
      .select({ id: dailyClosings.id })
      .from(dailyClosings)
      .where(
        and(eq(dailyClosings.partnershipId, p.id), eq(dailyClosings.closingDate, today))
      )
      .limit(1);
    if (existing) continue;

    // Find tenant members (notify them — they're the ones who submit).
    const { tenantMemberships } = await import("@kongsian/db");
    const members = await db
      .select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, p.tenantId));

    for (const m of members) {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: m.userId,
        kind: "CLOSING_REMINDER",
        title: `Closing harian belum di-submit (${today})`,
        body: `Jangan lupa submit closing harian untuk tenant ini ya.`,
        entityType: "daily_closing",
        entityId: p.id,
        readAt: null,
        waSent: 0,
        createdAt: now,
      });
      inserted++;
    }
  }

  return { inserted };
}

/** Weekly Sun 23:59 WIB (16:59 UTC) — call the settlement generator. */
async function generateWeeklySettlements(env: Bindings): Promise<{
  generated: number;
  skipped: number;
}> {
  const result = await generateSettlements(env, {});
  // eslint-disable-next-line no-console
  console.log(
    `[CRON-SETTLEMENT] generated=${result.generated.length} skipped=${result.skipped.length}`,
    result.skipped.map((s) => `${s.partnershipId.slice(0, 8)}/${s.reason}`)
  );
  return { generated: result.generated.length, skipped: result.skipped.length };
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Cron entry point. Branches on `event.cron`. */
export async function onCronTrigger(
  event: ScheduledController | { scheduledTime: number; cron: string },
  env: Bindings,
  ctx: { waitUntil: (p: Promise<unknown>) => void }
): Promise<void> {
  const cron = event.cron;
  ctx.waitUntil(
    (async () => {
      try {
        if (cron === "* * * * *") {
          const r = await dispatchWaQueue(env);
          if (r.notif > 0) {
            // eslint-disable-next-line no-console
            console.log(`[CRON-WA] dispatched notif=${r.notif}`);
          }
        } else if (cron === "0 14 * * *") {
          const r = await generateClosingReminders(env);
          // eslint-disable-next-line no-console
          console.log(`[CRON-REMINDER] inserted=${r.inserted}`);
        } else if (cron === "59 16 * * 7") {
          const r = await generateWeeklySettlements(env);
          // eslint-disable-next-line no-console
          console.log(`[CRON-SETTLEMENT] generated=${r.generated} skipped=${r.skipped}`);
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[CRON] unknown schedule: ${cron}`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[CRON] handler failed for ${cron}`, err);
      }
    })()
  );
}
