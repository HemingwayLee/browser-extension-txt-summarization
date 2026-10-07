# YouTube Summarization

A Chrome extension that opens a side panel on the right side of your browser window when you click the extension icon.

## Features

- Opens a side panel on the right side of the browser
- Shows current time and tab information
- Modern, responsive design with gradient background
- Interactive buttons for refresh and settings

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by clicking the toggle in the top right corner
3. Click "Load unpacked" button
4. Select the folder containing this extension (the folder with manifest.json)
5. The extension should now appear in your extensions list

## Usage

1. Click the extension icon in the Chrome toolbar
2. The side panel will open on the right side of your browser window
3. The panel shows:
   - Welcome message and features
   - Current time (updates every second)
   - Current tab information (updates every 5 seconds)
   - Refresh and Settings buttons

## Files Structure

- `manifest.json` - Extension configuration
- `sidepanel.html` - Side panel HTML content
- `sidepanel.css` - Styling for the side panel
- `sidepanel.js` - JavaScript functionality
- `background.js` - Background service worker
- `icons/` - Extension icons (`icon.svg` source, PNGs at 16/32/48/128 px)
- `webllm-worker.js` - Web worker that runs the in-browser Qwen3-8B model
- `youtube-tab.js` - Finds or temporarily opens a video's YouTube tab (used for subtitles and screenshots)
- `screenshot/` - Text-free screenshots taken while summarizing, adapted from auto-youtube-screenshot-pure-frontend: frame capture, PP-OCR text detection, largest text-free crop (kept in memory only, never stored)
- `models/ch_PP-OCRv4_det_infer.onnx` - PaddleOCR PP-OCRv4 text detection model
- `vendor/web-llm/` - Bundled [WebLLM](https://github.com/mlc-ai/web-llm) 0.2.85 (Apache-2.0)
- `vendor/onnxruntime-web/` - Bundled [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.30.0 WASM build (MIT)

## Customization

You can customize the extension by:
- Modifying `sidepanel.html` to change the content
- Updating `sidepanel.css` to change the styling
- Adding new functionality in `sidepanel.js`

## Permissions

This extension requires:
- `sidePanel` - To create and manage the side panel

## Note
- The pip install pillow is failed
- Uncaught SyntaxError: Identifier 'sidebar' has already been declared
- Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: script-src none" indicates a conflict between the application's JavaScript code and the Content Security Policy (CSP) set for the web page 
- Did not know the which lang to download from YT
- Error fetching available subtitle languages: ReferenceError: DOMParser is not defined
- When we do the bug fixing, we need to specify what error message we see in which step
- claude code does not think carefully in some corner cases
