import { useCallback, useEffect, useMemo, useState } from 'react';
import { onLocalWrite } from './storage';
import {
  SPLIT_ENTRIES_KEY, SPLIT_PEOPLE_KEY, balancesWithPeople, live, loadSplitEntries, loadSplitPeople,
  saveSplitEntries, saveSplitPeople, upsertById, type SplitEntry, type SplitPersonRecord,
} from './splits';
import { syncSplitCopy } from './splitsShare';

/**
 * Your people and entries, kept in step with storage (including what cloud
 * sync merges in from another device), and the writes the Splits screen makes.
 * Every write re-reads storage first, so a record merged in meanwhile is kept.
 */
export function useSplits() {
  const [people, setPeople] = useState<SplitPersonRecord[]>(loadSplitPeople);
  const [entries, setEntries] = useState<SplitEntry[]>(loadSplitEntries);

  useEffect(() => onLocalWrite((key) => {
    if (key === SPLIT_PEOPLE_KEY) setPeople(loadSplitPeople());
    if (key === SPLIT_ENTRIES_KEY) setEntries(loadSplitEntries());
  }), []);

  const livePeople = useMemo(() => live(people).sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const liveEntries = useMemo(
    () => live(entries).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)),
    [entries],
  );
  const balances = useMemo(() => balancesWithPeople(entries), [entries]);
  /** Every person ever added (a removed person's name still labels their old entries). */
  const nameOf = useMemo(() => {
    const names = new Map(people.map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? 'Removed person';
  }, [people]);

  const savePerson = useCallback((person: SplitPersonRecord): boolean => {
    const next = upsertById(loadSplitPeople(), person);
    if (!saveSplitPeople(next)) return false;
    setPeople(next);
    return true;
  }, []);

  /** Save an entry; a bill also brings your share in the Expense Tracker in line. */
  const saveEntry = useCallback((entry: SplitEntry): boolean => {
    const next = upsertById(loadSplitEntries(), entry);
    if (!saveSplitEntries(next)) return false;
    setEntries(next);
    if (entry.kind === 'bill') syncSplitCopy(entry);
    return true;
  }, []);

  /** Delete an entry. Its record stays, marked, so the deletion syncs; a bill's tracker copy goes. */
  const deleteEntry = useCallback((entry: SplitEntry): boolean => {
    const at = new Date().toISOString();
    return saveEntry({ ...entry, deletedAt: at, updatedAt: at });
  }, [saveEntry]);

  return { people: livePeople, entries: liveEntries, balances, nameOf, savePerson, saveEntry, deleteEntry };
}
