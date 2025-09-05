// Content script for Curate extension
// Filters content on webpages based on blacklisted terms

let blacklist = [];
let observer = null;

// Function to check if text contains any blacklisted terms
function containsBlacklistedTerms(text) {
  if (!text || !blacklist.length) return false;
  
  const lowerText = text.toLowerCase();
  return blacklist.some(term => lowerText.includes(term));
}

// Function to find the entry container for a given element
function findEntryContainer(element) {
  // Common entry container selectors for different types of content
  const entrySelectors = [
    'article', 'section', '.post', '.entry', '.item', '.card', '.tile',
    '.news-item', '.story', '.content-item', '.feed-item', '.list-item',
    'li', '.comment', '.reply', '.tweet', '.status', '.update'
  ];
  
  // Start from the current element and work up the DOM tree
  let current = element;
  while (current && current !== document.body) {
    // Check if current element matches any entry container selector
    for (const selector of entrySelectors) {
      if (current.matches(selector)) {
        return current;
      }
    }
    
    // Check if current element has a class that suggests it's an entry container
    if (current.className) {
      const className = current.className.toLowerCase();
      if (className.includes('post') || className.includes('entry') || 
          className.includes('item') || className.includes('card') || 
          className.includes('article') || className.includes('story') ||
          className.includes('comment') || className.includes('tweet')) {
        return current;
      }
    }
    
    // Move up to parent
    current = current.parentElement;
  }
  
  // If no specific entry container found, return the parent of the element
  return element.parentElement;
}

// Function to check if an element or its descendants contain blacklisted terms
function elementContainsBlacklistedTerms(element) {
  // Check direct text content
  const textContent = element.textContent || '';
  if (textContent.trim() && containsBlacklistedTerms(textContent)) {
    return true;
  }
  
  // Check child elements recursively
  const children = element.querySelectorAll('*');
  for (const child of children) {
    const childText = child.textContent || '';
    if (childText.trim() && containsBlacklistedTerms(childText)) {
      return true;
    }
  }
  
  return false;
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
    if (textContent && containsBlacklistedTerms(textContent)) {
      // Find the entry container for this text node
      const entryContainer = findEntryContainer(node.parentElement);
      
      // Skip if already processed
      if (processedContainers.has(entryContainer)) {
        continue;
      }
      
      // Check if the entry container contains blacklisted terms
      if (entryContainer && elementContainsBlacklistedTerms(entryContainer)) {
        // Hide the entire entry container
        hideElement(entryContainer);
        processedContainers.add(entryContainer);
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
            if (containsBlacklistedTerms(node.textContent)) {
              shouldRefilter = true;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added element or its descendants contain blacklisted terms
            const textContent = node.textContent || '';
            if (textContent.trim() && containsBlacklistedTerms(textContent)) {
              shouldRefilter = true;
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
