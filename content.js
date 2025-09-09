// Content script for Curate extension
// Filters content on webpages based on blacklisted terms

let blacklist = [];
let observer = null;

// Performance optimization: Cache for structural analysis
let structuralAnalysisCache = {
  containers: null,
  classFrequency: null,
  anchors: null,
  lastAnalysis: 0,
  cacheTimeout: 5000 // 5 seconds cache
};

// Performance optimization: Debounced analysis for large pages
let analysisTimeout = null;
const ANALYSIS_DEBOUNCE_MS = 1000;

// Website-specific container detection presets
const websitePresets = {
  'reddit.com': {
    selectors: [
      '[data-testid="search-community"]',
      '[data-testid="post-container"]', 
      '[data-testid="comment"]',
      '[data-testid="subreddit"]',
      '[data-testid="search-subreddit-desc-text"]',
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

// Function to find anchor elements that reliably exist in content items (optimized)
function findAnchorElements() {
  // Check cache first
  if (structuralAnalysisCache.anchors && 
      Date.now() - structuralAnalysisCache.lastAnalysis < structuralAnalysisCache.cacheTimeout) {
    return structuralAnalysisCache.anchors;
  }
  
  const anchors = [];
  
  // Common anchor patterns for content identification (ordered by likelihood)
  const anchorSelectors = [
    'article', 'section[class*="post"]', 'section[class*="item"]', // Semantic elements first
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // Headings
    '[data-testid*="title"]', '[data-testid*="heading"]', // Test IDs
    '.title', '.heading', '.headline', '.post-title', '.entry-title', // Common title classes
    'a[href*="read"]', 'a[href*="more"]', 'a[href*="view"]', // Read more links
    'img[alt]', 'img[src]', // Images with content
    '[role="article"]', '[role="listitem"]' // ARIA roles
  ];
  
  // Use more efficient querying for large pages
  const maxElements = 1000; // Limit to prevent performance issues
  let elementCount = 0;
  
  // Find all potential anchor elements
  for (const selector of anchorSelectors) {
    if (elementCount >= maxElements) break;
    
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (elementCount >= maxElements) break;
        
        // Only include elements that have meaningful content
        if (el.textContent.trim().length > 10 || el.tagName === 'IMG') {
          anchors.push(el);
          elementCount++;
        }
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }
  
  // Cache the results
  structuralAnalysisCache.anchors = anchors;
  structuralAnalysisCache.lastAnalysis = Date.now();
  
  return anchors;
}

// Function to find the Lowest Common Ancestor (LCA) of two elements
function findLowestCommonAncestor(element1, element2) {
  if (!element1 || !element2) return null;
  
  // Get all ancestors of element1
  const ancestors1 = new Set();
  let current = element1;
  while (current && current !== document.documentElement) {
    ancestors1.add(current);
    current = current.parentElement;
  }
  
  // Find the first common ancestor with element2
  current = element2;
  while (current && current !== document.documentElement) {
    if (ancestors1.has(current)) {
      return current;
    }
    current = current.parentElement;
  }
  
  return null;
}

// Function to analyze class frequency across the document (optimized)
function analyzeClassFrequency() {
  // Check cache first
  if (structuralAnalysisCache.classFrequency && 
      Date.now() - structuralAnalysisCache.lastAnalysis < structuralAnalysisCache.cacheTimeout) {
    return structuralAnalysisCache.classFrequency;
  }
  
  const classFrequency = new Map();
  
  // Use more efficient sampling for very large pages
  const maxElements = 2000; // Limit analysis to prevent performance issues
  const allElements = document.querySelectorAll('*');
  const totalElements = allElements.length;
  
  let elementsToProcess;
  if (totalElements > maxElements) {
    // Sample elements evenly across the page for large documents
    elementsToProcess = [];
    const step = Math.floor(totalElements / maxElements);
    for (let i = 0; i < totalElements; i += step) {
      elementsToProcess.push(allElements[i]);
    }
  } else {
    elementsToProcess = allElements;
  }
  
  elementsToProcess.forEach(element => {
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/);
      classes.forEach(className => {
        if (className.length > 2) { // Ignore very short class names
          classFrequency.set(className, (classFrequency.get(className) || 0) + 1);
        }
      });
    }
  });
  
  // Cache the results
  structuralAnalysisCache.classFrequency = classFrequency;
  structuralAnalysisCache.lastAnalysis = Date.now();
  
  return classFrequency;
}

// Function to validate if a container has structurally similar children
function validateContainerStructure(container, minChildren = 3) {
  if (!container || !container.children) return false;
  
  const children = Array.from(container.children);
  if (children.length < minChildren) return false;
  
  // Analyze structural similarity
  const tagCounts = new Map();
  const classCounts = new Map();
  const childElementCounts = [];
  
  children.forEach(child => {
    // Count tag types
    const tag = child.tagName.toLowerCase();
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    
    // Count classes
    if (child.className) {
      const classes = child.className.trim().split(/\s+/);
      classes.forEach(className => {
        if (className.length > 2) {
          classCounts.set(className, (classCounts.get(className) || 0) + 1);
        }
      });
    }
    
    // Count child elements
    childElementCounts.push(child.children.length);
  });
  
  // Check if most children have the same tag
  const mostCommonTag = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];
  
  const tagSimilarity = mostCommonTag[1] / children.length;
  
  // Check if there's a high-frequency class shared by many children
  const highFrequencyClasses = Array.from(classCounts.entries())
    .filter(([className, count]) => count >= Math.max(2, children.length * 0.3))
    .sort((a, b) => b[1] - a[1]);
  
  // Check child element count consistency
  const avgChildElements = childElementCounts.reduce((a, b) => a + b, 0) / children.length;
  const childElementVariance = childElementCounts.reduce((sum, count) => {
    return sum + Math.pow(count - avgChildElements, 2);
  }, 0) / children.length;
  
  // Scoring system
  let score = 0;
  
  // Tag similarity (40% weight)
  if (tagSimilarity >= 0.7) score += 40;
  else if (tagSimilarity >= 0.5) score += 20;
  
  // High-frequency class (30% weight)
  if (highFrequencyClasses.length > 0) {
    const bestClass = highFrequencyClasses[0];
    if (bestClass[1] >= children.length * 0.6) score += 30;
    else if (bestClass[1] >= children.length * 0.4) score += 20;
    else if (bestClass[1] >= children.length * 0.2) score += 10;
  }
  
  // Child element consistency (30% weight)
  if (childElementVariance < avgChildElements * 0.5) score += 30;
  else if (childElementVariance < avgChildElements) score += 20;
  else if (childElementVariance < avgChildElements * 1.5) score += 10;
  
  return {
    isValid: score >= 50,
    score: score,
    mostCommonTag: mostCommonTag[0],
    tagSimilarity: tagSimilarity,
    highFrequencyClasses: highFrequencyClasses.slice(0, 3),
    childElementVariance: childElementVariance
  };
}

