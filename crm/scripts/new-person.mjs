// Scaffolds a new portfolio from the template, pre-filling dates and name
// from crm/data/roster.seed.json when the email is in the roster.
//
// Usage: npm run crm:new -- <email> [Full Name]
//    ex: npm run crm:new -- zeke@202ventures.vc Zeke Medows
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CRM = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [email, ...nameParts] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: npm run crm:new -- <email> [Full Name]');
  process.exit(1);
}

let rosterEntry = null;
const rosterPath = path.join(CRM, 'data', 'roster.seed.json');
if (fs.existsSync(rosterPath)) {
  const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
  rosterEntry = roster.people.find((p) => p.email === email.toLowerCase()) ?? null;
}

const name = nameParts.join(' ') || rosterEntry?.name || `TBD (${email})`;
const slug = (nameParts.length || rosterEntry?.name ? name : email.split('@')[0])
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const out = path.join(CRM, 'people', `${slug}.md`);
if (fs.existsSync(out)) {
  console.error(`Refusing to overwrite existing portfolio: ${out}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const md = fs
  .readFileSync(path.join(CRM, 'templates', 'portfolio.md'), 'utf8')
  .replaceAll('__SLUG__', slug)
  .replaceAll('__NAME__', name)
  .replaceAll('__EMAIL__', email.toLowerCase())
  .replaceAll('__FIRST__', rosterEntry?.firstSeen ?? today)
  .replaceAll('__LAST__', rosterEntry?.lastSeen ?? today);

fs.writeFileSync(out, md);
console.log(`✅ Created ${path.relative(process.cwd(), out)}${rosterEntry ? ' (dates pre-filled from roster)' : ''}`);
console.log('Next: fill in the Summary and Interaction timeline, then run: npm run crm:build');
