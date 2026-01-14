// ShareSafe - Gemini API Helper
// Analyzes content and images for misinformation using Google Gemini

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 15000;

/**
 * Analyze webpage content for misinformation signals using Gemini
 * @param {Object} content - { title, headline, description, bodyText, imageUrl }
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object>} - { riskLevel, score, reasons, summary }
 */
export async function analyzeWithGemini(content, apiKey) {
  const defaultResponse = {
    riskLevel: 'medium',
    score: 50,
    reasons: ['Analysis unavailable - API error'],
    summary: 'Could not complete analysis. Please try again.'
  };

  if (!apiKey) {
    console.log('[ShareSafe][Gemini] No API key provided'); // FIX: consistent logging prefix
    return defaultResponse;
  }

  console.log('[ShareSafe][Gemini] Analyzing with Gemini 2.5 Flash...'); // FIX: consistent logging prefix

  const hasImage = !!content.imageUrl;

  const prompt = `
You are an expert fact-checker and misinformation analyst. Analyze this webpage for ALL types of false, misleading, or manipulated content.

Title: ${content.title || 'N/A'}
Headline: ${content.headline || 'N/A'}
Description: ${content.description || 'N/A'}
Content: ${content.bodyText || 'N/A'}
${hasImage ? 'Image URL: ' + content.imageUrl : 'No main image found'}
${content.hasVideo ? 'Video detected on page' : ''}

ANALYZE FOR ALL THESE ISSUES:

1. FAKE NEWS / MISINFORMATION:
   - False or unverified claims
   - Missing sources or citations
   - Claims contradicted by known facts

2. EDITED / MANIPULATED MEDIA:
   - Photoshopped or doctored images
   - Edited or spliced videos
   - Face swaps or morphing
   - Misleading cropping or framing

3. AI-GENERATED CONTENT:
   - AI-generated images (DALL-E, Midjourney, etc.)
   - AI-generated videos (Sora, Runway, etc.)
   - Deepfakes or synthetic faces
   - AI-written text

4. CLICKBAIT / MANIPULATION:
   - Sensational or exaggerated headlines
   - Emotional manipulation tactics
   - Fear-mongering or outrage bait

5. OUT OF CONTEXT:
   - Old content presented as new
   - Real media with false caption
   - Misleading framing of real events

6. SATIRE MISREPRESENTED:
   - Satirical content that could be mistaken as real

Respond in valid JSON only (no markdown):
{
  "riskLevel": "low" or "medium" or "high",
  "score": number 0-100 (100 = highest risk),
  "reasons": ["specific issue 1", "specific issue 2", "specific issue 3"],
  "summary": "one sentence assessment",
  "detectedIssues": {
    "fakeNews": true/false,
    "editedMedia": true/false,
    "aiGenerated": true/false,
    "clickbait": true/false,
    "outOfContext": true/false
  }
}
`;

  const controller = new AbortController();
  let timeoutId = null;
  try {
    // Start timeout inside try so we can clear in finally if needed
    timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    // Build request parts
    const parts = [{ text: prompt }];

    // If there's an image, try to include it (Gemini can analyze image URLs)
    // Note: This works best with publicly accessible image URLs

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error('[ShareSafe][Gemini] Gemini API error:', response.status);
      // clearTimeout will be handled in finally, but clear here defensively
      try { if (timeoutId) clearTimeout(timeoutId); } catch (e) {}
      return defaultResponse;
    }

    const data = await response.json();

    // Extract text from Gemini response robustly. Gemini responses can vary,
    // so search for the first candidate parts text across possible shapes.
    let text = null;
    try {
      if (Array.isArray(data?.candidates) && data.candidates.length > 0) {
        for (const cand of data.candidates) {
          const partsArr = cand?.content?.parts;
          if (Array.isArray(partsArr) && partsArr.length > 0) {
            for (const p of partsArr) {
              if (p?.text) { text = p.text; break; }
            }
          }
          if (text) break;
        }
      }
      // Fallback: some Gemini responses embed the text differently
      if (!text && typeof data?.outputText === 'string') text = data.outputText;
    } catch (e) {
      // parsing error - continue to extraction below
      text = null;
    }

    if (!text || typeof text !== 'string') {
      console.error('[ShareSafe][Gemini] No text in Gemini response');
      clearTimeout(timeoutId); // FIX: ensure timeout cleared
      return defaultResponse;
    }

    // FIX: JSON PARSING SAFETY
    // Remove surrounding markdown code fences and extract the first valid JSON object
    let cleaned = text.trim();
    // Strip code fences if present
    cleaned = cleaned.replace(/^```\s*json\s*/i, '').replace(/```\s*$/, '');
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '');

    // Attempt to find first JSON object by scanning for balanced braces
    function extractFirstJsonObject(str) {
      const firstBrace = str.indexOf('{');
      if (firstBrace === -1) return null;
      let depth = 0;
      for (let i = firstBrace; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) {
          return str.slice(firstBrace, i + 1);
        }
      }
      return null;
    }

    let jsonStr = null;
    jsonStr = extractFirstJsonObject(cleaned);
    if (!jsonStr) {
      // As a last resort, try to parse the whole cleaned text
      jsonStr = cleaned;
    }

    let result = null;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      // FIX: If parse fails, attempt to salvage by stripping non-json prefix/suffix
      try {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const sub = cleaned.slice(start, end + 1);
          result = JSON.parse(sub);
        }
      } catch (e2) {
        console.error('[ShareSafe][Gemini] JSON parse failed:', parseErr, e2);
        clearTimeout(timeoutId); // FIX: ensure timeout cleared
        return defaultResponse;
      }
    }

    // Clear timeout now that we've completed parsing and extraction
    try { if (timeoutId) clearTimeout(timeoutId); } catch (e) {}

    // Normalize and validate result fields
    const riskLevel = (result && (result.riskLevel === 'low' || result.riskLevel === 'medium' || result.riskLevel === 'high'))
      ? result.riskLevel
      : defaultResponse.riskLevel;

    // Score normalization
    let rawScore = (result && typeof result.score === 'number' && Number.isFinite(result.score)) ? result.score : defaultResponse.score;
    rawScore = Math.min(100, Math.max(0, rawScore));

    // Confidence may be returned optionally; normalize if present
    let rawConfidence = (result && typeof result.confidence === 'number' && Number.isFinite(result.confidence)) ? result.confidence : undefined;
    if (typeof rawConfidence === 'number') rawConfidence = Math.min(100, Math.max(0, rawConfidence));

    // Reasons: ensure array of strings
    const reasons = Array.isArray(result && result.reasons) ? result.reasons.filter(r => typeof r === 'string') : [];

    // FIX: API RESPONSE FIELD MISMATCH
    // The prompt includes `detectedIssues.aiGenerated` but some responses used `isAIGenerated`.
    // Use the canonical `detectedIssues?.aiGenerated === true` check.
    const aiDetected = !!(result && result.detectedIssues && result.detectedIssues.aiGenerated === true);
    if (aiDetected && riskLevel !== 'high') {
      // Preserve original score but nudge to at least 75 as before
      if (rawScore < 75) rawScore = 75;
      // Ensure reason exists
      if (!reasons.some(r => r && r.toLowerCase().includes('ai'))) {
        reasons.unshift('AI-generated content detected');
      }
    }

    // Ensure we always return the expected shape
    // FIX: Deduplicate reasons before returning
    const uniqueReasons = [...new Set(reasons)].slice(0, 5);
    return {
      riskLevel: riskLevel,
      score: rawScore,
      reasons: uniqueReasons,
      summary: (result && (result.summary || result.interpretation)) || defaultResponse.summary
    };

  } catch (error) {
    // Ensure timeout cleared on errors
    try { if (timeoutId) clearTimeout(timeoutId); } catch (e) {}
    if (error && error.name === 'AbortError') {
      console.error('[ShareSafe][Gemini] Gemini API timeout');
    } else {
      console.error('[ShareSafe][Gemini] Gemini analysis error:', error);
    }
    return defaultResponse;
  }
}
