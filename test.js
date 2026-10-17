'use strict';
/* Integration tests for the isolation rules and workflow: `npm test` */
const os = require('node:os'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-'));
const server = require('./server');
server.listen(0, async () => {
  const base = 'http://localhost:' + server.address().port;
  const call = async (m, p, body, tok) => { const r = await fetch(base + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const login = async (email, password) => (await call('POST', '/login', { email, password })).j.token;
  let n = 0, up2tok; const ok = (c, m) => { assert.ok(c, m); console.log('  ✓', m); n++; };
  try {
    const admin = await login('admin@omnicampus.com', 'admin123'), co = await login('shop@glowlab.com', 'demo'), st = await login('ayesha@uaf.edu.pk', 'demo');
    ok(admin && co && st, 'all three roles can sign in');
    ok((await call('POST', '/login', { email: 'admin@omnicampus.com', password: 'nope' })).s === 401, 'wrong password rejected');
    ok((await call('GET', '/state')).s === 401, 'unauthenticated request rejected');
    ok((await call('GET', '/state', null, 'forged.token')).s === 401, 'forged token rejected');
    // RBAC
    ok((await call('POST', '/admin/verify/c2', { status: 'verified' }, st)).s === 403, 'student cannot use admin routes');
    ok((await call('POST', '/admin/verify/c2', { status: 'verified' }, co)).s === 403, 'company cannot use admin routes');
    ok((await call('POST', '/company/campaigns', { title: 'x', resp: 'y' }, st)).s === 403, 'student cannot create campaigns');
    // isolation
    const sState = (await call('GET', '/state', null, st)).j, cState = (await call('GET', '/state', null, co)).j;
    ok(!sState.users && !sState.campaigns.length, 'student state has no company/user records and no unassigned campaigns');
    ok(!cState.users && !JSON.stringify(cState).includes('Ayesha'), 'company state exposes no student records before assignment');
    // workflow
    const m = (await call('GET', '/admin/campaigns/k1/match', null, admin)).j;
    ok(m.length && m[0].score >= m[m.length - 1].score, 'AI match returns ranked shortlist: ' + m.map(x => x.s.name + ' ' + x.score).join(', '));
    ok((await call('POST', '/admin/campaigns/k1/assign', { sid: 's1' }, admin)).s === 200, 'admin assigns student');
    ok((await call('POST', '/admin/campaigns/k1/assign', { sid: 's6' }, admin)).s === 404, 'unverified student cannot be assigned');
    const c2 = (await call('GET', '/state', null, co)).j.campaigns[0].talent[0], s2 = (await call('GET', '/state', null, st)).j.campaigns[0];
    ok(c2.name === 'Ayesha Khan' && c2.contact === null, 'company sees assigned talent but contact is hidden');
    ok(s2.contact === null && s2.brand === 'GlowLab Skincare', 'student sees assigned campaign, brand contact hidden');
    await call('POST', '/admin/campaigns/k1/reveal', { sid: 's1' }, admin);
    ok((await call('GET', '/state', null, co)).j.campaigns[0].talent[0].contact.includes('@'), 'contact revealed after admin approval');
    ok(!JSON.stringify((await call('GET', '/state', null, co)).j).includes('"s1"'), 'company never receives student ids');
    // submissions
    ok((await call('POST', '/student/subs', { kid: 'k1', note: 'Posted reel' }, st)).s === 200, 'assigned student submits proof');
    const other = await login('bilal@nust.edu.pk', 'demo');
    ok((await call('POST', '/student/subs', { kid: 'k1', note: 'sneaky' }, other)).s === 403, 'unassigned student cannot submit to campaign');
    const sub = (await call('GET', '/state', null, admin)).j.subs[0];
    await call('POST', '/admin/subs/' + sub.id, { st: 'Approved' }, admin);
    ok((await call('GET', '/state', null, co)).j.campaigns[0].talent[0].done === 1, 'approved proof counted for company');
    // registration + verification gate
    const reg = await call('POST', '/register', { role: 'company', email: 'new@brand.com', password: 'longenough1', name: 'NewBrand', contact: 'Zed' });
    ok(reg.s === 200, 'company registers');
    ok((await call('POST', '/company/campaigns', { title: 'a', resp: 'b' }, reg.j.token)).s === 403, 'unverified company blocked from campaigns');
    ok((await call('POST', '/register', { role: 'student', email: 'x@y.com', password: 'short', name: 'X' })).s === 400, 'weak password rejected');
    // registration fee
    const meta = (await call('GET', '/meta')).j;
    ok(meta.fees.student === 500 && meta.fees.company === 1500, 'fees are 500 (student) and 1500 (company)');
    const me0 = (await call('GET', '/state', null, reg.j.token)).j.me;
    ok(me0.fee.amount === 1500 && me0.fee.status === 'Unpaid', 'new company starts with unpaid 1500 fee');
    ok((await call('POST', '/admin/verify/' + (await call('GET', '/state', null, admin)).j.users.find(u => u.email === 'new@brand.com').id, { status: 'verified' }, admin)).s === 409, 'cannot verify an account before its fee is confirmed');
    ok((await call('POST', '/pay', { method: 'JazzCash', ref: 'ab' }, reg.j.token)).s === 400, 'payment needs a transaction reference');
    ok((await call('POST', '/pay', { method: 'Demo payment' }, reg.j.token)).s === 400, 'demo payment disabled in manual mode');
    ok((await call('POST', '/pay', { method: 'JazzCash', ref: 'TXN-1001', amount: 1 }, reg.j.token)).s === 200, 'company submits payment (client-sent amount ignored)');
    ok((await call('POST', '/pay', { method: 'JazzCash', ref: 'TXN-1002' }, reg.j.token)).s === 409, 'cannot pay twice while one is pending');
    const pays = (await call('GET', '/state', null, admin)).j.payments, py = pays.find(x => x.ref === 'TXN-1001');
    ok(py.amount === 1500 && py.st === 'Submitted', 'admin sees payment of 1500 awaiting review');
    ok((await call('POST', '/pay', { method: 'Bank transfer', ref: 'TXN-1001' }, up2tok = (await call('POST', '/register', { role: 'student', email: 'p@uni.edu.pk', password: 'longenough1', name: 'P', uni: 'U', file: { name: 'id.png', data: 'AAAA' } })).j.token)).s === 409, 'transaction reference cannot be reused');
    ok((await call('POST', '/admin/payments/' + py.id, { st: 'Confirmed' }, co)).s === 403, 'only admin can confirm payments');
    ok(!JSON.stringify((await call('GET', '/state', null, co)).j).includes('TXN-1001'), 'company state never exposes other users\' payments');
    await call('POST', '/admin/payments/' + py.id, { st: 'Confirmed' }, admin);
    ok((await call('POST', '/admin/verify/' + py.uid, { status: 'verified' }, admin)).s === 200, 'verification works after fee confirmed');
    ok((await call('POST', '/company/campaigns', { title: 'a', resp: 'b' }, reg.j.token)).s === 200, 'paid + verified company can now create campaigns');
    ok((await call('GET', '/state', null, up2tok)).j.me.fee.amount === 500, 'student fee is 500');
    // files
    const up = await call('POST', '/register', { role: 'student', email: 'f@uni.edu.pk', password: 'longenough1', name: 'File Guy', uni: 'U', file: { name: 'id.png', data: Buffer.from('png').toString('base64') } });
    const fid = (await call('GET', '/state', null, admin)).j.users.find(u => u.email === 'f@uni.edu.pk').idFid;
    const get = t => fetch(base + '/api/files/' + fid, { headers: { Authorization: 'Bearer ' + t } });
    ok((await get(admin)).status === 200 && (await get(up.j.token)).status === 200 && (await get(co)).status === 404, 'uploaded ID visible to admin and owner only');
    ok((await call('POST', '/register', { role: 'student', email: 'e@uni.edu.pk', password: 'longenough1', name: 'E', uni: 'U', file: { name: 'x.exe', data: 'AAAA' } })).s === 400, 'dangerous file type rejected');
    console.log(`\nAll ${n} checks passed`);
  } catch (e) { console.error('\nFAILED:', e.message); process.exitCode = 1; }
  server.close(); process.exit();
});
