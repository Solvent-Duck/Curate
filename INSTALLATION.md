# Curate Firefox Extension - Installation Guide

## Quick Installation

### Method 1: Temporary Installation (Development)
1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this directory
6. The extension will be loaded and you'll see the Curate icon in your toolbar

### Method 2: Permanent Installation (Advanced)
1. Open Firefox
2. Navigate to `about:config`
3. Set `xpinstall.signatures.required` to `false` (not recommended for security)
4. Navigate to `about:addons`
5. Click the gear icon and select "Install Add-on From File"
6. Select the `manifest.json` file

## Usage Instructions

1. **Adding Terms to Blacklist**:
   - Click the Curate extension icon in your browser toolbar
   - Type a term in the input field
   - Click "Add" or press Enter
   - The term will be added to your blacklist

2. **Removing Terms**:
   - Click the Curate extension icon
   - Find the term in your blacklist
   - Click the "Remove" button next to it

3. **Clearing All Terms**:
   - Click the Curate extension icon
   - Click "Clear All" button
   - Confirm the action

4. **Viewing Options**:
   - Right-click the Curate extension icon
   - Select "Manage Extension"
   - Click "Preferences" to view the options page

## Features

- **Real-time Filtering**: Content is filtered immediately as you browse
- **Dynamic Content Support**: Works with social media feeds and single-page applications
- **Privacy Focused**: All data stays on your device
- **Cross-site Compatibility**: Works on all websites
- **Case Insensitive**: Terms are matched regardless of capitalization

## Troubleshooting

### Extension Not Loading
- Ensure you're using Firefox (not Chrome or other browsers)
- Check that all files are in the same directory
- Verify the `manifest.json` file is valid JSON

### Content Not Being Filtered
- Make sure the extension is enabled
- Check that terms are properly added to the blacklist
- Try refreshing the webpage
- Some sites may use advanced techniques that require page refresh

### Performance Issues
- Large blacklists may impact performance
- Consider removing unused terms
- Restart Firefox if issues persist

## Development

To modify the extension:
1. Edit the source files
2. Go to `about:debugging` > "This Firefox"
3. Click "Reload" next to the extension
4. Test your changes

## Support

For issues or questions:
- Check the README.md file
- Review the options page for detailed information
- Create an issue in the project repository

## Privacy Notice

- All filtering happens locally in your browser
- Your blacklist is stored locally and never transmitted
- No data is collected or sent to external servers
- The extension has no network access beyond what's needed for web browsing
