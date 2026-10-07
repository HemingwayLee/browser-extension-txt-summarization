importScripts('youtube-tab.js');

// Enable the side panel on extension startup
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Summarization installed');
});

// YouTube language codes that match each option in the side panel language select
const LANGUAGE_ALIASES = {
  'zh-TW': ['zh-TW', 'zh-Hant', 'zh-HK', 'zh'],
  'zh-CN': ['zh-CN', 'zh-Hans', 'zh-SG', 'zh']
};

// Runs inside a YouTube watch tab (MAIN world). Reuses the proof-of-origin token from the
// player's own caption request, turning CC on briefly if needed. If that fails, reads the
// transcript panel. Must be self-contained because it is injected with executeScript.
async function extractSubtitlesInPage(videoId, languageAliases) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (check, timeoutMs) => {
    for (let waited = 0; waited < timeoutMs; waited += 250) {
      const result = check();
      if (result) return result;
      await sleep(250);
    }
    return null;
  };

  if (new URLSearchParams(location.search).get('v') !== videoId) return null;

  const findTimedtextUrl = () => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .reverse()
    .find(name => name.includes('/api/timedtext') && name.includes(`v=${videoId}`) && name.includes('pot='));

  // A freshly opened tab may still be building the player
  await waitFor(() => document.querySelector('#movie_player .ytp-subtitles-button'), 10000);

  let timedtextUrl = findTimedtextUrl();
  if (!timedtextUrl) {
    const ccButton = document.querySelector('.ytp-subtitles-button');
    if (ccButton && ccButton.getAttribute('aria-pressed') !== 'true') {
      ccButton.click();
      timedtextUrl = await waitFor(findTimedtextUrl, 8000);
      ccButton.click();
    }
  }

  if (timedtextUrl) {
    const captured = new URL(timedtextUrl);
    const candidateUrls = [];

    // Prefer the requested language's track, carrying over the captured token params
    const tracks = document.getElementById('movie_player')?.getPlayerResponse?.()
      ?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const sorted = [...tracks].sort((a, b) => (a.kind === 'asr') - (b.kind === 'asr'));
    const track = languageAliases.map(code => sorted.find(t => t.languageCode === code)).find(Boolean);
    if (track) {
      const trackUrl = new URL(track.baseUrl, location.origin);
      for (const param of ['pot', 'potc', 'c', 'cver']) {
        if (captured.searchParams.has(param)) trackUrl.searchParams.set(param, captured.searchParams.get(param));
      }
      candidateUrls.push(trackUrl);
    }
    candidateUrls.push(captured);

    for (const url of candidateUrls) {
      url.searchParams.set('fmt', 'json3');
      url.searchParams.delete('tlang');
      try {
        const response = await fetch(url.toString());
        const text = await response.text();
        if (!response.ok || !text) continue;
        const lines = (JSON.parse(text).events || [])
          .filter(event => event.segs)
          .map(event => event.segs.map(seg => seg.utf8).join('').replace(/\n/g, ' ').trim())
          .filter(Boolean);
        if (lines.length > 0) return lines;
      } catch (error) {
        console.warn('Caption fetch in tab failed:', error);
      }
    }
  }

  // Last resort: open the "Show transcript" panel and read its segments (older and current layouts)
  const segmentSelector = 'ytd-transcript-segment-renderer .segment-text, transcript-segment-view-model span[role="text"]';
  if (!document.querySelector(segmentSelector)) {
    // The description section, which holds the button, loads after the player
    const transcriptButton = await waitFor(
      () => document.querySelector('ytd-video-description-transcript-section-renderer button'), 10000);
    transcriptButton?.click();
  }
  const segments = await waitFor(() => {
    const found = document.querySelectorAll(segmentSelector);
    return found.length > 0 ? found : null;
  }, 10000);
  if (!segments) return null;
  return Array.from(segments).map(segment => segment.textContent.trim()).filter(Boolean);
}

async function extractSubtitlesFromTab(tabId, videoId, language) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: extractSubtitlesInPage,
    args: [videoId, LANGUAGE_ALIASES[language] || [language]]
  });
  return injection?.result || null;
}

// Reads subtitles from a tab showing the video, opening a temporary one only when allowed.
// Returns { subtitles, needsTab } where needsTab means no tab was open.
async function getYouTubeSubtitles(videoId, language = 'en', openTabIfNeeded = false) {
  console.log(`Fetching subtitles for video ID: ${videoId} with language: ${language}`);
  const { result, needsTab } = await withYouTubeVideoTab(videoId, openTabIfNeeded,
    (tabId) => extractSubtitlesFromTab(tabId, videoId, language));
  return { subtitles: result || null, needsTab: needsTab || false };
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getYouTubeSubtitles') {
    getYouTubeSubtitles(request.videoId, request.language || 'en', request.openTabIfNeeded).then(result => {
      sendResponse({ success: true, subtitles: result.subtitles, needsTab: result.needsTab || false });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
});
