/**
 * Match Queue page behaviour.
 *
 * The page sits behind auth + the Careers Pro paywall, so it cannot be driven
 * in a browser without real credentials. These tests mount it directly with the
 * two contexts mocked, which is the only way the card, the verdict handling and
 * the keyboard review get exercised at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ScoredJob } from '../careers/search/pipeline';

// `vi.mock` factories are hoisted above every const in this file, so the spies
// they close over have to be hoisted too.
const { createApplication, saveJob, runSearchPipeline } = vi.hoisted(() => ({
  createApplication: vi.fn(),
  saveJob: vi.fn(),
  runSearchPipeline: vi.fn(),
}));

// Both contexts hand back the SAME object every render, as the real providers
// do. A fresh object per render is what turns an id-keyed effect into a render
// loop, so an unstable mock here would be testing a fiction.
const { authValue, careersValue } = vi.hoisted(() => ({
  authValue: { user: { id: 'user-1' } },
  careersValue: {
    loading: false,
    error: null,
    profile: { preferred_role: 'Risk Analyst', location_preference: 'Mumbai', job_title: '' },
    resumes: [] as never[],
    refresh: vi.fn(),
    settings: {},
  },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }));

vi.mock('../careers/context/CareersContext', () => ({ useCareers: () => careersValue }));

vi.mock('../tools/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

vi.mock('../careers/services/applications', () => ({ createApplication }));

vi.mock('../careers/services/jobsService', () => ({
  saveJob,
  searchProviders: vi.fn(),
  // Stable per-job hash so decisions key deterministically.
  jobContentSha: (job: { external_id: string }) => Promise.resolve(`sha-${job.external_id}`),
}));

vi.mock('../careers/search/pipeline', () => ({ runSearchPipeline }));

import MatchQueuePage from '../careers/pages/MatchQueuePage';

function scored(id: string, title: string, company: string, overall: number, extra: {
  matched?: string[];
  missing?: string[];
} = {}): ScoredJob {
  return {
    job: {
      external_id: id,
      source: 'test',
      via: 'test',
      title,
      company,
      location: 'Mumbai',
      apply_url: `https://example.test/${id}`,
      description: '',
      salary_min: null,
      salary_max: null,
      currency: 'INR',
      country: 'in',
      work_mode: 'hybrid',
      employment_type: 'fulltime',
      posted_at: null,
      closes_at: null,
      industry: '',
      classification: { category: 'other' },
    } as unknown as ScoredJob['job'],
    match: {
      overall,
      scores: {} as never,
      matchedSkills: extra.matched ?? [],
      missingTerms: extra.missing ?? [],
    },
    relevance: 50,
    locationVerdict: {} as ScoredJob['locationVerdict'],
    why: ['title matches'],
  };
}

function mount() {
  return render(
    <MemoryRouter>
      <MatchQueuePage />
    </MemoryRouter>,
  );
}

function build() {
  fireEvent.click(screen.getByRole('button', { name: /build my queue/i }));
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

const TWO_JOBS = () => ({
  jobs: [
    scored('a', 'Risk Analyst', 'Acme Bank', 88),
    scored('b', 'Credit Analyst', 'Beta Corp', 80),
  ],
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
  vi.clearAllMocks();
  createApplication.mockResolvedValue({ id: 'app-1' });
  saveJob.mockResolvedValue({ id: 'job-row-1' });
});

describe('Match Queue page', () => {
  it('prefills the search from the career profile', () => {
    mount();
    expect((screen.getByLabelText('Role or keyword') as HTMLInputElement).value).toBe('Risk Analyst');
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Mumbai');
  });

  it('shows one card at a time, with both strengths and gaps', async () => {
    runSearchPipeline.mockResolvedValue({
      jobs: [
        scored('a', 'Risk Analyst', 'Acme Bank', 88, { matched: ['SQL'], missing: ['DAX'] }),
        scored('b', 'Credit Analyst', 'Beta Corp', 80),
      ],
    });
    mount();
    build();

    expect(await screen.findByText('Risk Analyst')).toBeTruthy();
    expect(screen.getByText('Acme Bank')).toBeTruthy();
    // Only the first card is on screen.
    expect(screen.queryByText('Credit Analyst')).toBeNull();
    // Both sides of the argument are present, and equally.
    expect(screen.getByText('What lines up')).toBeTruthy();
    expect(screen.getByText('Not evidenced in your resume')).toBeTruthy();
    expect(screen.getByText('SQL')).toBeTruthy();
    expect(screen.getByText('DAX')).toBeTruthy();
    expect(screen.getByText('Excellent fit')).toBeTruthy();
  });

  it('advances on decline, and never submits anything', async () => {
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');

    click('Decline');

    expect(await screen.findByText('Credit Analyst')).toBeTruthy();
    expect(screen.queryByText('Risk Analyst')).toBeNull();
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('brings a skipped card back at the end instead of losing it', async () => {
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');

    click('Skip');
    expect(await screen.findByText('Credit Analyst')).toBeTruthy();

    click('Skip');
    // Both skipped → the deck wraps back to the first, still unreviewed.
    expect(await screen.findByText('Risk Analyst')).toBeTruthy();
  });

  it('tracks an application at ready_to_apply without submitting it', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');

    click(/^Apply/);

    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
    const fields = createApplication.mock.calls[0][1];
    expect(fields.stage).toBe('ready_to_apply');
    expect(fields.company_name).toBe('Acme Bank');
    expect(fields.job_title).toBe('Risk Analyst');
    expect(fields.match_score).toBe(88);
    // The employer's own posting is what opens — nothing is submitted for the user.
    expect(open).toHaveBeenCalledWith('https://example.test/a', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('remembers declines across a remount', async () => {
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');
    click('Decline');
    await screen.findByText('Credit Analyst');

    cleanup();
    mount();
    build();

    // The declined role never reappears; the next one leads the deck.
    expect(await screen.findByText('Credit Analyst')).toBeTruthy();
    expect(screen.queryByText('Risk Analyst')).toBeNull();
  });

  it('supports keyboard review', async () => {
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');

    fireEvent.keyDown(window, { key: 'ArrowLeft' }); // decline
    expect(await screen.findByText('Credit Analyst')).toBeTruthy();
  });

  it('ignores review keys while the user is typing in the search box', async () => {
    runSearchPipeline.mockResolvedValue(TWO_JOBS());
    mount();
    build();
    await screen.findByText('Risk Analyst');

    fireEvent.keyDown(screen.getByLabelText('Role or keyword'), { key: 'ArrowLeft' });
    // The card must not have been declined out from under the cursor.
    expect(screen.getByText('Risk Analyst')).toBeTruthy();
  });

  it('explains an empty queue in terms of the threshold', async () => {
    runSearchPipeline.mockResolvedValue({
      jobs: [scored('a', 'Risk Analyst', 'Acme Bank', 30), scored('b', 'Credit Analyst', 'Beta Corp', 20)],
    });
    mount();
    build();

    expect(await screen.findByText(/Nothing cleared the 70% bar/)).toBeTruthy();
    expect(screen.getByText(/scored below 70%/)).toBeTruthy();
  });

  it('reports progress from terminal verdicts only', async () => {
    runSearchPipeline.mockResolvedValue({
      jobs: [
        scored('a', 'Risk Analyst', 'Acme Bank', 88),
        scored('b', 'Credit Analyst', 'Beta Corp', 80),
        scored('c', 'Data Analyst', 'Gamma Ltd', 75),
      ],
    });
    mount();
    build();
    await screen.findByText('Risk Analyst');

    click('Skip');
    await screen.findByText('Credit Analyst');
    // A skip is not progress.
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');

    click('Decline');
    await waitFor(() =>
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33'),
    );
  });
});
