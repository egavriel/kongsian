import { Hono } from "hono";
import { and, eq, desc, sql, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  brands,
  skus,
  partnerships,
  tenants,
  tenantMemberships,
  stockMovements,
  dailyClosings,
  dailyClosingLines,
  auditLog,
  users,
} from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import { getRole } from "./brands";
import { signQty } from "./movements";
import { computeSisaSistemBatch } from "../lib/stock";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

const router = new Hono<RouteEnv>();
router.use("*", authMiddleware);

const CombinedSaveSchema = z.object({
  partnershipId: z.string().min(1),
  tenantId: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stokAwalItems: z.array(z.object({ skuId: z.string().min(1), qty: z.number().int().nonnegative() })),
  titipItems: z.array(z.object({ skuId: z.string().min(1), qty: z.number().int().nonnegative() })),
  tarikItems: z.array(z.object({ skuId: z.string().min(1), qty: z.number().int().nonnegative() })),
  terjualLines: z.array(z.object({ skuId: z.string().min(1), terjual: z.number().int().nonnegative() })),
});

function isValidClosingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = new Date().toISOString().slice(0, 10);
  const pastWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date >= pastWindow && date <= today;
}

async function assertPartnershipAccess(
  env: Bindings,
  userId: string,
  partnershipId: string
): Promise<
  | { ok: true; role: "BRAND" | "TENANT"; partnership: typeof partnerships.$inferSelect }
  | { ok: false; code: number; error: string }
> {
  const db = getDb(env.kongsian_db);
  const [p] = await db.select().from(partnerships).where(eq(partnerships.id, partnershipId)).limit(1);
  if (!p) return { ok: false, code: 404, error: "PARTNERSHIP_NOT_FOUND" };

  const [brand] = await db.select().from(brands).where(eq(brands.id, p.brandId)).limit(1);
  if (brand && brand.userId === userId) return { ok: true, role: "BRAND", partnership: p };

  const [mem] = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, p.tenantId)))
    .limit(1);
  if (mem) return { ok: true, role: "TENANT", partnership: p };

  return { ok: false, code: 403, error: "FORBIDDEN" };
}

/**
 * GET /v1/ops/init
 * Load brandId, active partnerships and SKUs in a single quick endpoint.
 */
router.get("/init", async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const isAdmin = user.globalRole === "PLATFORM_ADMIN";
  if (!isAdmin && (user.verificationStatus === "PENDING_VERIFICATION" || user.verificationStatus === "REJECTED")) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VERIFICATION_PENDING",
          message: "Akun kamu belum diverifikasi admin. Tunggu max 1x24 jam.",
        },
      },
      403
    );
  }

  const role = await getRole(db, userId);
  if (!role.brandId) {
    return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND", message: "User has no brand." } }, 404);
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, role.brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);

  const [skuRows, partnershipRows] = await Promise.all([
    db
      .select()
      .from(skus)
      .where(eq(skus.brandId, role.brandId))
      .orderBy(desc(skus.createdAt)),
    db
      .select({
        partnership: partnerships,
        tenant: tenants,
      })
      .from(partnerships)
      .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
      .where(and(eq(partnerships.brandId, role.brandId), eq(partnerships.status, "ACTIVE")))
      .orderBy(desc(partnerships.createdAt)),
  ]);

  return c.json({
    ok: true,
    data: {
      brandId: role.brandId,
      skus: skuRows,
      partnerships: partnershipRows.map((r) => ({ ...r.partnership, tenant: r.tenant })),
    },
  });
});

/**
 * GET /v1/ops/partnership-data
 * Fetch both remaining stock and daily Stok Awal entries in parallel.
 */
