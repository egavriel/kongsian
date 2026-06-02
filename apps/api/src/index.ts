/**
 * Kongsian API — Hono on Cloudflare Workers.
 *
 * Endpoints (all JSON, /v1 prefix):
 *   GET  /health             liveness
 *   POST /v1/auth/otp/request  { phone, purpose? } → sends OTP (stub: returns code in dev)
 *   POST /v1/auth/otp/verify   { phone, code, purpose? } → { sessionToken, user }
 *   POST /v1/auth/logout       { sessionToken } → ok
 *   GET  /v1/me                → { user } (requires Bearer session)
 *
 * Auth follows Lucia v3's now-deprecated pattern, reimplemented directly
 * with a Drizzle + D1 adapter (the `otps` + `sessions` tables from
 * packages/db/src/schema). See README "Why no Lucia v3" for rationale.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDb, type D1Env } from "@kongsian/db";
import { APP_NAME, formatIdr } from "@kongsian/shared/constants";
import { auth } from "./routes/auth";
import { me } from "./routes/me";

export type Bindings = D1Env & {
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
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "kongsian-api",
    version: "0.1.0",
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

export default app;
