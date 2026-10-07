// Finds or temporarily opens a YouTube tab for a video. Shared by background.js (importScripts)
// and the side panel (script tag), so it only defines plain functions.

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for the YouTube tab to load'));
    }, timeoutMs);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // The tab may have finished loading before the listener was added
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') listener(tabId, { status: 'complete' });
    }).catch(() => {});
  });
}

async function findYouTubeVideoTab(videoId) {
  const tabs = await chrome.tabs.query({ url: ['*://www.youtube.com/watch*', '*://m.youtube.com/watch*'] });
  return tabs.find(t => t.url && new URL(t.url).searchParams.get('v') === videoId) || null;
}

// Runs fn(tabId, isTemporary) in a tab showing the video. Uses an already open tab if there is
// one. Otherwise, when allowed, opens the video in a new muted tab, closes it afterwards and
// returns focus to the previously active tab. Returns { result } or { needsTab: true }.
async function withYouTubeVideoTab(videoId, openTabIfNeeded, fn) {
  const existingTab = await findYouTubeVideoTab(videoId);
  if (existingTab) {
    return { result: await fn(existingTab.id, false) };
  }
  if (!openTabIfNeeded) {
    return { needsTab: true };
  }

  const [previousTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  // Opened in the foreground: Chrome defers loading media in background tabs, so the player
  // might never load the video there
  const tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, active: true });
  try {
    await chrome.tabs.update(tab.id, { muted: true });
    await waitForTabComplete(tab.id);
    return { result: await fn(tab.id, true) };
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
    if (previousTab) {
      await chrome.tabs.update(previousTab.id, { active: true }).catch(() => {});
    }
  }
}
