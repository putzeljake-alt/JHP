import { Phone, Mail, MessageCircle } from "lucide-react";
import { Linkedin } from "../ui/icons.jsx";

/* ================================================================== *
 * CONFIG — edit these arrays to reshape the pipeline / channels.
 * ================================================================== */

// Each contact belongs to exactly one stage. Order = board column order.
// `active` = a stage where a missing follow-up date should be FLAGGED
// (it's a live conversation you owe a next move on).
export const STAGES = [
  { id: "to_reach_out", label: "To Reach Out", active: false, tint: "slate" },
  { id: "in_conversation", label: "In Conversation", active: true, tint: "blue" },
  { id: "meeting_scheduled", label: "Meeting Scheduled", active: true, tint: "amber" },
  { id: "met_next_step", label: "Met — Next Step", active: true, tint: "violet" },
  { id: "warm", label: "Warm / Nurturing", active: false, tint: "emerald" },
  { id: "dormant", label: "Dormant", active: false, tint: "stone" },
];

export const CHANNELS = [
  { id: "call", label: "Call", Icon: Phone },
  { id: "email", label: "Email", Icon: Mail },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin },
];

// Calendar reminder presets. `trigger` is the ICS VALARM TRIGGER value;
// null = no alarm. All-day events start at midnight, so "7am that day"
// fires 7 hours after the start (PT7H).
export const REMINDERS = [
  { id: "7am", label: "At 7am that day", short: "7am", trigger: "PT7H" },
  { id: "none", label: "No reminder", short: "Off", trigger: null },
];

// Application pipeline statuses for contacts you've sent your resume to.
export const APP_STATUSES = [
  { id: "applied", label: "Applied", tint: "slate" },
  { id: "interviewing", label: "Interviewing", tint: "blue" },
  { id: "offer", label: "Offer", tint: "emerald" },
  { id: "rejected", label: "Rejected", tint: "stone" },
  { id: "unknown", label: "Unknown", tint: "zinc" },
];

/* ------------------------------------------------------------------ *
 * Stage tint -> static Tailwind classes (kept literal for the JIT).
 * ------------------------------------------------------------------ */
export const TINTS = {
  slate: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 ring-slate-200", col: "border-slate-300" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-200", col: "border-blue-300" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-200", col: "border-amber-300" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-200", col: "border-violet-300" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", col: "border-emerald-300" },
  stone: { dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600 ring-stone-200", col: "border-stone-300" },
  zinc: { dot: "bg-zinc-400", chip: "bg-zinc-50 text-zinc-500 ring-zinc-200 border-dashed", col: "border-zinc-300" },
};

// Shared "look up a config entry by id, falling back to the first one"
// accessor — every config array above is an [{ id, label, … }] list.
const byId = (list) => (id) => list.find((item) => item.id === id) || list[0];

export const stageById = byId(STAGES);
export const channelById = byId(CHANNELS);
export const reminderById = byId(REMINDERS);
export const appStatusById = byId(APP_STATUSES);

export const tintOf = (stageId) => TINTS[stageById(stageId).tint] || TINTS.slate;
export const appTintOf = (statusId) => TINTS[appStatusById(statusId).tint] || TINTS.slate;

export const STORAGE_KEY = "contacts:v1";
export const REVIEW_KEY = "review:v1"; // pending email-based suggestions awaiting approval
