/**
 * Partnership endpoints — brand<->tenant contracts.
 *
 * Key flows:
 *  - GET  /v1/partnerships?brandId=...  brand dashboard
 *  - GET  /v1/partnerships?tenantId=... tenant dashboard
 *  - POST /v1/partnerships              create (brand-only, PENDING)
 *  - POST /v1/partnerships/invite       brand: send invite by phone, create tenant
 *                                        (if missing) + PENDING partnership + INVITE OTP,
 *                                        deliver via WhatsApp (W5 pilot).
 *  - POST /v1/partnerships/:id/activate brand: flip to ACTIVE
 *  - POST /v1/partnerships/:id/suspend  brand: flip to SUSPENDED
 */
import { Hono } from "hono";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  brands,
  partnerships,
  partnershipSkus,
  skus,
  tenants,
  tenantMemberships,
  users,
  otps,
  auditLog,
} from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import {
  generateOtpCode,
  hashOtpCode,
} from "../lib/crypto";
import { checkAndIncrementOtp } from "../lib/rate-limit";
import {
  OTP_TTL_SECONDS,
  DEFAULT_SPLIT_BRAND_BPS,
  DEFAULT_SPLIT_TENANT_BPS,
} from "@kongsian/shared/constants";
import { sendWa } from "../lib/wa-gateway";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

/**
 * Build the WhatsApp message for a brand-inviting-cafe invite.
 * Includes the deep link to the register page (so the cafe PIC just taps the
 * link, their phone is pre-filled, and they only need to type the OTP + name).
 */
function buildInviteMessage(args: {
  brandName: string;
  cafeName: string;
  appUrl: string;
  phone: string;
  code: string;
  ttlSeconds: number;
}): string {
  const ttlMin = Math.round(args.ttlSeconds / 60);
  const link = `${args.appUrl.replace(/\/+$/, "")}/register?phone=${encodeURIComponent(args.phone)}&role=TENANT`;
  return (
    `*[${args.brandName}] — Undangan Partner Kongsian*\n\n` +
    `Halo! Kamu diundang untuk menjadi PIC *${args.cafeName}* di Kongsian.\n\n` +
    `Tap link ini untuk daftar (nomor kamu sudah terisi):\n${link}\n\n` +
    `Kode OTP kamu:\n*${args.code}*\n\n` +
    `Berlaku ${ttlMin} menit. Setelah daftar, kamu bisa langsung catat titipan & closing harian.\n\n` +
    `Bukan kamu? Abaikan pesan ini.`
  );
}

