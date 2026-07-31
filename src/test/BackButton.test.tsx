import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router';
import { BackButton } from '../components/BackButton';

function Probe() {
  const { pathname } = useLocation();
  return <span data-testid="path">{pathname}</span>;
}

function app(initial: string[], index = initial.length - 1) {
  return render(
    <MemoryRouter initialEntries={initial} initialIndex={index}>
      <BackButton />
      <Probe />
      <Routes>
        <Route path="/" element={<Link to="/tools/budget">Open budget</Link>} />
        <Route path="/tools/budget" element={<span>Budget</span>} />
        <Route path="/profile" element={<span>Profile</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(cleanup);

describe('BackButton visibility', () => {
  it('never appears on the homepage', () => {
    app(['/']);
    expect(screen.queryByRole('button', { name: /go back/i })).toBeNull();
  });

  it('stays hidden at the top level, where there is nothing to go back to', () => {
    app(['/profile']);
    expect(screen.queryByRole('button', { name: /go back/i })).toBeNull();
  });

  it('appears once navigation is more than one level deep', () => {
    app(['/tools/budget']);
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });
});

describe('BackButton behaviour', () => {
  it('walks back through real browser history', () => {
    app(['/']);
    fireEvent.click(screen.getByText('Open budget'));
    expect(screen.getByTestId('path')).toHaveTextContent('/tools/budget');

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });

  it('falls back to home on a cold load, instead of leaving the site', () => {
    // A shared link or bookmark: the deep page IS the first entry, so there is
    // no in-app history to pop.
    app(['/tools/budget']);
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(screen.getByTestId('path')).toHaveTextContent('/');
  });
});
