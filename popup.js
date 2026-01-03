// ShareSafe Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const loadingStatus = document.getElementById('loading-status');
  const resultsDiv = document.getElementById('results');
  const pageUrl = document.getElementById('page-url');
  const riskBadge = document.getElementById('risk-badge');
  const scoreValue = document.getElementById('score-value');
  const reasonsList = document.getElementById('reasons-list');
  const reasonsContainer = document.getElementById('reasons-container');
  const summaryText = document.getElementById('summary-text');
  const demoToggle = document.getElementById('demo-toggle');
  const demoCheckbox = document.getElementById('demo-checkbox');
  const headerArea = document.getElementById('header-area');

  // Triple-click counter for revealing demo toggle
  let clickCount = 0;
  let clickTimer = null;

  headerArea.addEventListener('click', () => {
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);
    
    if (clickCount >= 3) {
      demoToggle.classList.add('visible');
      clickCount = 0;
    } else {
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 500);
    }
  });

  // Get current tab info
  let currentTab = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (tab?.url) {
      const url = new URL(tab.url);
      pageUrl.textContent = url.hostname + url.pathname.slice(0, 30) + (url.pathname.length > 30 ? '...' : '');
    } else {
      pageUrl.textContent = 'Unknown page';
    }
  } catch (e) {
    pageUrl.textContent = 'Unknown page';
  }

  // Get demo mode status
  chrome.runtime.sendMessage({ type: 'GET_DEMO_MODE' }, (response) => {
    if (response) {
      demoCheckbox.checked = response.demoMode;
    }
  });

  // Handle demo mode toggle
  demoCheckbox.addEventListener('change', () => {
    chrome.runtime.sendMessage({ 
      type: 'SET_DEMO_MODE', 
      enabled: demoCheckbox.checked 
    });
  });

  // Try to get cached results first, if none, trigger fresh analysis
  chrome.runtime.sendMessage({ type: 'GET_LAST_ANALYSIS' }, async (result) => {
    if (result) {
      loadingStatus.style.display = 'none';
      resultsDiv.style.display = 'block';
      displayResults(result);
      return;
    }

    // No cached result - trigger analysis from popup
    if (currentTab?.id && currentTab?.url && !currentTab.url.startsWith('chrome')) {
      // Request analysis directly
      chrome.runtime.sendMessage({ 
        type: 'ANALYZE', 
        content: { 
          url: currentTab.url,
          title: currentTab.title || '',
          headline: '',
          description: '',
          bodyText: ''
        } 
      }, (analysisResult) => {
        loadingStatus.style.display = 'none';
        resultsDiv.style.display = 'block';
        if (analysisResult) {
          displayResults(analysisResult);
        } else {
          displayResults({
            riskLevel: 'medium',
            score: 50,
            reasons: ['Could not analyze page'],
            summary: 'Try refreshing the page'
          });
        }
      });
    } else {
      // Can't analyze (chrome:// page, etc.)
      loadingStatus.style.display = 'none';
      resultsDiv.style.display = 'block';
      displayResults({
        riskLevel: 'low',
        score: 0,
        reasons: [],
        summary: 'This page cannot be analyzed'
      });
    }
  });

  function displayResults(result) {
    const { riskLevel, score, reasons, summary } = result;
    
    // Risk badge
    riskBadge.textContent = `${riskLevel} risk`;
    riskBadge.className = 'risk-badge risk-' + riskLevel;

    // Trust score (inverted from risk score)
    const trustScore = 100 - score;
    scoreValue.textContent = trustScore;

    // Color the score based on risk
    const colors = {
      low: '#16a34a',
      medium: '#ea580c',
      high: '#dc2626'
    };
    scoreValue.style.color = colors[riskLevel] || colors.medium;

    // Reasons
    reasonsList.innerHTML = '';
    if (reasons && reasons.length > 0) {
      reasons.forEach(reason => {
        const li = document.createElement('li');
        li.textContent = reason;
        reasonsList.appendChild(li);
      });
    } else {
      reasonsContainer.innerHTML = '<div class="no-issues">✓ No concerns detected</div>';
    }

    // Summary
    summaryText.textContent = summary || 'Analysis complete';
  }
});
