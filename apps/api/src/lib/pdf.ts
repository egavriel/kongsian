/**
 * Settlement PDF renderer (Week 4, F1).
 *
 * Uses pdf-lib (pure JS, Workers-compatible, no Puppeteer).
 * Caches generated PDF bytes in R2 under pdf/settlements/{id}.pdf.
 *
 * Format: A4 portrait, Bahasa Indonesia, IDR no decimal (Rp1.250.000).
 * Sections: header (brand+tenant+week), summary table (per-SKU terjual+omzet),
 * split summary (omzet/brand/tenant), signature block, footer.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { Settlement, SettlementLine } from "@kongsian/db";

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format integer IDR as "Rp1.250.000" (no decimal, dot thousands). */
export function formatIdr(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toString();
  const withDots = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-Rp" : "Rp") + withDots;
}

/** Format date YYYY-MM-DD as "Senin, 09 Juni 2026" (Bahasa Indonesia). */
export function formatDateId(dateStr: string): string {
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = days[dt.getUTCDay()];
  return `${dayName}, ${d} ${months[m - 1]} ${y}`;
}

/** Status label in Bahasa. */
function statusLabel(s: Settlement["status"]): string {
  switch (s) {
    case "DRAFT": return "DRAFT";
    case "PENDING_BRAND": return "MENUNGGU PERSETUJUAN BRAND";
    case "BRAND_APPROVED": return "DISETUJUI BRAND";
    case "PAID": return "LUNAS";
    case "DISPUTED": return "DISPUTE";
    default: return s;
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface LineWithSku {
  line: SettlementLine;
  skuCode: string;
  skuName: string;
}

interface PdfContext {
  settlement: Settlement;
  lines: LineWithSku[];
  brandName: string;
  tenantName: string;
  brandBps: number;
  tenantBps: number;
}

const A4_W = 595.28; // PDF points
const A4_H = 841.89;
const MARGIN = 50;
const COL_LABEL_X = MARGIN;
const COL_VALUE_X = 340;

const COLOR_TEXT = rgb(0.1, 0.1, 0.1);
const COLOR_MUTED = rgb(0.4, 0.4, 0.4);
const COLOR_HEAD = rgb(0.15, 0.25, 0.45);
const COLOR_RULE = rgb(0.7, 0.7, 0.7);
const COLOR_BG_HDR = rgb(0.94, 0.96, 0.99);

export interface RenderResult {
  bytes: Uint8Array;
  filename: string;
}

/**
 * Render a settlement to PDF bytes.
 * Caller is responsible for writing to R2 + storing pdfR2Key in DB.
 */
export async function renderSettlementPdf(ctx: PdfContext): Promise<RenderResult> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = A4_H - MARGIN;

  // --- Header ---
  page.drawText("REKAP SETTLEMENT KONGSIAN", {
    x: MARGIN, y, size: 16, font: fontBold, color: COLOR_HEAD,
  });
  y -= 22;
  page.drawText("Rekap mingguan konsinyasi brand & tenant", {
    x: MARGIN, y, size: 9, font: fontReg, color: COLOR_MUTED,
  });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y },
    thickness: 0.5, color: COLOR_RULE,
  });
  y -= 22;

  // --- Partnership info block ---
  const info: Array<[string, string]> = [
    ["Brand", ctx.brandName],
    ["Tenant", ctx.tenantName],
    ["Periode", `${formatDateId(ctx.settlement.weekStartDate)} s.d. ${formatDateId(ctx.settlement.weekEndDate)}`],
    ["Status", statusLabel(ctx.settlement.status)],
    ["Settlement ID", ctx.settlement.id],
  ];
  for (const [label, value] of info) {
    page.drawText(label, { x: COL_LABEL_X, y, size: 9, font: fontBold, color: COLOR_MUTED });
    page.drawText(value, { x: COL_VALUE_X, y, size: 10, font: fontReg, color: COLOR_TEXT });
    y -= 14;
  }
  y -= 10;

  // --- Per-SKU table ---
  page.drawText("Rincian per SKU", { x: MARGIN, y, size: 11, font: fontBold, color: COLOR_HEAD });
  y -= 16;

  // Table header row
  const colsX = { sku: MARGIN, qty: 330, omzet: 410 };
  const colWidths = { sku: 270, qty: 70, omzet: 130 };
  page.drawRectangle({
    x: MARGIN, y: y - 4, width: A4_W - 2 * MARGIN, height: 16,
    color: COLOR_BG_HDR,
  });
  page.drawText("SKU", { x: colsX.sku + 4, y: y, size: 9, font: fontBold, color: COLOR_TEXT });
  page.drawText("Qty", { x: colsX.qty, y: y, size: 9, font: fontBold, color: COLOR_TEXT });
  page.drawText("Omzet (IDR)", { x: colsX.omzet, y: y, size: 9, font: fontBold, color: COLOR_TEXT });
  y -= 18;

  if (ctx.lines.length === 0) {
    page.drawText("(tidak ada item terjual minggu ini)", {
      x: MARGIN, y, size: 9, font: fontReg, color: COLOR_MUTED,
    });
    y -= 14;
  } else {
    for (const l of ctx.lines) {
      if (y < 120) break; // leave room for summary; ignore overflow for v1
      const code = l.skuCode || "";
      const name = l.skuName || "";
      const label = name.length > 40 ? name.slice(0, 37) + "..." : name;
      const skuLabel = code ? `${code} — ${label}` : label;
      page.drawText(skuLabel, { x: colsX.sku, y, size: 9, font: fontReg, color: COLOR_TEXT });
      page.drawText(String(l.line.qtyTerjual), { x: colsX.qty, y, size: 9, font: fontReg, color: COLOR_TEXT });
      page.drawText(formatIdr(l.line.omzetIdr), {
        x: colsX.omzet, y, size: 9, font: fontReg, color: COLOR_TEXT,
      });
      y -= 13;
    }
  }

  // Rule
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y },
    thickness: 0.5, color: COLOR_RULE,
  });
  y -= 18;

  // --- Summary block ---
  page.drawText("Ringkasan Pembayaran", {
    x: MARGIN, y, size: 11, font: fontBold, color: COLOR_HEAD,
  });
  y -= 16;

  const split: Array<[string, string]> = [
    ["Total qty terjual", String(ctx.settlement.totalTerjual)],
    ["Total omzet", formatIdr(ctx.settlement.totalOmzetIdr)],
    [
      `Bagian brand (${(ctx.brandBps / 100).toFixed(2)}%)`,
      formatIdr(ctx.settlement.brandShareIdr),
    ],
    [
      `Bagian tenant (${(ctx.tenantBps / 100).toFixed(2)}%)`,
      formatIdr(ctx.settlement.tenantShareIdr),
    ],
  ];
  for (const [label, value] of split) {
    page.drawText(label, { x: COL_LABEL_X, y, size: 10, font: fontReg, color: COLOR_TEXT });
    page.drawText(value, {
      x: COL_VALUE_X, y, size: 10, font: fontBold, color: COLOR_TEXT,
    });
    y -= 14;
  }

  // Status watermark if PAID
  if (ctx.settlement.status === "PAID") {
    y -= 6;
    page.drawText("LUNAS", {
      x: A4_W - MARGIN - 60, y, size: 14, font: fontBold, color: rgb(0.1, 0.5, 0.2),
    });
  }

  // --- Signature block ---
  y -= 36;
  page.drawText("Disetujui oleh:", { x: MARGIN, y, size: 9, font: fontBold, color: COLOR_MUTED });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y: y - 30 }, end: { x: MARGIN + 180, y: y - 30 },
    thickness: 0.5, color: COLOR_RULE,
  });
  page.drawText("Brand owner", { x: MARGIN, y: y - 42, size: 8, font: fontReg, color: COLOR_MUTED });
  page.drawLine({
    start: { x: A4_W - MARGIN - 180, y: y - 30 },
    end: { x: A4_W - MARGIN, y: y - 30 },
    thickness: 0.5, color: COLOR_RULE,
  });
  page.drawText("Tenant PIC", { x: A4_W - MARGIN - 180, y: y - 42, size: 8, font: fontReg, color: COLOR_MUTED });

  // --- Footer ---
  const footerY = MARGIN - 10;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 14 }, end: { x: A4_W - MARGIN, y: footerY + 14 },
    thickness: 0.3, color: COLOR_RULE,
  });
  page.drawText(
    `Kongsian · ${ctx.settlement.id} · di-generate ${new Date().toISOString().slice(0, 10)}`,
    { x: MARGIN, y: footerY, size: 7, font: fontReg, color: COLOR_MUTED }
  );

  const bytes = await pdf.save();
  return {
    bytes,
    filename: `settlement-${ctx.settlement.weekStartDate}-${ctx.settlement.id.slice(0, 8)}.pdf`,
  };
}
