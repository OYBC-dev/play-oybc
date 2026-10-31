/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import type { Standing } from 'game-core';
import { Leaderboard, standingMeta } from './Leaderboard';

const s = (seatId: string, bingos: number, marked: number, bestLine: number): Standing =>
  ({ seatId, name: seatId, bingos, marked, bestLine, firstBingoSeq: bingos ? 1 : null });

describe('Leaderboard', () => {
  it('one row per standing in server order: rank, name, bingo pill, squares meta', () => {
    render(<Leaderboard standings={[s('Cody', 2, 14, 5), s('Ann', 1, 9, 5), s('Pat', 0, 7, 3)]} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => within(r).getByText(/^(Cody|Ann|Pat)$/).textContent)).toEqual(['Cody', 'Ann', 'Pat']);
    expect(within(rows[0]).getByText('1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2 bingos')).toBeInTheDocument();
    expect(within(rows[0]).getByText('14 squares')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1 bingo')).toBeInTheDocument();
    expect(within(rows[1]).getByText('9 squares')).toBeInTheDocument();
    expect(within(rows[2]).getByText('3')).toBeInTheDocument();
  });

  it('hides the pill at 0 bingos and adds the best line to the meta', () => {
    render(<Leaderboard standings={[s('Pat', 0, 7, 3)]} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('7 squares · 3 in a row')).toBeInTheDocument();
    expect(within(row).queryByText(/bingo/)).toBeNull();
  });

  it('says "1 square" at one mark and pluralises otherwise', () => {
    expect(standingMeta(s('Pat', 0, 1, 1))).toBe('1 square · 1 in a row');
    expect(standingMeta(s('Pat', 1, 1, 1))).toBe('1 square');
    expect(standingMeta(s('Pat', 0, 0, 0))).toBe('0 squares · 0 in a row');
  });

  it('has an empty state', () => {
    render(<Leaderboard standings={[]} />);
    expect(screen.getByText('No bingos yet')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('the pill is gold with ink-static text', () => {
    const css = readFileSync(`${process.cwd()}/src/pages/play/Leaderboard.module.css`, 'utf8');
    const block = css.slice(css.indexOf('.num {'), css.indexOf('}', css.indexOf('.num {')));
    expect(block).toContain('background: var(--riso-gold)');
    expect(block).toContain('color: var(--riso-ink-static)');
    render(<Leaderboard standings={[s('Ann', 1, 9, 5)]} />);
    expect(screen.getByText('1 bingo')).toHaveClass('num');
  });
});
