# Integration Guide - Unified AI Detection System

## Overview
This guide helps you integrate the newly merged text detection features with the existing image detection system in the UnReal Chrome extension.

## Architecture

### Current System Components

#### Frontend (Chrome Extension)
- **Location:** `/extension/`
- **Key Files:**
  - `contentNew.js` - Content script (runs on web pages)
  - `backgroundNew.js` - Service worker
  - `popup.js` - Extension popup UI
  - `patternDatabase.js` - NEW: Text pattern database
  - `socialMediaScanner.js` - NEW: Social media scanning

#### Backend Services
- **Image Detection:** `backend/server.py` (Port 8000, FastAPI)
- **Text Detection:** `backend/text_detector.py` (Port 8001, Flask)

## Integration Steps

### 1. Update Content Script for Text Detection

The content script needs to call the text detection API when analyzing text content.

**File to modify:** `extension/contentNew.js`

```javascript
// Import the new modules
import { AI_PHRASES } from './patternDatabase.js';
import { detectPlatform, extractPostContent } from './socialMediaScanner.js';

// Add text detection function
async function analyzeText(text) {
    try {
        // First, try pattern-based detection (fast, no API needed)
        const patternScore = checkPatterns(text);
        
        // If pattern score is inconclusive (40-60%), call ML backend
        if (patternScore > 40 && patternScore < 60) {
            const response = await fetch('http://localhost:8001/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    score: data.ai_score,
                    confidence: data.confidence,
                    method: 'ml',
                    details: data
                };
            }
        }
        
        return {
            score: patternScore,
            confidence: 70,
            method: 'pattern'
        };
    } catch (error) {
        console.error('Text analysis error:', error);
        return null;
    }
}

function checkPatterns(text) {
    // Use patterns from patternDatabase.js
    let totalScore = 0;
    let matchCount = 0;
    
    for (const category in AI_PHRASES) {
        for (const phrase of AI_PHRASES[category]) {
            if (phrase.pattern.test(text)) {
                totalScore += phrase.score;
                matchCount++;
            }
        }
    }
    
    return matchCount > 0 ? totalScore / matchCount : 0;
}
```

### 2. Enable Social Media Scanner

**File to modify:** `extension/contentNew.js`

Add at the top of the content script:

```javascript
import { detectPlatform, extractPostContent, PLATFORM_SELECTORS } from './socialMediaScanner.js';

// Detect current platform
const platform = detectPlatform();
console.log('Platform detected:', platform);

// Scan based on platform
if (platform !== 'generic') {
    const selectors = PLATFORM_SELECTORS[platform];
    
    // Set up mutation observer for dynamic content
    const observer = new MutationObserver((mutations) => {
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                const content = extractPostContent(element);
                if (content) {
                    analyzeText(content.text).then(result => {
                        if (result && result.score > 70) {
                            highlightElement(element, result);
                        }
                    });
                }
            });
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
```

### 3. Update Manifest Resources

Already done! The manifest now includes:
```json
"web_accessible_resources": [
    {
        "resources": [
            "patternDatabase.js",
            "socialMediaScanner.js"
        ]
    }
]
```

### 4. Update Background Service Worker

**File to modify:** `extension/backgroundNew.js`

Add health check for text backend:

```javascript
// Check if both backends are running
async function checkBackendHealth() {
    const checks = {
        image: false,
        text: false
    };
    
    try {
        const imageResponse = await fetch('http://localhost:8000/health');
        checks.image = imageResponse.ok;
    } catch (e) {
        console.warn('Image backend not available');
    }
    
    try {
        const textResponse = await fetch('http://localhost:8001/detect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'test' })
        });
        checks.text = textResponse.ok;
    } catch (e) {
        console.warn('Text backend not available');
    }
    
    return checks;
}

// Store backend status
chrome.storage.local.set({ backendStatus: checks });
```

### 5. Update Popup UI

**File to modify:** `extension/popup.js`

Add backend status indicators:

```javascript
async function updateBackendStatus() {
    const { backendStatus } = await chrome.storage.local.get('backendStatus');
    
    const statusHTML = `
        <div class="backend-status">
            <div class="status-item">
                <span>Image Detection:</span>
                <span class="${backendStatus.image ? 'online' : 'offline'}">
                    ${backendStatus.image ? '✓ Online' : '✗ Offline'}
                </span>
            </div>
            <div class="status-item">
                <span>Text Detection:</span>
                <span class="${backendStatus.text ? 'online' : 'offline'}">
                    ${backendStatus.text ? '✓ Online' : '✗ Offline'}
                </span>
            </div>
        </div>
    `;
    
    document.getElementById('backend-status').innerHTML = statusHTML;
}
```

