// Compiles crm/people/*.md portfolios into:
//   crm/data/people.json      — machine-readable index of every portfolio
//   crm/data/app-import.json  — contacts array importable into the NetworkingCRM
//                               web app (header > Import from JSON; note: import
//                               REPLACES the contacts stored in the browser)
// Also validates each portfolio against the rules that matter (required fields,
// enums, date formats, id/filename agreement) and fails loudly on problems.
//
// Usage: npm run crm:build   (or: node crm/scripts/build-index.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePortfolio } from './frontmatter.mjs';

const CRM = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PEOPLE = path.join(CRM, 'people');
const DATA = path.join(CRM, 'data');

const STAGES = ['to_reach_out', 'in_conversation', 'meeting_scheduled', 'met_next_step', 'warm', 'dormant'];
const CATEGORIES = ['professional', 'personal', 'family', 'service', 'other'];
const STATUSES = ['draft', 'needs_review', 'verified'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const people = [];

for (const file of fs.readdirSync(PEOPLE).filter((f) => f.endsWith('.md')).sort()) {
  const full = path.join(PEOPLE, file);
  let data, body;
  try {
    ({ data, body } = parsePortfolio(fs.readFileSync(full, 'utf8'), file));
  } catch (e) {
    errors.push(e.message);
    continue;
  }
  const err = (msg) => errors.push(`${file}: ${msg}`);

  if (data.id !== path.basename(file, '.md')) err(`id "${data.id}" must match filename`);
  if (!data.name) err('name is required');
  if (!Array.isArray(data.emails)) err('emails must be an array (may be empty while unresolved)');
  if (!CATEGORIES.includes(data.category)) err(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!STAGES.includes(data.stage)) err(`stage must be one of ${STAGES.join(', ')}`);
  if (!STATUSES.includes(data.status)) err(`status must be one of ${STATUSES.join(', ')}`);
  for (const k of ['first_contact', 'last_contact']) {
    if (data[k] != null && !DATE.test(String(data[k]))) err(`${k} must be YYYY-MM-DD or null`);
  }
  if (data.follow_up_date != null && !DATE.test(String(data.follow_up_date))) err('follow_up_date must be YYYY-MM-DD or null');

  people.push({ ...data, portfolio: `crm/people/${file}`, hasTimeline: /## Interaction timeline/i.test(body) });
}

// Duplicate-email guard: one person, one portfolio.
const seen = new Map();
for (const p of people) {
  for (const e of p.emails ?? []) {
    const key = e.toLowerCase();
    if (seen.has(key)) errors.push(`${p.id}: email ${e} already claimed by ${seen.get(key)}`);
    else seen.set(key, p.id);
  }
}

if (errors.length) {
  console.error(`❌ ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(
  path.join(DATA, 'people.json'),
  JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), count: people.length, people }, null, 2) + '\n'
);

// Map portfolios onto the app's contact shape (see emptyContact() in src/NetworkingCRM.jsx).
const contacts = people.map((p) => ({
  id: `pf_${p.id}`,
  name: p.name,
  email: p.emails[0] ?? '',
  company: p.company ?? '',
  role: p.role ?? '',
  channels: (p.channels ?? []).filter((c) => ['call', 'email', 'whatsapp', 'linkedin'].includes(c)),
  stage: p.stage,
  meetingAt: '',
  lastContact: p.last_contact ?? '',
  nextFollowUp: p.follow_up_date ?? '',
  reminder: '7am',
  resume: { sent: false, date: '', status: 'applied', reason: '' },
  activity: [],
  notes: [p.next_step ? `Next: ${p.next_step}` : '', `Portfolio: ${p.portfolio}`].filter(Boolean).join('\n'),
}));
fs.writeFileSync(path.join(DATA, 'app-import.json'), JSON.stringify(contacts, null, 2) + '\n');

console.log(`✅ ${people.length} portfolio(s) → crm/data/people.json, crm/data/app-import.json`);
