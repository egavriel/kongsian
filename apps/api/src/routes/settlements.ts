/**
 * Settlements API — Week 3, Track C.
 *
 *   GET  /v1/brands/:brandId/settlements       list (brand owner)
 *   GET  /v1/tenants/:tenantId/settlements     list (tenant member)
 *   GET  /v1/settlements/:id                   detail + lines
 *   POST /v1/settlements/:id/approve           brand owner only: DRAFT→BRAND_APPROVED
 *   POST /v1/settlements/:id/mark-paid         brand owner only: BRAND_APPROVED→PAID (requires proof)
 *   POST /v1/settlements/:id/payment-proof     brand owner: writes proof + note
 *   POST /v1/admin/settlements/generate        admin OR cron (X-Cron-Secret): generate for week
 */
import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  settlements,
  settlementLines,
  partnerships,
  brands,
  tenants,
  skus,
  auditLog,
} from "@kongsian/db";
import { tenantMemberships } from "@kongsian/db";
import { authMiddleware, getUser, type AuthContext } from "../lib/auth";
import { generateSettlements } from "../lib/settlement";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

const router = new Hono<RouteEnv>();
router.use("*", authMiddleware);

const PaymentProofSchema = z.object({
  r2Key: z.string().min(1).max(256),
  note: z.string().max(500).optional(),
});

const MarkPaidSchema = z.object({
  note: z.string().max(500).optional(),
});

const GenerateSchema = z.object({
  weekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  partnershipId: z.string().min(1).optional(),
});

const ListQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "PENDING_BRAND", "BRAND_APPROVED", "PAID", "DISPUTED"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Verify the caller is a brand owner for the given brandId. */
async function requireBrandOwner(env: Bindings, userId: string, brandId: string) {
  const db = getDb(env.kongsian_db);
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return { ok: false as const, code: 404 as const, error: "BRAND_NOT_FOUND" };
  if (brand.userId !== userId) return { ok: false as const, code: 403 as const, error: "FORBIDDEN" };
  return { ok: true as const, brand };
}

/** Verify the caller is a tenant member for the given tenantId. */
async function requireTenantMember(env: Bindings, userId: string, tenantId: string) {
  const db = getDb(env.kongsian_db);
  const [mem] = await db
    .select()
    .from(tenantMemberships)
    .where(
      and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId))
    )
    .limit(1);
  if (!mem) return { ok: false as const, code: 403 as const, error: "FORBIDDEN" };
  return { ok: true as const };
}

/** Get partnership + verify caller has access (brand or tenant member). */
async function loadAccessibleSettlement(env: Bindings, userId: string, userGlobalRole: string, id: string) {
  const db = getDb(env.kongsian_db);
  const [settlement] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, id))
    .limit(1);
  if (!settlement) return { ok: false as const, code: 404 as const, error: "SETTLEMENT_NOT_FOUND" };

  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.id, settlement.partnershipId))
    .limit(1);
  if (!partnership) return { ok: false as const, code: 404 as const, error: "PARTNERSHIP_NOT_FOUND" };

  if (userGlobalRole === "PLATFORM_ADMIN") {
    return { ok: true as const, settlement, partnership };
  }

  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, partnership.brandId))
    .limit(1);
  if (brand && brand.userId === userId) {
    return { ok: true as const, settlement, partnership, role: "BRAND" as const };
  }
  const [mem] = await db
    .select()
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, userId),
        eq(tenantMemberships.tenantId, partnership.tenantId)
      )
    )
    .limit(1);
  if (mem) {
    return { ok: true as const, settlement, partnership, role: "TENANT" as const };
  }
  return { ok: false as const, code: 403 as const, error: "FORBIDDEN" };
}

// ---------------------------------------------------------------------------
// GET /v1/brands/:brandId/settlements
// ---------------------------------------------------------------------------
router.get("/brands/:brandId/settlements", async (c) => {
  const brandId = c.req.param("brandId");
  const q = ListQuerySchema.safeParse(c.req.query());
  if (!q.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: q.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const guard = await requireBrandOwner(c.env, userId, brandId);
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);

  const db = getDb(c.env.kongsian_db);
  const ps = await db
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(eq(partnerships.brandId, brandId));
  const partnershipIds = ps.map((p) => p.id);
  if (partnershipIds.length === 0) {
    return c.json({ ok: true, data: { settlements: [] } });
  }

  const filters = [inArray(settlements.partnershipId, partnershipIds)];
  if (q.data.status) filters.push(eq(settlements.status, q.data.status));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(settlements)
    .where(where)
    .orderBy(desc(settlements.weekStartDate))
    .limit(q.data.limit)
    .offset(q.data.offset);

  return c.json({ ok: true, data: { settlements: rows } });
});

// ---------------------------------------------------------------------------
// GET /v1/tenants/:tenantId/settlements
// ---------------------------------------------------------------------------
router.get("/tenants/:tenantId/settlements", async (c) => {
  const tenantId = c.req.param("tenantId");
  const q = ListQuerySchema.safeParse(c.req.query());
  if (!q.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: q.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const guard = await requireTenantMember(c.env, userId, tenantId);
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);

  const db = getDb(c.env.kongsian_db);
  const ps = await db
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(eq(partnerships.tenantId, tenantId));
  const partnershipIds = ps.map((p) => p.id);
  if (partnershipIds.length === 0) {
    return c.json({ ok: true, data: { settlements: [] } });
  }

  const filters = [inArray(settlements.partnershipId, partnershipIds)];
  if (q.data.status) filters.push(eq(settlements.status, q.data.status));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(settlements)
    .where(where)
    .orderBy(desc(settlements.weekStartDate))
    .limit(q.data.limit)
    .offset(q.data.offset);

  return c.json({ ok: true, data: { settlements: rows } });
});

