import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { workspaceReview } from '../lib/workspaceReview';
import { onLocalWrite, store } from '../lib/storage';
import { downloadBlob } from '../lib/exporters';
import { SmartAssist } from './SmartAssist';
import { useOptionalToast } from './Toast';

export function DataReadiness() {
  const { notify } = useOptionalToast();
  const [, refresh] = useState(0);
  const [onlyReview, setOnlyReview] = useState(true);
  useEffect(() => {
    const update = () => refresh(v => v + 1);
    const off = onLocalWrite(update);
    window.addEventListener('storage', update);
    return () => { off(); window.removeEventListener('storage', update); };
  }, []);
  const records = workspaceReview();
  const review = records.filter(record => record.status === 'review');
  const lastBackup = store.get('fx_last_backup_export', '');
  const backupDate = new Date(lastBackup);
  const usableBackupDate = Number.isFinite(backupDate.getTime());
  const exportChecks = async () => {
    try {
    await downloadBlob('finatrix-data-check.json', new Blob([JSON.stringify({
    app: 'FinatriX', kind: 'data-readiness', checkedAt: new Date().toISOString(),
    scope: 'Local saved inputs. Not a backup or a cloud-sync verification.',
    persistentStorage: store.persistent && !store.hasUnpersistedChanges,
    hasUnpersistedChanges: store.hasUnpersistedChanges,
    tools: records.map(({ id, status, detail }) => ({ tool: id, status, detail })),
  }, null, 2)], { type: 'application/json' }));
    } catch {
      notify('The data check could not be exported. Please try again.', 'error');
    }
  };
  return <SmartAssist title="Automatic data checks" description="A live check of saved formats, missing monthly records and carried-forward account balances. Financial correctness still depends on the inputs you provide.">
    <p className="note" role="status">{review.length} tools need a data review. {store.hasUnpersistedChanges ? 'Some changes are stored only for this session because device storage could not save them. Export a backup before closing.' : store.persistent ? 'Device storage is available.' : 'Some records may only be available in this session. Export a backup before closing.'}</p>
    <p className="note">{usableBackupDate ? `Backup download last requested on this device: ${backupDate.toLocaleString()}. Confirm the file exists in your downloads.` : 'No backup download has been recorded on this device. Use Export backup below to keep a copy.'}</p>
    <label className="fx-smart-check"><input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} />Only show tools needing review</label>
    <ul className="fx-smart-list">{(onlyReview ? review : records).map(record => <li key={record.id}><div><strong>{record.name}</strong><p className="note">{record.detail}</p></div><Link className="btn btn-ghost btn-sm" to={record.href}>Review {record.name}</Link></li>)}</ul>
    <div className="fx-smart-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={exportChecks}>Download data check</button></div>
    <p className="note">The check file contains tool statuses, without transaction descriptions or financial amounts. It is not a backup.</p>
  </SmartAssist>;
}
