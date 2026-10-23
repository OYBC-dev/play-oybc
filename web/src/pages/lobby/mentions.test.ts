import { activeMention, findUnknownMention, mentionOptions } from './mentions';

describe('mentions helpers', () => {
  it('finds the partial before the caret', () => {
    expect(activeMention('hi @co', 6)).toEqual({ start: 3, partial: 'co' });
    expect(activeMention('a@co', 4)).toBeNull();
    expect(activeMention('hi @co there', 12)).toBeNull();
  });
  it('filters options by prefix and appends someone / anyone', () => {
    expect(mentionOptions('', ['Cody', 'Pat'])).toEqual(['Cody', 'Pat', 'someone', 'anyone']);
    expect(mentionOptions('an', ['Cody', 'Anna'])).toEqual(['Anna', 'anyone']);
  });
  it('reports the first unresolved mention', () => {
    expect(findUnknownMention('@Cody and @Bob', ['Cody'])).toBe('@Bob');
    expect(findUnknownMention('@someone @Cody', ['Cody'])).toBeNull();
    expect(findUnknownMention('mail a@b.com', ['Cody'])).toBeNull();
  });
});
