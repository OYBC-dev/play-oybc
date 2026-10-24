import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardDoc, ToggleMarkRes } from 'game-core';
import { appError } from '../../game/fakeGameClient';
import { BoardGrid } from './BoardGrid';

function board(over: Partial<BoardDoc> = {}): BoardDoc {
  const cells = Array.from({ length: 25 }, (_, i) =>
    i === 12 ? ({ kind: 'free' } as const) : ({ kind: 'task', taskId: `t${i}`, text: `Task ${i}` } as const),
  );
  const marks = Array.from({ length: 25 }, (_, i) => i === 12);
  return { cells, marks, completedLines: [], announcedLines: [], ...over };
}
const ok: ToggleMarkRes = { marks: [], completedLines: [], newBingoSeqs: [] };
const user = () => userEvent.setup({ advanceTimers: (ms) => void vi.advanceTimersByTime(ms) });

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('BoardGrid', () => {
  it('renders 25 cells with a Free center; marked and highlighted styling', () => {
    const marks = Array.from({ length: 25 }, (_, i) => i === 12 || i < 5);
    render(<BoardGrid board={board({ marks, completedLines: ['row_0'] })} onToggle={async () => ok} />);
    expect(screen.getAllByRole('button')).toHaveLength(25);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Free/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Task 0' })).toHaveAttribute('data-marked', 'true');
    expect(screen.getByRole('button', { name: 'Task 6' })).toHaveAttribute('data-marked', 'false');
    expect(screen.getByRole('button', { name: 'Task 4' })).toHaveAttribute('data-highlight', 'true');
    expect(screen.getByRole('button', { name: 'Task 5' })).toHaveAttribute('data-highlight', 'false');
  });

  it('read-only cells ignore clicks', async () => {
    const onToggle = vi.fn(async () => ok);
    render(<BoardGrid board={board()} onToggle={onToggle} readOnly />);
    await user().click(screen.getByRole('button', { name: 'Task 3' }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('tap calls onToggle and flips immediately; disabled while in flight', async () => {
    let resolve!: (r: ToggleMarkRes) => void;
    const onToggle = vi.fn(() => new Promise<ToggleMarkRes>((r) => { resolve = r; }));
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
    expect(onToggle).toHaveBeenCalledWith(3, true);
    expect(cell).toHaveAttribute('data-marked', 'true');
    expect(cell).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Task 4' })).not.toBeDisabled();
    await act(async () => { resolve(ok); });
    expect(cell).not.toBeDisabled();
  });

  it('tapping a marked cell asks for marked=false', async () => {
    const onToggle = vi.fn(async () => ok);
    const marks = Array.from({ length: 25 }, (_, i) => i === 12 || i === 3);
    render(<BoardGrid board={board({ marks })} onToggle={onToggle} />);
    await user().click(screen.getByRole('button', { name: 'Task 3' }));
    expect(onToggle).toHaveBeenCalledWith(3, false);
  });

  it('marks a cell pending while in flight (CSS delays the dim 250 ms), never hides it', async () => {
    let resolve!: (r: ToggleMarkRes) => void;
    const onToggle = vi.fn(() => new Promise<ToggleMarkRes>((r) => { resolve = r; }));
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    expect(cell).toHaveAttribute('data-pending', 'false');
    await user().click(cell);
    expect(cell).toHaveAttribute('data-pending', 'true');
    expect(cell).toHaveAttribute('data-marked', 'true');
    expect(cell).toBeVisible();
    await act(async () => { resolve(ok); });
    expect(cell).toHaveAttribute('data-pending', 'false');
  });

  it('completed-line cells get the halftone overprint; Free never does', () => {
    const marks = Array.from({ length: 25 }, (_, i) => i < 5 || i === 12);
    render(<BoardGrid board={board({ marks, completedLines: ['row_0', 'col_2'] })} onToggle={async () => ok} />);
    expect(screen.getByRole('button', { name: 'Task 2' })).toHaveClass('riso-halftone');
    expect(screen.getByRole('button', { name: 'Task 2' })).toHaveAttribute('data-highlight', 'true');
    expect(screen.getByRole('button', { name: 'Task 7' })).not.toHaveClass('riso-halftone');
    const free = screen.getByRole('button', { name: 'Free' });
    expect(free).toHaveAttribute('data-free', 'true');
    expect(free).toHaveAttribute('data-highlight', 'false');
    expect(free).not.toHaveClass('riso-halftone');
  });

  it('rolls back and shows the error when the call rejects', async () => {
    const onToggle = vi.fn(async () => { throw appError('invalid-cell'); });
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
    await screen.findByRole('alert');
    expect(cell).toHaveAttribute('data-marked', 'false');
    expect(cell).not.toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('That square is not available');
  });

  it('snapshot marks win over the optimistic flip', async () => {
    const onToggle = vi.fn(async () => ok);
    const { rerender } = render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
    const marks = Array.from({ length: 25 }, (_, i) => i === 12);
    rerender(<BoardGrid board={board({ marks })} onToggle={onToggle} />);
    expect(cell).toHaveAttribute('data-marked', 'false');
  });

  it('readOnly cells do not toggle', async () => {
    const onToggle = vi.fn(async () => ok);
    render(<BoardGrid board={board()} readOnly onToggle={onToggle} />);
    await user().click(screen.getByRole('button', { name: 'Task 3' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Task 3' })).toHaveAttribute('aria-disabled', 'true');
  });

  describe('long press', () => {
    const long = 'x'.repeat(100) + ' full task text';
    const withLong = () => {
      const b = board();
      b.cells[3] = { kind: 'task', taskId: 't3', text: long };
      return b;
    };
    it('opens a detail sheet with the full text and does not toggle', () => {
      const onToggle = vi.fn(async () => ok);
      render(<BoardGrid board={withLong()} onToggle={onToggle} />);
      const cell = screen.getByRole('button', { name: long });
      fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 });
      act(() => { vi.advanceTimersByTime(460); });
      fireEvent.pointerUp(cell);
      fireEvent.click(cell);
      expect(screen.getByRole('dialog')).toHaveTextContent(long);
      expect(onToggle).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('a short press toggles once and opens nothing', () => {
      const onToggle = vi.fn(async () => ok);
      render(<BoardGrid board={board()} onToggle={onToggle} />);
      const cell = screen.getByRole('button', { name: 'Task 3' });
      fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 });
      act(() => { vi.advanceTimersByTime(200); });
      fireEvent.pointerUp(cell);
      fireEvent.click(cell);
      act(() => { vi.advanceTimersByTime(600); });
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('moving more than 10px cancels the long press', () => {
      render(<BoardGrid board={board()} onToggle={async () => ok} />);
      const cell = screen.getByRole('button', { name: 'Task 3' });
      fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 });
      fireEvent.pointerMove(cell, { clientX: 30, clientY: 5 });
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('works on a read-only board; Free has no detail', () => {
      render(<BoardGrid board={board()} readOnly onToggle={async () => ok} />);
      const cell = screen.getByRole('button', { name: 'Task 3' });
      fireEvent.pointerDown(cell, { clientX: 5, clientY: 5 });
      act(() => { vi.advanceTimersByTime(460); });
      expect(screen.getByRole('dialog')).toHaveTextContent('Task 3');
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Free' }));
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
