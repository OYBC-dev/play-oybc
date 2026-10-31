import { segments } from './mentionSegments';

describe('segments', () => {
  it('no refs is one plain run', () => {
    expect(segments('Read a book')).toEqual([{ text: 'Read a book', ref: false }]);
    expect(segments('Read a book', [])).toEqual([{ text: 'Read a book', ref: false }]);
  });
  it('splits around each range', () => {
    expect(segments('Cody hugs Pat today', [[10, 13], [0, 4]])).toEqual([
      { text: 'Cody', ref: true },
      { text: ' hugs ', ref: false },
      { text: 'Pat', ref: true },
      { text: ' today', ref: false },
    ]);
  });
  it('a range covering the whole text is one bold run', () => {
    expect(segments('Someone', [[0, 7]])).toEqual([{ text: 'Someone', ref: true }]);
  });
  it('clamps out-of-range and drops empty or overlapping ranges', () => {
    expect(segments('Ann sings', [[0, 3], [1, 2], [5, 5], [4, 99]])).toEqual([
      { text: 'Ann', ref: true },
      { text: ' ', ref: false },
      { text: 'sings', ref: true },
    ]);
  });
  it('the empty string has no runs', () => {
    expect(segments('', [[0, 1]])).toEqual([]);
  });
});
