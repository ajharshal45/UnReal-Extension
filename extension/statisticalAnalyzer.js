// ShareSafe - Statistical Text Analysis Module
// Non-LLM feature extraction for AI-generated content detection

/**
 * Compute statistical features for text segments
 * These features form the foundation of explainable AI detection
 */

// ═══════════════════════════════════════════════════════════════
// SENTENCE ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeSentences(text) {
  // Split into sentences (handle multiple punctuation patterns)
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return { mean: 0, variance: 0, count: 0 };

  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // Calculate variance
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;

  return {
    mean,
    variance,
    stdDev: Math.sqrt(variance),
    count: sentences.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    lengths
  };
}

// ═══════════════════════════════════════════════════════════════
// TOKEN ENTROPY (Measures predictability)
// ═══════════════════════════════════════════════════════════════

function calculateTokenEntropy(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  if (tokens.length === 0) return 0;

  // Count token frequencies
  const frequencies = {};
  tokens.forEach(token => {
    frequencies[token] = (frequencies[token] || 0) + 1;
  });

  // Calculate Shannon entropy
  const totalTokens = tokens.length;
  let entropy = 0;

  Object.values(frequencies).forEach(count => {
    const probability = count / totalTokens;
    entropy -= probability * Math.log2(probability);
  });

  return entropy;
}

// ═══════════════════════════════════════════════════════════════
// N-GRAM REPETITION RATE
// ═══════════════════════════════════════════════════════════════

function analyzeNgramRepetition(text, n = 3) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length < n) return { repetitionRate: 0, uniqueRatio: 1 };

  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }

  const uniqueNgrams = new Set(ngrams);
  const repetitionRate = 1 - (uniqueNgrams.size / ngrams.length);

  // Find most repeated n-grams
  const ngramCounts = {};
  ngrams.forEach(ng => {
    ngramCounts[ng] = (ngramCounts[ng] || 0) + 1;
  });

  const repeated = Object.entries(ngramCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    repetitionRate,
    uniqueRatio: uniqueNgrams.size / ngrams.length,
    totalNgrams: ngrams.length,
    uniqueNgrams: uniqueNgrams.size,
    mostRepeated: repeated
  };
}

// ═══════════════════════════════════════════════════════════════
// READABILITY SCORE (Flesch-Kincaid Grade Level)
// ═══════════════════════════════════════════════════════════════

function calculateReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = countSyllables(text);

  if (sentences.length === 0 || words.length === 0) {
    return { grade: 0, score: 0 };
  }

  // Flesch-Kincaid Grade Level
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschKincaid = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

  // Flesch Reading Ease
  const fleschEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

  return {
    grade: Math.max(0, fleschKincaid),
    readingEase: fleschEase,
    avgWordsPerSentence,
    avgSyllablesPerWord,
    interpretation: interpretReadability(fleschEase)
  };
}

function countSyllables(text) {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  let totalSyllables = 0;

  words.forEach(word => {
    if (word.length === 0) return;

    // Basic syllable counting algorithm
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    totalSyllables += matches ? matches.length : 1;
  });

  return totalSyllables;
}

function interpretReadability(score) {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Standard';
  if (score >= 50) return 'Fairly Difficult';
  if (score >= 30) return 'Difficult';
  return 'Very Difficult';
}

// ═══════════════════════════════════════════════════════════════
// POS TAG REGULARITY (Simplified heuristic-based)
// ═══════════════════════════════════════════════════════════════