// Function to find content containers using structural analysis (optimized)
function findContentContainers() {
  // Check cache first
  if (structuralAnalysisCache.containers && 
      Date.now() - structuralAnalysisCache.lastAnalysis < structuralAnalysisCache.cacheTimeout) {
    return structuralAnalysisCache.containers;
  }
  
  const anchors = findAnchorElements();
  if (anchors.length < 2) {
    structuralAnalysisCache.containers = [];
    return [];
  }
  
  // Analyze class frequency for secondary validation
  const classFrequency = analyzeClassFrequency();
  
  // Find LCA for first few anchor pairs to identify potential containers
  const candidateContainers = new Map();
  const maxPairs = Math.min(8, anchors.length); // Reduced from 10 for performance
  
  // Optimize LCA calculation by limiting depth
  for (let i = 0; i < maxPairs - 1; i++) {
    for (let j = i + 1; j < maxPairs; j++) {
      const lca = findLowestCommonAncestor(anchors[i], anchors[j]);
      if (lca && lca !== document.body && lca !== document.documentElement) {
        const key = lca;
        if (!candidateContainers.has(key)) {
          candidateContainers.set(key, {
            container: lca,
            anchorCount: 0,
            classFrequencyScore: 0
          });
        }
        candidateContainers.get(key).anchorCount++;
      }
    }
  }
  
  // Validate and score candidate containers
  const validatedContainers = [];
  
  candidateContainers.forEach((data, container) => {
    const validation = validateContainerStructure(container);
    
    if (validation.isValid) {
      // Calculate class frequency score
      let classScore = 0;
      if (container.className) {
        const classes = container.className.trim().split(/\s+/);
        classes.forEach(className => {
          const frequency = classFrequency.get(className) || 0;
          if (frequency > 5) { // High frequency threshold
            classScore += Math.min(frequency * 2, 50);
          }
        });
      }
      
      validatedContainers.push({
        container: container,
        score: validation.score + classScore,
        validation: validation,
        anchorCount: data.anchorCount,
        classScore: classScore
      });
    }
  });
  
  // Sort by score and return the best candidates
  const result = validatedContainers
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // Return top 3 candidates
    .map(item => item.container);
  
  // Cache the results
  structuralAnalysisCache.containers = result;
  structuralAnalysisCache.lastAnalysis = Date.now();
  
  return result;
}

// Function to find the entry container for a given element using structural analysis
function findEntryContainer(element) {
  // First try structural analysis for websites without presets
  const hostname = window.location.hostname.toLowerCase();
  const hasPreset = Object.keys(websitePresets).some(domain => hostname.includes(domain));
  
  if (!hasPreset) {
    const structuralContainers = findContentContainers();
    if (structuralContainers.length > 0) {
      // Find which structural container contains this element
      for (const container of structuralContainers) {
        if (container.contains(element)) {
          // Find the direct child of the container that contains this element
          let current = element;
          while (current && current.parentElement !== container) {
            current = current.parentElement;
          }
          if (current && container.contains(current)) {
            return current;
          }
        }
      }
    }
  }
  
  // Fallback to original preset-based method
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

// Debounced structural analysis for performance
function debouncedStructuralAnalysis() {
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
  }
  
  analysisTimeout = setTimeout(() => {
    // Clear cache to force fresh analysis
    structuralAnalysisCache.containers = null;
    structuralAnalysisCache.anchors = null;
    structuralAnalysisCache.classFrequency = null;
    structuralAnalysisCache.lastAnalysis = 0;
  }, ANALYSIS_DEBOUNCE_MS);
}

// Function to filter content on the page (optimized)
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
  
  // For large pages, use debounced analysis
  const totalElements = document.querySelectorAll('*').length;
  if (totalElements > 1000) {
    debouncedStructuralAnalysis();
  }
  
  // Get all text nodes that might contain blacklisted terms
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const processedContainers = new Set();
  let node;
  let processedCount = 0;
  const maxProcessedNodes = 5000; // Limit for very large pages
  
  while (node = walker.nextNode() && processedCount < maxProcessedNodes) {
    processedCount++;
    
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

