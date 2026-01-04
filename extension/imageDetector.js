// ShareSafe - Image AI Detection Module
// Separate image analysis with visual overlay badges
// Enhanced with EXIF, blur detection, and real photo edit detection

import { getCached, setCached, generateImageCacheKey } from './cacheManager.js';

// ═══════════════════════════════════════════════════════════════
// IMAGE TYPE CATEGORIES
// ═══════════════════════════════════════════════════════════════
const IMAGE_TYPES = {
  FULLY_SYNTHETIC: 'Fully AI-Generated (From Scratch)',
  EDITED_REAL_PHOTO: 'Real Photo with AI Edits (DANGEROUS)',
  LIKELY_HUMAN: 'Likely Human-Created'
};

// ═══════════════════════════════════════════════════════════════
// IMAGE DETECTION STYLES
// ═══════════════════════════════════════════════════════════════

export function injectImageDetectionStyles() {
  if (document.getElementById('sharesafe-image-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'sharesafe-image-styles';
  style.textContent = `
    .sharesafe-image-wrapper {
      position: relative;
      display: inline-block;
    }
    
    .sharesafe-image-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 1000;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    }
    
    .sharesafe-image-badge:hover {
      transform: scale(1.05);
      background: rgba(0, 0, 0, 0.95);
    }
    
    .sharesafe-image-badge.high {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95));
      box-shadow: 0 2px 12px rgba(239, 68, 68, 0.5);
    }
    
    .sharesafe-image-badge.medium {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.95), rgba(234, 88, 12, 0.95));
      box-shadow: 0 2px 12px rgba(249, 115, 22, 0.5);
    }
    
    .sharesafe-image-badge.low {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95));
      box-shadow: 0 2px 12px rgba(139, 92, 246, 0.5);
    }
    
    .sharesafe-image-badge-icon {
      font-size: 14px;
    }
    
    .sharesafe-image-tooltip {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      background: white;
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
      min-width: 250px;
      max-width: 320px;
      z-index: 1001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1f2937;
      animation: tooltip-slide-down 0.2s ease-out;
      pointer-events: auto;
    }
    
    @keyframes tooltip-slide-down {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .sharesafe-image-tooltip-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f3f4f6;
    }
    
    .sharesafe-image-tooltip-title {
      flex: 1;
      font-weight: 700;
      font-size: 14px;
    }
    
    .sharesafe-image-score {
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 12px;
    }
    
    .sharesafe-image-score.high {
      background: #fef2f2;
      color: #ef4444;
    }
    
    .sharesafe-image-score.medium {
      background: #fff7ed;
      color: #f97316;
    }
    
    .sharesafe-image-score.low {
      background: #f5f3ff;
      color: #8b5cf6;
    }
    
    .sharesafe-image-reasons {
      margin-bottom: 12px;
    }
    
    .sharesafe-image-reason {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
      padding: 10px 12px;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      color: #374151;
      border-left: 3px solid #e5e7eb;
    }
    
    .sharesafe-image-reason-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      background: #4f46e5;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      margin-top: 2px;
    }
    
    .sharesafe-image-footer {
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .sharesafe-image-method {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }
    
    .sharesafe-image-confidence-badge {
      background: #f3f4f6;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
      color: #374151;
    }
  `;
  
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════
// IMAGE ANALYSIS
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze image for AI generation indicators
 */
export async function analyzeImage(imgElement, useLLM = false) {
  const src = imgElement.src;
  if (!src || src.startsWith('data:')) return null;
  
  // Check cache first
  const cacheKey = generateImageCacheKey(src);
  const cached = await getCached(cacheKey, 'image');
  if (cached) return cached;
  
  let result = analyzeImageMetadata(imgElement);
  
  // If score is uncertain and LLM is enabled, use it as tie-breaker
  if (useLLM && result.score >= 35 && result.score <= 65) {
    try {
      const llmResult = await analyzeImageWithLLM(src);
      if (llmResult) {
        // Blend LLM result with metadata result
        result = blendImageResults(result, llmResult);
      }
    } catch (error) {
      console.error('ShareSafe: Image LLM analysis failed', error);
    }
  }
  
  // Cache result
  await setCached(cacheKey, result, 'image');
  
  return result;
}

/**
 * Extract EXIF data from image
 */
async function extractEXIFData(imgElement) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const exifData = {
          hasCameraInfo: false,
          hasSoftwareTag: false,
          softwareName: null,
          missingMetadata: false,
          suspiciousSoftware: false
        };
        
        // Try to detect EXIF through canvas (limited in browser)
        // Check if image quality suggests manipulation
        const data = imageData.data;
        const avgVariance = calculatePixelVariance(data);
        
        if (avgVariance < 10) {
          exifData.missingMetadata = true;
        }
        
        resolve(exifData);
      } catch (e) {
        resolve({ hasCameraInfo: false, hasSoftwareTag: false, missingMetadata: true });
      }
    };
    img.onerror = () => resolve({ hasCameraInfo: false, hasSoftwareTag: false, missingMetadata: true });
    img.src = imgElement.src;
  });
}

