import { STAGES } from "./config.js";
import { compareISO } from "./dates.js";

export const randomId = (prefix, entropy = 8) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 2 + entropy)}`;

export const uid = () => randomId("c", 6);

export function emptyContact() {
  return {
    id: uid(),
    name: "",
    email: "", // used to match incoming Gmail messages to this contact
    company: "",
    role: "",
    channels: [],
    stage: STAGES[0].id,
    meetingAt: "", // date of a scheduled meeting (Meeting Scheduled stage)
    lastContact: "",
    nextFollowUp: "",
    reminder: "7am", // calendar notification: see REMINDERS
    resume: { sent: false, date: "", status: "applied", reason: "" },
    activity: [], // log of things that happened: [{ date, summary, source }]
    notes: "",
  };
}

// Safe accessor — seed/imported contacts predate the resume field.
export const resumeOf = (c) => c.resume || { sent: false, date: "", status: "applied", reason: "" };

// "Role · Company", skipping whichever is missing.
export const roleCompany = (c) => [c.role, c.company].filter(Boolean).join(" · ");

export const compareName = (a, b) => a.name.localeCompare(b.name);
export const compareFollowUp = (a, b) => compareISO(a.nextFollowUp, b.nextFollowUp);
