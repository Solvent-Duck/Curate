// Content script for Curate extension
// Filters content on webpages based on blacklisted terms

let blacklist = [];
let observer = null;

// Website-specific container detection presets
const websitePresets = {
  'reddit.com': {
    selectors: [
      '[data-testid="search-community"]',
      '[data-testid="post-container"]', 
      '[data-testid="comment"]',
      '[data-testid="subreddit"]',
      '.Post', '.Comment', '.SubredditItem'
    ],
    classPatterns: ['post', 'comment', 'subreddit', 'search'],
    dataTestPatterns: ['community', 'post', 'comment', 'subreddit']
  },
  'facebook.com': {
    selectors: [
      '[data-testid="post"]',
      '[data-testid="story"]',
      '[data-testid="feed_story"]',
      '.userContentWrapper',
      '.feed_story_',
      '.post'
    ],
    classPatterns: ['post', 'story', 'feed', 'content'],
    dataTestPatterns: ['post', 'story', 'feed']
  },
  'youtube.com': {
    selectors: [
      '#dismissible.style-scope.ytd-video-renderer',
      '#content.style-scope.ytd-rich-item-renderer',
      '.yt-lockup-view-model__metadata',
      '.ytd-video-renderer',
      '.ytd-compact-video-renderer',
      '.ytd-rich-item-renderer',
      '.ytd-channel-renderer',
    ],
    classPatterns: ['video', 'channel', 'playlist', 'renderer', 'dismissible', 'lockup', 'style-scope'],
    dataTestPatterns: ['video', 'channel']
  },
  'twitter.com': {
    selectors: [
      '[data-testid="tweet"]',
      '[data-testid="tweetText"]',
      '.tweet',
      '.timeline-item'
    ],
    classPatterns: ['tweet', 'timeline', 'status'],
    dataTestPatterns: ['tweet', 'status']
  }
};

// Generic container detection patterns
const genericPatterns = {
  selectors: [
    'article', 'section', '.post', '.entry', '.item', '.card', '.tile',
    '.news-item', '.story', '.content-item', '.feed-item', '.list-item',
    'li', '.comment', '.reply', '.tweet', '.status', '.update'
  ],
  classPatterns: ['post', 'entry', 'item', 'card', 'article', 'story', 'comment'],
  dataTestPatterns: ['post', 'comment', 'item', 'entry']
};

// Function to get current website preset
function getWebsitePreset() {
  const hostname = window.location.hostname.toLowerCase();
  
  // Check for exact matches first
  if (websitePresets[hostname]) {
    return websitePresets[hostname];
  }
  
  // Check for subdomain matches (e.g., old.reddit.com)
  for (const [domain, preset] of Object.entries(websitePresets)) {
    if (hostname.includes(domain)) {
      return preset;
    }
  }
  
  // Return generic patterns if no specific preset found
  return genericPatterns;
}

// Function to check if text contains any blacklisted terms
function containsBlacklistedTerms(text) {
  if (!text || !blacklist.length) return { found: false };
  
  const lowerText = text.toLowerCase();
  
  // Check each blacklist item
  for (const item of blacklist) {
    if (lowerText.includes(item.term)) {
      return { found: true, level: item.level };
    }
  }
  
  return { found: false };
}

// Function to check if URL contains blacklisted terms (for search level)
function urlContainsBlacklistedTerms(url) {
  if (!url || !blacklist.length) return { found: false };
  
  const lowerUrl = url.toLowerCase();
  
  // Check each blacklist item with search or full level
  for (const item of blacklist) {
    if ((item.level === 'search' || item.level === 'full') && lowerUrl.includes(item.term)) {
      return { found: true, level: item.level };
    }
  }
  
  return { found: false };
}

// Function to filter search results (for search level)
function filterSearchResults() {
  // Check if current page is a search results page
  const isSearchPage = window.location.href.includes('search') || 
                      window.location.href.includes('google.com') ||
                      window.location.href.includes('bing.com') ||
                      window.location.href.includes('duckduckgo.com') ||
                      window.location.href.includes('reddit.com/r/') ||
                      document.title.toLowerCase().includes('search');
  
  if (!isSearchPage) return;
  
  // Look for links and filter them based on URL content
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      const urlCheck = urlContainsBlacklistedTerms(href);
      if (urlCheck.found) {
        // Find the container for this link and hide it
        const linkContainer = findEntryContainer(link);
        if (linkContainer) {
          hideElement(linkContainer);
        }
      }
    }
  });
}

