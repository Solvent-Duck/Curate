// Content script for Curate extension.
// Filters content units on webpages using site adapters and surgical DOM removal.

let blacklistState = CurateCore.compileBlacklist([]);
let observer = null;
let processTimer = null;
let lastHref = window.location.href;
let debugEnabled = false;
let pausedSites = [];
let lastProcessSummary = null;

const removedEntries = new Map();
let removalCounter = 0;

const MAX_PAGE_TEXT_LENGTH = 12000;
const SEARCH_RESULT_HOSTS = ['google.', 'bing.com', 'duckduckgo.com'];
const GENERIC_ITEM_SELECTORS = [
  'article',
  '[role="article"]',
  'main li',
  '.post',
  '.story',
  '.card',
  '.news-item',
  '.feed-item',
  '.list-item',
  '.result',
  '.search-result',
  '.comment'
].join(', ');

const siteAdapters = [
  {
    id: 'youtube',
    matches: (host) => host.includes('youtube.com'),
    isSearchPage: () => window.location.pathname === '/results',
    itemSelectors: [
      'ytd-rich-grid-row #content.ytd-rich-item-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-playlist-renderer',
      'ytd-channel-renderer',
      'ytd-reel-item-renderer',
      'yt-lockup-view-model',
      'ytd-rich-grid-media'
    ],
    pageTextSelectors: ['h1', '#title', '#description', 'main']
  },
  {
    id: 'reddit',
    matches: (host) => host.includes('reddit.com'),
    isSearchPage: () => window.location.pathname.includes('/search') || window.location.search.includes('q='),
    itemSelectors: [
      '[data-testid="post-container"]',
      '[data-testid="comment"]',
      '[data-testid="search-post-unit"]',
      'shreddit-post',
      'shreddit-comment',
      'article',
      'faceplate-tracker'
    ],
    pageTextSelectors: ['main', 'h1', 'article']
  },
  {
    id: 'google-search',
    matches: (host) => host.includes('google.'),
    isSearchPage: () => window.location.pathname === '/search',
    itemSelectors: ['div.g', 'div[data-hveid]', '[data-snc]', '[data-ved]', 'div.MjjYud'],
    pageTextSelectors: ['#search', 'title']
  },
  {
    id: 'bing-search',
    matches: (host) => host.includes('bing.com'),
    isSearchPage: () => window.location.pathname.startsWith('/search'),
    itemSelectors: ['li.b_algo', 'li.b_ans', '.b_ad', '.b_algo'],
    pageTextSelectors: ['#b_content', 'title']
  },
  {
    id: 'duckduckgo-search',
    matches: (host) => host.includes('duckduckgo.com'),
    isSearchPage: () => window.location.pathname === '/' && window.location.search.includes('q='),
    itemSelectors: ['article', '[data-testid="result"]', '.result', '.results_links', '[data-layout="organic"]'],
    pageTextSelectors: ['main', 'title']
  },
  {
    id: 'generic-news',
    matches: () => true,
    isSearchPage: () => {
      const host = window.location.hostname.toLowerCase();
      if (SEARCH_RESULT_HOSTS.some((needle) => host.includes(needle))) {
        return true;
      }
      return window.location.pathname.includes('/search') || window.location.search.includes('q=');
    },
    itemSelectors: ['article', '[role="article"]', '.post', '.story', '.card', '.news-item', '.result', 'li'],
    pageTextSelectors: ['main', 'article', 'title']
  }
];

function logDebug(message, payload) {
  if (!debugEnabled) {
    return;
  }
  console.debug('[Curate]', message, payload || '');
}

function getCurrentHostname() {
  return CurateCore.normalizeHostname(window.location.hostname);
}

function isPausedForCurrentSite() {
  const hostname = getCurrentHostname();
  return hostname && pausedSites.includes(hostname);
}

function getCurrentAdapter() {
  const host = window.location.hostname.toLowerCase();
  return siteAdapters.find((adapter) => adapter.matches(host)) || siteAdapters[siteAdapters.length - 1];
}

function getVisibleText(element) {
  if (!element) {
    return '';
  }
  return CurateCore.normalizeWhitespace(element.innerText || element.textContent || '');
}

function collectUrls(element) {
  if (!element) {
    return [];
  }

  const urls = new Set();

  if (element.href) {
    urls.add(element.href);
  }

  element.querySelectorAll('a[href]').forEach((link) => {
    urls.add(link.href || link.getAttribute('href'));
  });

  return Array.from(urls).filter(Boolean);
}

function getPageText(adapter) {
  const parts = [];
  const selectors = adapter.pageTextSelectors || ['main', 'article', 'body'];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      const text = getVisibleText(node);
      if (text) {
        parts.push(text);
      }
    });
  });

  if (!parts.length) {
    parts.push(getVisibleText(document.body));
  }

  return CurateCore.normalizeWhitespace(parts.join(' ')).slice(0, MAX_PAGE_TEXT_LENGTH);
}

