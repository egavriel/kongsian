/**
 * Kongsian API — Hono on Cloudflare Workers.
 *
 * Endpoints (all JSON, /v1 prefix):
 *   GET  /health                       liveness
 *   POST /v1/auth/otp/request          { phone, purpose? } → sends OTP (stub: returns code in dev)
 *   POST /v1/auth/otp/verify           { phone, code, purpose? } → { sessionToken, user }
 *   POST /v1/auth/logout               Bearer → ok
 *   GET  /v1/me                        → { user } (requires Bearer session)
 *
 *   GET  /v1/brands/me                 → current user's brand + SKUs + partnerships
 *   POST /v1/brands                    { name, slug, description? } → brand
 *   GET  /v1/skus                      ?brandId=... → SKUs
 *   POST /v1/skus                      { brandId, code, name, priceIdr, masaSimpanHari }
 *   PATCH /v1/skus/:id                 { name?, priceIdr?, masaSimpanHari?, active? }
 *   DELETE /v1/skus/:id                soft delete (active=false)
 *
 *   GET  /v1/tenants                   ?phone=... → list (admin) or PIC's own
 *   POST /v1/tenants                   { name, slug, address?, picPhoneE164 }
 *
 *   GET  /v1/partnerships              ?brandId=... | ?tenantId=...
 *   POST /v1/partnerships              { brandId, tenantId, revenueSplitBrandBps, revenueSplitTenantBps }
 *   POST /v1/partnerships/invite       { brandId, phone, cafeName, address?, split? } → create tenant PENDING + partnership PENDING + OTP INVITE
 *   POST /v1/partnerships/:id/activate → brand accepts → status=ACTIVE
 *
 *   GET  /v1/movements                 ?partnershipId&from=&to= → list
 *   POST /v1/movements                 { partnershipId, skuId, movementDate, kind, qty, reason?, fotoR2Key?, idempotencyKey }
 *   GET  /v1/movements/sisa-sistem     ?partnershipId&weekStart= → computed per-SKU
 *
 *   GET  /v1/audit                     ?entityType=&entityId= → audit log
 *
 *   POST /v1/uploads/presign           { kind, contentType } → { uploadUrl, key } (R2 presigned)
 *
 * Auth follows a D1-native session pattern (Lucia v3 reimplemented). OTP requests
 * are rate-limited at 5/hour/phone via the `otp_rate_limits` D1 counter (P0 #1).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { APP_NAME, formatIdr, CORS_ALLOWLIST } from "@kongsian/shared/constants";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { brands } from "./routes/brands";
import { skus } from "./routes/skus";
import { tenants } from "./routes/tenants";
import { partnerships } from "./routes/partnerships";
import { movements } from "./routes/movements";
import { audit } from "./routes/audit";
import { uploads } from "./routes/uploads";
import { admin } from "./routes/admin";
import { disputes } from "./routes/disputes";
import { settlements } from "./routes/settlements";
import { notifications as notificationsRouter } from "./routes/notifications";
import { tenantClosings, brandClosings } from "./routes/closings";
import { analytics } from "./routes/analytics";
import { ops } from "./routes/ops";
import { onCronTrigger } from "./cron";

export type Bindings = {
  kongsian_db: D1Database;
  // R2 (optional — for photo upload, Week 2)
  KONGSIAN_BUCKET?: R2Bucket;
  ENV: string;
  LOG_LEVEL: string;
  APP_URL: string;
  OTP_TTL_SECONDS: string;
  OTP_MAX_ATTEMPTS: string;
  SESSION_TTL_SECONDS: string;
  // Secrets (set via `wrangler secret put`):
  JWT_SECRET: string;
  WA_PHONE_ID: string;
  WA_TOKEN: string;
  OTP_HMAC_KEY: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_BASE?: string;
  CRON_SECRET?: string;
  // Week-5 pilot: generic WA provider (decoupled from Meta Cloud API).
  // The Worker POSTs to WA_PROVIDER_URL/send with a shared secret.
  // A local Node relay (scripts/wa-relay.ts) bridges to the Hermes
  // WhatsApp bridge (port 3000, already running).
  WA_PROVIDER_URL?: string;
  WA_PROVIDER_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", logger());

/**
 * CORS — P0 audit fix #3.
 * Allowlist: kongsian.app + www + *.kongsian-web.pages.dev + localhost (dev only).
 * We use a function so unknown origins get rejected (not echoed).
 */
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return CORS_ALLOWLIST[0] || "https://kongsian.app";
      const allow =
        CORS_ALLOWLIST.includes(origin) ||
        /^https:\/\/[a-z0-9-]+\.kongsian-web\.pages\.dev$/i.test(origin) ||
        /^http:\/\/localhost:\d+$/i.test(origin);
      return allow ? origin : CORS_ALLOWLIST[0] || "https://kongsian.app";
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "kongsian-api",
    version: "0.2.0",
    time: new Date().toISOString(),
  })
);

app.get("/", (c) =>
  c.json({
    name: APP_NAME,
    tagline: "Titip. Terjual. Settle.",
    example: { price: formatIdr(42000) },
  })
);

app.route("/v1/auth", auth);
app.route("/v1", me);
app.route("/v1/brands", brands);
app.route("/v1/skus", skus);
app.route("/v1/tenants", tenants);
app.route("/v1/partnerships", partnerships);
app.route("/v1/movements", movements);
app.route("/v1/audit", audit);
app.route("/v1/uploads", uploads);
app.route("/v1/admin", admin);
app.route("/v1/disputes", disputes);
app.route("/v1/notifications", notificationsRouter);
app.route("/v1", settlements);
app.route("/v1/tenants", tenantClosings);
app.route("/v1/brands", brandClosings);
app.route("/v1/ops", ops);
app.route("/v1", analytics);

// Workers Cron Trigger — runs every minute (configured in wrangler.toml).
// Re-sends OTP codes via Meta WhatsApp Cloud API (or console.log stub).
export default {
  fetch: app.fetch,
  scheduled: onCronTrigger,
};
