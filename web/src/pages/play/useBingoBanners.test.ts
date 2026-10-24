import { act, renderHook } from '@testing-library/react';
import type { BingoDoc } from 'game-core';
import { useBingoBanners } from './useBingoBanners';

const b = (seq: number, seatId: string, name: string): BingoDoc => ({ seq, seatId, name, line: 'row_0', playerBingoNumber: 1, at: seq, status: 'announced' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useBingoBanners', () => {
  it('shows nothing for bingos present at first render', () => {
    const { result } = renderHook(({ bingos }) => useBingoBanners(bingos, 'me'), { initialProps: { bingos: [b(1, 'cody', 'Cody')] } });
    expect(result.current.current).toBeNull();
  });

  it('shows a later bingo by another seat, not my own', () => {
    const { result, rerender } = renderHook(({ bingos }) => useBingoBanners(bingos, 'me'), { initialProps: { bingos: [] as BingoDoc[] } });
    rerender({ bingos: [b(1, 'me', 'Me')] });
    expect(result.current.current).toBeNull();
    rerender({ bingos: [b(1, 'me', 'Me'), b(2, 'cody', 'Cody')] });
    expect(result.current.current?.name).toBe('Cody');
  });

  it('queues three arriving together, 4 s each, and dismiss skips ahead', () => {
    const { result, rerender } = renderHook(({ bingos }) => useBingoBanners(bingos, 'me'), { initialProps: { bingos: [] as BingoDoc[] } });
    rerender({ bingos: [b(1, 'a', 'Ann'), b(2, 'c', 'Cody'), b(3, 'd', 'Dee')] });
    expect(result.current.current?.name).toBe('Ann');
    act(() => { vi.advanceTimersByTime(3999); });
    expect(result.current.current?.name).toBe('Ann');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.current?.name).toBe('Cody');
    act(() => { result.current.dismiss(); });
    expect(result.current.current?.name).toBe('Dee');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.current).toBeNull();
  });

  it('does not re-announce a bingo already seen', () => {
    const { result, rerender } = renderHook(({ bingos }) => useBingoBanners(bingos, 'me'), { initialProps: { bingos: [] as BingoDoc[] } });
    rerender({ bingos: [b(1, 'a', 'Ann')] });
    act(() => { vi.advanceTimersByTime(4000); });
    rerender({ bingos: [b(1, 'a', 'Ann')] });
    expect(result.current.current).toBeNull();
  });

  it('exposes the ordered visible queue, front first', () => {
    const { result, rerender } = renderHook(({ bingos }) => useBingoBanners(bingos, 'me'), { initialProps: { bingos: [] as BingoDoc[] } });
    rerender({ bingos: [b(3, 'd', 'Dee'), b(1, 'a', 'Ann'), b(2, 'me', 'Me'), b(4, 'c', 'Cody')] });
    expect(result.current.queue.map((x) => x.name)).toEqual(['Ann', 'Dee', 'Cody']);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current.queue.map((x) => x.name)).toEqual(['Dee', 'Cody']);
  });
});
