let token = null, onUnauthorized = () => {};
try { token = localStorage.getItem('oc.t'); } catch { /* storage unavailable */ }

export const setToken = t => {
  token = t;
  try { t ? localStorage.setItem('oc.t', t) : localStorage.removeItem('oc.t'); } catch { /* ignore */ }
};
export const hasToken = () => !!token;
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

/** All data access goes through here. The server decides what each role may see. */
export async function api(method, path, body) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token) onUnauthorized();
    throw new Error(j.error || 'Request failed');
  }
  return j;
}

export const fileData = f => new Promise((ok, no) => {
  if (!f) return ok(null);
  if (f.size > 5e6) return no(new Error('File too large (max 5 MB)'));
  const r = new FileReader();
  r.onload = () => ok({ name: f.name, data: String(r.result).split(',')[1] });
  r.onerror = () => no(new Error('Could not read file'));
  r.readAsDataURL(f);
});

export async function openFile(fid) {
  const r = await fetch('/api/files/' + fid, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Could not open file');
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}
