import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useOptionalCurrency } from '../CurrencyContext';
import { useOptionalToast } from '../ui/Toast';
import { joinCodeFromSearch } from '../../lib/groupCode';
import { groupErrorMessage, groupTypeLabel, loadGroupsCache, type GroupChoice } from '../lib/groups';
import { fetchAdultConfirmed, fetchMyGroups, resetGroupCode } from '../lib/groupsApi';
import { CreateGroupSheet, type CreatedGroup } from '../ui/groups/CreateGroupSheet';
import { JoinSheet } from '../ui/groups/JoinSheet';
import { InviteSheet } from '../ui/groups/InviteSheet';
import { GroupDetail } from '../ui/groups/GroupDetail';
import '../ui/groups/groups.css';

function accountName(meta: Record<string, unknown> | undefined): string {
  const name = meta?.full_name ?? meta?.name;
  return typeof name === 'string' ? name.trim().split(/\s+/).slice(0, 3).join(' ').slice(0, 40) : '';
}

/**
 * Groups (NEW_FEATURES item 12): a shared space where a family, a couple or
 * flatmates track money together, each on their own phone. This screen lists
 * your groups, creates and joins them, and opens one (`?g=<id>`). An invite
 * link lands here as `?join=FX-7K2P9Q`.
 */
export default function GroupsPage() {
  const { user, loading, configured } = useAuth();
  const { notify } = useOptionalToast();
  const currency = useOptionalCurrency()?.code ?? 'INR';
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const joinCode = joinCodeFromSearch(location.search);
  const openId = params.get('g');

  const cached = loadGroupsCache();
  const [groups, setGroups] = useState<GroupChoice[]>(() => (cached && cached.uid === user?.id ? cached.groups : []));
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [adult, setAdult] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null);
  const [created, setCreated] = useState<CreatedGroup | null>(null);

  const refresh = useCallback(() => fetchMyGroups().then((list) => {
    setGroups(list);
    setState('ready');
  }, () => {
    // Offline or refused: the list this phone last saw stays on screen.
    setState('error');
  }), []);

  useEffect(() => {
    if (!user) return;
    void refresh();
    void fetchAdultConfirmed().then(setAdult);
  }, [user, refresh]);

  const go = (id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('join');
    if (id) next.set('g', id); else next.delete('g');
    setParams(next, { replace: !id });
  };
  const clearJoin = () => {
    const next = new URLSearchParams(params);
    next.delete('join');
    setParams(next, { replace: true });
  };

  const defaultName = accountName(user?.user_metadata);
  const signInHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  const head = (
    <PageHead chip="Groups" chipColor="var(--gold)" icon="users" title="Money, together.">
      A shared budget for your family, your partner or your flat. Everyone uses their own phone and
      sees the group’s spending as it happens. Only what you add to a group is shared.
    </PageHead>
  );

  if (!configured || (!loading && !user)) {
    return (
      <div className="fx-page">
        {head}
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px', marginBottom: 14 }}>
          <Icon name="users" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {joinCode ? 'Sign in to join the group' : 'Groups need a FinatriX account'}
          </div>
          <p className="note" style={{ maxWidth: 400, margin: '0 auto 16px' }}>
            {configured
              ? 'A group lives on FinatriX’s servers so every member’s phone sees the same thing. Your personal expenses stay private.'
              : 'Groups aren’t available on this build.'}
          </p>
          {configured && <Link to={signInHref} className="btn btn-sm" style={{ textDecoration: 'none' }}>Sign in</Link>}
        </div>
        <Foot />
      </div>
    );
  }

  const open = openId ? groups.find((g) => g.id === openId) ?? null : null;
  const needsAdult = adult === false;

  return (
    <div className="fx-page">
      {!open && head}

      {open ? (
        <GroupDetail key={open.id} choice={open} onBack={() => go(null)} onChanged={() => void refresh()}
          onLeft={() => { notify(`You left ${open.name}.`, 'ok'); go(null); void refresh(); }} />
      ) : (
        <>
          <div className="fx-grp-actions" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-sm" onClick={() => setSheet('create')} disabled={!user}>
              <Icon name="plus" size={15} /> Create a group
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet('join')} disabled={!user}>Join with a code</button>
          </div>

          {groups.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px 20px', marginBottom: 14 }} role="status">
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                {state === 'loading' ? 'Looking for your groups…' : 'No groups yet'}
              </div>
              <p className="note" style={{ maxWidth: 400, margin: '0 auto' }}>
                {state === 'error'
                  ? groupErrorMessage('Failed to fetch')
                  : 'Create one and invite your family, or join with the code someone shared.'}
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'grid', gap: 8 }} aria-label="Your groups">
              {groups.map((g) => (
                <li key={g.id}>
                  <button type="button" className="fx-grp-card" onClick={() => go(g.id)}>
                    <span className="fx-grp-badge" aria-hidden="true">{g.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="fx-grp-name">{g.name}</span>
                      <span className="fx-grp-sub">
                        {groupTypeLabel(g.type)} · {g.members} {g.members === 1 ? 'member' : 'members'}{g.role === 'admin' ? ' · Admin' : ''}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--ink3)' }}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-private-h">
            <h2 id="grp-private-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>What a group shares</h2>
            <p className="note" style={{ margin: 0 }}>
              Only the expenses you add to a group, the budget you set together and the name you choose for
              yourself. Members never see your personal expenses, budgets, goals, email or account. Anyone can
              leave at any time; what they added stays for the others as “Former member”. Groups are for
              people 18 or over. <Link to="/privacy#groups" className="fx-inline-link">Privacy</Link>
            </p>
          </section>
        </>
      )}

      {user && (sheet === 'create') && (
        <CreateGroupSheet defaultName={defaultName} needsAdult={needsAdult} currency={currency} onClose={() => setSheet(null)}
          onCreated={(made) => {
            setSheet(null);
            setAdult(true);
            setCreated(made);
            void refresh();
          }} />
      )}
      {user && (sheet === 'join' || (!!joinCode && sheet === null && !created)) && (
        <JoinSheet key={joinCode ?? 'typed'} initialCode={sheet === 'join' ? null : joinCode} defaultName={defaultName} needsAdult={needsAdult}
          onClose={() => { setSheet(null); clearJoin(); }}
          onJoined={(groupId, status) => {
            setSheet(null);
            setAdult(true);
            notify(status === 'already_member' ? 'You’re already in this group.' : 'You’re in. Welcome to the group.', 'ok');
            void refresh().then(() => go(groupId));
          }} />
      )}
      {created && (
        <InviteSheet group={created} invite={{ code: created.code, expires_at: created.expiresAt }} isAdmin
          onReset={async () => {
            const next = await resetGroupCode(created.groupId);
            setCreated({ ...created, code: next.code, expiresAt: next.expires_at });
          }}
          onClose={() => { const id = created.groupId; setCreated(null); go(id); }} />
      )}

      {!open && <Foot />}
    </div>
  );
}

function Foot() {
  return (
    <ToolFoot>
      Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
      <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
    </ToolFoot>
  );
}
