// India Standard Time helpers (UTC+5:30, no DST). Business days and months
// are counted in IST, matching the SQL that uses Asia/Kolkata.
const IST_OFFSET_MS = 330 * 60_000;

function istParts(d = new Date()) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), day: ist.getUTCDate() };
}

/** Start of today in IST, as an ISO timestamp. */
export function istDayStartISO(d = new Date()) {
  const { y, m, day } = istParts(d);
  return new Date(Date.UTC(y, m, day) - IST_OFFSET_MS).toISOString();
}

/** First day of the current IST month as YYYY-MM-DD (matches v_revenue_monthly.month). */
export function istMonthStartDate(d = new Date()) {
  const { y, m } = istParts(d);
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(d = new Date()) {
  const { y, m, day } = istParts(d);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysSince(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}
