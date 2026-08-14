/**
 * The import flow, as one state machine.
 *
 * Reading a statement is a sequence with several places it can legitimately
 * pause — a locked PDF, a model call that may fail, a review the user walks away
 * from — and scattering that across a component produces exactly the bugs this
 * feature cannot have: a half-applied AI pass, a stale draft set, a confirm
 * button that fires twice. So the whole sequence lives here and the component
 * renders what it is told.
 *
 * Two ordering decisions are load-bearing:
 *
 *  - **Duplicates are re-checked after the AI pass.** Duplicate detection keys
 *    on the payee, and the model's whole job is improving payee names. Running
 *    the check only before would miss the duplicates that become visible once
 *    "POS 4123 BLUE TOKAI BLR" and "Blue Tokai" are both called Blue Tokai.
 *
 *  - **The AI pass never blocks the review.** Rows appear the moment the file is
 *    parsed, already categorised by the learned map and the rule table, and
 *    upgrade in place when suggestions arrive. If the model is unavailable,
 *    rate-limited or signed out, the sheet is fully usable and says so — the
 *    import has no dependency on a model call succeeding.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { categorizeDescriptions, type CategoryOption } from '../../ai/statementCategorize';
import type { ExpenseItem } from '../expense';
import { applySuggestions, pendingDescriptions } from './categorize';
import { markDuplicates } from './dedupe';
import { buildDrafts, clearStaged, loadStaged, saveStaged, toExpense } from './draft';
import { isImportable, summarize } from './status';
import { extractStatement, ImportError, type ExtractedStatement } from './extract';
import { loadLearned, rememberConfirmed, saveLearned } from './learned';
import { swapDayMonth } from './fields';
import type { DateOrder, DraftRow, ImportSummary } from './types';

export type ImportPhase =
  /** Nothing chosen yet. */
  | 'idle'
  /** Parsing the file. */
  | 'reading'
  /** The PDF is encrypted and we are waiting for the password. */
  | 'password'
  /** Rows are on screen; the model pass may still be running. */
  | 'review'
  /** Nothing usable came out of the file. */
  | 'error';

export type AiPhase = 'skipped' | 'running' | 'done' | 'failed';

export interface UseStatementImport {
  phase: ImportPhase;
  /** Populated in the 'error' and 'password' phases. */
  message: string;
  fileName: string;
  drafts: DraftRow[];
  summary: ImportSummary;
  extraction: ExtractedStatement | null;
  aiPhase: AiPhase;
  aiMessage: string;
  /** How many descriptions the model was asked about. */
  aiAsked: number;
  /** A review left unfinished in this browser, offered on open. */
  resumable: { fileName: string; savedAt: string; count: number } | null;
  /** How dd/mm vs mm/dd is currently being read. */
  dateOrder: DateOrder;
  /** True when nothing in the file settled that, so the reading is a default. */
  dateOrderAssumed: boolean;
  /** Re-read every ambiguous date the other way round. */
  flipDateOrder: () => void;

  start: (file: File) => void;
  submitPassword: (password: string) => void;
  updateDraft: (id: string, patch: Partial<DraftRow>) => void;
  setAllIncluded: (include: boolean) => void;
  resume: () => void;
  discardResumable: () => void;
  /** Builds the transactions to save and folds confirmed choices into learning. */
  confirm: () => ExpenseItem[];
  reset: () => void;
}

const EMPTY_SUMMARY: ImportSummary = {
  found: 0, selected: 0, confident: 0, needsReview: 0, duplicates: 0, credits: 0, total: 0,
};

export interface StatementImportOptions {
  /** The user's live categories — the only keys any layer may assign. */
  categories: readonly CategoryOption[];
  /** The existing ledger, for duplicate detection. */
  existing: readonly ExpenseItem[];
  /** Lets the caller suppress the model pass (offline, or a user preference). */
  aiEnabled?: boolean;
}