## Testing Checklist

### Backend Testing
- [ ] Start image backend: `python backend/server.py`
- [ ] Start text backend: `python backend/text_detector.py`
- [ ] Test image endpoint: `curl -X POST http://localhost:8000/analyze`
- [ ] Test text endpoint: `curl -X POST http://localhost:8001/detect -H "Content-Type: application/json" -d '{"text":"test"}'`

### Extension Testing
- [ ] Load extension in Chrome
- [ ] Check console for import errors
- [ ] Visit Twitter/X and check if posts are scanned
- [ ] Visit a page with AI-generated text
- [ ] Check if text detection highlights work
- [ ] Verify popup shows backend status
- [ ] Test image detection still works

### Platform-Specific Testing
- [ ] Twitter/X posts
- [ ] Instagram captions
- [ ] Reddit comments
- [ ] LinkedIn posts
- [ ] Generic blog posts

## API Usage Examples

### Text Detection API

```bash
# Basic text analysis
curl -X POST http://localhost:8001/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "As an AI language model, I cannot provide personal opinions."}'

# Response
{
  "ai_score": 95.0,
  "human_score": 5.0,
  "confidence": 90,
  "model": "roberta-base-openai-detector",
  "is_formal_style": true,
  "text_length": 15,
  "note": "Analysis complete"
}
```

### Image Detection API

```bash
# Image analysis
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"image": "base64_encoded_image_data"}'

# Response
{
  "success": true,
  "score": 75,
  "confidence": 50,
  "modelName": "dima806/ai_vs_real_image_detection"
}
```

## Configuration Options

### Text Detection Tuning

Edit `backend/text_detector.py`:

```python
# Adjust minimum word count
MIN_WORDS = 15  # Lower = more sensitive, Higher = more accurate

# Adjust confidence thresholds
if word_count < 50 and confidence > 50:
    confidence = 50  # Cap confidence for short text
```

### Pattern Detection Tuning

Edit `extension/patternDatabase.js`:

```javascript
// Adjust pattern scores (0-100)
{
    pattern: /as an ai/i,
    score: 95,  // Increase for stronger signal
    category: 'self-disclosure'
}
```

## Performance Considerations

### Backend Performance
- **Text Detection:** ~50-200ms per request (CPU)
- **Image Detection:** ~150-500ms per request (CPU), ~50-150ms (GPU)
- **Pattern Matching:** <5ms per text (no backend needed)

### Optimization Tips
1. **Use pattern matching first** - Fast and no API call needed
2. **Cache results** - Don't re-analyze same content
3. **Batch requests** - Group multiple texts together
4. **Debounce scanning** - Wait for user to stop scrolling

### Resource Usage
- **RAM:** ~3GB for both models loaded
- **CPU:** Light during inference
- **Network:** Only localhost calls (no external APIs)

## Troubleshooting

### Backend Not Starting
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install -r backend/requirements.txt

# Check port availability
lsof -i :8000  # Image backend
lsof -i :8001  # Text backend
```

### Extension Errors
```javascript
// Check console for errors
// Common issues:
// - Module import errors: Ensure manifest.json has correct resources
// - CORS errors: Ensure backends have CORS enabled
// - Backend offline: Check backend status in popup
```

### Model Download Issues
```bash
# Text model will download automatically on first run
# If download fails, manually download:
cd ~
mkdir -p .cache/huggingface/transformers
# Visit: https://huggingface.co/openai-community/roberta-base-openai-detector
```

## Next Steps

1. **Implement Frontend Integration** - Follow steps 1-5 above
2. **Test on Multiple Platforms** - Use the testing checklist
3. **Tune Detection Thresholds** - Adjust based on false positive rates
4. **Add UI Indicators** - Show both image and text analysis in popup
5. **Performance Testing** - Monitor resource usage during scanning

## Support Resources

- **Backend README:** `extension/backend/README.md`
- **Merge Summary:** `MERGE_SUMMARY.md`
- **Pattern Database:** `extension/patternDatabase.js` (inline documentation)
- **Social Scanner:** `extension/socialMediaScanner.js` (inline documentation)

## Contributing

When adding new features:
1. Keep image and text detection independent
2. Use the pattern database for fast checks
3. Fall back to ML for uncertain cases
4. Document port changes in README
5. Update this integration guide
