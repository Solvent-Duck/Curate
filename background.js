// Background script for Curate extension
// Handles communication between popup, content scripts, and storage

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getBlacklist") {
    // Return the current blacklist from storage
    browser.storage.local.get(['blacklist']).then((result) => {
      sendResponse({ blacklist: result.blacklist || [] });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (message.action === "addTerm") {
    // Add a new term to the blacklist
    browser.storage.local.get(['blacklist']).then((result) => {
      const blacklist = result.blacklist || [];
      if (!blacklist.includes(message.term.toLowerCase())) {
        blacklist.push(message.term.toLowerCase());
        browser.storage.local.set({ blacklist: blacklist }).then(() => {
          // Notify all tabs to re-filter content
          browser.tabs.query({}).then((tabs) => {
            tabs.forEach(tab => {
              browser.tabs.sendMessage(tab.id, { action: "updateBlacklist", blacklist: blacklist }).catch(() => {
                // Ignore errors for tabs that don't have content scripts
              });
            });
          });
          sendResponse({ success: true, blacklist: blacklist });
        });
      } else {
        sendResponse({ success: false, error: "Term already exists" });
      }
    });
    return true;
  }
  
  if (message.action === "removeTerm") {
    // Remove a term from the blacklist
    browser.storage.local.get(['blacklist']).then((result) => {
      const blacklist = result.blacklist || [];
      const index = blacklist.indexOf(message.term.toLowerCase());
      if (index > -1) {
        blacklist.splice(index, 1);
        browser.storage.local.set({ blacklist: blacklist }).then(() => {
          // Notify all tabs to re-filter content
          browser.tabs.query({}).then((tabs) => {
            tabs.forEach(tab => {
              browser.tabs.sendMessage(tab.id, { action: "updateBlacklist", blacklist: blacklist }).catch(() => {
                // Ignore errors for tabs that don't have content scripts
              });
            });
          });
          sendResponse({ success: true, blacklist: blacklist });
        });
      } else {
        sendResponse({ success: false, error: "Term not found" });
      }
    });
    return true;
  }
  
  if (message.action === "clearBlacklist") {
    // Clear the entire blacklist
    browser.storage.local.set({ blacklist: [] }).then(() => {
      // Notify all tabs to re-filter content
      browser.tabs.query({}).then((tabs) => {
        tabs.forEach(tab => {
          browser.tabs.sendMessage(tab.id, { action: "updateBlacklist", blacklist: [] }).catch(() => {
            // Ignore errors for tabs that don't have content scripts
          });
        });
      });
      sendResponse({ success: true, blacklist: [] });
    });
    return true;
  }
});

// Initialize storage with empty blacklist if it doesn't exist
browser.storage.local.get(['blacklist']).then((result) => {
  if (!result.blacklist) {
    browser.storage.local.set({ blacklist: [] });
  }
});
