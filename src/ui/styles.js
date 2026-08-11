/* ------------------------------------------------------------------ *
 * Shared Tailwind class recipes. Each builder takes the size/shape
 * classes that vary per call site, so the shared look stays in one place.
 * ------------------------------------------------------------------ */
const join = (...parts) => parts.filter(Boolean).join(" ");

const PRIMARY = "inline-flex items-center bg-slate-900 font-medium text-stone-50 transition hover:bg-slate-700";
const OUTLINE =
  "inline-flex items-center border border-slate-200 bg-white font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";
const GHOST = "font-medium text-slate-600 transition hover:bg-slate-100";

export const DEFAULT_BTN_SIZE = "gap-1.5 rounded-lg px-3 py-2 text-sm";

// Dark call-to-action button.
export const btnPrimary = (size = DEFAULT_BTN_SIZE, extra = "") => join(PRIMARY, size, extra);
// White bordered secondary button.
export const btnOutline = (size = DEFAULT_BTN_SIZE, extra = "") => join(OUTLINE, size, extra);
// Borderless tertiary button (Cancel / Dismiss).
export const btnGhost = (size = "rounded-lg px-3 py-2 text-sm", extra = "") => join(GHOST, size, extra);

// Square icon-only button in a toolbar.
export const iconBtnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800";
// Smaller icon-only action attached to a contact row/card.
export const iconActionCls =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";
// Bordered arrow button (week navigator).
export const navBtnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";

// Multi-select pill button (channels, reminder presets).
export const toggleBtnCls = (on) =>
  join(
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
    on ? "border-slate-900 bg-slate-900 text-stone-50" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
  );

// Text input / textarea / full-width select.
export const inputCls = (error) =>
  join(
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:ring-2",
    error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-slate-400 focus:ring-slate-200"
  );

// Compact <select> that wears a tint chip's colors (stage / status pickers).
export const chipSelectCls = (chip, extra = "") =>
  join("rounded-md border-0 py-1 pl-2 pr-7 text-xs font-medium ring-1 focus:ring-2", extra, chip);

// Follow-up urgency colors, keyed by dateStatus().
export const STATUS_STYLES = {
  overdue: "bg-red-50 text-red-700 ring-red-200",
  today: "bg-amber-50 text-amber-700 ring-amber-200",
  week: "bg-sky-50 text-sky-700 ring-sky-200",
  later: "bg-slate-50 text-slate-600 ring-slate-200",
  none: "bg-slate-50 text-slate-400 ring-slate-200",
};

// Count badge tones.
export const PILL_TONES = {
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-200 text-slate-600",
  muted: "bg-slate-100 text-slate-500",
  outline: "bg-white text-slate-500 ring-1 ring-slate-200",
};

// Section heading tones: [heading text, pill tone, note text].
export const HEADING_TONES = {
  red: { text: "text-red-600", pill: "red", note: "text-red-400" },
  blue: { text: "text-blue-600", pill: "blue", note: "text-slate-400" },
  slate: { text: "text-slate-500", pill: "slate", note: "text-slate-400" },
};