router.get("/partnership-data", async (c) => {
  const { userId } = c.get("auth");
  const partnershipId = c.req.query("partnershipId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  if (!partnershipId) return c.json({ ok: false, error: { code: "MISSING_PARTNERSHIP_ID" } }, 400);

  const db = getDb(c.env.kongsian_db);
  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const [sisaMap, stokAwalMovements] = await Promise.all([
    computeSisaSistemBatch(db, partnershipId, date),
    db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.partnershipId, partnershipId),
          eq(stockMovements.movementDate, date),
          eq(stockMovements.kind, "ADJUSTMENT"),
          eq(stockMovements.reason, "Stok awal partnership")
        )
      ),
  ]);

  const sisaSistem: { skuId: string; sisa: number }[] = [];
  sisaMap.forEach((sisa, skuId) => {
    sisaSistem.push({ skuId, sisa });
  });

  const stokAwal: { skuId: string; qty: number }[] = [];
  for (const mv of stokAwalMovements) {
    if ((mv.qty || 0) > 0) {
      stokAwal.push({ skuId: mv.skuId, qty: mv.qty });
    }
  }

  return c.json({
    ok: true,
    data: {
      sisaSistem,
      stokAwal,
    },
  });
});

/**
 * POST /v1/ops/combined-save
 * Combined batch and closing operations within a single database transaction.
 */
