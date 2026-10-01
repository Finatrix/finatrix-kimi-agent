import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../shared/brand';
import { analyticsOptedOut, browserPrivacyRequested, setAnalyticsOptOut } from '../../lib/privacyPreferences';
import { initAnalytics } from '../../lib/analytics';
import { clearHistory, pruneOtherUsers } from '../ai/history';
import { AI_RECIPIENT, useAiConsent } from '../../lib/ai/consent';
import './planning.css';

export default function PrivacyControls() {
  const { user } = useAuth();
  const [optOut, setOptOut] = useState(analyticsOptedOut);
  const [status, setStatus] = useState('');
  const [confirmChat, setConfirmChat] = useState(false);
  const [aiConsent, setAiConsent] = useAiConsent();
  useEffect(() => {
    const refresh = () => setOptOut(analyticsOptedOut());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  return <section className="fx-planning card" aria-labelledby="privacy-controls-title">
    <h2 id="privacy-controls-title">Privacy control centre</h2>
    <p>Know what is saved, what is shared and which choices apply to this device.</p>
    <dl className="fx-plan-stats">
      <div><dt>Finance records</dt><dd style={{ fontSize: 14 }}>{user ? 'Local storage + account sync' : 'Stored on this device'}</dd></div>
      <div><dt>FinatriX AI</dt><dd style={{ fontSize: 14 }}>{aiConsent ? 'Allowed on this device' : 'Asks before sending anything'}</dd></div>
      <div><dt>Written setup help</dt><dd style={{ fontSize: 14 }}>Answered on your device</dd></div>
    </dl>
    <label className="fx-checkrow" style={{ display: 'flex', gap: 10 }}>
      <input className="fx-check" type="checkbox" checked={!optOut} onChange={e => {
        const next = !e.target.checked;
        const persisted = setAnalyticsOptOut(next);
        setOptOut(next);
        if (!next) initAnalytics();
        setStatus(`${next ? 'Optional usage analytics turned off.' : 'Optional usage analytics allowed, subject to browser privacy signals.'}${persisted ? '' : ' Your browser blocked storage; this choice lasts for this session.'}`);
      }} />Allow optional usage analytics on this device
    </label>
    <p className="fx-plan-muted">Applies to finance and Careers usage analytics. Does not disable account, billing or security records needed to operate those services. {browserPrivacyRequested() ? 'Your browser requests privacy, so usage analytics remains off regardless of this setting.' : 'Do Not Track and Global Privacy Control are also respected.'}</p>
    <h3>FinatriX AI</h3>
    <label className="fx-checkrow" style={{ display: 'flex', gap: 10 }}>
      <input className="fx-check" type="checkbox" checked={aiConsent} onChange={e => {
        setAiConsent(e.target.checked);
        setStatus(e.target.checked ? 'FinatriX AI may send data to its AI provider when you ask.' : 'FinatriX AI will ask again before sending anything.');
      }} />Allow FinatriX AI to send data to its AI provider
    </label>
    <p className="fx-plan-muted">When allowed, an AI answer sends your question, the recent conversation and the figures it needs — and a statement import sends unrecognised merchant descriptions — to {AI_RECIPIENT}. Your name, email address and account ID are never sent. Turning this off stops future requests; it does not recall ones already answered.</p>
    <h3>Chat history</h3>
    <p>AI questions, recent conversation and relevant financial context are sent to the AI service to generate answers, only with your permission. Chat history is saved on this device for signed-in users. Clearing it here does not delete records already held by service providers.</p>
    {!confirmChat ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmChat(true)}>Clear chat history…</button> : <div className="fx-plan-note">
      <p>Delete saved chat history on this device? This cannot be undone.</p>
      <div className="fx-plan-actions"><button type="button" className="btn btn-sm" onClick={() => {
        if (user) clearHistory(user.id);
        pruneOtherUsers('');
        setConfirmChat(false);
        setStatus('Saved chat history cleared from this device.');
      }}>Delete saved chat history</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmChat(false)}>Cancel</button></div>
    </div>}
    <h3 style={{ marginTop: 24 }}>Account and data requests</h3>
    <p>Use the backup and finance-data controls below for your tool records. To delete your account and everything stored with it, use <Link to="/profile">Profile → Delete account</Link>. For other privacy requests, contact <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Clearing finance records does not delete your account or Careers records.</p>
    <div className="fx-plan-actions"><Link to="/privacy">Read the privacy policy</Link><Link to="/profile">Manage account</Link><Link to="/security">Security information</Link></div>
    <p role="status">{status}</p>
  </section>;
}
