import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NetworkingCRM, { SEED, emptyContact } from "./NetworkingCRM.jsx";

const STORAGE_KEY = "contacts:v1";
const REVIEW_KEY = "review:v1";
const NOW = new Date(2026, 2, 10, 9, 0, 0);

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

function contact(overrides = {}) {
  return { ...emptyContact(), name: "Jane Doe", ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("first run", () => {
  it("preloads the seed list and persists it", async () => {
    render(<NetworkingCRM />);
    expect(await screen.findByText(`${SEED.length} contacts`, { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(stored()).toHaveLength(SEED.length));
  });

  it("restores saved contacts instead of the seed list", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Saved Person" })]));
    render(<NetworkingCRM />);
    expect(await screen.findByText("1 contact", { exact: false })).toBeInTheDocument();
  });

  it("falls back to the seed list when storage is corrupt", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    render(<NetworkingCRM />);
    expect(await screen.findByText(`${SEED.length} contacts`, { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(stored()).toHaveLength(SEED.length));
  });

  it("shows the empty state once every contact is gone", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    render(<NetworkingCRM />);
    // An empty stored array is treated as first run, so clear the seed list too.
    await user().click(await screen.findByTitle("Reset all data"));
    await user().click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(await screen.findByText("Add your first contact")).toBeInTheDocument();
  });
});

describe("header counters", () => {
  it("counts overdue, due-today and active contacts missing a date", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        contact({ id: "1", nextFollowUp: "2026-03-01" }),
        contact({ id: "2", nextFollowUp: "2026-03-10" }),
        contact({ id: "3", stage: "in_conversation" }),
        contact({ id: "4", stage: "dormant" }),
      ])
    );
    render(<NetworkingCRM />);

    expect(await screen.findByText("1 overdue")).toBeInTheDocument();
    expect(screen.getByText("1 due today")).toBeInTheDocument();
    expect(screen.getByText("1 need a date")).toBeInTheDocument();
  });
});

describe("editing contacts", () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann", stage: "in_conversation" })]));
  });

  it("adds a contact and persists it", async () => {
    render(<NetworkingCRM />);
    await user().click(await screen.findByRole("button", { name: /Add contact/ }));
    await user().type(screen.getByPlaceholderText("Jane Doe"), "New Person");
    await user().click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await waitFor(() => expect(stored().map((c) => c.name)).toEqual(["Ann", "New Person"]));
  });

  it("logs a follow-up as today and reopens the contact on the date field", async () => {
    render(<NetworkingCRM />);
    await user().click(await screen.findByRole("button", { name: /Set date/ }));

    expect(await screen.findByText(/Logged today/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit contact" })).toBeInTheDocument();
    await waitFor(() => expect(stored()[0].lastContact).toBe("2026-03-10"));
  });

  it("deletes a contact from the editor", async () => {
    render(<NetworkingCRM />);
    await user().click(await screen.findByText("Ann")); // unscheduled active contact
    await user().click(screen.getByRole("button", { name: /Delete/ }));

    expect(await screen.findByText("Contact deleted")).toBeInTheDocument();
    await waitFor(() => expect(stored()).toEqual([]));
  });

  it("closes the editor on Escape", async () => {
    render(<NetworkingCRM />);
    await user().click(await screen.findByText("Ann"));
    expect(screen.getByRole("heading", { name: "Edit contact" })).toBeInTheDocument();

    await user().keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Edit contact" })).not.toBeInTheDocument();
  });

  it("moves a contact between stages from the table", async () => {
    render(<NetworkingCRM />);
    await user().click(await screen.findByRole("button", { name: /All contacts/ }));
    const row = screen.getAllByRole("row")[1];
    await user().selectOptions(within(row).getByRole("combobox"), "warm");

    await waitFor(() => expect(stored()[0].stage).toBe("warm"));
  });
});

describe("export, import and reset", () => {
  const clickAndCaptureDownload = async (title) => {
    const blobs = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push(this.download);
    });

    await user().click(await screen.findByTitle(title));
    return { blobs, clicked };
  };

  it("exports contacts as JSON", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1" })]));
    render(<NetworkingCRM />);

    const { blobs, clicked } = await clickAndCaptureDownload("Export all data to JSON");
    expect(clicked).toEqual(["networking-crm-2026-03-10.json"]);
    expect(blobs[0].type).toBe("application/json");
    expect(await screen.findByText("JSON backup exported")).toBeInTheDocument();
  });

  it("exports dated follow-ups as a calendar file", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", nextFollowUp: "2026-03-12" })]));
    render(<NetworkingCRM />);

    const { blobs, clicked } = await clickAndCaptureDownload("Export follow-ups to calendar (.ics)");
    expect(clicked).toEqual(["networking-followups-2026-03-10.ics"]);
    expect(blobs[0].type).toBe("text/calendar");
    expect(await screen.findByText(/Calendar exported/)).toBeInTheDocument();
  });

  it("refuses to export a calendar with no dates", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1" })]));
    render(<NetworkingCRM />);

    const { clicked } = await clickAndCaptureDownload("Export follow-ups to calendar (.ics)");
    expect(clicked).toEqual([]);
    expect(await screen.findByText("No follow-up dates to export yet")).toBeInTheDocument();
  });

  it("replaces contacts from a JSON import after confirmation", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<NetworkingCRM />);
    await screen.findByText("1 contact", { exact: false });

    const file = new File([JSON.stringify([{ name: "Imported Person" }])], "backup.json", { type: "application/json" });
    await user().upload(container.querySelector('input[type="file"]'), file);

    expect(await screen.findByText("Imported 1 contact(s)")).toBeInTheDocument();
    await waitFor(() => expect(stored().map((c) => c.name)).toEqual(["Imported Person"]));
    expect(stored()[0].id).toBeTruthy(); // a missing id is generated on import
  });

  it("keeps the current contacts when the import is declined", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(<NetworkingCRM />);
    await screen.findByText("1 contact", { exact: false });

    const file = new File([JSON.stringify([{ name: "Imported Person" }])], "backup.json", { type: "application/json" });
    await user().upload(container.querySelector('input[type="file"]'), file);

    await waitFor(() => expect(stored().map((c) => c.name)).toEqual(["Ann"]));
  });

  it("reports an invalid import file", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    const { container } = render(<NetworkingCRM />);
    await screen.findByText("1 contact", { exact: false });

    const file = new File(["{ nope"], "backup.json", { type: "application/json" });
    await user().upload(container.querySelector('input[type="file"]'), file);

    expect(await screen.findByText(/Import failed/)).toBeInTheDocument();
    await waitFor(() => expect(stored().map((c) => c.name)).toEqual(["Ann"]));
  });

  it("clears everything only after the reset dialog is confirmed", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    render(<NetworkingCRM />);

    await user().click(await screen.findByTitle("Reset all data"));
    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("1 contact", { exact: false })).toBeInTheDocument();

    await user().click(screen.getByTitle("Reset all data"));
    await user().click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(await screen.findByText("All data cleared")).toBeInTheDocument();
    await waitFor(() => expect(stored()).toEqual([]));
  });
});

