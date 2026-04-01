# Curate Firefox Extension

A Firefox extension that maintains a blacklist of terms and surgically removes matching content units from webpages. Curate is optimized for feed cards, search results, comments, and article containers so removals reflow naturally without leaving obvious gaps.

## Features

- **Three Filter Levels**: Choose how strictly Curate filters
  - **Content Only**: Removes matching content units from feeds and pages
  - **Search Results**: Removes matching search result units based on result text and destination URLs
  - **Full Block**: Blocks entire pages when URL, title, or page text match a full-block term
- **Site Adapters**: Prioritized handling for YouTube, Reddit, Google, Bing, DuckDuckGo, and generic article/feed layouts
- **Surgical Removal**: Removes matching DOM units instead of blanking them with `display: none`
- **Real-time Updates**: Changes apply immediately across all open tabs without page refreshes
- **Dynamic Content Support**: Filters content that loads dynamically (social media feeds, SPAs, etc.)
- **Privacy Focused**: All processing happens locally in your browser
- **Easy Management**: Simple popup interface for managing your blacklist
- **Word-aware Matching**: Case-insensitive phrase matching reduces false positives from raw substring checks
- **Automated Tests**: Matching and blacklist normalization are covered by the built-in Node test suite

## Filter Levels Explained

### Content Only
- **What it does**: Hides webpage content containing blacklisted terms
- **Best for**: Filtering specific topics or content types while keeping the page functional
- **Example**: Hiding posts about "spoilers" on a forum while keeping the forum structure intact

### Search Results  
- **What it does**: Prevents search results and links containing blacklisted terms from appearing
- **Best for**: Avoiding certain topics in search results and navigation
- **Example**: Hiding search results for "clickbait" articles while browsing news sites

### Full Block
- **What it does**: Completely blocks pages containing blacklisted terms
- **Best for**: Avoiding entire pages or sites related to specific topics
- **Example**: Blocking entire pages about "malware" or "scams"

## Installation

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the sidebar
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from this directory

## Usage

1. Click the Curate extension icon in your browser toolbar
2. Add terms to your blacklist by typing them in the input field
3. Remove individual terms by clicking the "Remove" button
4. Clear your entire blacklist using the "Clear All" button
5. See immediate results as content is filtered across all open tabs

## How It Works

Curate compiles your blacklist into matchers and evaluates content units on each page using site adapters and generic fallbacks. When a content unit matches, Curate removes the element from the DOM, preserves a restoration marker for re-filtering, and lets the surrounding layout naturally reflow. On search pages, matches are evaluated against result text and destination URLs. Full-block terms can block an entire page when page-level signals match.

## Files Structure

```
Curate/
├── manifest.json          # Extension manifest
├── core.js                # Shared blacklist normalization and matching utilities
├── background.js          # Background script for storage and communication
├── content.js            # Content script for filtering webpage content
├── popup.html            # Popup interface HTML
├── popup.js              # Popup interface JavaScript
├── options.html          # Options page HTML
├── test-page.html        # Manual fixture page for extension testing
└── tests/
    └── core.test.js      # Automated tests for matching and blacklist rules
```

## Development

This extension is built using the WebExtensions API and is compatible with Firefox. The extension uses:

- **Manifest V2**: For Firefox compatibility
- **Local Storage**: For persisting blacklist data
- **Content Scripts**: For filtering webpage content
- **MutationObserver**: For detecting dynamic content changes
- **Node Test Runner**: For automated verification of blacklist logic

## Privacy

- All filtering happens locally in your browser
- Your blacklist is stored locally and never sent to external servers
- No data is collected or transmitted

## Version

v1.0.0
