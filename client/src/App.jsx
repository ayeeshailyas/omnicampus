import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, hasToken, setToken, setUnauthorizedHandler } from './api.js';
import { Ctx } from './ctx.js';
import { Login, Register, PayGate, Waiting } from './views/Auth.jsx';
import Admin from './views/Admin.jsx';
import Company from './views/Company.jsx';
import Student from './views/Student.jsx';

export default function App() {
  const [S, setS] = useState(null);
  const [meta, setMeta] = useState({ fees: {}, currency: 'PKR', methods: [] });
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState('login');
  const [toast, setToast] = useState('');

  const notify = useCallback(m => setToast(m), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => { setS(await api('GET', '/state')); }, []);
  const signOut = useCallback(() => { setToken(null); setS(null); setScreen('login'); }, []);
  const signIn = useCallback(async token => { setToken(token); await load(); }, [load]);

  /** Run an API action, refresh state, toast the result (or the server's error). */
  const run = useCallback(async (fn, msg) => {
    try { await fn(); await load(); if (msg) notify(msg); return true; }
    catch (e) { notify(e.message); return false; }
  }, [load, notify]);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    (async () => {
      try { setMeta(await api('GET', '/meta')); } catch { /* server unreachable */ }
      if (hasToken()) { try { await load(); } catch { signOut(); } }
      setReady(true);
    })();
  }, [load, signOut]);

  const ctx = useMemo(() => ({ S, meta, load, run, notify, signIn, signOut }), [S, meta, load, run, notify, signIn, signOut]);
  if (!ready) return null;

  let body;
  if (!S) body = screen === 'reg' ? <Register go={setScreen} /> : <Login go={setScreen} />;
  else {
    const me = S.me;
    if (me.role !== 'admin' && me.fee.status !== 'Confirmed') body = <Shell><PayGate /></Shell>;
    else if (me.role !== 'admin' && me.vs !== 'verified') body = <Shell><Waiting /></Shell>;
    else body = <Shell>{me.role === 'admin' ? <Admin /> : me.role === 'company' ? <Company /> : <Student />}</Shell>;
  }
  return <Ctx.Provider value={ctx}>{body}{toast && <div id="toast" className="n">{toast}</div>}</Ctx.Provider>;
}

function Shell({ children }) {
  return <Ctx.Consumer>{({ S, signOut }) => (
    <div className="wrap">
      <header>
        <div className="brand"><div className="logo">O</div><div>OmniCampus<div className="sub">{S.me.role[0].toUpperCase() + S.me.role.slice(1)} dashboard</div></div></div>
        <div className="row"><span className="sub">{S.me.name}</span><button className="sm" onClick={signOut}>Sign out</button></div>
      </header>
      {children}
    </div>
  )}</Ctx.Consumer>;
}
