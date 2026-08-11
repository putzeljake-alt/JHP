import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AppStatusChip,
  Board,
  ChannelIcons,
  ConfirmDialog,
  ContactModal,
  ContactsTable,
  Dashboard,
  FollowChip,
  GCalLink,
  GTasksLink,
  InlineText,
  ResumeView,
  ReviewView,
  StageChip,
  emptyContact,
} from "./NetworkingCRM.jsx";

// 2026-03-10 is a Tuesday, so "this week" runs Mon 2026-03-09 – Sun 2026-03-15.
const NOW = new Date(2026, 2, 10, 9, 0, 0);

function contact(overrides = {}) {
  return { ...emptyContact(), name: "Jane Doe", ...overrides };
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function stubClipboard(writeText) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

// Channel and reminder toggles live inside a <label>, which makes the label's
// text their accessible name — so they are addressed by their own text instead.
const toggle = (text) => screen.getByText(text, { selector: "button" });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ChannelIcons", () => {
  it("renders one icon per known channel, in config order", () => {
    render(<ChannelIcons channels={["linkedin", "call"]} />);
    expect(screen.getByTitle("Call")).toBeInTheDocument();
    expect(screen.getByTitle("LinkedIn")).toBeInTheDocument();
    expect(screen.queryByTitle("Email")).not.toBeInTheDocument();
  });

  it("renders a placeholder when there are no channels", () => {
    const { container } = render(<ChannelIcons channels={[]} />);
    expect(container.textContent).toBe("—");
  });
});

describe("chips", () => {
  it("labels the stage and falls back for an unknown one", () => {
    render(<StageChip stage="meeting_scheduled" />);
    expect(screen.getByText("Meeting Scheduled")).toBeInTheDocument();
    render(<StageChip stage="bogus" />);
    expect(screen.getByText("To Reach Out")).toBeInTheDocument();
  });

  it("labels the application status", () => {
    render(<AppStatusChip status="interviewing" />);
    expect(screen.getByText("Interviewing")).toBeInTheDocument();
  });

  it("styles the follow-up chip by urgency", () => {
    const { container: overdue } = render(<FollowChip iso="2026-03-01" />);
    expect(overdue.textContent).toBe("9d overdue");
    expect(overdue.firstChild.className).toContain("text-red-700");

    const { container: none } = render(<FollowChip iso="" />);
    expect(none.textContent).toBe("No date");
    expect(none.firstChild.className).toContain("text-slate-400");
  });
});

