// ShareSafe - Segment Extraction & Scoring Module
// Splits content into logical segments and analyzes each independently

import { analyzeTextStatistics } from './statisticalAnalyzer.js';

// ═══════════════════════════════════════════════════════════════
// SEGMENT EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract logical text segments from a document
 * Returns: paragraphs, headings+body blocks, list items
 */
export function extractSegments(rootElement = document.body) {
  const segments = [];
  let segmentId = 0;

  // Extract main content area (avoid headers, footers, nav)
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '.post-content',
    '.article-content',
    '#content',
    'body'
  ];

  let contentRoot = null;
  for (const selector of contentSelectors) {
    contentRoot = rootElement.querySelector(selector);
    if (contentRoot) break;
  }

  if (!contentRoot) contentRoot = rootElement;

  // ─── Extract Headings + Following Content ───
  const headings = contentRoot.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(heading => {
    const headingText = heading.innerText?.trim() || '';
    if (headingText.length < 3) return;

    // Get content until next heading
    const bodyParts = [];
    let next = heading.nextElementSibling;

    while (next && !/^h[1-6]$/i.test(next.tagName)) {
      const text = next.innerText?.trim() || '';
      if (text.length > 10 && !isNavigationElement(next)) {
        bodyParts.push(text);
      }
      next = next.nextElementSibling;
      if (bodyParts.length >= 5) break; // Limit to avoid huge blocks
    }

    const bodyText = bodyParts.join(' ').slice(0, 1000);

    if (bodyText.length > 20) {
      segments.push({
        id: segmentId++,
        type: 'heading-block',
        heading: headingText,
        text: bodyText,
        fullText: headingText + ' ' + bodyText,
        element: heading,
        wordCount: countWords(bodyText)
      });
    }
  });

  // ─── Extract Standalone Paragraphs ───
  const paragraphs = contentRoot.querySelectorAll('p');
  paragraphs.forEach(p => {
    const text = p.innerText?.trim() || '';
    if (text.length >= 30 && !isNavigationElement(p)) {
      // Skip if already part of a heading block
      const isInHeadingBlock = segments.some(seg =>
        seg.element && (seg.element.contains(p) || p.contains(seg.element))
      );

      if (!isInHeadingBlock) {
        segments.push({
          id: segmentId++,
          type: 'paragraph',
          text: text.slice(0, 2000),
          fullText: text,
          element: p,
          wordCount: countWords(text)
        });
      }
    }
  });

  // ─── Extract List Items ───
  const listItems = contentRoot.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.innerText?.trim() || '';
    if (text.length >= 20 && !isNavigationElement(li)) {
      segments.push({
        id: segmentId++,
        type: 'list-item',
        text: text.slice(0, 500),
        fullText: text,
        element: li,
        wordCount: countWords(text)
      });
    }
  });

  // ─── Extract Blockquotes ───
  const quotes = contentRoot.querySelectorAll('blockquote');
  quotes.forEach(quote => {
    const text = quote.innerText?.trim() || '';
    if (text.length >= 20) {
      segments.push({
        id: segmentId++,
        type: 'blockquote',
        text: text.slice(0, 1000),
        fullText: text,
        element: quote,
        wordCount: countWords(text)
      });
    }
  });

  // ─── Extract Div-based Content Blocks ───
  const contentDivs = contentRoot.querySelectorAll('div');
  contentDivs.forEach(div => {
    // Skip if contains other structural elements
    if (div.querySelector('article, section, aside, nav')) return;

    const text = div.innerText?.trim() || '';
    if (text.length >= 50 && text.length <= 3000 && !isNavigationElement(div)) {
      // Check if not already captured
      const isAlreadyCaptured = segments.some(seg =>
        seg.element && (seg.element.contains(div) || div.contains(seg.element))
      );

      if (!isAlreadyCaptured) {
        segments.push({
          id: segmentId++,
          type: 'content-block',
          text: text.slice(0, 2000),
          fullText: text,
          element: div,
          wordCount: countWords(text)
        });
      }
    }
  });

  // Sort by DOM position
  segments.sort((a, b) => {
    if (a.element && b.element) {
      return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    }
    return 0;
  });

  // Re-assign sequential IDs after sorting
  segments.forEach((seg, idx) => seg.id = idx);

  return segments;
}

