// ShareSafe - Background Service Worker v2.0
// LLM used only as tie-breaker for uncertain cases (35-65 score range)

import { analyzeWithGemini } from './gemini.js';
import { generatePageCacheKey } from './cacheManager.js';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// NOTE: DEMO_MODE is initialized at startup but relying on a single
// startup read can race with service worker activation; handlers
// should always re-check storage per-request (see fixes below).
let DEMO_MODE = false;
const LLM_SCORE_MIN = 35; // Only use LLM if stat score >= this
const LLM_SCORE_MAX = 65; // Only use LLM if stat score <= this

// In-memory storage for latest analysis
let lastAnalysis = null;
let lastAnalysisTimestamp = 0;

// Check if API key exists
// Keep a best-effort startup log, but do NOT rely on this value for
// runtime decisions to avoid race conditions (handlers re-check storage).
chrome.storage.sync.get(['geminiApiKey'], (data) => {
  if (!data.geminiApiKey) {
    console.log('ShareSafe: No API key found at startup (runtime handlers re-check)');
    DEMO_MODE = true;
  } else {
    console.log('ShareSafe: API key found at startup (runtime handlers re-check)');
    DEMO_MODE = false;
  }
});

// Utility: promisified wrappers for chrome.storage.* APIs used with await
// FIX: chrome.storage.get does not return a Promise in many runtimes,
// so wrap it to safely use `await` in our async handlers.
function getStorageSync(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(keys, (result) => resolve(result || {}));
    } catch (e) {
      resolve({});
    }
  });
}