export function useStatementImport({
  categories,
  existing,
  aiEnabled = true,
}: StatementImportOptions): UseStatementImport {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [extraction, setExtraction] = useState<ExtractedStatement | null>(null);
  const [aiPhase, setAiPhase] = useState<AiPhase>('skipped');
  const [aiMessage, setAiMessage] = useState('');
  const [aiAsked, setAiAsked] = useState(0);
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy');
  /* An unfinished review in this browser. Read lazily on first render rather
     than in an effect: it is a synchronous fact about storage at open time, not
     an event to react to, and deriving it here means the resume banner is in the
     first paint instead of arriving a render later. */
  const [resumable, setResumable] = useState<UseStatementImport['resumable']>(() => {
    const staged = loadStaged();
    return staged
      ? { fileName: staged.fileName, savedAt: staged.savedAt, count: staged.drafts.length }
      : null;
  });

  /** The pending file for the password retry. Never persisted. */
  const pendingFile = useRef<File | null>(null);
  /** Guards against a reply landing after the user started a different file. */
  const runId = useRef(0);

  const validKeys = useMemo(() => new Set(categories.map((c) => c.key)), [categories]);

  /* Persist the review so a closed tab does not cost the user their work. Local
     only — see the note in draft.ts about why this key never syncs. */
  useEffect(() => {
    if (phase !== 'review' || !drafts.length) return;
    const t = setTimeout(() => saveStaged(fileName, drafts), 500);
    return () => clearTimeout(t);
  }, [phase, drafts, fileName]);

  const runAi = useCallback(
    (seed: DraftRow[], id: number) => {
      const pending = pendingDescriptions(seed);
      if (!aiEnabled || !pending.length) {
        setAiPhase('skipped');
        return;
      }

      setAiPhase('running');
      setAiAsked(pending.length);

      void categorizeDescriptions(pending, categories).then((result) => {
        if (runId.current !== id) return;
        if (!result.ok) {
          setAiPhase('failed');
          setAiMessage(result.message);
          return;
        }
        setAiPhase('done');
        setAiMessage('');
        setDrafts((current) =>
          // Duplicate detection re-runs because the payee names it keys on have
          // just changed.
          markDuplicates(applySuggestions(current, result.suggestions, validKeys), existing),
        );
      });
    },
    [aiEnabled, categories, existing, validKeys],
  );

  const read = useCallback(
    (file: File, password?: string) => {
      const id = ++runId.current;
      pendingFile.current = file;
      setFileName(file.name);
      setPhase('reading');
      setMessage('');
      setAiPhase('skipped');
      setAiMessage('');
      setAiAsked(0);

      void extractStatement(file, { password })
        .then((result) => {
          if (runId.current !== id) return;
          const learned = loadLearned();
          const seeded = markDuplicates(buildDrafts(result.doc, learned, validKeys), existing);
          setExtraction(result);
          setDrafts(seeded);
          setDateOrder(result.doc.dateOrder);
          setPhase('review');
          runAi(seeded, id);
        })
        .catch((e: unknown) => {
          if (runId.current !== id) return;
          const error = e instanceof ImportError ? e : null;
          if (error && (error.kind === 'password-required' || error.kind === 'password-wrong')) {
            setPhase('password');
            setMessage(error.message);
            return;
          }
          setPhase('error');
          setMessage(error?.message ?? 'Could not read that file. Please try a CSV or PDF statement.');
        });
    },
    [existing, runAi, validKeys],
  );

  const start = useCallback((file: File) => read(file), [read]);

  const submitPassword = useCallback(
    (password: string) => {
      const file = pendingFile.current;
      if (file) read(file, password);
    },
    [read],
  );

  const updateDraft = useCallback((id: string, patch: Partial<DraftRow>) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft;
        const next = { ...draft, ...patch };

        // A hand-set category is the strongest signal there is, and it is the
        // only origin the learned map will record. Setting it here — rather than
        // asking every call site to remember — is what keeps that guarantee.
        if (patch.category !== undefined && patch.category !== draft.category) {
          next.origin = 'user';
          next.confidence = 100;
        }

        // An edit that makes a blocked row importable ticks it. Someone who
        // chooses a category for an uncategorised row has said they want it;
        // making them also find the checkbox is a second step for a decision
        // they already made. Guarded on the *transition*, so a row the user
        // deliberately unticked stays unticked when they edit it further.
        if (
          patch.include === undefined &&
          !draft.include &&
          !isImportable(draft) &&
          isImportable(next) &&
          !next.issues.includes('credit') &&
          !next.duplicateOf &&
          !next.duplicateInBatch
        ) {
          next.include = true;
        }
        return next;
      }),
    );
  }, []);

  const setAllIncluded = useCallback((include: boolean) => {
    setDrafts((current) =>
      current.map((draft) => {
        // "Select all" must not tick rows that cannot be imported or that we
        // flagged as duplicates — silently re-selecting those is how a bulk
        // action undoes the safety the row-level checks provide.
        if (include && (!isImportable(draft) || draft.duplicateOf || draft.duplicateInBatch)) return draft;
        return { ...draft, include };
      }),
    );
  }, []);

  /**
   * Read every ambiguous date the other way round.
   *
   * Duplicate detection re-runs afterwards because it is keyed on the date: a
   * whole statement shifting from April to March can turn a row that looked like
   * a duplicate into a new transaction, and the reverse.
   */
  const flipDateOrder = useCallback(() => {
    setDateOrder((current) => (current === 'dmy' ? 'mdy' : 'dmy'));
    setDrafts((current) =>
      markDuplicates(
        current.map((draft) => (draft.date ? { ...draft, date: swapDayMonth(draft.date) } : draft)),
        existing,
      ),
    );
  }, [existing]);

  const resume = useCallback(() => {
    const staged = loadStaged();
    if (!staged) return;
    runId.current++;
    setFileName(staged.fileName);
    setDrafts(markDuplicates(staged.drafts, existing));
    setExtraction(null);
    setPhase('review');
    setAiPhase('skipped');
    setResumable(null);
  }, [existing]);

  const discardResumable = useCallback(() => {
    clearStaged();
    setResumable(null);
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    pendingFile.current = null;
    clearStaged();
    setPhase('idle');
    setMessage('');
    setFileName('');
    setDrafts([]);
    setExtraction(null);
    setAiPhase('skipped');
    setAiMessage('');
    setAiAsked(0);
  }, []);

  const confirm = useCallback((): ExpenseItem[] => {
    const chosen = drafts.filter((d) => d.include && isImportable(d));
    const items = chosen.map((d) => toExpense(d));

    saveLearned(
      rememberConfirmed(
        loadLearned(),
        chosen.map((d) => ({ merchant: d.merchant, category: d.category, origin: d.origin })),
      ),
    );

    clearStaged();
    return items;
  }, [drafts]);

  const summary = useMemo(() => (drafts.length ? summarize(drafts) : EMPTY_SUMMARY), [drafts]);

  return {
    phase, message, fileName, drafts, summary, extraction,
    aiPhase, aiMessage, aiAsked, resumable,
    dateOrder, dateOrderAssumed: extraction?.doc.dateOrderAssumed ?? false, flipDateOrder,
    start, submitPassword, updateDraft, setAllIncluded,
    resume, discardResumable, confirm, reset,
  };
}
