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
  
  // Weighted average (reduce statistical weight, focus on patterns)
  let finalScore = (statScore * 0.4) + (patternScore * 0.6);
  
  // Dampen overall scores to reduce false positives (5% reduction)
  // BUT: Don't dampen if strong AI signals detected (explicit markers)
  if (!patterns.hasStrongSignal) {
    finalScore = finalScore * 0.95;
  }
  
  // Collect all reasons
  let reasons = [
    ...stats.reasons,
    ...patterns.reasons
  ].filter(r => r); // Remove empty
  
  let llmUsed = false;
  
  // ─── LLM TIE-BREAKER (Only for uncertain cases) ───
  if (useLLMTiebreaker && finalScore >= 25 && finalScore <= 75) {
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
        }
        
        llmUsed = true;
        console.log('ShareSafe: LLM tie-breaker used for segment', segment.id, '→', llmResult.score);
      }
    } catch (error) {
      console.error('ShareSafe: LLM tie-breaker failed', error);
    }
  }
  
  // Determine risk level
  let riskLevel = 'low';
  if (finalScore >= 60) riskLevel = 'high';
  else if (finalScore >= 35) riskLevel = 'medium';
  
  return {
    segmentId: segment.id,
    score: Math.round(finalScore),
    statScore: Math.round(statScore),
    patternScore: Math.round(patternScore),
    confidence: Math.round(stats.confidence),
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
  
  // ─── Direct AI Mentions ───
  if (/\b(ai[- ]generated|generated by ai|created (by|with) ai|made (by|with) ai)\b/i.test(text)) {
    reasons.push('[AI] Explicitly marked as AI-generated');
    score += 90;
    hasStrongSignal = true;
  }
  
  if (/\b(chatgpt|gpt-?[34]|gpt-?4o?|claude|gemini|copilot|dall[- ]?e|midjourney|stable diffusion)\b/i.test(text)) {
    reasons.push('[AI] AI tool mentioned');
    score += 70;
    hasStrongSignal = true;
  }
  
  if (/\b(chatgpt|gpt-4|claude|gemini|copilot) (generated|created|wrote|made|produced)\b/i.test(text)) {
    reasons.push('[AI] Tool authorship indicated');
    score += 85;
    hasStrongSignal = true;
  }
  
  // ─── Common AI Phrases ───
  const aiPhrases = [
    { pattern: /\b(it'?s worth noting|it'?s important to note)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 8, msg: '[Style] Common AI transitional phrase' },
    { pattern: /\b(as an ai|as a language model|i don'?t have personal)\b/i, score: 95, msg: '[AI] Self-identification', strong: true },
    { pattern: /\b(in (conclusion|summary|today'?s|this))\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Style] Formulaic transitions' },
    { pattern: /\b(delve|leverage|utilize|facilitate|enhance|optimize)\b/gi, score: 0, count: true, threshold: 4, scoreMulti: 8, msg: '[Vocab] Overuse of formal vocabulary' },
    { pattern: /\b(comprehensive|holistic|robust|seamless|cutting[- ]edge)\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Vocab] Corporate jargon' },
    { pattern: /\b(it is (important|crucial|essential|vital) to (note|understand|remember))\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 10, msg: '[Style] AI emphasis pattern' },
    { pattern: /\b(moreover|furthermore|additionally|consequently|therefore)\b/gi, score: 0, count: true, threshold: 4, scoreMulti: 10, msg: '[Style] Excessive formal connectors' },
    { pattern: /\b(can be (seen|viewed|considered|understood) as)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 8, msg: '[Style] Hedging language' },
    { pattern: /\b(range of|variety of|number of|series of)\b/gi, score: 0, count: true, threshold: 3, scoreMulti: 6, msg: '[Style] Generic quantifiers' },
    { pattern: /\b(plays a (crucial|vital|key|important|significant) role)\b/gi, score: 0, count: true, threshold: 2, scoreMulti: 10, msg: '[Style] AI cliche phrase' }
  ];
  
  aiPhrases.forEach(({ pattern, score: patternScore, msg, strong, count, threshold, scoreMulti }) => {
    if (count) {
      const matches = text.match(pattern);
      if (matches && matches.length >= threshold) {
        reasons.push(`${msg} (${matches.length}×)`);
        score += scoreMulti * Math.min(matches.length, 5);
      }
    } else {
      if (pattern.test(text)) {
        reasons.push(msg);
        score += patternScore;
        if (strong) hasStrongSignal = true;
      }
    }
  });
  
  // ─── Structure Patterns ───
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Check for overly balanced structure (multiple sentences starting same way)
  if (sentences.length >= 3) {
    const firstWords = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const uniqueStarts = new Set(firstWords);
    if (uniqueStarts.size < sentences.length * 0.6) {
      reasons.push('Repetitive sentence beginnings');
      score += 10;
    }
  }
  
  // Check for numbered lists in paragraphs (AI loves numbered lists)
  const numberedPoints = text.match(/\b\d+\.\s+[A-Z]/g);
  if (numberedPoints && numberedPoints.length >= 3) {
    reasons.push('Structured list format');
    score += 8;
  }
  
  // ─── Tone Indicators ───
  // AI tends to be overly neutral and balanced
  const emotionalWords = text.match(/\b(love|hate|amazing|terrible|angry|happy|sad|excited)\b/gi);
  const emotionalRatio = emotionalWords ? emotionalWords.length / countWords(text) : 0;
  
  if (emotionalRatio < 0.01 && countWords(text) > 50) {
    reasons.push('Unusually neutral tone');
    score += 12;
  }
  
  return {
    score: Math.min(100, score),
    reasons,
    hasStrongSignal
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
