import { act, render, screen } from '@testing-library/react';
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
    const marks = Array.from({ length: 25 }, (_, i) => i === 12 || i === 0);
    render(<BoardGrid board={board({ marks, completedLines: ['row_0'] })} onToggle={async () => ok} />);
    expect(screen.getAllByRole('button')).toHaveLength(25);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Free/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Task 0' })).toHaveAttribute('data-marked', 'true');
    expect(screen.getByRole('button', { name: 'Task 1' })).toHaveAttribute('data-marked', 'false');
    expect(screen.getByRole('button', { name: 'Task 4' })).toHaveAttribute('data-highlight', 'true');
    expect(screen.getByRole('button', { name: 'Task 5' })).toHaveAttribute('data-highlight', 'false');
  });

  it('tap calls onToggle and flips immediately; disabled while in flight', async () => {
    let resolve!: (r: ToggleMarkRes) => void;
    const onToggle = vi.fn(() => new Promise<ToggleMarkRes>((r) => { resolve = r; }));
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
    expect(onToggle).toHaveBeenCalledWith(3);
    expect(cell).toHaveAttribute('data-marked', 'true');
    expect(cell).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Task 4' })).not.toBeDisabled();
    await act(async () => { resolve(ok); });
    expect(cell).not.toBeDisabled();
  });

  it('dims only after 250 ms in flight, never hides', async () => {
    const onToggle = vi.fn(() => new Promise<ToggleMarkRes>(() => {}));
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
    expect(cell).toHaveAttribute('data-pending', 'false');
    act(() => { vi.advanceTimersByTime(260); });
    expect(cell).toHaveAttribute('data-pending', 'true');
    expect(cell).toBeVisible();
  });

  it('rolls back and shows the error when the call rejects', async () => {
    const onToggle = vi.fn(async () => { throw appError('invalid-cell'); });
    render(<BoardGrid board={board()} onToggle={onToggle} />);
    const cell = screen.getByRole('button', { name: 'Task 3' });
    await user().click(cell);
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

  it('readOnly cells are not tappable', () => {
    render(<BoardGrid board={board()} readOnly onToggle={async () => ok} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });
});
