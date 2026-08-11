// localStorage is synchronous: getItem returns the stored string, or
// null when the key has never been written (first run).
export function readJSON(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
export function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
