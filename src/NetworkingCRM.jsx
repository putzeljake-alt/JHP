import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Phone,
  Mail,
  MessageCircle,
  Search,
  Plus,
  X,
  Download,
  Upload,
  Trash2,
  Pencil,
  Check,
  CalendarClock,
  CalendarPlus,
  CalendarDays,
  LayoutGrid,
  Table2,
  ListChecks,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserPlus,
  CircleAlert,
  PartyPopper,
  Bell,
  BellOff,
  ListPlus,
  FileText,
} from "lucide-react";

/* ================================================================== *
 * CONFIG — edit these two arrays to reshape the pipeline / channels.
 * ================================================================== */

// Each contact belongs to exactly one stage. Order = board column order.
// `active` = a stage where a missing follow-up date should be FLAGGED
// (it's a live conversation you owe a next move on).
const STAGES = [
  { id: "to_reach_out", label: "To Reach Out", active: false, tint: "slate" },
  { id: "in_conversation", label: "In Conversation", active: true, tint: "blue" },
  { id: "meeting_scheduled", label: "Meeting Scheduled", active: true, tint: "amber" },
  { id: "met_next_step", label: "Met — Next Step", active: true, tint: "violet" },
  { id: "warm", label: "Warm / Nurturing", active: false, tint: "emerald" },
  { id: "dormant", label: "Dormant", active: false, tint: "stone" },
];

const CHANNELS = [
  { id: "call", label: "Call", Icon: Phone },
  { id: "email", label: "Email", Icon: Mail },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
];

// Calendar reminder presets. `trigger` is the ICS VALARM TRIGGER value;
// null = no alarm. All-day events start at midnight, so "7am that day"
// fires 7 hours after the start (PT7H).
const REMINDERS = [
  { id: "7am", label: "At 7am that day", short: "7am", trigger: "PT7H" },
  { id: "none", label: "No reminder", short: "Off", trigger: null },
];
const reminderById = (id) => REMINDERS.find((r) => r.id === id) || REMINDERS[0];

// Application pipeline statuses for contacts you've sent your resume to.
const APP_STATUSES = [
  { id: "applied", label: "Applied", tint: "slate" },
  { id: "interviewing", label: "Interviewing", tint: "blue" },
  { id: "offer", label: "Offer", tint: "emerald" },
  { id: "rejected", label: "Rejected", tint: "stone" },
  { id: "unknown", label: "Unknown", tint: "zinc" },
];
const appStatusById = (id) => APP_STATUSES.find((s) => s.id === id) || APP_STATUSES[0];
// Safe accessor — seed/imported contacts predate the resume field.
const resumeOf = (c) => c.resume || { sent: false, date: "", status: "applied", reason: "" };

const STORAGE_KEY = "contacts:v1";

/* ------------------------------------------------------------------ *
 * Stage tint -> static Tailwind classes (kept literal for the JIT).
 * ------------------------------------------------------------------ */
