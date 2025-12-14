document.addEventListener('DOMContentLoaded', function() {
  const youtubeUrlInput = document.getElementById('youtubeUrlInput');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const urlList = document.getElementById('urlList');
  const pagination = document.getElementById('pagination');
  const currentTimeElement = document.getElementById('currentTime');
  const tabInfoElement = document.getElementById('tabInfo');
  const languageSelect = document.getElementById('languageSelect');

  const serverUrlInput = document.getElementById('serverUrlInput');
  const addServerBtn = document.getElementById('addServerBtn');
  const serverList = document.getElementById('serverList');
  const serverStatus = document.getElementById('serverStatus');

  const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
  const apiKeyStatus = document.getElementById('apiKeyStatus');

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  let currentPage = 1;
  const urlsPerPage = 5;
  let allUrls = [];
  let configuredServers = [];
  let currentSearchKeyword = '';

  function switchTab(tabName) {
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  function isValidServerUrl(url) {
    const serverRegex = /^(?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}:\d+$|^(?:https?:\/\/)?localhost:\d+$/;
    return serverRegex.test(url);
  }

  function saveServersToStorage(servers) {
    chrome.storage.local.set({ 'configuredServers': servers }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving servers:', chrome.runtime.lastError);
      }
    });
  }

  function loadServersFromStorage() {
    chrome.storage.local.get(['configuredServers'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading servers:', chrome.runtime.lastError);
        return;
      }
      configuredServers = result.configuredServers || [];
      displayServers();
    });
  }

  function addServer() {
    const serverUrl = serverUrlInput.value.trim();
    
    if (!serverUrl) {
      alert('Please enter a server URL');
      return;
    }

    let formattedUrl = serverUrl;
    if (!formattedUrl.includes('://')) {
      formattedUrl = 'http://' + formattedUrl;
    }

    if (!isValidServerUrl(formattedUrl)) {
      alert('Please enter a valid server URL (e.g., 127.0.0.1:5000 or localhost:5000)');
      return;
    }

    if (configuredServers.some(server => server.url === formattedUrl)) {
      alert('Server already exists');
      return;
    }

    const serverObject = {
      url: formattedUrl,
      name: formattedUrl.replace(/^https?:\/\//, ''),
      dateAdded: new Date().toISOString(),
      active: configuredServers.length === 0
    };

    configuredServers.push(serverObject);
    saveServersToStorage(configuredServers);
    serverUrlInput.value = '';
    displayServers();
    updateServerStatus();
  }

  function deleteServer(url) {
    configuredServers = configuredServers.filter(server => server.url !== url);
    if (configuredServers.length > 0 && !configuredServers.some(server => server.active)) {
      configuredServers[0].active = true;
    }
    saveServersToStorage(configuredServers);
    displayServers();
    updateServerStatus();
  }

  function setActiveServer(url) {
    configuredServers.forEach(server => {
      server.active = server.url === url;
    });
    saveServersToStorage(configuredServers);
    displayServers();
    updateServerStatus();
  }

  function displayServers() {
    if (configuredServers.length === 0) {
      serverList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No servers configured</p>';
    } else {
      serverList.innerHTML = configuredServers.map(server => {
        const dateAdded = new Date(server.dateAdded).toLocaleDateString();
        return `
          <div class="server-item ${server.active ? 'active' : ''}">
            <div class="server-info">
              <div class="server-url">${server.name}</div>
              <small style="color: #666;">Added: ${dateAdded}</small>
            </div>
            <div class="server-actions">
              ${!server.active ? `<button class="activate-btn" onclick="setActiveServer('${server.url}')">Activate</button>` : '<span class="active-badge">Active</span>'}
              <button class="delete-btn" onclick="deleteServer('${server.url}')">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  function updateServerStatus() {
    const activeServer = configuredServers.find(server => server.active);
    if (activeServer) {
      serverStatus.innerHTML = `<strong>Active Server:</strong> ${activeServer.name}`;
    } else {
      serverStatus.innerHTML = 'No active server configured';
    }
  }

  window.setActiveServer = setActiveServer;
  window.deleteServer = deleteServer;
  window.copyUrlToClipboard = copyUrlToClipboard;

  function copyUrlToClipboard(url) {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        showCopyFeedback('✓ Copied!', '#4CAF50');
      }).catch(function(err) {
        console.error('Clipboard API failed: ', err);
        // Fallback to legacy method
        fallbackCopyToClipboard(url);
      });
    } else {
      // Fallback for older browsers or when clipboard API is not available
      fallbackCopyToClipboard(url);
    }
  }

  function fallbackCopyToClipboard(url) {
    // Create a temporary textarea element
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showCopyFeedback('✓ Copied!', '#4CAF50');
      } else {
        showCopyFeedback('❌ Copy failed', '#f44336');
      }
    } catch (err) {
      console.error('Fallback copy failed: ', err);
      showCopyFeedback('❌ Copy failed', '#f44336');
    } finally {
      document.body.removeChild(textArea);
    }
  }

  function showCopyFeedback(message, color) {
    // Find the copy button that was clicked
    const button = document.querySelector('#summary-popup .copy-url-btn');
    if (button) {
      const originalText = button.textContent;
      const originalColor = button.style.background;
      button.textContent = message;
      button.style.background = color;
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = originalColor || '#007acc';
      }, 2000);
    }
  }

  function saveGeminiApiKey() {
    const apiKey = geminiApiKeyInput.value.trim();
    
    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    if (apiKey.length < 10) {
      alert('Please enter a valid API key');
      return;
    }

    chrome.storage.local.set({ 'geminiApiKey': apiKey }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving API key:', chrome.runtime.lastError);
        alert('Error saving API key');
        return;
      }
      
      geminiApiKeyInput.value = '';
      updateApiKeyStatus();
      alert('Gemini API key saved successfully');
    });
  }

  function clearGeminiApiKey() {
    if (confirm('Are you sure you want to clear the API key?')) {
      chrome.storage.local.remove(['geminiApiKey'], function() {
        if (chrome.runtime.lastError) {
          console.error('Error clearing API key:', chrome.runtime.lastError);
          return;
        }
        updateApiKeyStatus();
        alert('API key cleared successfully');
      });
    }
  }

  function loadGeminiApiKey() {
    chrome.storage.local.get(['geminiApiKey'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading API key:', chrome.runtime.lastError);
        return;
      }
      updateApiKeyStatus(result.geminiApiKey);
    });
  }

  function updateApiKeyStatus(apiKey = null) {
    if (apiKey === null) {
      chrome.storage.local.get(['geminiApiKey'], function(result) {
        if (chrome.runtime.lastError) {
          console.error('Error checking API key:', chrome.runtime.lastError);
          return;
        }
        displayApiKeyStatus(result.geminiApiKey);
      });
    } else {
      displayApiKeyStatus(apiKey);
    }
  }

  function displayApiKeyStatus(apiKey) {
    if (apiKey) {
      const maskedKey = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
      apiKeyStatus.innerHTML = `<span style="color: #4CAF50;">✓ API key configured: ${maskedKey}</span>`;
    } else {
      apiKeyStatus.innerHTML = '<span style="color: #f44336;">No API key configured</span>';
    }
  }




  function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  }

  function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  async function getYouTubeSubtitles(videoId, language = 'en') {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'getYouTubeSubtitles', videoId: videoId, language: language },
        (response) => {
          if (response.success) {
            resolve(response.subtitles);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  function saveUrlsToStorage(urls) {
    chrome.storage.local.set({ 'youtubeUrls': urls }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving URLs:', chrome.runtime.lastError);
      }
    });
  }

  function loadUrlsFromStorage() {
    chrome.storage.local.get(['youtubeUrls'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading URLs:', chrome.runtime.lastError);
        return;
      }
      allUrls = result.youtubeUrls || [];
      displayUrls();
    });
  }

  async function addUrl() {
    const url = youtubeUrlInput.value.trim();
    
    if (!url) {
      alert('Please enter a URL');
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      alert('Please enter a valid YouTube URL');
      return;
    }

    // Ensure URLs are loaded from storage before checking duplicates
    await new Promise((resolve) => {
      chrome.storage.local.get(['youtubeUrls'], function(result) {
        if (!chrome.runtime.lastError) {
          allUrls = result.youtubeUrls || [];
        }
        resolve();
      });
    });

    if (allUrls.some(item => (typeof item === 'string' ? item : item.url) === url)) {
      alert('URL already exists');
      displayUrls(); // Display the loaded URLs
      return;
    }

    addUrlBtn.disabled = true;
    addUrlBtn.textContent = 'Getting subtitles...';

    const videoId = extractVideoId(url);
    const selectedLanguage = languageSelect.value;
    let subtitles = null;
    
    if (videoId) {
      subtitles = await getYouTubeSubtitles(videoId, selectedLanguage);
    }

    const urlObject = {
      url: url,
      subtitles: subtitles,
      dateAdded: new Date().toISOString()
    };

    allUrls.unshift(urlObject);
    saveUrlsToStorage(allUrls);
    youtubeUrlInput.value = '';
    currentPage = 1;
    displayUrls();

    addUrlBtn.disabled = false;
    addUrlBtn.textContent = 'Add URL';
  }

  function deleteUrl(url) {
    allUrls = allUrls.filter(item => (typeof item === 'string' ? item : item.url) !== url);
    saveUrlsToStorage(allUrls);
    
    const totalPages = Math.ceil(allUrls.length / urlsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      currentPage = totalPages;
    }
    
    displayUrls();
  }

  async function callGeminiAPI(subtitles) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['geminiApiKey'], async function(result) {
        if (chrome.runtime.lastError) {
          reject(new Error('Error accessing API key: ' + chrome.runtime.lastError.message));
          return;
        }
        
        if (!result.geminiApiKey) {
          reject(new Error('No Gemini API key configured. Please add your API key in the Gemini API tab.'));
          return;
        }
        
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${result.geminiApiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `以下是YouTube影片的台詞，請幫我把這些台詞總結成清晰剪短的內容，讓我可以分享到其他的社群平台：\n\n${subtitles}`
                }]
              }]
            })
          });
          
          if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            resolve(data.candidates[0].content.parts[0].text);
          } else {
            reject(new Error('No summary generated by Gemini API'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function showSummaryPopup(summary, videoUrl) {
    // Remove existing popup if any
    const existingPopup = document.getElementById('summary-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    // Create popup element
    const popup = document.createElement('div');
    popup.id = 'summary-popup';
    popup.innerHTML = `
      <div class="popup-overlay">
        <div class="popup-content">
          <div class="popup-header">
            <h3>Video Summary</h3>
            <button class="popup-close">&times;</button>
          </div>
          <div class="popup-body">
            <div class="video-url">
              <strong>Video:</strong> <a href="${videoUrl}" target="_blank">${videoUrl}</a>
              <button class="copy-url-btn" data-url="${videoUrl}">📋 Copy URL</button>
            </div>
            <div class="summary-text">${summary}</div>
          </div>
        </div>
      </div>
    `;
    
    // Add styles
    popup.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      font-family: Arial, sans-serif;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      #summary-popup .popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      
      #summary-popup .popup-content {
        background: white;
        border-radius: 8px;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      
      #summary-popup .popup-header {
        background: #007acc;
        color: white;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      #summary-popup .popup-header h3 {
        margin: 0;
        font-size: 18px;
      }
      
      #summary-popup .popup-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      
      #summary-popup .popup-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      
      #summary-popup .popup-body {
        padding: 20px;
        overflow-y: auto;
        max-height: calc(80vh - 80px);
      }
      
      #summary-popup .video-url {
        margin-bottom: 15px;
        padding-bottom: 15px;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      
      #summary-popup .copy-url-btn {
        background: #007acc;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background-color 0.2s;
        white-space: nowrap;
      }
      
      #summary-popup .copy-url-btn:hover {
        background: #005a99;
      }
      
      #summary-popup .copy-url-btn:active {
        background: #004080;
      }
      
      #summary-popup .video-url a {
        color: #007acc;
        text-decoration: none;
        word-break: break-all;
      }
      
      #summary-popup .video-url a:hover {
        text-decoration: underline;
      }
      
      #summary-popup .summary-text {
        line-height: 1.6;
        white-space: pre-wrap;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(popup);

    // Add event listener for close button
    const closeButton = popup.querySelector('.popup-close');
    if (closeButton) {
      closeButton.addEventListener('click', function() {
        popup.remove();
      });
    }

    // Add event listener for copy button
    const copyButton = popup.querySelector('.copy-url-btn');
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        const url = this.getAttribute('data-url');
        copyUrlToClipboard(url);
      });
    }

    // Close popup when clicking outside
    popup.querySelector('.popup-overlay').addEventListener('click', function(e) {
      if (e.target === this) {
        popup.remove();
      }
    });
  }

  async function summarizeUrl(url) {
    // Find the URL item to get subtitles
    const urlItem = allUrls.find(item => (typeof item === 'string' ? item : item.url) === url);
    
    if (!urlItem || !urlItem.subtitles) {
      alert('No subtitles available for this video to summarize');
      return;
    }
    
    // Find the summarize button for this URL to show loading state
    const summarizeButton = document.querySelector(`button[data-url="${url}"].summarize-btn`);
    if (summarizeButton) {
      summarizeButton.disabled = true;
      summarizeButton.textContent = 'Summarizing...';
    }
    
    try {
      const summary = await callGeminiAPI(urlItem.subtitles);
      showSummaryPopup(summary, url);
    } catch (error) {
      console.error('Error summarizing video:', error);
      alert('Error summarizing video: ' + error.message);
    } finally {
      // Reset button state
      if (summarizeButton) {
        summarizeButton.disabled = false;
        summarizeButton.textContent = 'Summarize';
      }
    }
  }

  function searchVideos() {
    const keyword = searchInput.value.trim();

    if (!keyword) {
      alert('Please enter a search keyword');
      return;
    }

    currentSearchKeyword = keyword;
    currentPage = 1; // Reset to first page when searching
    displayUrls();
  }

  function clearSearch() {
    currentSearchKeyword = '';
    searchInput.value = '';
    currentPage = 1;
    displayUrls();
  }

  function getFilteredUrls() {
    if (!currentSearchKeyword) {
      return allUrls;
    }

    // Filter URLs by checking if subtitles contain the search keyword (case-insensitive)
    return allUrls.filter(item => {
      if (typeof item === 'object' && item.subtitles) {
        const subtitles = String(item.subtitles);
        return subtitles.toLowerCase().includes(currentSearchKeyword.toLowerCase());
      }
      return false;
    });
  }

  function displayUrls() {
    const filteredUrls = getFilteredUrls();
    const startIndex = (currentPage - 1) * urlsPerPage;
    const endIndex = startIndex + urlsPerPage;
    const urlsToShow = filteredUrls.slice(startIndex, endIndex);

    if (urlsToShow.length === 0) {
      if (currentSearchKeyword) {
        urlList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No videos found matching your search keyword</p>';
      } else {
        urlList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No YouTube URLs saved yet</p>';
      }
    } else {
      urlList.innerHTML = urlsToShow.map((item, index) => {
        const url = typeof item === 'string' ? item : item.url;
        const subtitles = typeof item === 'object' && item.subtitles ? item.subtitles : null;
        const dateAdded = typeof item === 'object' && item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : '';
        
        return `
          <div class="url-item">
            <div class="url-text">
              <a href="${url}" target="_blank">${url}</a>
              ${dateAdded ? `<small style="color: #666; display: block;">Added: ${dateAdded}</small>` : ''}
              ${subtitles ? `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #007acc;">Subtitles</summary><div style="max-height: 150px; overflow-y: auto; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px; margin-top: 4px;">${subtitles}</div></details>` : '<small style="color: #999;">No subtitles available</small>'}
            </div>
            <div class="button-group">
              <button class="delete-btn" data-url="${url}" data-index="${startIndex + index}">Delete</button>
              <button class="summarize-btn" data-url="${url}" data-index="${startIndex + index}">Summarize</button>
            </div>
          </div>
        `;
      }).join('');
      
      // Add event listeners to delete buttons
      const deleteButtons = urlList.querySelectorAll('.delete-btn');
      deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
          const url = this.getAttribute('data-url');
          deleteUrl(url);
        });
      });

      // Add event listeners to summarize buttons
      const summarizeButtons = urlList.querySelectorAll('.summarize-btn');
      summarizeButtons.forEach(button => {
        button.addEventListener('click', function() {
          const url = this.getAttribute('data-url');
          summarizeUrl(url);
        });
      });
    }

    displayPagination();
  }

  function displayPagination() {
    const filteredUrls = getFilteredUrls();
    const totalPages = Math.ceil(filteredUrls.length / urlsPerPage);

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    pagination.innerHTML = `
      <button class="prev-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Previous</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button class="next-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>
    `;
    
    // Add event listeners to pagination buttons
    const prevBtn = pagination.querySelector('.prev-btn');
    const nextBtn = pagination.querySelector('.next-btn');
    
    if (prevBtn && !prevBtn.disabled) {
      prevBtn.addEventListener('click', function() {
        const page = parseInt(this.getAttribute('data-page'));
        changePage(page);
      });
    }
    
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', function() {
        const page = parseInt(this.getAttribute('data-page'));
        changePage(page);
      });
    }
  }

  function changePage(page) {
    const filteredUrls = getFilteredUrls();
    const totalPages = Math.ceil(filteredUrls.length / urlsPerPage);
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      displayUrls();
    }
  }

  function deleteUrlHandler(url) {
    deleteUrl(url);
  }

  function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleString();
    currentTimeElement.textContent = `Current time: ${timeString}`;
  }

  function updateTabInfo() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        const tab = tabs[0];
        tabInfoElement.innerHTML = `
          <strong>Current Tab:</strong><br>
          Title: ${tab.title}<br>
          URL: ${tab.url}
        `;
      }
    });
  }

  addUrlBtn.addEventListener('click', addUrl);
  addServerBtn.addEventListener('click', addServer);
  saveApiKeyBtn.addEventListener('click', saveGeminiApiKey);
  clearApiKeyBtn.addEventListener('click', clearGeminiApiKey);
  searchBtn.addEventListener('click', searchVideos);
  clearSearchBtn.addEventListener('click', clearSearch);

  youtubeUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addUrl();
    }
  });

  serverUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addServer();
    }
  });

  geminiApiKeyInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveGeminiApiKey();
    }
  });

  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      searchVideos();
    }
  });

  loadUrlsFromStorage();
  loadServersFromStorage();
  loadGeminiApiKey();
  updateTime();
  updateTabInfo();
  updateServerStatus();

  setInterval(updateTime, 1000);
  setInterval(updateTabInfo, 5000);
});