const CreateSchema = z
  .object({
    brandId: z.string().min(1),
    tenantId: z.string().min(1),
    revenueSplitBrandBps: z.number().int().min(0).max(10000).optional(),
    revenueSplitTenantBps: z.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (v) =>
      (v.revenueSplitBrandBps ?? DEFAULT_SPLIT_BRAND_BPS) +
        (v.revenueSplitTenantBps ?? DEFAULT_SPLIT_TENANT_BPS) ===
      10000,
    { message: "revenue splits must sum to 10000 bps" }
  );

const InviteSchema = z.object({
  brandId: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  cafeName: z.string().min(2).max(80),
  cafeSlug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
  address: z.string().max(200).optional(),
  revenueSplitBrandBps: z.number().int().min(0).max(10000).optional(),
  revenueSplitTenantBps: z.number().int().min(0).max(10000).optional(),
});

/** GET /v1/partnerships — list scoped by query. IDOR fix (P0 #2): even when
 *  the caller supplies ?brandId or ?tenantId, we additionally assert the
 *  user is the brand owner OR a tenant membership of the given tenant.
 *  Without a query param we return only partnerships the user can reach. */
router.get("/", async (c) => {
  const { userId } = c.get("auth");
  const brandId = c.req.query("brandId");
  const tenantId = c.req.query("tenantId");
  const db = getDb(c.env.kongsian_db);

  // Authorization check first.
  if (brandId) {
    const [brand] = await db
      .select({ id: brands.id, userId: brands.userId })
      .from(brands)
      .where(eq(brands.id, brandId))
      .limit(1);
    if (!brand) {
      return c.json({ ok: true, data: [] });
    }
    if (brand.userId !== userId) {
      // Not the brand owner — must be a member of an active partnership's tenant.
      const access = await db
        .select({ id: partnerships.id })
        .from(partnerships)
        .innerJoin(
          tenantMemberships,
          and(
            eq(tenantMemberships.tenantId, partnerships.tenantId),
            eq(tenantMemberships.userId, userId)
          )
        )
        .where(eq(partnerships.brandId, brandId))
        .limit(1);
      if (access.length === 0) {
        return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
      }
    }
  } else if (tenantId) {
    const [m] = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, userId)
        )
      )
      .limit(1);
    if (!m) {
      return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
    }
  } else {
    // No filter — return only partnerships the user can see.
    // Union of: partnerships where brand.userId = userId, OR partnerships
    // where user is a tenant member.
    const ownedBrandIdsRows = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.userId, userId));
    const ownedBrandIds = ownedBrandIdsRows.map((r) => r.id);
    const memberTenantIdsRows = await db
      .select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, userId));
    const memberTenantIds = memberTenantIdsRows.map((r) => r.tenantId);
    if (ownedBrandIds.length === 0 && memberTenantIds.length === 0) {
      return c.json({ ok: true, data: [] });
    }
    // Build a list of partnership rows from either side, then dedupe.
    const seen = new Set<string>();
    let combined: Array<{ id: string }> = [];
    if (ownedBrandIds.length > 0) {
      const a = await db
        .select({ id: partnerships.id })
        .from(partnerships)
        .where(inArray(partnerships.brandId, ownedBrandIds));
      combined = combined.concat(a);
    }
    if (memberTenantIds.length > 0) {
      const b = await db
        .select({ id: partnerships.id })
        .from(partnerships)
        .where(inArray(partnerships.tenantId, memberTenantIds));
      combined = combined.concat(b);
    }
    const allowedIds: string[] = [];
    for (const r of combined) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        allowedIds.push(r.id);
      }
    }
    if (allowedIds.length === 0) return c.json({ ok: true, data: [] });
    const rows = await db
      .select({ partnership: partnerships, tenant: tenants, brand: brands })
      .from(partnerships)
      .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
      .innerJoin(brands, eq(brands.id, partnerships.brandId))
      .where(inArray(partnerships.id, allowedIds))
      .orderBy(desc(partnerships.createdAt));
    return c.json({
      ok: true,
      data: rows.map((r) => ({ ...r.partnership, tenant: r.tenant, brand: r.brand })),
    });
  }

  const where = brandId
    ? eq(partnerships.brandId, brandId)
    : eq(partnerships.tenantId, tenantId!);
  const baseQuery = db
    .select({ partnership: partnerships, tenant: tenants, brand: brands })
    .from(partnerships)
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .innerJoin(brands, eq(brands.id, partnerships.brandId))
    .where(where)
    .orderBy(desc(partnerships.createdAt));
  const rows = await baseQuery;
  return c.json({ ok: true, data: rows.map((r) => ({ ...r.partnership, tenant: r.tenant, brand: r.brand })) });
});

/** GET /v1/partnerships/:id — single. IDOR fix (P0 #2): owner or member check. */
router.get("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const db = getDb(c.env.kongsian_db);
  const [row] = await db
    .select({ partnership: partnerships, tenant: tenants, brand: brands })
    .from(partnerships)
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .innerJoin(brands, eq(brands.id, partnerships.brandId))
    .where(eq(partnerships.id, id))
    .limit(1);
  if (!row) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);
  const isBrandOwner = row.brand.userId === userId;
  if (!isBrandOwner) {
    const [m] = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, row.partnership.tenantId),
          eq(tenantMemberships.userId, userId)
        )
      )
      .limit(1);
    if (!m) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }
  return c.json({ ok: true, data: { ...row.partnership, tenant: row.tenant, brand: row.brand } });
});

