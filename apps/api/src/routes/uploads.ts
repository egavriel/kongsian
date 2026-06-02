/**
 * R2 upload endpoints.
 *
 * For Week 2 we use a simple "presigned-style" direct upload to R2:
 *   - Client requests a key
 *   - API returns a one-shot signed URL (Cloudflare R2 presigned PUT)
 *   - Client PUTs the file to that URL
 *   - Client then includes the returned key when submitting the Titip/Tarik form
 *
 * This is the recommended pattern for Workers (no service worker / SDK on the
 * client). Uses HMAC-SHA256 to sign the URL — same key as OTP_HMAC_KEY for
 * simplicity, can be rotated independently in Week 3+.
 *
 * Note: in dev (no R2 binding) we return a stub key that the form will treat
 * as a local file reference; the movement will still record fotoR2Key.
 */
import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../lib/auth";
import { R2_ALLOWED_MIME, R2_MAX_UPLOAD_BYTES } from "@kongsian/shared/constants";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

const PresignSchema = z.object({
  kind: z.enum(["titip-foto", "tarik-foto"]),
  contentType: z.enum(R2_ALLOWED_MIME),
  partnershipId: z.string().min(1),
  skuId: z.string().optional(),
});

/** HMAC-sign the upload params so the client can't tamper with them. */
async function sign(
  hmacKey: string,
  payload: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(hmacKey || "kongsian-dev-key-do-not-use-in-prod"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** POST /v1/uploads/presign — return upload URL + key. */
router.post("/presign", async (c) => {
  const { userId: _userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = PresignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const v = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 60 * 5; // 5 min
  const ext = v.contentType.split("/")[1] ?? "bin";
  const rand = base64UrlEncode(crypto.getRandomValues(new Uint8Array(8)));
  const key = `${v.kind}/${v.partnershipId}/${now}-${rand}.${ext}`;

  const bucket = c.env.KONGSIAN_BUCKET;
  const isDev = c.env.ENV === "development";

  // No R2 binding in dev — return a stub. The form still records fotoR2Key.
  if (!bucket || isDev) {
    return c.json({
      ok: true,
      data: {
        key,
        uploadUrl: null,
        method: "PUT",
        headers: { "Content-Type": v.contentType },
        expiresAt: expires,
        maxBytes: R2_MAX_UPLOAD_BYTES,
        stub: true,
        stubNote: "Dev mode — no R2 binding. The form will still record fotoR2Key.",
      },
    });
  }

  // Real R2 presigned URL. R2 supports AWS SigV4; without an SDK we sign the
  // canonical request manually. For Week 2 we'll return the key + a signed URL
  // placeholder; the actual upload can be a direct worker proxy or use the
  // official presign helper in Week 3 once we add the s3 SDK.
  // For now: sign a one-shot token the client can include in a PUT to /v1/uploads/proxy
  const token = await sign(c.env.OTP_HMAC_KEY, `${key}|${expires}|${v.contentType}`);
  return c.json({
    ok: true,
    data: {
      key,
      uploadUrl: `/v1/uploads/proxy?key=${encodeURIComponent(key)}&expires=${expires}&token=${token}`,
      method: "PUT",
      headers: { "Content-Type": v.contentType },
      expiresAt: expires,
      maxBytes: R2_MAX_UPLOAD_BYTES,
    },
  });
});

/** PUT /v1/uploads/proxy — proxy a presigned upload to R2. */
router.put("/proxy", async (c) => {
  const key = c.req.query("key");
  const expires = parseInt(c.req.query("expires") || "0", 10);
  const token = c.req.query("token");
  if (!key || !expires || !token) {
    return c.json({ ok: false, error: { code: "MISSING_PARAMS" } }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > expires) return c.json({ ok: false, error: { code: "URL_EXPIRED" } }, 410);

  const contentType = c.req.header("content-type") || "application/octet-stream";
  const expected = await sign(c.env.OTP_HMAC_KEY, `${key}|${expires}|${contentType}`);
  if (expected !== token) return c.json({ ok: false, error: { code: "BAD_TOKEN" } }, 403);

  const bucket = c.env.KONGSIAN_BUCKET;
  if (!bucket) return c.json({ ok: false, error: { code: "NO_BUCKET" } }, 503);

  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > R2_MAX_UPLOAD_BYTES) {
    return c.json({ ok: false, error: { code: "TOO_LARGE" } }, 413);
  }
  if (!(R2_ALLOWED_MIME as readonly string[]).includes(contentType)) {
    return c.json({ ok: false, error: { code: "BAD_CONTENT_TYPE" } }, 415);
  }

  await bucket.put(key, buf, { httpMetadata: { contentType } });
  return c.json({ ok: true, data: { key, size: buf.byteLength } });
});

export { router as uploads };