/**
 * Check if element is navigation/UI (not content)
 */
function isNavigationElement(element) {
  const navSelectors = ['nav', 'header', 'footer', 'aside', '.menu', '.navigation', '.sidebar'];

  for (const selector of navSelectors) {
    if (element.matches?.(selector) || element.closest?.(selector)) {
      return true;
    }
  }

  // Check aria roles
  const role = element.getAttribute?.('role');
  if (['navigation', 'banner', 'complementary', 'contentinfo'].includes(role)) {
    return true;
  }

  return false;
}

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ═══════════════════════════════════════════════════════════════
// SEGMENT SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a single segment for AI-generated characteristics
 */
export async function scoreSegment(segment, options = {}) {
  const { useLLMTiebreaker = false } = options;
  const text = segment.fullText || segment.text;

  // Use statistical analysis
  const stats = analyzeTextStatistics(text);

  // Pattern-based detection (quick heuristics)
  const patterns = detectAIPatterns(text);

  // Combine scores
  const statScore = stats.score;
  const patternScore = patterns.score;

  // Weighted scoring with short-text adjustments
  // Determine word count for this segment
  const segWordCount = segment.wordCount || (text ? text.split(/\s+/).filter(w => w.length > 0).length : 0);

  // Collect all reasons initially
  let reasons = [
    ...stats.reasons,
    ...patterns.reasons
  ].filter(r => r);
  reasons = [...new Set(reasons)];

  // Augment pattern score with micro-stylometric signals for short texts
  const nf = (stats && stats.normalizedFeatures) ? stats.normalizedFeatures : {};
  const microContrib = ((nf.emojiPlacement || 0) + (nf.copyPasteArtifacts || 0)) * 25; // each normalized feature contributes up to 25
  const patternAugmented = Math.min(100, patternScore + microContrib);

  // Feature Gating & Adaptive Thresholding
  const redFlags = detectHighCertaintyPatterns(text);

  let finalScore;
  let forceConfidence = null;

  if (segWordCount < 50) {
    if (redFlags.detected) {
      // ─── RED FLAG OVERRIDE ───
      // Bypass short-text penalty entirely and force high score
      finalScore = Math.max(stats.score, patternScore, 85);
      reasons.push(...redFlags.reasons);

      // CONFIDENCE FLOOR: Don't drop confidence below 50 if red flag exists
      if (stats.confidence < 50) {
        forceConfidence = 50;
      }
    } else {
      // ─── ADAPTIVE THRESHOLDING ───
      // Short text: rely more on pattern-based signals
      // REMOVED the 0.75 penalty that was causing false negatives
      finalScore = (statScore * 0.4) + (patternAugmented * 0.6);
    }
  } else {
    // Medium/Long text
    finalScore = (statScore * 0.75) + (patternScore * 0.25);
  }

  // FIX: Deduplicate reasons to avoid repeated messages (again, just in case)
  reasons = [...new Set(reasons)];

  let llmUsed = false;

  // ─── LLM TIE-BREAKER (Only for uncertain cases) ───
  if (useLLMTiebreaker && finalScore >= 35 && finalScore <= 65) {
    try {
      // Call background script for LLM analysis
      const llmResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'ANALYZE_SEGMENT_LLM',
          text: text.slice(0, 1000), // Limit to 1000 chars
          statScore: finalScore
        }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      if (llmResult) {
        // Blend statistical and LLM results
        // 60% statistical, 40% LLM (statistical is more reliable)
        finalScore = (finalScore * 0.6) + (llmResult.score * 0.4);

        // Add LLM reasons
        if (llmResult.reasons && llmResult.reasons.length > 0) {
          reasons = [...reasons, ...llmResult.reasons.map(r => `🤖 ${r}`)];
          // Deduplicate after adding LLM reasons
          reasons = [...new Set(reasons)];
        }

        llmUsed = true;
        console.log('ShareSafe: LLM tie-breaker used for segment', segment.id, '→', llmResult.score);
      }
    } catch (error) {
      console.error('ShareSafe: LLM tie-breaker failed', error);
    }
  }

  // Ensure finalScore is finite and clamped
  if (!Number.isFinite(finalScore) || Number.isNaN(finalScore)) finalScore = statScore;
  finalScore = Math.min(100, Math.max(0, finalScore));

  // Determine risk level
  // Determine risk level with Adaptive Thresholding
  let riskLevel = 'low';
  let highRiskThreshold = 60;

  // ADAPTIVE THRESHOLD: Lower bar for short text
  if (segWordCount < 50) highRiskThreshold = 55;

  if (finalScore >= highRiskThreshold) riskLevel = 'high';
  else if (finalScore >= 35) riskLevel = 'medium';

  return {
    segmentId: segment.id,
    score: Math.round(finalScore),
    statScore: Math.round(statScore),
    patternScore: Math.round(patternScore),
    confidence: Math.round(forceConfidence !== null ? Math.max(stats.confidence, forceConfidence) : stats.confidence),
    riskLevel,
    reasons: reasons.slice(0, 5), // Top 5 reasons
    statistics: stats,
    patterns,
    wordCount: segment.wordCount,
    type: segment.type,
    shouldReview: finalScore >= 35 || patterns.hasStrongSignal,
    llmUsed // Track if LLM was used
  };
}

