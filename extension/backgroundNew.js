// ShareSafe - Background Service Worker v2.0
// LLM used only as tie-breaker for uncertain cases (35-65 score range)

import { analyzeWithGemini } from './gemini.js';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

let DEMO_MODE = false;
const LLM_SCORE_MIN = 25; // Only use LLM if stat score >= this
const LLM_SCORE_MAX = 75; // Only use LLM if stat score <= this

// In-memory storage for latest analysis
let lastAnalysis = null;
let lastAnalysisTimestamp = 0;

// Check if API key exists
chrome.storage.sync.get(['geminiApiKey'], (data) => {
  if (!data.geminiApiKey) {
    console.log('ShareSafe: No API key found, statistical analysis only');
    DEMO_MODE = true;
  } else {
    console.log('ShareSafe: API key found, LLM available for tie-breaking');
    DEMO_MODE = false;
  }
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Analyze image with LLM (tie-breaker only)
  if (message.type === 'ANALYZE_IMAGE') {
    (async () => {
      try {
        // Check if LLM is enabled
        const settings = await chrome.storage.sync.get(['llmTiebreaker', 'geminiApiKey']);
        
        if (!settings.llmTiebreaker || !settings.geminiApiKey || DEMO_MODE) {
          sendResponse(null);
          return;
        }

        // Analyze image with Gemini
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
        const settings = await chrome.storage.sync.get(['llmTiebreaker', 'geminiApiKey']);
        
        if (!settings.llmTiebreaker || !settings.geminiApiKey || DEMO_MODE) {
          sendResponse(null);
          return;
        }

        // Only use LLM if score is in uncertain range
        const statScore = message.statScore || 50;
        if (statScore < LLM_SCORE_MIN || statScore > LLM_SCORE_MAX) {
          sendResponse(null);
          return;
        }

        console.log('ShareSafe: Using LLM tie-breaker for uncertain segment (score:', statScore, ')');

        // Analyze with Gemini
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
        
        // Otherwise try to get from cache
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

    return {
      score: result.score || 50,
      confidence: 70, // Gemini's confidence
      reasons: result.reasons || [],
      interpretation: result.summary || 'AI analysis complete',
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

    return {
      score: result.score || 50,
      confidence: 70,
      reasons: result.reasons || [],
      interpretation: result.summary || 'AI analysis complete',
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
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.url) return null;

    // Try to get cached analysis
    const data = await chrome.storage.local.get(['cache_page']);
    const cache = data.cache_page || {};

    // Find most recent analysis for this URL
    const entries = Object.entries(cache);
    const matching = entries.filter(([key]) => key.includes(new URL(tabs[0].url).hostname));
    
    if (matching.length > 0) {
      // Return most recent
      const sorted = matching.sort((a, b) => b[1].timestamp - a[1].timestamp);
      return sorted[0][1].data;
    }

    return null;
  } catch (error) {
    console.error('ShareSafe: Error getting last analysis', error);
    return null;
  }
}

console.log('ShareSafe v2.0: Background worker initialized. LLM tie-breaker mode:', !DEMO_MODE);
