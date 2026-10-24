/**
 * The market layer's UI: the shared country picker, the work-rights chip on job cards and the per-country
 * work-rights declaration on the profile.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = vi.fn();
vi.mock('../tools/ui/Toast', () => ({ useToast: () => ({ notify }) }));
const updateProfileMeta = vi.fn();
vi.mock('../careers/services/careerProfile', () => ({ updateProfileMeta: (...a: unknown[]) => updateProfileMeta(...a) }));

const { CountryOptions } = await import('../careers/components/CountryOptions');
const { WorkRightsChip } = await import('../careers/components/WorkRightsChip');
const { DeclaredRightsCard } = await import('../careers/components/DeclaredRightsCard');
import type { CareerProfileRow } from '../careers/types';

beforeEach(() => {
  notify.mockClear();
  updateProfileMeta.mockClear();
});

describe('CountryOptions', () => {
  it('offers the five engine markets, then the aggregator-only countries', () => {
    render(<select aria-label="Country"><CountryOptions /></select>);
    const values = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['in', 'gb', 'us', 'au', 'nz', 'sg', 'ae']);
    expect(screen.getByRole('option', { name: 'New Zealand' })).toBeTruthy();
  });
});

describe('WorkRightsChip', () => {
  const citizensOnly = { requirement: 'citizen_only' as const, all: ['citizen_only' as const] };

  it('states the requirement in the market’s words and how it reads against the user', () => {
    render(<WorkRightsChip job={{ country: 'AU', work_rights: citizensOnly }} declared={{ au: 'needs_sponsorship' }} />);
    expect(screen.getByText(/Australian citizens only · does not match your work rights/)).toBeTruthy();
  });

  it('carries its meaning in text, not only colour, when the user has declared nothing', () => {
    render(<WorkRightsChip job={{ country: 'gb', work_rights: { requirement: 'clearance_required', all: ['clearance_required'], clearance: 'sc' } }} />);
    const chip = screen.getByText('SC clearance required');
    expect(chip.textContent).toBe('SC clearance required');
  });

  it('renders nothing when the posting states nothing, or sits outside the five markets', () => {
    const { container: silent } = render(<WorkRightsChip job={{ country: 'AU', work_rights: null }} />);
    expect(silent.textContent).toBe('');
    const { container: elsewhere } = render(<WorkRightsChip job={{ country: 'SG', work_rights: citizensOnly }} />);
    expect(elsewhere.textContent).toBe('');
  });
});

describe('DeclaredRightsCard', () => {
  const profile = { settings: { model: '', declaredRights: { gb: 'permanent' } } } as unknown as CareerProfileRow;

  it('gives every market a labelled select with its own word for permanent status', () => {
    render(<DeclaredRightsCard userId="u1" profile={profile} onSaved={() => {}} />);
    for (const name of ['India', 'United Kingdom', 'United States', 'Australia', 'New Zealand']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect((screen.getByLabelText('United Kingdom') as HTMLSelectElement).value).toBe('permanent');
    expect(screen.getByRole('option', { name: 'Green card holder' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Settled status (ILR)' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Work rights by country' })).toBeTruthy();
  });

  it('saves a choice into the profile settings without touching the other markets', async () => {
    const saved = { ...profile, settings: { ...profile.settings, declaredRights: { gb: 'permanent', au: 'needs_sponsorship' } } };
    updateProfileMeta.mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<DeclaredRightsCard userId="u1" profile={profile} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Australia'), { target: { value: 'needs_sponsorship' } });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(updateProfileMeta).toHaveBeenCalledWith('u1', {
      settings: { model: '', declaredRights: { gb: 'permanent', au: 'needs_sponsorship' } },
    });
    expect(notify).toHaveBeenCalledWith('Work rights saved.', 'ok');
  });

  it('clears a market when set back to "Not set"', async () => {
    updateProfileMeta.mockResolvedValue(profile);
    render(<DeclaredRightsCard userId="u1" profile={profile} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('United Kingdom'), { target: { value: '' } });
    await waitFor(() => expect(updateProfileMeta).toHaveBeenCalledWith('u1', { settings: { model: '', declaredRights: {} } }));
  });
});
