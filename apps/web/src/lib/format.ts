/** Format an integer IDR amount as "Rp 42.000". */
export function formatIdr(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Today's date as YYYY-MM-DD (WIB local). */
export function todayWib(): string {
  const d = new Date();
  // Add 7h offset for WIB; then take YYYY-MM-DD.
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Monday of the current week (WIB) as YYYY-MM-DD. */
export function thisWeekStartWib(): string {
  const d = new Date();
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  const day = wib.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // 0=Mon
  wib.setUTCDate(wib.getUTCDate() - diff);
  return wib.toISOString().slice(0, 10);
}

/** Lightweight date label, e.g. "Sen, 02 Jun". */
export function shortDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const fmt = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  return fmt.format(d);
}
