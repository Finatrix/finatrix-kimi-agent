import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import ToolRoute from '../tools/ToolRoute';
import { Breadcrumb } from '../components/Breadcrumb';

describe('invalid tool routes', () => {
  for (const slug of ['__proto__', 'constructor', 'toString', 'not-a-tool']) {
    it(`safely handles /tools/${slug}`, async () => {
      render(<MemoryRouter initialEntries={[`/tools/${slug}`]}>
        <Routes>
          <Route path="/tools/:toolId" element={<ToolRoute />} />
          <Route path="/tools" element={<h1>Choose a tool</h1>} />
        </Routes>
      </MemoryRouter>);
      expect(await screen.findByRole('heading', { name: 'Choose a tool' })).toBeInTheDocument();
    });
  }
});

describe('breadcrumb hierarchy', () => {
  it('links the workspace crumb to its section rather than repeating Home', () => {
    render(<MemoryRouter><Breadcrumb current="Job search" parent={{ label: 'Careers', to: '/careers/dashboard' }} /></MemoryRouter>);
    const nav = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(nav.getByRole('link', { name: 'Careers' })).toHaveAttribute('href', '/careers/dashboard');
    expect(nav.getAllByRole('link')).toHaveLength(2);
    expect(nav.getByText('Job search')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps top-level pages directly under Home', () => {
    render(<MemoryRouter><Breadcrumb current="Privacy" /></MemoryRouter>);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAccessibleName('Home');
  });
});
