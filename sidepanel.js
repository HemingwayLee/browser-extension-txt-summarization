document.addEventListener('DOMContentLoaded', function() {
  const youtubeUrlInput = document.getElementById('youtubeUrlInput');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const urlList = document.getElementById('urlList');
  const pagination = document.getElementById('pagination');
  const currentTimeElement = document.getElementById('currentTime');
  const tabInfoElement = document.getElementById('tabInfo');
  const languageSelect = document.getElementById('languageSelect');

  const ollamaUrlInput = document.getElementById('ollamaUrlInput');
  const saveOllamaUrlBtn = document.getElementById('saveOllamaUrlBtn');
  const clearOllamaUrlBtn = document.getElementById('clearOllamaUrlBtn');
  const testOllamaBtn = document.getElementById('testOllamaBtn');
  const ollamaBadge = document.getElementById('ollamaBadge');
  const ollamaMessage = document.getElementById('ollamaMessage');
  const ollamaCard = document.getElementById('ollamaCard');

  const currentLlmName = document.getElementById('currentLlmName');
  const currentLlmDot = document.getElementById('currentLlmDot');
  const currentLlmStatus = document.getElementById('currentLlmStatus');
  const llmModeRadios = document.querySelectorAll('input[name="llmMode"]');

  const webllmCard = document.getElementById('webllmCard');
  const webllmBadge = document.getElementById('webllmBadge');
  const webgpuStatus = document.getElementById('webgpuStatus');
  const webllmProgress = document.getElementById('webllmProgress');
  const webllmProgressBar = document.getElementById('webllmProgressBar');
  const webllmMessage = document.getElementById('webllmMessage');
  const loadWebllmBtn = document.getElementById('loadWebllmBtn');
  const deleteWebllmBtn = document.getElementById('deleteWebllmBtn');

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  const llmSelect = document.getElementById('llmSelect');

  let currentPage = 1;
  const urlsPerPage = 5;
  let allUrls = [];
  let currentSearchKeyword = '';
  let selectedLLM = 'webllm';

  const SUMMARY_PROMPT = '以下是YouTube影片的台詞，請幫我把這些台詞總結成清晰剪短的內容，並且避免提到阿星，讓我可以分享到其他的社群平台：';

  const WEBLLM_MODEL_ID = 'Qwen3-8B-q4f16_1-MLC';
  // WebLLM defaults to 4K tokens; Qwen3 supports 32K. 16K fits most transcripts in one pass
  // while keeping GPU memory moderate
  const WEBLLM_CONTEXT_WINDOW = 16384;
  // Transcript characters per request, assuming about one token per Chinese character and
  // leaving room in the context window for the prompt and the summary
  const WEBLLM_CHUNK_CHARS = 12000;
  let webllmEnginePromise = null;
  let webllmWorker = null;
  let webllmProgressHandler = null;

  const OLLAMA_MODEL = 'gemma3:12b';
  let ollamaUrl = '';

  // Status shown on the LLM settings page.
  // WebLLM: checking | unsupported | not-downloaded | downloaded | loading | loaded | error
  let webllmState = { status: 'checking', progress: 0, busy: false, message: '' };
  // Ollama: not-configured | checking | ok | model-missing | unreachable
  let ollamaState = { status: 'not-configured', message: '' };

  function switchTab(tabName) {
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'llm-config') {
      refreshWebLLMCacheStatus();
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

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

  function setSelectedLLM(value, save) {
    selectedLLM = value === 'ollama' ? 'ollama' : 'webllm';
    llmSelect.value = selectedLLM;
    llmModeRadios.forEach(radio => { radio.checked = radio.value === selectedLLM; });
    if (save) {
      chrome.storage.local.set({ 'selectedLLM': selectedLLM }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error saving LLM selection:', chrome.runtime.lastError);
        }
      });
    }
    renderLLMSettings();
  }

  function loadLLMSelection() {
    chrome.storage.local.get(['selectedLLM'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading LLM selection:', chrome.runtime.lastError);
        return;
      }
      // Older versions stored 'gemini'; anything other than Ollama falls back to WebLLM
      setSelectedLLM(result.selectedLLM, false);
    });
  }

  const WEBLLM_BADGES = {
    'checking': ['Checking…', ''],
    'unsupported': ['WebGPU unavailable', 'error'],
    'not-downloaded': ['Not downloaded', ''],
    'downloaded': ['Downloaded', 'ok'],
    'loading': ['Loading', 'busy'],
    'loaded': ['Ready', 'ok'],
    'error': ['Error', 'error']
  };

  const OLLAMA_BADGES = {
    'not-configured': ['Not configured', ''],
    'checking': ['Checking…', 'busy'],
    'ok': ['Connected', 'ok'],
    'model-missing': ['Model missing', 'warn'],
    'unreachable': ['Not reachable', 'error']
  };

  function setBadge(element, [text, tone]) {
    element.textContent = text;
    element.className = tone ? `badge ${tone}` : 'badge';
  }

  // Short status line and dot color for the "Currently using" card
  function describeActiveLLM() {
    if (selectedLLM === 'ollama') {
      switch (ollamaState.status) {
        case 'ok': return ['ok', `Connected to ${ollamaUrl}`];
        case 'checking': return ['', 'Checking connection…'];
        case 'model-missing': return ['warn', `Connected, but ${OLLAMA_MODEL} isn't installed`];
        case 'unreachable': return ['error', `Can't reach Ollama at ${ollamaUrl}`];
        default: return ['error', 'Set the Ollama server URL below'];
      }
    }
    switch (webllmState.status) {
      case 'loaded': return ['ok', webllmState.busy ? 'Summarizing…' : 'Model loaded and ready'];
      case 'downloaded': return ['ok', 'Downloaded; loads when you summarize'];
      case 'not-downloaded': return ['warn', 'Downloads (about 5 GB) on the first summary'];
      case 'loading': return ['', `Loading model ${Math.round(webllmState.progress * 100)}%`];
      case 'unsupported': return ['error', 'WebGPU is unavailable; switch to Ollama'];
      case 'error': return ['error', 'Model failed to load; see details below'];
      default: return ['', 'Checking…'];
    }
  }

  function renderLLMSettings() {
    const isOllama = selectedLLM === 'ollama';
    currentLlmName.textContent = isOllama ? `Ollama · ${OLLAMA_MODEL}` : 'WebLLM · Qwen3-8B';
    const [tone, statusText] = describeActiveLLM();
    currentLlmDot.className = tone ? `status-dot ${tone}` : 'status-dot';
    currentLlmStatus.textContent = statusText;
    webllmCard.classList.toggle('active', !isOllama);
    ollamaCard.classList.toggle('active', isOllama);

    const webllmBadgeInfo = WEBLLM_BADGES[webllmState.status];
    setBadge(webllmBadge, webllmState.status === 'loading'
      ? [`Loading ${Math.round(webllmState.progress * 100)}%`, 'busy']
      : webllmBadgeInfo);
    webllmProgress.hidden = webllmState.status !== 'loading';
    webllmProgressBar.style.width = `${Math.round(webllmState.progress * 100)}%`;
    webllmMessage.textContent = webllmState.message;
    loadWebllmBtn.textContent = webllmState.status === 'loaded' ? 'Model loaded'
      : webllmState.status === 'downloaded' ? 'Load model' : 'Download & load model';
    loadWebllmBtn.disabled = ['checking', 'unsupported', 'loading', 'loaded'].includes(webllmState.status);
    deleteWebllmBtn.disabled = webllmState.busy
      || !['downloaded', 'loaded', 'error'].includes(webllmState.status);

    setBadge(ollamaBadge, OLLAMA_BADGES[ollamaState.status]);
    ollamaMessage.textContent = ollamaState.message;
    testOllamaBtn.disabled = !ollamaUrl || ollamaState.status === 'checking';
    clearOllamaUrlBtn.disabled = !ollamaUrl;
  }

  function setWebLLMState(changes) {
    webllmState = { ...webllmState, ...changes };
    renderLLMSettings();
  }

  function setOllamaState(changes) {
    ollamaState = { ...ollamaState, ...changes };
    renderLLMSettings();
  }

  async function checkWebGPU() {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
    if (!adapter) {
      webgpuStatus.textContent = 'Not available (check chrome://gpu)';
      setWebLLMState({
        status: 'unsupported',
        message: 'This browser cannot use WebGPU, so WebLLM cannot run here. Use Ollama instead.'
      });
      return false;
    }
    const gpuName = [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(' ');
    webgpuStatus.textContent = gpuName ? `Available (${gpuName})` : 'Available';
    return true;
  }

  // Updates the downloaded / not-downloaded status unless the model is loading or loaded
  async function refreshWebLLMCacheStatus() {
    if (!['checking', 'not-downloaded', 'downloaded'].includes(webllmState.status)) return;
    try {
      const webllm = await import('./vendor/web-llm/web-llm.js');
      const cached = await webllm.hasModelInCache(WEBLLM_MODEL_ID);
      if (['checking', 'not-downloaded', 'downloaded'].includes(webllmState.status)) {
        setWebLLMState({ status: cached ? 'downloaded' : 'not-downloaded' });
      }
    } catch (error) {
      console.error('Error checking WebLLM cache:', error);
      setWebLLMState({ status: 'not-downloaded' });
    }
  }

  async function initWebLLMStatus() {
    if (await checkWebGPU()) {
      await refreshWebLLMCacheStatus();
    }
  }

  function loadWebLLMModel() {
    // Errors are shown through webllmState
    getWebLLMEngine().catch(() => {});
  }

  async function deleteWebLLMModel() {
    if (!confirm('Delete the downloaded Qwen3-8B model (about 5 GB)? It will download again the next time you summarize with WebLLM.')) {
      return;
    }
    deleteWebllmBtn.disabled = true;
    try {
      if (webllmEnginePromise) {
        const engine = await webllmEnginePromise.catch(() => null);
        await engine?.unload().catch(() => {});
        webllmWorker?.terminate();
        webllmWorker = null;
        webllmEnginePromise = null;
      }
      const webllm = await import('./vendor/web-llm/web-llm.js');
      await webllm.deleteModelAllInfoInCache(WEBLLM_MODEL_ID);
      setWebLLMState({ status: 'not-downloaded', progress: 0, message: 'Model deleted from Chrome\'s cache.' });
    } catch (error) {
      console.error('Error deleting WebLLM model:', error);
      setWebLLMState({ message: 'Could not delete the model: ' + error.message });
    }
  }

  function loadOllamaUrl() {
    chrome.storage.local.get(['ollamaUrl'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading Ollama URL:', chrome.runtime.lastError);
        return;
      }
      ollamaUrl = result.ollamaUrl || '';
      ollamaUrlInput.value = ollamaUrl;
      if (ollamaUrl) {
        testOllamaConnection();
      } else {
        setOllamaState({ status: 'not-configured', message: '' });
      }
    });
  }

  function saveOllamaUrl() {
    const url = ollamaUrlInput.value.trim().replace(/\/+$/, '');

    if (!/^https?:\/\/.+/.test(url)) {
      setOllamaState({ message: 'Enter a URL starting with http:// or https://, e.g. http://localhost:11434' });
      return;
    }

    chrome.storage.local.set({ 'ollamaUrl': url }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error saving Ollama URL:', chrome.runtime.lastError);
        setOllamaState({ message: 'Could not save the Ollama URL.' });
        return;
      }
      ollamaUrl = url;
      ollamaUrlInput.value = url;
      testOllamaConnection();
    });
  }

  function clearOllamaUrl() {
    if (!confirm('Clear the Ollama server URL?')) return;
    chrome.storage.local.remove(['ollamaUrl'], function() {
      if (chrome.runtime.lastError) {
        console.error('Error clearing Ollama URL:', chrome.runtime.lastError);
        return;
      }
      ollamaUrl = '';
      ollamaUrlInput.value = '';
      setOllamaState({ status: 'not-configured', message: '' });
    });
  }

  // Checks that the server answers and has the model installed
  async function testOllamaConnection() {
    if (!ollamaUrl) return;
    setOllamaState({ status: 'checking', message: '' });
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        setOllamaState({
          status: 'unreachable',
          message: response.status === 403
            ? 'Ollama refused the request (403). Allow the extension by setting OLLAMA_ORIGINS="chrome-extension://*" and restarting Ollama.'
            : `Ollama answered with an error (${response.status} ${response.statusText}).`
        });
        return;
      }
      const data = await response.json();
      const modelNames = (data.models || []).map(model => model.name);
      if (modelNames.includes(OLLAMA_MODEL)) {
        setOllamaState({ status: 'ok', message: `${OLLAMA_MODEL} is installed and ready.` });
      } else {
        setOllamaState({
          status: 'model-missing',
          message: `Ollama is running, but ${OLLAMA_MODEL} isn't installed. Run: ollama pull ${OLLAMA_MODEL}`
        });
      }
    } catch (error) {
      setOllamaState({
        status: 'unreachable',
        message: `Can't reach Ollama at ${ollamaUrl}. Make sure Ollama is running and the URL is correct.`
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  }

  function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  async function getYouTubeVideoTitle(url) {
    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.title || null;
    } catch (error) {
      console.error('Error fetching video title:', error);
      return null;
    }
  }

  function requestYouTubeSubtitles(videoId, language, openTabIfNeeded) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'getYouTubeSubtitles', videoId: videoId, language: language, openTabIfNeeded: openTabIfNeeded },
        (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // Reads subtitles from a tab with the video open, asking before opening a temporary tab.
  // Returns undefined if the user declines to open the tab.
  async function getYouTubeSubtitles(videoId, language = 'en') {
    const response = await requestYouTubeSubtitles(videoId, language, false);
    if (!response.needsTab) {
      return response.subtitles;
    }
    if (!confirm('To get the subtitles, this video will be opened in a new tab (muted). The tab will close automatically when done. Continue?')) {
      return undefined;
    }
    return (await requestYouTubeSubtitles(videoId, language, true)).subtitles;
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
      try {
        subtitles = await getYouTubeSubtitles(videoId, selectedLanguage);
      } catch (error) {
        console.error('Error getting subtitles:', error);
      }
      if (subtitles === undefined) {
        addUrlBtn.disabled = false;
        addUrlBtn.textContent = 'Add URL';
        return;
      }
      if (!subtitles) {
        alert('Could not get subtitles for this video. It may not have captions.');
      }
    }

    const title = await getYouTubeVideoTitle(url);

    const urlObject = {
      url: url,
      title: title,
      subtitles: subtitles,
      summary: null,
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

  async function callOllamaAPI(subtitles) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['ollamaUrl'], async function(result) {
        if (chrome.runtime.lastError) {
          reject(new Error('Error accessing Ollama URL: ' + chrome.runtime.lastError.message));
          return;
        }

        if (!result.ollamaUrl) {
          reject(new Error('No Ollama URL configured. Please add your Ollama URL in the LLM settings tab.'));
          return;
        }

        try {
          const ollamaUrl = result.ollamaUrl.endsWith('/') ? result.ollamaUrl.slice(0, -1) : result.ollamaUrl;
          const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: OLLAMA_MODEL,
              prompt: `${SUMMARY_PROMPT}\n\n${subtitlesToText(subtitles)}`,
              stream: false
            })
          });

          if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          if (data.response) {
            resolve(data.response);
          } else {
            reject(new Error('No summary generated by Ollama API'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function subtitlesToText(subtitles) {
    return Array.isArray(subtitles) ? subtitles.join('\n') : String(subtitles);
  }

  // Loads Qwen3-8B in a web worker once per side panel session. The first load downloads the
  // model (about 5 GB) into Chrome's cache; later loads read it from there.
  function getWebLLMEngine() {
    if (!webllmEnginePromise) {
      webllmEnginePromise = (async () => {
        if (!navigator.gpu) {
          throw new Error('WebGPU is not available in this browser. Choose Ollama in the Summarization LLM menu instead.');
        }
        setWebLLMState({ status: 'loading', progress: 0, message: '' });
        const webllm = await import('./vendor/web-llm/web-llm.js');
        webllmWorker = new Worker(new URL('webllm-worker.js', location.href), { type: 'module' });
        try {
          const engine = await webllm.CreateWebWorkerMLCEngine(
            webllmWorker,
            WEBLLM_MODEL_ID,
            {
              initProgressCallback: (report) => {
                setWebLLMState({ progress: report.progress });
                webllmProgressHandler?.(report);
              }
            },
            { context_window_size: WEBLLM_CONTEXT_WINDOW }
          );
          setWebLLMState({ status: 'loaded', progress: 1 });
          return engine;
        } catch (error) {
          webllmWorker.terminate();
          webllmWorker = null;
          throw error;
        }
      })();
      webllmEnginePromise.catch((error) => {
        webllmEnginePromise = null;
        if (webllmState.status !== 'unsupported') {
          setWebLLMState({ status: 'error', message: 'Could not load the model: ' + error.message });
        }
      });
    }
    return webllmEnginePromise;
  }

  async function generateWithWebLLM(engine, prompt) {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: '你是一個擅長總結影片內容的助手，請使用繁體中文回答。' },
        { role: 'user', content: prompt }
      ],
      extra_body: { enable_thinking: false }
    });
    // Drop any reasoning block in case the model still emits one
    return reply.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  // onStatus receives short progress messages for the summarize button
  async function callWebLLM(subtitles, onStatus) {
    webllmProgressHandler = (report) => onStatus(`Loading model ${Math.round(report.progress * 100)}%`);
    let engine;
    try {
      engine = await getWebLLMEngine();
    } finally {
      webllmProgressHandler = null;
    }

    // Split long transcripts on line boundaries into chunks that fit the context window
    const chunks = [''];
    for (const line of subtitlesToText(subtitles).split('\n')) {
      if (chunks[chunks.length - 1].length + line.length > WEBLLM_CHUNK_CHARS && chunks[chunks.length - 1]) {
        chunks.push('');
      }
      chunks[chunks.length - 1] += line + '\n';
    }

    if (chunks.length === 1) {
      onStatus('Summarizing...');
      return generateWithWebLLM(engine, `${SUMMARY_PROMPT}\n\n${chunks[0]}`);
    }

    // Too long for one pass: note each part's key points, then summarize the notes
    const notes = [];
    for (const [index, chunk] of chunks.entries()) {
      onStatus(`Summarizing part ${index + 1}/${chunks.length}...`);
      notes.push(await generateWithWebLLM(engine,
        `以下是YouTube影片台詞的第${index + 1}部分（共${chunks.length}部分），請條列這部分的重點：\n\n${chunk}`));
    }
    onStatus('Combining summary...');
    return generateWithWebLLM(engine, `${SUMMARY_PROMPT}\n\n${notes.join('\n\n')}`);
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
      let summary;
      if (selectedLLM === 'ollama') {
        summary = await callOllamaAPI(urlItem.subtitles);
      } else {
        setWebLLMState({ busy: true });
        try {
          summary = await callWebLLM(urlItem.subtitles, (status) => {
            if (summarizeButton) summarizeButton.textContent = status;
          });
        } finally {
          setWebLLMState({ busy: false });
        }
      }
      // Persist the summary on the item so it survives reloads, overriding any previous result
      urlItem.summary = summary;
      saveUrlsToStorage(allUrls);
      showSummaryPopup(summary, url);
      displayUrls();
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
        const title = typeof item === 'object' && item.title ? item.title : null;
        const subtitles = typeof item === 'object' && item.subtitles ? item.subtitles : null;
        const summary = typeof item === 'object' && item.summary ? item.summary : null;
        const dateAdded = typeof item === 'object' && item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : '';

        return `
          <div class="url-item">
            <div class="url-text">
              ${title ? `<div class="video-title">${escapeHtml(title)}</div>` : ''}
              <a href="${url}" target="_blank">${url}</a>
              ${dateAdded ? `<small style="color: #666; display: block;">Added: ${dateAdded}</small>` : ''}
              ${subtitles ? `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #007acc;">Subtitles</summary><div style="max-height: 150px; overflow-y: auto; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px; margin-top: 4px;">${subtitles}</div></details>` : '<small style="color: #999;">No subtitles available</small>'}
              ${summary ? `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #007acc;">Summary</summary><div style="max-height: 200px; overflow-y: auto; padding: 8px; background: #eef7ff; border-radius: 4px; font-size: 12px; margin-top: 4px; white-space: pre-wrap;">${escapeHtml(summary)}</div></details>` : ''}
            </div>
            <div class="button-group">
              <button class="delete-btn" data-url="${url}" data-index="${startIndex + index}">Delete</button>
              <button class="summarize-btn" data-url="${url}" data-index="${startIndex + index}">${summary ? 'Re-summarize' : 'Summarize'}</button>
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
  saveOllamaUrlBtn.addEventListener('click', saveOllamaUrl);
  clearOllamaUrlBtn.addEventListener('click', clearOllamaUrl);
  searchBtn.addEventListener('click', searchVideos);
  clearSearchBtn.addEventListener('click', clearSearch);

  youtubeUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addUrl();
    }
  });

  ollamaUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveOllamaUrl();
    }
  });

  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      searchVideos();
    }
  });

  llmSelect.addEventListener('change', () => setSelectedLLM(llmSelect.value, true));
  llmModeRadios.forEach(radio => {
    radio.addEventListener('change', () => setSelectedLLM(radio.value, true));
  });
  testOllamaBtn.addEventListener('click', testOllamaConnection);
  loadWebllmBtn.addEventListener('click', loadWebLLMModel);
  deleteWebllmBtn.addEventListener('click', deleteWebLLMModel);

  renderLLMSettings();
  loadUrlsFromStorage();
  loadOllamaUrl();
  loadLLMSelection();
  initWebLLMStatus();
  updateTime();
  updateTabInfo();

  setInterval(updateTime, 1000);
  setInterval(updateTabInfo, 5000);
});