function getStorageLocal(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    } catch (e) {
      resolve({});
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Analyze image with LLM (tie-breaker only)
  if (message.type === 'ANALYZE_IMAGE') {
    (async () => {
      try {
        // FIX: Re-check API key and LLM enable at runtime to avoid DEMO_MODE race.
        const settings = await getStorageSync(['llmTiebreaker', 'geminiApiKey']);

        // Defensive check: validate incoming imageSrc before calling Gemini
        if (!message.imageSrc || typeof message.imageSrc !== 'string' || message.imageSrc.trim() === '') {
          sendResponse(null);
          return;
        }

        if (!settings.llmTiebreaker || !settings.geminiApiKey) {
          // LLM disabled or no API key: return null (no LLM analysis)
          sendResponse(null);
          return;
        }

        // Analyze image with Gemini (normalize result inside helper)
        const result = await analyzeImageWithGemini(message.imageSrc, settings.geminiApiKey);
        sendResponse(result);
      } catch (error) {
        console.error('ShareSafe: Image analysis error', error);
        sendResponse(null);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Analyze segment with LLM (tie-breaker only)
  if (message.type === 'ANALYZE_SEGMENT_LLM') {
    (async () => {
      try {
        // FIX: Re-check API key and LLM enable at runtime to avoid DEMO_MODE race.
        const settings = await getStorageSync(['llmTiebreaker', 'geminiApiKey']);

        // Defensive check: ensure there is text to analyze
        if (!message.text || typeof message.text !== 'string' || message.text.trim() === '') {
          sendResponse(null);
          return;
        }

        if (!settings.llmTiebreaker || !settings.geminiApiKey) {
          sendResponse(null);
          return;
        }

        // Only use LLM if score is in uncertain range
        const statScore = (typeof message.statScore === 'number') ? message.statScore : 50;
        if (statScore < LLM_SCORE_MIN || statScore > LLM_SCORE_MAX) {
          sendResponse(null);
          return;
        }

        console.log('ShareSafe: Using LLM tie-breaker for uncertain segment (score:', statScore, ')');

        // Analyze with Gemini (normalize result inside helper)
        const result = await analyzeSegmentWithGemini(message.text, settings.geminiApiKey);
        sendResponse(result);
      } catch (error) {
        console.error('ShareSafe: Segment LLM analysis error', error);
        sendResponse(null);
      }
    })();
    return true;
  }

  // Legacy page analysis (for popup)
  if (message.type === 'GET_PAGE_ANALYSIS' || message.type === 'GET_LAST_ANALYSIS') {
    (async () => {
      try {
        // Return in-memory analysis if recent (within 5 minutes)
        if (lastAnalysis && (Date.now() - lastAnalysisTimestamp) < 300000) {
          sendResponse(lastAnalysis);
          return;
        }

        // Otherwise try to get from cache (getLastPageAnalysis uses getStorageLocal wrapper)
        const cached = await getLastPageAnalysis();
        sendResponse(cached);
      } catch (error) {
        console.error('ShareSafe: Error getting page analysis', error);
        sendResponse(null);
      }
    })();
    return true;
  }

  // Store analysis from content script
  if (message.type === 'STORE_ANALYSIS') {
    (async () => {
      try {
        // Defensive: ensure message.data exists
        if (!message.data) {
          sendResponse({ success: false });
          return;
        }

        // Store in memory for quick popup access
        lastAnalysis = message.data;
        lastAnalysisTimestamp = Date.now();
        sendResponse({ success: true });
      } catch (error) {
        console.error('ShareSafe: Error storing analysis', error);
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  return false;
});

// ═══════════════════════════════════════════════════════════════
// IMAGE ANALYSIS WITH GEMINI
// ═══════════════════════════════════════════════════════════════

async function analyzeImageWithGemini(imageSrc, apiKey) {
  const prompt = `
Analyze this image to determine if it was AI-generated.

Image URL: ${imageSrc}

Look for:
1. AI generation artifacts (unusual textures, warping, inconsistencies)
2. Synthetic/computer-generated appearance
3. Typical AI art style (overly smooth, perfect, or surreal)
4. Anatomical impossibilities or physics violations (common in AI images)
5. Text/writing that is garbled or nonsensical
6. Lighting or shadow inconsistencies

Respond in valid JSON only:
{
  "score": number 0-100 (100 = definitely AI-generated),
  "confidence": number 0-100,
  "reasons": ["specific observation 1", "specific observation 2"],
  "interpretation": "brief assessment"
}
`;

  try {
    const result = await analyzeWithGemini({ 
      title: '',
      bodyText: prompt,
      imageUrl: imageSrc 
    }, apiKey);

    // FIX: Normalize Gemini response fields to avoid NaN or malformed values
    const rawScore = result && typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : 50;
    const score = Math.min(100, Math.max(0, rawScore));
    const rawConf = result && typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? result.confidence : 70;
    const confidence = Math.min(100, Math.max(0, rawConf));
    const reasons = Array.isArray(result && result.reasons) ? result.reasons : [];
    const interpretation = (result && (result.summary || result.interpretation)) || 'AI analysis complete';

    return {
      score,
      confidence,
      reasons,
      interpretation,
      method: 'gemini'
    };
  } catch (error) {
    console.error('ShareSafe: Gemini image analysis failed', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT ANALYSIS WITH GEMINI (TIE-BREAKER)
// ═══════════════════════════════════════════════════════════════

async function analyzeSegmentWithGemini(text, apiKey) {
  const prompt = `
Analyze this text segment for AI-generated characteristics.

Text: "${text}"

Focus on:
1. Stylistic consistency and naturalness
2. Pattern repetition (AI tends to repeat phrases/structures)
3. Synthetic or formulaic language
4. Lack of personal voice or genuine emotion
5. Overly formal or corporate tone
6. Generic, vague, or padding language

Respond in valid JSON only:
{
  "score": number 0-100 (100 = definitely AI-generated),
  "confidence": number 0-100,
  "reasons": ["specific issue 1", "specific issue 2", "specific issue 3"],
  "interpretation": "one sentence assessment"
}
`;

  try {
    const result = await analyzeWithGemini({
      title: '',
      bodyText: prompt
    }, apiKey);

    // FIX: Normalize Gemini response fields to avoid NaN or malformed values
    const rawScore = result && typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : 50;
    const score = Math.min(100, Math.max(0, rawScore));
    const rawConf = result && typeof result.confidence === 'number' && Number.isFinite(result.confidence) ? result.confidence : 70;
    const confidence = Math.min(100, Math.max(0, rawConf));
    const reasons = Array.isArray(result && result.reasons) ? result.reasons : [];
    const interpretation = (result && (result.summary || result.interpretation)) || 'AI analysis complete';

    return {
      score,
      confidence,
      reasons,
      interpretation,
      method: 'gemini'
    };
  } catch (error) {
    console.error('ShareSafe: Gemini segment analysis failed', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function getLastPageAnalysis() {
  try {
    // FIX: chrome.tabs.query may be callback-based in some environments; wrap in a Promise
    const tabs = await new Promise((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (t) => resolve(t || []));
      } catch (e) {
        resolve([]);
      }
    });
    if (!tabs[0]?.url) return null;
    // Try to get cached analysis
    // FIX: compute the exact cache key using the page URL and a short page snippet when possible
    const data = await getStorageLocal(['cache_page']);
    const cache = data.cache_page || {};

    // Compute exact cache key for this URL (use empty snippet) and lookup directly
    try {
      const generatedKey = generatePageCacheKey(tabs[0].url, '');
      if (cache[generatedKey]) {
        return cache[generatedKey].data;
      }
    } catch (e) {
      // If key generation fails for any reason, return null (preserve safe behavior)
      return null;
    }

    return null;
  } catch (error) {
    console.error('ShareSafe: Error getting last analysis', error);
    return null;
  }
}

console.log('ShareSafe v2.0: Background worker initialized. LLM tie-breaker mode:', !DEMO_MODE);
