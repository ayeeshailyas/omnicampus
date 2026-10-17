import { useId } from 'react';
import { api, openFile } from './api.js';
import { useApp } from './ctx.js';

export const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const money = (n, cur) => `${cur} ${Number(n).toLocaleString()}`;
export const ST = ['Available', 'Shortlisted', 'Active Ambassador', 'Completed', 'Inactive'];

const kind = s => ['verified', 'Approved', 'Confirmed'].includes(s) ? 'ok' : ['rejected', 'Rejected'].includes(s) ? 'bad' : 'warn';
export const Tag = ({ k, children }) => <span className={'tag ' + (k || '')}>{children}</span>;
export const StatusTag = ({ s }) => <Tag k={kind(s)}>{s}</Tag>;
export const Tags = ({ s }) => <>{csv(s).map(x => <Tag key={x}>{x}</Tag>)}</>;

export function Field({ label, ...p }) {
  const id = useId();
  return <div><label htmlFor={id}>{label}</label><input id={id} {...p} /></div>;
}

export function FileLink({ fid, name }) {
  const { notify } = useApp();
  if (!fid) return null;
  return <a href="#" className="mut" onClick={e => { e.preventDefault(); openFile(fid).catch(err => notify(err.message)); }}>📎 {name}</a>;
}

export const Tabs = ({ list, value, onChange }) => (
  <nav>{list.map(([id, label]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}</nav>
);

export function StudentCard({ s, extra }) {
  const { run } = useApp();
  return (
    <div className="item">
      <div className="row">
        <div><h3>{s.name}</h3><div className="sub">{s.uni} · {s.degree} · {s.batch} · {s.city}</div></div>
        <select style={{ width: 'auto', padding: '6px 10px' }} value={s.status} onChange={e => run(() => api('POST', `/admin/students/${s.id}/status`, { status: e.target.value }))}>
          {ST.map(x => <option key={x}>{x}</option>)}
        </select>
      </div>
      <div><Tags s={s.skills} /><Tags s={s.interests} /></div>
      <div className="sub">{s.email} · {s.phone} · Performance {s.perf}/100</div>
      {extra}
    </div>
  );
}