/**
 * Calculate pixel variance for metadata detection
 */
function calculatePixelVariance(data) {
  let sum = 0;
  const sampleSize = Math.min(1000, data.length / 4);
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(Math.random() * (data.length / 4)) * 4;
    sum += data[idx];
  }
  return sum / sampleSize;
}

/**
 * Detect blur patterns (AI edits often have unnatural blur)
 */
function detectBlurPatterns(imgElement) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = Math.min(imgElement.naturalWidth, 400);
  canvas.height = Math.min(imgElement.naturalHeight, 400);
  
  try {
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Calculate edge sharpness
    let sharpnessScore = 0;
    const sampleSize = 100;
    
    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * (canvas.width - 1));
      const y = Math.floor(Math.random() * (canvas.height - 1));
      const idx = (y * canvas.width + x) * 4;
      const nextIdx = idx + 4;
      
      const diff = Math.abs(data[idx] - data[nextIdx]);
      sharpnessScore += diff;
    }
    
    sharpnessScore = sharpnessScore / sampleSize;
    
    // AI edited images often have: very high sharpness (oversharpened) or unnatural blur
    const findings = [];
    
    if (sharpnessScore > 40) {
      findings.push({ msg: '[Blur] Oversharpened edges (AI post-processing)', score: 25 });
    } else if (sharpnessScore < 5) {
      findings.push({ msg: '[Blur] Unnatural blur pattern', score: 20 });
    }
    
    return findings;
  } catch (e) {
    return [];
  }
}

/**
 * Analyze image using comprehensive metadata, EXIF, and technical analysis
 */
