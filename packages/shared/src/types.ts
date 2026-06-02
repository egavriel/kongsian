/**
 * Shared TypeScript types — kept in sync with @kongsian/db schema.
 * These are runtime-free shapes; use schema.ts for actual Drizzle rows.
 */

export type UserRole = "BRAND" | "TENANT" | "ADMIN";
export type GlobalRole = "USER" | "PLATFORM_ADMIN";

export type PartnershipStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ENDED";
export type StockMovementKind =
  | "TITIP"
  | "TARIK"
  | "TERJUAL_OPENING"
  | "TERJUAL_CORRECTION"
  | "ADJUSTMENT";
export type DailyClosingStatus = "OPEN" | "SUBMITTED" | "LOCKED";
export type SettlementStatus =
  | "DRAFT"
  | "PENDING_BRAND"
  | "BRAND_APPROVED"
  | "PAID"
  | "DISPUTED";
export type DisputeStatus =
  | "OPEN"
  | "RESOLVED_BRAND"
  | "RESOLVED_TENANT"
  | "RESOLVED_ADMIN";
export type OtpPurpose = "LOGIN" | "INVITE";
export type TenantMembershipRole = "OWNER" | "STAFF";

export interface PublicUser {
  id: string;
  phoneE164: string;
  name: string;
  globalRole: GlobalRole;
}

export interface SessionContext {
  user: PublicUser;
  sessionId: string;
  expiresAt: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

/** Audit log action enum — append-only, never remove values. */
export type AuditAction =
  | "USER_CREATED"
  | "OTP_SENT"
  | "OTP_VERIFIED"
  | "LOGIN_SUCCESS"
  | "LOGOUT"
  | "BRAND_CREATED"
  | "BRAND_UPDATED"
  | "TENANT_CREATED"
  | "TENANT_UPDATED"
  | "PARTNERSHIP_CREATED"
  | "PARTNERSHIP_ACTIVATED"
  | "PARTNERSHIP_SUSPENDED"
  | "PARTNERSHIP_ENDED"
  | "SKU_CREATED"
  | "SKU_UPDATED"
  | "PRICE_OVERRIDE_CHANGED"
  | "MOVEMENT_SUBMITTED"
  | "CLOSING_OPENED"
  | "CLOSING_SUBMITTED"
  | "CLOSING_LOCKED"
  | "SETTLEMENT_GENERATED"
  | "SETTLEMENT_APPROVED"
  | "SETTLEMENT_PAID"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESOLVED";
