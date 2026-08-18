// Minimal frontmatter reader shared by the crm scripts.
// Supported value syntax (one `key: value` per line, no nesting):
//   strings (bare or quoted), numbers, true/false/null,
//   inline JSON arrays/objects, e.g. emails: ["a@b.com", "c@d.com"]
export function parsePortfolio(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter block (--- ... ---)`);
  const [, fm, body] = m;
  const data = {};
  for (const [i, line] of fm.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s?(.*)$/);
    if (!kv) throw new Error(`${file}: bad frontmatter line ${i + 1}: ${JSON.stringify(line)}`);
    const [, key, rawVal] = kv;
    const v = rawVal.trim();
    if (v === '') { data[key] = null; continue; }
    try {
      data[key] = JSON.parse(v); // handles arrays, objects, quoted strings, numbers, booleans, null
    } catch {
      data[key] = v; // bare string
    }
  }
  return { data, body };
}