// Function to find the entry container for a given element
function findEntryContainer(element) {
  // Get the appropriate preset for the current website
  const preset = getWebsitePreset();
  
  // Start from the current element and work up the DOM tree (max 30 levels)
  let current = element;
  let levelsUp = 0;
  const maxLevels = 30;
  
  while (current && current !== document.body && levelsUp < maxLevels) {
    // Check if current element matches any preset selector
    for (const selector of preset.selectors) {
      if (current.matches(selector)) {
        return current;
      }
    }
    
    // Check if current element has a class that suggests it's an entry container
    if (current.className) {
      const className = current.className.toLowerCase();
      for (const pattern of preset.classPatterns) {
        if (className.includes(pattern)) {
          return current;
        }
      }
    }
    
    // Check for data-testid attributes
    if (current.getAttribute('data-testid')) {
      const testId = current.getAttribute('data-testid').toLowerCase();
      for (const pattern of preset.dataTestPatterns) {
        if (testId.includes(pattern)) {
          return current;
        }
      }
    }
    
    // Move up to parent and increment counter
    current = current.parentElement;
    levelsUp++;
  }
  
  // If no specific entry container found within 30 levels, return the element itself
  return element;
}

// Function to check if an element or its descendants contain blacklisted terms
function elementContainsBlacklistedTerms(element) {
  // Check direct text content
  const textContent = element.textContent || '';
  if (textContent.trim()) {
    const textCheck = containsBlacklistedTerms(textContent);
    if (textCheck.found) {
      return textCheck;
    }
  }
  
  // Check child elements recursively
  const children = element.querySelectorAll('*');
  for (const child of children) {
    const childText = child.textContent || '';
    if (childText.trim()) {
      const childCheck = containsBlacklistedTerms(childText);
      if (childCheck.found) {
        return childCheck;
      }
    }
  }
  
  return { found: false };
}

// Function to hide an element
function hideElement(element) {
  if (element && !element.hasAttribute('data-curate-hidden')) {
    element.setAttribute('data-curate-hidden', 'true');
    element.style.display = 'none';
  }
}

// Function to show a previously hidden element
function showElement(element) {
  if (element && element.hasAttribute('data-curate-hidden')) {
    element.removeAttribute('data-curate-hidden');
    element.style.display = '';
  }
}

// Function to filter content on the page
function filterContent() {
  // Check URL first for search/full level filtering
  const urlCheck = urlContainsBlacklistedTerms(window.location.href);
  if (urlCheck.found && urlCheck.level === 'full') {
    // Block the entire page for full level
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;"><h2>Content Blocked</h2><p>This page has been blocked due to blacklisted content.</p></div>';
    return;
  }
  
  // Filter search results for search level
  filterSearchResults();
  
  // Get all text nodes that might contain blacklisted terms
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const processedContainers = new Set();
  let node;
  
  while (node = walker.nextNode()) {
    // Skip if already processed or hidden
    if (node.parentElement && node.parentElement.hasAttribute('data-curate-hidden')) {
      continue;
    }
    
    const textContent = node.textContent.trim();
    if (textContent) {
      const textCheck = containsBlacklistedTerms(textContent);
      if (textCheck.found) {
        // Find the entry container for this text node
        const entryContainer = findEntryContainer(node.parentElement);
        
        // Skip if already processed
        if (processedContainers.has(entryContainer)) {
          continue;
        }
        
        // Check if the entry container contains blacklisted terms
        if (entryContainer) {
          const containerCheck = elementContainsBlacklistedTerms(entryContainer);
          if (containerCheck.found) {
            // Hide the entire entry container
            hideElement(entryContainer);
            processedContainers.add(entryContainer);
          }
        }
      }
    }
  }
}

// Function to restore previously hidden content
function restoreContent() {
  const hiddenElements = document.querySelectorAll('[data-curate-hidden]');
  hiddenElements.forEach(element => {
    showElement(element);
  });
}

// Function to re-filter content (called when blacklist is updated)
function reFilterContent() {
  restoreContent();
  filterContent();
}

// Initialize content filtering
function initializeFiltering() {
  // Get the current blacklist
  browser.runtime.sendMessage({ action: "getBlacklist" }).then((response) => {
    blacklist = response.blacklist || [];
    filterContent();
  });
}

// Set up mutation observer to watch for dynamic content changes
function setupObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    let shouldRefilter = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added nodes contain text
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            const textCheck = containsBlacklistedTerms(node.textContent);
            if (textCheck.found) {
              shouldRefilter = true;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added element or its descendants contain blacklisted terms
            const textContent = node.textContent || '';
            if (textContent.trim()) {
              const textCheck = containsBlacklistedTerms(textContent);
              if (textCheck.found) {
                shouldRefilter = true;
              }
            }
          }
        });
      }
    });
    
    if (shouldRefilter) {
      // Use a small delay to ensure all content is loaded
      setTimeout(() => {
        filterContent();
      }, 100);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "updateBlacklist") {
    blacklist = message.blacklist || [];
    reFilterContent();
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeFiltering();
    setupObserver();
  });
} else {
  initializeFiltering();
  setupObserver();
}

// Also run when page is fully loaded (for dynamic content)
window.addEventListener('load', () => {
  setTimeout(() => {
    filterContent();
  }, 500);
});

