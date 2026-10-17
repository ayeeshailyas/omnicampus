import { useState } from 'react';
import { api, fileData } from '../api.js';
import { useApp } from '../ctx.js';
import { FileLink, StatusTag, Tabs, Tag, Tags } from '../ui.jsx';

export default function Student() {
  const { S, load } = useApp();
  const [tab, setTab] = useState('cp'), u = S.me;
  const go = id => { setTab(id); load().catch(() => {}); };
  return (
    <>
      <Tabs value={tab} onChange={go} list={[['cp', 'My campaigns'], ['pf', 'Profile']]} />
      {tab === 'pf' && <div className="n"><h2>{u.name}</h2>
        <div className="sub">{u.uni} · {u.degree} · {u.batch} · {u.city}</div>
        <p><Tags s={u.skills} /><Tags s={u.interests} /></p>
        <div className="sub">{u.social} · ID: {u.idFile}</div>
        <p><Tag k="ac">{u.status}</Tag> Performance score {u.perf}/100</p>
      </div>}
      {tab === 'cp' && <>
        {S.campaigns.map(c => <CampaignCard key={c.id} c={c} />)}
        {!S.campaigns.length && <div className="n empty">No campaigns assigned yet. The admin will match you when a suitable campaign opens up.</div>}
      </>}
    </>
  );
}

function CampaignCard({ c }) {
  const { S, run } = useApp();
  const [note, setNote] = useState(''), [file, setFile] = useState(null), [k, setK] = useState(0);
  const mine = S.subs.filter(x => x.kid === c.id);
  const submit = async () => {
    const ok = await run(async () => api('POST', '/student/subs', { kid: c.id, note, file: await fileData(file) }), 'Proof submitted');
    if (ok) { setNote(''); setFile(null); setK(k + 1); }
  };
  return (
    <div className="n sp">
      <div className="row"><h2 style={{ margin: 0 }}>{c.title}</h2><Tag k="ac">{c.brand}</Tag></div>
      <div className="sub">{c.duration}</div>
      <p>{c.resp}</p>{c.inc.map(i => <Tag key={i} k="ok">{i}</Tag>)}
      <div className="sub sp">{c.contact ? `📇 Brand contact: ${c.contact}` : '🔒 Brand contact unlocks after admin approval.'}</div>
      <h3 className="sp">Submit task proof</h3>
      <textarea aria-label="Task description" rows="2" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Posted reel, hosted stall, 40 survey responses…" />
      <div className="row sp">
        <input aria-label="Proof file" key={k} type="file" accept="image/*,.pdf" style={{ maxWidth: 260 }} onChange={e => setFile(e.target.files[0])} />
        <button className="ok" onClick={submit}>Submit</button>
      </div>
      {mine.map(p => <div className="item row" key={p.id}><span>{p.note} {p.fid && <>· <FileLink fid={p.fid} name={p.fname} /></>}</span><StatusTag s={p.st} /></div>)}
    </div>
  );
}