function ensureBlockOverlay() {
  let overlay = document.getElementById('curate-full-block-overlay');
  let style = document.getElementById('curate-full-block-style');

  if (!style) {
    style = document.createElement('style');
    style.id = 'curate-full-block-style';
    style.textContent = 'body.curate-page-blocked > :not(#curate-full-block-overlay):not(script):not(style){display:none !important;}';
    document.documentElement.appendChild(style);
  }

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'curate-full-block-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:32px',
      'background:#fff',
      'color:#111',
      'font-family:Arial,sans-serif',
      'text-align:center'
    ].join(';');
    document.body.appendChild(overlay);
  }

  return overlay;
}

function clearBlockOverlay() {
  document.body.classList.remove('curate-page-blocked');
  const overlay = document.getElementById('curate-full-block-overlay');
  if (overlay) {
    overlay.remove();
  }
  const style = document.getElementById('curate-full-block-style');
  if (style) {
    style.remove();
  }
}

function applyFullPageBlock(reason) {
  const overlay = ensureBlockOverlay();
  overlay.innerHTML = '';

  const card = document.createElement('div');
  card.style.maxWidth = '520px';

  const heading = document.createElement('h2');
  heading.textContent = 'Content Blocked';

  const text = document.createElement('p');
  text.textContent = 'This page matched a full-block term: "' + reason.term + '".';

  card.appendChild(heading);
  card.appendChild(text);
  overlay.appendChild(card);
  document.body.classList.add('curate-page-blocked');
}

function ensureDebugBadge() {
  let badge = document.getElementById('curate-debug-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'curate-debug-badge';
    badge.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:2147483646',
      'max-width:320px',
      'padding:10px 12px',
      'border-radius:12px',
      'background:rgba(24,32,24,0.92)',
      'color:#f5f7f3',
      'font:12px/1.4 Arial,sans-serif',
      'box-shadow:0 10px 24px rgba(0,0,0,0.18)'
    ].join(';');
    document.body.appendChild(badge);
  }
  return badge;
}

function updateDebugBadge(summary) {
  const existing = document.getElementById('curate-debug-badge');
  if (!debugEnabled) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const badge = ensureDebugBadge();
  badge.textContent = [
    'Curate',
    'site=' + summary.adapterId,
    'removed=' + summary.removedCount,
    'candidates=' + summary.candidateCount,
    'paused=' + summary.paused
  ].join(' | ');
}

function evaluateFullPageBlock(adapter) {
  if (!blacklistState.fullTerms.length) {
    clearBlockOverlay();
    return false;
  }

  const urlMatch = CurateCore.matchUrl(window.location.href, blacklistState.fullTerms);
  if (urlMatch) {
    applyFullPageBlock(urlMatch);
    return true;
  }

  const titleMatch = CurateCore.matchText(document.title, blacklistState.fullTerms);
  if (titleMatch) {
    applyFullPageBlock(titleMatch);
    return true;
  }

  const pageTextMatch = CurateCore.matchText(getPageText(adapter), blacklistState.fullTerms);
  if (pageTextMatch) {
    applyFullPageBlock(pageTextMatch);
    return true;
  }

  clearBlockOverlay();
  return false;
}

function elementMatchesSelectors(element, selectors) {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch (error) {
      return false;
    }
  });
}

function collectCandidateItems(root, adapter) {
  const selectors = Array.from(new Set([...(adapter.itemSelectors || []), GENERIC_ITEM_SELECTORS]));
  const candidates = new Set();
  const isElementRoot = root && root.nodeType === Node.ELEMENT_NODE;

  selectors.forEach((selector) => {
    try {
      if (isElementRoot && elementMatchesSelectors(root, [selector])) {
        candidates.add(root);
      }
      (root || document).querySelectorAll(selector).forEach((node) => {
        if (node instanceof Element) {
          candidates.add(node);
        }
      });
    } catch (error) {
      logDebug('Skipping invalid selector', selector);
    }
  });

  const filtered = Array.from(candidates)
    .filter((node) => document.body.contains(node))
    .filter((node) => !node.closest('#curate-full-block-overlay'))
    .sort((a, b) => getDomDepth(b) - getDomDepth(a));

  return filtered.filter((node, index) => {
    return !filtered.some((otherNode, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }
      if (getDomDepth(otherNode) <= getDomDepth(node)) {
        return false;
      }
      return node.contains(otherNode) && getVisibleText(otherNode).length > 0;
    });
  });
}