const TINTS = {
  slate: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 ring-slate-200", col: "border-slate-300" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-200", col: "border-blue-300" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 ring-amber-200", col: "border-amber-300" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-200", col: "border-violet-300" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", col: "border-emerald-300" },
  stone: { dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600 ring-stone-200", col: "border-stone-300" },
  zinc: { dot: "bg-zinc-400", chip: "bg-zinc-50 text-zinc-500 ring-zinc-200 border-dashed", col: "border-zinc-300" },
};
const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
const tintOf = (id) => TINTS[stageById(id).tint] || TINTS.slate;

/* ------------------------------------------------------------------ *
 * Date helpers — dates stored as local "YYYY-MM-DD" strings.
 * ------------------------------------------------------------------ */
function pad(n) {
  return String(n).padStart(2, "0");
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseLocal(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function daysUntil(iso) {
  const target = parseLocal(iso);
  if (!target) return null;
  return Math.round((target - parseLocal(todayISO())) / 86400000);
}
function formatDate(iso) {
  const d = parseLocal(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
// Follow-up urgency bucket from a date alone.
function dateStatus(iso) {
  if (!iso) return "none";
  const d = daysUntil(iso);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}
function relativeFollow(iso) {
  if (!iso) return "No date";
  const d = daysUntil(iso);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `in ${d}d`;
}

// Local "YYYY-MM-DD" from a Date.
function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Monday of the week containing `date` (week runs Mon–Sun).
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setDate(d.getDate() - dow);
  return d;
}
function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const uid = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function emptyContact() {
  return {
    id: uid(),
    name: "",
    company: "",
    role: "",
    channels: [],
    stage: STAGES[0].id,
    meetingAt: "", // date of a scheduled meeting (Meeting Scheduled stage)
    lastContact: "",
    nextFollowUp: "",
    reminder: "7am", // calendar notification: see REMINDERS
    resume: { sent: false, date: "", status: "applied", reason: "" },
    notes: "",
  };
}

/* ------------------------------------------------------------------ *
 * Google Calendar helpers.
 * ------------------------------------------------------------------ */
function calDetails(c) {
  const parts = [`Stage: ${stageById(c.stage).label}`];
  const chans = CHANNELS.filter((x) => c.channels.includes(x.id)).map((x) => x.label);
  if (chans.length) parts.push(`Channels: ${chans.join(", ")}`);
  if (c.lastContact) parts.push(`Last contact: ${formatDate(c.lastContact)}`);
  if (c.notes) parts.push("", c.notes);
  return parts.join("\n");
}
function calTitle(c) {
  return `Follow up: ${c.name}${c.company ? ` (${c.company})` : ""}`;
}
function basicDate(iso) {
  return iso.replace(/-/g, "");
}
function nextDayBasic(iso) {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
// Pre-filled Google Calendar event (all-day; end date is exclusive).
function gcalUrl(c) {
  if (!c.nextFollowUp) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calTitle(c),
    dates: `${basicDate(c.nextFollowUp)}/${nextDayBasic(c.nextFollowUp)}`,
    details: calDetails(c),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ------------------------------------------------------------------ *
 * ICS (VCALENDAR) export — one VEVENT per dated contact, stable UID.
 * ------------------------------------------------------------------ */
function icsEscape(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
function icsStamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function buildICS(contacts) {
  const dated = contacts.filter((c) => c.nextFollowUp);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Networking CRM//Job Search Follow-ups//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = icsStamp();
  for (const c of dated) {
    lines.push(
      "BEGIN:VEVENT",
      // Stable UID -> re-importing updates the same event instead of duplicating.
      `UID:${c.id}@networking-crm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${basicDate(c.nextFollowUp)}`,
      `DTEND;VALUE=DATE:${nextDayBasic(c.nextFollowUp)}`,
      `SUMMARY:${icsEscape(calTitle(c))}`,
      `DESCRIPTION:${icsEscape(calDetails(c))}`
    );
    // Per-contact reminder -> VALARM (omitted entirely when set to "none").
    const trigger = reminderById(c.reminder).trigger;
    if (trigger) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(calTitle(c))}`,
        `TRIGGER:${trigger}`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ *
 * Seed data — preloaded ONLY when storage is empty (first run).
 * Source "Closed" meant "had the meeting" -> "Met — Next Step".
 * Stable ids so calendar UIDs survive across sessions.
 * ------------------------------------------------------------------ */
function seedContact(id, name, stage, extra = {}) {
  return {
    id: `seed_${id}`,
    name,
    company: "",
    role: "",
    channels: [],
    stage,
    lastContact: "",
    nextFollowUp: "",
    notes: "",
    ...extra,
  };
}
const SEED = [
  // To Reach Out
  seedContact("larry_bernstein", "Larry Bernstein", "to_reach_out"),
  seedContact("russ_miron", "Russ Miron", "to_reach_out"),
  seedContact("alexis_gauba", "Alexis Gauba", "to_reach_out"),
  seedContact("ofik_ophir", "Ofik Ophir", "to_reach_out", { company: "Dream" }),
  seedContact("hillel_fuld", "Hillel Fuld", "to_reach_out"),
  seedContact("adi_yehosha", "Adi Yehosha", "to_reach_out", { company: "LUX Capital" }),
  // In Conversation
  seedContact("noa_bloch", "Noa Bloch", "in_conversation", {
    company: "Kela",
    channels: ["email"],
    lastContact: "2026-06-15",
    notes: "Scheduled to meet, rescheduling.",
  }),
  seedContact("russell_yue", "Russell Yue", "in_conversation", {
    company: "TruArrow",
    channels: ["email"],
    lastContact: "2026-06-13",
    notes: "Julia Plotts intro; will follow up shortly.",
  }),
  seedContact("cam_fink", "Cam Fink", "in_conversation", {
    company: "Aaru",
    channels: ["email"],
    lastContact: "2026-06-14",
    nextFollowUp: "2026-06-17",
    notes: "Follow up re Sandstone; wish luck for VivaTech.",
  }),
  seedContact("carolina_fein", "Carolina Fein", "in_conversation"),
  seedContact("alec_litowitz", "Alec Litowitz", "in_conversation", { company: "Qstar Capital" }),
  seedContact("ori_swish", "Ori", "in_conversation", { company: "Swish Ventures" }),
  seedContact("alex_mayers", "Alex Mayers", "in_conversation", { company: "Sandstone" }),
  // Met — Next Step
  seedContact("applebaum_knoll", "Aaron Applebaum + Yoav Knoll", "met_next_step", {
    company: "Kineticia",
    channels: ["call"],
    notes: "Met Wed 10:45am.",
  }),
  seedContact("sam_frankfort", "Sam Frankfort", "met_next_step", { company: "Benvolio Group" }),
  seedContact("spencer_farrar", "Spencer Farrar", "met_next_step", {
    company: "Theory Ventures",
    channels: ["call"],
    notes: "Send a Zoom link.",
  }),
  seedContact("michael_eisenberg", "Michael Eisenberg", "met_next_step", { company: "Aelph" }),
  seedContact("brendan_bittencourt", "Brendan Bittencourt", "met_next_step", {
    company: "Sandstone",
    lastContact: "2026-06-15",
  }),
  seedContact("olivia_ross", "Olivia Ross", "met_next_step", { company: "Ramp" }),
  seedContact("eli_nastir", "Eli Nastir", "met_next_step", { company: "Palantir" }),
];

/* ------------------------------------------------------------------ *
 * Small presentational pieces.
 * ------------------------------------------------------------------ */
function ChannelIcons({ channels = [], size = 14 }) {
  if (!channels.length) return <span className="text-xs text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {CHANNELS.filter((c) => channels.includes(c.id)).map(({ id, Icon, label }) => (
        <span
          key={id}
          title={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 ring-1 ring-slate-200"
        >
          <Icon size={size} strokeWidth={2} />
        </span>
      ))}
    </span>
  );
}

function StageChip({ stage }) {
  const s = stageById(stage);
  const t = TINTS[s.tint];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${t.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {s.label}
    </span>
  );
}

function AppStatusChip({ status }) {
  const s = appStatusById(status);
  const t = TINTS[s.tint];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${t.chip}`}>
      <FileText size={11} />
      {s.label}
    </span>
  );
}


const STATUS_STYLES = {
  overdue: "bg-red-50 text-red-700 ring-red-200",
  today: "bg-amber-50 text-amber-700 ring-amber-200",
  week: "bg-sky-50 text-sky-700 ring-sky-200",
  later: "bg-slate-50 text-slate-600 ring-slate-200",
  none: "bg-slate-50 text-slate-400 ring-slate-200",
};
function FollowChip({ iso }) {
  const status = dateStatus(iso);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[status]}`}>
      <CalendarClock size={12} />
      {relativeFollow(iso)}
    </span>
  );
}

function GCalLink({ contact, compact }) {
  const url = gcalUrl(contact);
  if (!url) return null;
  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Add to Google Calendar"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <CalendarPlus size={15} />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
    >
      <CalendarPlus size={15} /> Add to Google Calendar
    </a>
  );
}

// Google Tasks has no prefilled-task URL or .ics path, so this copies the
// task text to the clipboard and opens Google Tasks for a quick paste.
const GTASKS_URL = "https://tasks.google.com/tasks/";
function taskText(c) {
  return c.nextFollowUp ? `${calTitle(c)} — by ${formatDate(c.nextFollowUp)}` : calTitle(c);
}
function GTasksLink({ contact, compact }) {
  const [copied, setCopied] = useState(false);
  if (!contact.nextFollowUp) return null;

  const handle = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard?.writeText(taskText(contact));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be blocked; still open Tasks so the user can type it.
    }
    window.open(GTASKS_URL, "_blank", "noreferrer");
  };

  if (compact) {
    return (
      <button
        onClick={handle}
        title="Copy task & open Google Tasks"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? <Check size={15} className="text-emerald-500" /> : <ListPlus size={15} />}
      </button>
    );
  }
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
    >
      {copied ? <Check size={15} className="text-emerald-500" /> : <ListPlus size={15} />}
      {copied ? "Copied — paste in Tasks" : "Add to Google Tasks"}
    </button>
  );
}

/* ================================================================== *
 * Main component
 * ================================================================== */
export default function NetworkingCRM() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState("");
  const [view, setView] = useState("dashboard");

  const [editing, setEditing] = useState(null); // contact object being added/edited
  const [editFocus, setEditFocus] = useState(null); // field name to focus on open
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState("");

  const importRef = useRef(null);

  /* ---------------- load on mount ---------------- */
  useEffect(() => {
    // localStorage is synchronous: getItem returns the stored string, or
    // null when the key has never been written (first run).
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) {
        setContacts(parsed);
      } else {
        // First run: preload seed data (it will persist on the next write).
        setContacts(SEED);
      }
    } catch (e) {
      // Corrupt JSON (or storage unavailable) — fall back to the seed list.
      setStorageError("Couldn't read saved data — starting from the seed list.");
      setContacts(SEED);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------------- persist on every change ---------------- */
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
      setStorageError("");
    } catch (e) {
      setStorageError("Couldn't save your last change — export a JSON backup to be safe.");
    }
  }, [contacts, loading]);

  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(""), 3200);
  }, []);

  /* ---------------- mutations ---------------- */
  const upsert = useCallback((contact) => {
    setContacts((prev) => {
      const idx = prev.findIndex((c) => c.id === contact.id);
      if (idx === -1) return [...prev, contact];
      const next = [...prev];
      next[idx] = contact;
      return next;
    });
  }, []);
  const patch = useCallback((id, fields) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)));
  }, []);
  const remove = useCallback((id) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const openEditor = (contact, focus = null) => {
    setEditFocus(focus);
    setEditing(contact);
  };
  const closeEditor = () => {
    setEditing(null);
    setEditFocus(null);
  };

  /* ---------------- follow-up flow ---------------- */
  // Sets last contact = today, then opens the contact so the next date is set.
  const markFollowedUp = (c) => {
    const updated = { ...c, lastContact: todayISO() };
    upsert(updated);
    openEditor(updated, "nextFollowUp");
    flash("Logged today — set the next follow-up date");
  };

  /* ---------------- export / import / reset ---------------- */
  const handleExportJSON = () => {
    try {
      downloadFile(`networking-crm-${todayISO()}.json`, JSON.stringify(contacts, null, 2), "application/json");
      flash("JSON backup exported");
    } catch (e) {
      flash("Export failed");
    }
  };

  const handleExportICS = () => {
    const dated = contacts.filter((c) => c.nextFollowUp).length;
    if (!dated) {
      flash("No follow-up dates to export yet");
      return;
    }
    try {
      downloadFile(`networking-followups-${todayISO()}.ics`, buildICS(contacts), "text/calendar");
      flash("Calendar exported — in Google Calendar: Settings → Import & export → Import");
    } catch (e) {
      flash("Calendar export failed");
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("not an array");
        const cleaned = parsed.map((c) => ({ ...emptyContact(), ...c, id: c.id || uid() }));
        if (
          contacts.length &&
          !window.confirm(`Import ${cleaned.length} contact(s)? This REPLACES your current ${contacts.length}.`)
        ) {
          return;
        }
        setContacts(cleaned);
        flash(`Imported ${cleaned.length} contact(s)`);
      } catch (err) {
        flash("Import failed — that wasn't a valid JSON export");
      } finally {
        if (importRef.current) importRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    setContacts([]);
    setConfirmReset(false);
    flash("All data cleared");
  };

  /* ---------------- keyboard: Esc closes overlays ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeEditor();
        setConfirmReset(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- derived counts ---------------- */
  const counts = useMemo(() => {
    let overdue = 0,
      today = 0,
      needsDate = 0;
    for (const c of contacts) {
      const s = dateStatus(c.nextFollowUp);
      if (s === "overdue") overdue++;
      else if (s === "today") today++;
      else if (s === "none" && stageById(c.stage).active) needsDate++;
    }
    return { overdue, today, needsDate };
  }, [contacts]);

  /* ---------------- render ---------------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 font-sans text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <p className="text-sm">Loading your network…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-slate-800 antialiased">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-stone-50">
              <ListChecks size={18} />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight text-slate-900">Networking CRM</h1>
              <p className="text-xs text-slate-500">
                {contacts.length} contact{contacts.length === 1 ? "" : "s"}
                {(counts.overdue > 0 || counts.today > 0 || counts.needsDate > 0) && (
                  <>
                    {" · "}
                    {counts.overdue > 0 && <span className="font-medium text-red-600">{counts.overdue} overdue</span>}
                    {counts.overdue > 0 && (counts.today > 0 || counts.needsDate > 0) && " · "}
                    {counts.today > 0 && <span className="font-medium text-amber-600">{counts.today} due today</span>}
                    {counts.today > 0 && counts.needsDate > 0 && " · "}
                    {counts.needsDate > 0 && <span className="font-medium text-blue-600">{counts.needsDate} need a date</span>}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openEditor(emptyContact())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-stone-50 shadow-sm transition hover:bg-slate-700 active:scale-95"
            >
              <Plus size={16} /> Add contact
            </button>
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
              <IconBtn title="Export follow-ups to calendar (.ics)" onClick={handleExportICS}>
                <CalendarDays size={16} />
              </IconBtn>
              <IconBtn title="Export all data to JSON" onClick={handleExportJSON}>
                <Download size={16} />
              </IconBtn>
              <IconBtn title="Import from JSON" onClick={() => importRef.current?.click()}>
                <Upload size={16} />
              </IconBtn>
              <IconBtn title="Reset all data" onClick={() => setConfirmReset(true)}>
                <Trash2 size={16} />
              </IconBtn>
              <input ref={importRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
            </div>
          </div>
        </div>

        {/* view tabs */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            <Tab active={view === "dashboard"} onClick={() => setView("dashboard")} Icon={CalendarClock}>
              This week
            </Tab>
            <Tab active={view === "board"} onClick={() => setView("board")} Icon={LayoutGrid}>
              Pipeline
            </Tab>
            <Tab active={view === "table"} onClick={() => setView("table")} Icon={Table2}>
              All contacts
            </Tab>
            <Tab active={view === "resume"} onClick={() => setView("resume")} Icon={FileText}>
              Resume sent
            </Tab>
          </nav>
        </div>
      </header>

      {storageError && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0" /> {storageError}
          </div>
        </div>
      )}

      {/* ---------- Body ---------- */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {contacts.length === 0 ? (
          <FirstRunEmpty onAdd={() => openEditor(emptyContact())} />
        ) : view === "dashboard" ? (
          <Dashboard contacts={contacts} onMark={markFollowedUp} onEdit={(c) => openEditor(c)} />
        ) : view === "board" ? (
          <Board contacts={contacts} onMove={(id, stage) => patch(id, { stage })} onEdit={(c) => openEditor(c)} />
        ) : view === "resume" ? (
          <ResumeView contacts={contacts} onPatch={patch} onEdit={(c) => openEditor(c)} />
        ) : (
          <ContactsTable contacts={contacts} onPatch={patch} onEdit={(c) => openEditor(c)} onRemove={remove} />
        )}
      </main>

      {/* ---------- Modals ---------- */}
      {editing && (
        <ContactModal
          initial={editing}
          isNew={!contacts.some((c) => c.id === editing.id)}
          autoFocusField={editFocus}
          onClose={closeEditor}
          onSave={(c) => {
            upsert(c);
            closeEditor();
            flash("Saved");
          }}
          onDelete={(id) => {
            remove(id);
            closeEditor();
            flash("Contact deleted");
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset all data?"
          body={`This permanently deletes all ${contacts.length} contact(s) from storage. Export a JSON backup first if you're unsure.`}
          confirmLabel="Delete everything"
          onCancel={() => setConfirmReset(false)}
          onConfirm={handleReset}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 max-w-sm rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-medium text-stone-50 shadow-lg">
          {toast}
        </div>
      )}

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6">
        Your contacts are saved privately in this browser.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header bits
 * ------------------------------------------------------------------ */
function IconBtn({ children, title, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  );
}

function Tab({ active, onClick, Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
        active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Empty state (no contacts at all)
 * ------------------------------------------------------------------ */
function FirstRunEmpty({ onAdd }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-stone-50">
        <UserPlus size={26} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Add your first contact</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">
        Track every networking call, email, and WhatsApp thread — and never miss a follow-up again.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-stone-50 shadow-sm transition hover:bg-slate-700"
      >
        <Plus size={16} /> Add a person
      </button>
    </div>
  );
}

/* ================================================================== *
 * View 1 — Weekly agenda
 * ================================================================== */
function Dashboard({ contacts, onMark, onEdit }) {
  // Offset in weeks from the current week (0 = this week).
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekStartISO = isoOf(days[0]);
  const weekEndISO = isoOf(days[6]);
  const today = todayISO();

  // Bucket contacts: per-day (within this week), overdue (before this week,
  // only meaningful for the current/future weeks), and unscheduled active.
  const { byDay, overdue, unscheduled } = useMemo(() => {
    const byDay = Object.fromEntries(days.map((d) => [isoOf(d), []]));
    const overdue = [];
    const unscheduled = [];
    for (const c of contacts) {
      const iso = c.nextFollowUp;
      if (!iso) {
        if (stageById(c.stage).active) unscheduled.push(c);
        continue;
      }
      if (iso >= weekStartISO && iso <= weekEndISO) {
        byDay[iso].push(c);
      } else if (iso < weekStartISO && iso < today) {
        // Surface still-open past-due items only on the current/upcoming weeks,
        // so back-navigation doesn't drag the whole backlog along.
        if (weekOffset >= 0) overdue.push(c);
      }
    }
    const byDate = (a, b) => (a.nextFollowUp < b.nextFollowUp ? -1 : 1);
    const byName = (a, b) => a.name.localeCompare(b.name);
    for (const k in byDay) byDay[k].sort(byName);
    overdue.sort(byDate);
    unscheduled.sort(byName);
    return { byDay, overdue, unscheduled };
  }, [contacts, days, weekStartISO, weekEndISO, today, weekOffset]);

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" }
  )}`;
  const scheduledThisWeek = days.reduce((n, d) => n + byDay[isoOf(d)].length, 0);

  return (
    <div className="space-y-5">
      {/* week navigator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : weekLabel}
          </h2>
          <p className="text-xs text-slate-500">
            {weekLabel} · {scheduledThisWeek} follow-up{scheduledThisWeek === 1 ? "" : "s"} scheduled
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            title="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            title="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* overdue strip — pinned above the week so nothing falls off the edge */}
      {overdue.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50/50 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-600">
            <AlertCircle size={13} /> Overdue
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">{overdue.length}</span>
            <span className="font-normal normal-case tracking-normal text-red-400">· carried over from before this week</span>
          </h3>
          <ul className="space-y-2">
            {overdue.map((c) => (
              <FollowRow key={c.id} c={c} border="border-l-red-400" onMark={onMark} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      )}

      {/* the 7-day grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const iso = isoOf(d);
          const list = byDay[iso];
          const isToday = iso === today;
          const isPast = iso < today;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={iso}
              className={`flex flex-col rounded-xl border bg-white shadow-sm ${
                isToday ? "border-amber-300 ring-1 ring-amber-200" : isWeekend ? "border-slate-200 bg-slate-50/40" : "border-slate-200"
              }`}
            >
              <div
                className={`flex items-center justify-between gap-2 rounded-t-xl border-b px-3 py-2 ${
                  isToday ? "border-amber-200 bg-amber-50" : "border-slate-200"
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-amber-700" : "text-slate-500"}`}>
                    {DOW_LABELS[(d.getDay() + 6) % 7]}
                  </span>
                  <span className={`text-sm font-semibold ${isToday ? "text-amber-800" : isPast ? "text-slate-400" : "text-slate-800"}`}>
                    {d.getDate()}
                  </span>
                </div>
                {list.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      isToday ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {list.length}
                  </span>
                )}
              </div>
              <div className="flex min-h-[4.5rem] flex-1 flex-col gap-2 p-2">
                {list.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center py-3 text-center text-xs text-slate-300">
                    {isToday ? "Nothing today" : "—"}
                  </div>
                ) : (
                  list.map((c) => <AgendaCard key={c.id} c={c} onMark={onMark} onEdit={onEdit} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* unscheduled active conversations */}
      {unscheduled.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
            <CalendarClock size={13} /> Unscheduled
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">{unscheduled.length}</span>
            <span className="font-normal normal-case tracking-normal text-slate-400">· active conversations with no date set</span>
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-blue-200 bg-white p-2.5">
                <button onClick={() => onEdit(c)} className="min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-800">{c.name}</span>
                    <ChannelIcons channels={c.channels} size={11} />
                  </div>
                  <div className="mt-0.5"><StageChip stage={c.stage} /></div>
                </button>
                <button
                  onClick={() => onMark(c)}
                  className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Set date
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overdue.length === 0 && scheduledThisWeek === 0 && unscheduled.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
          <PartyPopper className="text-emerald-500" size={28} />
          <p className="font-semibold text-slate-800">Nothing on the calendar this week.</p>
          <p className="text-sm text-slate-500">No follow-ups scheduled, nothing overdue, nothing waiting on a date.</p>
        </div>
      )}
    </div>
  );
}

// Compact card for a single day cell in the agenda grid.
function AgendaCard({ c, onMark, onEdit }) {
  return (
    <article className="group rounded-lg border border-slate-200 bg-white p-2 transition hover:border-slate-300 hover:shadow-sm">
      <button onClick={() => onEdit(c)} className="block w-full text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900">{c.name}</span>
          <ChannelIcons channels={c.channels} size={11} />
        </div>
        {(c.company || c.role) && (
          <div className="mt-0.5 truncate text-xs text-slate-500">{[c.role, c.company].filter(Boolean).join(" · ")}</div>
        )}
        <div className="mt-1.5">
          <StageChip stage={c.stage} />
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 pt-2">
        <div className="flex items-center gap-0.5">
          <GCalLink contact={c} compact />
          <GTasksLink contact={c} compact />
        </div>
        <button
          onClick={() => onMark(c)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Check size={13} /> Followed up
        </button>
      </div>
    </article>
  );
}

function FollowRow({ c, border, onMark, onEdit, needsDate }) {
  return (
    <li
      className={`group flex flex-col gap-3 rounded-xl border border-slate-200 border-l-4 ${border} bg-white p-3 shadow-sm transition hover:shadow sm:flex-row sm:items-center sm:justify-between`}
    >
      <button onClick={() => onEdit(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-slate-900">{c.name}</span>
            <ChannelIcons channels={c.channels} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {(c.company || c.role) && <span className="truncate">{[c.role, c.company].filter(Boolean).join(" · ")}</span>}
            <StageChip stage={c.stage} />
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="text-right">
          {needsDate ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
              <AlertCircle size={12} /> No date set
            </span>
          ) : (
            <>
              <FollowChip iso={c.nextFollowUp} />
              <div className="mt-0.5 text-xs text-slate-400">{formatDate(c.nextFollowUp)}</div>
            </>
          )}
        </div>
        <GCalLink contact={c} compact />
        <GTasksLink contact={c} compact />
        <button
          onClick={() => onMark(c)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Check size={14} /> {needsDate ? "Set date" : "Followed up"}
        </button>
      </div>
    </li>
  );
}

/* ================================================================== *
 * View 2 — Pipeline board (drag + drop)
 * ================================================================== */
function Board({ contacts, onMove, onEdit }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, []]));
    for (const c of contacts) (map[c.stage] || map[STAGES[0].id]).push(c);
    for (const id in map)
      map[id].sort((a, b) => {
        if (!a.nextFollowUp) return 1;
        if (!b.nextFollowUp) return -1;
        return a.nextFollowUp < b.nextFollowUp ? -1 : 1;
      });
    return map;
  }, [contacts]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGES.map((s) => {
        const t = TINTS[s.tint];
        const isOver = overStage === s.id;
        return (
          <div
            key={s.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(s.id);
            }}
            onDragLeave={() => setOverStage((cur) => (cur === s.id ? null : cur))}
            onDrop={() => {
              if (dragId) onMove(dragId, s.id);
              setDragId(null);
              setOverStage(null);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/70 transition ${
              isOver ? `${t.col} ring-2 ring-slate-300 ring-offset-1` : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                <span className="text-sm font-semibold text-slate-700">{s.label}</span>
              </div>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                {byStage[s.id].length}
              </span>
            </div>
            <div className="flex min-h-28 flex-1 flex-col gap-2 p-2">
              {byStage[s.id].length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  Drop a card here
                </div>
              ) : (
                byStage[s.id].map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    onClick={() => onEdit(c)}
                    className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:shadow active:cursor-grabbing ${
                      dragId === c.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="truncate text-sm font-semibold text-slate-900">{c.name}</h4>
                      <ChannelIcons channels={c.channels} size={12} />
                    </div>
                    {(c.role || c.company) && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <Building2 size={11} className="shrink-0" />
                        {[c.role, c.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {c.stage === "meeting_scheduled" && c.meetingAt && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <CalendarClock size={11} className="shrink-0" />
                        Meeting {formatDate(c.meetingAt)}
                      </p>
                    )}
                    {c.nextFollowUp && (
                      <div className="mt-2">
                        <FollowChip iso={c.nextFollowUp} />
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== *
 * View — Resume sent tracker
 * ================================================================== */
function ResumeView({ contacts, onPatch, onEdit }) {
  const sent = useMemo(() => contacts.filter((c) => resumeOf(c).sent), [contacts]);

  // Group by status, preserving APP_STATUSES order; sort each by date desc.
  const groups = useMemo(() => {
    const g = Object.fromEntries(APP_STATUSES.map((s) => [s.id, []]));
    for (const c of sent) {
      const st = resumeOf(c).status || "applied";
      (g[st] || g.applied).push(c);
    }
    for (const id in g)
      g[id].sort((a, b) => {
        const da = resumeOf(a).date || "";
        const db = resumeOf(b).date || "";
        if (!da && !db) return a.name.localeCompare(b.name);
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? 1 : -1; // most recent first
      });
    return g;
  }, [sent]);

  if (sent.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-stone-50">
          <FileText size={26} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">No resumes sent yet</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">
          Open any contact and tick “I sent my resume to this contact” to start tracking applications here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {APP_STATUSES.map((s) => {
          const t = TINTS[s.tint];
          return (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                {s.label}
              </span>
              <span className="text-lg font-semibold text-slate-900">{groups[s.id].length}</span>
            </div>
          );
        })}
      </div>

      {APP_STATUSES.map((s) =>
        groups[s.id].length ? (
          <section key={s.id}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {s.label}
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{groups[s.id].length}</span>
            </h3>
            <ul className="space-y-2">
              {groups[s.id].map((c) => {
                const r = resumeOf(c);
                return (
                  <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button onClick={() => onEdit(c)} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">{c.name}</span>
                        <ChannelIcons channels={c.channels} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {(c.company || c.role) && <span className="truncate">{[c.role, c.company].filter(Boolean).join(" · ")}</span>}
                        <StageChip stage={c.stage} />
                      </div>
                      {r.reason && (
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                          <FileText size={11} className="mt-0.5 shrink-0 text-slate-400" />
                          <span className="italic">{r.reason}</span>
                        </div>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Sent</div>
                        <div className="text-sm font-medium text-slate-700">{r.date ? formatDate(r.date) : "—"}</div>
                      </div>
                      <select
                        value={r.status || "applied"}
                        onChange={(e) => onPatch(c.id, { resume: { ...r, status: e.target.value } })}
                        className={`rounded-md border-0 py-1 pl-2 pr-7 text-xs font-medium ring-1 focus:ring-2 ${TINTS[appStatusById(r.status).tint].chip}`}
                      >
                        {APP_STATUSES.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      )}
    </div>
  );
}

/* ================================================================== *
 * View 3 — All contacts table
 * ================================================================== */
function ContactsTable({ contacts, onPatch, onEdit, onRemove }) {
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [sort, setSort] = useState({ key: "nextFollowUp", dir: "asc" });

  const companies = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.company).filter(Boolean))).sort(),
    [contacts]
  );

  const rows = useMemo(() => {
    let r = contacts.filter((c) => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (channelFilter !== "all" && !c.channels.includes(channelFilter)) return false;
      if (companyFilter !== "all" && c.company !== companyFilter) return false;
      if (q.trim()) {
        const hay = `${c.name} ${c.company} ${c.role} ${c.notes}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    r = [...r].sort((a, b) => {
      let av = a[key] ?? "";
      let bv = b[key] ?? "";
      if (key === "stage") {
        av = STAGES.findIndex((s) => s.id === a.stage);
        bv = STAGES.findIndex((s) => s.id === b.stage);
      }
      if (key === "nextFollowUp") {
        // empty dates always sink to the bottom
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return r;
  }, [contacts, q, stageFilter, channelFilter, companyFilter, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const SortHead = ({ k, children }) => (
    <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
        {children}
        {sort.key === k && (sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, notes…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <Select value={stageFilter} onChange={setStageFilter}>
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={channelFilter} onChange={setChannelFilter}>
          <option value="all">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select value={companyFilter} onChange={setCompanyFilter}>
          <option value="all">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs">
            <tr>
              <SortHead k="name">Name</SortHead>
              <SortHead k="company">Company</SortHead>
              <SortHead k="role">Role</SortHead>
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">Channels</th>
              <SortHead k="stage">Stage</SortHead>
              <SortHead k="nextFollowUp">Next follow-up</SortHead>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  No contacts match these filters.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <InlineText value={c.name} onCommit={(v) => onPatch(c.id, { name: v })} className="font-medium text-slate-900" placeholder="Name" />
                      {resumeOf(c).sent && (
                        <span title={`Resume sent · ${appStatusById(resumeOf(c).status).label}`} className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${TINTS[appStatusById(resumeOf(c).status).tint].chip}`}>
                          <FileText size={10} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <InlineText value={c.company} onCommit={(v) => onPatch(c.id, { company: v })} placeholder="—" />
                  </td>
                  <td className="px-3 py-1.5">
                    <InlineText value={c.role} onCommit={(v) => onPatch(c.id, { role: v })} placeholder="—" />
                  </td>
                  <td className="px-3 py-1.5">
                    <ChannelIcons channels={c.channels} />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={c.stage}
                      onChange={(e) => onPatch(c.id, { stage: e.target.value })}
                      className={`rounded-md border-0 py-1 pl-2 pr-7 text-xs font-medium ring-1 focus:ring-2 ${tintOf(c.stage).chip}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={c.nextFollowUp || ""}
                        onChange={(e) => onPatch(c.id, { nextFollowUp: e.target.value })}
                        className="rounded-md border border-slate-200 px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-slate-400"
                      />
                      {c.nextFollowUp && <FollowChip iso={c.nextFollowUp} />}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <GCalLink contact={c} compact />
                      <GTasksLink contact={c} compact />
                      <IconBtn title="Edit" onClick={() => onEdit(c)}>
                        <Pencil size={15} />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => onRemove(c.id)}>
                        <Trash2 size={15} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Showing {rows.length} of {contacts.length}. Tip: click a cell to edit inline; the pencil opens the full editor.
      </p>
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
    >
      {children}
    </select>
  );
}

// click-to-edit text cell
function InlineText({ value, onCommit, className = "", placeholder = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`block w-full max-w-48 truncate rounded px-1 py-0.5 text-left hover:bg-slate-100 ${value ? className : "text-slate-300"}`}
      >
        {value || placeholder}
      </button>
    );
  }
  const commit = () => {
    onCommit(draft.trim());
    setEditing(false);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded border border-slate-300 px-1 py-0.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
    />
  );
}

/* ================================================================== *
 * Add / Edit modal
 * ================================================================== */
function ContactModal({ initial, isNew, autoFocusField, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial);
  const nameRef = useRef(null);
  const nextRef = useRef(null);

  useEffect(() => {
    if (autoFocusField === "nextFollowUp") nextRef.current?.focus();
    else nameRef.current?.focus();
  }, [autoFocusField]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setResume = (fields) =>
    setForm((f) => ({ ...f, resume: { ...resumeOf(f), ...fields } }));
  const toggleChannel = (id) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(id) ? f.channels.filter((x) => x !== id) : [...f.channels, id],
    }));

  const nameMissing = !form.name.trim();
  const stageNeedsDate = stageById(form.stage).active && !form.nextFollowUp;

  const save = () => {
    if (nameMissing) {
      nameRef.current?.focus();
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  };

  return (
    <Overlay onClose={onClose}>
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{isNew ? "Add contact" : "Edit contact"}</h2>
          <IconBtn title="Close (Esc)" onClick={onClose}>
            <X size={18} />
          </IconBtn>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Name" required>
            <input
              ref={nameRef}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="Jane Doe"
              className={inputCls(nameMissing)}
            />
            {nameMissing && <p className="mt-1 text-xs text-red-500">Name is required.</p>}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company">
              <input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Acme Inc." className={inputCls(false)} />
            </Field>
            <Field label="Role / title">
              <input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Eng Manager" className={inputCls(false)} />
            </Field>
          </div>

          <Field label="Channels">
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(({ id, label, Icon }) => {
                const on = form.channels.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleChannel(id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      on ? "border-slate-900 bg-slate-900 text-stone-50" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={15} /> {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Stage">
            <select value={form.stage} onChange={(e) => set("stage", e.target.value)} className={inputCls(false)}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          {form.stage === "meeting_scheduled" && (
            <Field label="Meeting date">
              <input
                type="date"
                value={form.meetingAt || ""}
                onChange={(e) => set("meetingAt", e.target.value)}
                className={inputCls(false)}
              />
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                <CalendarClock size={12} /> When is the meeting scheduled for?
              </p>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Last contact">
              <input type="date" value={form.lastContact || ""} onChange={(e) => set("lastContact", e.target.value)} className={inputCls(false)} />
            </Field>
            <Field label="Next follow-up">
              <input
                ref={nextRef}
                type="date"
                value={form.nextFollowUp || ""}
                onChange={(e) => set("nextFollowUp", e.target.value)}
                className={inputCls(false)}
              />
              {stageNeedsDate && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle size={12} /> This stage is active — consider setting a follow-up date.
                </p>
              )}
            </Field>
          </div>

          {form.nextFollowUp && (
            <Field label="Calendar reminder">
              <div className="flex flex-wrap gap-2">
                {REMINDERS.map((r) => {
                  const on = (form.reminder || "7am") === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => set("reminder", r.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        on ? "border-slate-900 bg-slate-900 text-stone-50" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {r.id === "none" ? <BellOff size={14} /> : <Bell size={14} />} {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Applies to the calendar export (the calendar icon up top). The per-contact Google link below uses your calendar's default reminder.
              </p>
            </Field>
          )}

          <Field label="Resume / Application">
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={resumeOf(form).sent}
                  onChange={(e) =>
                    setResume({
                      sent: e.target.checked,
                      // Stamp today's date the first time it's checked with no date yet.
                      date: e.target.checked && !resumeOf(form).date ? todayISO() : resumeOf(form).date,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <FileText size={15} /> I sent my resume to this contact
                </span>
              </label>

              {resumeOf(form).sent && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Date sent</span>
                    <input
                      type="date"
                      value={resumeOf(form).date || ""}
                      onChange={(e) => setResume({ date: e.target.value })}
                      className={inputCls(false)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
                    <select
                      value={resumeOf(form).status || "applied"}
                      onChange={(e) => setResume({ status: e.target.value })}
                      className={inputCls(false)}
                    >
                      {APP_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {resumeOf(form).sent && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Why you sent it</span>
                  <input
                    value={resumeOf(form).reason || ""}
                    onChange={(e) => setResume({ reason: e.target.value })}
                    placeholder="Referral from Russell · open Series B role · they asked for it…"
                    className={inputCls(false)}
                  />
                </label>
              )}
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={4}
              placeholder="What did you talk about? Next steps, intros promised, personal details…"
              className={`${inputCls(false)} resize-y`}
            />
          </Field>

          {form.nextFollowUp && (
            <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-500">Put the next follow-up on Google</span>
              <div className="flex flex-wrap gap-2">
                <GCalLink contact={form} />
                <GTasksLink contact={form} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3.5">
          {!isNew ? (
            <button onClick={() => onDelete(form.id)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={nameMissing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-stone-50 shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
const inputCls = (error) =>
  `w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:ring-2 ${
    error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-slate-400 focus:ring-slate-200"
  }`;

/* ------------------------------------------------------------------ *
 * Confirm dialog + overlay primitive
 * ------------------------------------------------------------------ */
function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <Overlay onClose={onCancel}>
      <div className="my-auto w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="px-5 py-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertCircle size={20} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{body}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-500">
            <Trash2 size={15} /> {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
