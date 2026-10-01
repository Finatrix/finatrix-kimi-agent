import { useState } from 'react';
import { SOURCES, evaluateFreshness, verifiedLabel, type ReferenceMarket } from '../../reference';
import { SmartAssist } from './SmartAssist';

export function ReferenceFinder({ market }: { market: ReferenceMarket }) {
  const [search, setSearch] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const sources = SOURCES.filter(source => source.market === market).map(source => ({ source, freshness: evaluateFreshness({ ...source, quality: 'VERIFIED_CURRENT' }) }));
  const due = sources.filter(row => row.freshness.showsWarning);
  const visible = sources.filter(({ source, freshness }) => (!dueOnly || freshness.showsWarning) && `${source.title} ${source.authority} ${source.topic} ${source.verificationScope}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <SmartAssist title="Find and check a source" description="Review dates are checked automatically on your device. This does not fetch new rates or re-verify the authority’s current rules.">
    <p className="note">{sources.length} recorded sources · {due.length} due for review</p>
    <details>
      <summary className="fx-smart-summary">Search official sources and review dates</summary>
      <label htmlFor="reference-source-search" className="fl">Find an authority, topic or rule</label>
      <input id="reference-source-search" className="fi" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. deposit, retirement, tax" />
      <label className="fx-smart-check"><input type="checkbox" checked={dueOnly} onChange={event => setDueOnly(event.target.checked)} />Only sources due for review</label>
      <p className="note" role="status">{visible.length} matching sources</p>
      <ul className="fx-smart-list">{visible.map(({ source, freshness }) => <li key={source.id}><div><a className="fx-method-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.authority} — {source.title}</a><p className="note">Checked {verifiedLabel(source.lastVerified)} · Review due {verifiedLabel(source.reviewDue)}</p><p className="note">{source.verificationScope}</p>{freshness.notice && <p className="note">{freshness.notice}</p>}</div></li>)}</ul>
    </details>
  </SmartAssist>;
}
