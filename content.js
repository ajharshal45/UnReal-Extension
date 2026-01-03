// ShareSafe Content Script
// Extracts page data, sends to background, and injects floating trust badge

(function () {
  // Prevent multiple injections
  if (window.__sharesafe_injected__) return;
  window.__sharesafe_injected__ = true;

  // ─────────────────────────────────────────────────────────────
  // 1. Extract page content
  // ─────────────────────────────────────────────────────────────
  function extractPageContent() {
    const title = document.title || '';
    const h1 = document.querySelector('h1');
    const headline = h1 ? h1.innerText.trim() : '';
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc ? metaDesc.getAttribute('content') || '' : '';

    // Get visible text (first 500 chars)
    const bodyText = (document.body?.innerText || '').slice(0, 500);

    // Find the largest/main image on the page
    const mainImage = findMainImage();

    // Check for video content
    const videoInfo = findVideoContent();

    return { 
      title, 
      headline, 
      description, 
      bodyText, 
      url: location.href, 
      imageUrl: mainImage,
      hasVideo: videoInfo.hasVideo,
      videoSource: videoInfo.source
    };
  }

  // Detect video content on the page
  function findVideoContent() {
    const result = { hasVideo: false, source: null };

    // Check for HTML5 video elements
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      result.hasVideo = true;
      // Try to get video source
      const firstVideo = videos[0];
      result.source = firstVideo.src || firstVideo.querySelector('source')?.src || 'embedded';
    }

    // Check for YouTube embeds
    const youtubeEmbeds = document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"]');
    if (youtubeEmbeds.length > 0) {
      result.hasVideo = true;
      result.source = 'youtube';
    }

    // Check for Vimeo embeds
    const vimeoEmbeds = document.querySelectorAll('iframe[src*="vimeo"]');
    if (vimeoEmbeds.length > 0) {
      result.hasVideo = true;
      result.source = 'vimeo';
    }

    return result;
  }

  // Find the main/largest visible image on the page
  function findMainImage() {
    const images = document.querySelectorAll('img');
    let largestImage = null;
    let largestArea = 0;

    images.forEach(img => {
      // Skip tiny images, icons, avatars
      if (img.width < 200 || img.height < 150) return;
      if (img.src.includes('avatar') || img.src.includes('icon') || img.src.includes('logo')) return;
      
      const area = img.width * img.height;
      if (area > largestArea) {
        largestArea = area;
        largestImage = img.src;
      }
    });

    // Also check for background images in common containers
    if (!largestImage) {
      const containers = document.querySelectorAll('article img, main img, .content img, [role="main"] img');
      if (containers.length > 0) {
        largestImage = containers[0].src;
      }
    }

    return largestImage;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Badge icons (inline SVG)
  // ─────────────────────────────────────────────────────────────
  const ICONS = {
    low: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    medium: `<svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><circle cx="12" cy="16" r="1" fill="#f97316"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
    high: `<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    loading: `<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 019.17 6" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>`
  };

  const COLORS = {
    low: '#22c55e',
    medium: '#f97316',
    high: '#ef4444'
  };

  // ─────────────────────────────────────────────────────────────
  // 3. Create and inject badge
  // ─────────────────────────────────────────────────────────────
  let badgeContainer = null;
  let expanded = false;
  let analysisResult = null;

  function injectBadge() {
    if (badgeContainer) return;

    badgeContainer = document.createElement('div');
    badgeContainer.id = 'sharesafe-badge-container';
    badgeContainer.innerHTML = `
      <!-- Auto Toast Notification -->
      <div id="sharesafe-toast" style="
        position: absolute;
        bottom: 60px;
        right: 0;
        min-width: 280px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        padding: 14px 16px;
        opacity: 0;
        transform: translateX(100%);
        transition: opacity 0.4s ease, transform 0.4s ease;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: #1f2937;
        border-left: 4px solid #6366f1;
      ">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <div id="sharesafe-toast-icon" style="width: 24px; height: 24px; flex-shrink: 0;"></div>
          <div>
            <div style="font-weight: 700; font-size: 14px;">ShareSafe</div>
            <div id="sharesafe-toast-risk" style="font-size: 12px; font-weight: 600;"></div>
          </div>
        </div>
        <div id="sharesafe-toast-summary" style="font-size: 13px; color: #4b5563; line-height: 1.4;"></div>
        <div style="margin-top: 8px; font-size: 11px; color: #9ca3af;">Click badge for details</div>
      </div>

      <!-- Main Badge with Label -->
      <div id="sharesafe-badge-wrapper" style="display: flex; align-items: center; gap: 8px;">
        <div id="sharesafe-label" style="
          background: #fff;
          padding: 6px 12px;
          border-radius: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          font-size: 12px;
          font-weight: 600;
          opacity: 0;
          transform: translateX(20px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          white-space: nowrap;
        ">Analyzing...</div>
        <div id="sharesafe-badge" style="
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        ">
          <div id="sharesafe-icon" style="width: 28px; height: 28px;">
            ${ICONS.loading}
          </div>
        </div>
      </div>

      <!-- Expanded Card -->
      <div id="sharesafe-card" style="
        position: absolute;
        bottom: 60px;
        right: 0;
        width: 300px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.18);
        padding: 16px;
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: #1f2937;
      ">
        <div id="sharesafe-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-weight: 600; font-size: 15px;">ShareSafe Analysis</span>
          <button id="sharesafe-close" style="
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #9ca3af;
            line-height: 1;
          ">&times;</button>
        </div>
        <div id="sharesafe-card-body">
          <div id="sharesafe-risk" style="
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            margin-bottom: 8px;
          ">Loading...</div>
          <div id="sharesafe-score" style="font-size: 22px; font-weight: 700; margin-bottom: 12px;"></div>
          <div id="sharesafe-reasons" style="margin-bottom: 12px;"></div>
          <div id="sharesafe-summary" style="
            background: #f3f4f6;
            padding: 10px 12px;
            border-radius: 8px;
            font-size: 13px;
            color: #4b5563;
          "></div>
        </div>
        <div style="margin-top: 12px; text-align: center; font-size: 11px; color: #9ca3af;">
          Powered by Google Gemini
        </div>
      </div>
    `;

    // Container styles
    Object.assign(badgeContainer.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    document.body.appendChild(badgeContainer);

    // Event listeners
    const badge = badgeContainer.querySelector('#sharesafe-badge');
    const card = badgeContainer.querySelector('#sharesafe-card');
    const closeBtn = badgeContainer.querySelector('#sharesafe-close');

    badge.addEventListener('click', () => toggleCard());
    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.08)';
      badge.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
      badge.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCard(false);
    });
  }

  function toggleCard(forceState) {
    const card = badgeContainer.querySelector('#sharesafe-card');
    expanded = forceState !== undefined ? forceState : !expanded;

    if (expanded) {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
      card.style.pointerEvents = 'auto';
    } else {
      card.style.opacity = '0';
      card.style.transform = 'translateY(10px) scale(0.95)';
      card.style.pointerEvents = 'none';
    }
  }

  function updateBadge(result) {
    analysisResult = result;
    const { riskLevel, score, reasons, summary } = result;
    const color = COLORS[riskLevel] || COLORS.medium;

    // Update badge icon
    const iconEl = badgeContainer.querySelector('#sharesafe-icon');
    iconEl.innerHTML = ICONS[riskLevel] || ICONS.medium;

    // Update badge ring color
    const badge = badgeContainer.querySelector('#sharesafe-badge');
    badge.style.border = `3px solid ${color}`;

    // ══════════════════════════════════════════════════════
    // AUTO-SHOW: Update and show the label next to badge
    // ══════════════════════════════════════════════════════
    const label = badgeContainer.querySelector('#sharesafe-label');
    const riskText = riskLevel === 'high' ? '⚠️ High Risk' : 
                     riskLevel === 'medium' ? '⚡ Medium Risk' : '✓ Low Risk';
    label.textContent = riskText;
    label.style.color = color;
    label.style.borderLeft = `3px solid ${color}`;
    
    // Show the label
    setTimeout(() => {
      label.style.opacity = '1';
      label.style.transform = 'translateX(0)';
    }, 100);

    // ══════════════════════════════════════════════════════
    // AUTO-SHOW: Toast notification
    // ══════════════════════════════════════════════════════
    const toast = badgeContainer.querySelector('#sharesafe-toast');
    const toastIcon = badgeContainer.querySelector('#sharesafe-toast-icon');
    const toastRisk = badgeContainer.querySelector('#sharesafe-toast-risk');
    const toastSummary = badgeContainer.querySelector('#sharesafe-toast-summary');

    toastIcon.innerHTML = ICONS[riskLevel] || ICONS.medium;
    toastRisk.textContent = `${riskLevel.toUpperCase()} RISK`;
    toastRisk.style.color = color;
    toastSummary.textContent = summary;
    toast.style.borderLeftColor = color;

    // Show toast automatically
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
      toast.style.pointerEvents = 'auto';
    }, 300);

    // Auto-hide toast after 5 seconds (or 8 for high risk)
    const hideDelay = riskLevel === 'high' ? 8000 : 5000;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.pointerEvents = 'none';
    }, hideDelay);

    // For HIGH RISK: Also pulse the badge
    if (riskLevel === 'high') {
      badge.style.animation = 'sharesafe-pulse 1s ease-in-out 3';
      // Add pulse animation if not exists
      if (!document.querySelector('#sharesafe-styles')) {
        const style = document.createElement('style');
        style.id = 'sharesafe-styles';
        style.textContent = `
          @keyframes sharesafe-pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(239,68,68,0.3); }
            50% { transform: scale(1.1); box-shadow: 0 6px 30px rgba(239,68,68,0.5); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    // Update card content
    const riskEl = badgeContainer.querySelector('#sharesafe-risk');
    riskEl.textContent = `${riskLevel} risk`;
    riskEl.style.background = color + '20';
    riskEl.style.color = color;

    const scoreEl = badgeContainer.querySelector('#sharesafe-score');
    scoreEl.innerHTML = `Trust Score: <span style="color: ${color}">${100 - score}/100</span>`;

    const reasonsEl = badgeContainer.querySelector('#sharesafe-reasons');
    if (reasons && reasons.length > 0) {
      reasonsEl.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">Why this rating:</div>
        <ul style="margin: 0; padding-left: 18px; color: #4b5563;">
          ${reasons.map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join('')}
        </ul>
      `;
    } else {
      reasonsEl.innerHTML = '<div style="color: #22c55e;">✓ No concerns detected</div>';
    }

    const summaryEl = badgeContainer.querySelector('#sharesafe-summary');
    summaryEl.innerHTML = `<strong>Summary:</strong> ${summary}`;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. REAL-TIME LIVE SOCIAL MEDIA FEED SCANNER
  // Advanced system with MutationObserver, IntersectionObserver,
  // throttling, queue system, and per-post analysis
  // ─────────────────────────────────────────────────────────────
  
  const isSocialMedia = /twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|reddit\.com|tiktok\.com/i.test(location.hostname);
  
  // ═══════════════════════════════════════════════════════════════
  // PLATFORM DETECTION & SELECTORS
  // ═══════════════════════════════════════════════════════════════
  const PLATFORM_CONFIG = {
    'twitter.com': {
      selector: 'article[data-testid="tweet"]',
      textSelector: '[data-testid="tweetText"]',
      imageSelector: '[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]',
      name: 'Twitter'
    },
    'x.com': {
      selector: 'article[data-testid="tweet"]',
      textSelector: '[data-testid="tweetText"]',
      imageSelector: '[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]',
      name: 'X'
    },
    'facebook.com': {
      selector: 'div[data-pagelet*="FeedUnit"], [role="article"], div[data-ad-comet-preview="message"]',
      textSelector: '[data-ad-comet-preview="message"], [data-ad-preview="message"], .userContent',
      imageSelector: 'img[src*="scontent"], img[src*="fbcdn"]',
      name: 'Facebook'
    },
    'instagram.com': {
      selector: 'article',
      textSelector: 'span[class*="Caption"], span[dir="auto"]',
      imageSelector: 'img[src*="cdninstagram"], img[srcset]',
      name: 'Instagram'
    },
    'linkedin.com': {
      selector: 'div.feed-shared-update-v2, div[data-urn*="activity"]',
      textSelector: '.feed-shared-text, .break-words',
      imageSelector: '.feed-shared-image img, img[src*="media.licdn"]',
      name: 'LinkedIn'
    },
    'reddit.com': {
      selector: 'div[data-testid="post-container"], shreddit-post, article',
      textSelector: '[data-testid="post-content"], .md, [slot="text-body"]',
      imageSelector: 'img[src*="redd.it"], img[src*="reddit"], [data-testid="post-media-container"] img',
      name: 'Reddit'
    },
    'tiktok.com': {
      selector: 'div[data-e2e="recommend-list-item-container"], div[class*="DivItemContainer"]',
      textSelector: '[data-e2e="video-desc"], [class*="SpanText"]',
      imageSelector: 'img[src*="tiktokcdn"]',
      name: 'TikTok'
    }
  };

  // Get current platform config
  function getPlatformConfig() {
    for (const [domain, config] of Object.entries(PLATFORM_CONFIG)) {
      if (location.hostname.includes(domain.replace('.com', ''))) {
        return config;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════
  let riskyPostCount = 0;
  let totalScannedCount = 0;
  let analysisQueue = [];
  let isProcessingQueue = false;
  let intersectionObserver = null;
  let mutationObserver = null;

  // ═══════════════════════════════════════════════════════════════
  // INJECT SCANNER STYLES
  // ═══════════════════════════════════════════════════════════════
  function injectScannerStyles() {
    if (document.querySelector('#sharesafe-scanner-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sharesafe-scanner-styles';
    style.textContent = `
      /* Scanning spinner */
      @keyframes sharesafe-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes sharesafe-pulse-badge {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
      
      @keyframes sharesafe-fade-in {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes sharesafe-border-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
        50% { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1); }
      }
      
      .sharesafe-scanning {
        position: relative;
      }
      
      .sharesafe-scanning::before {
        content: '';
        position: absolute;
        top: 8px;
        right: 8px;
        width: 20px;
        height: 20px;
        border: 2px solid #6366f1;
        border-top-color: transparent;
        border-radius: 50%;
        animation: sharesafe-spin 0.8s linear infinite;
        z-index: 1000;
        background: white;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
      }
      
      .sharesafe-safe-post {
        border-left: 3px solid #22c55e !important;
        transition: border-color 0.3s ease;
      }
      
      .sharesafe-safe-post::after {
        content: '✓';
        position: absolute;
        top: 8px;
        right: 8px;
        width: 22px;
        height: 22px;
        background: #22c55e;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        z-index: 100;
        opacity: 0.8;
      }
      
      .sharesafe-risky-post {
        border-left: 3px solid #ef4444 !important;
      }
      
      .sharesafe-medium-post {
        border-left: 3px solid #f97316 !important;
      }
      
      .sharesafe-post-warning {
        animation: sharesafe-fade-in 0.3s ease-out;
      }
      
      .sharesafe-post-warning:hover {
        background: rgba(239, 68, 68, 0.15) !important;
      }
      
      /* Badge counter styles */
      .sharesafe-risk-counter {
        position: absolute;
        top: -8px;
        right: -8px;
        min-width: 22px;
        height: 22px;
        background: #ef4444;
        color: white;
        border-radius: 11px;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
        animation: sharesafe-pulse-badge 0.5s ease-out;
      }
      
      .sharesafe-risk-counter.pulse {
        animation: sharesafe-pulse-badge 0.5s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTRACT POST DATA
  // ═══════════════════════════════════════════════════════════════
  function extractPostContent(post) {
    const config = getPlatformConfig();
    if (!config) return { text: '', images: [], videos: [] };
    
    // Extract text content
    let text = '';
    const textElements = post.querySelectorAll(config.textSelector);
    if (textElements.length > 0) {
      text = Array.from(textElements).map(el => el.innerText || '').join(' ');
    } else {
      text = post.innerText || '';
    }
    
    // Extract image URLs
    const images = [];
    const imageElements = post.querySelectorAll(config.imageSelector);
    imageElements.forEach(img => {
      const src = img.src || img.srcset?.split(' ')[0];
      if (src && !src.includes('avatar') && !src.includes('profile') && 
          !src.includes('emoji') && !src.includes('icon') && src.length > 50) {
        images.push(src);
      }
    });
    
    // Also check for any large images
    post.querySelectorAll('img').forEach(img => {
      if (img.width > 200 && img.height > 150 && !images.includes(img.src)) {
        if (!img.src.includes('avatar') && !img.src.includes('profile')) {
          images.push(img.src);
        }
      }
    });
    
    // Extract video info
    const videos = [];
    post.querySelectorAll('video').forEach(vid => {
      const src = vid.src || vid.querySelector('source')?.src;
      if (src) videos.push(src);
    });
    
    return { text: text.slice(0, 1000), images: images.slice(0, 3), videos };
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYZE POST CONTENT (Enhanced)
  // ═══════════════════════════════════════════════════════════════
  function analyzePostContent(post) {
    const { text, images, videos } = extractPostContent(post);
    const lowerText = text.toLowerCase();
    
    const issues = [];
    let riskScore = 0;

    // ─── AI-Generated Content Detection ───
    const aiPatterns = [
      { pattern: /\b(ai.?generated|made.?with.?ai|created.?by.?ai)\b/i, score: 40, msg: 'AI-generated content indicated' },
      { pattern: /\b(dall-?e|midjourney|stable.?diffusion|leonardo\.?ai)\b/i, score: 45, msg: 'AI art tool mentioned' },
      { pattern: /\b(chatgpt|gpt-?4|claude|gemini|bard).?(wrote|created|made)/i, score: 35, msg: 'AI writing tool used' },
      { pattern: /\b(deepfake|face.?swap|synthetic.?media)\b/i, score: 55, msg: 'Deepfake/synthetic media warning' },
      { pattern: /#(aiart|aigenerated|aiimage|midjourney|stablediffusion)/i, score: 38, msg: 'AI content hashtag' }
    ];
    
    aiPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // ─── Manipulation & Fake Content ───
    const manipulationPatterns = [
      { pattern: /\b(fake|faked|doctored|manipulated|edited|photoshopped)\b/i, score: 35, msg: 'May be manipulated content' },
      { pattern: /\b(hoax|fabricated|not.?real|false|debunked)\b/i, score: 40, msg: 'Potentially false information' },
      { pattern: /\b(misleading|misinformation|disinformation)\b/i, score: 45, msg: 'Flagged as misleading' }
    ];
    
    manipulationPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // ─── Sensational/Clickbait Language ───
    const sensationalPatterns = [
      { pattern: /\b(shocking|unbelievable|mind.?blowing|jaw.?dropping)\b/i, score: 20, msg: 'Sensational language' },
      { pattern: /\b(you won'?t believe|they don'?t want you|what they'?re hiding)\b/i, score: 25, msg: 'Clickbait phrasing' },
      { pattern: /\b(breaking|exposed|leaked|secret|revealed)\b/i, score: 15, msg: 'Dramatic claims' },
      { pattern: /\b(must.?see|share.?before|going.?viral|deleted.?soon)\b/i, score: 22, msg: 'Urgency manipulation' }
    ];
    
    sensationalPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // ─── Misinformation Patterns ───
    const misinfoPatterns = [
      { pattern: /\b(conspiracy|cover.?up|truth.?they.?hide)\b/i, score: 35, msg: 'Conspiracy language' },
      { pattern: /\b(mainstream.?media.?lies|fake.?news|don'?t.?trust)\b/i, score: 38, msg: 'Media distrust rhetoric' },
      { pattern: /\b(wake.?up|sheeple|open.?your.?eyes)\b/i, score: 30, msg: 'Conspiratorial tone' },
      { pattern: /\b(big.?pharma|big.?tech|elites|globalists)\b/i, score: 25, msg: 'Common misinfo terms' },
      { pattern: /\b(plandemic|scamdemic|5g|microchip|bill.?gates.?vaccine)\b/i, score: 50, msg: 'Known misinformation topic' }
    ];
    
    misinfoPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // ─── Unverified Claims ───
    const unverifiedPatterns = [
      { pattern: /\b(sources.?say|reportedly|allegedly|rumor.?has)\b/i, score: 15, msg: 'Unverified claims' },
      { pattern: /\b(i.?heard|someone.?told|anonymous.?source)\b/i, score: 18, msg: 'Unattributed source' },
      { pattern: /\b(confirmed|100%.?true|proof|evidence).{0,20}(attached|below|here)/i, score: 12, msg: 'Unverifiable proof claim' }
    ];
    
    unverifiedPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // ─── Image Source Analysis ───
    images.forEach(src => {
      const lowerSrc = src.toLowerCase();
      if (/replicate|stability|openai|dalle|midjourney|leonardo\.ai|dreamstudio|runwayml|clipdrop/i.test(lowerSrc)) {
        issues.push('Image from AI generation platform');
        riskScore += 40;
      }
    });

    // ─── Video Content Flags ───
    if (videos.length > 0 && /deepfake|synthetic|face.?swap/i.test(lowerText)) {
      issues.push('Video may be synthetically generated');
      riskScore += 45;
    }

    // ─── Emotional Manipulation ───
    const emotionalPatterns = [
      { pattern: /\b(disgusting|outrageous|infuriating|heartbreaking)\b/i, score: 12, msg: 'Emotional language' },
      { pattern: /\b(share.?if.?you.?agree|like.?if|retweet.?if)\b/i, score: 10, msg: 'Engagement bait' }
    ];
    
    emotionalPatterns.forEach(({ pattern, score, msg }) => {
      if (pattern.test(lowerText)) {
        issues.push(msg);
        riskScore += score;
      }
    });

    // Remove duplicate issues
    const uniqueIssues = [...new Set(issues)];

    // Determine risk level
    let riskLevel = 'low';
    if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';

    return {
      riskLevel,
      score: Math.min(100, riskScore),
      issues: uniqueIssues,
      hasRisk: uniqueIssues.length > 0,
      text: text.slice(0, 200),
      imageCount: images.length,
      videoCount: videos.length
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ADD SCANNING SPINNER TO POST
  // ═══════════════════════════════════════════════════════════════
  function addScanningSpinner(post) {
    post.classList.add('sharesafe-scanning');
    post.style.position = 'relative';
  }

  function removeScanningSpinner(post) {
    post.classList.remove('sharesafe-scanning');
  }

  // ═══════════════════════════════════════════════════════════════
  // ADD WARNING BANNER TO RISKY POST
  // ═══════════════════════════════════════════════════════════════
  function addPostWarning(post, analysis) {
    // Don't add if already has warning
    if (post.querySelector('.sharesafe-post-warning')) return;

    const { riskLevel, score, issues } = analysis;
    const color = COLORS[riskLevel];
    const bgColor = riskLevel === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)';

    // Add risk class to post
    post.classList.add(riskLevel === 'high' ? 'sharesafe-risky-post' : 'sharesafe-medium-post');

    // Create warning banner
    const warning = document.createElement('div');
    warning.className = 'sharesafe-post-warning';
    warning.style.cssText = `
      background: ${bgColor};
      border: 1px solid ${color}30;
      border-left: 4px solid ${color};
      padding: 12px 16px;
      margin: 8px 0;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      position: relative;
      z-index: 100;
      box-shadow: 0 2px 8px ${color}15;
    `;

    const icon = riskLevel === 'high' ? '🚨' : '⚠️';
    const title = riskLevel === 'high' ? 'High Risk Content Detected' : 'Verify Before Sharing';
    
    warning.innerHTML = `
      <span style="font-size: 20px; line-height: 1;">${icon}</span>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
          <span style="font-weight: 700; color: ${color};">ShareSafe: ${title}</span>
          <span style="
            background: ${color}20;
            color: ${color};
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
          ">Risk Score: ${score}/100</span>
        </div>
        <div style="color: #4b5563; line-height: 1.5; font-size: 12px;">
          ${issues.slice(0, 3).map(issue => `<span style="display: inline-block; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; margin: 2px 4px 2px 0;">${issue}</span>`).join('')}
        </div>
      </div>
      <button class="sharesafe-dismiss" style="
        background: ${color}15;
        border: none;
        font-size: 14px;
        color: ${color};
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        border-radius: 4px;
        transition: background 0.2s;
        flex-shrink: 0;
      " title="Dismiss warning">✕</button>
    `;

    // Insert at top of post
    post.style.position = 'relative';
    post.insertBefore(warning, post.firstChild);

    // Dismiss button with hover effect
    const dismissBtn = warning.querySelector('.sharesafe-dismiss');
    dismissBtn.addEventListener('mouseenter', () => {
      dismissBtn.style.background = `${color}30`;
    });
    dismissBtn.addEventListener('mouseleave', () => {
      dismissBtn.style.background = `${color}15`;
    });
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      warning.style.opacity = '0';
      warning.style.transform = 'translateY(-10px)';
      warning.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => warning.remove(), 200);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // MARK SAFE POST (Subtle visual feedback)
  // ═══════════════════════════════════════════════════════════════
  function markSafePost(post) {
    // Only add subtle indicator, don't clutter the feed
    post.classList.add('sharesafe-safe-post');
    post.style.position = 'relative';
  }

  // ═══════════════════════════════════════════════════════════════
  // UPDATE FLOATING BADGE WITH RISK COUNT
  // ═══════════════════════════════════════════════════════════════
  function updateBadgeCounter() {
    if (!badgeContainer) return;
    
    const badge = badgeContainer.querySelector('#sharesafe-badge');
    if (!badge) return;
    
    // Remove existing counter
    const existingCounter = badge.querySelector('.sharesafe-risk-counter');
    if (existingCounter) existingCounter.remove();
    
    // Add new counter if there are risky posts
    if (riskyPostCount > 0) {
      const counter = document.createElement('div');
      counter.className = 'sharesafe-risk-counter';
      counter.textContent = riskyPostCount;
      badge.style.position = 'relative';
      badge.appendChild(counter);
      
      // Pulse animation
      setTimeout(() => counter.classList.add('pulse'), 10);
      setTimeout(() => counter.classList.remove('pulse'), 500);
      
      // Update label
      const label = badgeContainer.querySelector('#sharesafe-label');
      if (label) {
        label.textContent = `🚨 ${riskyPostCount} risky post${riskyPostCount > 1 ? 's' : ''} found`;
        label.style.color = '#ef4444';
        label.style.opacity = '1';
        label.style.transform = 'translateX(0)';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SHOW TOAST FOR NEW RISKY POST
  // ═══════════════════════════════════════════════════════════════
  function showRiskyPostToast(analysis) {
    const toast = badgeContainer?.querySelector('#sharesafe-toast');
    if (!toast) return;

    const color = COLORS[analysis.riskLevel];
    const toastIcon = badgeContainer.querySelector('#sharesafe-toast-icon');
    const toastRisk = badgeContainer.querySelector('#sharesafe-toast-risk');
    const toastSummary = badgeContainer.querySelector('#sharesafe-toast-summary');

    toastIcon.innerHTML = ICONS[analysis.riskLevel];
    toastRisk.textContent = `${analysis.riskLevel.toUpperCase()} RISK POST DETECTED`;
    toastRisk.style.color = color;
    toastSummary.textContent = analysis.issues.slice(0, 2).join(' • ');
    toast.style.borderLeftColor = color;

    // Show toast
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
    toast.style.pointerEvents = 'auto';

    // Auto-hide after delay based on risk
    const hideDelay = analysis.riskLevel === 'high' ? 6000 : 4000;
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.pointerEvents = 'none';
    }, hideDelay);

    // Pulse the badge
    const badge = badgeContainer.querySelector('#sharesafe-badge');
    if (badge) {
      badge.style.animation = 'sharesafe-pulse-badge 0.5s ease-out 3';
      setTimeout(() => badge.style.animation = '', 1500);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYSIS QUEUE SYSTEM (Throttled to max 5/second)
  // ═══════════════════════════════════════════════════════════════
  const ANALYSIS_INTERVAL = 200; // 200ms = max 5 per second
  let lastAnalysisTime = 0;

  function queuePostForAnalysis(post) {
    // Check if already scanned or queued
    if (post.dataset.sharesafeScanned === 'true' || post.dataset.sharesafeQueued === 'true') {
      return;
    }
    
    // Mark as queued
    post.dataset.sharesafeQueued = 'true';
    analysisQueue.push(post);
    
    // Start processing if not already
    if (!isProcessingQueue) {
      processAnalysisQueue();
    }
  }

  async function processAnalysisQueue() {
    if (isProcessingQueue || analysisQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (analysisQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastAnalysis = now - lastAnalysisTime;
      
      // Throttle: wait if too soon
      if (timeSinceLastAnalysis < ANALYSIS_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, ANALYSIS_INTERVAL - timeSinceLastAnalysis));
      }
      
      const post = analysisQueue.shift();
      if (!post || post.dataset.sharesafeScanned === 'true') continue;
      
      // Process this post
      await analyzeAndMarkPost(post);
      lastAnalysisTime = Date.now();
    }
    
    isProcessingQueue = false;
  }

  async function analyzeAndMarkPost(post) {
    // Skip if already scanned
    if (post.dataset.sharesafeScanned === 'true') return;
    
    // Add scanning spinner
    addScanningSpinner(post);
    
    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Analyze the post
    const analysis = analyzePostContent(post);
    
    // Remove spinner
    removeScanningSpinner(post);
    
    // Mark as scanned
    post.dataset.sharesafeScanned = 'true';
    post.dataset.sharesafeRisk = analysis.riskLevel;
    post.dataset.sharesafeScore = analysis.score.toString();
    delete post.dataset.sharesafeQueued;
    
    totalScannedCount++;
    
    // Handle based on risk level
    if (analysis.hasRisk && (analysis.riskLevel === 'high' || analysis.riskLevel === 'medium')) {
      addPostWarning(post, analysis);
      
      if (analysis.riskLevel === 'high' || analysis.riskLevel === 'medium') {
        riskyPostCount++;
        updateBadgeCounter();
        
        // Show toast only for high risk
        if (analysis.riskLevel === 'high') {
          showRiskyPostToast(analysis);
        }
      }
    } else {
      // Mark as safe (subtle indicator)
      markSafePost(post);
    }
    
    // Log for debugging
    console.log(`ShareSafe: Scanned post #${totalScannedCount} - ${analysis.riskLevel} risk (score: ${analysis.score})`);
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERSECTION OBSERVER - Scan visible posts only
  // ═══════════════════════════════════════════════════════════════
  function setupIntersectionObserver() {
    const config = getPlatformConfig();
    if (!config) return;
    
    // Disconnect existing observer
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
    
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const post = entry.target;
          
          // Queue for analysis if not already scanned
          if (post.dataset.sharesafeScanned !== 'true') {
            queuePostForAnalysis(post);
          }
        }
      });
    }, {
      root: null,
      rootMargin: '100px 0px', // Start analyzing slightly before visible
      threshold: 0.1 // Trigger when 10% visible
    });
    
    // Observe all existing posts
    const posts = document.querySelectorAll(config.selector);
    posts.forEach(post => {
      intersectionObserver.observe(post);
    });
    
    console.log(`ShareSafe: Intersection observer watching ${posts.length} posts`);
  }

  // ═══════════════════════════════════════════════════════════════
  // MUTATION OBSERVER - Detect new posts added to DOM
  // ═══════════════════════════════════════════════════════════════
  function setupMutationObserver() {
    const config = getPlatformConfig();
    if (!config) return;
    
    // Disconnect existing observer
    if (mutationObserver) {
      mutationObserver.disconnect();
    }
    
    mutationObserver = new MutationObserver((mutations) => {
      let newPostsFound = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          
          // Check if the added node is a post
          if (node.matches && node.matches(config.selector)) {
            if (node.dataset.sharesafeScanned !== 'true') {
              intersectionObserver?.observe(node);
              newPostsFound = true;
            }
          }
          
          // Check if added node contains posts
          if (node.querySelectorAll) {
            const posts = node.querySelectorAll(config.selector);
            posts.forEach(post => {
              if (post.dataset.sharesafeScanned !== 'true') {
                intersectionObserver?.observe(post);
                newPostsFound = true;
              }
            });
          }
        });
      });
      
      if (newPostsFound) {
        console.log('ShareSafe: New posts detected in feed');
      }
    });
    
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('ShareSafe: Mutation observer active');
  }

  // ═══════════════════════════════════════════════════════════════
  // LEGACY SCROLL-BASED SCANNING (Fallback)
  // ═══════════════════════════════════════════════════════════════
  function scanVisiblePostsFallback() {
    const config = getPlatformConfig();
    if (!config) return;

    const posts = document.querySelectorAll(config.selector);

    posts.forEach(post => {
      // Skip if already scanned
      if (post.dataset.sharesafeScanned === 'true') return;

      // Check if post is visible in viewport
      const rect = post.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
      
      if (isVisible) {
        queuePostForAnalysis(post);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // START FEED SCANNER
  // ═══════════════════════════════════════════════════════════════
  function startFeedScanner() {
    if (!isSocialMedia) return;
    
    const config = getPlatformConfig();
    if (!config) {
      console.log('ShareSafe: Unknown social media platform, using generic scanning');
      return;
    }

    console.log(`ShareSafe: Starting live feed scanner for ${config.name}`);
    
    // Inject scanner styles
    injectScannerStyles();

    // Wait for feed to load
    setTimeout(() => {
      // Setup observers
      setupIntersectionObserver();
      setupMutationObserver();
      
      // Initial scan of visible posts
      scanVisiblePostsFallback();
      
      // Fallback scroll listener (for browsers without IntersectionObserver support)
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(scanVisiblePostsFallback, 250);
      }, { passive: true });
      
      // Periodic re-check for any missed posts
      setInterval(() => {
        const config = getPlatformConfig();
        if (config) {
          const posts = document.querySelectorAll(config.selector);
          posts.forEach(post => {
            if (post.dataset.sharesafeScanned !== 'true' && !intersectionObserver) {
              const rect = post.getBoundingClientRect();
              if (rect.top < window.innerHeight && rect.bottom > 0) {
                queuePostForAnalysis(post);
              }
            } else if (intersectionObserver && post.dataset.sharesafeScanned !== 'true') {
              intersectionObserver.observe(post);
            }
          });
        }
      }, 2000);
      
    }, 1500);
    
    // Update badge label to show scanning status
    setTimeout(() => {
      if (badgeContainer) {
        const label = badgeContainer.querySelector('#sharesafe-label');
        if (label && riskyPostCount === 0) {
          label.textContent = '🔍 Scanning feed...';
          label.style.color = '#6366f1';
          label.style.opacity = '1';
          label.style.transform = 'translateX(0)';
          
          // Hide after a few seconds if no risks found
          setTimeout(() => {
            if (riskyPostCount === 0 && label) {
              label.style.opacity = '0';
              label.style.transform = 'translateX(20px)';
            }
          }, 3000);
        }
      }
    }, 500);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Main execution
  // ─────────────────────────────────────────────────────────────
  function init() {
    // Don't run on browser internal pages
    if (location.protocol === 'chrome:' || location.protocol === 'chrome-extension:') return;

    injectBadge();

    const content = extractPageContent();

    // Send to background for analysis
    chrome.runtime.sendMessage({ type: 'ANALYZE', content }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('ShareSafe: Could not connect to background', chrome.runtime.lastError);
        updateBadge({
          riskLevel: 'medium',
          score: 50,
          reasons: ['Analysis unavailable'],
          summary: 'Could not analyze this page'
        });
        return;
      }
      if (response) {
        updateBadge(response);
      }
    });

    // Start social media feed scanner
    startFeedScanner();
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