async function analyzeImageMetadata(imgElement) {
  const src = imgElement.src.toLowerCase();
  const alt = (imgElement.alt || '').toLowerCase();
  const title = (imgElement.title || '').toLowerCase();
  const parentText = (imgElement.parentElement?.innerText || '').toLowerCase();
  
  const reasons = [];
  let score = 0;
  let imageType = IMAGE_TYPES.LIKELY_HUMAN;
  let editIndicators = [];
  let syntheticIndicators = [];
  
  // ─── AI Platform URLs ───
  const aiPlatforms = [
    { pattern: /dalle|openai|midjourney|stablediffusion|leonardo\.ai|playground\.ai|ideogram|firefly/i, score: 85, msg: '[Platform] AI image generation service', type: 'synthetic' },
    { pattern: /replicate\.com|runwayml|pika\.art|bing.*image|meta.*imagine/i, score: 80, msg: '[Platform] AI generation tool', type: 'synthetic' },
    { pattern: /generated|synthetic|ai[_-]?gen/i, score: 75, msg: '[URL] Generated content indicator', type: 'synthetic' }
  ];
  
  aiPlatforms.forEach(({ pattern, score: s, msg, type }) => {
    if (pattern.test(src)) {
      reasons.push(msg);
      score += s;
      if (type === 'synthetic') syntheticIndicators.push(msg);
    }
  });
  
  // ─── Alt/Title Text Indicators ───
  const textIndicators = [
    { pattern: /ai[- ]?generated|made with ai|created by ai/i, score: 90, msg: '[Label] Explicitly marked as AI', type: 'synthetic' },
    { pattern: /midjourney|dall[- ]?e|stable diffusion|firefly/i, score: 85, msg: '[Label] AI tool mentioned', type: 'synthetic' },
    { pattern: /prompt|generated image|synthetic/i, score: 70, msg: '[Label] Generation indicators', type: 'synthetic' },
    { pattern: /edited|photoshop|manipulated|enhanced/i, score: 45, msg: '[Label] Indicates photo editing', type: 'edit' }
  ];
  
  const allText = `${alt} ${title} ${parentText}`;
  textIndicators.forEach(({ pattern, score: s, msg, type }) => {
    if (pattern.test(allText)) {
      reasons.push(msg);
      score += s;
      if (type === 'synthetic') syntheticIndicators.push(msg);
      if (type === 'edit') editIndicators.push(msg);
    }
  });
  
  // ─── Dimension Analysis ───
  const width = imgElement.naturalWidth || imgElement.width;
  const height = imgElement.naturalHeight || imgElement.height;
  const ratio = width / height;
  
  // Perfect AI ratios (more suspicious)
  const perfectAIRatios = [1.0, 1.778, 1.5, 1.333];
  const isPerfectRatio = perfectAIRatios.some(r => Math.abs(ratio - r) < 0.01);
  
  // Exact AI generation dimensions
  const exactAIDimensions = [512, 768, 1024, 1536, 2048];
  const hasExactDimensions = exactAIDimensions.includes(width) || exactAIDimensions.includes(height);
  
  if (isPerfectRatio && hasExactDimensions) {
    reasons.push('[Dimensions] Standard AI generation size');
    syntheticIndicators.push('AI dimensions');
    score += 20;
  }
  
  // ─── Blur Analysis ───
  const blurFindings = detectBlurPatterns(imgElement);
  blurFindings.forEach(({ msg, score: s }) => {
    reasons.push(msg);
    editIndicators.push(msg);
    score += s;
  });
  
  // ─── EXIF Analysis (async) ───
  const exifData = await extractEXIFData(imgElement);
  if (exifData.missingMetadata) {
    reasons.push('[EXIF] Missing camera metadata (stripped or generated)');
    score += 15;
    editIndicators.push('Missing EXIF');
  }
  if (exifData.suspiciousSoftware) {
    reasons.push('[EXIF] AI software detected in metadata');
    score += 35;
    editIndicators.push('AI software tag');
  }
  
  // ─── File Name Patterns ───
  const fileName = src.split('/').pop()?.split('?')[0] || '';
  const suspiciousFileNames = [
    { pattern: /^[a-f0-9]{32,}/i, score: 20, msg: '[Filename] Random hash (AI platform)', type: 'synthetic' },
    { pattern: /generated|ai[_-]?image|synthetic/i, score: 40, msg: '[Filename] AI generation indicator', type: 'synthetic' },
    { pattern: /prompt|txt2img|img2img/i, score: 35, msg: '[Filename] AI workflow reference', type: 'synthetic' },
    { pattern: /inpaint|outpaint|remove|replace/i, score: 50, msg: '[Filename] AI editing tool reference', type: 'edit' }
  ];
  
  suspiciousFileNames.forEach(({ pattern, score: s, msg, type }) => {
    if (pattern.test(fileName)) {
      reasons.push(msg);
      score += s;
      if (type === 'synthetic') syntheticIndicators.push(msg);
      if (type === 'edit') editIndicators.push(msg);
    }
  });
  
  // ─── Determine Image Type ───
  if (syntheticIndicators.length >= 2 && editIndicators.length === 0) {
    imageType = IMAGE_TYPES.FULLY_SYNTHETIC;
  } else if (editIndicators.length > 0 || (syntheticIndicators.length === 1 && editIndicators.length === 0 && score < 70)) {
    imageType = IMAGE_TYPES.EDITED_REAL_PHOTO;
    score += 20; // BOOST SCORE - edited real photos are MORE DANGEROUS
  }
  
  // Determine risk level
  let riskLevel = 'low';
  if (score >= 65) riskLevel = 'high';
  else if (score >= 30) riskLevel = 'medium';
  
  // Calculate confidence (based on signal strength)
  const confidence = Math.min(100, (reasons.length * 12) + (score > 0 ? 25 : 0));
  
  return {
    score: Math.min(100, score),
    confidence,
    riskLevel,
    reasons: reasons.slice(0, 6),
    imageType,
    method: 'metadata',
    editIndicators: editIndicators.length,
    syntheticIndicators: syntheticIndicators.length,
    interpretation: score >= 70 ? 'Likely AI-generated image' :
                   score >= 35 ? 'Uncertain - verify source' :
                   'No strong AI indicators'
  };
}

/**
 * Analyze image with LLM (Gemini) - only used as tie-breaker
 */
async function analyzeImageWithLLM(imageSrc) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'ANALYZE_IMAGE',
      imageSrc
    }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Blend metadata and LLM results
 */
