(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CurateCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_VERSION = 2;
  const LEVEL_PRIORITY = {
    content: 1,
    search: 2,
    full: 3
  };
  const VALID_LEVELS = new Set(Object.keys(LEVEL_PRIORITY));

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeTerm(value) {
    return normalizeWhitespace(value).toLowerCase();
  }

  function normalizeHostname(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isAlphaNumeric(char) {
    return /[a-z0-9]/i.test(char);
  }

  function makePhraseRegex(term) {
    const normalizedTerm = normalizeTerm(term);
    if (!normalizedTerm) {
      return null;
    }

    const tokens = normalizedTerm.split(' ').filter(Boolean).map(escapeRegex);
    if (!tokens.length) {
      return null;
    }

    const pattern = tokens.join('\\s+');
    const startsWord = isAlphaNumeric(normalizedTerm[0]);
    const endsWord = isAlphaNumeric(normalizedTerm[normalizedTerm.length - 1]);
    const prefix = startsWord ? '(^|[^a-z0-9])' : '';
    const suffix = endsWord ? '(?=$|[^a-z0-9])' : '';

    return new RegExp(prefix + '(' + pattern + ')' + suffix, 'i');
  }

  function makeUrlNeedle(term) {
    return normalizeTerm(term).replace(/\s+/g, '');
  }

  function isValidLevel(level) {
    return VALID_LEVELS.has(level);
  }

  function strongerLevel(levelA, levelB) {
    if (!levelA) {
      return levelB;
    }
    if (!levelB) {
      return levelA;
    }
    return LEVEL_PRIORITY[levelA] >= LEVEL_PRIORITY[levelB] ? levelA : levelB;
  }

  function migrateBlacklist(input) {
    const source = Array.isArray(input) ? input : [];
    const deduped = new Map();

    source.forEach((entry) => {
      const term = normalizeTerm(entry && entry.term);
      const level = isValidLevel(entry && entry.level) ? entry.level : 'content';

      if (!term || term.length < 2) {
        return;
      }

      const existing = deduped.get(term);
      deduped.set(term, {
        term: term,
        level: strongerLevel(existing && existing.level, level)
      });
    });

    return Array.from(deduped.values()).sort((a, b) => {
      if (LEVEL_PRIORITY[b.level] !== LEVEL_PRIORITY[a.level]) {
        return LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level];
      }
      return a.term.localeCompare(b.term);
    });
  }

  function compileEntry(entry) {
    return {
      term: entry.term,
      level: entry.level,
      textRegex: makePhraseRegex(entry.term),
      urlNeedle: makeUrlNeedle(entry.term)
    };
  }

  function compileBlacklist(entries) {
    const normalized = migrateBlacklist(entries);
    const compiled = normalized.map(compileEntry);

    return {
      entries: normalized,
      compiled: compiled,
      itemTerms: compiled.filter((entry) => entry.level === 'content' || entry.level === 'full'),
      searchTerms: compiled.filter((entry) => entry.level === 'search' || entry.level === 'full'),
      fullTerms: compiled.filter((entry) => entry.level === 'full')
    };
  }

  function matchText(text, terms) {
    const normalizedText = normalizeWhitespace(text);
    if (!normalizedText) {
      return null;
    }

    for (const term of terms || []) {
      if (term.textRegex && term.textRegex.test(normalizedText)) {
        return {
          term: term.term,
          level: term.level,
          context: 'text'
        };
      }
    }

    return null;
  }

  function normalizeUrlText(url) {
    try {
      return decodeURIComponent(String(url || '')).toLowerCase().replace(/\s+/g, '');
    } catch (error) {
      return String(url || '').toLowerCase().replace(/\s+/g, '');
    }
  }

  function matchUrl(url, terms) {
    const haystack = normalizeUrlText(url);
    if (!haystack) {
      return null;
    }

    for (const term of terms || []) {
      if (term.urlNeedle && haystack.includes(term.urlNeedle)) {
        return {
          term: term.term,
          level: term.level,
          context: 'url'
        };
      }
    }

    return null;
  }

  function describeMatch(source, match) {
    if (!match) {
      return null;
    }

    return {
      source: source,
      term: match.term,
      level: match.level,
      context: match.context
    };
  }

  return {
    STORAGE_VERSION: STORAGE_VERSION,
    VALID_LEVELS: Array.from(VALID_LEVELS),
    LEVEL_PRIORITY: LEVEL_PRIORITY,
    normalizeWhitespace: normalizeWhitespace,
    normalizeTerm: normalizeTerm,
    normalizeHostname: normalizeHostname,
    isValidLevel: isValidLevel,
    migrateBlacklist: migrateBlacklist,
    compileBlacklist: compileBlacklist,
    matchText: matchText,
    matchUrl: matchUrl,
    describeMatch: describeMatch
  };
}));
