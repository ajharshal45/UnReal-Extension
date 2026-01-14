// ShareSafe Content Script v3.1 - Unified AI Detection
// Restores full segment analysis + adds social media support

// ═══════════════════════════════════════════════════════════════
// DEBUG LOGGING
// ═══════════════════════════════════════════════════════════════

const AI_DEBUG = true;

function debugLog(category, ...args) {
  if (AI_DEBUG) {
    console.log(`%c[AI-DETECTOR]%c [${category}]`,
      'color: #8b5cf6; font-weight: bold;',
      'color: #6366f1;',
      ...args);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN IIFE
// ═══════════════════════════════════════════════════════════════

(async function () {
  // Prevent multiple injections
  if (window.__sharesafe_injected__) return;
  window.__sharesafe_injected__ = true;

  debugLog('INIT', 'Content script loaded on', location.hostname);

  // ═══════════════════════════════════════════════════════════════
  // PLATFORM DETECTION
  // ═══════════════════════════════════════════════════════════════

  function detectPlatform() {
    const host = location.hostname.toLowerCase();

    if (host.includes('twitter.com') || host.includes('x.com')) return 'TWITTER';
    if (host.includes('instagram.com')) return 'INSTAGRAM';
    if (host.includes('facebook.com')) return 'FACEBOOK';
    if (host.includes('reddit.com')) return 'REDDIT';
    if (host.includes('linkedin.com')) return 'LINKEDIN';
    if (host.includes('wikipedia.org')) return 'WIKIPEDIA';

    return 'GENERIC';
  }

  function isSocialMediaSite() {
    const p = detectPlatform();
    return ['TWITTER', 'INSTAGRAM', 'FACEBOOK', 'REDDIT', 'LINKEDIN'].includes(p);
  }

  const platform = detectPlatform();
  debugLog('PLATFORM', platform, '| Social:', isSocialMediaSite());

  // Helper: promisified wrapper for chrome.storage.sync.get
  function getSyncStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(keys, (result) => resolve(result || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  // Check if extension is enabled
  const settings = await getSyncStorage([
    'extensionEnabled',
    'segmentAnalysis',
    'imageAnalysis',
    'llmTiebreaker',
    'excludeList',
    'includeList'
  ]);

  if (settings.extensionEnabled === false) {
    debugLog('INIT', 'Extension is disabled');
    return;
  }

  // Check exclude/include lists
  const currentDomain = location.hostname;

  if (settings.excludeList && settings.excludeList.length > 0) {
    if (settings.excludeList.some(domain => currentDomain.includes(domain))) {
      debugLog('INIT', 'Domain excluded');
      return;
    }
  }

  if (settings.includeList && settings.includeList.length > 0) {
    if (!settings.includeList.some(domain => currentDomain.includes(domain))) {
      debugLog('INIT', 'Domain not in include list');
      return;
    }
  }

  // Don't run on browser internal pages
  if (location.protocol === 'chrome:' || location.protocol === 'chrome-extension:') return;

  console.log('%c[ShareSafe v3.1] AI Detection Active', 'color: #4f46e5; font-weight: bold; font-size: 14px;');

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════

  let mutationObserver = null;
  let debounceTimer = null;
  let analysisInProgress = false;

  // ═══════════════════════════════════════════════════════════════
  // MAIN ANALYSIS FUNCTION (Uses full segmentAnalyzer pipeline)
  // ═══════════════════════════════════════════════════════════════

  async function analyzePageWithSegments() {
    if (analysisInProgress) {
      debugLog('ANALYSIS', 'Already in progress, skipping');
      return;
    }

    const segmentAnalysisEnabled = settings.segmentAnalysis !== false;

    if (!segmentAnalysisEnabled) {
      debugLog('ANALYSIS', 'Segment analysis disabled');
      return;
    }

    analysisInProgress = true;
    debugLog('ANALYSIS', '=== Starting segment-based analysis ===');

    try {
      // Import modules dynamically
      const { analyzePageSegments } = await import(chrome.runtime.getURL('segmentAnalyzer.js'));
      const {
        injectHighlightStyles,
        highlightSegment,
        createSummaryPanel
      } = await import(chrome.runtime.getURL('visualHighlighter.js'));
      const {
        getCached,
        setCached,
        generatePageCacheKey
      } = await import(chrome.runtime.getURL('cacheManager.js'));

      // Inject styles
      injectHighlightStyles();

      // Check cache (skip for social media to capture new posts)
      const rawBodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
      const pageContent = rawBodyText.slice(0, 500);
      const cacheKey = generatePageCacheKey(location.href, pageContent);

      let pageAnalysis;
      const cached = isSocialMediaSite() ? null : await getCached(cacheKey, 'page');

      if (cached) {
        debugLog('ANALYSIS', 'Using cached analysis');
        pageAnalysis = cached;
      } else {
        // Perform fresh analysis
        pageAnalysis = await analyzePageSegments(document.body, {
          minWordCount: isSocialMediaSite() ? 10 : 20,
          maxSegments: isSocialMediaSite() ? 50 : 30,
          useLLMTiebreaker: settings.llmTiebreaker === true
        });

        // Cache result (only for non-social sites)
        if (!isSocialMediaSite()) {
          await setCached(cacheKey, pageAnalysis, 'page');
        }
      }

      debugLog('ANALYSIS', 'Complete:', {
        score: pageAnalysis?.pageScore,
        segments: pageAnalysis?.segmentCount,
        highRisk: pageAnalysis?.highRiskCount,
        mediumRisk: pageAnalysis?.mediumRiskCount,
        lowRisk: pageAnalysis?.lowRiskCount
      });

      // Send results to background for popup
      try {
        const reasonsList = Array.isArray(pageAnalysis?.segments)
          ? pageAnalysis.segments
            .filter(s => s?.shouldReview)
            .slice(0, 5)
            .map(s => s.reasons?.[0])
            .filter(Boolean)
          : [];

        chrome.runtime.sendMessage({
          type: 'STORE_ANALYSIS',
          data: {
            riskLevel: pageAnalysis?.riskLevel,
            score: pageAnalysis?.pageScore,
            reasons: reasonsList,
            summary: pageAnalysis?.summary,
            url: location.href
          }
        });
      } catch (e) {
        debugLog('ERROR', 'Failed to send STORE_ANALYSIS:', e);
      }

      // Highlight segments
      if (Array.isArray(pageAnalysis?.segments)) {
        let highlightedCount = 0;
        pageAnalysis.segments.forEach(segScore => {
          if (!segScore) return;
          if (segScore.shouldReview || segScore.score >= 35) {
            highlightSegment(segScore, {
              showBadge: segScore.score >= 40,
              showTooltipOnClick: true
            });
            highlightedCount++;
          }
        });
        debugLog('HIGHLIGHT', 'Highlighted', highlightedCount, 'segments');
      }

      // CREATE SUMMARY PANEL (the UI shown in the screenshot)
      if (pageAnalysis?.segmentCount > 0) {
        createSummaryPanel(pageAnalysis);
        debugLog('PANEL', 'Summary panel created');
      }

    } catch (error) {
      debugLog('ERROR', 'Segment analysis failed:', error);
    } finally {
      analysisInProgress = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // IMAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  async function analyzePageImages() {
    const imageAnalysisEnabled = settings.imageAnalysis !== false;

    if (!imageAnalysisEnabled) {
      debugLog('IMAGES', 'Image analysis disabled');
      return;
    }

    debugLog('IMAGES', 'Starting image analysis...');

    try {
      const {
        injectImageDetectionStyles,
        scanPageImages,
        startImageMonitoring
      } = await import(chrome.runtime.getURL('imageDetector.js'));

      injectImageDetectionStyles();

      const useLLM = settings.llmTiebreaker === true;
      const results = await scanPageImages({ useLLM });

      debugLog('IMAGES', `Found ${results.length} images with AI indicators`);

      startImageMonitoring({ useLLM });

    } catch (error) {
      debugLog('ERROR', 'Image analysis failed:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MUTATION OBSERVER (For dynamic content / infinite scroll)
  // ═══════════════════════════════════════════════════════════════

  function shouldTriggerAnalysis(mutations) {
    try {
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              const el = node;
              if (el.classList && Array.from(el.classList).some(c => c && c.startsWith('sharesafe-'))) continue;
              const text = (el.innerText || '').trim();
              if (text.length > 30) return true;
            }
            if (node.nodeType === 3) {
              if ((node.textContent || '').trim().length > 20) return true;
            }
          }
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function setupMutationObserver() {
    if (!document.body) return;

    if (mutationObserver) {
      try { mutationObserver.disconnect(); } catch (e) { }
      mutationObserver = null;
    }

    debugLog('OBSERVER', 'Setting up MutationObserver');

    mutationObserver = new MutationObserver((mutations) => {
      if (analysisInProgress) return;
      if (!shouldTriggerAnalysis(mutations)) return;

      // Shorter debounce for social media
      const debounceTime = isSocialMediaSite() ? 500 : 1500;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (analysisInProgress) return;

        debugLog('OBSERVER', 'DOM mutation detected - re-analyzing');

        try {
          if (mutationObserver) mutationObserver.disconnect();

          await analyzePageWithSegments();

          setTimeout(() => analyzePageImages(), 1000);

        } catch (e) {
          debugLog('ERROR', 'Observer analysis failed:', e);
        } finally {
          try {
            if (mutationObserver) {
              mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
          } catch (e) { }
        }
      }, debounceTime);
    });

    try {
      mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      debugLog('OBSERVER', 'Attached successfully');
    } catch (e) {
      debugLog('ERROR', 'Failed to attach observer:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init() {
    debugLog('INIT', 'Starting initialization for platform:', platform);

    setTimeout(async () => {
      debugLog('INIT', '=== Running initial analysis ===');

      // Use the FULL segment analysis pipeline for ALL pages
      await analyzePageWithSegments();

      // Run image analysis after text analysis
      setTimeout(() => analyzePageImages(), 1000);

      // Set up observer for dynamic content
      setupMutationObserver();

      debugLog('INIT', '=== Initialization complete ===');
    }, 1000);
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Stop observer if extension is disabled at runtime
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && changes.extensionEnabled?.newValue === false) {
      debugLog('INIT', 'Extension disabled - stopping observers');
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
    }
  });

})();
