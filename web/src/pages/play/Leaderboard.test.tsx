import { render, screen, within } from '@testing-library/react';
import type { BingoDoc } from 'game-core';
import { Leaderboard } from './Leaderboard';

const at = new Date(2026, 5, 1, 15, 7).getTime();
const b = (seq: number, name: string, n: number): BingoDoc => ({ seq, seatId: name, name, line: 'row_0', playerBingoNumber: n, at, status: 'announced' });

describe('Leaderboard', () => {
  it('lists by seq with rank, name, #n and h:mm', () => {
    render(<Leaderboard bingos={[b(2, 'Cody', 2), b(1, 'Ann', 1)]} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Ann')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('1');
    expect(within(rows[0]).getByText('#1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('3:07')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Cody')).toBeInTheDocument();
  });
  it('has an empty state', () => {
    render(<Leaderboard bingos={[]} />);
    expect(screen.getByText('No bingos yet')).toBeInTheDocument();
  });
});
