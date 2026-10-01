import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { onLocalWrite, store } from '../lib/storage';
import { workspaceReview } from '../lib/workspaceReview';
import { SmartAssist } from './SmartAssist';

export function WorkspaceNavigator() {
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () => setRevision(v => v + 1);
    const off = onLocalWrite(refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { off(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const records = useMemo(() => { void revision; return workspaceReview(); }, [revision]);
  const last = records.find(tool => tool.id === store.get('fx_last_tool', ''));
  const attention = records.filter(tool => tool.status === 'review').length;
  const visible = records.filter(tool => (scope === 'all' || tool.status === scope) && `${tool.name} ${tool.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <SmartAssist title="Your next useful step" description="Automatically checks which tools have saved inputs and which monthly records may need attention. This is a data checklist, not a financial score.">
    <div className="fx-smart-actions">
      {last && <Link className="btn btn-sm" to={last.href}>Continue {last.name}</Link>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setScope('review'); setQuery(''); setOpen(true); }}>Review {attention} data gaps</button>
    </div>
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="fx-smart-summary">Find a tool or inspect saved data</summary>
      <div className="grid2">
        <div><label className="fl" htmlFor="workspace-search">Search your tools</label><input className="fi" id="workspace-search" type="search" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div><label className="fl" htmlFor="workspace-scope">Show</label><select className="fs" id="workspace-scope" value={scope} onChange={e => setScope(e.target.value)}><option value="all">All tools</option><option value="review">Needs a review</option><option value="saved">Saved inputs</option><option value="empty">Not started</option></select></div>
      </div>
      <p className="note" role="status">{visible.length} tools match</p>
      <ul className="fx-smart-list">{visible.map(tool => <li key={tool.id}><div><strong>{tool.name}</strong><p className="note">{tool.detail}</p></div><Link className="btn btn-ghost btn-sm" to={tool.href} aria-label={`Open ${tool.name}`}>Open</Link></li>)}</ul>
    </details>
  </SmartAssist>;
}
