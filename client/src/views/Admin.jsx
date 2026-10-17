import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../ctx.js';
import { FileLink, StatusTag, StudentCard, Tabs, Tag, Tags, money } from '../ui.jsx';

export default function Admin() {
  const { S, run } = useApp();
  const [tab, setTab] = useState('ov');
  const students = S.users.filter(u => u.role === 'student');
  const verified = students.filter(s => s.vs === 'verified');
  const assigned = new Set(S.campaigns.flatMap(c => c.assigned));
  const unassigned = verified.filter(s => !assigned.has(s.id));
  const pending = S.users.filter(u => u.vs === 'pending');
  const proofs = S.subs.filter(x => x.st === 'Pending');
  const payQueue = S.payments.filter(p => p.st === 'Submitted');
  const cur = S.payments[0]?.currency || 'PKR';
  const collected = S.payments.filter(p => p.st === 'Confirmed').reduce((a, p) => a + p.amount, 0);
  const refresh = id => { setTab(id); run(async () => {}); };

  return (
    <>
      <Tabs value={tab} onChange={refresh} list={[
        ['ov', 'Overview'], ['vf', `Verification (${pending.length})`], ['py', `Payments (${payQueue.length})`],
        ['cp', 'Campaigns'], ['st', 'Students'], ['sb', `Submissions (${proofs.length})`]]} />

      {tab === 'ov' && <>
        <div className="grid">
          {[['Fees collected', money(collected, cur)], ['Payments to review', payQueue.length], ['Pending verifications', pending.length],
            ['Verified students', verified.length], ['Unassigned pool', unassigned.length], ['Assigned students', assigned.size],
            ['Open campaign requests', S.campaigns.filter(c => c.state === 'Requested').length], ['Proofs to review', proofs.length]]
            .map(([l, v]) => <div key={l} className="n stat"><b>{v}</b><span className="sub">{l}</span></div>)}
        </div>
        <div className="n sp"><h2>Isolation model</h2><p className="mut">Students never see companies and companies never see the student database. The server only sends each role its own slice, and contact details stay hidden until you approve a match.</p></div>
      </>}

      {tab === 'vf' && <div className="n"><h2>Pending registrations</h2>
        {pending.map(u => {
          const paid = u.fee.status === 'Confirmed';
          return (
            <div className="item" key={u.id}><div className="row">
              <div>
                <h3>{u.name} <StatusTag s="pending" /> <Tag k="ac">{u.role}</Tag> <Tag k={paid ? 'ok' : 'warn'}>Fee: {u.fee.status}</Tag></h3>
                <div className="sub">{u.email} {u.role === 'student' && (/\.edu(\.|$)/.test(u.email) ? <Tag k="ok">.edu email</Tag> : <Tag k="warn">non-.edu email</Tag>)}</div>
                <div className="sub">{u.role === 'student' ? <>{u.uni} · {u.degree} · <FileLink fid={u.idFid} name={u.idFile} /></> : <>{u.industry} · {u.domain} · Contact: {u.contact}</>}</div>
                {!paid && <div className="sub">Confirm the registration fee in Payments before approving.</div>}
              </div>
              <div>
                <button className="sm ok" disabled={!paid} onClick={() => run(() => api('POST', `/admin/verify/${u.id}`, { status: 'verified' }), 'User verified')}>Approve</button>{' '}
                <button className="sm bad" onClick={() => run(() => api('POST', `/admin/verify/${u.id}`, { status: 'rejected' }), 'User rejected')}>Reject</button>
              </div>
            </div></div>
          );
        })}
        {!pending.length && <div className="empty">Nothing waiting 🎉</div>}
      </div>}

      {tab === 'py' && <div className="n"><h2>Registration fees</h2>
        <div className="sub">Collected so far: <b>{money(collected, cur)}</b></div>
        {S.payments.map(p => (
          <div className="item" key={p.id}>
            <div className="row">
              <div>
                <h3>{p.uname} <Tag k="ac">{p.urole}</Tag> <StatusTag s={p.st} /></h3>
                <div className="sub">{money(p.amount, p.currency)} · {p.method} · ref <b>{p.ref}</b> · {p.at}</div>
                <div className="sub"><FileLink fid={p.fid} name={p.fname} />{p.note && <> · Note: {p.note}</>}</div>
              </div>
              {p.st === 'Submitted' && <div>
                <button className="sm ok" onClick={() => run(() => api('POST', `/admin/payments/${p.id}`, { st: 'Confirmed' }), 'Payment confirmed')}>Confirm</button>{' '}
                <button className="sm bad" onClick={() => { const note = window.prompt('Reason for rejecting (shown to the user):', 'Reference not found'); if (note !== null) run(() => api('POST', `/admin/payments/${p.id}`, { st: 'Rejected', note }), 'Payment rejected'); }}>Reject</button>
              </div>}
            </div>
          </div>
        ))}
        {!S.payments.length && <div className="empty">No payments yet.</div>}
      </div>}

      {tab === 'cp' && (S.campaigns.map(c => <CampaignCard key={c.id} c={c} />))}
      {tab === 'cp' && !S.campaigns.length && <div className="n empty">No campaign requests yet.</div>}

      {tab === 'st' && <>
        <div className="n"><h2>Unassigned pool ({unassigned.length})</h2>{unassigned.map(s => <StudentCard key={s.id} s={s} />)}{!unassigned.length && <div className="empty">Empty</div>}</div>
        <div className="n sp"><h2>Assigned students</h2>
          {verified.filter(s => assigned.has(s.id)).map(s => <StudentCard key={s.id} s={s} extra={<div className="sub">{S.campaigns.filter(c => c.assigned.includes(s.id)).map(c => '→ ' + c.title).join(', ')}</div>} />)}
          {!assigned.size && <div className="empty">Nobody placed yet</div>}
        </div>
      </>}

      {tab === 'sb' && <div className="n"><h2>Task submissions</h2>
        {S.subs.map(p => (
          <div className="item" key={p.id}>
            <div className="row"><div><b>{p.sname}</b> <span className="sub">{p.ktitle} · {p.at}</span></div><StatusTag s={p.st} /></div>
            <p>{p.note}</p><div className="sub"><FileLink fid={p.fid} name={p.fname} /></div>
            {p.st === 'Pending' && <>
              <button className="sm ok" onClick={() => run(() => api('POST', `/admin/subs/${p.id}`, { st: 'Approved' }))}>Approve</button>{' '}
              <button className="sm bad" onClick={() => run(() => api('POST', `/admin/subs/${p.id}`, { st: 'Rejected' }))}>Reject</button>
            </>}
          </div>
        ))}
        {!S.subs.length && <div className="empty">No submissions yet.</div>}
      </div>}
    </>
  );
}