function getDomDepth(node) {
  let depth = 0;
  let current = node;
  while (current && current !== document.body) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function evaluateContentMatch(item) {
  const text = getVisibleText(item);
  return CurateCore.matchText(text, blacklistState.itemTerms);
}

function evaluateSearchMatch(item, adapter) {
  if (!adapter.isSearchPage() || !blacklistState.searchTerms.length) {
    return null;
  }

  const text = getVisibleText(item);
  const textMatch = CurateCore.matchText(text, blacklistState.searchTerms);
  if (textMatch) {
    return textMatch;
  }

  const urls = collectUrls(item);
  for (const url of urls) {
    const urlMatch = CurateCore.matchUrl(url, blacklistState.searchTerms);
    if (urlMatch) {
      return urlMatch;
    }
  }

  return null;
}

function isSeparatorNode(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.matches('hr, [role="separator"]')) {
    return true;
  }

  const className = typeof node.className === 'string' ? node.className.toLowerCase() : '';
  return className.includes('separator') || className.includes('divider');
}

function removeAdjacentSeparators(placeholder) {
  const previous = placeholder.previousElementSibling;
  const next = placeholder.nextElementSibling;

  if (isSeparatorNode(previous)) {
    previous.remove();
  }
  if (isSeparatorNode(next)) {
    next.remove();
  }
}

function removeItem(item, reason) {
  if (!(item instanceof Element) || item.hasAttribute('data-curate-removed')) {
    return;
  }

  const id = 'curate-' + (++removalCounter);
  const placeholder = document.createComment(id);
  const parent = item.parentNode;
  if (!parent) {
    return;
  }

  removedEntries.set(id, {
    placeholder: placeholder,
    element: item
  });

  item.setAttribute('data-curate-removed', 'true');
  parent.replaceChild(placeholder, item);
  removeAdjacentSeparators(placeholder);
  logDebug('Removed content item', CurateCore.describeMatch('item', reason));
}

function restoreRemovedItems() {
  removedEntries.forEach((entry) => {
    if (!entry.placeholder.parentNode) {
      return;
    }
    entry.element.removeAttribute('data-curate-removed');
    entry.placeholder.parentNode.replaceChild(entry.element, entry.placeholder);
  });
  removedEntries.clear();
}

function processRoot(root) {
  if (!document.body) {
    return;
  }

  if (isPausedForCurrentSite()) {
    lastProcessSummary = {
      adapterId: getCurrentAdapter().id,
      removedCount: 0,
      candidateCount: 0,
      paused: true
    };
    clearBlockOverlay();
    restoreRemovedItems();
    updateDebugBadge(lastProcessSummary);
    return;
  }

  const adapter = getCurrentAdapter();
  if (evaluateFullPageBlock(adapter)) {
    lastProcessSummary = {
      adapterId: adapter.id,
      removedCount: 0,
      candidateCount: 0,
      paused: false,
      blocked: true
    };
    updateDebugBadge(lastProcessSummary);
    return;
  }

  const candidates = collectCandidateItems(root || document, adapter);
  const processed = new Set();
  let removedCount = 0;

  candidates.forEach((item) => {
    if (processed.has(item) || !document.body.contains(item)) {
      return;
    }

    const contentMatch = evaluateContentMatch(item);
    const searchMatch = evaluateSearchMatch(item, adapter);
    const reason = contentMatch || searchMatch;

    if (reason) {
      removeItem(item, reason);
      processed.add(item);
      removedCount += 1;
    }
  });

  lastProcessSummary = {
    adapterId: adapter.id,
    removedCount: removedCount,
    candidateCount: candidates.length,
    paused: false
  };
  updateDebugBadge(lastProcessSummary);
}

function refilterDocument() {
  if (!document.body) {
    return;
  }

  clearBlockOverlay();
  restoreRemovedItems();
  processRoot(document);
}

function scheduleProcess(root) {
  if (processTimer) {
    clearTimeout(processTimer);
  }

  processTimer = setTimeout(() => {
    processRoot(root || document);
  }, 80);
}

function handleMutations(mutations) {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    refilterDocument();
    return;
  }

  let rootToProcess = null;

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        rootToProcess = rootToProcess || node;
      }
    });
  });

  if (rootToProcess) {
    scheduleProcess(rootToProcess);
  }
}

function setupObserver() {
  if (observer || !document.body) {
    return;
  }

  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function initializeFiltering() {
  browser.runtime.sendMessage({ action: 'getBlacklist' }).then((response) => {
    blacklistState = CurateCore.compileBlacklist(response.blacklist || []);
    debugEnabled = Boolean(response.debug);
    pausedSites = (response.pausedSites || []).map(CurateCore.normalizeHostname);
    refilterDocument();
    setupObserver();
  }).catch((error) => {
    console.error('Curate failed to initialize filtering', error);
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateState' || message.action === 'updateBlacklist') {
    blacklistState = CurateCore.compileBlacklist(message.blacklist || []);
    debugEnabled = Boolean(message.debug);
    pausedSites = (message.pausedSites || []).map(CurateCore.normalizeHostname);
    refilterDocument();
  }
  if (message.action === 'forceRefilter') {
    refilterDocument();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFiltering, { once: true });
} else {
  initializeFiltering();
}
