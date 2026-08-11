import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_STATUSES,
  CHANNELS,
  REMINDERS,
  SEED,
  STAGES,
  addDays,
  appStatusById,
  basicDate,
  buildICS,
  calDetails,
  calTitle,
  dateStatus,
  daysUntil,
  emptyContact,
  formatDate,
  gcalUrl,
  icsEscape,
  isoOf,
  mondayOf,
  nextDayBasic,
  pad,
  parseLocal,
  relativeFollow,
  reminderById,
  resumeOf,
  stageById,
  taskText,
  tintOf,
  todayISO,
  uid,
} from "./NetworkingCRM.jsx";

// Fixed "now" so every relative-date assertion is deterministic.
// 2026-03-10 is a Tuesday.
const NOW = new Date(2026, 2, 10, 9, 30, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("lookup helpers", () => {
  it("resolves a stage by id and falls back to the first stage", () => {
    expect(stageById("warm").label).toBe("Warm / Nurturing");
    expect(stageById("does_not_exist")).toBe(STAGES[0]);
    expect(stageById(undefined)).toBe(STAGES[0]);
  });

  it("maps a stage to its tint classes and falls back to slate", () => {
    expect(tintOf("in_conversation").dot).toBe("bg-blue-500");
    expect(tintOf("nope")).toBe(tintOf("to_reach_out"));
  });

  it("resolves reminders, defaulting to the 7am preset", () => {
    expect(reminderById("none").trigger).toBeNull();
    expect(reminderById("7am").trigger).toBe("PT7H");
    expect(reminderById(undefined)).toBe(REMINDERS[0]);
  });

  it("resolves application statuses, defaulting to Applied", () => {
    expect(appStatusById("offer").label).toBe("Offer");
    expect(appStatusById("bogus")).toBe(APP_STATUSES[0]);
  });

  it("supplies a default resume object for contacts that predate the field", () => {
    expect(resumeOf({})).toEqual({ sent: false, date: "", status: "applied", reason: "" });
    const resume = { sent: true, date: "2026-01-02", status: "offer", reason: "referral" };
    expect(resumeOf({ resume })).toBe(resume);
  });
});

describe("date helpers", () => {
  it("zero-pads to two digits", () => {
    expect(pad(1)).toBe("01");
    expect(pad(12)).toBe("12");
    expect(pad(123)).toBe("123");
  });

  it("formats today as a local ISO date", () => {
    expect(todayISO()).toBe("2026-03-10");
  });

  it("parses an ISO date into local midnight and rejects empty input", () => {
    const d = parseLocal("2026-03-10");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 10]);
    expect(d.getHours()).toBe(0);
    expect(parseLocal("")).toBeNull();
    expect(parseLocal(null)).toBeNull();
  });

  it("counts whole days until a date, signed", () => {
    expect(daysUntil("2026-03-10")).toBe(0);
    expect(daysUntil("2026-03-11")).toBe(1);
    expect(daysUntil("2026-03-03")).toBe(-7);
    expect(daysUntil("")).toBeNull();
  });

  it("is DST-safe when counting across a spring-forward boundary", () => {
    // US DST starts 2026-03-08; the boundary is behind us, Europe's is ahead.
    expect(daysUntil("2026-04-01")).toBe(22);
  });

  it("formats a date for display and em-dashes a missing one", () => {
    expect(formatDate("2026-03-10")).toContain("2026");
    expect(formatDate("")).toBe("—");
  });

  it("buckets follow-up dates by urgency", () => {
    expect(dateStatus("")).toBe("none");
    expect(dateStatus("2026-03-09")).toBe("overdue");
    expect(dateStatus("2026-03-10")).toBe("today");
    expect(dateStatus("2026-03-17")).toBe("week");
    expect(dateStatus("2026-03-18")).toBe("later");
  });

  it("describes a follow-up date relative to today", () => {
    expect(relativeFollow("")).toBe("No date");
    expect(relativeFollow("2026-03-08")).toBe("2d overdue");
    expect(relativeFollow("2026-03-10")).toBe("Today");
    expect(relativeFollow("2026-03-11")).toBe("Tomorrow");
    expect(relativeFollow("2026-03-15")).toBe("in 5d");
  });

  it("serialises a Date to a local ISO day", () => {
    expect(isoOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("returns the Monday of the containing week, Monday through Sunday", () => {
    expect(isoOf(mondayOf(new Date(2026, 2, 10)))).toBe("2026-03-09"); // Tuesday
    expect(isoOf(mondayOf(new Date(2026, 2, 9)))).toBe("2026-03-09"); // Monday itself
    expect(isoOf(mondayOf(new Date(2026, 2, 15)))).toBe("2026-03-09"); // Sunday
  });

  it("adds days across month boundaries without mutating the input", () => {
    const start = new Date(2026, 2, 30, 13, 0);
    expect(isoOf(addDays(start, 3))).toBe("2026-04-02");
    expect(isoOf(addDays(start, -30))).toBe("2026-02-28");
    expect(start.getDate()).toBe(30);
  });
});

describe("contact factories", () => {
  it("generates prefixed, unique ids", () => {
    vi.useRealTimers();
    const ids = new Set(Array.from({ length: 50 }, uid));
    expect(ids.size).toBe(50);
    expect([...ids].every((id) => id.startsWith("c_"))).toBe(true);
  });

  it("creates a blank contact in the first stage with a default reminder", () => {
    const c = emptyContact();
    expect(c.stage).toBe(STAGES[0].id);
    expect(c.reminder).toBe("7am");
    expect(c.channels).toEqual([]);
    expect(c.activity).toEqual([]);
    expect(c.resume).toEqual({ sent: false, date: "", status: "applied", reason: "" });
    expect(c.id).not.toBe(emptyContact().id);
  });

  it("ships seed contacts with stable ids and known stages", () => {
    expect(SEED.length).toBeGreaterThan(0);
    expect(new Set(SEED.map((c) => c.id)).size).toBe(SEED.length);
    for (const c of SEED) {
      expect(c.id).toMatch(/^seed_/);
      expect(STAGES.some((s) => s.id === c.stage)).toBe(true);
      expect(c.name).toBeTruthy();
    }
  });
});

describe("calendar link helpers", () => {
  const contact = {
    id: "c_1",
    name: "Jane Doe",
    company: "Acme",
    stage: "in_conversation",
    channels: ["email", "call"],
    lastContact: "2026-03-01",
    nextFollowUp: "2026-03-12",
    reminder: "7am",
    notes: "Met at a conference.",
  };

  it("titles an event with the name and, when known, the company", () => {
    expect(calTitle(contact)).toBe("Follow up: Jane Doe (Acme)");
    expect(calTitle({ ...contact, company: "" })).toBe("Follow up: Jane Doe");
  });

  it("describes an event with stage, channels, last contact and notes", () => {
    const details = calDetails(contact);
    expect(details).toContain("Stage: In Conversation");
    expect(details).toContain("Channels: Call, Email"); // CHANNELS order, not contact order
    expect(details).toContain("Last contact:");
    expect(details.endsWith("Met at a conference.")).toBe(true);
  });

  it("omits empty sections from the description", () => {
    const details = calDetails({ ...contact, channels: [], lastContact: "", notes: "" });
    expect(details).toBe("Stage: In Conversation");
  });

  it("converts ISO dates to the basic calendar format", () => {
    expect(basicDate("2026-03-12")).toBe("20260312");
    expect(nextDayBasic("2026-03-12")).toBe("20260313");
    expect(nextDayBasic("2026-12-31")).toBe("20270101");
  });

  it("builds an all-day Google Calendar template URL", () => {
    const url = new URL(gcalUrl(contact));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Follow up: Jane Doe (Acme)");
    expect(url.searchParams.get("dates")).toBe("20260312/20260313");
    expect(url.searchParams.get("details")).toContain("Stage: In Conversation");
  });

  it("has no calendar URL without a follow-up date", () => {
    expect(gcalUrl({ ...contact, nextFollowUp: "" })).toBeNull();
  });

  it("writes task text with a due date when there is one", () => {
    expect(taskText(contact)).toMatch(/^Follow up: Jane Doe \(Acme\) — by /);
    expect(taskText({ ...contact, nextFollowUp: "" })).toBe("Follow up: Jane Doe (Acme)");
  });
});

describe("ICS export", () => {
  const base = {
    id: "c_1",
    name: "Jane Doe",
    company: "Acme",
    stage: "in_conversation",
    channels: [],
    lastContact: "",
    notes: "",
    nextFollowUp: "2026-03-12",
    reminder: "7am",
  };

  it("escapes ICS control characters", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(icsEscape("a\r\nb")).toBe("a\\nb");
    expect(icsEscape()).toBe("");
    expect(icsEscape(7)).toBe("7");
  });

  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = buildICS([base]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("\r\n");
  });

  it("emits one all-day VEVENT per dated contact with a stable UID", () => {
    const ics = buildICS([base, { ...base, id: "c_2", name: "John", nextFollowUp: "" }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:c_1@networking-crm");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260312");
    expect(ics).toContain("DTEND;VALUE=DATE:20260313");
    expect(ics).toContain("SUMMARY:Follow up: Jane Doe (Acme)");
  });

  it("stamps events with the current UTC time", () => {
    expect(buildICS([base])).toContain(`DTSTAMP:20260310T${pad(NOW.getUTCHours())}3000Z`);
  });

  it("adds a VALARM only when the contact has a reminder", () => {
    expect(buildICS([base])).toContain("TRIGGER:PT7H");
    expect(buildICS([{ ...base, reminder: "none" }])).not.toContain("BEGIN:VALARM");
  });

  it("escapes contact text inside event fields", () => {
    const ics = buildICS([{ ...base, company: "Acme, Inc.", notes: "line1\nline2" }]);
    expect(ics).toContain("SUMMARY:Follow up: Jane Doe (Acme\\, Inc.)");
    expect(ics).toContain("line1\\nline2");
  });

  it("produces an empty calendar when nothing is dated", () => {
    expect(buildICS([{ ...base, nextFollowUp: "" }])).not.toContain("BEGIN:VEVENT");
    expect(buildICS([])).toContain("END:VCALENDAR");
  });
});

describe("config invariants", () => {
  it("keeps ids unique across stages, channels and statuses", () => {
    for (const list of [STAGES, CHANNELS, APP_STATUSES, REMINDERS]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });

  it("gives every stage a tint that resolves to classes", () => {
    for (const s of STAGES) expect(tintOf(s.id)).toBeDefined();
  });
});