/** POST /v1/partnerships — create (PENDING). Brand owner only. */
router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const { brandId, tenantId } = parsed.data;
  const splitBrand = parsed.data.revenueSplitBrandBps ?? DEFAULT_SPLIT_BRAND_BPS;
  const splitTenant = parsed.data.revenueSplitTenantBps ?? DEFAULT_SPLIT_TENANT_BPS;

  const db = getDb(c.env.kongsian_db);
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return c.json({ ok: false, error: { code: "TENANT_NOT_FOUND" } }, 404);

  // Idempotency: same brand+tenant.
  const [existing] = await db
    .select()
    .from(partnerships)
    .where(and(eq(partnerships.brandId, brandId), eq(partnerships.tenantId, tenantId)))
    .limit(1);
  if (existing) {
    return c.json({ ok: true, data: { partnership: existing, alreadyExists: true } });
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await db.insert(partnerships).values({
    id,
    brandId,
    tenantId,
    revenueSplitBrandBps: splitBrand,
    revenueSplitTenantBps: splitTenant,
    status: "PENDING",
    createdAt: now,
    activatedAt: null,
  });

  // Auto-link all of the brand's active SKUs to the new partnership.
  const brandSkus = await db.select().from(skus).where(eq(skus.brandId, brandId));
  for (const s of brandSkus) {
    await db.insert(partnershipSkus).values({
      id: crypto.randomUUID(),
      partnershipId: id,
      skuId: s.id,
      priceOverrideIdr: null,
      active: true,
      priceChangedAt: null,
      priceChangedByUserId: null,
    });
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "PARTNERSHIP_CREATED",
    entityType: "partnership",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ brandId, tenantId, status: "PENDING" }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [partnership] = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
  return c.json({ ok: true, data: { partnership } });
});

/**
 * POST /v1/partnerships/invite
 * Brand owner: create (or reuse) tenant for the phone, create PENDING
 * partnership, send INVITE OTP via stub, return devCode in dev.
 *
 * Idempotent: if a tenant with that phone already exists, reuse.
 *   If a partnership already exists for (brand, tenant), return it.
 */