// ---------------------------------------------------------------------------
// GET /v1/settlements/:id
// ---------------------------------------------------------------------------
router.get("/settlements/:id", async (c) => {
  const id = c.req.param("id");
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const guard = await loadAccessibleSettlement(
    c.env,
    userId,
    user.globalRole,
    id
  );
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);

  const db = getDb(c.env.kongsian_db);
  const lines = await db
    .select({
      line: settlementLines,
      skuCode: skus.code,
      skuName: skus.name,
    })
    .from(settlementLines)
    .innerJoin(skus, eq(skus.id, settlementLines.skuId))
    .where(eq(settlementLines.settlementId, id));

  return c.json({
    ok: true,
    data: {
      settlement: guard.settlement,
      lines: lines.map((l) => ({ ...l.line, sku: { code: l.skuCode, name: l.skuName } })),
      partnership: guard.partnership,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/settlements/:id/approve
// ---------------------------------------------------------------------------
router.post("/settlements/:id/approve", async (c) => {
  const id = c.req.param("id");
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const guard = await loadAccessibleSettlement(c.env, userId, user.globalRole, id);
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);
  if (guard.role !== "BRAND" && user.globalRole !== "PLATFORM_ADMIN") {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }

  const db = getDb(c.env.kongsian_db);
  const now = nowSec();
  const updated = await db
    .update(settlements)
    .set({
      status: "BRAND_APPROVED",
      approvedByUserId: userId,
      approvedAt: now,
    })
    .where(
      and(
        eq(settlements.id, id),
        // Allow from DRAFT or PENDING_BRAND
        inArray(settlements.status, ["DRAFT", "PENDING_BRAND"])
      )
    )
    .returning();

  if (updated.length === 0) {
    return c.json(
      { ok: false, error: { code: "INVALID_STATE", message: "Not in DRAFT or PENDING_BRAND." } },
      409
    );
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SETTLEMENT_APPROVED",
    entityType: "settlement",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ status: "BRAND_APPROVED" }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, data: { settlement: updated[0] } });
});

// ---------------------------------------------------------------------------
// POST /v1/settlements/:id/payment-proof
// ---------------------------------------------------------------------------
router.post("/settlements/:id/payment-proof", async (c) => {
  const id = c.req.param("id");
  const body = PaymentProofSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const guard = await loadAccessibleSettlement(c.env, userId, user.globalRole, id);
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);
  if (guard.role !== "BRAND" && user.globalRole !== "PLATFORM_ADMIN") {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }

  const db = getDb(c.env.kongsian_db);
  const now = nowSec();
  const updated = await db
    .update(settlements)
    .set({
      paymentProofR2Key: body.data.r2Key,
      paymentNote: body.data.note ?? null,
    })
    .where(eq(settlements.id, id))
    .returning();

  if (updated.length === 0) {
    return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SETTLEMENT_PAYMENT_PROOF",
    entityType: "settlement",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ r2Key: body.data.r2Key }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, data: { settlement: updated[0] } });
});

// ---------------------------------------------------------------------------
// POST /v1/settlements/:id/mark-paid
// ---------------------------------------------------------------------------
router.post("/settlements/:id/mark-paid", async (c) => {
  const id = c.req.param("id");
  const body = MarkPaidSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const guard = await loadAccessibleSettlement(c.env, userId, user.globalRole, id);
  if (!guard.ok) return c.json({ ok: false, error: { code: guard.error } }, guard.code);
  if (guard.role !== "BRAND" && user.globalRole !== "PLATFORM_ADMIN") {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }

  // Require payment proof
  if (!guard.settlement.paymentProofR2Key) {
    return c.json(
      {
        ok: false,
        error: {
          code: "PROOF_REQUIRED",
          message: "Upload payment proof first via /v1/settlements/:id/payment-proof.",
        },
      },
      422
    );
  }

  const db = getDb(c.env.kongsian_db);
  const now = nowSec();
  const updated = await db
    .update(settlements)
    .set({
      status: "PAID",
      paidAt: now,
      paidByUserId: userId,
      paymentNote: body.data.note ?? guard.settlement.paymentNote,
    })
    .where(and(eq(settlements.id, id), eq(settlements.status, "BRAND_APPROVED")))
    .returning();

  if (updated.length === 0) {
    return c.json(
      { ok: false, error: { code: "INVALID_STATE", message: "Not in BRAND_APPROVED." } },
      409
    );
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SETTLEMENT_PAID",
    entityType: "settlement",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ status: "PAID" }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, data: { settlement: updated[0] } });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/settlements/generate  (admin OR cron via X-Cron-Secret header)
// ---------------------------------------------------------------------------
router.post("/admin/settlements/generate", async (c) => {
  const body = GenerateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }

  // Auth check: admin OR X-Cron-Secret header
  const cronSecret = c.req.header("x-cron-secret");
  const expected = c.env.CRON_SECRET;
  if (cronSecret && expected && cronSecret === expected) {
    // OK — cron-triggered
  } else {
    const { userId } = c.get("auth");
    const user = await getUser(c);
    if (!user || user.globalRole !== "PLATFORM_ADMIN") {
      return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
    }
  }

  const result = await generateSettlements(c.env, body.data);

  return c.json({ ok: true, data: result });
});

export { router as settlements };
