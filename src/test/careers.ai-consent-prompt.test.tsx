/**
 * Careers asks for AI permission at the moment an AI action needs it, instead
 * of failing with "go to Settings first". The transport stays the enforcement
 * point; this pins the question and what each answer does.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { hasAiConsent } from '../lib/ai/consent';
import { ensureAiConsent } from '../careers/ai/consentBroker';
import { AiConsentPrompt } from '../careers/components/AiConsentPrompt';

beforeEach(() => localStorage.removeItem('fx_ai_consent'));
afterEach(cleanup);

describe('Careers AI permission', () => {
  it('answers no at once when no prompt is mounted, so nothing is sent', async () => {
    await expect(ensureAiConsent()).resolves.toBe(false);
    expect(hasAiConsent()).toBe(false);
  });

  it('does not ask when permission is already given', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    render(<AiConsentPrompt />);
    await expect(ensureAiConsent()).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks once for concurrent actions, and a yes stores it and lets them carry on', async () => {
    render(<AiConsentPrompt />);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = ensureAiConsent();
      second = ensureAiConsent();
    });
    const dialog = await screen.findByRole('dialog', { name: 'Use FinatriX AI for this?' });
    expect(dialog).toHaveTextContent('OpenRouter');
    expect(dialog).toHaveTextContent('never sent');
    fireEvent.click(screen.getByRole('button', { name: 'Allow and continue' }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(hasAiConsent()).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Not now" sends nothing and stores nothing', async () => {
    render(<AiConsentPrompt />);
    let answer!: Promise<boolean>;
    act(() => {
      answer = ensureAiConsent();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await expect(answer).resolves.toBe(false);
    expect(hasAiConsent()).toBe(false);
  });
});
