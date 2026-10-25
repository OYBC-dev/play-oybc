import { activeMention, mentionOptions } from './mentions';

describe('mentions helpers', () => {
  it('finds the partial before the caret', () => {
    expect(activeMention('hi @co', 6)).toEqual({ start: 3, partial: 'co' });
    expect(activeMention('a@co', 4)).toBeNull();
    expect(mentionOptions(activeMention('hi @co there', 12)!.partial, ['Cody'])).toEqual([]);
  });
  it('filters options by prefix and appends someone / anyone', () => {
    expect(mentionOptions('', ['Cody', 'Pat'])).toEqual(['Cody', 'Pat', 'someone', 'anyone']);
    expect(mentionOptions('an', ['Cody', 'Anna'])).toEqual(['Anna', 'anyone']);
  });
  // game-core's scanner lets the longest match win, so a seat named "Someone Else" is
  // mentionable; the picker must keep offering it ahead of the keyword, and keep the keywords.
  it('offers a seat name longer than a keyword first', () => {
    expect(activeMention('@Someone E', 10)?.partial).toBe('Someone E');
    expect(mentionOptions('Someone E', ['Someone Else'])).toEqual(['Someone Else']);
    expect(mentionOptions('someone', ['Someone Else', 'Pat'])).toEqual(['Someone Else', 'someone']);
    expect(mentionOptions('any', ['Someone Else'])).toEqual(['anyone']);
  });
  it('keeps matching a multi-word name', () => {
    expect(activeMention('hi @Mary J', 10)).toEqual({ start: 3, partial: 'Mary J' });
    expect(mentionOptions('Mary J', ['Mary Jane', 'Pat'])).toEqual(['Mary Jane']);
    expect(activeMention('hi @ x', 6)).toBeNull();
  });
});
