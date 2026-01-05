// ShareSafe Content Script v2.0 - Segment-Based AI Detection
// Integrates all new modules for sophisticated AI content analysis

// Check if extension is enabled
(async function() {
  // Prevent multiple injections
  if (window.__sharesafe_injected__) return;
  window.__sharesafe_injected__ = true;

  // Check if extension is enabled
  const settings = await chrome.storage.sync.get([
    'extensionEnabled',
    'segmentAnalysis',
    'imageAnalysis',
    'llmTiebreaker',
    'excludeList',
    'includeList'
  ]);

  // Check if extension is disabled
  if (settings.extensionEnabled === false) {
    console.log('ShareSafe: Extension is disabled');
    return;
  }

  // Check exclude/include lists
  const currentDomain = location.hostname;
  
  if (settings.excludeList && settings.excludeList.length > 0) {
    if (settings.excludeList.some(domain => currentDomain.includes(domain))) {
      console.log('ShareSafe: Domain excluded');
      return;
    }
  }

  if (settings.includeList && settings.includeList.length > 0) {
    if (!settings.includeList.some(domain => currentDomain.includes(domain))) {
      console.log('ShareSafe: Domain not in include list');
      return;
    }
  }

  // Don't run on browser internal pages
  if (location.protocol === 'chrome:' || location.protocol === 'chrome-extension:') return;

  console.log('%c[ShareSafe v2.0] Segment-Based AI Detection Active', 'color: #4f46e5; font-weight: bold; font-size: 14px;');

  // ═══════════════════════════════════════════════════════════════
  // MAIN ANALYSIS FUNCTION
  // ═══════════════════════════════════════════════════════════════

  async function analyzePageWithSegments() {
    const segmentAnalysisEnabled = settings.segmentAnalysis !== false;
    
    if (!segmentAnalysisEnabled) {
      console.log('ShareSafe: Segment analysis disabled, using legacy mode');
      return;
    }

    // Skip analysis for very short content
    const pageText = document.body.innerText;
    if (pageText.length < 300) {
      console.log('ShareSafe: Content too short (<300 chars), skipping analysis');
      return;
    }

    console.log('ShareSafe: Starting segment-based analysis...');

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

      // Check cache
      const pageContent = document.body.innerText.slice(0, 500);
      const cacheKey = generatePageCacheKey(location.href, pageContent);
      const cached = await getCached(cacheKey, 'page');

      let pageAnalysis;

      if (cached) {
        console.log('ShareSafe: Using cached analysis');
        pageAnalysis = cached;
      } else {
        // Perform fresh analysis
        pageAnalysis = await analyzePageSegments(document.body, {
          minWordCount: 20,
          maxSegments: 30,
          useLLMTiebreaker: settings.llmTiebreaker === true
        });

        // Cache result
        await setCached(cacheKey, pageAnalysis, 'page');
      }

      console.log('ShareSafe: Page analysis complete:', pageAnalysis);
      if (pageAnalysis.llmUsedCount > 0) {
        console.log(`ShareSafe: LLM was used for ${pageAnalysis.llmUsedCount} uncertain segments`);
      } else {
        console.log('ShareSafe: Pure statistical analysis (no LLM calls)');
      }

      // Send results to background for popup
      chrome.runtime.sendMessage({
        type: 'STORE_ANALYSIS',
        data: {
          riskLevel: pageAnalysis.riskLevel,
          score: pageAnalysis.pageScore,
          reasons: pageAnalysis.segments
            .filter(s => s.shouldReview)
            .slice(0, 5)
            .map(s => s.reasons[0])
            .filter(Boolean),
          summary: pageAnalysis.summary,
          url: location.href
        }
      });

      // Highlight segments
      pageAnalysis.segments.forEach(segScore => {
        if (segScore.shouldReview || segScore.score >= 35) {
          highlightSegment(segScore, {
            showBadge: segScore.score >= 40,
            showTooltipOnClick: true
          });
        }
      });

      // Create summary panel
      if (pageAnalysis.highRiskCount > 0 || pageAnalysis.mediumRiskCount > 0) {
        createSummaryPanel(pageAnalysis);
      }

      // Floating badge disabled - use popup instead
      // updateFloatingBadge(pageAnalysis);

    } catch (error) {
      console.error('ShareSafe: Segment analysis error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // IMAGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════

  async function analyzePageImages() {
    const imageAnalysisEnabled = settings.imageAnalysis !== false;
    
    if (!imageAnalysisEnabled) {
      console.log('ShareSafe: Image analysis disabled');
      return;
    }

    console.log('ShareSafe: Starting image analysis...');

    try {
      const { 
        injectImageDetectionStyles, 
        scanPageImages,
        startImageMonitoring
      } = await import(chrome.runtime.getURL('imageDetector.js'));

      injectImageDetectionStyles();

      const useLLM = settings.llmTiebreaker === true;
      
      // Scan existing images
      const results = await scanPageImages({
        useLLM
      });

      console.log(`ShareSafe: Found ${results.length} images with AI indicators`);
      
      // Start monitoring for dynamically loaded images
      startImageMonitoring({
        useLLM
      });

    } catch (error) {
      console.error('ShareSafe: Image analysis error:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FLOATING BADGE
  // ═══════════════════════════════════════════════════════════════

  let badgeContainer = null;

  function createFloatingBadge() {
    if (badgeContainer) return;

    badgeContainer = document.createElement('div');
    badgeContainer.id = 'sharesafe-floating-badge';
    badgeContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border-radius: 50%;
      width: 56px;
      height: 56px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 999999;
      transition: all 0.3s ease;
    `;

    badgeContainer.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" style="width: 28px; height: 28px;">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    `;

    badgeContainer.addEventListener('mouseenter', () => {
      badgeContainer.style.transform = 'scale(1.1)';
      badgeContainer.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
    });

    badgeContainer.addEventListener('mouseleave', () => {
      badgeContainer.style.transform = 'scale(1)';
      badgeContainer.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    });

    document.body.appendChild(badgeContainer);
  }

  function updateFloatingBadge(analysis) {
    if (!badgeContainer) createFloatingBadge();

    const { pageScore, riskLevel, highRiskCount } = analysis;

    // Update badge color based on risk
    let color = '#22c55e'; // Low
    if (riskLevel === 'high') color = '#ef4444';
    else if (riskLevel === 'medium') color = '#f97316';

    badgeContainer.style.border = `3px solid ${color}`;

    // Add counter if high risk segments found
    if (highRiskCount > 0) {
      let counter = badgeContainer.querySelector('.risk-counter');
      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'risk-counter';
        counter.style.cssText = `
          position: absolute;
          top: -6px;
          right: -6px;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
        `;
        badgeContainer.appendChild(counter);
      }
      counter.textContent = highRiskCount;
    }

    // Update title
    badgeContainer.title = `ShareSafe: ${analysis.summary}\nPage Score: ${pageScore}/100`;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Floating badge disabled - use popup instead
    // createFloatingBadge();
    
    // Run analysis after short delay to let page settle
    setTimeout(async () => {
      await analyzePageWithSegments();
      
      // Run image analysis after text analysis
      setTimeout(() => {
        analyzePageImages();
      }, 1000);
    }, 1000);
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
