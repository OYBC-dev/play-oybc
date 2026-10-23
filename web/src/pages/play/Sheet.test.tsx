import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Sheet scrim', () => {
  it('ignores a scrim click right after opening, honours one after 400 ms', () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose}>body</Sheet>);
    const scrim = screen.getByRole('dialog').parentElement!;
    fireEvent.click(scrim);
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(401); });
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('Escape and Close work immediately', () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose}>body</Sheet>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
