// Popup script for Curate extension.
// Handles blacklist management and demo controls.

let blacklist = [];
let activeHostname = '';
let debugEnabled = false;
let sitePaused = false;

const newTermInput = document.getElementById('newTerm');
const filterLevelSelect = document.getElementById('filterLevel');
const addTermButton = document.getElementById('addTerm');
const clearAllButton = document.getElementById('clearAll');
const blacklistItems = document.getElementById('blacklistItems');
const statusMessage = document.getElementById('statusMessage');
const activeSiteLabel = document.getElementById('activeSiteLabel');
const pauseSiteButton = document.getElementById('pauseSiteButton');
const rescanButton = document.getElementById('rescanButton');
const debugToggle = document.getElementById('debugToggle');

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${isError ? 'status-error' : 'status-success'}`;
  statusMessage.style.display = 'block';

  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 3000);
}

function getLevelDisplayName(level) {
  switch (level) {
    case 'content': return 'Content Only';
    case 'search': return 'Search Results';
    case 'full': return 'Full Block';
    default: return 'Unknown';
  }
}

function renderBlacklist() {
  if (blacklist.length === 0) {
    blacklistItems.innerHTML = '<div class="empty-state">No terms in blacklist</div>';
    return;
  }

  blacklistItems.innerHTML = '';

  const sortedBlacklist = blacklist.slice().sort((a, b) => {
    const levelDelta = CurateCore.LEVEL_PRIORITY[b.level] - CurateCore.LEVEL_PRIORITY[a.level];
    if (levelDelta !== 0) {
      return levelDelta;
    }
    return a.term.localeCompare(b.term);
  });

  sortedBlacklist.forEach((item) => {
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

function renderControls() {
  activeSiteLabel.textContent = activeHostname || 'No active page';
  pauseSiteButton.disabled = !activeHostname;
  pauseSiteButton.textContent = sitePaused ? 'Resume Site' : 'Pause Site';
  debugToggle.checked = debugEnabled;
}

async function addTerm() {
  const term = CurateCore.normalizeTerm(newTermInput.value);
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

    if (!response.success) {
      showStatus(response.error || 'Failed to add term', true);
      return;
    }

    blacklist = response.blacklist;
    renderBlacklist();
    newTermInput.value = '';
    showStatus(
      response.status === 'updated'
        ? `"${term}" updated to ${getLevelDisplayName(level)}`
        : `"${term}" added to blacklist (${getLevelDisplayName(level)})`
    );
  } catch (error) {
    showStatus('Error adding term', true);
    console.error('Error adding term:', error);
  }
}

async function removeTerm(term) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'removeTerm',
      term: term
    });

    if (!response.success) {
      showStatus(response.error || 'Failed to remove term', true);
      return;
    }

    blacklist = response.blacklist;
    renderBlacklist();
    showStatus(`"${term}" removed from blacklist`);
  } catch (error) {
    showStatus('Error removing term', true);
    console.error('Error removing term:', error);
  }
}

async function clearAllTerms() {
  if (blacklist.length === 0) {
    return;
  }

  if (!confirm('Are you sure you want to clear all blacklisted terms?')) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({ action: 'clearBlacklist' });
    if (!response.success) {
      showStatus(response.error || 'Failed to clear blacklist', true);
      return;
    }

    blacklist = response.blacklist;
    renderBlacklist();
    showStatus('All terms cleared from blacklist');
  } catch (error) {
    showStatus('Error clearing blacklist', true);
    console.error('Error clearing blacklist:', error);
  }
}

async function togglePauseSite() {
  if (!activeHostname) {
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({
      action: 'togglePausedSite',
      hostname: activeHostname
    });
    if (!response.success) {
      showStatus(response.error || 'Failed to update site pause', true);
      return;
    }

    sitePaused = response.paused;
    renderControls();
    showStatus(sitePaused ? `Paused Curate on ${activeHostname}` : `Resumed Curate on ${activeHostname}`);
  } catch (error) {
    showStatus('Error updating site pause', true);
    console.error('Error updating site pause:', error);
  }
}

async function forceRescan() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'forceRescan' });
    if (!response.success) {
      showStatus(response.error || 'Failed to re-scan page', true);
      return;
    }
    showStatus('Triggered page re-scan');
  } catch (error) {
    showStatus('Error re-scanning page', true);
    console.error('Error re-scanning page:', error);
  }
}

async function setDebug(enabled) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'setDebug',
      enabled: enabled
    });
    if (!response.success) {
      showStatus(response.error || 'Failed to update debug mode', true);
      return;
    }
    debugEnabled = Boolean(response.debug);
    renderControls();
    showStatus(debugEnabled ? 'Debug mode enabled' : 'Debug mode disabled');
  } catch (error) {
    showStatus('Error updating debug mode', true);
    console.error('Error updating debug mode:', error);
  }
}

async function loadPopupState() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getPopupState' });
    blacklist = response.blacklist || [];
    activeHostname = response.activeHostname || '';
    debugEnabled = Boolean(response.debug);
    sitePaused = Boolean(response.isPausedOnActiveSite);
    renderBlacklist();
    renderControls();
  } catch (error) {
    showStatus('Error loading popup state', true);
    console.error('Error loading popup state:', error);
  }
}

addTermButton.addEventListener('click', addTerm);
clearAllButton.addEventListener('click', clearAllTerms);
pauseSiteButton.addEventListener('click', togglePauseSite);
rescanButton.addEventListener('click', forceRescan);
debugToggle.addEventListener('change', (event) => setDebug(event.target.checked));

newTermInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    addTerm();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadPopupState();
  newTermInput.focus();
});