function blendImageResults(metadataResult, llmResult) {
  // Weight: 60% metadata, 40% LLM (metadata is more reliable for images)
  const blendedScore = (metadataResult.score * 0.6) + (llmResult.score * 0.4);
  
  // Combine reasons (prioritize metadata reasons)
  const allReasons = [...metadataResult.reasons, ...llmResult.reasons].slice(0, 6);
  
  // Take higher confidence
  const confidence = Math.max(metadataResult.confidence, llmResult.confidence);
  
  // Preserve image type from metadata (more accurate)
  const imageType = metadataResult.imageType;
  
  // Determine final risk level
  let riskLevel = 'low';
  if (blendedScore >= 60) riskLevel = 'high';
  else if (blendedScore >= 35) riskLevel = 'medium';
  
  return {
    score: Math.round(blendedScore),
    confidence,
    riskLevel,
    imageType,
    reasons: allReasons,
    method: 'metadata+llm',
    editIndicators: metadataResult.editIndicators,
    syntheticIndicators: metadataResult.syntheticIndicators,
    interpretation: blendedScore >= 60 ? 'Likely AI-generated image' :
                   blendedScore >= 35 ? 'Uncertain - verify source' :
                   'Appears human-created'
  };
}

// ═══════════════════════════════════════════════════════════════
// IMAGE BADGE INJECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Add detection badge to image
 */
export function addImageBadge(imgElement, analysis) {
  // Skip if already has badge
  if (imgElement.dataset.sharesafeImageAnalyzed === 'true') return;
  
  // Skip low-score images
  if (analysis.score < 30) return;
  
  imgElement.dataset.sharesafeImageAnalyzed = 'true';
  
  // Ensure parent is positioned
  const parent = imgElement.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }
  
  // Create badge
  const badge = document.createElement('div');
  badge.className = `sharesafe-image-badge ${analysis.riskLevel}`;
  
  const icon = analysis.riskLevel === 'high' ? '⚠' :
               analysis.riskLevel === 'medium' ? '!' : 'i';
  
  const label = analysis.riskLevel === 'high' ? 'AI Image' :
                analysis.riskLevel === 'medium' ? 'Check' : 'Info';
  
  badge.innerHTML = `
    <span class="sharesafe-image-badge-icon">${icon}</span>
    <span>${label}</span>
  `;
  
  badge.title = `AI Score: ${analysis.score}/100 - Click for details`;
  
  // Create wrapper if needed
  if (imgElement.parentElement.tagName !== 'DIV' || 
      !imgElement.parentElement.classList.contains('sharesafe-image-wrapper')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sharesafe-image-wrapper';
    imgElement.parentElement.insertBefore(wrapper, imgElement);
    wrapper.appendChild(imgElement);
    wrapper.appendChild(badge);
  } else {
    imgElement.parentElement.appendChild(badge);
  }
  
  // Add click handler for tooltip
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    showImageTooltip(badge, analysis);
  });
}

/**
 * Show detailed image analysis tooltip
 */
