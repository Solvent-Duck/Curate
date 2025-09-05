// Popup script for Curate extension
// Handles the popup interface and user interactions

let blacklist = [];

// DOM elements
const newTermInput = document.getElementById('newTerm');
const filterLevelSelect = document.getElementById('filterLevel');
const addTermButton = document.getElementById('addTerm');
const clearAllButton = document.getElementById('clearAll');
const blacklistItems = document.getElementById('blacklistItems');
const statusMessage = document.getElementById('statusMessage');

// Function to show status message
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${isError ? 'status-error' : 'status-success'}`;
  statusMessage.style.display = 'block';
  
  // Hide message after 3 seconds
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 3000);
}

// Function to render blacklist items
function renderBlacklist() {
  if (blacklist.length === 0) {
    blacklistItems.innerHTML = '<div class="empty-state">No terms in blacklist</div>';
    return;
  }
  
  blacklistItems.innerHTML = '';
  
  blacklist.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'blacklist-item';
    
    const termInfo = document.createElement('div');
    termInfo.className = 'term-info';
    
    const termText = document.createElement('div');
    termText.className = 'term-text';
    termText.textContent = item.term;
    
    const termLevel = document.createElement('div');
    termLevel.className = 'term-level';
    termLevel.textContent = getLevelDisplayName(item.level);
    
    termInfo.appendChild(termText);
    termInfo.appendChild(termLevel);
    
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeTerm(item.term));
    
    itemDiv.appendChild(termInfo);
    itemDiv.appendChild(removeButton);
    blacklistItems.appendChild(itemDiv);
  });
}

// Function to get display name for filter level
function getLevelDisplayName(level) {
  switch (level) {
    case 'content': return 'Content Only';
    case 'search': return 'Search Results';
    case 'full': return 'Full Block';
    default: return 'Unknown';
  }
}

// Function to add a new term
async function addTerm() {
  const term = newTermInput.value.trim();
  const level = filterLevelSelect.value;
  
  if (!term) {
    showStatus('Please enter a term to block', true);
    return;
  }
  
  if (term.length < 2) {
    showStatus('Term must be at least 2 characters long', true);
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'addTerm',
      term: term,
      level: level
    });
    
    if (response.success) {
      blacklist = response.blacklist;
      renderBlacklist();
      newTermInput.value = '';
      showStatus(`"${term}" added to blacklist (${getLevelDisplayName(level)})`);
    } else {
      showStatus(response.error || 'Failed to add term', true);
    }
  } catch (error) {
    showStatus('Error adding term', true);
    console.error('Error adding term:', error);
  }
}

// Function to remove a term
async function removeTerm(term) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'removeTerm',
      term: term
    });
    
    if (response.success) {
      blacklist = response.blacklist;
      renderBlacklist();
      showStatus(`"${term}" removed from blacklist`);
    } else {
      showStatus(response.error || 'Failed to remove term', true);
    }
  } catch (error) {
    showStatus('Error removing term', true);
    console.error('Error removing term:', error);
  }
}

// Function to clear all terms
async function clearAllTerms() {
  if (blacklist.length === 0) {
    return;
  }
  
  if (!confirm('Are you sure you want to clear all blacklisted terms?')) {
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'clearBlacklist'
    });
    
    if (response.success) {
      blacklist = response.blacklist;
      renderBlacklist();
      showStatus('All terms cleared from blacklist');
    } else {
      showStatus('Failed to clear blacklist', true);
    }
  } catch (error) {
    showStatus('Error clearing blacklist', true);
    console.error('Error clearing blacklist:', error);
  }
}

// Function to load current blacklist
async function loadBlacklist() {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'getBlacklist'
    });
    
    blacklist = response.blacklist || [];
    renderBlacklist();
  } catch (error) {
    showStatus('Error loading blacklist', true);
    console.error('Error loading blacklist:', error);
  }
}

// Event listeners
addTermButton.addEventListener('click', addTerm);

newTermInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTerm();
  }
});

clearAllButton.addEventListener('click', clearAllTerms);

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadBlacklist();
  newTermInput.focus();
});
