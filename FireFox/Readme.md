# JS Link Finder (Firefox) 🦊

## Installation

Follow these simple steps to install and run the extension in Firefox.

1.  Open Firefox and type `about:debugging#/runtime/this-firefox` into the address bar.
2.  Click on the "**Load Temporary Add-on...**" button.
3.  Navigate to your extension's directory and select the `manifest.json` file.
4.  The extension will be loaded, and its icon will appear in your toolbar.
5.  (Optional) To keep the extension visible, click on the puzzle piece icon in the toolbar, find "JS Link Finder," and click the gear icon, then select "**Pin to Toolbar**."

---

## Usage

* Click the **JS Link Finder** icon in your toolbar to open the popup.
* Select a pattern mode from the dropdown (e.g., Normal, XSS, SSRF).
* Click the "**Scan**" button to begin scanning the current page for JavaScript files and extracting links.
* Results will be displayed in the popup, grouped by their source JavaScript file.
* Use the search box to filter results.
* Click the "**Export**" button to save the found links to a text file.
