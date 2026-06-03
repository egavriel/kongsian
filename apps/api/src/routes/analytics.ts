/**
 * Analytics API — Week 4, F3.
 *
 *   GET /v1/analytics/overview?range=7d|30d&tenantId=<id?>
 *   GET /v1/analytics/overview?range=7d|30d&tenantId=<id?>&format=csv
 *
 * IDOR (Opus 4.8 X-2 design):
 *   - brand_member: scoped to own brand. Without ?tenantId= → all of the
 *     brand's partnerships. With ?tenantId= → narrowed to that partnership
 *     (returns 403 if the tenant has no ACTIVE partnership with this brand).
 *   - ops_admin: same as brand_member but can target any brand_id (we only
 *     expose the user's own brand here; ops_admin can switch via /admin).
 *   - tenant_member: NOT allowed (return 403). Tenants don't see
 *     cross-tenant analytics; their own closing page is enough.
 *
 * CSV export (Opus X-2 spec):
 *   - Content-Type: text/csv; charset=utf-8
 *   - Content-Disposition: attachment; filename="kongsian-analytics-{range}-{YYYYMMDD-HHMM}.csv"
 *   - UTF-8 BOM (\\uFEFF) for Excel mojibake protection
 *   - Quote/escape: any value containing `,`, `"`, `\\n`, or `\\r` is wrapped
 *     in `"` and inner `"` doubled to `""`.
 *   - Sections: summary metrics, top_products, tenant_breakdown, daily_series.
 */
import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, partnerships, brands } from "@kongsian/db";
import { authMiddleware, getUser, type AuthContext } from "../lib/auth";
import {
  computeRange,
  resolvePartnershipsForBrand,
  topProducts,
  tenantBreakdown,
  dailySeries,
  summaryMetrics,
  type AnalyticsRange,
} from "../lib/analytics";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

const router = new Hono<RouteEnv>();
router.use("*", authMiddleware);

const OverviewQuery = z.object({
  range: z.enum(["7d", "30d"]).default("7d"),
  tenantId: z.string().min(1).max(64).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

// ---------------------------------------------------------------------------
// IDOR helper: resolve brand scope for caller (Opus 4.8 X-2).
//
// Returns a discriminated union mirroring loadAccessibleSettlement.
//   - { ok: true, brandId } — caller can read analytics for this brand.
//   - { ok: false, code: 403, error } — caller may not read this brand.
//   - { ok: false, code: 404, error } — brand/tenant not found / not in scope.
// ---------------------------------------------------------------------------
type BrandScopeResult =
  | { ok: true; brandId: string; partnershipIdFilter: string | null }
  | { ok: false; code: 403 | 404; error: string };

async function loadBrandOrAllAccess(
  env: Bindings,
  userId: string,
  userGlobalRole: string,
  tenantIdParam: string | undefined
): Promise<BrandScopeResult> {
  const db = getDb(env.kongsian_db);

  if (tenantIdParam) {
    // Resolve the tenant's partnership(s). A tenant may have multiple
    // partnerships with the same brand (uncommon but allowed by the schema);
    // we collapse to one row per (tenant, brand) for IDOR purposes.
    const rows = await db
      .select({ brandId: partnerships.brandId, status: partnerships.status })
      .from(partnerships)
      .where(and(eq(partnerships.tenantId, tenantIdParam), eq(partnerships.status, "ACTIVE")));
    if (rows.length === 0) {
      return { ok: false, code: 404, error: "TENANT_NOT_FOUND" };
    }
    // Find the brand the caller owns. If multiple brands share this
    // tenant (rare), we accept any one the caller is a brand_member of.
    const owned = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.userId, userId),
          inArray(
            brands.id,
            rows.map((r) => r.brandId)
          )
        )
      );
    if (owned.length === 0 && userGlobalRole !== "PLATFORM_ADMIN") {
      return { ok: false, code: 403, error: "FORBIDDEN" };
    }
    if (userGlobalRole === "PLATFORM_ADMIN" && owned.length === 0) {
      // ops_admin without a specific owned brand: pick the first ACTIVE
      // partnership's brand (super-rare, just to avoid 403 for ops staff).
      return { ok: true, brandId: rows[0].brandId, partnershipIdFilter: null };
    }
    return { ok: true, brandId: owned[0].id, partnershipIdFilter: null };
  }

  // No ?tenantId= — caller wants the whole brand. Find the brand they own.
  const [owned] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.userId, userId))
    .limit(1);
  if (owned) return { ok: true, brandId: owned.id, partnershipIdFilter: null };

  if (userGlobalRole === "PLATFORM_ADMIN") {
    // ops_admin with no owned brand: deny rather than synthesize one. They
    // should pick a brand_id via /admin endpoints.
    return { ok: false, code: 403, error: "FORBIDDEN" };
  }
  return { ok: false, code: 403, error: "BRAND_NOT_FOUND" };
}

