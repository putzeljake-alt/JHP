import React from "react";

/* ------------------------------------------------------------------ *
 * Without a boundary, a throw during render unmounts the whole tree
 * and leaves a blank page with the reason only in the console. This
 * keeps the failure visible and offers a reload.
 * ------------------------------------------------------------------ */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[networking-crm] render failed:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-6 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Your contacts are still saved in this browser. Reload to try again — if it keeps happening, export a JSON
            backup from a previous session before clearing site data.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {error instanceof Error && error.message ? error.message : String(error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-stone-50 transition hover:bg-slate-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
