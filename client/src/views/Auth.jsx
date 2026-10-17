import { useState } from 'react';
import { api, fileData } from '../api.js';
import { useApp } from '../ctx.js';
import { Field, money } from '../ui.jsx';

const Brand = () => (
  <>
    <div className="brand" style={{ marginBottom: 6 }}><div className="logo">O</div>OmniCampus</div>
    <div className="sub">Admin-curated campus ambassador platform</div>
  </>
);

export function Login({ go }) {
  const { meta, signIn, notify } = useApp();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try { const r = await api('POST', '/login', { email, password }); await signIn(r.token); }
    catch (err) { notify(err.message); setBusy(false); }
  };
  const demos = [['Admin', 'admin@omnicampus.com', 'admin123'], ['Company', 'shop@glowlab.com', 'demo'], ['Student', 'ayesha@uaf.edu.pk', 'demo']];
  return (
    <div className="wrap"><div className="mid"><div className="n">
      <Brand />
      <h2 className="sp">Sign in</h2>
      <form onSubmit={submit}>
        <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <div className="row sp">
          <button className="ok" type="submit" disabled={busy}>Sign in</button>
          <button type="button" onClick={() => go('reg')}>Register</button>
        </div>
      </form>
      {meta.demo && <>
        <div className="sub sp">Demo accounts</div>
        <div>{demos.map(([n, e, p]) => <button key={n} type="button" className="sm chip" onClick={() => { setEmail(e); setPassword(p); }}>{n}</button>)}</div>
      </>}
    </div></div></div>
  );
}

export function Register({ go }) {
  const { meta, signIn, notify } = useApp();
  const [role, setRole] = useState('student'), [f, setF] = useState({}), [file, setFile] = useState(null), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api('POST', '/register', { ...f, role, file: role === 'student' ? await fileData(file) : undefined });
      await signIn(r.token);
    } catch (err) { notify(err.message); setBusy(false); }
  };
  return (
    <div className="wrap"><div className="mid"><div className="n">
      <Brand />
      <h2 className="sp">Create account</h2>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        {['student', 'company'].map(r => <button key={r} type="button" className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r === 'student' ? 'Student' : 'Company'}</button>)}
      </div>
      <p className="sub" style={{ marginTop: 14 }}>One-time registration fee: <span className="fee">{money(meta.fees[role] || 0, meta.currency)}</span></p>
      <form onSubmit={submit}>
        <Field label={role === 'student' ? 'Full name' : 'Brand name'} value={f.name || ''} onChange={set('name')} />
        <div className="g2">
          <Field label="Email" type="email" value={f.email || ''} onChange={set('email')} />
          <Field label="Password (8+ chars)" type="password" value={f.password || ''} onChange={set('password')} />
          <Field label="Phone" value={f.phone || ''} onChange={set('phone')} />
          {role === 'student' ? <>
            <Field label="University" value={f.uni || ''} onChange={set('uni')} />
            <Field label="Degree" value={f.degree || ''} onChange={set('degree')} />
            <Field label="Batch / semester" value={f.batch || ''} onChange={set('batch')} />
            <Field label="City" value={f.city || ''} onChange={set('city')} />
            <Field label="Skills (comma separated)" value={f.skills || ''} onChange={set('skills')} />
            <Field label="Interests" value={f.interests || ''} onChange={set('interests')} />
            <Field label="Instagram / LinkedIn" value={f.social || ''} onChange={set('social')} />
            <div><label htmlFor="idfile">University ID photo</label><input id="idfile" type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} /></div>
          </> : <>
            <Field label="Industry" value={f.industry || ''} onChange={set('industry')} />
            <Field label="Domain" value={f.domain || ''} onChange={set('domain')} />
            <Field label="Social handles" value={f.social || ''} onChange={set('social')} />
            <Field label="Primary contact" value={f.contact || ''} onChange={set('contact')} />
          </>}
        </div>
        <div className="row sp">
          <button type="button" onClick={() => go('login')}>Back</button>
          <button className="ok" type="submit" disabled={busy}>Register &amp; continue to payment</button>
        </div>
      </form>
    </div></div></div>
  );
}

/** Shown until the registration fee is confirmed by the admin. */
export function PayGate() {
  const { S, meta, run, load, notify } = useApp();
  const fee = S.me.fee;
  const [method, setMethod] = useState(meta.methods[0] || ''), [ref, setRef] = useState(''), [file, setFile] = useState(null);
  const pay = () => run(async () => api('POST', '/pay', { method, ref, file: await fileData(file) }), method === 'Demo payment' ? 'Payment confirmed' : 'Payment submitted for review');
  const form = fee.status === 'Unpaid' || fee.status === 'Rejected';
  return (
    <div className="n mid">
      <h2>Registration fee</h2>
      <p>Amount due: <span className="fee">{money(fee.amount, fee.currency)}</span></p>
      {fee.status === 'Rejected' && <p><span className="tag bad">Payment rejected</span> {fee.note || 'Please check the reference and submit again.'}</p>}
      {fee.status === 'Submitted' && <>
        <p><span className="tag warn">Awaiting confirmation</span></p>
        <p className="mut">We received your {fee.method} reference <b>{fee.ref}</b>. The admin will confirm it shortly.</p>
        <button onClick={() => load().catch(e => notify(e.message))}>Check status</button>
      </>}
      {form && <>
        <p className="mut">{meta.instructions}</p>
        <label htmlFor="paymethod">Payment method</label>
        <select id="paymethod" value={method} onChange={e => setMethod(e.target.value)}>{meta.methods.map(m => <option key={m}>{m}</option>)}</select>
        {method !== 'Demo payment' && <>
          <Field label="Transaction reference / ID" value={ref} onChange={e => setRef(e.target.value)} />
          <div><label htmlFor="receipt">Receipt screenshot (optional)</label><input id="receipt" type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} /></div>
        </>}
        <div className="sp"><button className="ok" onClick={pay}>{method === 'Demo payment' ? 'Pay now (demo)' : 'Submit payment'}</button></div>
      </>}
    </div>
  );
}

export function Waiting() {
  const { S, load, notify } = useApp();
  const rejected = S.me.vs === 'rejected';
  return (
    <div className="n mid">
      <h2>{rejected ? 'Registration rejected' : '⏳ Fee confirmed — awaiting verification'}</h2>
      <p className="mut">{rejected ? 'Your registration could not be verified.' : `The admin is reviewing your ${S.me.role === 'student' ? 'university enrollment proof' : 'business details'}. Dashboard access unlocks once approved.`}</p>
      <button onClick={() => load().catch(e => notify(e.message))}>Check status</button>
    </div>
  );
}
