if (typeof window.extensionSidePanel === 'undefined') {
  window.extensionSidePanel = {
    sidePanel: null,
    isVisible: false
  };
}

function createSidePanel() {
  if (window.extensionSidePanel.sidePanel) return;

  window.extensionSidePanel.sidePanel = document.createElement('div');
  window.extensionSidePanel.sidePanel.id = 'chrome-extension-sidepanel';
  window.extensionSidePanel.sidePanel.innerHTML = `
    <div class="sidepanel-header">
      <h2>Side Panel App</h2>
      <button id="closeSidePanel">×</button>
    </div>
    <div class="sidepanel-content">
      <div class="content">
        <h3>Welcome to your Side Panel!</h3>
        <p>This extension opens on any web page.</p>
        
        <div class="features">
          <h4>Features:</h4>
          <ul>
            <li>Works on any website</li>
            <li>Always accessible</li>
            <li>Doesn't interfere with page content</li>
          </ul>
        </div>
        
        <div class="actions">
          <button id="refreshBtn">Refresh Content</button>
          <button id="settingsBtn">Settings</button>
        </div>
        
        <div class="info">
          <p id="currentTime"></p>
          <p id="tabInfo">Current URL: ${window.location.href}</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(window.extensionSidePanel.sidePanel);

  document.getElementById('closeSidePanel').addEventListener('click', hideSidePanel);
  document.getElementById('refreshBtn').addEventListener('click', updateContent);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    alert('Settings feature coming soon!');
  });

  updateTime();
  setInterval(updateTime, 1000);
}

function showSidePanel() {
  if (!window.extensionSidePanel.sidePanel) {
    createSidePanel();
  }
  window.extensionSidePanel.sidePanel.style.display = 'block';
  setTimeout(() => {
    window.extensionSidePanel.sidePanel.classList.add('visible');
  }, 10);
  window.extensionSidePanel.isVisible = true;
}

function hideSidePanel() {
  if (window.extensionSidePanel.sidePanel) {
    window.extensionSidePanel.sidePanel.classList.remove('visible');
    setTimeout(() => {
      window.extensionSidePanel.sidePanel.style.display = 'none';
    }, 300);
  }
  window.extensionSidePanel.isVisible = false;
}

function toggleSidePanel() {
  if (window.extensionSidePanel.isVisible) {
    hideSidePanel();
  } else {
    showSidePanel();
  }
}

function updateContent() {
  const tabInfo = document.getElementById('tabInfo');
  if (tabInfo) {
    tabInfo.textContent = `Current URL: ${window.location.href}`;
  }
}

function updateTime() {
  const timeElement = document.getElementById('currentTime');
  if (timeElement) {
    timeElement.textContent = `Current time: ${new Date().toLocaleTimeString()}`;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleSidePanel') {
    toggleSidePanel();
    sendResponse({success: true});
  }
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    toggleSidePanel();
  }
});