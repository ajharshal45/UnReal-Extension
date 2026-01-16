# Testing Guide - Unified AI Detection System

## Quick Test Steps

### 1. Start Both Backends

**Terminal 1 - Image Detection:**
```bash
cd /home/rachit/Downloads/NEWBRUH/Branch1/extension/backend
python server.py
```
You should see: `Starting server on http://localhost:8000`

**Terminal 2 - Text Detection:**
```bash
cd /home/rachit/Downloads/NEWBRUH/Branch1/extension/backend
python text_detector.py
```
You should see: `Starting server at http://127.0.0.1:8001`

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select: `/home/rachit/Downloads/NEWBRUH/Branch1/extension`
5. The extension should load with no errors

### 3. Check Backend Status

1. Click the UnReal extension icon
2. Click the settings gear icon (⚙️)
3. Scroll to **Backend Status** section
4. Both should show:
   - Image Detection: ✓ Online (green)
   - Text Detection: ✓ Online (green)

### 4. Test Text Detection

**Test on Social Media:**
1. Go to https://twitter.com (or x.com)
2. Open DevTools Console (F12)
3. Look for:
   ```
   [ShareSafe v2.2] Unified AI Detection Active
   [TextDetection] Modules loaded successfully
   [TextDetection] Platform detected: twitter
   [SocialScanner] Starting scan for platform: twitter
   ```
4. Scroll through tweets - AI-detected text should show 🤖 indicator

**Test on Regular Page:**
1. Create a test page with AI-generated text like:
   ```
   "As an AI language model, I cannot provide personal opinions..."
   ```
2. You should see detection indicators

### 5. Test Image Detection

1. Visit a page with images
2. Open DevTools Console
3. Look for:
   ```
   [ImageScanner] Initializing automatic image detection...
   ```
4. AI-generated images should be highlighted

### 6. Test Pattern Detection

Open DevTools Console on any page and run:
```javascript
// This should trigger pattern detection
const testText = "As an AI language model, I must emphasize that it's important to note...";
console.log('Testing pattern detection...');
```

Check for `[TextDetection]` logs showing pattern matches.

## Expected Console Output

### On Page Load:
```
[ShareSafe v2.2] Unified AI Detection Active
[TextDetection] Modules loaded successfully
[TextDetection] Platform detected: twitter (or generic)
[SocialScanner] Starting scan for platform: twitter
ShareSafe: Starting segment-based analysis...
[ImageScanner] Initializing automatic image detection...
```

### On Text Detection:
```
[TextDetection] ML API result: {ai_score: 85.5, confidence: 70, ...}
```

### On Backend Health Check:
```
[Background] Checking backend health...
[Background] Backend status: {image: true, text: true, lastCheck: 1737046800000}
```

## Common Issues & Solutions

### Backend Shows Offline

**Problem:** Red "✗ Offline" status in popup

**Solutions:**
1. Make sure both backends are running
2. Check if ports 8000 and 8001 are available:
   ```bash
   lsof -i :8000
   lsof -i :8001
   ```
3. Check backend logs for errors
4. Wait 30 seconds and reopen popup (health check runs every 30s)

### Text Detection Not Working

**Problem:** No 🤖 indicators appearing

**Solutions:**
1. Check console for import errors
2. Make sure you're on a supported platform (Twitter, etc.)
3. Text must be >50 characters to trigger detection
4. Check if text backend is running (port 8001)

### Pattern Database Not Loading

**Problem:** Error loading patternDatabase.js

**Solution:**
1. Check manifest.json includes patternDatabase.js in web_accessible_resources
2. Reload extension
3. Check file exists: `extension/patternDatabase.js`

### Image Detection Still Works, Text Doesn't

This is expected if text backend (port 8001) isn't running. The extension gracefully degrades:
- Pattern detection works (no backend needed)
- ML text detection requires backend
- Image detection is independent (port 8000)

## API Testing

### Test Text Backend Directly:
```bash
curl -X POST http://localhost:8001/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"As an AI language model, I cannot provide opinions."}'
```

Expected response:
```json
{
  "ai_score": 95.0,
  "human_score": 5.0,
  "confidence": 90,
  "model": "roberta-base-openai-detector",
  "method": "local_ml"
}
```

### Test Image Backend Directly:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "modelLoaded": true
}
```

## Performance Benchmarks

### Expected Response Times:
- Pattern Detection: <5ms (instant)
- Text ML Detection: 50-200ms (local)
- Image Detection: 150-500ms CPU, 50-150ms GPU
- Social Media Scan: <10ms per post

### Resource Usage:
- RAM: ~3GB (both models loaded)
- CPU: Light (only during inference)
- Network: 0 (all local)

## What's Working Now

✅ **Text Detection:**
- Pattern-based detection (1200+ phrases)
- ML-based detection via RoBERTa model
- Social media platform scanning
- Real-time post analysis

✅ **Image Detection:**
- Multi-layer analysis (Layers 0-4)
- ML-based detection
- Visual indicators

✅ **Integration:**
- Backend health monitoring
- Status display in popup
- Graceful degradation if backends offline
- Independent operation of each feature

## What to Test

### Core Functionality:
- [ ] Extension loads without errors
- [ ] Backend status shows correctly
- [ ] Text detection on social media
- [ ] Text detection on regular pages
- [ ] Image detection still works
- [ ] Pattern matching works offline
- [ ] ML detection works with backend

### Edge Cases:
- [ ] Short text (<50 chars) - should skip
- [ ] Very long text - should truncate
- [ ] Text backend offline - falls back to patterns
- [ ] Image backend offline - still detects text
- [ ] Both backends offline - pattern detection only

### Platforms:
- [ ] Twitter/X
- [ ] Instagram (if accessible)
- [ ] Reddit
- [ ] LinkedIn
- [ ] Generic blog posts

## Success Criteria

✅ Extension loads without console errors
✅ Backend status shows green for both services
✅ Text detection indicators appear on AI content
✅ Image detection still functions
✅ Console shows successful module loading
✅ No performance degradation on pages

## Next Steps After Testing

1. **If everything works:** Push to remote and deploy
2. **If issues found:** Check console errors and backend logs
3. **Fine-tune:** Adjust confidence thresholds in backend files
4. **Optimize:** Cache results, debounce scanning
