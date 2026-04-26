import {
  deduplicateHashtags,
  mergeMultiLanguageHashtags,
  HashtagGenerationResult,
} from '../hashtagGeneratorService';

const makeResult = (hashtags: string[]): HashtagGenerationResult => ({
  platform: 'generic',
  source: 'heuristic',
  hashtags,
  analysis: { keywords: [], trendMatches: [], textLength: 0, aiUsed: false },
});

describe('deduplicateHashtags', () => {
  it('removes exact duplicates', () => {
    expect(deduplicateHashtags(['#Marketing', '#Marketing', '#Growth'])).toEqual([
      '#Marketing',
      '#Growth',
    ]);
  });

  it('removes case-insensitive duplicates, keeping first occurrence casing', () => {
    expect(deduplicateHashtags(['#Marketing', '#marketing', '#MARKETING'])).toEqual(['#Marketing']);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateHashtags([])).toEqual([]);
  });

  it('preserves order of first occurrences', () => {
    expect(deduplicateHashtags(['#B', '#A', '#b', '#C'])).toEqual(['#B', '#A', '#C']);
  });
});

describe('mergeMultiLanguageHashtags', () => {
  it('merges and deduplicates overlapping hashtags across two languages', () => {
    const en = makeResult(['#ContentCreator', '#Marketing', '#Growth']);
    const es = makeResult(['#marketing', '#Crecimiento', '#ContentCreator']);

    const result = mergeMultiLanguageHashtags([en, es]);

    expect(result).toEqual(['#ContentCreator', '#Marketing', '#Growth', '#Crecimiento']);
  });

  it('respects maxTags limit', () => {
    const en = makeResult(['#A', '#B', '#C']);
    const es = makeResult(['#D', '#E', '#F']);

    expect(mergeMultiLanguageHashtags([en, es], 4)).toHaveLength(4);
  });

  it('returns empty array when given no results', () => {
    expect(mergeMultiLanguageHashtags([])).toEqual([]);
  });

  it('handles a single language result without duplicating', () => {
    const en = makeResult(['#Growth', '#growth']);
    expect(mergeMultiLanguageHashtags([en])).toEqual(['#Growth']);
  });
});
