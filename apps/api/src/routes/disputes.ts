/**
 * Disputes API — Week 3, Track B.
 *
 *   GET  /v1/disputes                              list (caller's partnerships only)
 *   GET  /v1/disputes/:id                          detail + thread + related line/closing
 *   POST /v1/disputes/:id/messages                 post a chat message (body, optional photo)
 *   POST /v1/disputes/:id/resolve                  mark resolved (snapshot role → RESOLVED_*)
 *
 * Auth: bearer session + assertPartnershipAccess(dispute.partnershipId).
 * Brand owner → BRAND role. Tenant member → TENANT role. PLATFORM_ADMIN → ADMIN.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  disputes,
  disputeMessages,
  dailyClosings,
  dailyClosingLines,
  partnerships,
  brands,
  tenants,
  skus,
  users,
  auditLog,
} from "@kongsian/db";
import { authMiddleware, getUser, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

const router = new Hono<RouteEnv>();
router.use("*", authMiddleware);

const MessageSchema = z.object({
  body: z.string().min(1).max(2000),
  photoR2Key: z.string().max(256).optional(),
});

const ResolveSchema = z.object({
  resolution: z.string().min(1).max(2000),
  resolutionNotes: z.string().max(2000).optional(),
});

const ListQuerySchema = z.object({
  status: z
    .enum(["OPEN", "RESOLVED_BRAND", "RESOLVED_TENANT", "RESOLVED_ADMIN"])
    .optional(),
  partnershipId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Discover the caller's role in the given partnership. */
async function getCallerRole(
  env: Bindings,
  userId: string,
  partnership: typeof partnerships.$inferSelect,
  userGlobalRole: string
): Promise<"BRAND" | "TENANT" | "ADMIN" | null> {
  if (userGlobalRole === "PLATFORM_ADMIN") return "ADMIN";
  const db = getDb(env.kongsian_db);
  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, partnership.brandId))
    .limit(1);
  if (brand && brand.userId === userId) return "BRAND";
  // Tenant member check would need tenants → memberships. To stay tight, do a quick inner join:
  const { tenantMemberships } = await import("@kongsian/db");
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
  if (mem) return "TENANT";
  return null;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// GET /v1/disputes
