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
  // IMAGE SCANNER CLASS - Automatic AI Image Detection
  // ═══════════════════════════════════════════════════════════════

  class ImageScanner {
    constructor() {
      this.queue = [];
      this.processing = 0;
      this.maxConcurrent = 3;
      this.checkedImages = new Set();
      this.analysisResults = new Map();
      this.mutationObserver = null;
      this.intersectionObserver = null;
      this.geminiApiKey = null;
      this.aiImageCount = 0;
      this.isEnabled = true;
      this.processDelay = 500;
      this.lastProcessTime = 0;

      // Trusted domains to skip
      this.trustedDomains = [
        'google.com/images',
        'gstatic.com',
        'googleusercontent.com',
        'googleapis.com',
        'chrome.google.com'
      ];

      // Social media platform configs
      this.platformSelectors = {
        'twitter.com': 'article img[src*="twimg"], [data-testid="tweetPhoto"] img',
        'x.com': 'article img[src*="twimg"], [data-testid="tweetPhoto"] img',
        'facebook.com': '[data-pagelet] img, .x1ey2m1c img',
        'instagram.com': 'article img, ._aagv img',
        'linkedin.com': '.feed-shared-image img, .update-components-image img',
        'reddit.com': '[data-testid="post-container"] img, .media-element'
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    async init() {
      console.log('[ImageScanner] Initializing automatic image detection...');

      try {
        // Import imageDetector module
        const imageDetectorModule = await import(chrome.runtime.getURL('imageDetector.js'));
        this.imageDetector = imageDetectorModule;

        // Get API keys
        this.geminiApiKey = await this.getGeminiApiKey();
        console.log('[ImageScanner] Gemini API key loaded:', this.geminiApiKey ? 'Yes' : 'No');
        
        // Get Sightengine credentials
        const sightengineCredentials = await this.getSightengineCredentials();
        this.sightengineUser = sightengineCredentials.user;
        this.sightengineSecret = sightengineCredentials.secret;
        console.log('[ImageScanner] Sightengine credentials loaded:', 
          (this.sightengineUser && this.sightengineSecret) ? 'Yes' : 'No');

        // Inject styles
        this.injectStyles();

        // Start observers
        this.observeNewImages();
        this.observeVisibleImages();

        // Scan existing images
        this.scanExistingImages();

        console.log('[ImageScanner] Initialization complete');
      } catch (error) {
        console.error('[ImageScanner] Initialization error:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // API KEY RETRIEVAL
    // ═══════════════════════════════════════════════════════════════

    async getGeminiApiKey() {
      return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          resolve(null);
          return;
        }
        chrome.storage.sync.get(['geminiApiKey', 'apiKey'], (result) => {
          resolve(result.geminiApiKey || result.apiKey || null);
        });
      });
    }

    async getSightengineCredentials() {
      return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage) {
          resolve({ user: null, secret: null });
          return;
        }
        chrome.storage.sync.get(['sightengineUser', 'sightengineSecret'], (result) => {
          resolve({
            user: result.sightengineUser || null,
            secret: result.sightengineSecret || null
          });
        });
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // STYLE INJECTION
    // ═══════════════════════════════════════════════════════════════

    injectStyles() {
      if (document.getElementById('unreal-image-scanner-styles')) {
        console.log('[ImageScanner] Styles already injected');
        return;
      }

      console.log('[ImageScanner] Injecting styles');
      const style = document.createElement('style');
      style.id = 'unreal-image-scanner-styles';
      style.textContent = `
        .unreal-image-wrapper {
          position: relative !important;
          display: inline-block !important;
        }

        .unreal-spinner-overlay {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.3) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 999998 !important;
          pointer-events: none !important;
        }

        .unreal-spinner {
          width: 32px !important;
          height: 32px !important;
          border: 3px solid rgba(255, 255, 255, 0.3) !important;
          border-top-color: #fff !important;
          border-radius: 50% !important;
          animation: unreal-spin 0.8s linear infinite !important;
        }

        @keyframes unreal-spin {
          to { transform: rotate(360deg); }
        }

        .unreal-image-badge {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          background: rgba(0, 0, 0, 0.85) !important;
          backdrop-filter: blur(10px) !important;
          color: white !important;
          padding: 6px 10px !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          z-index: 999999 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3) !important;
          max-width: 200px !important;
          white-space: nowrap !important;
        }

        .unreal-image-badge:hover {
          transform: scale(1.05) !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
        }

        .unreal-image-badge.high-risk {
          border-left: 3px solid #ef4444 !important;
        }

        .unreal-image-badge.medium-risk {
          border-left: 3px solid #f97316 !important;
        }

        .unreal-image-badge.low-risk {
          border-left: 3px solid #22c55e !important;
        }

        .unreal-image-badge.error {
          border-left: 3px solid #6b7280 !important;
        }

        .unreal-image-border-high {
          outline: 3px solid #ef4444 !important;
          outline-offset: -3px !important;
        }

        .unreal-image-border-medium {
          outline: 3px solid #f97316 !important;
          outline-offset: -3px !important;
        }

        .unreal-image-border-low {
          outline: 3px solid #22c55e !important;
          outline-offset: -3px !important;
        }

        .unreal-details-popup {
          position: fixed !important;
          background: white !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3) !important;
          z-index: 9999999 !important;
          max-width: 380px !important;
          min-width: 300px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          overflow: hidden !important;
        }

        .unreal-details-header {
          padding: 16px 20px !important;
          color: white !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
        }

        .unreal-details-header.high-risk {
          background: linear-gradient(135deg, #ef4444, #dc2626) !important;
        }

        .unreal-details-header.medium-risk {
          background: linear-gradient(135deg, #f97316, #ea580c) !important;
        }

        .unreal-details-header.low-risk {
          background: linear-gradient(135deg, #22c55e, #16a34a) !important;
        }

        .unreal-details-title {
          font-size: 16px !important;
          font-weight: 700 !important;
          margin: 0 !important;
        }

        .unreal-details-close {
          position: absolute !important;
          top: 12px !important;
          right: 12px !important;
          background: rgba(255, 255, 255, 0.2) !important;
          border: none !important;
          color: white !important;
          width: 28px !important;
          height: 28px !important;
          border-radius: 50% !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 18px !important;
          transition: background 0.2s !important;
        }

        .unreal-details-close:hover {
          background: rgba(255, 255, 255, 0.3) !important;
        }

        .unreal-details-content {
          padding: 16px 20px !important;
          max-height: 400px !important;
          overflow-y: auto !important;
        }

        .unreal-details-section {
          margin-bottom: 16px !important;
        }

        .unreal-details-section:last-child {
          margin-bottom: 0 !important;
        }

        .unreal-details-label {
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #6b7280 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          margin-bottom: 6px !important;
        }

        .unreal-details-value {
          font-size: 14px !important;
          color: #1f2937 !important;
          line-height: 1.5 !important;
        }

        .unreal-confidence-bar {
          height: 8px !important;
          background: #e5e7eb !important;
          border-radius: 4px !important;
          overflow: hidden !important;
          margin-top: 6px !important;
        }

        .unreal-confidence-fill {
          height: 100% !important;
          border-radius: 4px !important;
          transition: width 0.3s ease !important;
        }

        .unreal-confidence-fill.high {
          background: linear-gradient(90deg, #ef4444, #dc2626) !important;
        }

        .unreal-confidence-fill.medium {
          background: linear-gradient(90deg, #f97316, #ea580c) !important;
        }

        .unreal-confidence-fill.low {
          background: linear-gradient(90deg, #22c55e, #16a34a) !important;
        }

        .unreal-artifact-list {
          list-style: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .unreal-artifact-item {
          padding: 8px 12px !important;
          background: #f9fafb !important;
          border-radius: 6px !important;
          margin-bottom: 6px !important;
          font-size: 13px !important;
          color: #374151 !important;
        }

        .unreal-artifact-item:last-child {
          margin-bottom: 0 !important;
        }

        .unreal-signal-tag {
          display: inline-block !important;
          padding: 4px 8px !important;
          background: #f3f4f6 !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          color: #4b5563 !important;
          margin: 2px !important;
        }

        .unreal-sources-list {
          display: flex !important;
          gap: 8px !important;
          flex-wrap: wrap !important;
        }

        .unreal-source-tag {
          padding: 4px 10px !important;
          background: #e0e7ff !important;
          color: #4f46e5 !important;
          border-radius: 12px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
        }

        .unreal-dismiss-btn {
          width: 100% !important;
          padding: 12px !important;
          background: #f3f4f6 !important;
          border: none !important;
          color: #4b5563 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: background 0.2s !important;
        }

        .unreal-dismiss-btn:hover {
          background: #e5e7eb !important;
        }

        .unreal-overlay-backdrop {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(0, 0, 0, 0.3) !important;
          z-index: 9999998 !important;
        }
      `;
      document.head.appendChild(style);
      console.log('[ImageScanner] Styles injected successfully');
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE DISCOVERY
    // ═══════════════════════════════════════════════════════════════

    scanExistingImages() {
      console.log('[ImageScanner] Scanning existing images...');

      // Get all standard images
      const images = document.querySelectorAll('img');
      
      // Get platform-specific images if on social media
      const platformImages = this.getPlatformImages();

      // Combine and dedupe
      const allImages = new Set([...images, ...platformImages]);
      
      console.log(`[ImageScanner] Found ${allImages.size} images on page`);

      allImages.forEach(img => {
        if (this.shouldProcessImage(img)) {
          this.observeImage(img);
        }
      });

      // Also scan for background images
      this.scanBackgroundImages();
    }

    getPlatformImages() {
      const hostname = location.hostname;
      const images = [];

      for (const [platform, selector] of Object.entries(this.platformSelectors)) {
        if (hostname.includes(platform.replace('.com', ''))) {
          const platformImgs = document.querySelectorAll(selector);
          images.push(...platformImgs);
          console.log(`[ImageScanner] Found ${platformImgs.length} images on ${platform}`);
        }
      }

      return images;
    }

    scanBackgroundImages() {
      // Find elements with background images
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const style = getComputedStyle(el);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            const bgUrl = urlMatch[1];
            // Skip data URIs and tiny images
            if (!bgUrl.startsWith('data:') || bgUrl.length > 1000) {
              // Create a virtual image element for tracking
              el.dataset.unrealBgImage = bgUrl;
            }
          }
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE FILTERING
    // ═══════════════════════════════════════════════════════════════

    shouldProcessImage(img) {
      // Skip if already checked
      if (img.dataset.unrealChecked === 'true') {
        return false;
      }

      // Skip if in checked set (by src)
      if (this.checkedImages.has(img.src)) {
        return false;
      }

      // Skip tiny images (icons, tracking pixels)
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      if (width < 100 || height < 100) {
        return false;
      }

      // Skip SVG
      if (img.src && img.src.includes('.svg')) {
        return false;
      }

      // Skip tiny data URIs
      if (img.src && img.src.startsWith('data:') && img.src.length < 500) {
        return false;
      }

      // Skip trusted domains
      try {
        const url = new URL(img.src);
        if (this.trustedDomains.some(domain => url.hostname.includes(domain))) {
          return false;
        }
      } catch (e) {
        // Invalid URL, skip
        return false;
      }

      return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // MUTATION OBSERVER - Dynamic Content
    // ═══════════════════════════════════════════════════════════════

    observeNewImages() {
      this.mutationObserver = new MutationObserver((mutations) => {
        if (!this.isEnabled) return;

        mutations.forEach(mutation => {
          // Check added nodes
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if node is an image
              if (node.tagName === 'IMG') {
                this.handleNewImage(node);
              }
              // Check for images within the node
              const images = node.querySelectorAll?.('img');
              images?.forEach(img => this.handleNewImage(img));
            }
          });

          // Check for src attribute changes
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'src' && 
              mutation.target.tagName === 'IMG') {
            this.handleNewImage(mutation.target);
          }
        });
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });

      console.log('[ImageScanner] MutationObserver active');
    }

    handleNewImage(img) {
      if (this.shouldProcessImage(img)) {
        console.log('[ImageScanner] New image detected:', img.src?.substring(0, 50));
        this.observeImage(img);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERSECTION OBSERVER - Viewport Detection
    // ═══════════════════════════════════════════════════════════════

    observeVisibleImages() {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && this.isEnabled) {
              const img = entry.target;
              if (!img.dataset.unrealChecked) {
                this.queueImage(img);
              }
              // Stop observing once queued
              this.intersectionObserver.unobserve(img);
            }
          });
        },
        {
          root: null,
          rootMargin: '100px', // Start loading slightly before visible
          threshold: 0.1
        }
      );

      console.log('[ImageScanner] IntersectionObserver active');
    }

    observeImage(img) {
      // Wait for image to load if not yet loaded
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener('load', () => {
          if (this.shouldProcessImage(img)) {
            this.intersectionObserver.observe(img);
          }
        }, { once: true });
      } else {
        this.intersectionObserver.observe(img);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // QUEUE SYSTEM
    // ═══════════════════════════════════════════════════════════════

    queueImage(img) {
      // Avoid duplicates in queue
      if (this.queue.includes(img)) return;
      if (img.dataset.unrealChecked === 'true') return;

      console.log('[ImageScanner] Queuing image:', img.src?.substring(0, 60), `${img.width}x${img.height}`);
      this.queue.push(img);
      this.processQueue();
    }

    async processQueue() {
      // Respect concurrency limit
      if (this.processing >= this.maxConcurrent) return;
      if (this.queue.length === 0) return;

      // Throttle: ensure minimum delay between starts
      const now = Date.now();
      const timeSinceLastProcess = now - this.lastProcessTime;
      if (timeSinceLastProcess < this.processDelay) {
        setTimeout(() => this.processQueue(), this.processDelay - timeSinceLastProcess);
        return;
      }

      const img = this.queue.shift();
      if (!img || img.dataset.unrealChecked === 'true') {
        this.processQueue();
        return;
      }

      this.processing++;
      this.lastProcessTime = Date.now();

      try {
        await this.processImage(img);
      } catch (error) {
        console.error('[ImageScanner] Error processing image:', error);
        this.showErrorBadge(img);
      }

      this.processing--;
      
      // Process next in queue (use requestIdleCallback for non-urgent)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => this.processQueue());
      } else {
        setTimeout(() => this.processQueue(), 100);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE PROCESSING
    // ═══════════════════════════════════════════════════════════════

    async processImage(img) {
      console.log('[ImageScanner] Analysis started:', img.src?.substring(0, 60));

      // Mark as checked
      img.dataset.unrealChecked = 'true';
      this.checkedImages.add(img.src);

      // Show spinner while analyzing
      const spinner = this.showSpinner(img);

      try {
        // Extract image data
        const imageUrl = img.src;
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        // Convert to base64
        let base64Image = null;
        try {
          base64Image = await this.imageToBase64(img);
        } catch (e) {
          console.warn('[ImageScanner] Could not convert to base64:', e.message);
        }

        // Call analyzeImage from imageDetector
        const result = await this.imageDetector.analyzeImage(
          imageUrl,
          base64Image,
          width,
          height,
          this.geminiApiKey,
          this.sightengineUser,
          this.sightengineSecret
        );

        // Store result
        this.analysisResults.set(img.src, result);

        // Remove spinner
        spinner?.remove();

        console.log('[ImageScanner] Analysis complete:', {
          confidence: result.confidence + '%',
          riskLevel: result.riskLevel,
          isAIGenerated: result.isAIGenerated,
          sources: result.sources,
          signals: result.signals
        });

        // Show visual feedback
        this.showResults(img, result);

        // Notify background script if AI detected
        if (result.isAIGenerated) {
          this.aiImageCount++;
          this.notifyBackground(result);
        }

        return result;

      } catch (error) {
        console.error('[ImageScanner] Analysis error:', error);
        spinner?.remove();
        this.showErrorBadge(img);
        return null;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // IMAGE TO BASE64 CONVERSION
    // ═══════════════════════════════════════════════════════════════

    imageToBase64(img) {
      return new Promise((resolve, reject) => {
        try {
          // Handle CORS
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          const ctx = canvas.getContext('2d');
          
          // Create a new image with crossOrigin for CORS images
          const corsImg = new Image();
          corsImg.crossOrigin = 'anonymous';
          
          corsImg.onload = () => {
            try {
              ctx.drawImage(corsImg, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              // If CORS fails, try with original image
              try {
                ctx.drawImage(img, 0, 0);
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                resolve(base64);
              } catch (e2) {
                reject(e2);
              }
            }
          };

          corsImg.onerror = () => {
            // Fallback to original image
            try {
              ctx.drawImage(img, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              reject(e);
            }
          };

          corsImg.src = img.src;

          // Timeout fallback
          setTimeout(() => {
            try {
              ctx.drawImage(img, 0, 0);
              const base64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve(base64);
            } catch (e) {
              reject(new Error('Timeout converting image'));
            }
          }, 3000);

        } catch (error) {
          reject(error);
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // VISUAL FEEDBACK - SPINNER
    // ═══════════════════════════════════════════════════════════════

    showSpinner(img) {
      try {
        // Wrap image if needed
        this.wrapImage(img);

        const spinner = document.createElement('div');
        spinner.className = 'unreal-spinner-overlay';
        spinner.innerHTML = '<div class="unreal-spinner"></div>';

        const wrapper = img.closest('.unreal-image-wrapper') || img.parentElement;
        wrapper.appendChild(spinner);

        return spinner;
      } catch (e) {
        console.warn('[ImageScanner] Could not show spinner:', e);
        return null;
      }
    }

    wrapImage(img) {
      // Don't wrap if already wrapped
      if (img.closest('.unreal-image-wrapper')) {
        console.log('[ImageScanner] Image already wrapped');
        return;
      }

      // Don't wrap if it would break layout
      const parent = img.parentElement;
      if (!parent) {
        console.log('[ImageScanner] No parent element for image');
        return;
      }

      console.log('[ImageScanner] Wrapping image:', {
        src: img.src?.substring(0, 60),
        parentTag: parent.tagName,
        parentClass: parent.className
      });

      const wrapper = document.createElement('div');
      wrapper.className = 'unreal-image-wrapper';
      
      // Copy position styles
      const computedStyle = getComputedStyle(img);
      if (computedStyle.position === 'absolute' || computedStyle.position === 'fixed') {
        wrapper.style.position = computedStyle.position;
        wrapper.style.top = computedStyle.top;
        wrapper.style.left = computedStyle.left;
        wrapper.style.right = computedStyle.right;
        wrapper.style.bottom = computedStyle.bottom;
      }

      parent.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      
      console.log('[ImageScanner] Image wrapped successfully');
    }

    // ═══════════════════════════════════════════════════════════════
    // VISUAL FEEDBACK - RESULTS
    // ═══════════════════════════════════════════════════════════════

    showResults(img, result) {
      console.log('[ImageScanner] showResults called:', {
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        isAIGenerated: result.isAIGenerated,
        imgSrc: img.src?.substring(0, 60)
      });
      
      // Show badges for ANY analyzed image (even low confidence for debugging)
      // This helps users see the extension is working
      if (result.confidence < 20 && result.signals.length === 0) {
        // Skip completely uninteresting images
        console.log('[ImageScanner] Skipping badge - too low confidence and no signals');
        return;
      }

      console.log('[ImageScanner] Proceeding to show badge for confidence:', result.confidence);

      // Add border based on risk level
      img.classList.remove('unreal-image-border-high', 'unreal-image-border-medium', 'unreal-image-border-low');
      img.classList.add(`unreal-image-border-${result.riskLevel}`);
      
      console.log('[ImageScanner] Border added:', img.classList);

      // Show badge
      this.showBadge(img, result);
    }

    // ═══════════════════════════════════════════════════════════════
    // BADGE DISPLAY
    // ═══════════════════════════════════════════════════════════════

    showBadge(img, result) {
      console.log('[ImageScanner] showBadge called for:', img.src?.substring(0, 60));
      
      // Remove existing badge
      const existingBadge = img.parentElement?.querySelector('.unreal-image-badge');
      if (existingBadge) {
        console.log('[ImageScanner] Removing existing badge');
        existingBadge.remove();
      }

      // Ensure image is wrapped
      this.wrapImage(img);
      console.log('[ImageScanner] Image wrapped, parent:', img.parentElement?.className);

      const badge = document.createElement('div');
      badge.className = `unreal-image-badge ${result.riskLevel}-risk`;

      // Risk icon
      const riskIcons = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      };

      // Build badge content
      let badgeContent = `
        <span style="font-size: 12px;">${riskIcons[result.riskLevel] || '⚪'}</span>
        <span>${result.confidence}% AI</span>
      `;

      // Add AI type if known
      if (result.aiType && result.aiType !== 'unknown') {
        badgeContent += `<span style="opacity: 0.7; font-size: 10px;">• ${result.aiType}</span>`;
      }

      badge.innerHTML = badgeContent;

      // Click handler to show details
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.showDetails(img, result);
      });

      // Append to wrapper
      const wrapper = img.closest('.unreal-image-wrapper') || img.parentElement;
      if (!wrapper) {
        console.error('[ImageScanner] No wrapper found for image');
        return;
      }
      
      wrapper.style.position = 'relative';
      wrapper.appendChild(badge);
      
      console.log('[ImageScanner] Badge appended successfully:', {
        badgeClass: badge.className,
        wrapperClass: wrapper.className,
        badgeParent: badge.parentElement?.tagName
      });
    }

    showErrorBadge(img) {
      this.wrapImage(img);

      const badge = document.createElement('div');
      badge.className = 'unreal-image-badge error';
      badge.innerHTML = `
        <span style="font-size: 12px;">⚠️</span>
        <span>Analysis failed</span>
      `;

      const wrapper = img.closest('.unreal-image-wrapper') || img.parentElement;
      wrapper.style.position = 'relative';
      wrapper.appendChild(badge);
    }

    // ═══════════════════════════════════════════════════════════════
    // DETAILS POPUP
    // ═══════════════════════════════════════════════════════════════

    showDetails(img, result) {
      // Remove existing popup
      this.closeDetails();

      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'unreal-overlay-backdrop';
      backdrop.addEventListener('click', () => this.closeDetails());
      document.body.appendChild(backdrop);

      // Create popup
      const popup = document.createElement('div');
      popup.className = 'unreal-details-popup';
      popup.id = 'unreal-details-popup';

      // Position popup near image
      const imgRect = img.getBoundingClientRect();
      let top = imgRect.top + window.scrollY;
      let left = imgRect.right + 10 + window.scrollX;

      // Adjust if off screen
      if (left + 380 > window.innerWidth) {
        left = imgRect.left - 390 + window.scrollX;
      }
      if (left < 10) {
        left = 10;
      }
      if (top + 500 > window.innerHeight + window.scrollY) {
        top = window.innerHeight + window.scrollY - 510;
      }
      if (top < 10) {
        top = 10;
      }

      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;

      // Risk level text
      const riskText = {
        high: 'High Risk - Likely AI Generated',
        medium: 'Medium Risk - Possibly AI Generated',
        low: 'Low Risk - Minimal AI Indicators'
      };

      // Build artifacts list
      let artifactsHtml = '<p style="color: #6b7280; font-style: italic;">No specific artifacts detected</p>';
      if (result.artifacts && result.artifacts.length > 0) {
        artifactsHtml = `<ul class="unreal-artifact-list">
          ${result.artifacts.map(a => `
            <li class="unreal-artifact-item">
              <strong>${a.type}:</strong> ${a.description}
            </li>
          `).join('')}
        </ul>`;
      }

      // Build signals
      let signalsHtml = '';
      if (result.signals && result.signals.length > 0) {
        signalsHtml = result.signals.map(s => 
          `<span class="unreal-signal-tag">${s}</span>`
        ).join('');
      }

      // Build sources
      let sourcesHtml = '';
      if (result.sources && result.sources.length > 0) {
        sourcesHtml = result.sources.map(s => 
          `<span class="unreal-source-tag">${s}</span>`
        ).join('');
      }

      popup.innerHTML = `
        <div class="unreal-details-header ${result.riskLevel}-risk">
          <span style="font-size: 24px;">${result.riskLevel === 'high' ? '🔴' : result.riskLevel === 'medium' ? '🟡' : '🟢'}</span>
          <h3 class="unreal-details-title">${riskText[result.riskLevel]}</h3>
          <button class="unreal-details-close" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">×</button>
        </div>
        
        <div class="unreal-details-content">
          <div class="unreal-details-section">
            <div class="unreal-details-label">Trust Score</div>
            <div class="unreal-details-value">
              <strong style="font-size: 24px;">${result.confidence}</strong>/100
              <div class="unreal-confidence-bar">
                <div class="unreal-confidence-fill ${result.riskLevel}" style="width: ${result.confidence}%;"></div>
              </div>
            </div>
          </div>

          ${result.aiType && result.aiType !== 'unknown' ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">AI Type Detected</div>
            <div class="unreal-details-value">${result.aiType}</div>
          </div>
          ` : ''}

          <div class="unreal-details-section">
            <div class="unreal-details-label">Artifacts Found</div>
            <div class="unreal-details-value">${artifactsHtml}</div>
          </div>

          ${result.reasoning ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Analysis Reasoning</div>
            <div class="unreal-details-value">${result.reasoning}</div>
          </div>
          ` : ''}

          ${signalsHtml ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Detection Signals</div>
            <div class="unreal-details-value">${signalsHtml}</div>
          </div>
          ` : ''}

          ${sourcesHtml ? `
          <div class="unreal-details-section">
            <div class="unreal-details-label">Sources Used</div>
            <div class="unreal-sources-list">${sourcesHtml}</div>
          </div>
          ` : ''}
        </div>

        <button class="unreal-dismiss-btn" onclick="document.getElementById('unreal-details-popup')?.remove(); document.querySelector('.unreal-overlay-backdrop')?.remove();">
          Dismiss
        </button>
      `;

      document.body.appendChild(popup);
    }

    closeDetails() {
      document.getElementById('unreal-details-popup')?.remove();
      document.querySelector('.unreal-overlay-backdrop')?.remove();
    }

    // ═══════════════════════════════════════════════════════════════
    // BACKGROUND COMMUNICATION
    // ═══════════════════════════════════════════════════════════════

    notifyBackground(result) {
      try {
        chrome.runtime.sendMessage({
          type: 'AI_IMAGE_DETECTED',
          data: {
            confidence: result.confidence,
            riskLevel: result.riskLevel,
            aiType: result.aiType,
            url: location.href,
            totalAIImages: this.aiImageCount
          }
        });
      } catch (e) {
        console.warn('[ImageScanner] Could not notify background:', e);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════════

    destroy() {
      console.log('[ImageScanner] Cleaning up...');
      this.isEnabled = false;
      
      this.mutationObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      
      this.queue = [];
      this.checkedImages.clear();
      this.analysisResults.clear();

      // Remove all badges and wrappers
      document.querySelectorAll('.unreal-image-badge').forEach(el => el.remove());
      document.querySelectorAll('.unreal-spinner-overlay').forEach(el => el.remove());
      
      this.closeDetails();

      console.log('[ImageScanner] Cleanup complete');
    }
  }

  // Create global instance
  let imageScanner = null;

  async function analyzePageImages() {
    const imageAnalysisEnabled = settings.imageAnalysis !== false;
    
    if (!imageAnalysisEnabled) {
      console.log('[ImageScanner] Image analysis disabled in settings');
      return;
    }

    console.log('[ImageScanner] Starting automatic image detection...');

    try {
      imageScanner = new ImageScanner();
      await imageScanner.init();
    } catch (error) {
      console.error('[ImageScanner] Failed to initialize:', error);
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    imageScanner?.destroy();
  });

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
