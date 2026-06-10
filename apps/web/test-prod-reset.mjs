// Production smoke test for the deployed Stok Awal + Reset.
import { chromium } from "playwright";

const WEB = "https://7c1e33aa.kongsian-web.pages.dev";
const log = (...a) => console.log("[t]", ...a);
const fail = (m) => { console.error("[FAIL]", m); process.exit(1); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 1200 } });
  const page = await ctx.newPage();
  page.on("dialog", async (d) => { log("dialog:", d.message().split("\n")[0]); await d.accept(); });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  await page.route("**/v1/brands/me", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { brandId: "b1" } }) }));
  await page.route("**/v1/brands/b1", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { partnerships: [{ id: "p1", status: "ACTIVE", tenant: { id: "t1", name: "Kafe Test" } }] } }) }));
  await page.route("**/v1/skus**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: [{ id: "sku-x", code: "DC", name: "Double Choco", priceIdr: 42000 }] }) }));
  await page.route("**/v1/movements/sisa-sistem**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { upTo: "2026-06-10", partnershipId: "p1", bySku: [{ skuId: "sku-x", code: "DC", name: "D", priceIdr: 42000, sisa: 5 }] } }) }));
  let lastDelete = null;
  await page.route("**/v1/movements**", (r) => {
    if (r.request().method() === "DELETE") {
      lastDelete = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { deletedIds: ["m1"], count: 1 } }) });
    }
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) });
  });
  await page.addInitScript(() => { localStorage.setItem("kongsian_session", "smoke"); });
  await page.goto(WEB + "/dashboard/brand/ops/new", { waitUntil: "networkidle" });

  // Reset button must exist
  const exists = await page.locator("#stok-awal-reset").count();
  if (exists !== 1) fail("Reset button not in DOM");
  log("✓ Reset button rendered in prod");

  // Should be hidden initially (no saved data)
  const hiddenInit = !(await page.locator("#stok-awal-reset").isVisible());
  if (!hiddenInit) fail("Reset should be hidden when no saved data");
  log("✓ Reset hidden when no saved data");

  // Now mock saved data and reload
  await page.unroute("**/v1/movements**");
  await page.route("**/v1/movements**", (r) => {
    if (r.request().method() === "DELETE") {
      lastDelete = JSON.parse(r.request().postData() || "{}");
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { deletedIds: ["m1"], count: 1 } }) });
    }
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: [
      { id: "m1", kind: "ADJUSTMENT", qty: 3, reason: "Stok awal partnership", movementDate: new Date().toISOString().slice(0, 10), skuId: "sku-x", partnershipId: "p1" }
    ] }) });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.selectOption("#partnership", "p1");
  await page.waitForTimeout(600);

  // Reset button should be visible
  const visAfter = await page.locator("#stok-awal-reset").isVisible();
  if (!visAfter) fail("Reset should be visible when saved data exists");
  log("✓ Reset visible after saved data");

  // Click reset
  await page.click("#stok-awal-reset");
  await page.waitForTimeout(800);
  if (!lastDelete) fail("DELETE not captured");
  if (lastDelete.partnershipId !== "p1") fail("Wrong pid: " + lastDelete.partnershipId);
  if (lastDelete.reason !== "Stok awal partnership") fail("Wrong reason: " + lastDelete.reason);
  log("✓ DELETE payload correct:", JSON.stringify(lastDelete));

  await browser.close();
  log("ALL CHECKS PASSED ✓");
})().catch((e) => { console.error(e); process.exit(1); });
