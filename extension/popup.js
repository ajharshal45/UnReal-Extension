// UnReal Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const loadingStatus = document.getElementById('loading-status');
  const resultsDiv = document.getElementById('results');
  const pageUrl = document.getElementById('page-url');
  const riskBadge = document.getElementById('risk-badge');
  const scoreValue = document.getElementById('score-value');
  const reasonsList = document.getElementById('reasons-list');
  const summaryText = document.getElementById('summary-text');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsToggle = document.getElementById('settings-toggle');
  const disabledNotice = document.getElementById('disabled-notice');
  const clearCacheBtn = document.getElementById('clear-cache-btn');

  // Settings toggles
  const enabledToggle = document.getElementById('enabled-toggle');
  const segmentToggle = document.getElementById('segment-toggle');
  const imageToggle = document.getElementById('image-toggle');
  const llmToggle = document.getElementById('llm-toggle');

  // FIX: Promisified storage wrapper for chrome.storage.sync.get
  function getSyncStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keys, (result) => resolve(result || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  // Promise wrapper for chrome.tabs.query
  function queryTabs(query) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(query, (tabs) => resolve(tabs || []));
      } catch (e) { resolve([]); }
    });
  }

  // Promise wrapper for chrome.storage.local.remove
  function removeLocal(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(keys, () => resolve());
      } catch (e) { resolve(); }
    });
  }

  // Load settings
  const settings = await getSyncStorage([
    'extensionEnabled',
    'segmentAnalysis',
    'imageAnalysis',
    'llmTiebreaker'
  ]);

  enabledToggle.checked = settings.extensionEnabled !== false;
  segmentToggle.checked = settings.segmentAnalysis !== false;
  imageToggle.checked = settings.imageAnalysis !== false;
  llmToggle.checked = settings.llmTiebreaker === true;

  // Show disabled notice if extension is off
  if (settings.extensionEnabled === false) {
    disabledNotice.classList.add('visible');
  }

  // Settings toggle button
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
  });

  // Handle setting changes
    enabledToggle.addEventListener('change', async () => {
    await new Promise((resolve) => { try { chrome.storage.sync.set({ extensionEnabled: enabledToggle.checked }, () => resolve()); } catch (e) { resolve(); } });
    disabledNotice.classList.toggle('visible', !enabledToggle.checked);
    // Reload current tab to apply changes
    const [tab] = await queryTabs({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.reload(tab.id);
    }
  });

  segmentToggle.addEventListener('change', async () => {
    await new Promise((resolve) => { try { chrome.storage.sync.set({ segmentAnalysis: segmentToggle.checked }, () => resolve()); } catch (e) { resolve(); } });
  });

  imageToggle.addEventListener('change', async () => {
    await new Promise((resolve) => { try { chrome.storage.sync.set({ imageAnalysis: imageToggle.checked }, () => resolve()); } catch (e) { resolve(); } });
  });

  llmToggle.addEventListener('change', async () => {
    await new Promise((resolve) => { try { chrome.storage.sync.set({ llmTiebreaker: llmToggle.checked }, () => resolve()); } catch (e) { resolve(); } });
  });

  // Clear cache button
  clearCacheBtn.addEventListener('click', async () => {
    await removeLocal(['pageCache', 'segmentCache', 'imageCache']);
    clearCacheBtn.textContent = '✓ Cache Cleared';
    setTimeout(() => {
      clearCacheBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
        Clear Cache
      `;
    }, 2000);
  });

  // Get current tab info
  let currentTab = null;
  try {
    const [tab] = await queryTabs({ active: true, currentWindow: true });
    currentTab = tab;
    if (tab?.url) {
      const url = new URL(tab.url);
      const displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname.slice(0, 25) : '');
      const existingSpan = pageUrl.querySelector('span');
      if (existingSpan) existingSpan.remove();
      const urlSpan = document.createElement('span');
      urlSpan.textContent = displayUrl + (url.pathname.length > 25 ? '...' : '');
      pageUrl.appendChild(urlSpan);
    }
  } catch (e) {
    const existingSpan = pageUrl.querySelector('span');
    if (existingSpan) existingSpan.remove();
    const urlSpan = document.createElement('span');
    urlSpan.textContent = 'Unknown page';
    pageUrl.appendChild(urlSpan);
  }

  // Try to get cached results
  chrome.runtime.sendMessage({ type: 'GET_LAST_ANALYSIS' }, async (result) => {
    if (result && result.score !== undefined) {
      loadingStatus.style.display = 'none';
      resultsDiv.style.display = 'block';
      displayResults(result);
      return;
    }

    // No cached result - show message
    loadingStatus.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 40px; height: 40px; margin: 0 auto 12px; stroke: #6b7280;">
        <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <div style="color: #6b7280; font-size: 13px;">Refresh the page to analyze content</div>
    `;
  });

  function displayResults(result) {
    const { riskLevel, score, reasons, summary } = result;

    // Update risk badge
    riskBadge.className = `risk-badge risk-${riskLevel}`;
    riskBadge.textContent = riskLevel === 'high' ? 'High Risk' :
                            riskLevel === 'medium' ? 'Medium Risk' :
                            'Low Risk';

    // Update score
    scoreValue.textContent = score || 0;

    // Update reasons
    reasonsList.innerHTML = '';
    if (reasons && reasons.length > 0) {
      reasons.slice(0, 5).forEach((reason, index) => {
        const li = document.createElement('li');
        li.className = 'reason-item';
        li.innerHTML = `
          <div class="reason-icon">${index + 1}</div>
          <span>${reason}</span>
        `;
        reasonsList.appendChild(li);
      });
    } else {
      reasonsList.innerHTML = `
        <div class="no-issues">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
          No significant AI indicators detected
        </div>
      `;
    }

    // Update summary
    summaryText.textContent = summary || 'Analysis complete. Check the detection signals above for details.';
  }
});
