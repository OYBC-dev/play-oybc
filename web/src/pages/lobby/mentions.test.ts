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
  it('keeps matching a multi-word name', () => {
    expect(activeMention('hi @Mary J', 10)).toEqual({ start: 3, partial: 'Mary J' });
    expect(mentionOptions('Mary J', ['Mary Jane', 'Pat'])).toEqual(['Mary Jane']);
    expect(activeMention('hi @ x', 6)).toBeNull();
  });
});