function CampaignCard({ c }) {
  const { S, run, notify } = useApp();
  const [open, setOpen] = useState(false), [matches, setMatches] = useState([]);
  const co = S.users.find(u => u.id === c.cid);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api('GET', `/admin/campaigns/${c.id}/match`).then(m => live && setMatches(m)).catch(e => notify(e.message));
    return () => { live = false; };
  }, [open, S, c.id, notify]);

  const assign = sid => {
    const force = c.assigned.length >= c.need;
    if (force && !window.confirm('Campaign already has the requested number of ambassadors. Assign anyway?')) return;
    run(() => api('POST', `/admin/campaigns/${c.id}/assign`, { sid, force }), 'Student assigned');
  };

  return (
    <div className="n sp">
      <div className="row">
        <div><h2 style={{ margin: 0 }}>{c.title}</h2><div className="sub">{co?.name} · {c.duration} · needs {c.need} · {c.cities}</div></div>
        <select style={{ width: 'auto' }} value={c.state} onChange={e => run(() => api('POST', `/admin/campaigns/${c.id}/state`, { state: e.target.value }))}>
          {['Requested', 'Active', 'Completed'].map(x => <option key={x}>{x}</option>)}
        </select>
      </div>
      <p>{c.resp}</p>
      <div><Tags s={c.skills} />{c.inc.map(i => <Tag key={i} k="ac">{i}</Tag>)}</div>
      <h3 className="sp">Assigned ({c.assigned.length}/{c.need})</h3>
      {c.assigned.map(id => {
        const s = S.users.find(u => u.id === id), shared = c.revealed.includes(id);
        return (
          <div className="item row" key={id}>
            <span><b>{s?.name}</b> <span className="sub">{s?.uni}</span> {shared ? <Tag k="ok">contact shared</Tag> : <Tag k="warn">contact hidden</Tag>}</span>
            <span>
              <button className="sm" onClick={() => run(() => api('POST', `/admin/campaigns/${c.id}/reveal`, { sid: id }), 'Contact visibility updated')}>{shared ? 'Hide' : 'Approve & share'} contact</button>{' '}
              <button className="sm bad" onClick={() => run(() => api('POST', `/admin/campaigns/${c.id}/unassign`, { sid: id }))}>Remove</button>
            </span>
          </div>
        );
      })}
      {!c.assigned.length && <div className="sub">No one assigned yet.</div>}
      <div className="sp"><button className={open ? 'on' : ''} onClick={() => setOpen(!open)}>✨ AI match suggestions</button></div>
      {open && matches.map(x => (
        <div className="item" key={x.s.id}>
          <div className="row"><div><b>{x.s.name}</b> <span className="sub">{x.s.uni} · {x.s.city}</span></div><button className="sm ok" onClick={() => assign(x.s.id)}>Assign</button></div>
          <div className="bar"><i style={{ width: x.score + '%' }} /></div>
          <div className="sub"><b>{x.score}% fit</b> — {x.why.join(' · ') || 'General availability'}</div>
        </div>
      ))}
      {open && !matches.length && <div className="empty">No eligible students.</div>}
    </div>
  );
}
