import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AmountInput } from '../tools/ui/AmountInput';

beforeEach(cleanup);

it('clears validation when the owner replaces an invalid draft with a saved amount', () => {
  const onChange = vi.fn();
  const { rerender } = render(<AmountInput id="amount" ariaLabel="Amount" sym="$" value="20+" onChange={onChange} />);
  fireEvent.blur(screen.getByLabelText('Amount'));
  expect(screen.getByRole('status')).toHaveTextContent('This formula is incomplete.');

  rerender(<AmountInput id="amount" ariaLabel="Amount" sym="$" value="20" onChange={onChange} />);
  expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'false');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
