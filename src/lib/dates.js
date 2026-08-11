/* ------------------------------------------------------------------ *
 * Date helpers — dates stored as local "YYYY-MM-DD" strings.
 * ------------------------------------------------------------------ */
export function pad(n) {
  return String(n).padStart(2, "0");
}
// Local "YYYY-MM-DD" from a Date.
export function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO() {
  return isoOf(new Date());
}
export function parseLocal(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function daysUntil(iso) {
  const target = parseLocal(iso);
  if (!target) return null;
  return Math.round((target - parseLocal(todayISO())) / 86400000);
}
export function formatDate(iso) {
  const d = parseLocal(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
// Follow-up urgency bucket from a date alone.
export function dateStatus(iso) {
  if (!iso) return "none";
  const d = daysUntil(iso);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}
export function relativeFollow(iso) {
  if (!iso) return "No date";
  const d = daysUntil(iso);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `in ${d}d`;
}

// Monday of the week containing `date` (week runs Mon–Sun).
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - dowIndex(date));
  return d;
}
export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
// 0 = Monday … 6 = Sunday, matching DOW_LABELS.
export function dowIndex(date) {
  return (date.getDay() + 6) % 7;
}
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Basic-format date (ICS / Google Calendar): "YYYYMMDD".
export function basicDate(iso) {
  return iso.replace(/-/g, "");
}
export function nextDayBasic(iso) {
  return basicDate(isoOf(addDays(parseLocal(iso), 1)));
}

// Compare two "YYYY-MM-DD" strings, always sinking empty dates to the
// bottom regardless of direction. `dir` is 1 for ascending, -1 for newest first.
export function compareISO(a, b, dir = 1) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return a < b ? -dir : dir;
}
