import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  Download,
  Upload,
  Trash2,
  Pencil,
  Check,
  CalendarClock,
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
  PartyPopper,
  Bell,
  BellOff,
  FileText,
  Inbox,
} from "lucide-react";

import {
  APP_STATUSES,
  CHANNELS,
  REMINDERS,
  REVIEW_KEY,
  STAGES,
  STORAGE_KEY,
  TINTS,
  appStatusById,
  appTintOf,
  stageById,
  tintOf,
} from "./lib/config.js";
import { buildICS } from "./lib/calendar.js";
import {
  DOW_LABELS,
  addDays,
  compareISO,
  dateStatus,
  dowIndex,
  formatDate,
  isoOf,
  mondayOf,
  todayISO,
} from "./lib/dates.js";
import { compareFollowUp, compareName, emptyContact, randomId, resumeOf, roleCompany, uid } from "./lib/contacts.js";
import { downloadFile, readJSON, writeJSON } from "./lib/storage.js";
import { SEED } from "./lib/seed.js";
import {
  ChannelIcons,
  ContactHeadline,
  FollowChip,
  GCalLink,
  GTasksLink,
  StageChip,
} from "./components/contact.jsx";
import {
  ConfirmDialog,
  CountPill,
  EmptyState,
  Field,
  IconBtn,
  InlineText,
  Options,
  Overlay,
  SectionHeading,
  Select,
} from "./ui/primitives.jsx";
import { btnGhost, btnOutline, btnPrimary, chipSelectCls, inputCls, navBtnCls, toggleBtnCls } from "./ui/styles.js";

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
  const [reviewQueue, setReviewQueue] = useState([]); // pending email suggestions

  const importRef = useRef(null);

  /* ---------------- load on mount ---------------- */
  useEffect(() => {
    try {
      const parsed = readJSON(STORAGE_KEY);
      // First run: preload seed data (it will persist on the next write).
      setContacts(Array.isArray(parsed) && parsed.length ? parsed : SEED);
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
      writeJSON(STORAGE_KEY, contacts);
      setStorageError("");
    } catch (e) {
      setStorageError("Couldn't save your last change — export a JSON backup to be safe.");
    }
  }, [contacts, loading]);

  /* ---------------- review queue: load + persist ---------------- */
  useEffect(() => {
    try {
      const parsed = readJSON(REVIEW_KEY);
      if (Array.isArray(parsed)) setReviewQueue(parsed);
    } catch (e) {
      // Ignore a corrupt review cache — it's non-critical, regenerated on next sync.
    }
  }, []);
  useEffect(() => {
    if (loading) return;
    try {
      writeJSON(REVIEW_KEY, reviewQueue);
    } catch (e) {
      /* non-critical */
    }
  }, [reviewQueue, loading]);

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

  /* ---------------- review queue actions ---------------- */
  // Approve a suggested update: log it in the contact's activity, bump
  // last-contacted, optionally change stage. Never fires until the user clicks.
  const applyUpdate = useCallback(
    ({ id, contactId, date, subject, summary, stage }) => {
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== contactId) return c;
          const activity = [...(c.activity || []), { date, summary, subject, source: "gmail" }];
          const lastContact = !c.lastContact || date > c.lastContact ? date : c.lastContact;
          return { ...c, activity, lastContact, ...(stage ? { stage } : {}) };
        })
      );
      setReviewQueue((q) => q.filter((s) => s.id !== id));
      flash("Update applied to contact");
    },
    [flash]
  );
  const dismissSuggestion = useCallback((id) => {
    setReviewQueue((q) => q.filter((s) => s.id !== id));
  }, []);
  // Unknown sender -> open a prefilled new-contact editor (never auto-created).
  const addSuggestedContact = (sugg) => {
    setReviewQueue((q) => q.filter((s) => s.id !== sugg.id));
    openEditor({ ...emptyContact(), name: sugg.contactName || "", email: sugg.emailAddress || "" });
  };
  // Temporary: inject a sample suggestion so the flow is testable before Gmail
  // is connected. Matches a real contact that has an email if one exists.
  const addTestSuggestion = () => {
    const withEmail = contacts.find((c) => c.email);
    const id = randomId("sg", 4);
    const sugg = withEmail
      ? {
          id,
          kind: "update",
          contactId: withEmail.id,
          contactName: withEmail.name,
          emailAddress: withEmail.email,
          date: todayISO(),
          subject: "Re: Coffee next week?",
          summary: `${withEmail.name} replied and wants to grab coffee next week — proposed Tuesday.`,
          suggestedStage: "in_conversation",
        }
      : {
          id,
          kind: "new_contact",
          contactId: null,
          contactName: "Dana Levi",
          emailAddress: "dana.levi@example.com",
          date: todayISO(),
          subject: "Intro from a mutual friend",
          summary: "Intro email about a possible referral — this sender isn't in your contacts yet.",
          suggestedStage: null,
        };
    setReviewQueue((q) => [sugg, ...q]);
    flash("Test suggestion added — see the Review tab");
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
            <button onClick={() => openEditor(emptyContact())} className={btnPrimary(undefined, "shadow-sm active:scale-95")}>
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
            <Tab active={view === "review"} onClick={() => setView("review")} Icon={Inbox}>
              Review
              {reviewQueue.length > 0 && (
                <CountPill tone="blue" className="ml-1">
                  {reviewQueue.length}
                </CountPill>
              )}
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
        ) : view === "review" ? (
          <ReviewView
            queue={reviewQueue}
            onApply={applyUpdate}
            onDismiss={dismissSuggestion}
            onAddContact={addSuggestedContact}
            onAddTest={addTestSuggestion}
          />
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
    <EmptyState
      Icon={UserPlus}
      title="Add your first contact"
      body="Track every networking call, email, and WhatsApp thread — and never miss a follow-up again."
    >
      <button onClick={onAdd} className={btnPrimary("mt-5 gap-1.5 rounded-lg px-4 py-2.5 text-sm", "shadow-sm")}>
        <Plus size={16} /> Add a person
      </button>
    </EmptyState>
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
    for (const k in byDay) byDay[k].sort(compareName);
    overdue.sort(compareFollowUp);
    unscheduled.sort(compareName);
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
          <button onClick={() => setWeekOffset((w) => w - 1)} className={navBtnCls} title="Previous week">
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className={btnOutline("rounded-lg px-3 py-1.5 text-sm", "disabled:cursor-not-allowed disabled:opacity-40")}
          >
            Today
          </button>
          <button onClick={() => setWeekOffset((w) => w + 1)} className={navBtnCls} title="Next week">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* overdue strip — pinned above the week so nothing falls off the edge */}
      {overdue.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50/50 p-3">
          <SectionHeading Icon={AlertCircle} tone="red" count={overdue.length} note="· carried over from before this week">
            Overdue
          </SectionHeading>
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
                    {DOW_LABELS[dowIndex(d)]}
                  </span>
                  <span className={`text-sm font-semibold ${isToday ? "text-amber-800" : isPast ? "text-slate-400" : "text-slate-800"}`}>
                    {d.getDate()}
                  </span>
                </div>
                {list.length > 0 && <CountPill tone={isToday ? "amber" : "muted"}>{list.length}</CountPill>}
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
          <SectionHeading
            Icon={CalendarClock}
            tone="blue"
            count={unscheduled.length}
            note="· active conversations with no date set"
          >
            Unscheduled
          </SectionHeading>
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
                <button onClick={() => onMark(c)} className={btnOutline("rounded-md px-2 py-1 text-xs", "shrink-0")}>
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
        {roleCompany(c) && <div className="mt-0.5 truncate text-xs text-slate-500">{roleCompany(c)}</div>}
        <div className="mt-1.5">
          <StageChip stage={c.stage} />
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100 pt-2">
        <div className="flex items-center gap-0.5">
          <GCalLink contact={c} compact />
          <GTasksLink contact={c} compact />
        </div>
        <button onClick={() => onMark(c)} className={btnOutline("gap-1 rounded-md px-2 py-1 text-xs")}>
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
          <ContactHeadline c={c} metaClass="mt-1" />
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
        <button onClick={() => onMark(c)} className={btnOutline("gap-1.5 rounded-lg px-2.5 py-1.5 text-xs")}>
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
    for (const id in map) map[id].sort(compareFollowUp);
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
              <CountPill tone="outline">{byStage[s.id].length}</CountPill>
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
                    {roleCompany(c) && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <Building2 size={11} className="shrink-0" />
                        {roleCompany(c)}
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
      // most recent first, undated last, ties broken by name
      g[id].sort((a, b) => compareISO(resumeOf(a).date, resumeOf(b).date, -1) || compareName(a, b));
    return g;
  }, [sent]);

  if (sent.length === 0) {
    return (
      <EmptyState
        Icon={FileText}
        title="No resumes sent yet"
        body="Open any contact and tick “I sent my resume to this contact” to start tracking applications here."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {APP_STATUSES.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span className={`h-2 w-2 rounded-full ${TINTS[s.tint].dot}`} />
              {s.label}
            </span>
            <span className="text-lg font-semibold text-slate-900">{groups[s.id].length}</span>
          </div>
        ))}
      </div>

      {APP_STATUSES.map((s) =>
        groups[s.id].length ? (
          <section key={s.id}>
            <SectionHeading count={groups[s.id].length}>{s.label}</SectionHeading>
            <ul className="space-y-2">
              {groups[s.id].map((c) => {
                const r = resumeOf(c);
                return (
                  <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button onClick={() => onEdit(c)} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                      <ContactHeadline c={c} />
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
                        className={chipSelectCls(appTintOf(r.status).chip)}
                      >
                        <Options items={APP_STATUSES} />
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
 * View — Review inbox (email-based suggestions awaiting approval)
 * ================================================================== */
function ReviewView({ queue, onApply, onDismiss, onAddContact, onAddTest }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Review</h2>
          <p className="max-w-xl text-xs text-slate-500">
            Suggested updates from your email. Approve, edit, or dismiss each one — nothing changes a contact until you
            approve.
          </p>
        </div>
        <button onClick={onAddTest} className={btnOutline(undefined, "shrink-0")}>
          <Plus size={15} /> Add test suggestion
        </button>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          Icon={Inbox}
          title="Nothing to review"
          body="When email-based updates come in, they'll wait here for your approval. Use “Add test suggestion” to preview how it works."
        />
      ) : (
        <ul className="space-y-3">
          {queue.map((s) => (
            <SuggestionCard key={s.id} s={s} onApply={onApply} onDismiss={onDismiss} onAddContact={onAddContact} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionCard({ s, onApply, onDismiss, onAddContact }) {
  const [summary, setSummary] = useState(s.summary);
  const [stage, setStage] = useState(s.suggestedStage || "");
  const [includeStage, setIncludeStage] = useState(!!s.suggestedStage);

  const dismiss = (
    <button onClick={() => onDismiss(s.id)} className={btnGhost("rounded-lg px-3 py-1.5 text-sm")}>
      Dismiss
    </button>
  );
  const sentMeta = (
    <>
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{s.emailAddress}</span>
      <span className="text-xs text-slate-400">· {formatDate(s.date)}</span>
    </>
  );

  if (s.kind === "new_contact") {
    return (
      <li className="rounded-xl border border-slate-200 border-l-4 border-l-blue-400 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <UserPlus size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">New sender</span>
              {sentMeta}
            </div>
            {s.subject && <p className="mt-1 text-xs font-medium text-slate-500">{s.subject}</p>}
            <p className="mt-1 text-sm text-slate-600">{s.summary}</p>
            <p className="mt-1 text-xs text-slate-400">Not in your contacts yet — add them, or dismiss.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {dismiss}
          <button onClick={() => onAddContact(s)} className={btnPrimary("gap-1.5 rounded-lg px-3 py-1.5 text-sm")}>
            <UserPlus size={15} /> Add as contact
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-400 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{s.contactName}</span>
        {sentMeta}
      </div>
      {s.subject && <p className="mt-1 text-xs font-medium text-slate-500">{s.subject}</p>}

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Summary (editable)</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className={`${inputCls(false)} resize-y`} />
      </label>

      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Approving logs this summary to the contact and sets <b>last contacted</b> to {formatDate(s.date)}.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeStage}
            onChange={(e) => setIncludeStage(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
          />
          Also move stage to
        </label>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          disabled={!includeStage}
          className={chipSelectCls(stage ? tintOf(stage).chip : "bg-slate-100 text-slate-500 ring-slate-200", "disabled:opacity-40")}
        >
          <option value="">— pick a stage —</option>
          <Options items={STAGES} />
        </select>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {dismiss}
        <button
          onClick={() =>
            onApply({
              id: s.id,
              contactId: s.contactId,
              date: s.date,
              subject: s.subject,
              summary,
              stage: includeStage && stage ? stage : null,
            })
          }
          className={btnPrimary("gap-1.5 rounded-lg px-3 py-1.5 text-sm")}
        >
          <Check size={15} /> Approve
        </button>
      </div>
    </li>
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
      // empty dates always sink to the bottom
      if (key === "nextFollowUp") return compareISO(a.nextFollowUp, b.nextFollowUp, mul);
      let av = a[key] ?? "";
      let bv = b[key] ?? "";
      if (key === "stage") {
        av = STAGES.findIndex((s) => s.id === a.stage);
        bv = STAGES.findIndex((s) => s.id === b.stage);
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
          <Options items={STAGES} />
        </Select>
        <Select value={channelFilter} onChange={setChannelFilter}>
          <option value="all">All channels</option>
          <Options items={CHANNELS} />
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
                        <span
                          title={`Resume sent · ${appStatusById(resumeOf(c).status).label}`}
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${appTintOf(resumeOf(c).status).chip}`}
                        >
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
                      className={chipSelectCls(tintOf(c.stage).chip)}
                    >
                      <Options items={STAGES} />
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
  const resume = resumeOf(form);

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

          <Field label="Email">
            <input
              type="email"
              value={form.email || ""}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@acme.com"
              className={inputCls(false)}
            />
            <p className="mt-1 text-xs text-slate-400">Used to match emails from Gmail to this contact.</p>
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
              {CHANNELS.map(({ id, label, Icon }) => (
                <button key={id} type="button" onClick={() => toggleChannel(id)} className={toggleBtnCls(form.channels.includes(id))}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Stage">
            <select value={form.stage} onChange={(e) => set("stage", e.target.value)} className={inputCls(false)}>
              <Options items={STAGES} />
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
                {REMINDERS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => set("reminder", r.id)}
                    className={toggleBtnCls((form.reminder || "7am") === r.id)}
                  >
                    {r.id === "none" ? <BellOff size={14} /> : <Bell size={14} />} {r.label}
                  </button>
                ))}
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
                  checked={resume.sent}
                  onChange={(e) =>
                    setResume({
                      sent: e.target.checked,
                      // Stamp today's date the first time it's checked with no date yet.
                      date: e.target.checked && !resume.date ? todayISO() : resume.date,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <FileText size={15} /> I sent my resume to this contact
                </span>
              </label>

              {resume.sent && (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SubField label="Date sent">
                      <input type="date" value={resume.date || ""} onChange={(e) => setResume({ date: e.target.value })} className={inputCls(false)} />
                    </SubField>
                    <SubField label="Status">
                      <select
                        value={resume.status || "applied"}
                        onChange={(e) => setResume({ status: e.target.value })}
                        className={inputCls(false)}
                      >
                        <Options items={APP_STATUSES} />
                      </select>
                    </SubField>
                  </div>

                  <SubField label="Why you sent it" className="mt-3">
                    <input
                      value={resume.reason || ""}
                      onChange={(e) => setResume({ reason: e.target.value })}
                      placeholder="Referral from Russell · open Series B role · they asked for it…"
                      className={inputCls(false)}
                    />
                  </SubField>
                </>
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
            <button
              onClick={() => onDelete(form.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className={btnGhost()}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={nameMissing}
              className={btnPrimary("gap-1.5 rounded-lg px-4 py-2 text-sm", "shadow-sm disabled:cursor-not-allowed disabled:opacity-40")}
            >
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// Smaller labelled field, used inside a Field's grouped box.
function SubField({ label, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
