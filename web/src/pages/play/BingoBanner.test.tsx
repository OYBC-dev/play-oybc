import { act, render, screen } from '@testing-library/react';
import type { BingoDoc } from 'game-core';
import { useState } from 'react';
import { BingoBanner } from './BingoBanner';
import { makePieces } from './Confetti';
import { useBingoBanners } from './useBingoBanners';

const b = (seq: number, seatId: string, name: string): BingoDoc => ({ seq, seatId, name, line: 'row_0', playerBingoNumber: 1, at: seq, status: 'announced' });

function Harness({ initial }: { initial: BingoDoc[] }) {
  const [bingos, set] = useState(initial);
  (globalThis as { __set?: (x: BingoDoc[]) => void }).__set = set;
  const banner = useBingoBanners(bingos, 'me');
  return <BingoBanner queue={banner.queue} onDismiss={banner.dismiss} />;
}
const push = (x: BingoDoc[]) => act(() => (globalThis as unknown as { __set: (x: BingoDoc[]) => void }).__set(x));
const names = () => screen.getAllByTestId('bingo-banner').map((e) => e.textContent);

function mockMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => { vi.useFakeTimers(); mockMotion(false); });
afterEach(() => { vi.useRealTimers(); });

describe('BingoBanner stack', () => {
  it('renders three arrivals in order, front rotated, others offset and shrunk', () => {
    render(<Harness initial={[]} />);
    push([b(1, 'a', 'Ann'), b(2, 'c', 'Cody'), b(3, 'd', 'Dee')]);
    expect(names()).toEqual(['Ann got a bingo!', 'Cody got a bingo!', 'Dee got a bingo!']);
    const poses = screen.getAllByTestId('bingo-banner');
    expect(poses[0].style.transform).toBe('translateY(0px) scale(1) rotate(-1.2deg)');
    expect(poses[1].style.transform).toBe('translateY(12px) scale(0.955) rotate(0deg)');
    expect(poses[2].style.transform).toBe('translateY(24px) scale(0.91) rotate(0deg)');
  });

  it('dismisses each after 4 s and promotes the next, one confetti burst at a time', () => {
    render(<Harness initial={[]} />);
    push([b(1, 'a', 'Ann'), b(2, 'c', 'Cody'), b(3, 'd', 'Dee')]);
    expect(screen.getAllByTestId('confetti')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(names()).toEqual(['Cody got a bingo!', 'Dee got a bingo!']);
    expect(screen.getByTestId('bingo-announce')).toHaveTextContent('Cody got a bingo!');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(names()).toEqual(['Dee got a bingo!']);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByTestId('bingo-banner')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByTestId('bingo-banner-leaving')).toBeNull();
  });

  it('removes confetti from the DOM once the burst has landed', () => {
    render(<Harness initial={[]} />);
    push([b(1, 'a', 'Ann')]);
    expect(screen.getByTestId('confetti').children).toHaveLength(54);
    act(() => { vi.advanceTimersByTime(3800); });
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('suppresses own bingos and ignores a re-delivered doc', () => {
    render(<Harness initial={[]} />);
    push([b(1, 'me', 'Me')]);
    expect(screen.queryByTestId('bingo-banner')).toBeNull();
    push([b(1, 'me', 'Me'), b(2, 'a', 'Ann')]);
    push([b(1, 'me', 'Me'), b(2, 'a', 'Ann'), b(2, 'a', 'Ann')]);
    push([b(1, 'me', 'Me'), b(2, 'a', 'Ann')]);
    expect(names()).toEqual(['Ann got a bingo!']);
  });

  it('renders a 20-character name', () => {
    render(<Harness initial={[]} />);
    push([b(1, 'a', 'Bartholomew Longname')]);
    expect(screen.getByTestId('bingo-banner')).toHaveTextContent('Bartholomew Longname got a bingo!');
  });

  it('shows no confetti and swaps instantly under reduced motion', () => {
    mockMotion(true);
    render(<Harness initial={[]} />);
    push([b(1, 'a', 'Ann'), b(2, 'c', 'Cody')]);
    expect(screen.queryByTestId('confetti')).toBeNull();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(names()).toEqual(['Cody got a bingo!']);
    expect(screen.queryByTestId('bingo-banner-leaving')).toBeNull();
  });
});

describe('confetti pieces', () => {
  it('stay within the spec ranges and token colors', () => {
    const p = makePieces(7);
    expect(p).toHaveLength(54);
    for (const x of p) {
      expect(x.w).toBeGreaterThanOrEqual(6); expect(x.w).toBeLessThanOrEqual(12);
      expect(x.h).toBeGreaterThanOrEqual(9); expect(x.h).toBeLessThanOrEqual(17);
      expect(x.dur).toBeGreaterThanOrEqual(1.9); expect(x.dur).toBeLessThanOrEqual(3.2);
      expect(x.delay).toBeGreaterThanOrEqual(0); expect(x.delay).toBeLessThanOrEqual(520);
      expect(x.color).toMatch(/^--riso-(red|blue|gold|green|teal)$/);
    }
  });
});
