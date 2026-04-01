// Background script for Curate extension.
// Handles storage, migrations, settings, and tab broadcasts.

async function readState() {
  const result = await browser.storage.local.get([
    'blacklist',
    'storageVersion',
    'debug',
    'pausedSites'
  ]);
  const migratedBlacklist = CurateCore.migrateBlacklist(result.blacklist || []);
  const storageVersion = result.storageVersion || 0;
  const debug = Boolean(result.debug);
  const pausedSites = Array.isArray(result.pausedSites)
    ? result.pausedSites.map(CurateCore.normalizeHostname).filter(Boolean)
    : [];

  if (
    storageVersion !== CurateCore.STORAGE_VERSION ||
    JSON.stringify(migratedBlacklist) !== JSON.stringify(result.blacklist || []) ||
    JSON.stringify(pausedSites) !== JSON.stringify(result.pausedSites || [])
  ) {
    await browser.storage.local.set({
      blacklist: migratedBlacklist,
      pausedSites: pausedSites,
      storageVersion: CurateCore.STORAGE_VERSION
    });
  }

  return {
    blacklist: migratedBlacklist,
    debug: debug,
    pausedSites: pausedSites
  };
}

async function broadcastState(overrides = {}) {
  const state = Object.assign(await readState(), overrides);
  const tabs = await browser.tabs.query({});

  await Promise.all(tabs.map((tab) => {
    if (!tab.id) {
      return Promise.resolve();
    }
    return browser.tabs.sendMessage(tab.id, {
      action: 'updateState',
      blacklist: state.blacklist,
      debug: state.debug,
      pausedSites: state.pausedSites
    }).catch(() => undefined);
  }));
}

async function writeBlacklist(blacklist) {
  const migratedBlacklist = CurateCore.migrateBlacklist(blacklist);
  await browser.storage.local.set({
    blacklist: migratedBlacklist,
    storageVersion: CurateCore.STORAGE_VERSION
  });
  await broadcastState({ blacklist: migratedBlacklist });
  return migratedBlacklist;
}

async function setDebug(enabled) {
  await browser.storage.local.set({ debug: Boolean(enabled) });
  await broadcastState({ debug: Boolean(enabled) });
  return readState();
}

async function togglePausedSite(hostname) {
  const normalizedHostname = CurateCore.normalizeHostname(hostname);
  const state = await readState();
  const pausedSites = new Set(state.pausedSites);

  if (pausedSites.has(normalizedHostname)) {
    pausedSites.delete(normalizedHostname);
  } else if (normalizedHostname) {
    pausedSites.add(normalizedHostname);
  }

  const nextPausedSites = Array.from(pausedSites).sort();
  await browser.storage.local.set({
    pausedSites: nextPausedSites,
    storageVersion: CurateCore.STORAGE_VERSION
  });
  await broadcastState({ pausedSites: nextPausedSites });
  return {
    pausedSites: nextPausedSites,
    paused: nextPausedSites.includes(normalizedHostname)
  };
}

async function addOrUpdateTerm(term, level) {
  const normalizedTerm = CurateCore.normalizeTerm(term);
  if (normalizedTerm.length < 2) {
    return { success: false, error: 'Term must be at least 2 characters long' };
  }
  if (!CurateCore.isValidLevel(level)) {
    return { success: false, error: 'Invalid filter level' };
  }

  const state = await readState();
  const blacklist = state.blacklist.slice();
  const existing = blacklist.find((entry) => entry.term === normalizedTerm);

  if (existing) {
    existing.level = level;
    const updated = await writeBlacklist(blacklist);
    return { success: true, status: 'updated', blacklist: updated };
  }

  blacklist.push({ term: normalizedTerm, level: level });
  const updated = await writeBlacklist(blacklist);
  return { success: true, status: 'added', blacklist: updated };
}

async function removeTerm(term) {
  const normalizedTerm = CurateCore.normalizeTerm(term);
  const state = await readState();
  const blacklist = state.blacklist.filter((entry) => entry.term !== normalizedTerm);

  if (blacklist.length === state.blacklist.length) {
    return { success: false, error: 'Term not found' };
  }

  const updated = await writeBlacklist(blacklist);
  return { success: true, blacklist: updated };
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function forceRescanTab(tabId) {
  if (!tabId) {
    const activeTab = await getActiveTab();
    tabId = activeTab && activeTab.id;
  }
  if (!tabId) {
    return { success: false, error: 'No active tab found' };
  }

  await browser.tabs.sendMessage(tabId, { action: 'forceRefilter' }).catch(() => undefined);
  return { success: true };
}

browser.runtime.onMessage.addListener((message) => {
  switch (message.action) {
    case 'getBlacklist':
      return readState();
    case 'addTerm':
      return addOrUpdateTerm(message.term, message.level || 'content');
    case 'removeTerm':
      return removeTerm(message.term);
    case 'clearBlacklist':
      return writeBlacklist([]).then((blacklist) => ({ success: true, blacklist: blacklist }));
    case 'setDebug':
      return setDebug(message.enabled).then((state) => ({ success: true, debug: state.debug }));
    case 'togglePausedSite':
      return togglePausedSite(message.hostname).then((result) => Object.assign({ success: true }, result));
    case 'forceRescan':
      return forceRescanTab(message.tabId);
    case 'getPopupState':
      return Promise.all([readState(), getActiveTab()]).then(([state, activeTab]) => {
        let hostname = '';
        if (activeTab && activeTab.url) {
          try {
            hostname = CurateCore.normalizeHostname(new URL(activeTab.url).hostname);
          } catch (error) {
            hostname = '';
          }
        }
        return {
          blacklist: state.blacklist,
          debug: state.debug,
          pausedSites: state.pausedSites,
          activeHostname: hostname,
          isPausedOnActiveSite: hostname ? state.pausedSites.includes(hostname) : false
        };
      });
    default:
      return Promise.resolve({ success: false, error: 'Unknown action' });
  }
});

readState().catch((error) => {
  console.error('Curate failed to initialize storage', error);
});
