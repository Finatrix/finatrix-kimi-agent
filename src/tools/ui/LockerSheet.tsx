import { useEffect, useId, useRef, useState } from 'react';
import { ToolSheet } from './ToolSheet';
import { AmountInput } from './AmountInput';
import { useCurrency } from '../CurrencyContext';
import { plainAmount } from '../lib/formula';
import { formatReviewDate, ymdLocal } from '../../lib/date';
import {
  MAX_PHOTOS_PER_ITEM, buildItem, warrantyEndFor, type DraftError, type LockerItem,
} from '../lib/locker';
import { acceptPhoto, deletePhotos, loadPhoto, savePhoto } from '../../lib/billPhotos';

/** Warranty lengths offered as one tap. Anything else is a date. */
const LENGTHS: ReadonlyArray<{ key: string; label: string; months: number | null }> = [
  { key: 'none', label: 'No warranty', months: null },
  { key: '6', label: '6 months', months: 6 },
  { key: '12', label: '1 year', months: 12 },
  { key: '24', label: '2 years', months: 24 },
  { key: '36', label: '3 years', months: 36 },
  { key: 'date', label: 'Pick a date', months: null },
];

const ERRORS: Record<DraftError, string> = {
  product: 'Say what you bought.',
  purchased: 'Choose the day you bought it.',
  warranty: 'The warranty cannot end before the day you bought it.',
  price: 'Enter the price as a number, or leave it empty.',
  full: 'The locker is full. Delete one you no longer need.',
};

/** A stored photo, shown. The object URL is made on mount and let go on unmount. */
export function PhotoThumb({ id, alt, size = 64 }: { id: string; alt: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    void loadPhoto(id).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url
    ? <img src={url} alt={alt} width={size} height={size} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
    : <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 8, background: 'var(--hair)', display: 'block' }} />;
}

/**
 * Add a bill to the locker, or change one. The photo is kept on this device
 * only. "Scan a bill" reads the shop, date and total off the photo with the
 * same on-device reader the Expense Tracker's receipt scan uses, and only
 * fills fields that are still empty.
 */
