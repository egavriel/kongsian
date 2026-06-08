/**
 * Zod validators — shared between web forms and api handlers.
 * Import side: `import { PhoneSchema, OtpRequestSchema } from "@kongsian/shared/validators"`.
 */
import { z } from "zod";
import { PHONE_E164_REGEX } from "./constants";

/** E.164 phone, e.g. +628****7890. */
export const PhoneSchema = z
  .string()
  .min(10, "Phone too short")
  .max(16, "Phone too long")
  .regex(PHONE_E164_REGEX, "Phone must be E.164 (e.g. +628****7890)");

/** 6-digit OTP code. Accepts the WA message's literal *code* wrapper —
 * the input is normalized (non-digits stripped) before the length/regex
 * check, so copying the bolded code from WhatsApp works. */
export const OtpCodeSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .length(6, "OTP must be 6 digits")
      .regex(/^\d{6}$/, "OTP must be 6 digits")
  );

/** Display name for a new user. */
export const UserNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name too long")
  .trim();

/** Onboarding role chosen at registration. */
export const OnboardingRoleSchema = z.enum(["BRAND", "TENANT"]);

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(["LOGIN", "INVITE"]).default("LOGIN"),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

/**
 * OtpVerifySchema — when the phone is a NEW user, callers MUST supply `name` and
 * `role` so we can create the user row with the right onboarding intent.
 * If the phone is already a registered user, the server silently ignores any
 * name/role in the request — onboarding_role is fixed on first registration.
 */
export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
  purpose: z.enum(["LOGIN", "INVITE"]).default("LOGIN"),
  // Optional on the wire; the API derives them from the existing row if present.
  name: UserNameSchema.optional(),
  role: OnboardingRoleSchema.optional(),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

/** Admin: approve or reject a pending user. */
export const AdminVerifyUserSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().max(280).optional(),
});
export type AdminVerifyUser = z.infer<typeof AdminVerifyUserSchema>;

export const BrandCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "lowercase, digits, and dashes only"),
  description: z.string().max(500).optional(),
});
export type BrandCreate = z.infer<typeof BrandCreateSchema>;

export const TenantCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "lowercase, digits, and dashes only"),
  address: z.string().max(200).optional(),
  picPhoneE164: PhoneSchema,
});
export type TenantCreate = z.infer<typeof TenantCreateSchema>;

export const SkuCreateSchema = z.object({
  brandId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(80),
  priceIdr: z.number().int().positive(),
  costIdr: z.number().int().nonnegative().optional(),
});
export type SkuCreate = z.infer<typeof SkuCreateSchema>;

export const StockMovementSubmitSchema = z.object({
  partnershipId: z.string().min(1),
  skuId: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  kind: z.enum([
    "TITIP",
    "TARIK",
    "TERJUAL_OPENING",
    "TERJUAL_CORRECTION",
    "ADJUSTMENT",
  ]),
  qty: z.number().int(),
  reason: z.string().max(280).optional(),
  idempotencyKey: z.string().uuid(),
});
export type StockMovementSubmit = z.infer<typeof StockMovementSubmitSchema>;

export const PartnershipCreateSchema = z
  .object({
    brandId: z.string().min(1),
    tenantId: z.string().min(1),
    revenueSplitBrandBps: z.number().int().min(0).max(10000),
    revenueSplitTenantBps: z.number().int().min(0).max(10000),
  })
  .refine((v) => v.revenueSplitBrandBps + v.revenueSplitTenantBps === 10000, {
    message: "revenue splits must sum to 10000 bps (100%)",
  });
export type PartnershipCreate = z.infer<typeof PartnershipCreateSchema>;
