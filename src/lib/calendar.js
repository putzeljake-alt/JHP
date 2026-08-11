import { CHANNELS, reminderById, stageById } from "./config.js";
import { basicDate, formatDate, nextDayBasic, pad } from "./dates.js";

/* ------------------------------------------------------------------ *
 * Google Calendar helpers.
 * ------------------------------------------------------------------ */
export function calDetails(c) {
  const parts = [`Stage: ${stageById(c.stage).label}`];
  const chans = CHANNELS.filter((x) => c.channels.includes(x.id)).map((x) => x.label);
  if (chans.length) parts.push(`Channels: ${chans.join(", ")}`);
  if (c.lastContact) parts.push(`Last contact: ${formatDate(c.lastContact)}`);
  if (c.notes) parts.push("", c.notes);
  return parts.join("\n");
}
export function calTitle(c) {
  return `Follow up: ${c.name}${c.company ? ` (${c.company})` : ""}`;
}
// Pre-filled Google Calendar event (all-day; end date is exclusive).
export function gcalUrl(c) {
  if (!c.nextFollowUp) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calTitle(c),
    dates: `${basicDate(c.nextFollowUp)}/${nextDayBasic(c.nextFollowUp)}`,
    details: calDetails(c),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Google Tasks has no prefilled-task URL or .ics path, so callers copy this
// text to the clipboard and open Google Tasks for a quick paste.
export const GTASKS_URL = "https://tasks.google.com/tasks/";
export function taskText(c) {
  return c.nextFollowUp ? `${calTitle(c)} — by ${formatDate(c.nextFollowUp)}` : calTitle(c);
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
export function buildICS(contacts) {
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