describe("GCalLink", () => {
  it("links to a prefilled Google Calendar template", () => {
    render(<GCalLink contact={contact({ nextFollowUp: "2026-03-12" })} />);
    const link = screen.getByRole("link", { name: /Add to Google Calendar/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("dates=20260312%2F20260313");
  });

  it("renders nothing without a follow-up date", () => {
    const { container } = render(<GCalLink contact={contact()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GTasksLink", () => {
  it("copies the task text and opens Google Tasks", async () => {
    const u = user(); // setup() installs its own clipboard stub, so patch after it
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<GTasksLink contact={contact({ company: "Acme", nextFollowUp: "2026-03-12" })} />);
    await u.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Follow up: Jane Doe (Acme) — by "));
    expect(open).toHaveBeenCalledWith("https://tasks.google.com/tasks/", "_blank", "noreferrer");
    expect(await screen.findByText(/Copied — paste in Tasks/)).toBeInTheDocument();
  });

  it("still opens Google Tasks when the clipboard is blocked", async () => {
    const u = user();
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<GTasksLink contact={contact({ nextFollowUp: "2026-03-12" })} />);
    await u.click(screen.getByRole("button"));

    expect(open).toHaveBeenCalled();
    expect(screen.queryByText(/Copied/)).not.toBeInTheDocument();
  });

  it("renders nothing without a follow-up date", () => {
    const { container } = render(<GTasksLink contact={contact()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Dashboard", () => {
  const contacts = [
    contact({ id: "1", name: "Tue Person", nextFollowUp: "2026-03-10" }),
    contact({ id: "2", name: "Thu Person", nextFollowUp: "2026-03-12" }),
    contact({ id: "3", name: "Late Person", nextFollowUp: "2026-02-20" }),
    contact({ id: "4", name: "Future Person", nextFollowUp: "2026-04-01" }),
    contact({ id: "5", name: "Active No Date", stage: "in_conversation" }),
    contact({ id: "6", name: "Idle No Date", stage: "dormant" }),
  ];

  it("shows this week's follow-ups, overdue carry-over and unscheduled active contacts", () => {
    render(<Dashboard contacts={contacts} onMark={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByText(/2 follow-ups scheduled/)).toBeInTheDocument();
    expect(screen.getByText("Tue Person")).toBeInTheDocument();
    expect(screen.getByText("Thu Person")).toBeInTheDocument();
    expect(screen.queryByText("Future Person")).not.toBeInTheDocument();

    const overdue = screen.getByRole("heading", { name: /Overdue/ }).closest("section");
    expect(within(overdue).getByText("Late Person")).toBeInTheDocument();

    const unscheduled = screen.getByRole("heading", { name: /Unscheduled/ }).closest("section");
    expect(within(unscheduled).getByText("Active No Date")).toBeInTheDocument();
    expect(within(unscheduled).queryByText("Idle No Date")).not.toBeInTheDocument();
  });

  it("navigates weeks and drops the overdue strip when looking backwards", async () => {
    render(<Dashboard contacts={contacts} onMark={vi.fn()} onEdit={vi.fn()} />);

    await user().click(screen.getByTitle("Next week"));
    expect(screen.getByRole("heading", { name: "Next week" })).toBeInTheDocument();
    expect(screen.queryByText("Tue Person")).not.toBeInTheDocument();

    await user().click(screen.getByTitle("Previous week"));
    await user().click(screen.getByTitle("Previous week"));
    expect(screen.getByRole("heading", { name: "Last week" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Overdue/ })).not.toBeInTheDocument();

    await user().click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
  });

  it("celebrates an empty week", () => {
    render(<Dashboard contacts={[contact({ stage: "dormant" })]} onMark={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText(/Nothing on the calendar this week/)).toBeInTheDocument();
  });

  it("marks a contact as followed up and opens the editor", async () => {
    const onMark = vi.fn();
    const onEdit = vi.fn();
    const c = contact({ id: "1", name: "Tue Person", nextFollowUp: "2026-03-10" });
    render(<Dashboard contacts={[c]} onMark={onMark} onEdit={onEdit} />);

    await user().click(screen.getByRole("button", { name: /Followed up/ }));
    expect(onMark).toHaveBeenCalledWith(c);

    await user().click(screen.getByText("Tue Person"));
    expect(onEdit).toHaveBeenCalledWith(c);
  });
});

describe("Board", () => {
  const contacts = [
    contact({ id: "1", name: "Undated", stage: "in_conversation" }),
    contact({ id: "2", name: "Soon", stage: "in_conversation", nextFollowUp: "2026-03-11", role: "CTO", company: "Acme" }),
    contact({ id: "3", name: "Later", stage: "in_conversation", nextFollowUp: "2026-04-11" }),
    contact({ id: "4", name: "Meeting", stage: "meeting_scheduled", meetingAt: "2026-03-18" }),
    contact({ id: "5", name: "Homeless", stage: "stage_that_no_longer_exists" }),
  ];
  const column = (label) => screen.getByText(label).closest("div.flex.w-72");

  it("columns contacts by stage, dated first, and parks unknown stages in the first column", () => {
    render(<Board contacts={contacts} onMove={vi.fn()} onEdit={vi.fn()} />);

    const inConversation = column("In Conversation");
    expect(within(inConversation).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Soon",
      "Later",
      "Undated",
    ]);
    expect(within(inConversation).getByText("CTO · Acme")).toBeInTheDocument();
    expect(within(column("To Reach Out")).getByRole("heading", { level: 4, name: "Homeless" })).toBeInTheDocument();
    expect(within(column("Meeting Scheduled")).getByText(/Meeting Mar 18/)).toBeInTheDocument();
    expect(within(column("Warm / Nurturing")).getByText("Drop a card here")).toBeInTheDocument();
  });

  it("moves a card to the stage it is dropped on", () => {
    const onMove = vi.fn();
    render(<Board contacts={contacts} onMove={onMove} onEdit={vi.fn()} />);

    const card = screen.getByRole("heading", { level: 4, name: "Soon" }).closest("article");
    const target = column("Warm / Nurturing");
    fireEvent.dragStart(card);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    expect(onMove).toHaveBeenCalledWith("2", "warm");
  });

  it("ignores a drop that follows a cancelled drag", () => {
    const onMove = vi.fn();
    render(<Board contacts={contacts} onMove={onMove} onEdit={vi.fn()} />);

    const card = screen.getByRole("heading", { level: 4, name: "Soon" }).closest("article");
    const target = column("Warm / Nurturing");
    fireEvent.dragStart(card);
    fireEvent.dragEnd(card);
    fireEvent.dragOver(target);
    fireEvent.dragLeave(target);
    fireEvent.drop(target);

    expect(onMove).not.toHaveBeenCalled();
  });

  it("opens a card for editing on click", async () => {
    const onEdit = vi.fn();
    render(<Board contacts={contacts} onMove={vi.fn()} onEdit={onEdit} />);
    await user().click(screen.getByRole("heading", { level: 4, name: "Soon" }));
    expect(onEdit).toHaveBeenCalledWith(contacts[1]);
  });
});

describe("ContactsTable", () => {
  const contacts = [
    contact({ id: "1", name: "Ann", company: "Acme", role: "CTO", channels: ["email"], nextFollowUp: "2026-03-20" }),
    contact({ id: "2", name: "Bob", company: "Beta", role: "PM", channels: ["call"], notes: "met at summit" }),
    contact({ id: "3", name: "Cid", company: "Acme", role: "Eng", channels: ["email"], stage: "warm", nextFollowUp: "2026-03-12" }),
  ];
  const setup = (props = {}) =>
    render(<ContactsTable contacts={contacts} onPatch={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} {...props} />);

  const names = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("td").textContent.trim());

  it("sorts by next follow-up with undated contacts last", () => {
    setup();
    expect(names()).toEqual(["Cid", "Ann", "Bob"]);
  });

  it("searches across name, company, role and notes", async () => {
    setup();
    const search = screen.getByPlaceholderText(/Search name/);
    await user().type(search, "summit");
    expect(names()).toEqual(["Bob"]);

    await user().clear(search);
    await user().type(search, "  ACME ");
    expect(names()).toEqual(["Cid", "Ann"]);

    await user().clear(search);
    await user().type(search, "nobody");
    expect(screen.getByText("No contacts match these filters.")).toBeInTheDocument();
  });

  it("filters by stage, channel and company", async () => {
    setup();
    const [stage, channel, company] = screen.getAllByRole("combobox");

    await user().selectOptions(stage, "warm");
    expect(names()).toEqual(["Cid"]);
    await user().selectOptions(stage, "all");

    await user().selectOptions(channel, "call");
    expect(names()).toEqual(["Bob"]);
    await user().selectOptions(channel, "all");

    await user().selectOptions(company, "Beta");
    expect(names()).toEqual(["Bob"]);
  });

  it("toggles the sort direction when a header is clicked twice", async () => {
    setup();
    await user().click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Ann", "Bob", "Cid"]);
    await user().click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Cid", "Bob", "Ann"]);
  });

  it("sorts by stage using the pipeline order, not the label", async () => {
    setup();
    await user().click(screen.getByRole("button", { name: "Stage" }));
    expect(names()).toEqual(["Ann", "Bob", "Cid"]);
  });

  it("patches a stage and a follow-up date inline", async () => {
    const onPatch = vi.fn();
    setup({ onPatch });

    const rows = screen.getAllByRole("row").slice(1);
    await user().selectOptions(within(rows[0]).getByRole("combobox"), "dormant");
    expect(onPatch).toHaveBeenCalledWith("3", { stage: "dormant" });

    await user().clear(within(rows[0]).getByDisplayValue("2026-03-12"));
    expect(onPatch).toHaveBeenCalledWith("3", { nextFollowUp: "" });
  });

  it("flags rows whose resume was sent and edits text cells inline", async () => {
    const onPatch = vi.fn();
    render(
      <ContactsTable
        contacts={[contact({ id: "1", name: "Ann", resume: { sent: true, date: "2026-01-01", status: "offer" } })]}
        onPatch={onPatch}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByTitle("Resume sent · Offer")).toBeInTheDocument();

    await user().click(screen.getByRole("button", { name: "Ann" }));
    await user().type(screen.getByDisplayValue("Ann"), "e{Enter}");
    expect(onPatch).toHaveBeenCalledWith("1", { name: "Anne" });
  });

  it("edits and deletes a row", async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    setup({ onEdit, onRemove });

    await user().click(screen.getAllByTitle("Edit")[0]);
    expect(onEdit).toHaveBeenCalledWith(contacts[2]);

    await user().click(screen.getAllByTitle("Delete")[0]);
    expect(onRemove).toHaveBeenCalledWith("3");
  });
});

describe("InlineText", () => {
  it("commits a trimmed value on Enter", async () => {
    const onCommit = vi.fn();
    render(<InlineText value="Ann" onCommit={onCommit} />);
    await user().click(screen.getByRole("button", { name: "Ann" }));
    await user().type(screen.getByRole("textbox"), "  ie  {Enter}");
    expect(onCommit).toHaveBeenCalledWith("Ann  ie");
  });

  it("commits on blur and reverts on Escape", async () => {
    const onCommit = vi.fn();
    render(<InlineText value="Ann" onCommit={onCommit} />);

    await user().click(screen.getByRole("button", { name: "Ann" }));
    await user().type(screen.getByRole("textbox"), "a");
    await user().tab();
    expect(onCommit).toHaveBeenCalledWith("Anna");

    await user().click(screen.getByRole("button", { name: "Ann" }));
    await user().type(screen.getByRole("textbox"), "zzz{Escape}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Ann" })).toBeInTheDocument();
  });

  it("shows a placeholder when empty", () => {
    render(<InlineText value="" onCommit={vi.fn()} placeholder="—" />);
    expect(screen.getByRole("button", { name: "—" })).toBeInTheDocument();
  });
});

describe("ResumeView", () => {
  const contacts = [
    contact({ id: "1", name: "Ann", resume: { sent: true, date: "2026-01-05", status: "interviewing", reason: "referral" } }),
    contact({ id: "2", name: "Bob", resume: { sent: true, date: "2026-02-05", status: "interviewing" } }),
    contact({ id: "3", name: "Cid", resume: { sent: true, date: "", status: "offer" } }),
    contact({ id: "4", name: "Dee" }),
  ];

  it("prompts when nothing has been sent", () => {
    render(<ResumeView contacts={[contact()]} onPatch={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("No resumes sent yet")).toBeInTheDocument();
  });

  it("groups by status, newest first, and hides contacts without a resume", () => {
    render(<ResumeView contacts={contacts} onPatch={vi.fn()} onEdit={vi.fn()} />);

    const interviewing = screen.getByRole("heading", { name: /Interviewing/ }).closest("section");
    expect(within(interviewing).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Bob"),
      expect.stringContaining("Ann"),
    ]);
    expect(within(interviewing).getByText("referral")).toBeInTheDocument();
    expect(screen.queryByText("Dee")).not.toBeInTheDocument();
  });

  it("patches the application status from the row select", async () => {
    const onPatch = vi.fn();
    render(<ResumeView contacts={contacts} onPatch={onPatch} onEdit={vi.fn()} />);

    const offer = screen.getByRole("heading", { name: /Offer/ }).closest("section");
    await user().selectOptions(within(offer).getByRole("combobox"), "rejected");
    expect(onPatch).toHaveBeenCalledWith("3", { resume: { sent: true, date: "", status: "rejected" } });
  });
});

describe("ReviewView", () => {
  const update = {
    id: "s1",
    kind: "update",
    contactId: "1",
    contactName: "Ann",
    emailAddress: "ann@acme.com",
    date: "2026-03-09",
    subject: "Re: coffee",
    summary: "Ann replied.",
    suggestedStage: "in_conversation",
  };
  const newContact = { ...update, id: "s2", kind: "new_contact", contactId: null, suggestedStage: null };

  it("offers a test suggestion when the queue is empty", async () => {
    const onAddTest = vi.fn();
    render(<ReviewView queue={[]} onApply={vi.fn()} onDismiss={vi.fn()} onAddContact={vi.fn()} onAddTest={onAddTest} />);

    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /Add test suggestion/ }));
    expect(onAddTest).toHaveBeenCalled();
  });

  it("approves an update with the edited summary and the suggested stage", async () => {
    const onApply = vi.fn();
    render(<ReviewView queue={[update]} onApply={onApply} onDismiss={vi.fn()} onAddContact={vi.fn()} onAddTest={vi.fn()} />);

    await user().type(screen.getByRole("textbox"), " Wants Tuesday.");
    await user().click(screen.getByRole("button", { name: /Approve/ }));

    expect(onApply).toHaveBeenCalledWith({
      id: "s1",
      contactId: "1",
      date: "2026-03-09",
      subject: "Re: coffee",
      summary: "Ann replied. Wants Tuesday.",
      stage: "in_conversation",
    });
  });

  it("omits the stage change when the user unticks it", async () => {
    const onApply = vi.fn();
    render(<ReviewView queue={[update]} onApply={onApply} onDismiss={vi.fn()} onAddContact={vi.fn()} onAddTest={vi.fn()} />);

    await user().click(screen.getByRole("checkbox"));
    await user().click(screen.getByRole("button", { name: /Approve/ }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ stage: null }));
  });

  it("dismisses a suggestion", async () => {
    const onDismiss = vi.fn();
    render(<ReviewView queue={[update]} onApply={vi.fn()} onDismiss={onDismiss} onAddContact={vi.fn()} onAddTest={vi.fn()} />);
    await user().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("s1");
  });

  it("offers to add an unknown sender as a contact instead of applying an update", async () => {
    const onAddContact = vi.fn();
    render(
      <ReviewView queue={[newContact]} onApply={vi.fn()} onDismiss={vi.fn()} onAddContact={onAddContact} onAddTest={vi.fn()} />
    );

    expect(screen.getByText("New sender")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /Add as contact/ }));
    expect(onAddContact).toHaveBeenCalledWith(newContact);
  });
});

