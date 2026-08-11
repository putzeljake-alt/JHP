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

export const SEED = [
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