// ---------------------------------------------------------------------------
// GET /v1/analytics/overview
// ---------------------------------------------------------------------------
router.get("/analytics/overview", async (c) => {
  const { userId } = c.get("auth");
  const user = await getUser(c);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);

  // Brand/tenant membership is derived from partnerships/tenants (I10).
  // Anyone except ops_admin must be a brand owner (have a brand row) to
  // see analytics. Tenants are rejected here even though they may have
  // tenant_memberships — analytics is brand-side.
  if (user.globalRole !== "PLATFORM_ADMIN") {
    // Check they own at least one brand; if not, 403.
    const db = getDb(c.env.kongsian_db);
    const [hasBrand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.userId, userId))
      .limit(1);
    if (!hasBrand) {
      return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
    }
  }

  const parsed = OverviewQuery.safeParse({
    range: c.req.query("range"),
    tenantId: c.req.query("tenantId"),
    format: c.req.query("format"),
  });
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "INVALID_QUERY", message: parsed.error.message } },
      400
    );
  }
  const { range, tenantId, format } = parsed.data;

  const scope = await loadBrandOrAllAccess(c.env, userId, user.globalRole, tenantId);
  if (!scope.ok) return c.json({ ok: false, error: { code: scope.error } }, scope.code);

  const analyticsRange: AnalyticsRange = computeRange(range);

  // If ?tenantId= was given and the tenant isn't a partnership of this
  // brand, we may have approved the brand but need to narrow further.
  let partnershipIds = await resolvePartnershipsForBrand(
    c.env.kongsian_db,
    scope.brandId,
    null
  );
  if (tenantId) {
    // Narrow to this tenant only.
    const db = getDb(c.env.kongsian_db);
    const tenantPartnerships = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .where(
        and(
          eq(partnerships.tenantId, tenantId),
          eq(partnerships.brandId, scope.brandId),
          eq(partnerships.status, "ACTIVE")
        )
      );
    if (tenantPartnerships.length === 0) {
      // The tenant has no ACTIVE partnership with this brand. The X-2
      // design says 404 here (resource truly does not exist from the
      // caller's perspective).
      return c.json({ ok: false, error: { code: "TENANT_NOT_IN_BRAND" } }, 404);
    }
    partnershipIds = tenantPartnerships.map((r) => r.id);
  }

  // Run all 4 queries in parallel — they're independent.
  const [summary, top, tenants, daily] = await Promise.all([
    summaryMetrics(c.env.kongsian_db, partnershipIds, analyticsRange),
    topProducts(c.env.kongsian_db, partnershipIds, analyticsRange, 5),
    tenantBreakdown(c.env.kongsian_db, partnershipIds, analyticsRange),
    dailySeries(c.env.kongsian_db, partnershipIds, analyticsRange),
  ]);

  if (format === "csv") {
    return csvResponse(range, `
${csvSection("SUMMARY", [
  ["Total Revenue (IDR)", String(summary.totalRevenueIdr)],
  ["Total Units Sold", String(summary.totalUnits)],
  ["Closings", String(summary.closingCount)],
  ["Disputes", String(summary.disputeCount)],
  ["Avg Daily Revenue (IDR)", String(summary.avgDailyRevenueIdr)],
  ["Range Start", analyticsRange.start],
  ["Range End", analyticsRange.end],
  ["Tenant Filter", tenantId ?? "(all)"],
])}
${csvSection("TOP PRODUCTS", [
  ["SKU Code", "SKU Name", "Qty Sold", "Revenue (IDR)"],
  ...top.map((p) => [p.skuCode, p.skuName, String(p.qtySold), String(p.revenueIdr)]),
])}
${csvSection("TENANT BREAKDOWN", [
  ["Tenant", "Qty Sold", "Revenue (IDR)", "Closings", "Settlements"],
  ...tenants.map((t) => [t.tenantName, String(t.qtySold), String(t.revenueIdr), String(t.closingCount), String(t.settleCount)]),
])}
${csvSection("DAILY SERIES", [
  ["Date", "Units", "Revenue (IDR)"],
  ...daily.map((d) => [d.date, String(d.units), String(d.revenueIdr)]),
])}
`);
  }

  return c.json({
    ok: true,
    data: {
      range: analyticsRange,
      summary,
      topProducts: top,
      tenantBreakdown: tenants,
      dailySeries: daily,
    },
  });
});

// ---------------------------------------------------------------------------
// CSV helpers (Opus X-2 spec: BOM, quote escaping, attachment disposition)
// ---------------------------------------------------------------------------

/** RFC 4180-style escape: wrap in quotes if value contains `,` `"` `\n` `\r`. */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Render a CSV section with a header line + data rows. */
function csvSection(title: string, rows: string[][]): string {
  const lines: string[] = [];
  lines.push(csvEscape(title));
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

/** Build a CSV Response with BOM + attachment headers. */
function csvResponse(range: string, body: string): Response {
  const bom = "\uFEFF";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 13);
  return new Response(bom + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kongsian-analytics-${range}-${stamp}.csv"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
}

export { router as analytics };