describe("ContactModal", () => {
  const setup = (props = {}) =>
    render(
      <ContactModal
        initial={contact()}
        isNew
        autoFocusField={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    );

  it("blocks saving without a name", async () => {
    const onSave = vi.fn();
    setup({ initial: contact({ name: "  " }), onSave });

    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    await user().click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a trimmed name on Enter in the name field", async () => {
    const onSave = vi.fn();
    setup({ initial: contact({ name: "" }), onSave });

    await user().type(screen.getByPlaceholderText("Jane Doe"), "  Jane  {Enter}");
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane" }));
  });

  it("toggles channels on and off", async () => {
    const onSave = vi.fn();
    setup({ onSave });

    await user().click(toggle("Email"));
    await user().click(toggle("Call"));
    await user().click(toggle("Email"));
    await user().click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ channels: ["call"] }));
  });

  it("warns when an active stage has no follow-up date, and reveals the meeting date field", async () => {
    setup();
    const stage = screen.getByRole("combobox");

    await user().selectOptions(stage, "in_conversation");
    expect(screen.getByText(/This stage is active/)).toBeInTheDocument();

    await user().selectOptions(stage, "meeting_scheduled");
    expect(screen.getByText(/When is the meeting scheduled for/)).toBeInTheDocument();

    await user().selectOptions(stage, "warm");
    expect(screen.queryByText(/This stage is active/)).not.toBeInTheDocument();
  });

  it("reveals reminder options once a follow-up date is set", async () => {
    const onSave = vi.fn();
    const { container } = setup({ onSave });
    expect(screen.queryByText("No reminder", { selector: "button" })).not.toBeInTheDocument();

    const [, nextFollowUp] = container.querySelectorAll('input[type="date"]');
    await user().type(nextFollowUp, "2026-03-20");
    await user().click(toggle("No reminder"));
    await user().click(screen.getByRole("button", { name: /Save/ }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nextFollowUp: "2026-03-20", reminder: "none" }));
  });

  it("stamps today's date the first time the resume box is ticked", async () => {
    const onSave = vi.fn();
    setup({ onSave });

    await user().click(screen.getByRole("checkbox"));
    await user().type(screen.getByPlaceholderText(/Referral from Russell/), "open role");
    await user().click(screen.getByRole("button", { name: /Save/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        resume: { sent: true, date: "2026-03-10", status: "applied", reason: "open role" },
      })
    );
  });

  it("edits the identity fields, the meeting date and the resume details", async () => {
    const onSave = vi.fn();
    const { container } = setup({ onSave });

    await user().type(screen.getByPlaceholderText("jane@acme.com"), "jane@acme.com");
    await user().type(screen.getByPlaceholderText("Acme Inc."), "Acme");
    await user().type(screen.getByPlaceholderText("Eng Manager"), "CTO");
    await user().type(screen.getByPlaceholderText(/What did you talk about/), "Great chat");

    await user().selectOptions(screen.getByRole("combobox"), "meeting_scheduled");
    const [meetingAt, lastContact] = container.querySelectorAll('input[type="date"]');
    await user().type(meetingAt, "2026-03-18");
    await user().type(lastContact, "2026-03-05");

    await user().click(screen.getByRole("checkbox"));
    const [, , , resumeDate] = container.querySelectorAll('input[type="date"]');
    await user().clear(resumeDate);
    await user().type(resumeDate, "2026-02-01");
    await user().selectOptions(screen.getAllByRole("combobox")[1], "interviewing");

    await user().click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@acme.com",
        company: "Acme",
        role: "CTO",
        notes: "Great chat",
        stage: "meeting_scheduled",
        meetingAt: "2026-03-18",
        lastContact: "2026-03-05",
        resume: { sent: true, date: "2026-02-01", status: "interviewing", reason: "" },
      })
    );
  });

  it("only offers delete for an existing contact", async () => {
    const onDelete = vi.fn();
    const { unmount } = setup();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
    unmount();

    setup({ isNew: false, initial: contact({ id: "c_9" }), onDelete });
    await user().click(screen.getByRole("button", { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalledWith("c_9");
  });

  it("closes from the header, Cancel and the backdrop", async () => {
    const onClose = vi.fn();
    setup({ onClose });

    await user().click(screen.getByTitle("Close (Esc)"));
    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ConfirmDialog", () => {
  it("wires up confirm and cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Reset all data?" body="Gone forever." confirmLabel="Delete everything" onCancel={onCancel} onConfirm={onConfirm} />
    );

    expect(screen.getByText("Reset all data?")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(onConfirm).toHaveBeenCalled();

    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
