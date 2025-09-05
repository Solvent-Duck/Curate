# Curate Firefox Extension

A powerful Firefox extension that allows users to maintain a blacklist of terms to filter unwanted content from webpages.

## Features

- **Smart Content Filtering**: Automatically detects and hides content containing blacklisted terms
- **Surgical Removal**: Only removes the smallest possible elements containing blacklisted terms, preserving page layout
- **Real-time Updates**: Changes apply immediately across all open tabs without page refreshes
- **Dynamic Content Support**: Filters content that loads dynamically (social media feeds, SPAs, etc.)
- **Privacy Focused**: All processing happens locally in your browser
- **Easy Management**: Simple popup interface for managing your blacklist
- **Case Insensitive**: Terms matched regardless of capitalization
- **Layout Preservation**: Removes content seamlessly without breaking page structure

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

Curate uses advanced content detection algorithms to scan web pages for your blacklisted terms. When matches are found, the extension identifies the smallest possible element containing the blacklisted content and removes only that specific element. This surgical approach ensures that the rest of the page remains intact and functional, making it appear as if the unwanted content was never there. The extension works across all websites and handles both static and dynamically loaded content.

## Files Structure

```
Curate/
├── manifest.json          # Extension manifest
├── background.js          # Background script for storage and communication
├── content.js            # Content script for filtering webpage content
├── popup.html            # Popup interface HTML
├── popup.js              # Popup interface JavaScript
├── options.html          # Options page HTML
└── icons/                # Extension icons (placeholder)
    ├── icon-48.png
    └── icon-96.png
```

## Development

This extension is built using the WebExtensions API and is compatible with Firefox. The extension uses:

- **Manifest V2**: For Firefox compatibility
- **Local Storage**: For persisting blacklist data
- **Content Scripts**: For filtering webpage content
- **MutationObserver**: For detecting dynamic content changes

## Privacy

- All filtering happens locally in your browser
- Your blacklist is stored locally and never sent to external servers
- No data is collected or transmitted

## Version

v1.0.0
