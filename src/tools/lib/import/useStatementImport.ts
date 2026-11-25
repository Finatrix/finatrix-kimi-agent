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
import { readStatementLayout } from '../../ai/statementLayout';
import { categorizeDescriptions, type CategoryOption } from '../../ai/statementCategorize';
import { setAiConsent } from '../../../lib/ai/consent';
import type { ExpenseItem } from '../expense';
import { applySuggestions, pendingDescriptions } from './categorize';
import { markDuplicates } from './dedupe';
import {
  amendAmount, buildDrafts, clearStaged, flipDirection, loadStaged, readAmountEdit, saveStaged,
  settleAmountEdit, toExpense, type AmountEdit,
} from './draft';
import { becameImportable, isImportable, summarize } from './status';
import { extractStatement, extractStatements, ImportError, type ExtractedStatement } from './extract';
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

/** `consent`: merchants are waiting to be named, and nothing has been sent — the
 *  user has not yet allowed third-party AI (lib/ai/consent). */
export type AiPhase = 'skipped' | 'consent' | 'running' | 'done' | 'failed';

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
  /** True when the file gave no evidence of which way any row moved. */
  directionsUncertain: boolean;
  /** Re-read every row the other way round: money out as money in, and back. */
  swapDirections: () => void;
  /** Give permission for third-party AI, then name the unrecognised merchants. */
  allowAi: () => void;
  /** Keep this import on the device: categorise by hand. */
  declineAi: () => void;

  /** Read one file, or several at once (screenshots shared together) into one review. */
  start: (files: File | readonly File[]) => void;
  submitPassword: (password: string) => void;
  updateDraft: (id: string, patch: Partial<DraftRow>) => void;
  /**
   * The amount being typed into a row, until it is settled. One row at a time:
   * the field shows this text instead of the row's own amount.
   */
  amountEdit: AmountEdit | null;
  /** Why the last amount typed was turned away, and for which row. */
  amountRefusal: { id: string; reason: string } | null;
  /** Record what is being typed into a row's amount. Nothing is applied yet. */
  editAmount: (id: string, text: string) => void;
  /**
   * Settle what is being typed: take it as the row's amount if it is one above
   * zero, or leave the row's amount alone and say why in `amountRefusal`. The
   * size is all that changes; which way the money moved stays as the row has
   * it. Does nothing when nothing is being typed.
   */
  settleAmount: () => void;
  /**
   * Forget what was being typed into a row, unsettled. For a field that has
   * gone from the screen mid-edit; does nothing for any other row.
   */
  dropAmountEdit: (id: string) => void;
  setAllIncluded: (include: boolean) => void;
  resume: () => void;
  discardResumable: () => void;
  /**
   * Hand the ticked rows to `save` and, only if it took them, fold the
   * confirmed choices into learning and drop the staged copy. Returns whether
   * the import went through. When `save` refuses (it returns `false` — storage
   * is full), nothing is learned, nothing is cleared, and `saveError` says why.
   *
   * An amount still being typed is settled first, so what is imported is what
   * the field shows. If it is turned away, nothing is imported on this call.
   */
  confirm: (save: (items: ExpenseItem[]) => boolean | void) => boolean;
  /** Why the last confirm did not go through. Empty otherwise. */
  saveError: string;
  /** Back to the file picker. Leaves any staged review where it is. */
  reset: () => void;
  /** Abandon this import: back to the file picker, and the staged copy is deleted. */
  discard: () => void;
  /** Write the staged copy now, rather than on the next debounce tick. */
  stash: () => void;
}

