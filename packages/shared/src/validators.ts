/**
 * Zod validators — shared between web forms and api handlers.
 * Import side: `import { PhoneSchema, OtpRequestSchema } from "@kongsian/shared/validators"`.
 */
import { z } from "zod";
import { PHONE_E164_REGEX } from "./constants";

/** E.164 phone, e.g. +6281234567890. */
export const PhoneSchema = z
  .string()
  .min(10, "Phone too short")
  .max(16, "Phone too long")
  .regex(PHONE_E164_REGEX, "Phone must be E.164 (e.g. +6281234567890)");

/** 6-digit OTP code. */
export const OtpCodeSchema = z
  .string()
  .length(6, "OTP must be 6 digits")
  .regex(/^\d{6}$/, "OTP must be 6 digits");

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(["LOGIN", "INVITE"]).default("LOGIN"),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
  purpose: z.enum(["LOGIN", "INVITE"]).default("LOGIN"),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

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
