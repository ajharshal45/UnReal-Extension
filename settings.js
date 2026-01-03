// ShareSafe Settings Script

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');
  const currentKeyDiv = document.getElementById('current-key');
  const maskedKeySpan = document.getElementById('masked-key');

  // Load existing key
  try {
    const data = await chrome.storage.sync.get(['geminiApiKey']);
    if (data.geminiApiKey) {
      const key = data.geminiApiKey;
      // Show masked version
      const masked = '••••••••' + key.slice(-4);
      maskedKeySpan.textContent = masked;
      currentKeyDiv.style.display = 'block';
    }
  } catch (e) {
    console.error('Error loading API key:', e);
  }

  // Save button handler
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();

    if (!key) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    // Basic validation (Gemini keys are typically 39 chars)
    if (key.length < 20) {
      showStatus('API key seems too short', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ geminiApiKey: key });
      
      // Update display
      const masked = '••••••••' + key.slice(-4);
      maskedKeySpan.textContent = masked;
      currentKeyDiv.style.display = 'block';
      apiKeyInput.value = '';
      
      showStatus('API key saved successfully!', 'success');
    } catch (e) {
      console.error('Error saving API key:', e);
      showStatus('Failed to save API key', 'error');
    }
  });

  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = 'status ' + type;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusMsg.className = 'status';
    }, 3000);
  }

  // Allow Enter key to save
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