/** The staged review this browser holds, as the resume banner describes it. */
function readResumable(): UseStatementImport['resumable'] {
  const staged = loadStaged();
  return staged
    ? { fileName: staged.fileName, savedAt: staged.savedAt, count: staged.drafts.length }
    : null;
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
  const [resumable, setResumable] = useState<UseStatementImport['resumable']>(readResumable);
  const [saveError, setSaveError] = useState('');
  /* An amount being typed lives here rather than in its field, because the
     field is not the only thing that has to know about it. Leaving the field
     settles it — but a tap on Import does not always take focus from a field
     (a phone, a screen reader's activate gesture), and an import that went
     ahead on the row's old amount while the new one was still on screen would
     be the one thing this sheet promises never to do. Held here, `confirm` and
     `stash` can settle it themselves. */
  const [amountEdit, setAmountEdit] = useState<AmountEdit | null>(null);
  const [amountRefusal, setAmountRefusal] = useState<UseStatementImport['amountRefusal']>(null);

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
        if (!result.ok && result.needsConsent) {
          // Nothing left the device. Ask, rather than report a failure.
          setAiPhase('consent');
          setAiAsked(0);
          return;
        }
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
    (files: readonly File[], password?: string) => {
      const id = ++runId.current;
      // A password is asked for only when one file was chosen: in a batch a
      // locked PDF is skipped with a note instead.
      pendingFile.current = files.length === 1 ? files[0] : null;
      setFileName(files.length === 1 ? files[0].name : `${files.length} files`);
      setPhase('reading');
      setMessage('');
      setSaveError('');
      setAmountEdit(null);
      setAmountRefusal(null);
      setAiPhase('skipped');
      setAiMessage('');
      setAiAsked(0);

      // The layout assist only ever sees digit-masked lines, and only when the
      // assistant is enabled for this import at all.
      const layout = aiEnabled ? readStatementLayout : undefined;
      void (files.length === 1 ? extractStatement(files[0], { password, layout }) : extractStatements(files, { layout }))
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
    [aiEnabled, existing, runAi, validKeys],
  );

  const start = useCallback(
    (files: File | readonly File[]) => {
      const list = Array.isArray(files) ? (files as readonly File[]) : [files as File];
      if (list.length) read(list);
    },
    [read],
  );

  const submitPassword = useCallback(
    (password: string) => {
      const file = pendingFile.current;
      if (file) read([file], password);
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

        // An edit that makes a blocked row importable ticks it — see
        // `becameImportable` for why, and for what is never ticked this way.
        if (patch.include === undefined && becameImportable(draft, next)) next.include = true;
        return next;
      }),
    );
  }, []);

  const editAmount = useCallback((id: string, text: string) => {
    setAmountEdit({ id, text });
    // The refusal was about the last attempt; this is the next one.
    setAmountRefusal(null);
  }, []);

  /**
   * Settle the amount being typed.
   *
   * Not a patch through `updateDraft`, because an amount is not just another
   * field: it is half of what makes a row a duplicate, so the batch is checked
   * again afterwards (`amendAmount`), as it is after a date-order flip or a
   * swap. That is also why it waits for the field to be left rather than
   * running on every keystroke — the rows that "475" would flag on the way to
   * "475.25" are not ones the user ever meant.
   */
  const settleAmount = useCallback(() => {
    if (!amountEdit) return;
    const reading = readAmountEdit(amountEdit.text);
    setAmountEdit(null);
    if (reading.ok) setDrafts((current) => amendAmount(current, amountEdit.id, reading.value, existing));
    else setAmountRefusal({ id: amountEdit.id, reason: reading.error });
  }, [amountEdit, existing]);

  /**
   * Forget an amount whose field has gone.
   *
   * A row can leave the list while its amount is half typed: a filter is
   * pressed, or the model's reply moves it out of "Needs review". What was
   * typed must go with the field. Left here, it would be settled by the next
   * Import — "47", on its way to "475.25", applied to a row nobody can see.
   */
  const dropAmountEdit = useCallback((id: string) => {
    setAmountEdit((edit) => (edit?.id === id ? null : edit));
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

  /**
   * Read the whole statement the other way round.
   *
   * Offered only when the file itself settled nothing (`directionsUncertain`).
   * Duplicate flags are recomputed afterwards so a row that is now spending and
   * already in the ledger is still held back.
   */
  const swapDirections = useCallback(() => {
    setDrafts((current) => markDuplicates(current.map(flipDirection), existing));
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
    setAmountEdit(null);
    setAmountRefusal(null);
  }, [existing]);

  const discardResumable = useCallback(() => {
    clearStaged();
    setResumable(null);
  }, []);

  /**
   * Back to the file picker.
   *
   * Does NOT delete the staged review. This runs for "Choose another file"
   * after a file that could not be read, where the only staged copy there can
   * be is an earlier, unfinished review — and deleting that because a different
   * file failed to parse threw away work the user never asked to lose.
   */
  const reset = useCallback(() => {
    runId.current++;
    pendingFile.current = null;
    setPhase('idle');
    setMessage('');
    setFileName('');
    setDrafts([]);
    setExtraction(null);
    setAiPhase('skipped');
    setAiMessage('');
    setAiAsked(0);
    setSaveError('');
    setAmountEdit(null);
    setAmountRefusal(null);
    setResumable(readResumable());
  }, []);

  /** The user said to abandon this import: the staged copy goes with it. */
  const discard = useCallback(() => {
    clearStaged();
    reset();
  }, [reset]);

  /**
   * Save the review as it stands, now.
   *
   * The effect above writes it half a second after the last edit. A sheet
   * dismissed inside that half second would otherwise be resumed one edit
   * behind — or, for a file opened and dismissed at once, not at all.
   */
  const stash = useCallback(() => {
    if (phase !== 'review' || !drafts.length) return;
    // With an amount that was being typed, when it is one the row can take:
    // closing the sheet is "not now", not "throw away what I just typed".
    saveStaged(fileName, settleAmountEdit(drafts, amountEdit, existing).drafts);
  }, [phase, drafts, fileName, amountEdit, existing]);

  const confirm = useCallback((save: (items: ExpenseItem[]) => boolean | void): boolean => {
    // An amount still being typed is on the screen, so it is part of what is
    // being confirmed. If it cannot be taken, nothing is imported on this
    // press: the field goes back to the row's amount, says why, and the next
    // press imports what is then on show.
    const settled = settleAmountEdit(drafts, amountEdit, existing);
    if (amountEdit) {
      setAmountEdit(null);
      if (settled.refusal) {
        setAmountRefusal({ id: amountEdit.id, reason: settled.refusal });
        return false;
      }
      setDrafts(settled.drafts);
    }

    const chosen = settled.drafts.filter((d) => d.include && isImportable(d));
    if (!chosen.length) return false;

    // The ledger first. Learning from a category choice and deleting the
    // staged review are both things to do AFTER the transactions are safely
    // written — done before, a refused write cost the user their review and
    // taught the importer from rows that were never imported.
    if (save(chosen.map((d) => toExpense(d))) === false) {
      setSaveError(
        'Nothing was imported. This device’s storage is full, so these transactions could not be saved. '
        + 'Export a backup and clear some older data, or untick some rows, then try again. Your review is kept.',
      );
      return false;
    }

    saveLearned(
      rememberConfirmed(
        loadLearned(),
        chosen.map((d) => ({ merchant: d.merchant, category: d.category, origin: d.origin })),
      ),
    );

    setSaveError('');
    clearStaged();
    return true;
  }, [drafts, amountEdit, existing]);

  const summary = useMemo(() => (drafts.length ? summarize(drafts) : EMPTY_SUMMARY), [drafts]);

  const allowAi = useCallback(() => {
    setAiConsent(true);
    runAi(drafts, runId.current);
  }, [drafts, runAi]);

  const declineAi = useCallback(() => setAiPhase('skipped'), []);

  return {
    phase, message, fileName, drafts, summary, extraction,
    aiPhase, aiMessage, aiAsked, resumable,
    dateOrder, dateOrderAssumed: extraction?.doc.dateOrderAssumed ?? false, flipDateOrder,
    directionsUncertain: extraction?.directionsUncertain ?? false, swapDirections,
    allowAi, declineAi,
    start, submitPassword, updateDraft, amountEdit, amountRefusal, editAmount, settleAmount, dropAmountEdit,
    setAllIncluded,
    resume, discardResumable, confirm, saveError, reset, discard, stash,
  };
}