describe("review queue", () => {
  it("restores a saved queue, applies an update and persists the result", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann", email: "ann@acme.com" })]));
    localStorage.setItem(
      REVIEW_KEY,
      JSON.stringify([
        {
          id: "s1",
          kind: "update",
          contactId: "1",
          contactName: "Ann",
          emailAddress: "ann@acme.com",
          date: "2026-03-09",
          subject: "Re: coffee",
          summary: "Ann replied.",
          suggestedStage: "in_conversation",
        },
      ])
    );
    render(<NetworkingCRM />);

    await user().click(await screen.findByRole("button", { name: /Review 1/ }));
    await user().click(screen.getByRole("button", { name: /Approve/ }));

    expect(await screen.findByText("Update applied to contact")).toBeInTheDocument();
    await waitFor(() => {
      const [c] = stored();
      expect(c.stage).toBe("in_conversation");
      expect(c.lastContact).toBe("2026-03-09");
      expect(c.activity).toEqual([
        { date: "2026-03-09", summary: "Ann replied.", subject: "Re: coffee", source: "gmail" },
      ]);
    });
    expect(JSON.parse(localStorage.getItem(REVIEW_KEY))).toEqual([]);
  });

  it("ignores a corrupt review cache", async () => {
    localStorage.setItem(REVIEW_KEY, "{not json");
    render(<NetworkingCRM />);
    await user().click(await screen.findByRole("button", { name: /Review/ }));
    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
  });

  it("queues a test suggestion for a contact that has an email", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann", email: "ann@acme.com" })]));
    render(<NetworkingCRM />);

    await user().click(await screen.findByRole("button", { name: /Review/ }));
    await user().click(screen.getByRole("button", { name: /Add test suggestion/ }));

    expect(await screen.findByText(/Test suggestion added/)).toBeInTheDocument();
    expect(screen.getByText("ann@acme.com")).toBeInTheDocument();
  });

  it("suggests a brand-new contact when no contact has an email, and prefills the editor", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    render(<NetworkingCRM />);

    await user().click(await screen.findByRole("button", { name: /Review/ }));
    await user().click(screen.getByRole("button", { name: /Add test suggestion/ }));
    await user().click(await screen.findByRole("button", { name: /Add as contact/ }));

    expect(screen.getByRole("heading", { name: "Add contact" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dana Levi")).toBeInTheDocument();
    expect(screen.getByDisplayValue("dana.levi@example.com")).toBeInTheDocument();
  });

  it("dismisses a suggestion without touching the contact", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann", email: "ann@acme.com" })]));
    render(<NetworkingCRM />);

    await user().click(await screen.findByRole("button", { name: /Review/ }));
    await user().click(screen.getByRole("button", { name: /Add test suggestion/ }));
    await user().click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(await screen.findByText("Nothing to review")).toBeInTheDocument();
    await waitFor(() => expect(stored()[0].activity).toEqual([]));
  });
});

describe("view switching", () => {
  it("moves between the agenda, pipeline, table and resume views", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([contact({ id: "1", name: "Ann", resume: { sent: true, date: "2026-02-01", status: "offer" } })])
    );
    render(<NetworkingCRM />);

    await user().click(await screen.findByRole("button", { name: /Pipeline/ }));
    expect(screen.getByText("To Reach Out")).toBeInTheDocument();

    await user().click(screen.getByRole("button", { name: /All contacts/ }));
    expect(screen.getByPlaceholderText(/Search name/)).toBeInTheDocument();

    await user().click(screen.getByRole("button", { name: /Resume sent/ }));
    expect(screen.getByRole("heading", { name: /Offer/ })).toBeInTheDocument();

    await user().click(screen.getByRole("button", { name: /This week/ }));
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
  });
});

describe("storage failures", () => {
  it("warns when a change cannot be saved", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([contact({ id: "1", name: "Ann" })]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    render(<NetworkingCRM />);

    expect(await screen.findByText(/Couldn't save your last change/)).toBeInTheDocument();
  });
});
