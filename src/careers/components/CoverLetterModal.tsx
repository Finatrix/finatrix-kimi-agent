/**
 * Cover letter generator modal: tone + custom instructions → AI sections →
 * editable full text → PDF / DOCX / Markdown / TXT / clipboard / email.
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { useCareers } from '../context/CareersContext';
import { generateCoverLetter, updateCoverLetter } from '../services/coverLetters';
import {
  copyLetterToClipboard,
  exportLetterDocx,
  exportLetterMarkdown,
  exportLetterPdf,
  exportLetterTxt,
  letterMailto,
} from '../services/exports';
import type { ResumeVersionRow } from '../types';
import { COVER_LETTER_LENGTHS, COVER_LETTER_TONES, type CoverLetterLength, type CoverLetterRow } from '../types/jobs';
import { toCareersError } from '../utils/errors';

export function CoverLetterModal({
  version,
  jobText,
  company,
  jobTitle,
  applicationId,
  jobId,
  matchScore,
  onClose,
  onCreated,
}: {
  version: ResumeVersionRow;
  jobText: string;
  company: string;
  jobTitle: string;
  applicationId?: string;
  jobId?: string;
  matchScore?: number | null;
  onClose: () => void;
  onCreated?: (letter: CoverLetterRow) => void;
}) {
  const { user } = useAuth();
  const { settings } = useCareers();
  const { notify } = useToast();
  const [tone, setTone] = useState<string>('professional');
  const [length, setLength] = useState<CoverLetterLength>('standard');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState<CoverLetterRow | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const created = await generateCoverLetter(
        user.id, version,
        { jobText, company, jobTitle, tone, length, extraInstructions: extra, applicationId, jobId, matchScore },
        settings.model
      );
      setLetter(created);
      setText(created.content_text);
      onCreated?.(created);
      notify('Cover letter generated.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdits = async () => {
    if (!user || !letter || text === letter.content_text) return;
    setSaving(true);
    try {
      const updated = await updateCoverLetter(user.id, letter.id, { content_text: text });
      setLetter(updated);
      notify('Cover letter saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doExport = async (fn: () => Promise<void> | void, label: string) => {
    try {
      await fn();
      notify(`${label}.`, 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const current = letter ? { ...letter, content_text: text } : null;

  return (
    <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label="Cover letter generator">
      <div className="fx-modal-back" onClick={onClose} />
      <div className="fx-modal wide">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>Cover letter — {jobTitle || 'role'} at {company || 'company'}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="note" style={{ marginBottom: 14 }}>
          Written only from your resume ({version.file_name}) — nothing is invented. Edit freely below.
        </p>

        {!letter ? (
          <>
            <div className="grid2">
              <div className="fg">
                <label className="fl" htmlFor="cl-tone">Tone / style</label>
                <select id="cl-tone" className="fs" value={tone} onChange={(e) => setTone(e.target.value)}>
                  {COVER_LETTER_TONES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="cl-length">Length</label>
                <select id="cl-length" className="fs" value={length} onChange={(e) => setLength(e.target.value as CoverLetterLength)}>
                  {COVER_LETTER_LENGTHS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="cl-extra">Custom instructions (optional)</label>
                <input
                  id="cl-extra"
                  className="fi"
                  value={extra}
                  maxLength={300}
                  placeholder="e.g. mention my AML project first"
                  onChange={(e) => setExtra(e.target.value)}
                />
              </div>
            </div>
            <button className={`btn ${busy ? 'btn-loading' : ''}`} disabled={busy} onClick={() => void generate()}>
              {busy ? 'Writing…' : 'Generate cover letter'}
            </button>
          </>
        ) : (
          <>
            <textarea
              className="fi"
              style={{ minHeight: 320, lineHeight: 1.6, fontSize: 14, resize: 'vertical' }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Cover letter text"
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button className={`btn btn-sm ${saving ? 'btn-loading' : ''}`} disabled={saving || text === letter.content_text} onClick={() => void saveEdits()}>
                {text === letter.content_text ? 'Saved' : 'Save edits'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void doExport(() => exportLetterPdf(current!), 'PDF downloaded')}>PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void doExport(() => exportLetterDocx(current!), 'DOCX downloaded')}>DOCX</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void doExport(() => exportLetterMarkdown(current!), 'Markdown downloaded')}>MD</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void doExport(() => exportLetterTxt(current!), 'Text downloaded')}>TXT</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void doExport(() => copyLetterToClipboard(current!), 'Copied to clipboard')}>Copy</button>
              <a className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} href={letterMailto(current!)}>Email</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
