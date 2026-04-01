const test = require('node:test');
const assert = require('node:assert/strict');

const CurateCore = require('../core.js');

test('migrateBlacklist normalizes terms and keeps the strongest level', () => {
  const migrated = CurateCore.migrateBlacklist([
    { term: '  Spoilers  ', level: 'content' },
    { term: 'spoilers', level: 'full' },
    { term: 'x', level: 'search' },
    { term: '  ', level: 'full' }
  ]);

  assert.deepEqual(migrated, [
    { term: 'spoilers', level: 'full' }
  ]);
});

test('matchText uses word-aware phrase matching', () => {
  const compiled = CurateCore.compileBlacklist([
    { term: 'ai', level: 'content' },
    { term: 'machine learning', level: 'content' }
  ]);

  assert.equal(CurateCore.matchText('This post is about AI safety.', compiled.itemTerms).term, 'ai');
  assert.equal(CurateCore.matchText('A primer on machine    learning systems', compiled.itemTerms).term, 'machine learning');
  assert.equal(CurateCore.matchText('Paid media planning', compiled.itemTerms), null);
});

test('matchUrl matches normalized terms inside URLs', () => {
  const compiled = CurateCore.compileBlacklist([
    { term: 'spoilers', level: 'search' }
  ]);

  const match = CurateCore.matchUrl('https://example.com/movies/spoilers-ending-explained', compiled.searchTerms);
  assert.equal(match.term, 'spoilers');
  assert.equal(CurateCore.matchUrl('https://example.com/movies/reviews', compiled.searchTerms), null);
});

test('normalizeHostname strips scheme and www prefix', () => {
  assert.equal(CurateCore.normalizeHostname('https://www.YouTube.com/results?q=test'), 'youtube.com');
  assert.equal(CurateCore.normalizeHostname('old.reddit.com'), 'old.reddit.com');
});