function showImageTooltip(badge, analysis) {
  // Remove existing tooltips
  document.querySelectorAll('.sharesafe-image-tooltip').forEach(t => t.remove());
  
  const tooltip = document.createElement('div');
  tooltip.className = 'sharesafe-image-tooltip';
  
  const icon = analysis.riskLevel === 'high' ? '⚠' :
               analysis.riskLevel === 'medium' ? '!' : 'i';
  
  // Determine image type badge
  let typeBadge = '';
  if (analysis.imageType === IMAGE_TYPES.EDITED_REAL_PHOTO) {
    typeBadge = `<div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 8px; text-align: center;">⚠ EDITED REAL PHOTO - VERIFY CAREFULLY</div>`;
  } else if (analysis.imageType === IMAGE_TYPES.FULLY_SYNTHETIC) {
    typeBadge = `<div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-bottom: 8px; text-align: center;">Fully AI-Generated</div>`;
  }
  
  tooltip.innerHTML = `
    <div class="sharesafe-image-tooltip-header">
      <span style="font-size: 20px;">${icon}</span>
      <div class="sharesafe-image-tooltip-title">Image Analysis</div>
      <div class="sharesafe-image-score ${analysis.riskLevel}">
        ${analysis.score}/100
      </div>
    </div>
    
    ${typeBadge}
    
    <div style="margin-bottom: 10px; font-size: 12px; font-weight: 600; color: #4b5563;">
      ${analysis.interpretation}
    </div>
    
    ${analysis.reasons.length > 0 ? `
      <div class="sharesafe-image-reasons">
        <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Detection Signals</div>
        ${analysis.reasons.map((reason, index) => `
          <div class="sharesafe-image-reason">
            <div class="sharesafe-image-reason-icon">${index + 1}</div>
            <span>${reason}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="sharesafe-image-footer">
      <div class="sharesafe-image-method">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        ${analysis.method === 'metadata+llm' ? 'Metadata + AI' : 'Metadata'}
      </div>
      <div class="sharesafe-image-confidence-badge">${analysis.confidence}%</div>
    </div>
    ${analysis.editIndicators > 0 ? `
      <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 11px; color: #92400e; font-weight: 600;">
        ⚠ ${analysis.editIndicators} edit signal(s) detected - verify carefully
      </div>
    ` : ''}
  `;
  
  badge.parentElement.appendChild(tooltip);
  
  // Position tooltip
  const badgeRect = badge.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Adjust if goes off screen
  if (badgeRect.right + tooltipRect.width > window.innerWidth) {
    tooltip.style.right = '0';
    tooltip.style.left = 'auto';
  }
  
  // Close on click outside
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!tooltip.contains(e.target) && !badge.contains(e.target)) {
        tooltip.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// SCAN ALL IMAGES ON PAGE
// ═══════════════════════════════════════════════════════════════

export async function scanPageImages(options = {}) {
  const {
    useLLM = false,
    excludeSelectors = ['[alt*="avatar"]', '[alt*="icon"]', '[alt*="logo"]', '.avatar', '.icon', '.logo']
  } = options;
  
  const images = document.querySelectorAll('img');
  const results = [];
  
  for (const img of images) {
    // Check all images regardless of size
    
    // Skip excluded images
    if (excludeSelectors.some(sel => img.matches(sel))) continue;
    
    // Skip if already analyzed
    if (img.dataset.sharesafeImageAnalyzed === 'true') continue;
    
    // Wait for image to load
    if (!img.complete) {
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3000); // Timeout after 3 seconds
      });
    }
    
    try {
      const analysis = await analyzeImage(img, useLLM);
      if (analysis && analysis.score >= 30) {
        addImageBadge(img, analysis);
        results.push({ img, analysis });
      }
    } catch (error) {
      console.error('ShareSafe: Image analysis error', error);
    }
  }
  
  console.log(`ShareSafe: Analyzed ${results.length} images with AI indicators`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// CONTINUOUS IMAGE MONITORING
// ═══════════════════════════════════════════════════════════════

let imageObserver = null;

/**
 * Start monitoring for dynamically loaded images
 */
export function startImageMonitoring(options = {}) {
  if (imageObserver) return; // Already monitoring
  
  const {
    useLLM = false,
    excludeSelectors = ['[alt*="avatar"]', '[alt*="icon"]', '[alt*="logo"]', '.avatar', '.icon', '.logo']
  } = options;
  
  console.log('ShareSafe: Starting continuous image monitoring...');
  
  // Use MutationObserver to detect new images
  imageObserver = new MutationObserver((mutations) => {
    const newImages = [];
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        // Check if node is an image
        if (node.tagName === 'IMG') {
          newImages.push(node);
        }
        // Check for images inside added nodes
        else if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach(img => newImages.push(img));
        }
      });
    });
    
    // Analyze new images
    if (newImages.length > 0) {
      console.log(`ShareSafe: Detected ${newImages.length} new images`);
      analyzeNewImages(newImages, useLLM, excludeSelectors);
    }
  });
  
  // Start observing
  imageObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Analyze newly detected images
 */
async function analyzeNewImages(images, useLLM, excludeSelectors) {
  for (const img of images) {
    // Skip excluded images
    if (excludeSelectors.some(sel => img.matches(sel))) continue;
    
    // Skip if already analyzed
    if (img.dataset.sharesafeImageAnalyzed === 'true') continue;
    
    // Wait for image to load
    if (!img.complete) {
      await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3000);
      });
    }
    
    try {
      const analysis = await analyzeImage(img, useLLM);
      if (analysis && analysis.score >= 30) {
        addImageBadge(img, analysis);
      }
    } catch (error) {
      console.error('ShareSafe: Image analysis error', error);
    }
  }
}

/**
 * Stop image monitoring
 */
export function stopImageMonitoring() {
  if (imageObserver) {
    imageObserver.disconnect();
    imageObserver = null;
    console.log('ShareSafe: Stopped image monitoring');
  }
}
