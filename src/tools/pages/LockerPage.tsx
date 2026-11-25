import { useEffect, useMemo, useState } from 'react';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { LockerSheet, PhotoThumb } from '../ui/LockerSheet';
import { useCurrency } from '../CurrencyContext';
import { useOptionalToast } from '../ui/Toast';
import { ymdLocal } from '../../lib/date';
import { deletePhotos, requestDurableStorage, sweepOrphans } from '../../lib/billPhotos';
import {
  daysLeft, loadLocker, removeItem, saveLocker, searchLocker, sortLocker, upsertItem, warrantyLabel, warrantyState,
  type LockerItem,
} from '../lib/locker';

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LockerPage() {
  const { notify } = useOptionalToast();
  const { cfmt } = useCurrency();
  const [items, setItems] = useState<LockerItem[]>(() => loadLocker());
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<{ item?: LockerItem } | null>(null);
  const today = ymdLocal(new Date());

  // On opening: ask the device to keep the photos, and sweep up any a failed save left behind.
  useEffect(() => {
    void requestDurableStorage();
    void sweepOrphans(new Set(loadLocker().flatMap((i) => i.photoIds)));
  }, []);

  const shown = useMemo(() => sortLocker(searchLocker(items, query), today), [items, query, today]);

  const commit = (next: LockerItem[]): boolean => {
    if (!saveLocker(next)) {
      notify('This device could not save that. Please try again.', 'error');
      return false;
    }
    setItems(next);
    return true;
  };

  const onSave = (item: LockerItem, removedPhotoIds: string[]) => {
    if (!commit(upsertItem(items, item))) return;
    void deletePhotos(removedPhotoIds);
    setSheet(null);
    notify(`${item.product} is in the locker.`, 'ok');
  };

  const onDelete = (item: LockerItem) => {
    if (!commit(removeItem(items, item.id))) return;
    void deletePhotos(item.photoIds);
    setSheet(null);
    notify(`${item.product} was deleted.`, 'ok');
  };

  return (
    <div className="fx-page">
      <PageHead chip="Bill locker" chipColor="var(--gold)" icon="shield" title="Every bill and warranty, in your pocket.">
        Keep the photo of a bill with its warranty end date, and get a reminder before the warranty runs
        out. Search by product or shop when you need to make a claim.
      </PageHead>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="fl" htmlFor="locker-search">Search your bills</label>
            <input id="locker-search" className="fi" type="search" value={query} autoComplete="off" maxLength={60}
              onChange={(e) => setQuery(e.target.value)} placeholder="Product or shop" />
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setSheet({})} style={{ minHeight: 44 }}>
            <Icon name="plus" size={14} /> Add a bill
          </button>
        </div>
        <p className="note" style={{ margin: '10px 0 0' }}>
          Photos stay on this phone. They are not uploaded or backed up, and they go if you delete the app,
          clear its data or sign out of FinatriX.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 14 }}>
          <Icon name="shield" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Nothing in the locker yet</div>
          <p className="note" style={{ maxWidth: 380, margin: '0 auto 16px' }}>
            Scan a bill or pick a photo, say how long the warranty runs, and FinatriX reminds you 30 days
            and 7 days before it ends.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setSheet({})}>Add your first bill</button>
        </div>
      ) : (
        <section className="card" style={{ marginBottom: 14 }} aria-labelledby="locker-list-h">
          <h2 id="locker-list-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>
            {query.trim() ? `${shown.length} of ${items.length}` : `${items.length} ${items.length === 1 ? 'bill' : 'bills'}`}
          </h2>
          {shown.length === 0 ? (
            <p className="note" role="status">No bill matches “{query.trim()}”.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {shown.map((item) => {
                const state = warrantyState(item, today);
                const left = item.warrantyEnd ? daysLeft(item.warrantyEnd, today) : null;
                return (
                  <li key={item.id} style={{ borderTop: '1px solid var(--hair2)' }}>
                    <button type="button" className="fx-lk-row" onClick={() => setSheet({ item })}
                      aria-label={`${item.product}${item.shop ? `, ${item.shop}` : ''}. ${left === null ? 'No warranty' : warrantyLabel(left)}. Open to see or edit.`}>
                      <span aria-hidden="true" className="fx-lk-thumb">
                        {item.photoIds[0] ? <PhotoThumb id={item.photoIds[0]} alt="" size={48} /> : <Icon name="shield" size={20} style={{ color: 'var(--ink3)' }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span className="fx-lk-name">{item.product}</span>
                        <span className="note" style={{ fontSize: 11, display: 'block' }}>
                          {item.shop ? `${item.shop} · ` : ''}Bought {shortDate(item.purchased)}{item.price != null ? ` · ${cfmt(item.price)}` : ''}
                        </span>
                      </span>
                      <span className={`fx-lk-badge is-${state}`}>
                        {left === null ? 'No warranty' : warrantyLabel(left)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <MethodologyNote summary="How this is worked out">
        A warranty given as a length runs from the day you bought it: 12 months from 15 March 2026 covers
        up to 14 March 2027, one day short of the anniversary, because the cautious reading is the one that
        never lets a claim lapse. A warranty you enter as a date is used as given. “Ends in N days” counts
        whole calendar days from today. Reminders arrive in the evening notification, never more than the
        three a day the app already sends, and carry no amounts. Bills and photos live on this device only,
        so they are not in a FinatriX backup. Check the printed terms before you claim: FinatriX does not
        know what a warranty covers.
      </MethodologyNote>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>

      <style>{`
        .fx-lk-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:10px 0;border:none;background:none;color:inherit;font:inherit;cursor:pointer;}
        .fx-lk-thumb{width:48px;height:48px;border-radius:8px;flex-shrink:0;display:grid;place-items:center;overflow:hidden;background:var(--hair);}
        .fx-lk-name{display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .fx-lk-badge{flex-shrink:0;font-size:11px;font-weight:700;padding:4px 10px;border-radius:980px;background:var(--hair);color:var(--ink2);}
        .fx-lk-badge.is-soon{background:color-mix(in srgb, var(--orange) 16%, transparent);color:var(--ink);}
        .fx-lk-badge.is-ended{background:transparent;border:1px solid var(--hair2);color:var(--ink2);}
        @media (hover: hover) and (pointer: fine){.fx-lk-row:hover .fx-lk-name{text-decoration:underline;}}
      `}</style>

      {sheet && (
        <LockerSheet item={sheet.item} existing={items} onSave={onSave} onDelete={onDelete} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
