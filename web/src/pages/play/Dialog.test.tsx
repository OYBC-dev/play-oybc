import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('is a labelled modal dialog that takes focus, traps Tab and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button">outside</button>
        <Dialog title="End the game?" onClose={onClose}>
          <button type="button">One</button>
          <button type="button">Two</button>
        </Dialog>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'End the game?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
