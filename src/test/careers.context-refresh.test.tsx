import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// A refresh after a save must not flip `loading`: pages swap themselves for a loading state
// while it is true, which tore down the open job panel and lost a finished match.
const { user, listResumes } = vi.hoisted(() => ({
  user: { id: 'user-1' },
  listResumes: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user, loading: false }) }));
vi.mock('../careers/services/resumes', () => ({ listResumes }));
vi.mock('../careers/services/careerProfile', () => ({
  getOrCreateProfile: vi.fn(async () => ({ id: 'profile-1' })),
  resolveSettings: () => ({ analyticsEnabled: false }),
  updateProfileMeta: vi.fn(),
}));
vi.mock('../careers/services/analytics', () => ({ setAnalyticsEnabled: vi.fn() }));

import { CareersProvider, useCareers } from '../careers/context/CareersContext';

function Probe() {
  const { loading, resumes, refresh } = useCareers();
  return (
    <>
      <span data-testid="state">{loading ? 'loading' : `ready:${resumes.length}`}</span>
      <button onClick={() => void refresh()}>refresh</button>
    </>
  );
}

describe('CareersProvider refresh', () => {
  it('blocks only the first load and refreshes in the background', async () => {
    listResumes.mockResolvedValueOnce([{ id: 'r1' }]);
    render(<CareersProvider><Probe /></CareersProvider>);
    expect(screen.getByTestId('state').textContent).toBe('loading');
    expect(await screen.findByText('ready:1')).toBeTruthy();

    let finish!: (rows: unknown[]) => void;
    listResumes.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByText('refresh'));
    expect(screen.getByTestId('state').textContent).toBe('ready:1');

    await act(async () => finish([{ id: 'r1' }, { id: 'r2' }]));
    expect(screen.getByTestId('state').textContent).toBe('ready:2');
  });
});
