import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ToolEducation from '../tools/ui/ToolEducation';
import { TOOL_IDS } from '../shared/routes';
import { TOOL_GUIDES } from '../shared/toolGuides';
import { TOOLS } from '../lib/tools';
import { track } from '../lib/analytics';

vi.mock('../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../lib/seo', () => ({ applyToolFaqSchema: vi.fn() }));

/**
 * The education block under every public calculator.
 *
 * It used to be 3,500–6,500px of always-open reference text under each tool on
 * a phone — longer than the tool. The contract now: the heading, the purpose
 * and the disclaimer are on the page; everything else is one press away, still
 * in the document (so the FAQ structured data stays truthful and search engines
 * read it), and out of the layout until opened.
 */
describe.each(TOOL_IDS)('ToolEducation — %s', (toolId) => {
  beforeEach(() => {
    cleanup();
    vi.mocked(track).mockClear();
  });

  const renderIt = (path = `/tools/${toolId}`) =>
    render(<MemoryRouter initialEntries={[path]}><ToolEducation toolId={toolId} /></MemoryRouter>);

  it('keeps the heading, purpose and disclaimer visible and the reference collapsed', () => {
    renderIt();
    const name = TOOLS.find((t) => t.id === toolId)!.name;
    expect(screen.getByRole('heading', { level: 2, name: `About ${name}` })).toBeInTheDocument();
    expect(screen.getByText(TOOL_GUIDES[toolId].purpose)).toBeInTheDocument();
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show calculation, examples & FAQ' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'How this is calculated' })).not.toBeInTheDocument();
    // Hidden, not removed: the FAQ the structured data describes is in the DOM.
    expect(document.getElementById('tool-faq')).not.toBeNull();
  });

  it('opens on request, and records that the workings were opened', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show calculation, examples & FAQ' }));
    expect(screen.getByRole('button', { name: 'Hide calculation, examples & FAQ' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'How this is calculated' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    expect(track).toHaveBeenCalledWith('methodology_opened', { tool: toolId, where: 'education' });
  });

  it('opens by itself for a link to one of its sections', () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderIt(`/tools/${toolId}#methodology`);
    expect(screen.getByRole('heading', { name: 'How this is calculated' })).toBeVisible();
  });
});