export function LockerSheet({
  item, existing, onSave, onDelete, onClose,
}: {
  item?: LockerItem;
  existing: readonly LockerItem[];
  onSave: (item: LockerItem, removedPhotoIds: string[]) => void;
  onDelete?: (item: LockerItem) => void;
  onClose: () => void;
}) {
  const { sym } = useCurrency();
  const uid = useId();
  const today = ymdLocal(new Date());
  const editing = !!item;

  const [product, setProduct] = useState(item?.product ?? '');
  const [shop, setShop] = useState(item?.shop ?? '');
  const [purchased, setPurchased] = useState(item?.purchased ?? today);
  const [length, setLength] = useState<string>(() => (!item || !item.warrantyEnd ? (item ? 'none' : '12') : 'date'));
  const [endDate, setEndDate] = useState(item?.warrantyEnd ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '');
  const [note, setNote] = useState(item?.note ?? '');
  const [remind, setRemind] = useState(item?.remind ?? true);
  const [photoIds, setPhotoIds] = useState<string[]>(item?.photoIds ?? []);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<DraftError | null>(null);
  const [scan, setScan] = useState<{ busy: boolean; message: string; tone: 'info' | 'error' }>({ busy: false, message: '', tone: 'info' });
  const [step, setStep] = useState<'form' | 'delete' | { photo: string }>('form');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);

  // Photos added in this sheet but never saved are dropped when it closes.
  const addedRef = useRef<string[]>([]);
  useEffect(() => { addedRef.current = added; });
  useEffect(() => () => {
    if (!savedRef.current) void deletePhotos(addedRef.current);
  }, []);

  const preset = LENGTHS.find((l) => l.key === length);
  const previewEnd = length === 'date' ? (endDate || null) : preset?.months ? warrantyEndFor(purchased, preset.months) : null;

  const attach = async (file: File): Promise<boolean> => {
    if (photoIds.length >= MAX_PHOTOS_PER_ITEM) {
      setScan({ busy: false, tone: 'error', message: `A bill holds up to ${MAX_PHOTOS_PER_ITEM} photos.` });
      return false;
    }
    const verdict = acceptPhoto(file);
    if (verdict !== 'ok') {
      setScan({
        busy: false, tone: 'error',
        message: verdict === 'big' ? 'That photo is larger than 20 MB. Please choose a smaller one.'
          : verdict === 'empty' ? 'That photo is empty.' : 'That is not a photo.',
      });
      return false;
    }
    const id = await savePhoto(file);
    if (!id) {
      setScan({ busy: false, tone: 'error', message: 'This device would not keep that photo. Free some space and try again.' });
      return false;
    }
    setPhotoIds((prev) => [...prev, id]);
    setAdded((prev) => [...prev, id]);
    return true;
  };

  const onGallery = async (files: FileList | null) => {
    if (!files) return;
    setScan({ busy: true, tone: 'info', message: 'Saving on this device…' });
    let kept = 0;
    for (const file of Array.from(files)) {
      if (await attach(file)) kept += 1;
    }
    if (kept) setScan({ busy: false, tone: 'info', message: kept === 1 ? 'Photo kept on this device.' : `${kept} photos kept on this device.` });
    else setScan((s) => ({ ...s, busy: false }));
  };

  const onScan = async (file: File | undefined | null) => {
    if (!file || scan.busy) return;
    setScan({ busy: true, tone: 'info', message: 'Reading the bill on this device…' });
    if (!(await attach(file))) return;
    let outcome: Awaited<ReturnType<typeof import('../lib/import/receipt').readReceiptPhoto>>;
    try {
      const { readReceiptPhoto } = await import('../lib/import/receipt');
      outcome = await readReceiptPhoto(file);
    } catch {
      outcome = { ok: false, message: 'The bill reader could not be loaded. The photo is kept; fill the rest in by hand.' };
    }
    if (!outcome.ok) {
      setScan({ busy: false, tone: 'error', message: `Photo kept. ${outcome.message}` });
      return;
    }
    const { amount, merchant, date } = outcome.reading;
    const found: string[] = [];
    if (merchant && !shop.trim()) { setShop(merchant); found.push('shop'); }
    if (date && date <= today && purchased === today) { setPurchased(date); found.push('date'); }
    if (amount !== null && !price.trim()) { setPrice(String(amount)); found.push('price'); }
    setScan({
      busy: false, tone: 'info',
      message: found.length ? `Photo kept. Filled in the ${found.join(', ')} from the bill. Check before you save.` : 'Photo kept. Nothing new to fill in.',
    });
  };

  const removePhoto = (id: string) => {
    setPhotoIds((prev) => prev.filter((p) => p !== id));
    setStep('form');
  };

  const submit = () => {
    const priceText = plainAmount(price);
    const priceNum = priceText === '' ? null : Number(priceText);
    const result = buildItem({
      product, shop, purchased,
      months: length === 'date' ? null : preset?.months ?? null,
      warrantyEnd: length === 'date' ? (endDate || null) : null,
      price: price.trim() && priceNum === null ? Number.NaN : priceNum,
      note, photoIds, remind,
    }, existing, item?.id);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    savedRef.current = true;
    const removed = (item?.photoIds ?? []).filter((id) => !photoIds.includes(id));
    // A photo added and then removed in the same sheet is never referenced.
    const dropped = added.filter((id) => !photoIds.includes(id));
    onSave(result.item, [...removed, ...dropped]);
  };

  if (step === 'delete' && item) {
    return (
      <ToolSheet
        title={`Delete ${item.product}?`}
        description="Its photos are removed from this phone and cannot be brought back."
        onClose={() => setStep('form')}
        footer={(
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('form')}>Keep it</button>
            <button type="button" className="btn btn-sm" onClick={() => { savedRef.current = false; onDelete?.(item); }}>Delete</button>
          </>
        )}
      >
        <p className="note" style={{ margin: 0 }}>Nothing else in FinatriX is changed.</p>
      </ToolSheet>
    );
  }

  if (typeof step === 'object') {
    return (
      <ToolSheet
        title="Bill photo"
        onClose={() => setStep('form')}
        footer={(
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePhoto(step.photo)}>Remove photo</button>
            <button type="button" className="btn btn-sm" onClick={() => setStep('form')}>Done</button>
          </>
        )}
      >
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <PhotoThumb id={step.photo} alt={`Photo of the bill for ${product || 'this item'}`} size={320} />
        </div>
        <p className="note" style={{ marginBottom: 0 }}>Removing it takes effect when you save.</p>
      </ToolSheet>
    );
  }

  const errId = `${uid}-err`;
  return (
    <ToolSheet
      title={editing ? 'Edit bill' : 'Add a bill'}
      description="Kept on this phone. Nothing is uploaded."
      onClose={onClose}
      initialFocus={`#${CSS.escape(`${uid}-product`)}`}
      footer={(
        <>
          {editing && onDelete && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('delete')}>Delete</button>
          )}
          <button type="button" className="btn btn-sm" onClick={submit}>{editing ? 'Save changes' : 'Add to locker'}</button>
        </>
      )}
    >
      <style>{STYLES}</style>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="fx-lk-scan">
          <button type="button" className="btn btn-ghost btn-sm fx-lk-btn" disabled={scan.busy || photoIds.length >= MAX_PHOTOS_PER_ITEM}
            onClick={() => cameraRef.current?.click()}>
            {scan.busy ? 'Working…' : 'Scan a bill'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm fx-lk-btn" disabled={scan.busy || photoIds.length >= MAX_PHOTOS_PER_ITEM}
            onClick={() => galleryRef.current?.click()}>
            Add from gallery
          </button>
          <p className={`note fx-lk-msg${scan.tone === 'error' ? ' is-error' : ''}`} aria-live="polite">
            {scan.message || 'Scan reads the shop, date and total on this phone. Up to 4 photos: the bill, the warranty card, the box.'}
          </p>
        </div>

        {photoIds.length > 0 && (
          <ul className="fx-lk-photos" aria-label="Photos of this bill">
            {photoIds.map((id, i) => (
              <li key={id}>
                <button type="button" className="fx-lk-photo" onClick={() => setStep({ photo: id })} aria-label={`Open photo ${i + 1} of ${photoIds.length}`}>
                  <PhotoThumb id={id} alt="" size={64} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="fg">
          <label className="fl" htmlFor={`${uid}-product`}>What did you buy?</label>
          <input id={`${uid}-product`} className="fi" type="text" maxLength={80} value={product} autoComplete="off"
            onChange={(e) => { setProduct(e.target.value); setError(null); }}
            aria-invalid={error === 'product' || undefined} aria-describedby={error === 'product' ? errId : undefined}
            placeholder="e.g. Samsung TV" />
        </div>
        <div className="grid2">
          <div className="fg">
            <label className="fl" htmlFor={`${uid}-shop`}>Shop</label>
            <input id={`${uid}-shop`} className="fi" type="text" maxLength={80} value={shop} autoComplete="off"
              onChange={(e) => setShop(e.target.value)} placeholder="e.g. Croma" />
          </div>
          <div className="fg">
            <label className="fl" htmlFor={`${uid}-bought`}>Bought on</label>
            <input id={`${uid}-bought`} className="fi" type="date" max={today} value={purchased}
              onChange={(e) => { setPurchased(e.target.value); setError(null); }}
              aria-invalid={error === 'purchased' || undefined} aria-describedby={error === 'purchased' ? errId : undefined} />
          </div>
        </div>

        <fieldset className="fx-lk-set">
          <legend className="fl">Warranty</legend>
          <div className="fx-lk-pills" role="group" aria-label="Warranty length">
            {LENGTHS.map((l) => (
              <button key={l.key} type="button" className="fx-lk-pill" aria-pressed={length === l.key}
                onClick={() => { setLength(l.key); setError(null); }}>{l.label}</button>
            ))}
          </div>
          {length === 'date' && (
            <div className="fg" style={{ marginTop: 8 }}>
              <label className="fl" htmlFor={`${uid}-end`}>Warranty ends on</label>
              <input id={`${uid}-end`} className="fi" type="date" value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setError(null); }}
                aria-invalid={error === 'warranty' || undefined} aria-describedby={error === 'warranty' ? errId : undefined} />
            </div>
          )}
          <p className="note fx-lk-end" aria-live="polite">
            {previewEnd ? `Covered up to ${formatReviewDate(previewEnd)}.` : length === 'none' ? 'No warranty is tracked for this bill.' : length === 'date' ? 'Choose the last day it is covered.' : ''}
          </p>
        </fieldset>

        <div className="fg">
          <label className="fl" htmlFor={`${uid}-price`}>Price (optional)</label>
          <AmountInput id={`${uid}-price`} className="fi" value={price} onChange={(v) => { setPrice(v); setError(null); }} sym={sym}
            invalid={error === 'price'} errorId={error === 'price' ? errId : undefined} placeholder="0" />
        </div>
        <div className="fg">
          <label className="fl" htmlFor={`${uid}-note`}>Note (optional)</label>
          <input id={`${uid}-note`} className="fi" type="text" maxLength={400} value={note} autoComplete="off"
            onChange={(e) => setNote(e.target.value)} placeholder="Serial number, how to claim…" />
        </div>
        {length !== 'none' && (
          <label className="fx-checkrow">
            <input className="fx-check" type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
            Remind me 30 days and 7 days before it ends
          </label>
        )}
        {error && <p id={errId} role="alert" className="fx-lk-err">{ERRORS[error]}</p>}
      </form>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden tabIndex={-1}
        aria-label="Photo of a bill" onChange={(e) => { void onScan(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden tabIndex={-1}
        aria-label="Choose bill photos" onChange={(e) => { void onGallery(e.target.files); e.target.value = ''; }} />
    </ToolSheet>
  );
}

const STYLES = `
.fx-lk-scan{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;}
.fx-lk-btn{min-height:44px;}
.fx-lk-btn:disabled{opacity:.6;}
.fx-lk-msg{margin:0;flex:1 1 200px;font-size:12px;}
.fx-lk-msg.is-error,.fx-lk-err{color:var(--red);}
.fx-lk-err{font-size:13px;font-weight:600;margin:10px 0 0;}
.fx-lk-photos{display:flex;gap:8px;list-style:none;margin:0 0 14px;padding:0;flex-wrap:wrap;}
.fx-lk-photo{border:1.5px solid var(--hair2);border-radius:10px;padding:2px;background:var(--card);cursor:pointer;min-width:44px;min-height:44px;}
.fx-lk-set{border:none;padding:0;margin:0 0 12px;min-width:0;}
.fx-lk-set > legend{padding:0;margin-bottom:6px;}
.fx-lk-pills{display:flex;flex-wrap:wrap;gap:8px;}
.fx-lk-pill{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:980px;border:1.5px solid var(--hair2);
  background:var(--card);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
@media (hover: hover) and (pointer: fine){.fx-lk-pill:hover{border-color:var(--ink3);}}
.fx-lk-pill[aria-pressed="true"]{border-color:var(--ink);background:var(--hair);}
.fx-lk-end{margin:8px 0 0;min-height:1.2em;}
`;
