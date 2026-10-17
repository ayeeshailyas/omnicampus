'use strict';
/* OmniCampus backend — zero dependencies. Needs Node >= 22.13 (built-in node:sqlite). */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'client', 'dist');
/* Registration fees are fixed server-side; the client can never choose the amount. */
const FEES = { student: +process.env.FEE_STUDENT || 500, company: +process.env.FEE_COMPANY || 1500 };
const CURRENCY = process.env.CURRENCY || 'PKR';
const MODE = process.env.PAYMENT_MODE === 'demo' ? 'demo' : 'manual';
const METHODS = ['JazzCash', 'Easypaisa', 'Bank transfer'];
const INSTRUCTIONS = process.env.PAY_INSTRUCTIONS || 'Send the fee to JazzCash/Easypaisa 0300-0000000 or bank account PK00 XXXX 0000 0000 0000 0000 (title: OmniCampus), then enter the transaction ID below. Update these details with PAY_INSTRUCTIONS.';
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

/* ---------- secrets & crypto ---------- */
const SECRET = process.env.SECRET || (() => {
  const f = path.join(DATA, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
})();
const uid = (p = '') => p + crypto.randomBytes(6).toString('hex');
const hashPw = pw => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const checkPw = (pw, st) => { const [s, h] = String(st).split(':'); if (!s || !h) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex')); };
const b64 = b => Buffer.from(b).toString('base64url');
const mac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const sign = id => { const p = b64(JSON.stringify({ id, exp: Date.now() + 7 * 864e5 })); return p + '.' + mac(p); };
const unsign = t => { const [p, m] = String(t).split('.'); if (!p || !m) return null;
  const a = Buffer.from(mac(p)), b = Buffer.from(m); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url')); return o.exp > Date.now() ? o.id : null; } catch { return null; } };

/* ---------- database ---------- */
const db = new DatabaseSync(path.join(DATA, 'omnicampus.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN('admin','company','student')), email TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL, name TEXT NOT NULL, vs TEXT NOT NULL DEFAULT 'pending', p TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, cid TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, need INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'Requested', p TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS assign(kid TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, sid TEXT NOT NULL REFERENCES users(id), revealed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kid,sid));
CREATE TABLE IF NOT EXISTS files(fid TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL, ref TEXT NOT NULL, file TEXT, st TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subs(id TEXT PRIMARY KEY, kid TEXT NOT NULL REFERENCES campaigns(id), sid TEXT NOT NULL REFERENCES users(id), note TEXT NOT NULL, file TEXT, st TEXT NOT NULL DEFAULT 'Pending', at TEXT NOT NULL);`);
const one = (q, ...a) => db.prepare(q).get(...a), all = (q, ...a) => db.prepare(q).all(...a), run = (q, ...a) => db.prepare(q).run(...a);

const ST = ['Available', 'Shortlisted', 'Active Ambassador', 'Completed', 'Inactive'];
const toU = r => r && ({ id: r.id, role: r.role, email: r.email, name: r.name, vs: r.vs, ...JSON.parse(r.p) });
const setP = (id, patch) => { const r = one('SELECT p FROM users WHERE id=?', id); run('UPDATE users SET p=? WHERE id=?', JSON.stringify({ ...JSON.parse(r.p), ...patch }), id); };
const csv = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

function toC(r) {
  const a = all('SELECT sid,revealed FROM assign WHERE kid=?', r.id);
  return { id: r.id, cid: r.cid, title: r.title, need: r.need, state: r.state, ...JSON.parse(r.p),
    assigned: a.map(x => x.sid), revealed: a.filter(x => x.revealed).map(x => x.sid) };
}

const now = () => new Date().toISOString().slice(0, 10);
const payOf = u => { if (u.role === 'admin') return null;
  const r = one('SELECT * FROM payments WHERE uid=? ORDER BY rowid DESC LIMIT 1', u.id);
  return { amount: FEES[u.role], currency: CURRENCY, status: r ? r.st : 'Unpaid', method: r?.method, ref: r?.ref, note: r?.note }; };
const isPaid = id => !!one("SELECT 1 x FROM payments WHERE uid=? AND st='Confirmed'", id);

/* ---------- seed ---------- */
if (!one('SELECT 1 x FROM users LIMIT 1')) {
  const ins = (id, role, email, pw, name, vs, p) => run('INSERT INTO users VALUES(?,?,?,?,?,?,?)', id, role, email, hashPw(pw), name, vs, JSON.stringify(p || {}));
  const adminPw = process.env.ADMIN_PASSWORD || 'admin123';
  ins('a1', 'admin', process.env.ADMIN_EMAIL || 'admin@omnicampus.com', adminPw, 'Super Admin', 'verified');
  if (process.env.SEED_DEMO !== '0') {
    const S = (id, n, uni, deg, bt, city, sk, int, perf, vs) => ins(id, 'student', n.split(' ')[0].toLowerCase() + '@' + uni.toLowerCase().replace(/\W/g, '') + '.edu.pk', 'demo', n, vs,
      { phone: '0300' + Math.floor(1e6 + Math.random() * 9e6), uni, degree: deg, batch: bt, city, skills: sk, interests: int, social: '@' + n.split(' ')[0].toLowerCase(), idFile: 'id_card.jpg', status: 'Available', perf });
    S('s1', 'Ayesha Khan', 'UAF', 'BS Marketing', '6th Sem', 'Faisalabad', 'instagram, content creation, photography', 'skincare, fashion', 88, 'verified');
    S('s2', 'Bilal Ahmed', 'NUST', 'BS Computer Science', '4th Sem', 'Islamabad', 'public speaking, tiktok, sales', 'tech, gadgets', 74, 'verified');
    S('s3', 'Hira Malik', 'LUMS', 'BBA', '8th Sem', 'Lahore', 'instagram, copywriting, event hosting', 'skincare, apparel', 92, 'verified');
    S('s4', 'Usman Tariq', 'GCUF', 'BS Business', '2nd Sem', 'Faisalabad', 'sales, networking', 'apparel, food', 61, 'verified');
    S('s5', 'Sana Iqbal', 'Punjab University', 'BS Media Studies', '6th Sem', 'Lahore', 'video editing, content creation, instagram', 'skincare, lifestyle', 80, 'verified');
    S('s6', 'Danish Raza', 'FAST', 'BS Software Eng', '2nd Sem', 'Karachi', 'tiktok, design', 'tech', 50, 'pending');
    ins('c1', 'company', 'shop@glowlab.com', 'demo', 'GlowLab Skincare', 'verified', { industry: 'Skincare', domain: 'glowlab.com', social: '@glowlab', contact: 'Mariam Shah', phone: '0300 5551234' });
    ins('c2', 'company', 'hello@urbanthread.pk', 'demo', 'UrbanThread', 'pending', { industry: 'Apparel', domain: 'urbanthread.pk', social: '@urbanthread', contact: 'Kamran Ali', phone: '0321 7771234' });
    const pay = (uidv, role, st) => run('INSERT INTO payments VALUES(?,?,?,?,?,?,?,?,?,?)', uid('y'), uidv, FEES[role], CURRENCY, 'JazzCash', 'SEED' + uidv, null, st, '', now());
    ['s1', 's2', 's3', 's4', 's5'].forEach(i => pay(i, 'student', 'Confirmed')); pay('c1', 'company', 'Confirmed');
    pay('s6', 'student', 'Submitted'); /* c2 stays unpaid to demonstrate the fee gate */
    run('INSERT INTO campaigns VALUES(?,?,?,?,?,?)', 'k1', 'c1', 'GlowLab Campus Launch', 2, 'Requested', JSON.stringify({ cities: 'Faisalabad, Lahore', unis: '', skills: 'instagram, content creation, photography', interests: 'skincare', duration: '8 weeks', resp: 'Host sampling stalls, post 3 reels/week, collect survey responses.', inc: ['Paid stipend', 'PR kit', 'Certificate'] }));
  }
  console.log('Database seeded. Admin login:', process.env.ADMIN_EMAIL || 'admin@omnicampus.com');
}

/* ---------- AI matching engine ---------- */
function match(c) {
  const need = csv(c.skills), ints = csv(c.interests), cities = csv(c.cities), unis = csv(c.unis);
  const busy = new Set(all('SELECT DISTINCT sid FROM assign').map(x => x.sid));
  return all("SELECT * FROM users WHERE role='student' AND vs='verified'").map(toU)
    .filter(s => s.status !== 'Inactive' && !c.assigned.includes(s.id)).map(s => {
      const sk = csv(s.skills), it = csv(s.interests), why = []; let sc = 0;
      const a = need.filter(x => sk.includes(x)); if (need.length) { sc += 40 * a.length / need.length; if (a.length) why.push('Skills: ' + a.join(', ')); }
      const b = ints.filter(x => it.includes(x)); if (ints.length) { sc += 20 * b.length / ints.length; if (b.length) why.push('Interests: ' + b.join(', ')); }
      if (!cities.length || cities.includes(String(s.city).toLowerCase())) { sc += 15; if (cities.length) why.push('In target city'); }
      if (!unis.length || unis.includes(String(s.uni).toLowerCase())) { sc += 10; if (unis.length) why.push('Target university'); }
      sc += (s.perf || 0) * .15; if (s.perf >= 80) why.push('Strong past performance');
      if (busy.has(s.id)) sc -= 5;
      return { s: { id: s.id, name: s.name, uni: s.uni, city: s.city }, score: Math.max(0, Math.round(sc)), why };
    }).sort((x, y) => y.score - x.score).slice(0, 6);
}

/* ---------- helpers ---------- */
const E = (status, error) => Object.assign(new Error(error), { status });
const str = (x, n = 300) => String(x ?? '').trim().slice(0, n);
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
function saveFile(f, owner) {
  if (!f || !f.data) return null;
  const ext = path.extname(str(f.name, 120)).toLowerCase();
  if (!EXT.has(ext)) throw E(400, 'Only JPG, PNG, WEBP or PDF files are allowed');
  const buf = Buffer.from(String(f.data), 'base64');
  if (!buf.length || buf.length > 5e6) throw E(400, 'File must be between 1 byte and 5 MB');
  const fid = uid('f');
  fs.writeFileSync(path.join(DATA, 'uploads', fid + ext), buf);
  run('INSERT INTO files VALUES(?,?,?)', fid, owner, str(f.name, 120));
  return fid;
}
const subsSql = `SELECT s.id,s.kid,s.note,s.st,s.at,s.file fid,f.name fname,u.name sname,k.title ktitle FROM subs s
  JOIN users u ON u.id=s.sid JOIN campaigns k ON k.id=s.kid LEFT JOIN files f ON f.fid=s.file`;

/* ---------- routes ---------- */
const routes = [];
const route = (m, p, roles, h) => routes.push({ m, re: new RegExp('^' + p.replace(/:\w+/g, '([^/]+)') + '$'), roles, h });
const hits = new Map();
const limited = ip => { const n = Date.now(), h = (hits.get(ip) || []).filter(t => n - t < 6e5); h.push(n); hits.set(ip, h); return h.length > 25; };

route('GET', '/api/meta', null, () => ({ demo: !!one("SELECT 1 x FROM users WHERE id='s1'"), fees: FEES, currency: CURRENCY, instructions: INSTRUCTIONS, methods: MODE === 'demo' ? [...METHODS, 'Demo payment'] : METHODS }));

route('POST', '/api/login', null, ({ body, ip }) => {
  if (limited(ip)) throw E(429, 'Too many attempts. Try again in a few minutes.');
  const r = one('SELECT * FROM users WHERE email=?', str(body.email, 200));
  if (!r || !checkPw(String(body.password || ''), r.pass)) throw E(401, 'Invalid email or password');
  return { token: sign(r.id) };
});

route('POST', '/api/register', null, ({ body, ip }) => {
  if (limited(ip)) throw E(429, 'Too many attempts. Try again in a few minutes.');
  const role = body.role, email = str(body.email, 200), name = str(body.name, 120), pw = String(body.password || '');
  if (!['student', 'company'].includes(role)) throw E(400, 'Choose student or company');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw E(400, 'Enter a valid email');
  if (!name) throw E(400, 'Name is required');
  if (pw.length < 8) throw E(400, 'Password must be at least 8 characters');
  if (one('SELECT 1 x FROM users WHERE email=?', email)) throw E(409, 'Email already registered');
  const id = uid(role[0]);
  let p;
  if (role === 'student') {
    if (!body.file) throw E(400, 'Upload your university ID photo');
    p = { phone: str(body.phone, 40), uni: str(body.uni, 120), degree: str(body.degree, 120), batch: str(body.batch, 40), city: str(body.city, 80), skills: str(body.skills, 300), interests: str(body.interests, 300), social: str(body.social, 200), status: 'Available', perf: 50 };
    if (!p.uni) throw E(400, 'University is required');
    p.idFid = saveFile(body.file, id); p.idFile = str(body.file.name, 120);
  } else {
    p = { industry: str(body.industry, 120), domain: str(body.domain, 120), social: str(body.social, 200), contact: str(body.contact, 120), phone: str(body.phone, 40) };
    if (!p.contact) throw E(400, 'Primary contact is required');
  }
  run('INSERT INTO users VALUES(?,?,?,?,?,?,?)', id, role, email, hashPw(pw), name, 'pending', JSON.stringify(p));
  return { token: sign(id) };
});

/* The state endpoint is the isolation boundary: each role gets only its own slice. */
route('GET', '/api/state', 'any', ({ u }) => {
  const me = { ...toU(u), fee: payOf(u) };
  if (u.role === 'admin') return {
    me, users: all("SELECT * FROM users WHERE role!='admin'").map(r => ({ ...toU(r), fee: payOf(r) })),
    payments: all(`SELECT y.id,y.uid,y.amount,y.currency,y.method,y.ref,y.file fid,y.st,y.note,y.at,u.name uname,u.role urole,f.name fname FROM payments y JOIN users u ON u.id=y.uid LEFT JOIN files f ON f.fid=y.file ORDER BY y.rowid DESC`),
    campaigns: all('SELECT * FROM campaigns').map(toC), subs: all(subsSql + ' ORDER BY s.rowid DESC') };
  if (u.vs !== 'verified') return { me, campaigns: [], subs: [] };
  if (u.role === 'company') return { me, subs: [], campaigns: all('SELECT * FROM campaigns WHERE cid=?', u.id).map(k => {
    const c = toC(k);
    c.talent = all('SELECT a.sid,a.revealed FROM assign a WHERE a.kid=?', k.id).map(a => {
      const s = toU(one('SELECT * FROM users WHERE id=?', a.sid));
      return { name: s.name, uni: s.uni, degree: s.degree, skills: s.skills, status: s.status,
        done: one("SELECT COUNT(*) n FROM subs WHERE kid=? AND sid=? AND st='Approved'", k.id, a.sid).n,
        contact: a.revealed ? `${s.email} · ${s.phone}` : null };
    });
    return { id: c.id, title: c.title, need: c.need, state: c.state, cities: c.cities, duration: c.duration, resp: c.resp, inc: c.inc, talent: c.talent };
  }) };
  return { me, subs: all(subsSql + ' WHERE s.sid=? ORDER BY s.rowid DESC', u.id),
    campaigns: all('SELECT k.*,a.revealed FROM assign a JOIN campaigns k ON k.id=a.kid WHERE a.sid=?', u.id).map(k => {
      const c = toC(k), co = toU(one('SELECT * FROM users WHERE id=?', k.cid));
      return { id: c.id, title: c.title, duration: c.duration, resp: c.resp, inc: c.inc, state: c.state, brand: co.name,
        contact: k.revealed ? `${co.contact} · ${co.phone} · ${co.email}` : null };
    }) };
});

route('POST', '/api/pay', 'any', ({ u, body }) => {
  if (u.role === 'admin') throw E(400, 'Admins do not pay a fee');
  const cur = payOf(u);
  if (cur.status === 'Confirmed') throw E(409, 'Registration fee already paid');
  if (cur.status === 'Submitted') throw E(409, 'Payment already submitted and awaiting confirmation');
  const method = str(body.method, 40), ok = MODE === 'demo' ? [...METHODS, 'Demo payment'] : METHODS;
  if (!ok.includes(method)) throw E(400, 'Choose a payment method');
  let st = 'Submitted', ref = str(body.ref, 60);
  if (method === 'Demo payment') { st = 'Confirmed'; ref = 'DEMO-' + uid(); }
  else {
    if (ref.length < 4) throw E(400, 'Enter the transaction reference from your payment receipt');
    if (one("SELECT 1 x FROM payments WHERE ref=? AND st!='Rejected'", ref)) throw E(409, 'This transaction reference was already used');
  }
  run('INSERT INTO payments VALUES(?,?,?,?,?,?,?,?,?,?)', uid('y'), u.id, FEES[u.role], CURRENCY, method, ref, saveFile(body.file, u.id), st, '', now());
  return { status: st };
});

const A = ['admin'];
route('POST', '/api/admin/verify/:id', A, ({ params, body }) => {
  if (!['verified', 'rejected'].includes(body.status)) throw E(400, 'Bad status');
  if (body.status === 'verified' && !isPaid(params[0])) throw E(409, 'Registration fee has not been confirmed yet');
  if (!run("UPDATE users SET vs=? WHERE id=? AND role!='admin'", body.status, params[0]).changes) throw E(404, 'User not found'); return {};
});
route('POST', '/api/admin/payments/:id', A, ({ params, body }) => {
  if (!['Confirmed', 'Rejected'].includes(body.st)) throw E(400, 'Bad status');
  if (!run("UPDATE payments SET st=?, note=? WHERE id=? AND st='Submitted'", body.st, str(body.note, 200), params[0]).changes) throw E(409, 'Payment is not awaiting review'); return {};
});
route('GET', '/api/admin/campaigns/:id/match', A, ({ params }) => {
  const k = one('SELECT * FROM campaigns WHERE id=?', params[0]); if (!k) throw E(404, 'Campaign not found'); return match(toC(k));
});
route('POST', '/api/admin/campaigns/:id/state', A, ({ params, body }) => {
  if (!['Requested', 'Active', 'Completed'].includes(body.state)) throw E(400, 'Bad state');
  run('UPDATE campaigns SET state=? WHERE id=?', body.state, params[0]); return {};
});
route('POST', '/api/admin/campaigns/:id/assign', A, ({ params, body }) => {
  const k = one('SELECT * FROM campaigns WHERE id=?', params[0]);
  const s = one("SELECT * FROM users WHERE id=? AND role='student' AND vs='verified'", String(body.sid));
  if (!k || !s) throw E(404, 'Campaign or verified student not found');
  if (one('SELECT 1 x FROM assign WHERE kid=? AND sid=?', k.id, s.id)) throw E(409, 'Already assigned');
  if (!body.force && one('SELECT COUNT(*) n FROM assign WHERE kid=?', k.id).n >= k.need) throw E(409, 'Campaign is full');
  run('INSERT INTO assign(kid,sid) VALUES(?,?)', k.id, s.id); setP(s.id, { status: 'Active Ambassador' });
  if (k.state === 'Requested') run("UPDATE campaigns SET state='Active' WHERE id=?", k.id); return {};
});
route('POST', '/api/admin/campaigns/:id/unassign', A, ({ params, body }) => {
  run('DELETE FROM assign WHERE kid=? AND sid=?', params[0], String(body.sid));
  if (!one('SELECT 1 x FROM assign WHERE sid=?', String(body.sid))) setP(String(body.sid), { status: 'Available' }); return {};
});
route('POST', '/api/admin/campaigns/:id/reveal', A, ({ params, body }) => {
  if (!run('UPDATE assign SET revealed=1-revealed WHERE kid=? AND sid=?', params[0], String(body.sid)).changes) throw E(404, 'Assignment not found'); return {};
});
route('POST', '/api/admin/students/:id/status', A, ({ params, body }) => {
  if (!ST.includes(body.status)) throw E(400, 'Bad status');
  if (!one("SELECT 1 x FROM users WHERE id=? AND role='student'", params[0])) throw E(404, 'Student not found');
  setP(params[0], { status: body.status }); return {};
});
route('POST', '/api/admin/subs/:id', A, ({ params, body }) => {
  if (!['Approved', 'Rejected'].includes(body.st)) throw E(400, 'Bad status');
  const s = one('SELECT * FROM subs WHERE id=?', params[0]); if (!s) throw E(404, 'Submission not found');
  run('UPDATE subs SET st=? WHERE id=?', body.st, s.id);
  if (body.st === 'Approved' && s.st !== 'Approved') { const p = toU(one('SELECT * FROM users WHERE id=?', s.sid)); setP(s.sid, { perf: Math.min(100, (p.perf || 0) + 4) }); }
  return {};
});

route('POST', '/api/company/campaigns', ['company'], ({ u, body }) => {
  const title = str(body.title, 160), resp = str(body.resp, 2000);
  if (!title || !resp) throw E(400, 'Title and responsibilities are required');
  const inc = (Array.isArray(body.inc) ? body.inc : []).map(x => str(x, 60)).slice(0, 8), id = uid('k');
  run('INSERT INTO campaigns VALUES(?,?,?,?,?,?)', id, u.id, title, Math.min(500, Math.max(1, +body.need || 1)), 'Requested',
    JSON.stringify({ cities: str(body.cities), unis: str(body.unis), skills: str(body.skills), interests: str(body.interests), duration: str(body.duration, 80), resp, inc }));
  return { id };
});

route('POST', '/api/student/subs', ['student'], ({ u, body }) => {
  if (!one('SELECT 1 x FROM assign WHERE kid=? AND sid=?', String(body.kid), u.id)) throw E(403, 'You are not assigned to this campaign');
  const note = str(body.note, 2000); if (!note) throw E(400, 'Describe your completed task');
  run('INSERT INTO subs VALUES(?,?,?,?,?,?,?)', uid('p'), body.kid, u.id, note, saveFile(body.file, u.id), 'Pending', new Date().toISOString().slice(0, 10)); return {};
});

route('GET', '/api/files/:fid', 'any', ({ u, params, res }) => {
  const f = one('SELECT * FROM files WHERE fid=?', params[0]);
  if (!f || (u.role !== 'admin' && f.owner !== u.id)) throw E(404, 'File not found');
  const ext = path.extname(fs.readdirSync(path.join(DATA, 'uploads')).find(n => n.startsWith(f.fid)) || '');
  const types = { '.pdf': 'application/pdf', '.png': 'image/png', '.webp': 'image/webp' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  res.end(fs.readFileSync(path.join(DATA, 'uploads', f.fid + ext))); return null;
});

/* ---------- server ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SEC }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => { let n = 0; const c = [];
  req.on('data', d => { n += d.length; if (n > 8e6) { no(E(413, 'Request too large')); req.destroy(); } else c.push(d); });
  req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch { no(E(400, 'Invalid JSON')); } });
  req.on('error', no); });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p.startsWith('/api/')) {
      const r = routes.find(r => r.m === req.method && r.re.test(p));
      if (!r) throw E(404, 'Not found');
      const params = p.match(r.re).slice(1).map(decodeURIComponent);
      let u = null;
      if (r.roles) {
        const id = unsign((req.headers.authorization || '').replace(/^Bearer /, ''));
        u = id && one('SELECT * FROM users WHERE id=?', id);
        if (!u) throw E(401, 'Please sign in');
        if (r.roles !== 'any' && !r.roles.includes(u.role)) throw E(403, 'Not allowed for your role');
        if (u.role !== 'admin' && u.vs !== 'verified' && r.roles !== 'any') throw E(403, 'Your account is awaiting verification');
      }
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = r.h({ u, body, params, res, ip: req.socket.remoteAddress });
      if (out !== null) send(res, 200, out);
      return;
    }
    if (req.method !== 'GET') throw E(405, 'Method not allowed');
    if (!fs.existsSync(path.join(PUB, 'index.html'))) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('Frontend not built. Run: npm run build'); }
    const f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) throw E(404, 'Not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', ...SEC }); res.end(fs.readFileSync(f));
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`OmniCampus running on http://localhost:${PORT}`));
module.exports = server;
