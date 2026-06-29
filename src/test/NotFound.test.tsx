import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import NotFound from '../pages/NotFound';

describe('NotFound', () => {
  it('shows a 404 message and a working link home', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText(/Error 404/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