router.post("/combined-save", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CombinedSaveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const v = parsed.data;

  const access = await assertPartnershipAccess(c.env, userId, v.partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  if (access.role !== "BRAND") {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Hanya Brand owner yang bisa menyimpan." } }, 403);
  }

  if (v.terjualLines.length > 0 && !isValidClosingDate(v.movementDate)) {
    return c.json({
      ok: false,
      error: { code: "INVALID_DATE", message: "Tanggal closing harus hari ini atau max 30 hari ke belakang." },
    }, 400);
  }

  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);

  try {
    const tx = db;
    // 1) Validate tarik vs sisa
    const sisaMap = await computeSisaSistemBatch(tx as any, v.partnershipId, v.movementDate);
    for (const it of v.tarikItems) {
      if (it.qty === 0) continue;
      const sisa = sisaMap.get(it.skuId) ?? 0;
      if (it.qty > sisa) {
        throw new Error(`Tarik SKU melebihi sisa sistem (${sisa}).`);
      }
    }

    // Upsert movement helper
    const upsertMovement = async (
      skuId: string,
      kind: "TITIP" | "TARIK" | "ADJUSTMENT",
      qty: number,
      reason?: string,
      idempotencyKey?: string
    ) => {
      const idem = idempotencyKey || `${kind.toLowerCase()}-${v.partnershipId}-${v.movementDate}-${skuId}`;

      if (qty === 0) {
        if (kind === "ADJUSTMENT" && reason === "Stok awal partnership") {
          await tx.delete(stockMovements).where(eq(stockMovements.idempotencyKey, idem));
        }
        return;
      }

      const signedQty = signQty(kind, qty);
      const [existing] = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.idempotencyKey, idem))
        .limit(1);

      if (existing) {
        if (existing.qty !== signedQty) {
          await tx
            .update(stockMovements)
            .set({ qty: signedQty, submittedAt: now })
            .where(eq(stockMovements.id, existing.id));

          await tx.insert(auditLog).values({
            id: crypto.randomUUID(),
            userId,
            action: "MOVEMENT_UPDATED",
            entityType: "stock_movement",
            entityId: existing.id,
            beforeJson: JSON.stringify(existing),
            afterJson: JSON.stringify({ ...existing, qty: signedQty, submittedAt: now }),
            ip: c.req.header("cf-connecting-ip") ?? null,
            userAgent: c.req.header("user-agent") ?? null,
            createdAt: now,
          });
        }
      } else {
        const id = crypto.randomUUID();
        await tx.insert(stockMovements).values({
          id,
          partnershipId: v.partnershipId,
          skuId,
          movementDate: v.movementDate,
          kind,
          qty: signedQty,
          reason: reason ?? null,
          submittedByUserId: userId,
          submittedAt: now,
          idempotencyKey: idem,
        });

        await tx.insert(auditLog).values({
          id: crypto.randomUUID(),
          userId,
          action: "MOVEMENT_SUBMITTED",
          entityType: "stock_movement",
          entityId: id,
          beforeJson: null,
          afterJson: JSON.stringify({
            partnershipId: v.partnershipId,
            skuId,
            kind,
            qty: signedQty,
            movementDate: v.movementDate,
          }),
          ip: c.req.header("cf-connecting-ip") ?? null,
          userAgent: c.req.header("user-agent") ?? null,
          createdAt: now,
        });
      }
    };

    // 2) Process Stok Awal
    for (const item of v.stokAwalItems) {
      const idem = `stokAwal-${v.partnershipId}-${v.movementDate}-${item.skuId}`;
      await upsertMovement(item.skuId, "ADJUSTMENT", item.qty, "Stok awal partnership", idem);
    }

    // 3) Process Titip
    for (const item of v.titipItems) {
      const idem = `titip-${v.partnershipId}-${v.movementDate}-${item.skuId}`;
      await upsertMovement(item.skuId, "TITIP", item.qty, undefined, idem);
    }

    // 4) Process Tarik
    for (const item of v.tarikItems) {
      const idem = `tarik-${v.partnershipId}-${v.movementDate}-${item.skuId}`;
      await upsertMovement(item.skuId, "TARIK", item.qty, undefined, idem);
    }

    // 5) Process Terjual / closings
    if (v.terjualLines.length > 0) {
      let [closing] = await tx
        .select()
        .from(dailyClosings)
        .where(and(eq(dailyClosings.partnershipId, v.partnershipId), eq(dailyClosings.closingDate, v.movementDate)))
        .limit(1);

      let closingId = closing?.id;

      if (closing) {
        if (closing.status !== "OPEN") {
          throw new Error("Closing harian sudah disubmit dan tidak dapat diubah.");
        }
      } else {
        closingId = crypto.randomUUID();
        await tx.insert(dailyClosings).values({
          id: closingId,
          partnershipId: v.partnershipId,
          closingDate: v.movementDate,
          status: "OPEN",
          createdAt: now,
        });

        await tx.insert(auditLog).values({
          id: crypto.randomUUID(),
          userId,
          action: "CLOSING_CREATED",
          entityType: "daily_closing",
          entityId: closingId,
          beforeJson: null,
          afterJson: JSON.stringify({ partnershipId: v.partnershipId, closingDate: v.movementDate }),
          ip: c.req.header("cf-connecting-ip") ?? null,
          userAgent: c.req.header("user-agent") ?? null,
          createdAt: now,
        });
      }

      // Upsert lines
      for (const line of v.terjualLines) {
        const [existingLine] = await tx
          .select()
          .from(dailyClosingLines)
          .where(and(eq(dailyClosingLines.dailyClosingId, closingId), eq(dailyClosingLines.skuId, line.skuId)))
          .limit(1);

        if (existingLine) {
          await tx
            .update(dailyClosingLines)
            .set({ terjual: line.terjual })
            .where(eq(dailyClosingLines.id, existingLine.id));
        } else {
          await tx.insert(dailyClosingLines).values({
            id: crypto.randomUUID(),
            dailyClosingId: closingId,
            skuId: line.skuId,
            terjual: line.terjual,
            sisaFisik: 0,
            sisaSistem: 0,
            selisih: 0,
          });
        }
      }

      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId,
        action: "CLOSING_TERJUAL_UPSERT",
        entityType: "daily_closing",
        entityId: closingId,
        beforeJson: null,
        afterJson: JSON.stringify({ lines: v.terjualLines }),
        ip: c.req.header("cf-connecting-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        createdAt: now,
      });

      // Submit the closing
      const result = await tx
        .update(dailyClosings)
        .set({ status: "SUBMITTED", submittedAt: now, submittedByUserId: userId })
        .where(and(eq(dailyClosings.id, closingId), eq(dailyClosings.status, "OPEN")))
        .returning();

      if (result.length === 0) {
        throw new Error("Closing harian gagal disubmit.");
      }

      // Freeze sisaSistem & selisih
      const frozenSisaMap = await computeSisaSistemBatch(tx as any, v.partnershipId, v.movementDate);
      const lines = await tx
        .select()
        .from(dailyClosingLines)
        .where(eq(dailyClosingLines.dailyClosingId, closingId));

      for (const line of lines) {
        const sisaSistem = frozenSisaMap.get(line.skuId) ?? 0;
        const selisih = sisaSistem - line.sisaFisik;
        await tx
          .update(dailyClosingLines)
          .set({ sisaSistem, selisih })
          .where(eq(dailyClosingLines.id, line.id));
      }

      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId,
        action: "CLOSING_SUBMITTED",
        entityType: "daily_closing",
        entityId: closingId,
        beforeJson: JSON.stringify({ status: "OPEN" }),
        afterJson: JSON.stringify({ status: "SUBMITTED", submittedAt: now }),
        ip: c.req.header("cf-connecting-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        createdAt: now,
      });
    }

    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ ok: false, error: { code: "TRANSACTION_FAILED", message: e.message || "Unknown error" } }, 500);
  }
});

