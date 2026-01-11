// ShareSafe Settings Script

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const sightengineUserInput = document.getElementById('sightengine-user');
  const sightengineSecretInput = document.getElementById('sightengine-secret');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');
  const currentKeyDiv = document.getElementById('current-key');
  const maskedKeySpan = document.getElementById('masked-key');
  
  // New settings controls
  const enabledToggle = document.getElementById('enabled-toggle');
  const segmentAnalysisToggle = document.getElementById('segment-analysis-toggle');
  const imageAnalysisToggle = document.getElementById('image-analysis-toggle');
  const llmTiebreakerToggle = document.getElementById('llm-tiebreaker-toggle');
  const excludeListTextarea = document.getElementById('exclude-list');
  const includeListTextarea = document.getElementById('include-list');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const cacheStatsDiv = document.getElementById('cache-stats');
  
  // Add LLM status indicator
  const llmStatusDiv = document.createElement('div');
  llmStatusDiv.id = 'llm-status';
  llmStatusDiv.style.cssText = `
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  `;

  // Load all settings
  try {
    const data = await chrome.storage.sync.get([
      'geminiApiKey',
      'sightengineUser',
      'sightengineSecret',
      'extensionEnabled',
      'segmentAnalysis',
      'imageAnalysis',
      'llmTiebreaker',
      'excludeList',
      'includeList'
    ]);
    
    // API Key
    if (data.geminiApiKey) {
      const key = data.geminiApiKey;
      const masked = '••••••••' + key.slice(-4);
      maskedKeySpan.textContent = masked;
      currentKeyDiv.style.display = 'block';
      
      // Show LLM available status
      llmStatusDiv.style.background = '#dcfce7';
      llmStatusDiv.style.color = '#16a34a';
      llmStatusDiv.innerHTML = '✅ LLM Tie-Breaker Available - API key configured';
    } else {
      // Show statistical only status
      llmStatusDiv.style.background = '#eff6ff';
      llmStatusDiv.style.color = '#3b82f6';
      llmStatusDiv.innerHTML = '📊 Statistical Analysis Mode - Works great without API key!';
    }
    
    // Sightengine Credentials
    if (data.sightengineUser) {
      sightengineUserInput.value = data.sightengineUser;
    }
    if (data.sightengineSecret) {
      sightengineSecretInput.value = data.sightengineSecret;
    }
    
    // Insert status after save button
    saveBtn.parentElement.insertBefore(llmStatusDiv, saveBtn.nextSibling);
    
    // Extension enabled (default: true)
    enabledToggle.checked = data.extensionEnabled !== false;
    
    // Segment analysis (default: true)
    segmentAnalysisToggle.checked = data.segmentAnalysis !== false;
    
    // Image analysis (default: true)
    imageAnalysisToggle.checked = data.imageAnalysis !== false;
    
    // LLM tiebreaker (default: false - only use when uncertain)
    llmTiebreakerToggle.checked = data.llmTiebreaker === true;
    
    // Exclude/Include lists
    excludeListTextarea.value = (data.excludeList || []).join('\n');
    includeListTextarea.value = (data.includeList || []).join('\n');
    
  } catch (e) {
    console.error('Error loading settings:', e);
  }

  // Load cache stats
  updateCacheStats();

  // Save API Key
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const sightengineUser = sightengineUserInput.value.trim();
    const sightengineSecret = sightengineSecretInput.value.trim();

    // Validate Gemini API key if provided
    if (key && key.length < 20) {
      showStatus('Gemini API key seems too short', 'error');
      return;
    }

    try {
      const dataToSave = {};
      
      // Save Gemini API key if provided
      if (key) {
        dataToSave.geminiApiKey = key;
      }
      
      // Save Sightengine credentials if both provided
      if (sightengineUser && sightengineSecret) {
        dataToSave.sightengineUser = sightengineUser;
        dataToSave.sightengineSecret = sightengineSecret;
      }
      
      await chrome.storage.sync.set(dataToSave);
      
      // Update UI for Gemini key
      if (key) {
        const masked = '••••••••' + key.slice(-4);
        maskedKeySpan.textContent = masked;
        currentKeyDiv.style.display = 'block';
        apiKeyInput.value = '';
        
        // Update LLM status
        llmStatusDiv.style.background = '#dcfce7';
        llmStatusDiv.style.color = '#16a34a';
        llmStatusDiv.innerHTML = '✅ LLM Tie-Breaker Available - API key configured';
      }
      
      showStatus('API credentials saved successfully!', 'success');
    } catch (e) {
      console.error('Error saving API credentials:', e);
      showStatus('Failed to save API credentials', 'error');
    }
  });

  // Save settings on change
  enabledToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ extensionEnabled: enabledToggle.checked });
    showStatus('Settings saved', 'success');
  });

  segmentAnalysisToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ segmentAnalysis: segmentAnalysisToggle.checked });
    showStatus('Settings saved', 'success');
  });

  imageAnalysisToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ imageAnalysis: imageAnalysisToggle.checked });
    showStatus('Settings saved', 'success');
  });

  llmTiebreakerToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ llmTiebreaker: llmTiebreakerToggle.checked });
    showStatus('Settings saved', 'success');
  });

  // Save exclude/include lists
  document.getElementById('save-lists-btn').addEventListener('click', async () => {
    const excludeList = excludeListTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const includeList = includeListTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    await chrome.storage.sync.set({ excludeList, includeList });
    showStatus('Lists saved successfully!', 'success');
  });

  // Clear cache
  clearCacheBtn.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove(['cache_page', 'cache_segment', 'cache_image']);
      showStatus('Cache cleared successfully!', 'success');
      updateCacheStats();
    } catch (e) {
      console.error('Error clearing cache:', e);
      showStatus('Failed to clear cache', 'error');
    }
  });

  async function updateCacheStats() {
    try {
      const data = await chrome.storage.local.get(['cache_page', 'cache_segment', 'cache_image']);
      const pageCount = Object.keys(data.cache_page || {}).length;
      const segmentCount = Object.keys(data.cache_segment || {}).length;
      const imageCount = Object.keys(data.cache_image || {}).length;
      
      cacheStatsDiv.innerHTML = `
        <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">
          Pages: ${pageCount} • Segments: ${segmentCount} • Images: ${imageCount}
        </div>
      `;
    } catch (e) {
      console.error('Error loading cache stats:', e);
    }
  }

  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = 'status ' + type;
    
    setTimeout(() => {
      statusMsg.className = 'status';
    }, 3000);
  }

  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
