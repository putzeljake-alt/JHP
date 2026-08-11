import React, { useState } from "react";
import { CalendarClock, CalendarPlus, Check, FileText, ListPlus } from "lucide-react";
import { CHANNELS, TINTS, appStatusById, stageById } from "../lib/config.js";
import { GTASKS_URL, gcalUrl, taskText } from "../lib/calendar.js";
import { dateStatus, relativeFollow } from "../lib/dates.js";
import { roleCompany } from "../lib/contacts.js";
import { btnOutline, iconActionCls, STATUS_STYLES } from "../ui/styles.js";

/* ------------------------------------------------------------------ *
 * Contact-shaped presentational pieces shared by every view.
 * ------------------------------------------------------------------ */

export function ChannelIcons({ channels = [], size = 14 }) {
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

// Pill carrying one of the TINTS palettes.
export function Chip({ tint, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tint.chip}`}>{children}</span>
  );
}

export function StageChip({ stage }) {
  const s = stageById(stage);
  const t = TINTS[s.tint];
  return (
    <Chip tint={t}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {s.label}
    </Chip>
  );
}

export function AppStatusChip({ status }) {
  const s = appStatusById(status);
  return (
    <Chip tint={TINTS[s.tint]}>
      <FileText size={11} />
      {s.label}
    </Chip>
  );
}

export function FollowChip({ iso }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[dateStatus(iso)]}`}>
      <CalendarClock size={12} />
      {relativeFollow(iso)}
    </span>
  );
}

// Name + channels, with a "Role · Company" and stage meta line underneath.
export function ContactHeadline({ c, metaClass = "" }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="truncate font-semibold text-slate-900">{c.name}</span>
        <ChannelIcons channels={c.channels} />
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 ${metaClass}`}>
        {roleCompany(c) && <span className="truncate">{roleCompany(c)}</span>}
        <StageChip stage={c.stage} />
      </div>
    </>
  );
}

export function GCalLink({ contact, compact }) {
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
        className={iconActionCls}
      >
        <CalendarPlus size={15} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={btnOutline()}>
      <CalendarPlus size={15} /> Add to Google Calendar
    </a>
  );
}

// Google Tasks has no prefilled-task URL or .ics path, so this copies the
// task text to the clipboard and opens Google Tasks for a quick paste.
export function GTasksLink({ contact, compact }) {
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

  const icon = copied ? <Check size={15} className="text-emerald-500" /> : <ListPlus size={15} />;
  if (compact) {
    return (
      <button onClick={handle} title="Copy task & open Google Tasks" className={iconActionCls}>
        {icon}
      </button>
    );
  }
  return (
    <button onClick={handle} className={btnOutline()}>
      {icon}
      {copied ? "Copied — paste in Tasks" : "Add to Google Tasks"}
    </button>
  );
}
