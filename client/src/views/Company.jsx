import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../ctx.js';
import { Field, StatusTag, Tabs, Tag, Tags } from '../ui.jsx';

const INCENTIVES = ['Paid stipend', 'Commission', 'Free product PR kit', 'Certificate'];

export default function Company() {
  const { S, load } = useApp();
  const [tab, setTab] = useState('cp');
  const go = id => { setTab(id); load().catch(() => {}); };
  return (
    <>
      <Tabs value={tab} onChange={go} list={[['cp', 'My campaigns'], ['nw', 'New campaign'], ['tl', 'Assigned talent']]} />
      {tab === 'nw' && <NewCampaign done={() => setTab('cp')} />}
      {tab === 'cp' && <>
        {S.campaigns.map(c => (
          <div className="n sp" key={c.id}>
            <div className="row"><h2 style={{ margin: 0 }}>{c.title}</h2><StatusTag s={c.state} /></div>
            <div className="sub">{c.duration} · needs {c.need} · {c.cities}</div>
            <p>{c.resp}</p>{c.inc.map(i => <Tag key={i} k="ac">{i}</Tag>)}
            <div className="sub sp">{c.talent.length} of {c.need} ambassadors assigned by admin</div>
          </div>
        ))}
        {!S.campaigns.length && <div className="n empty">No campaigns yet — create your first request.</div>}
      </>}
      {tab === 'tl' && <div className="n"><h2>Your assigned talent</h2>
        <div className="sub">Only students placed on your campaigns by the admin appear here.</div>
        {S.campaigns.flatMap(c => c.talent.map((t, i) => (
          <div className="item" key={c.id + i}>
            <div className="row"><div><h3>{t.name}</h3><div className="sub">{t.uni} · {t.degree} · for {c.title}</div></div><Tag k="ok">{t.status}</Tag></div>
            <Tags s={t.skills} /><div className="sub">Approved tasks: {t.done}</div>
            <div className="sub">{t.contact || '🔒 Contact unlocks once the admin approves the match.'}</div>
          </div>
        )))}
        {!S.campaigns.some(c => c.talent.length) && <div className="empty">No talent assigned yet.</div>}
      </div>}
    </>
  );
}

function NewCampaign({ done }) {
  const { run } = useApp();
  const [f, setF] = useState({ need: 1 }), [inc, setInc] = useState([]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const toggle = i => setInc(inc.includes(i) ? inc.filter(x => x !== i) : [...inc, i]);
  const submit = async () => { if (await run(() => api('POST', '/company/campaigns', { ...f, inc }), 'Campaign sent to admin')) done(); };
  return (
    <div className="n"><h2>Request ambassadors</h2>
      <div className="sub">Submit requirements — the admin will curate and assign suitable students.</div>
      <div className="g2">
        <Field label="Campaign title" value={f.title || ''} onChange={set('title')} />
        <Field label="Ambassadors needed" type="number" min="1" value={f.need} onChange={set('need')} />
        <Field label="Target cities" value={f.cities || ''} onChange={set('cities')} />
        <Field label="Target universities" value={f.unis || ''} onChange={set('unis')} />
        <Field label="Skills wanted" value={f.skills || ''} onChange={set('skills')} />
        <Field label="Interests" value={f.interests || ''} onChange={set('interests')} />
        <Field label="Duration" value={f.duration || ''} onChange={set('duration')} />
      </div>
      <label htmlFor="resp">Responsibilities</label><textarea id="resp" rows="3" value={f.resp || ''} onChange={set('resp')} />
      <label>Incentives</label>
      {INCENTIVES.map(i => <label key={i} className="ck"><input type="checkbox" checked={inc.includes(i)} onChange={() => toggle(i)} /> {i}</label>)}
      <div className="sp"><button className="ok" onClick={submit}>Submit to admin</button></div>
    </div>
  );
}
