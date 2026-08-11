import React, { useEffect, useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";
import { btnGhost, HEADING_TONES, iconBtnCls, PILL_TONES } from "./styles.js";

/* ------------------------------------------------------------------ *
 * Generic, app-agnostic building blocks.
 * ------------------------------------------------------------------ */

export function IconBtn({ children, title, onClick }) {
  return (
    <button title={title} onClick={onClick} className={iconBtnCls}>
      {children}
    </button>
  );
}

// Small count badge used next to headings, tabs and column titles.
export function CountPill({ tone = "muted", className = "", children }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${PILL_TONES[tone]} ${className}`}>{children}</span>;
}

// Uppercase section heading: optional icon, count badge and trailing note.
export function SectionHeading({ Icon, tone = "slate", count, note, children }) {
  const t = HEADING_TONES[tone] || HEADING_TONES.slate;
  return (
    <h3 className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${t.text}`}>
      {Icon && <Icon size={13} />}
      {children}
      {count !== undefined && <CountPill tone={t.pill}>{count}</CountPill>}
      {note && <span className={`font-normal normal-case tracking-normal ${t.note}`}>{note}</span>}
    </h3>
  );
}

// Dashed card shown when a view has nothing to display.
export function EmptyState({ Icon, title, body, children }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-stone-50">
        <Icon size={26} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500">{body}</p>
      {children}
    </div>
  );
}

// <option> list for any [{ id, label }] config array.
export function Options({ items }) {
  return items.map(({ id, label }) => (
    <option key={id} value={id}>
      {label}
    </option>
  ));
}

// Bordered filter <select> that reports its value directly.
export function Select({ value, onChange, children }) {
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

export function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}

// click-to-edit text cell
export function InlineText({ value, onCommit, className = "", placeholder = "" }) {
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

/* ------------------------------------------------------------------ *
 * Confirm dialog + overlay primitive
 * ------------------------------------------------------------------ */
export function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
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
          <button onClick={onCancel} className={btnGhost()}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-500"
          >
            <Trash2 size={15} /> {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function Overlay({ children, onClose }) {
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
