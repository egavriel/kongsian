/**
 * Shared constants for Kongsian.
 * Single source of truth — both web and api import from here.
 */

export const APP_NAME = "Kongsian";
export const APP_TAGLINE = "Titip. Terjual. Settle.";
export const APP_DESCRIPTION =
  "Stock consignment management for Indonesian brand↔cafe partnerships. Track Titip, Terjual, and weekly settlements in one place.";

/** Indonesian Rupiah — no decimals. */
export const CURRENCY = "IDR" as const;
export const CURRENCY_LOCALE = "id-ID" as const;

/** Format integer IDR as "Rp 42.000". */
export function formatIdr(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Canonical timezone for the MVP. */
export const TIMEZONE = "Asia/Jakarta" as const;
export const TIMEZONE_OFFSET_HOURS = 7; // WIB = UTC+7

/** OTP / session defaults (overridable via env). */
export const OTP_TTL_SECONDS = 300; // 5 min
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Indonesian mobile numbers: +62 followed by 9-12 digits, total E.164 length 11-14. */
export const PHONE_E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** D1 binding name — keep in sync with wrangler.toml. */
export const D1_BINDING = "kongsian_db";

/** Split default — 70/30 brand/tenant in basis points. */
export const DEFAULT_SPLIT_BRAND_BPS = 7000;
export const DEFAULT_SPLIT_TENANT_BPS = 3000;
export const BPS_DENOMINATOR = 10000;

/** Settlement: Sunday 23:59 WIB triggers weekly settlement generation. */
export const SETTLEMENT_CRON_DAY = 0; // Sunday
export const SETTLEMENT_CRON_HOUR_UTC = 16; // 23:59 WIB = 16:59 UTC