// ---------------------------------------------------------------------------
router.get("/", async (c) => {
  const q = ListQuerySchema.safeParse(c.req.query());
  if (!q.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: q.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const db = getDb(c.env.kongsian_db);

  // Build the set of partnerships the caller has access to.
  const accessiblePartnershipIds: string[] = [];

  // BRAND-side: partnerships whose brand.userId === caller.
  const myBrands = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.userId, userId));
  if (myBrands.length > 0) {
    const brandIds = myBrands.map((b) => b.id);
    const myPartnershipsAsBrand = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .where(inArray(partnerships.brandId, brandIds));
    accessiblePartnershipIds.push(...myPartnershipsAsBrand.map((p) => p.id));
  }

  // TENANT-side: partnerships whose tenant has a membership for the caller.
  const { tenantMemberships } = await import("@kongsian/db");
  const myMemberships = await db
    .select({ tenantId: tenantMemberships.tenantId })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId));
  if (myMemberships.length > 0) {
    const tenantIds = myMemberships.map((m) => m.tenantId);
    const myPartnershipsAsTenant = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .where(inArray(partnerships.tenantId, tenantIds));
    accessiblePartnershipIds.push(...myPartnershipsAsTenant.map((p) => p.id));
  }

  // PLATFORM_ADMIN sees all (no scoping needed).
  if (user.globalRole === "PLATFORM_ADMIN" && accessiblePartnershipIds.length === 0) {
    // Pass-through: don't filter by partnership
  }

  // Apply optional filter
  const filters = [];
  if (q.data.partnershipId) {
    if (
      user.globalRole !== "PLATFORM_ADMIN" &&
      !accessiblePartnershipIds.includes(q.data.partnershipId)
    ) {
      return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
    }
    filters.push(eq(disputes.partnershipId, q.data.partnershipId));
  } else if (user.globalRole !== "PLATFORM_ADMIN") {
    if (accessiblePartnershipIds.length === 0) {
      return c.json({ ok: true, data: { disputes: [], total: 0 } });
    }
    filters.push(inArray(disputes.partnershipId, accessiblePartnershipIds));
  }
  if (q.data.status) filters.push(eq(disputes.status, q.data.status));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      dispute: disputes,
      closingDate: dailyClosings.closingDate,
      closingId: dailyClosings.id,
      closingStatus: dailyClosings.status,
      skuId: dailyClosingLines.skuId,
      skuCode: skus.code,
      skuName: skus.name,
      partnershipId: partnerships.id,
      brandId: partnerships.brandId,
      brandName: brands.name,
      tenantId: partnerships.tenantId,
      tenantName: tenants.name,
    })
    .from(disputes)
    .innerJoin(dailyClosingLines, eq(dailyClosingLines.id, disputes.dailyClosingLineId))
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .innerJoin(skus, eq(skus.id, dailyClosingLines.skuId))
    .innerJoin(partnerships, eq(partnerships.id, disputes.partnershipId))
    .innerJoin(brands, eq(brands.id, partnerships.brandId))
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .where(where)
    .orderBy(desc(disputes.createdAt))
    .limit(q.data.limit)
    .offset(q.data.offset);

  return c.json({
    ok: true,
    data: {
      disputes: rows.map((r) => ({
        ...r.dispute,
        closingDate: r.closingDate,
        closingId: r.closingId,
        closingStatus: r.closingStatus,
        sku: { id: r.skuId, code: r.skuCode, name: r.skuName },
        partnership: {
          id: r.partnershipId,
          brand: { id: r.brandId, name: r.brandName },
          tenant: { id: r.tenantId, name: r.tenantName },
        },
      })),
      limit: q.data.limit,
      offset: q.data.offset,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /v1/disputes/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
  const db = getDb(c.env.kongsian_db);

  const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!dispute) return c.json({ ok: false, error: { code: "DISPUTE_NOT_FOUND" } }, 404);

  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.id, dispute.partnershipId))
    .limit(1);
  if (!partnership) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);

  const role = await getCallerRole(c.env, userId, partnership, user.globalRole);
  if (!role) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  // Messages
  const messages = await db
    .select({
      message: disputeMessages,
      authorName: users.name,
    })
    .from(disputeMessages)
    .innerJoin(users, eq(users.id, disputeMessages.authorUserId))
    .where(eq(disputeMessages.disputeId, id))
    .orderBy(asc(disputeMessages.createdAt));

  // Related line + closing
  const [line] = await db
    .select()
    .from(dailyClosingLines)
    .where(eq(dailyClosingLines.id, dispute.dailyClosingLineId))
    .limit(1);
  const [closing] = line
    ? await db
        .select()
        .from(dailyClosings)
        .where(eq(dailyClosings.id, line.dailyClosingId))
        .limit(1)
    : [];
  const [sku] = line
    ? await db.select().from(skus).where(eq(skus.id, line.skuId)).limit(1)
    : [];

  return c.json({
    ok: true,
    data: {
      dispute,
      messages: messages.map((m) => ({ ...m.message, authorName: m.authorName })),
      line,
      closing,
      sku,
      partnership: {
        id: partnership.id,
        brandId: partnership.brandId,
        tenantId: partnership.tenantId,
      },
      callerRole: role,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/disputes/:id/messages
// ---------------------------------------------------------------------------
router.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const body = MessageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
  const db = getDb(c.env.kongsian_db);

  const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!dispute) return c.json({ ok: false, error: { code: "DISPUTE_NOT_FOUND" } }, 404);

  // Reject if RESOLVED_*
  if (dispute.status !== "OPEN") {
    return c.json(
      { ok: false, error: { code: "DISPUTE_RESOLVED", message: "Cannot post to a resolved dispute." } },
      409
    );
  }

  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.id, dispute.partnershipId))
    .limit(1);
  if (!partnership) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);

  const role = await getCallerRole(c.env, userId, partnership, user.globalRole);
  if (!role) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const now = nowSec();
  const messageId = crypto.randomUUID();
  await db.insert(disputeMessages).values({
    id: messageId,
    disputeId: id,
    authorUserId: userId,
    authorRole: role,
    body: body.data.body,
    photoR2Key: body.data.photoR2Key ?? null,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "DISPUTE_MESSAGE_POSTED",
    entityType: "dispute",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ messageId, role }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [inserted] = await db
    .select()
    .from(disputeMessages)
    .where(eq(disputeMessages.id, messageId))
    .limit(1);
  return c.json({ ok: true, data: { message: inserted } }, 201);
});

// ---------------------------------------------------------------------------
// POST /v1/disputes/:id/resolve
// ---------------------------------------------------------------------------
router.post("/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const body = ResolveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
  const db = getDb(c.env.kongsian_db);

  const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!dispute) return c.json({ ok: false, error: { code: "DISPUTE_NOT_FOUND" } }, 404);

  if (dispute.status !== "OPEN") {
    // Idempotent: return existing
    return c.json({ ok: true, data: { dispute, alreadyResolved: true } });
  }

  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.id, dispute.partnershipId))
    .limit(1);
  if (!partnership) return c.json({ ok: false, error: { code: "PARTNERSHIP_NOT_FOUND" } }, 404);

  const role = await getCallerRole(c.env, userId, partnership, user.globalRole);
  if (!role) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const targetStatus =
    role === "BRAND"
      ? "RESOLVED_BRAND"
      : role === "TENANT"
        ? "RESOLVED_TENANT"
        : "RESOLVED_ADMIN";

  const now = nowSec();
  // Conditional update: only flip if still OPEN (race-safe)
  const updated = await db
    .update(disputes)
    .set({
      status: targetStatus,
      resolutionNotes: body.data.resolution,
      resolvedByUserId: userId,
      resolvedAt: now,
    })
    .where(and(eq(disputes.id, id), eq(disputes.status, "OPEN")))
    .returning();

  if (updated.length === 0) {
    // Lost the race — return current
    const [current] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
    return c.json({ ok: true, data: { dispute: current, alreadyResolved: true } });
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "DISPUTE_RESOLVED",
    entityType: "dispute",
    entityId: id,
    beforeJson: JSON.stringify({ status: "OPEN" }),
    afterJson: JSON.stringify({ status: targetStatus, role }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, data: { dispute: updated[0] } });
});

export { router as disputes };