function analyzePOSRegularity(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return { regularity: 0, diversity: 0 };

  // Simplified POS detection using word patterns
  const patterns = {
    determiners: /^(the|a|an|this|that|these|those|my|your|his|her|its|our|their)$/i,
    prepositions: /^(in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|between|under|over)$/i,
    conjunctions: /^(and|but|or|nor|for|yet|so|because|although|unless|while|if|when|where)$/i,
    pronouns: /^(i|you|he|she|it|we|they|me|him|her|us|them|who|what|which)$/i,
    modals: /^(can|could|may|might|must|shall|should|will|would)$/i,
    beVerbs: /^(am|is|are|was|were|be|been|being)$/i
  };

  const posCounts = {
    determiners: 0,
    prepositions: 0,
    conjunctions: 0,
    pronouns: 0,
    modals: 0,
    beVerbs: 0,
    other: 0
  };

  words.forEach(word => {
    const lower = word.toLowerCase();
    let matched = false;

    for (const [pos, pattern] of Object.entries(patterns)) {
      if (pattern.test(lower)) {
        posCounts[pos]++;
        matched = true;
        break;
      }
    }

    if (!matched) posCounts.other++;
  });

  // Calculate regularity (variance in POS distribution)
  const counts = Object.values(posCounts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;

  // AI text tends to have more regular POS patterns
  const regularity = 1 / (1 + variance / mean); // Normalize to [0,1]

  return {
    regularity,
    diversity: Object.values(posCounts).filter(c => c > 0).length / Object.keys(posCounts).length,
    distribution: posCounts,
    totalWords: words.length
  };
}

// ═══════════════════════════════════════════════════════════════
// PUNCTUATION ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzePunctuation(text) {
  const punctuationMarks = text.match(/[.,!?;:'"()—–-]/g) || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);

  const punctuationTypes = {
    periods: (text.match(/\./g) || []).length,
    commas: (text.match(/,/g) || []).length,
    exclamation: (text.match(/!/g) || []).length,
    question: (text.match(/\?/g) || []).length,
    semicolon: (text.match(/;/g) || []).length,
    colon: (text.match(/:/g) || []).length,
    quotes: (text.match(/['"]/g) || []).length,
    dashes: (text.match(/[—–-]/g) || []).length
  };

  return {
    total: punctuationMarks.length,
    ratio: words.length > 0 ? punctuationMarks.length / words.length : 0,
    diversity: Object.values(punctuationTypes).filter(c => c > 0).length,
    distribution: punctuationTypes
  };
}

// ═══════════════════════════════════════════════════════════════
// LEXICAL DIVERSITY (Type-Token Ratio)
// ═══════════════════════════════════════════════════════════════

function calculateLexicalDiversity(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return { ttr: 0, uniqueWords: 0 };

  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;

  // Moving-average type-token ratio (MATTR) for longer texts
  const windowSize = Math.min(100, words.length);
  let mattr = 0;

  if (words.length >= windowSize) {
    let windows = 0;
    for (let i = 0; i <= words.length - windowSize; i += 10) {
      const window = words.slice(i, i + windowSize);
      const windowUnique = new Set(window);
      mattr += windowUnique.size / windowSize;
      windows++;
    }
    mattr /= windows;
  } else {
    mattr = ttr;
  }

  return {
    ttr,
    mattr,
    uniqueWords: uniqueWords.size,
    totalWords: words.length,
    interpretation: ttr > 0.7 ? 'High diversity' : ttr > 0.5 ? 'Moderate diversity' : 'Low diversity'
  };
}

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL SIGNALS
// ═══════════════════════════════════════════════════════════════
// FIX: Added burstiness metric - mean absolute diff of consecutive sentence lengths
function calculateBurstiness(text) {
  // Measure variability between consecutive sentence lengths (mean absolute diff)
  const s = analyzeSentences(text);
  const lengths = s.lengths || [];
  if (lengths.length < 2) return 0;
  const diffs = [];
  for (let i = 0; i < lengths.length - 1; i++) {
    diffs.push(Math.abs(lengths[i + 1] - lengths[i]));
  }
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  // Return mean absolute difference as burstiness metric
  return meanDiff;
}
// FIX: Added stopword ratio (function words / total tokens)
function calculateStopwordRatio(text) {
  const stopwords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from']);
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return 0;
  let count = 0;
  tokens.forEach(t => { if (stopwords.has(t)) count++; });
  return count / tokens.length;
}
// FIX: Added function-word uniformity (variance across common function words)
function calculateFunctionWordUniformity(text) {
  const functionWords = ['the', 'and', 'to', 'of', 'is', 'in', 'that', 'it', 'for', 'on', 'with', 'as'];
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return 0;
  const freqs = functionWords.map(w => 0);
  const map = {};
  tokens.forEach(t => { map[t] = (map[t] || 0) + 1; });
  functionWords.forEach((w, i) => { freqs[i] = (map[w] || 0) / tokens.length; });
  const mean = freqs.reduce((a, b) => a + b, 0) / freqs.length;
  const variance = freqs.reduce((sum, f) => sum + Math.pow(f - mean, 2), 0) / freqs.length;
  return variance; // lower variance = more uniform; normalization will capture deviation
}
// FIX: Added transition word density (transitions per sentence)
function calculateTransitionDensity(text) {
  const transitions = ['however', 'moreover', 'therefore', 'consequently', 'furthermore', 'additionally', 'thus', 'hence', 'nevertheless', 'nonetheless', 'similarly', 'meanwhile', 'in contrast', 'on the other hand'];
  const lower = text.toLowerCase();
  let count = 0;
  transitions.forEach(t => {
    const re = new RegExp('\\b' + t.replace(/\s+/g, '\\s+') + '\\b', 'gi');
    const m = lower.match(re);
    if (m) count += m.length;
  });
  const sentences = analyzeSentences(text).count || 1;
  return count / Math.max(1, sentences);
}
// FIX: Added filler phrase ratio (filler phrases per sentence)
function calculateFillerRatio(text) {
  const fillers = [
    "it is important to note",
    "it is worth noting",
    "in conclusion",
    "to be honest",
    "worth noting",
    "studies show",
    "research shows",
    "some people say",
    "it is important",
    "it is clear that"
  ];
  const lower = text.toLowerCase();
  let count = 0;
  fillers.forEach(f => {
    const re = new RegExp(f.replace(/\s+/g, '\\s+'), 'gi');
    const m = lower.match(re);
    if (m) count += m.length;
  });
  const sentences = analyzeSentences(text).count || 1;
  return count / Math.max(1, sentences);
}

/**
 * Check emoji placement habits in text.
 * Returns a score in [0,1] where 1.0 means all found emojis are terminal
 * (located at the end of sentences/paragraphs) — considered an AI-like signal.
 * @param {string} text
 * @returns {number}
 */
function checkEmojiHabits(text) {
  if (!text || typeof text !== 'string') return 0;
  // Broad emoji range (covers common emoji blocks)
  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  let totalEmojis = 0;
  let terminalEmojis = 0;

  for (const s of sentences) {
    const matches = [...(s.matchAll(emojiRegex))];
    if (!matches || matches.length === 0) continue;
    totalEmojis += matches.length;
    const trimmed = s.trim();
    // Check if each emoji is within the last 3 characters of the trimmed sentence
    for (const m of matches) {
      const idx = m.index || 0;
      if (idx >= Math.max(0, trimmed.length - 3)) terminalEmojis++;
    }
  }

  if (totalEmojis === 0) return 0;
  return Math.min(1, terminalEmojis / totalEmojis);
}

/**
 * Calculate entropy volatility across consecutive sentences.
 * Returns the mean absolute difference of sentence-level token entropy.
 * @param {string} text
 * @returns {number}
 */
function calculateEntropyVolatility(text) {
  if (!text || typeof text !== 'string') return 0;
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length < 2) return 0;
  const entropies = sentences.map(s => calculateTokenEntropy(s));
  const diffs = [];
  for (let i = 0; i < entropies.length - 1; i++) {
    diffs.push(Math.abs(entropies[i + 1] - entropies[i]));
  }
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return meanDiff;
}

/**
 * Detect copy-paste / ghost markdown artifacts common in LLM outputs.
 * Returns a score in [0,1] where higher means more artifact presence.
 * Looks for markdown headers (###), bold markers (**bold**), and
 * numbered list patterns occurring in short segments.
 * @param {string} text
 * @returns {number}
 */
function detectCopyPasteArtifacts(text) {
  if (!text || typeof text !== 'string') return 0;
  const headerRe = /^\s*#{1,6}\s+/gm;
  const boldRe = /\*\*[^\*]+\*\*/g;
  const numberedRe = /(?:^|\s)\d+\.\s+/g;

  const headerMatches = text.match(headerRe) || [];
  const boldMatches = text.match(boldRe) || [];
  const numberedMatches = text.match(numberedRe) || [];

  const artifactCount = headerMatches.length + boldMatches.length + numberedMatches.length;
  // Normalize by sentence count (more artifacts per sentence = stronger signal)
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const denom = Math.max(1, sentences.length);
  return Math.min(1, artifactCount / denom);
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZE FEATURES (Z-score normalization)
// ═══════════════════════════════════════════════════════════════

// Human baseline values (estimated from diverse human-written content)
const HUMAN_BASELINES = {
  sentenceLengthMean: { mean: 18, stdDev: 6 },
  sentenceLengthVariance: { mean: 45, stdDev: 25 },
  tokenEntropy: { mean: 8.5, stdDev: 1.5 },
  ngramRepetition: { mean: 0.15, stdDev: 0.1 },
  readabilityGrade: { mean: 10, stdDev: 3 },
  posRegularity: { mean: 0.45, stdDev: 0.15 },
  lexicalDiversity: { mean: 0.65, stdDev: 0.15 }
};

// Baselines for added signals
HUMAN_BASELINES.burstiness = { mean: 5, stdDev: 3 };
HUMAN_BASELINES.stopwordRatio = { mean: 0.45, stdDev: 0.08 };
HUMAN_BASELINES.functionWordUniformity = { mean: 0.015, stdDev: 0.01 };
HUMAN_BASELINES.transitionDensity = { mean: 0.12, stdDev: 0.06 };
HUMAN_BASELINES.fillerRatio = { mean: 0.08, stdDev: 0.05 };
// Baselines for new signals
HUMAN_BASELINES.emojiTerminal = { mean: 0.3, stdDev: 0.2 };
HUMAN_BASELINES.entropyVolatility = { mean: 1.5, stdDev: 1.0 };
HUMAN_BASELINES.copyPasteArtifacts = { mean: 0.02, stdDev: 0.03 };

function normalizeFeature(value, baseline) {
  // Z-score normalization
  // FIX: guard against zero stdDev to avoid division-by-zero / NaN
  const stdDev = (baseline.stdDev && baseline.stdDev > 0) ? baseline.stdDev : 1e-6;
  const z = (value - baseline.mean) / stdDev;

  // Convert to [0,1] where higher = more AI-like
  // AI text tends to be more regular, so high/low extremes indicate AI
  const normalized = Math.abs(z) / 3; // 3 standard deviations covers ~99.7%
  return Math.min(1, Math.max(0, normalized));
}

// ═══════════════════════════════════════════════════════════════
// COMPREHENSIVE STATISTICAL ANALYSIS
// ═══════════════════════════════════════════════════════════════

export function analyzeTextStatistics(text) {
  if (!text || text.trim().length < 10) {
    return {
      score: 0,
      confidence: 0,
      features: {},
      reasons: ['Text too short for analysis']
    };
  }

  // Extract all features
  const sentences = analyzeSentences(text);
  const entropy = calculateTokenEntropy(text);
  const ngrams = analyzeNgramRepetition(text, 3);
  const readability = calculateReadability(text);
  const pos = analyzePOSRegularity(text);
  const punctuation = analyzePunctuation(text);
  const lexical = calculateLexicalDiversity(text);
  // New features
  const burstiness = calculateBurstiness(text);
  const stopwordRatio = calculateStopwordRatio(text);
  const functionWordUniformity = calculateFunctionWordUniformity(text);
  const transitionDensity = calculateTransitionDensity(text);
  const fillerRatio = calculateFillerRatio(text);
  // New micro-stylometric / boundary signals
  const emojiTerminalScore = checkEmojiHabits(text);
  const entropyVolatility = calculateEntropyVolatility(text);
  const copyPasteArtifacts = detectCopyPasteArtifacts(text);

  // Normalize features
  // Adjust baselines dynamically for short texts
  const baselines = Object.assign({}, HUMAN_BASELINES);
  const wordCountTotal = (text.split(/\s+/).filter(w => w.length > 0)).length;
  if (wordCountTotal < 50) {
    // Increase allowed variance (stdDev) for tokenEntropy and posRegularity by 30%
    if (baselines.tokenEntropy && typeof baselines.tokenEntropy.stdDev === 'number') {
      baselines.tokenEntropy = { ...baselines.tokenEntropy, stdDev: baselines.tokenEntropy.stdDev * 1.3 };
    }
    if (baselines.posRegularity && typeof baselines.posRegularity.stdDev === 'number') {
      baselines.posRegularity = { ...baselines.posRegularity, stdDev: baselines.posRegularity.stdDev * 1.3 };
    }
  }

  const normalizedFeatures = {
    sentenceLengthVariance: normalizeFeature(sentences.variance, HUMAN_BASELINES.sentenceLengthVariance),
    sentenceLengthMean: normalizeFeature(sentences.mean, HUMAN_BASELINES.sentenceLengthMean),
    tokenEntropy: normalizeFeature(entropy, baselines.tokenEntropy || HUMAN_BASELINES.tokenEntropy),
    ngramRepetition: normalizeFeature(ngrams.repetitionRate, HUMAN_BASELINES.ngramRepetition),
    readabilityGrade: normalizeFeature(readability.grade, HUMAN_BASELINES.readabilityGrade),
    posRegularity: normalizeFeature(pos.regularity, baselines.posRegularity || HUMAN_BASELINES.posRegularity),
    lexicalDiversity: normalizeFeature(1 - lexical.ttr, { mean: 0.35, stdDev: 0.15 }), // Inverted - low diversity is AI-like
    // New normalized features
    burstiness: normalizeFeature(burstiness, HUMAN_BASELINES.burstiness),
    stopwordRatio: normalizeFeature(stopwordRatio, HUMAN_BASELINES.stopwordRatio),
    functionWordUniformity: normalizeFeature(functionWordUniformity, HUMAN_BASELINES.functionWordUniformity),
    transitionDensity: normalizeFeature(transitionDensity, HUMAN_BASELINES.transitionDensity),
    fillerRatio: normalizeFeature(fillerRatio, HUMAN_BASELINES.fillerRatio),
    // New normalized features
    emojiPlacement: normalizeFeature(emojiTerminalScore, HUMAN_BASELINES.emojiTerminal),
    entropyVolatility: normalizeFeature(entropyVolatility, HUMAN_BASELINES.entropyVolatility),
    copyPasteArtifacts: normalizeFeature(copyPasteArtifacts, HUMAN_BASELINES.copyPasteArtifacts)
  };

  // Entropy floor: do not trigger tokenEntropy signal for very low unique-word counts
  if (lexical && typeof lexical.uniqueWords === 'number' && lexical.uniqueWords < 10) {
    normalizedFeatures.tokenEntropy = 0;
  }

  // Weighted scoring (sum to 1.0)
  // Rebalanced weights to include new features (sum = 1.0)
  const weights = {
    sentenceLengthVariance: 0.11,
    ngramRepetition: 0.11,
    lexicalDiversity: 0.09,
    tokenEntropy: 0.09,
    posRegularity: 0.09,
    readabilityGrade: 0.06,
    sentenceLengthMean: 0.05,
    // Existing feature weights (slightly rebalanced)
    burstiness: 0.07,
    stopwordRatio: 0.06,
    functionWordUniformity: 0.06,
    transitionDensity: 0.05,
    fillerRatio: 0.04,
    // New features
    emojiPlacement: 0.03,
    entropyVolatility: 0.05,
    copyPasteArtifacts: 0.04
  };

  // Dynamic weight adjustments for short texts (<50 words)
  // Dynamic weight adjustments for short texts (<50 words)
  if (wordCountTotal < 50) {
    // STATISTICAL NARROWING: Ignore "Readability" and "Burstiness" (useless for tweets)
    weights.readabilityGrade = 0;
    weights.burstiness = 0;

    // Reduce other noisy signals
    weights.stopwordRatio *= 0.4;
    weights.lexicalDiversity *= 0.6;

    // BOOST meaningful signals for short text
    // Re-assign lost weight to tokenEntropy and posRegularity
    weights.tokenEntropy *= 2.0;
    weights.posRegularity *= 2.0;

    // Boost micro-stylometric signals significantly as they are high-precision
    weights.emojiPlacement *= 2.5;
    weights.copyPasteArtifacts *= 2.5;

    // Renormalize weights to sum to 1.0
    const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
    Object.keys(weights).forEach(k => { weights[k] = weights[k] / totalW; });
  }

  // Calculate weighted score
  let score = 0;
  Object.keys(normalizedFeatures).forEach(feature => {
    score += normalizedFeatures[feature] * weights[feature];
  });

  // Convert to 0-100 scale
  score = score * 100;
  // FIX: Ensure final score is clamped to 0-100 to avoid overflow/NaN
  score = Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0));

  // Short-text score adjustment: downscale scores for very short texts
  // But preserve scores when micro-stylometric signals (emoji placement or copy-paste artifacts)
  // indicate clear AI-like patterns even in short text.
  if (wordCountTotal < 50) {
    const microSignalStrength = (emojiTerminalScore || 0) + (copyPasteArtifacts || 0);
    if (microSignalStrength < 0.4) {
      score = score * 0.6;
    }
  }

  // Generate reasons based on strongest signals
  const reasons = [];
  const threshold = 0.6; // Features above this are notable

  if (normalizedFeatures.sentenceLengthVariance > threshold) {
    if (sentences.variance < HUMAN_BASELINES.sentenceLengthVariance.mean * 0.5) {
      reasons.push('Unusually uniform sentence lengths');
    } else {
      reasons.push('Highly variable sentence structure');
    }
  }

  if (normalizedFeatures.ngramRepetition > threshold) {
    reasons.push(`Repetitive phrasing (${(ngrams.repetitionRate * 100).toFixed(0)}% repeated)`);
  }

  if (normalizedFeatures.lexicalDiversity > threshold) {
    reasons.push(`Limited vocabulary diversity (TTR: ${(lexical.ttr * 100).toFixed(0)}%)`);
  }

  if (normalizedFeatures.tokenEntropy > threshold) {
    if (entropy < HUMAN_BASELINES.tokenEntropy.mean) {
      reasons.push('Predictable word patterns');
    } else {
      reasons.push('Unusually random word distribution');
    }
  }

  // New explainable reasons for added features
  if (normalizedFeatures.burstiness > threshold) {
    reasons.push('Unusually smooth sentence flow');
  }

  if (normalizedFeatures.stopwordRatio > threshold) {
    reasons.push('High stopword usage');
  }

  if (normalizedFeatures.functionWordUniformity > threshold) {
    reasons.push('Template-like phrasing detected');
  }

  if (normalizedFeatures.transitionDensity > threshold) {
    reasons.push('Overuse of transition phrases');
  }

  if (normalizedFeatures.fillerRatio > threshold) {
    reasons.push('Excessive filler phrases');
  }

  if (normalizedFeatures.posRegularity > threshold) {
    reasons.push('Overly regular grammatical structure');
  }

  // Calculate confidence based on text length and feature agreement
  const wordCount = text.split(/\s+/).length;
  let confidence = Math.min(1, wordCount / 100); // More words = higher confidence

  // Feature agreement: how many features agree on AI-likeness
  const featuresCount = Object.values(normalizedFeatures).length;
  const aiLikeFeatures = Object.values(normalizedFeatures).filter(v => v > 0.4).length;
  const agreement = aiLikeFeatures / featuresCount;
  confidence *= agreement;
  // FIX: ensure confidence is finite and capped at 100
  const confPercent = Math.min(100, Math.max(0, Number.isFinite(confidence) ? confidence * 100 : 0));
  // Confidence adjustment: cap maximum confidence for single-sentence texts
  const sentenceCount = (sentences && sentences.count) ? sentences.count : analyzeSentences(text).count;
  let adjustedConf = confPercent;
  if (sentenceCount === 1) {
    adjustedConf = Math.min(adjustedConf, 40); // cap at 40%
  }
  // FIX: deduplicate reasons for clearer output
  const uniqueReasons = [...new Set(reasons)];

  return {
    score,
    confidence: adjustedConf,
    normalizedFeatures,
    rawFeatures: {
      sentences,
      entropy,
      ngrams,
      readability,
      pos,
      punctuation,
      lexical,
      // FIX: include new raw features for debugging/inspection
      burstiness,
      stopwordRatio,
      functionWordUniformity,
      transitionDensity,
      fillerRatio
    },
    reasons: uniqueReasons,
    interpretation: score > 65 ? 'Likely AI-generated' :
      score > 35 ? 'Uncertain - mixed signals' :
        'Likely human-written'
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════

export {
  analyzeSentences,
  calculateTokenEntropy,
  analyzeNgramRepetition,
  calculateReadability,
  analyzePOSRegularity,
  analyzePunctuation,
  calculateLexicalDiversity,
  // FIX: Export new helper signals for external inspection/testing
  calculateBurstiness,
  calculateStopwordRatio,
  calculateFunctionWordUniformity,
  calculateTransitionDensity,
  calculateFillerRatio,
  // New micro-stylometric helpers
  checkEmojiHabits,
  calculateEntropyVolatility,
  detectCopyPasteArtifacts,
  normalizeFeature,
  HUMAN_BASELINES
};