/**
 * Detect AI patterns using keyword/phrase analysis
 */
function detectAIPatterns(text) {
  const lower = text.toLowerCase();
  const reasons = [];
  let score = 0;
  let hasStrongSignal = false;

  // Helper to add score but never exceed 100 at any step (fixes SCORE OVERFLOW RISK)
  function addScore(n) {
    score = Math.min(100, score + n);
  }

  // Helper to push unique reasons only (prevents REASONS DUPLICATION)
  function pushReason(r) {
    if (!r) return;
    if (!reasons.includes(r)) reasons.push(r);
  }

  // Lightweight stopword set for overlap filtering (used in contradiction check)
  const STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'with', 'that', 'this', 'have', 'from', 'they', 'was', 'were', 'will', 'would', 'there', 'their', 'which', 'when', 'what', 'how', 'who', 'whom', 'its', "it's", 'had', 'been'
  ]);

  // ─── Direct AI Mentions ───
  if (/\b(ai[- ]generated|generated by ai|created (by|with) ai)\b/i.test(text)) {
    pushReason('[AI] Explicitly marked as AI-generated');
    addScore(90);
    hasStrongSignal = true;
  }

  if (/\b(chatgpt|gpt-4|claude|gemini|copilot) (generated|created|wrote|made)\b/i.test(text)) {
    pushReason('[AI] Tool authorship indicated');
    addScore(85);
    hasStrongSignal = true;
  }

  // ─── Common AI Phrases ───

  // ─── Claim Without Citation ───
  if (/\b(study|research|experts|scientists)\s+(say|show|claim|found)\b/i.test(text)) {
    if (!/(https?:\/\/|doi\.org|according to|source:)/i.test(text)) {
      pushReason('Claims made without citation or source');
      addScore(14);
    }
  }


  const aiPhrases = [
    { pattern: /\b(it'?s worth noting|it'?s important to note)\b/i, score: 15, msg: '[Style] Common AI transitional phrase' },
    { pattern: /\b(as an ai|as a language model|i don'?t have personal)\b/i, score: 95, msg: '[AI] Self-identification', strong: true },
    { pattern: /\b(in (conclusion|summary|today'?s|this))\b/i, score: 10, msg: '[Style] Formulaic transitions' },
    { pattern: /\b(delve|leverage|utilize|facilitate|enhance|optimize)\b/i, score: 12, msg: '[Vocab] Overuse of formal vocabulary' },
    { pattern: /\b(comprehensive|holistic|robust|seamless|cutting[- ]edge)\b/i, score: 8, msg: '[Vocab] Corporate jargon' },
    { pattern: /\b(it is (important|crucial|essential|vital) to (note|understand|remember))\b/i, score: 18, msg: '[Style] AI emphasis pattern' },
    { pattern: /\b(moreover|furthermore|additionally|consequently|therefore)\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 12, msg: '[Style] Excessive formal connectors' },
    { pattern: /\b(can be (seen|viewed|considered|understood) as)\b/i, score: 10, msg: '[Style] Hedging language' },
    { pattern: /\b(range of|variety of|number of|series of)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 8, msg: '[Style] Generic quantifiers' },
    { pattern: /\b(plays a (crucial|vital|key|important|significant) role)\b/i, score: 14, msg: '[Style] AI cliche phrase' }
  ];

  aiPhrases.forEach(({ pattern, score: patternScore, msg, strong, count, threshold, scoreMulti }) => {
    if (count) {
      const matches = text.match(pattern);
      if (matches && matches.length >= threshold) {
        pushReason(`${msg} (${matches.length}×)`);
        addScore(scoreMulti * Math.min(matches.length, 5));
      }
    } else {
      if (pattern.test(text)) {
        pushReason(msg);
        addScore(patternScore);
        if (strong) hasStrongSignal = true;
      }
    }
  });

  // ─── Structure Patterns ───
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // ─── Redundant Paraphrase Detection ───
  if (sentences.length >= 4) {
    const sentenceStarts = sentences.map(s =>
      s.trim().toLowerCase().split(/\s+/).slice(0, 5).join(' ')
    );
    const uniqueStarts = new Set(sentenceStarts);
    if (uniqueStarts.size < sentenceStarts.length * 0.65) {
      pushReason('Repeated ideas with similar phrasing');
      addScore(12);
    }
  }

  // ─── Simple Contradiction Check ───

  // ─── Simple Contradiction Check ───
  // Negations declared before use (fixes CONTRADICTION CHECK BUG)
  const negations = /\b(not|never|no|cannot|isn't|aren't|won't|didn't|doesn't)\b/;

  for (let i = 0; i < sentences.length - 1; i++) {
    const a = sentences[i].toLowerCase();
    const b = sentences[i + 1].toLowerCase();

    // Improved overlap: tokenize, remove short words and stopwords, use set intersection
    const tokenize = s => s.split(/\s+/).map(w => w.replace(/[^\w]/g, '')).filter(w => w.length >= 3).map(w => w.toLowerCase()).filter(w => !STOPWORDS.has(w));
    const aWords = tokenize(a);
    const bWords = tokenize(b);
    const bSet = new Set(bWords);
    const overlap = aWords.filter(w => bSet.has(w)).length;

    if (negations.test(b) && overlap > 5) {
      pushReason('Possible contradictory statements');
      addScore(12);
    }
  }


  // Check for overly balanced structure (multiple sentences starting same way)
  if (sentences.length >= 3) {
    const firstWords = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const uniqueStarts = new Set(firstWords);
    if (uniqueStarts.size < sentences.length * 0.6) {
      pushReason('Repetitive sentence beginnings');
      addScore(10);
    }
  }

  // Check for numbered lists in paragraphs (AI loves numbered lists)
  const numberedPoints = text.match(/\b\d+\.\s+[A-Z]/g);
  if (numberedPoints && numberedPoints.length >= 3) {
    pushReason('Structured list format');
    addScore(8);
  }

  // ─── Tone Indicators ───

  // ─── Pronoun Without Reference ───
  // ─── Pronoun Without Reference ───
  // Improved antecedent check: ensure a named entity exists earlier than the first pronoun to avoid false positives
  const pronounRegex = /\b(this|that|it|they|these)\b/gi;
  const pronounMatches = text.match(pronounRegex);
  const firstPronounIndex = text.search(pronounRegex);
  let entityFoundBefore = false;
  if (firstPronounIndex !== -1) {
    const entityBeforeRegex = /\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?\b/g;
    let m;
    while ((m = entityBeforeRegex.exec(text)) !== null) {
      if (m.index < firstPronounIndex) { entityFoundBefore = true; break; }
    }
  }

  if (pronounMatches && pronounMatches.length > 4 && !entityFoundBefore) {
    pushReason('Ambiguous pronoun usage without clear subject');
    addScore(10);
  }

  // AI tends to be overly neutral and balanced
  const emotionalWords = text.match(/\b(love|hate|amazing|terrible|angry|happy|sad|excited)\b/gi);
  const emotionalRatio = emotionalWords ? emotionalWords.length / countWords(text) : 0;

  if (emotionalRatio < 0.01 && countWords(text) > 50) {
    pushReason('Unusually neutral tone');
    addScore(12);
  }

  // ─── Entity Consistency Check ───
  const entityMatches = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g);
  if (entityMatches && entityMatches.length > 5) {
    const uniqueEntities = new Set(entityMatches);
    if (uniqueEntities.size < entityMatches.length * 0.6) {
      // Name reason to reflect repetition rather than inconsistency (fixes ENTITY CONSISTENCY CHECK)
      pushReason('Repeated named entities with low variation');
      addScore(10);
    }
  }


  return {
    score: Math.min(100, score),
    reasons,
    hasStrongSignal
  };
}

/**
 * Detect High-Certainty AI Patterns (Red Flags)
 * Used to override statistical signals for short text
 */
function detectHighCertaintyPatterns(text) {
  const reasons = [];
  const lower = text.toLowerCase();

  // 1. Terminal Emoji Patterns (e.g. "Here it is! 🚀")
  // Check for emoji in the last 5 chars of the string
  if (/[\u{1F300}-\u{1FAFF}][^a-zA-Z0-9]*$/u.test(text)) {
    reasons.push('AI-style terminal emoji');
  }

  // 2. Explicit AI Self-Disclosure
  if (/\b(as an ai|as a large language model|i do not have personal)\b/i.test(text)) {
    reasons.push('Explicit AI self-disclosure');
  }

  // 3. Copy-Paste Artifacts (Markdown bolding of headers/lists in short text)
  // E.g. "**Conclusion**" or "**Step 1:**" or "1. Point"
  if (text.length < 200) {
    if (/\*\*(.*?)\*\*/.test(text) && (text.match(/\*\*/g) || []).length >= 2) {
      reasons.push('Heavy markdown usage characteristic of AI');
    }
    // Numbered lists in short text (e.g. "1. Plan 2. Execute")
    if (/\b\d+\.\s+[A-Z]/.test(text) && (text.match(/\d+\.\s+/g) || []).length >= 2) {
      reasons.push('Numbered list in short text');
    }
  }

  // 4. Common AI Phrases (High Certainty)
  // "It is important to note", "In conclusion", "Quick tips", "Brief summary"
  const phrasePatterns = [
    /\b(it is|it's) (important|crucial|essential) to (note|remember|understand)\b/i,
    /\b(worth noting|notable) that\b/i,
    /\b(in conclusion|to conclude|to summarize)\b/i,
    /\b(quick (tips|summary|notes?)|brief (summary|overview))\b/i,
    /\b(hope (this|that) helps)\b/i
  ];

  for (const pattern of phrasePatterns) {
    if (pattern.test(text)) {
      reasons.push('High-certainty AI phrase');
      break; // One is enough to trigger red flag
    }
  }

  return {
    detected: reasons.length > 0,
    reasons
  };
}

// ═══════════════════════════════════════════════════════════════
// PAGE-LEVEL AGGREGATION
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate segment scores into page-level score
 */
export function aggregatePageScore(segmentScores) {
  if (segmentScores.length === 0) {
    return {
      pageScore: 0,
      confidence: 0,
      riskLevel: 'low',
      summary: 'No content to analyze',
      segmentCount: 0,
      highRiskSegments: [],
      reasons: []
    };
  }

  // Weighted average based on word count and confidence
  let totalWeight = 0;
  let weightedSum = 0;

  segmentScores.forEach(seg => {
    // Weight by word count (longer segments are more reliable)
    const lengthWeight = Math.min(seg.wordCount / 100, 1.0);
    // Weight by confidence
    const confidenceWeight = seg.confidence / 100;
    // Combined weight
    const weight = lengthWeight * confidenceWeight;

    weightedSum += seg.score * weight;
    totalWeight += weight;
  });

  const pageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate overall confidence
  const avgConfidence = segmentScores.reduce((sum, s) => sum + s.confidence, 0) / segmentScores.length;

  // Determine risk level
  let riskLevel = 'low';
  if (pageScore >= 60) riskLevel = 'high';
  else if (pageScore >= 35) riskLevel = 'medium';

  // Find high-risk segments
  const highRiskSegments = segmentScores
    .filter(s => s.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Collect top reasons across all segments
  const allReasons = {};
  segmentScores.forEach(seg => {
    seg.reasons.forEach(reason => {
      allReasons[reason] = (allReasons[reason] || 0) + 1;
    });
  });

  const topReasons = Object.entries(allReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => count > 1 ? `${reason} (${count} segments)` : reason);

  // Generate summary
  const highRiskCount = segmentScores.filter(s => s.riskLevel === 'high').length;
  const mediumRiskCount = segmentScores.filter(s => s.riskLevel === 'medium').length;

  let summary = '';
  if (highRiskCount > 0) {
    summary = `Found ${highRiskCount} segment${highRiskCount > 1 ? 's' : ''} with high AI likelihood`;
  } else if (mediumRiskCount > 0) {
    summary = `Found ${mediumRiskCount} segment${mediumRiskCount > 1 ? 's' : ''} with moderate AI likelihood`;
  } else {
    summary = 'Content appears mostly human-written';
  }

  return {
    pageScore: Math.round(pageScore),
    confidence: Math.round(avgConfidence),
    riskLevel,
    summary,
    segmentCount: segmentScores.length,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount: segmentScores.length - highRiskCount - mediumRiskCount,
    highRiskSegments,
    reasons: topReasons,
    distribution: {
      high: highRiskCount,
      medium: mediumRiskCount,
      low: segmentScores.length - highRiskCount - mediumRiskCount
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANALYSIS PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Complete segment-based analysis of a page
 */
export async function analyzePageSegments(rootElement = document.body, options = {}) {
  const {
    minWordCount = 15,
    maxSegments = 50,
    skipTypes = [],
    useLLMTiebreaker = false
  } = options;

  // Extract segments
  const segments = extractSegments(rootElement);

  console.log(`ShareSafe: Extracted ${segments.length} segments`);

  // Filter segments
  const validSegments = segments
    .filter(seg => seg.wordCount >= minWordCount)
    .filter(seg => !skipTypes.includes(seg.type))
    .slice(0, maxSegments);

  console.log(`ShareSafe: Analyzing ${validSegments.length} valid segments (LLM tie-breaker: ${useLLMTiebreaker})`);

  // Score each segment (async now because of LLM tie-breaker)
  const segmentScores = await Promise.all(
    validSegments.map(async seg => {
      const score = await scoreSegment(seg, { useLLMTiebreaker });
      return {
        ...score,
        segment: seg // Keep reference to original segment
      };
    })
  );

  // Count LLM usage
  const llmUsedCount = segmentScores.filter(s => s.llmUsed).length;
  if (llmUsedCount > 0) {
    console.log(`ShareSafe: LLM tie-breaker used for ${llmUsedCount} uncertain segments`);
  }

  // Aggregate to page level
  const pageAnalysis = aggregatePageScore(segmentScores);

  return {
    ...pageAnalysis,
    segments: segmentScores,
    llmUsedCount
  };
}