router.post("/invite", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const { brandId, phone, cafeName, address } = parsed.data;
  const splitBrand = parsed.data.revenueSplitBrandBps ?? DEFAULT_SPLIT_BRAND_BPS;
  const splitTenant = parsed.data.revenueSplitTenantBps ?? DEFAULT_SPLIT_TENANT_BPS;
  if (splitBrand + splitTenant !== 10000) {
    return c.json({ ok: false, error: { code: "INVALID_SPLIT", message: "splits must sum to 10000" } }, 400);
  }

  const db = getDb(c.env.kongsian_db);
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  // Rate limit (re-use OTP rate limit so invites can't be spammed).
  const rl = await checkAndIncrementOtp(c.env, phone);
  if (!rl.allowed) {
    c.header("Retry-After", String(rl.retryAfterSec));
    return c.json({ ok: false, error: { code: "INVITE_RATE_LIMITED" } }, 429);
  }

  // 1) Find or create tenant.
  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.picPhoneE164, phone))
    .limit(1);

  let tenantId: string;
  let isNewTenant = false;
  const now = Math.floor(Date.now() / 1000);
  if (existingTenant) {
    tenantId = existingTenant.id;
  } else {
    tenantId = crypto.randomUUID();
    // Slug: derive from cafe name; ensure uniqueness by suffixing random hex.
    const slugifiedName = cafeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    const baseSlug = parsed.data.cafeSlug || slugifiedName || "cafe";
    const slug = `${baseSlug}-${tenantId.slice(0, 6)}`;
    await db.insert(tenants).values({
      id: tenantId,
      name: cafeName,
      slug,
      address: address ?? null,
      picPhoneE164: phone,
      createdAt: now,
    });
    isNewTenant = true;
  }

  // 2) Find or create partnership.
  const [existingPartnership] = await db
    .select()
    .from(partnerships)
    .where(and(eq(partnerships.brandId, brandId), eq(partnerships.tenantId, tenantId)))
    .limit(1);

  let partnershipId: string;
  if (existingPartnership) {
    partnershipId = existingPartnership.id;
  } else {
    partnershipId = crypto.randomUUID();
    await db.insert(partnerships).values({
      id: partnershipId,
      brandId,
      tenantId,
      revenueSplitBrandBps: splitBrand,
      revenueSplitTenantBps: splitTenant,
      status: "PENDING",
      createdAt: now,
      activatedAt: null,
    });
    // Link SKUs.
    const brandSkus = await db.select().from(skus).where(eq(skus.brandId, brandId));
    for (const s of brandSkus) {
      await db.insert(partnershipSkus).values({
        id: crypto.randomUUID(),
        partnershipId,
        skuId: s.id,
        priceOverrideIdr: null,
        active: true,
        priceChangedAt: null,
        priceChangedByUserId: null,
      });
    }
  }

  // 3) Generate INVITE OTP.
  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code, c.env.OTP_HMAC_KEY);
  const ttl = parseInt(c.env.OTP_TTL_SECONDS || String(OTP_TTL_SECONDS), 10);
  const otpId = crypto.randomUUID();
  await db.insert(otps).values({
    id: otpId,
    phoneE164: phone,
    codeHash,
    expiresAt: now + ttl,
    attempts: 0,
    purpose: "INVITE",
    waSent: 0, // updated to 1 below on successful delivery
    createdAt: now,
  });

  // 4) Send the invite via WhatsApp (synchronous, same pattern as auth.ts
  //    /v1/auth/otp/request). In stub mode (no WA configured) we just log
  //    and fall through. In real mode we deliver the deep link + code.
  const waConfigured = Boolean(c.env.WA_PROVIDER_URL);
  let waDelivered = false;
  if (waConfigured) {
    const message = buildInviteMessage({
      brandName: brand.name,
      cafeName,
      appUrl: c.env.APP_URL,
      phone,
      code,
      ttlSeconds: ttl,
    });
    // Same JID normalization as auth.ts: bridge chokes on E.164 with "+".
    const chatId = `${phone.replace(/^\+/, "")}@s.whatsapp.net`;
    const result = await sendWa(c.env, chatId, message, { timeoutMs: 6000 });
    waDelivered = result.sent;
    if (waDelivered) {
      await db.update(otps).set({ waSent: 1 }).where(eq(otps.id, otpId));
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[partnerships.invite] WA send failed for ${phone} (brand=${brandId}, cafe=${cafeName}): ${result.reason}. ` +
          `Falling back to devCode in response so the brand owner can communicate it manually.`
      );
    }
  }

  // 5) Audit.
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "PARTNERSHIP_CREATED",
    entityType: "partnership",
    entityId: partnershipId,
    beforeJson: null,
    afterJson: JSON.stringify({
      brandId,
      tenantId,
      status: "PENDING",
      invitedPhone: phone,
      isNewTenant,
      inviteDelivered: waDelivered,
    }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const [partnership] = await db.select().from(partnerships).where(eq(partnerships.id, partnershipId)).limit(1);
  return c.json({
    ok: true,
    data: {
      tenant,
      partnership,
      isNewTenant,
      invite: {
        phone,
        expiresAt: now + ttl,
        inviteDelivered: waDelivered,
        // devCode only returned when WA delivery is unconfirmed (stub mode
        // OR real WA failure). In successful real-WA delivery, devCode is
        // NEVER returned — the code is only in the WA message.
        ...(waDelivered ? {} : { devCode: code }),
      },
    },
  });
});

/** POST /v1/partnerships/:id/activate — brand owner only. */
router.post("/:id/activate", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const db = getDb(c.env.kongsian_db);
  const [p] = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
  if (!p) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);
  const [brand] = await db.select().from(brands).where(eq(brands.id, p.brandId)).limit(1);
  if (!brand || brand.userId !== userId) {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(partnerships)
    .set({ status: "ACTIVE", activatedAt: now })
    .where(eq(partnerships.id, id));
  const [after] = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "PARTNERSHIP_ACTIVATED",
    entityType: "partnership",
    entityId: id,
    beforeJson: JSON.stringify(p),
    afterJson: JSON.stringify(after),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { partnership: after } });
});

/** POST /v1/partnerships/:id/suspend */
router.post("/:id/suspend", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const db = getDb(c.env.kongsian_db);
  const [p] = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
  if (!p) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);
  const [brand] = await db.select().from(brands).where(eq(brands.id, p.brandId)).limit(1);
  if (!brand || brand.userId !== userId) {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  await db.update(partnerships).set({ status: "SUSPENDED" }).where(eq(partnerships.id, id));
  const [after] = await db.select().from(partnerships).where(eq(partnerships.id, id)).limit(1);
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "PARTNERSHIP_SUSPENDED",
    entityType: "partnership",
    entityId: id,
    beforeJson: JSON.stringify(p),
    afterJson: JSON.stringify(after),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { partnership: after } });
});

/**
 * POST /v1/partnerships/accept-invite
 * Called by the tenant PIC right after they verify their INVITE OTP.
 * Body: { phone, code }  →  looks up the most recent PENDING partnership for
 * that phone, sets status=ACTIVE, creates a tenant_memberships row for the
 * tenant phone's user (creating the user if missing).
 */
const AcceptInviteSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().length(6).regex(/^\d{6}$/),
});
router.post("/accept-invite", async (c) => {
  // This route is unauthenticated — the OTP IS the proof of phone ownership.
  const body = await c.req.json().catch(() => ({}));
  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const { phone, code } = parsed.data;
  const db = getDb(c.env.kongsian_db);
  const codeHash = await hashOtpCode(code, c.env.OTP_HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);

  const [otp] = await db
    .select()
    .from(otps)
    .where(and(eq(otps.phoneE164, phone), eq(otps.purpose, "INVITE")))
    .orderBy(desc(otps.createdAt))
    .limit(1);
  if (!otp) return c.json({ ok: false, error: { code: "OTP_NOT_FOUND" } }, 400);
  if (otp.consumedAt) return c.json({ ok: false, error: { code: "OTP_ALREADY_USED" } }, 400);
  if (otp.expiresAt < now) return c.json({ ok: false, error: { code: "OTP_EXPIRED" } }, 400);
  if (otp.codeHash !== codeHash) {
    await db.update(otps).set({ attempts: otp.attempts + 1 }).where(eq(otps.id, otp.id));
    return c.json({ ok: false, error: { code: "OTP_INVALID" } }, 400);
  }
  await db.update(otps).set({ consumedAt: now }).where(eq(otps.id, otp.id));

  // Find or create user for this phone.
  let [user] = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  if (!user) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      phoneE164: phone,
      name: phone,
      globalRole: "USER",
      createdAt: now,
      lastLoginAt: now,
    });
    [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  // Find tenant(s) for this phone; pick the first.
  const tenantList = await db
    .select()
    .from(tenants)
    .where(eq(tenants.picPhoneE164, phone));
  if (tenantList.length === 0) {
    return c.json({ ok: false, error: { code: "NO_TENANT_FOR_PHONE" } }, 404);
  }

  // Create tenant_memberships for each tenant.
  for (const t of tenantList) {
    const [existing] = await db
      .select()
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.userId, user.id), eq(tenantMemberships.tenantId, t.id)))
      .limit(1);
    if (!existing) {
      await db.insert(tenantMemberships).values({
        id: crypto.randomUUID(),
        userId: user.id,
        tenantId: t.id,
        role: "OWNER",
        createdAt: now,
      });
    }
  }

  // Activate the most recent PENDING partnership for any of those tenants.
  let activated: string[] = [];
  for (const t of tenantList) {
    const [pending] = await db
      .select()
      .from(partnerships)
      .where(and(eq(partnerships.tenantId, t.id), eq(partnerships.status, "PENDING")))
      .orderBy(desc(partnerships.createdAt))
      .limit(1);
    if (pending) {
      await db
        .update(partnerships)
        .set({ status: "ACTIVE", activatedAt: now })
        .where(eq(partnerships.id, pending.id));
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId: user.id,
        action: "PARTNERSHIP_ACTIVATED",
        entityType: "partnership",
        entityId: pending.id,
        beforeJson: JSON.stringify(pending),
        afterJson: JSON.stringify({ ...pending, status: "ACTIVE", activatedAt: now }),
        ip: c.req.header("cf-connecting-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        createdAt: now,
      });
      activated.push(pending.id);
    }
  }

  return c.json({
    ok: true,
    data: {
      userId: user.id,
      tenants: tenantList.map((t) => t.id),
      activatedPartnerships: activated,
    },
  });
});

export { router as partnerships };
