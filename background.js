// Enable the side panel on extension startup
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('Side Panel Extension installed');
});

// Local server subtitle fetching functions
async function getActiveServer() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['configuredServers'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading servers:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      const servers = result.configuredServers || [];
      const activeServer = servers.find(server => server.active);
      resolve(activeServer);
    });
  });
}

async function getYouTubeSubtitlesFromLocalServer(videoId, language = 'en') {
  try {
    console.log(`Fetching subtitles for video ID: ${videoId} with language: ${language}`);
    
    const activeServer = await getActiveServer();
    if (!activeServer) {
      throw new Error('No active server configured. Please configure a local server in the Server Config tab.');
    }

    const serverUrl = activeServer.url.replace(/\/$/, '');
    const apiUrl = `${serverUrl}/cc/get/?video_id=${videoId}&language=${language}`;
    
    console.log(`Making request to: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Server error: ${data.error}`);
    }
    
    if (!data.transcript || !data.transcript.snippets) {
      console.log('No transcript snippets found for this video and language');
      return null;
    }
    
    // Loop through json["transcript"]["snippets"] array and get "text" elements
    const textArray = data.transcript.snippets.map(snippet => snippet.text);
    
    console.log('Successfully fetched subtitles from local server');
    return textArray;
    
  } catch (error) {
    console.error('Error fetching subtitles from local server:', error);
    throw error;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getYouTubeSubtitles') {
    getYouTubeSubtitlesFromLocalServer(request.videoId, request.language || 'en').then(subtitles => {
      sendResponse({ success: true, subtitles: subtitles });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
});