/**
 * GET /v1/ops/brand-dashboard
 * Unified load for Brand Dashboard data.
 * Resolves brand ID, queries all partnerships, catalog SKUs, remaining stock per SKU
 * for active partnerships, and sums weekly sales revenue in single queries.
 */
router.get("/brand-dashboard", async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  const isAdmin = user.globalRole === "PLATFORM_ADMIN";
  if (!isAdmin && (user.verificationStatus === "PENDING_VERIFICATION" || user.verificationStatus === "REJECTED")) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VERIFICATION_PENDING",
          message: "Akun kamu belum diverifikasi admin. Tunggu max 1x24 jam.",
        },
      },
      403
    );
  }

  const role = await getRole(db, userId);
  if (!role.brandId) {
    return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND", message: "User has no brand." } }, 404);
  }
  const brandId = role.brandId;

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();

  const [partnershipRows, skuRows, stockRows, revenueRows] = await Promise.all([
    db
      .select({
        partnership: partnerships,
        tenant: tenants,
      })
      .from(partnerships)
      .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
      .where(eq(partnerships.brandId, brandId))
      .orderBy(desc(partnerships.createdAt)),
    db
      .select()
      .from(skus)
      .where(eq(skus.brandId, brandId))
      .orderBy(desc(skus.createdAt)),
    db
      .select({
        partnershipId: stockMovements.partnershipId,
        skuId: stockMovements.skuId,
        sisa: sql<number>`SUM(${stockMovements.qty})`,
      })
      .from(stockMovements)
      .innerJoin(partnerships, eq(partnerships.id, stockMovements.partnershipId))
      .where(and(eq(partnerships.brandId, brandId), eq(partnerships.status, "ACTIVE"), lte(stockMovements.movementDate, today)))
      .groupBy(stockMovements.partnershipId, stockMovements.skuId),
    db
      .select({
        totalRev: sql<number>`SUM(ABS(${stockMovements.qty}) * ${skus.priceIdr})`,
      })
      .from(stockMovements)
      .innerJoin(skus, eq(skus.id, stockMovements.skuId))
      .innerJoin(partnerships, eq(partnerships.id, stockMovements.partnershipId))
      .where(
        and(
          eq(partnerships.brandId, brandId),
          eq(partnerships.status, "ACTIVE"),
          inArray(stockMovements.kind, ["TERJUAL_OPENING", "TERJUAL_CORRECTION"]),
          gte(stockMovements.movementDate, weekStart)
        )
      ),
  ]);

  const sisaSistem: { partnershipId: string; skuId: string; sisa: number }[] = stockRows.map((r) => ({
    partnershipId: r.partnershipId,
    skuId: r.skuId,
    sisa: Number(r.sisa ?? 0),
  }));

  const weeklyRevenue = Number(revenueRows[0]?.totalRev ?? 0);

  return c.json({
    ok: true,
    data: {
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        name: user.name,
      },
      brand: {
        id: brand.id,
        name: brand.name,
      },
      skus: skuRows,
      partnerships: partnershipRows.map((r) => ({ ...r.partnership, tenant: r.tenant })),
      sisaSistem,
      weeklyRevenue,
    },
  });
});

export { router as ops };
