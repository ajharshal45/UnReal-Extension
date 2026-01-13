/**
 * Layer 1: Forensic Analysis
 * Visual forensic analysis using Canvas API - detects statistical anomalies in pixels
 * Target: < 500ms processing time
 * Max Score: 100 points
 * 
 * CAPABILITIES:
 * ✅ Texture smoothness (variance analysis)
 * ✅ Lighting gradient consistency
 * ✅ Edge sharpness distribution
 * ✅ Blur transition patterns
 * ✅ Background pattern repetition
 * 
 * LIMITATIONS (Cannot do semantic analysis):
 * ❌ Cannot count fingers
 * ❌ Cannot recognize faces or anatomy
 * ❌ Cannot read text
 * ❌ Cannot understand image content
 */

// Analysis weights
const WEIGHTS = {
    TEXTURE: 0.30,      // 30% - detect smooth/plastic regions
    LIGHTING: 0.25,     // 25% - gradient direction consistency
    EDGES: 0.20,        // 20% - sharpness distribution
    BLUR: 0.15,         // 15% - unnatural blur boundaries
    BACKGROUND: 0.10    // 10% - pattern repetition
};

// Thresholds
const THRESHOLDS = {
    MIN_IMAGE_SIZE: 100,          // Skip images smaller than 100x100
    MAX_ANALYSIS_SIZE: 1024,      // Cap at 1024x1024 for performance
    SKIN_VARIANCE_LOW: 15,        // AI "plastic" skin threshold
    SKIN_VARIANCE_NORMAL_MIN: 20, // Normal skin variance range
    SKIN_VARIANCE_NORMAL_MAX: 60,
    EDGE_CV_LOW: 0.3,             // Too uniform edges
    EDGE_CV_HIGH: 2.0,            // Too inconsistent edges
    GRADIENT_CONSISTENCY: 0.7,    // Lighting consistency threshold
    BLUR_GRADIENT_THRESHOLD: 30   // Blur transition detection
};

export class ForensicAnalyzer {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        console.log('[Layer1-Forensic] ForensicAnalyzer initialized');
    }

    /**
     * Main entry point - analyze an image for forensic anomalies
     * @param {HTMLImageElement} imageElement - The image to analyze
     * @returns {Promise<Object>} Analysis results
     */
    async analyze(imageElement) {
        const startTime = performance.now();

        try {
            // Validate image
            const width = imageElement?.naturalWidth || imageElement?.width || 0;
            const height = imageElement?.naturalHeight || imageElement?.height || 0;

            if (width < THRESHOLDS.MIN_IMAGE_SIZE || height < THRESHOLDS.MIN_IMAGE_SIZE) {
                console.log(`[Layer1-Forensic] Image too small (${width}x${height}), skipping`);
                return this._createResult(0, [], {}, performance.now() - startTime);
            }

            // Get image data (resized if necessary)
            const imageData = await this._getImageData(imageElement);
            if (!imageData) {
                console.log('[Layer1-Forensic] Failed to get image data');
                return this._createResult(0, [], {}, performance.now() - startTime);
            }

            // Run all analysis methods
            const textureResult = this._analyzeTexture(imageData);
            const lightingResult = this._analyzeLighting(imageData);
            const edgesResult = this._analyzeEdges(imageData);
            const blurResult = this._analyzeBlurTransitions(imageData);
            const backgroundResult = this._analyzeBackground(imageData);

            // Calculate weighted score
            const weightedScore =
                (textureResult.score * WEIGHTS.TEXTURE) +
                (lightingResult.score * WEIGHTS.LIGHTING) +
                (edgesResult.score * WEIGHTS.EDGES) +
                (blurResult.score * WEIGHTS.BLUR) +
                (backgroundResult.score * WEIGHTS.BACKGROUND);

            // Collect all issues
            const allIssues = [
                ...textureResult.issues,
                ...lightingResult.issues,
                ...edgesResult.issues,
                ...blurResult.issues,
                ...backgroundResult.issues
            ];

            const details = {
                texture: textureResult,
                lighting: lightingResult,
                edges: edgesResult,
                blur: blurResult,
                background: backgroundResult
            };

            const processingTime = performance.now() - startTime;
            const result = this._createResult(Math.round(weightedScore), allIssues, details, processingTime);

            console.log(`[Layer1-Forensic] Analysis complete: score=${result.score}, issues=${allIssues.length}, time=${processingTime.toFixed(2)}ms`);

            return result;

        } catch (error) {
            console.error('[Layer1-Forensic] Error during analysis:', error);
            return this._createResult(0, [], {}, performance.now() - startTime);
        }
    }

    /**
     * Get image data, resizing to max 1024x1024 for performance
     * @param {HTMLImageElement} img - Source image
     * @returns {ImageData|null} The image data
     */
    async _getImageData(img) {
        try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            // Handle cross-origin images
            if (img.crossOrigin === null && !img.src.startsWith('data:')) {
                // Try to load with crossOrigin
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';

                try {
                    await new Promise((resolve, reject) => {
                        tempImg.onload = resolve;
                        tempImg.onerror = reject;
                        tempImg.src = img.src;
                        setTimeout(reject, 3000); // 3s timeout
                    });
                    img = tempImg;
                    width = img.naturalWidth;
                    height = img.naturalHeight;
                } catch {
                    // Continue with original image, may fail on getImageData
                }
            }

            // Resize if necessary
            const scale = Math.min(1, THRESHOLDS.MAX_ANALYSIS_SIZE / Math.max(width, height));
            const scaledWidth = Math.floor(width * scale);
            const scaledHeight = Math.floor(height * scale);

            this.canvas.width = scaledWidth;
            this.canvas.height = scaledHeight;

            this.ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            return this.ctx.getImageData(0, 0, scaledWidth, scaledHeight);
        } catch (error) {
            console.error('[Layer1-Forensic] Error getting image data:', error);
            return null;
        }
    }

    /**
     * Analyze texture for unnaturally smooth regions (AI "plastic" look)
     * @param {ImageData} imageData
     * @returns {Object} { score, issues }
     */
    _analyzeTexture(imageData) {
        const { data, width, height } = imageData;
        const issues = [];
        let totalSmoothRegions = 0;
        let skinRegionCount = 0;
        let totalRegions = 0;

        // Detect skin regions first
        const skinMask = this._detectSkinRegions(imageData);

        // Sample 5x5 windows across the image
        const step = 20; // Sample every 20 pixels
        const windowRadius = 2;

        for (let y = windowRadius; y < height - windowRadius; y += step) {
            for (let x = windowRadius; x < width - windowRadius; x += step) {
                const idx = (y * width + x);
                const isSkin = skinMask[idx];

                if (isSkin) {
                    skinRegionCount++;
                    const variance = this._localVariance(data, x, y, width, windowRadius);

                    if (variance < THRESHOLDS.SKIN_VARIANCE_LOW) {
                        totalSmoothRegions++;
                    }
                }
                totalRegions++;
            }
        }

        // Calculate score based on smooth skin ratio
        let score = 0;
        if (skinRegionCount > 10) { // Need enough skin regions to analyze
            const smoothRatio = totalSmoothRegions / skinRegionCount;
            score = Math.min(100, smoothRatio * 200); // 50% smooth = 100 score

            if (smoothRatio > 0.3) {
                issues.push({
                    type: 'texture',
                    subtype: 'smooth_skin',
                    location: 'multiple_regions',
                    description: 'Unnaturally smooth skin texture detected (AI "plastic" look)',
                    confidence: Math.min(95, Math.round(smoothRatio * 150))
                });
            }
        }

        // Also check for overall image smoothness in non-skin areas
        const nonSkinVariances = [];
        for (let y = windowRadius; y < height - windowRadius; y += step * 2) {
            for (let x = windowRadius; x < width - windowRadius; x += step * 2) {
                const idx = (y * width + x);
                if (!skinMask[idx]) {
                    nonSkinVariances.push(this._localVariance(data, x, y, width, windowRadius));
                }
            }
        }

        if (nonSkinVariances.length > 10) {
            const avgVariance = nonSkinVariances.reduce((a, b) => a + b, 0) / nonSkinVariances.length;
            if (avgVariance < 10) {
                score = Math.max(score, 60);
                issues.push({
                    type: 'texture',
                    subtype: 'overall_smooth',
                    location: 'general',
                    description: 'Overall image lacks natural texture variation',
                    confidence: 60
                });
            }
        }

        return { score: Math.round(score), issues };
    }

    /**
     * Analyze lighting gradient consistency
     * @param {ImageData} imageData
     * @returns {Object} { score, issues }
     */
    _analyzeLighting(imageData) {
        const { data, width, height } = imageData;
        const issues = [];
        const gradientDirections = [];

        // Divide image into 4x4 grid
        const gridSize = 4;
        const cellWidth = Math.floor(width / gridSize);
        const cellHeight = Math.floor(height / gridSize);

        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const startX = gx * cellWidth;
                const startY = gy * cellHeight;

                let sumGx = 0;
                let sumGy = 0;
                let samples = 0;

                // Sample within cell
                for (let y = startY + 1; y < startY + cellHeight - 1; y += 5) {
                    for (let x = startX + 1; x < startX + cellWidth - 1; x += 5) {
                        const gxVal = this._sobelX(data, x, y, width);
                        const gyVal = this._sobelY(data, x, y, width);

                        if (Math.abs(gxVal) > 10 || Math.abs(gyVal) > 10) { // Only count significant gradients
                            sumGx += gxVal;
                            sumGy += gyVal;
                            samples++;
                        }
                    }
                }

                if (samples > 5) {
                    const avgGx = sumGx / samples;
                    const avgGy = sumGy / samples;
                    const direction = Math.atan2(avgGy, avgGx);
                    gradientDirections.push({
                        x: gx,
                        y: gy,
                        direction: direction,
                        magnitude: Math.sqrt(avgGx * avgGx + avgGy * avgGy)
                    });
                }
            }
        }

        // Analyze gradient consistency
        let score = 0;

        if (gradientDirections.length >= 4) {
            // Calculate variance in gradient directions
            const strongGradients = gradientDirections.filter(g => g.magnitude > 20);

            if (strongGradients.length >= 4) {
                const directions = strongGradients.map(g => g.direction);
                const avgDirection = directions.reduce((a, b) => a + b, 0) / directions.length;

                let variance = 0;
                for (const dir of directions) {
                    // Handle circular variance (directions wrap around)
                    let diff = Math.abs(dir - avgDirection);
                    if (diff > Math.PI) diff = 2 * Math.PI - diff;
                    variance += diff * diff;
                }
                variance /= directions.length;

                // High variance = inconsistent lighting = suspicious
                if (variance > 1.5) {
                    score = Math.min(100, variance * 40);
                    issues.push({
                        type: 'lighting',
                        subtype: 'inconsistent_direction',
                        location: 'multiple_regions',
                        description: 'Multiple inconsistent lighting directions detected',
                        confidence: Math.min(90, Math.round(variance * 30))
                    });
                }

                // Check for adjacent cells with opposing gradients
                for (let i = 0; i < strongGradients.length; i++) {
                    for (let j = i + 1; j < strongGradients.length; j++) {
                        const g1 = strongGradients[i];
                        const g2 = strongGradients[j];

                        // Adjacent cells?
                        if (Math.abs(g1.x - g2.x) <= 1 && Math.abs(g1.y - g2.y) <= 1) {
                            let dirDiff = Math.abs(g1.direction - g2.direction);
                            if (dirDiff > Math.PI) dirDiff = 2 * Math.PI - dirDiff;

                            // Opposing directions (> 120 degrees)
                            if (dirDiff > (2 * Math.PI / 3)) {
                                score = Math.max(score, 70);
                                issues.push({
                                    type: 'lighting',
                                    subtype: 'opposing_gradients',
                                    location: `grid(${g1.x},${g1.y})->(${g2.x},${g2.y})`,
                                    description: 'Adjacent regions have opposing light directions',
                                    confidence: 70
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }

        return { score: Math.round(score), issues };
    }

    /**
     * Analyze edge sharpness distribution
     * @param {ImageData} imageData
     * @returns {Object} { score, issues }
     */
    _analyzeEdges(imageData) {
        const { data, width, height } = imageData;
        const issues = [];

        // Divide into 8x8 grid
        const gridSize = 8;
        const cellWidth = Math.floor(width / gridSize);
        const cellHeight = Math.floor(height / gridSize);
        const cellSharpness = [];

        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const startX = gx * cellWidth;
                const startY = gy * cellHeight;

                let totalLaplacian = 0;
                let samples = 0;

                // Sample within cell
                for (let y = startY + 1; y < Math.min(startY + cellHeight - 1, height - 1); y += 3) {
                    for (let x = startX + 1; x < Math.min(startX + cellWidth - 1, width - 1); x += 3) {
                        const lap = Math.abs(this._laplacian(data, x, y, width, height));
                        totalLaplacian += lap;
                        samples++;
                    }
                }

                if (samples > 0) {
                    cellSharpness.push({
                        x: gx,
                        y: gy,
                        sharpness: totalLaplacian / samples
                    });
                }
            }
        }

        // Calculate coefficient of variation
        let score = 0;

        if (cellSharpness.length >= 16) {
            const sharpnesses = cellSharpness.map(c => c.sharpness);
            const mean = sharpnesses.reduce((a, b) => a + b, 0) / sharpnesses.length;

            if (mean > 0) {
                const variance = sharpnesses.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sharpnesses.length;
                const stdDev = Math.sqrt(variance);
                const cv = stdDev / mean;

                if (cv < THRESHOLDS.EDGE_CV_LOW) {
                    // Too uniform - suspicious
                    score = Math.min(100, (THRESHOLDS.EDGE_CV_LOW - cv) * 300);
                    issues.push({
                        type: 'edges',
                        subtype: 'too_uniform',
                        location: 'general',
                        description: 'Edge sharpness is unnaturally uniform across image',
                        confidence: Math.min(85, Math.round(70 + (THRESHOLDS.EDGE_CV_LOW - cv) * 50))
                    });
                } else if (cv > THRESHOLDS.EDGE_CV_HIGH) {
                    // Too inconsistent - suspicious (could be compositing)
                    score = Math.min(80, (cv - THRESHOLDS.EDGE_CV_HIGH) * 30);
                    issues.push({
                        type: 'edges',
                        subtype: 'too_inconsistent',
                        location: 'general',
                        description: 'Edge sharpness varies drastically (possible compositing)',
                        confidence: Math.min(75, Math.round(50 + (cv - THRESHOLDS.EDGE_CV_HIGH) * 15))
                    });
                }

                // Check for sudden sharpness transitions
                for (let i = 0; i < cellSharpness.length; i++) {
                    const cell = cellSharpness[i];
                    // Check neighbors
                    for (let j = 0; j < cellSharpness.length; j++) {
                        if (i === j) continue;
                        const neighbor = cellSharpness[j];

                        if (Math.abs(cell.x - neighbor.x) <= 1 && Math.abs(cell.y - neighbor.y) <= 1) {
                            const ratio = Math.max(cell.sharpness, 1) / Math.max(neighbor.sharpness, 1);
                            if (ratio > 5 || ratio < 0.2) {
                                score = Math.max(score, 60);
                                issues.push({
                                    type: 'edges',
                                    subtype: 'sudden_transition',
                                    location: `grid(${cell.x},${cell.y})`,
                                    description: 'Sudden sharpness transition between adjacent regions',
                                    confidence: 65
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }

        return { score: Math.round(score), issues: issues.slice(0, 3) }; // Limit issues
    }

    /**
     * Analyze blur transitions for unnatural patterns
     * @param {ImageData} imageData
     * @returns {Object} { score, issues }
     */
    _analyzeBlurTransitions(imageData) {
        const { data, width, height } = imageData;
        const issues = [];

        // Create blur map using local variance
        const blurMapWidth = Math.floor(width / 10);
        const blurMapHeight = Math.floor(height / 10);
        const blurMap = [];

        for (let by = 0; by < blurMapHeight; by++) {
            for (let bx = 0; bx < blurMapWidth; bx++) {
                const x = bx * 10 + 5;
                const y = by * 10 + 5;

                if (x < width - 3 && y < height - 3) {
                    const sharpness = Math.abs(this._laplacian(data, x, y, width, height));
                    blurMap.push({ x: bx, y: by, sharpness });
                }
            }
        }

        // Detect abrupt blur transitions
        let abruptTransitions = 0;
        let haloPatterns = 0;
        let score = 0;

        for (let i = 0; i < blurMap.length; i++) {
            const cell = blurMap[i];

            // Find horizontal and vertical neighbors
            const neighbors = blurMap.filter(n =>
                (Math.abs(n.x - cell.x) === 1 && n.y === cell.y) ||
                (Math.abs(n.y - cell.y) === 1 && n.x === cell.x)
            );

            for (const neighbor of neighbors) {
                const diff = Math.abs(cell.sharpness - neighbor.sharpness);

                // Abrupt transition
                if (diff > THRESHOLDS.BLUR_GRADIENT_THRESHOLD) {
                    abruptTransitions++;
                }
            }

            // Detect halo effect (sharp center, blurry ring, sharp outer)
            const ring1 = blurMap.filter(n =>
                Math.abs(n.x - cell.x) === 1 && Math.abs(n.y - cell.y) <= 1 ||
                Math.abs(n.y - cell.y) === 1 && Math.abs(n.x - cell.x) <= 1
            );
            const ring2 = blurMap.filter(n =>
                Math.abs(n.x - cell.x) === 2 && Math.abs(n.y - cell.y) <= 2 ||
                Math.abs(n.y - cell.y) === 2 && Math.abs(n.x - cell.x) <= 2
            );

            if (ring1.length >= 3 && ring2.length >= 3) {
                const avgRing1 = ring1.reduce((a, b) => a + b.sharpness, 0) / ring1.length;
                const avgRing2 = ring2.reduce((a, b) => a + b.sharpness, 0) / ring2.length;

                // Halo: center sharp, ring1 blurry, ring2 sharp again
                if (cell.sharpness > avgRing1 * 2 && avgRing2 > avgRing1 * 1.5) {
                    haloPatterns++;
                }
            }
        }

        // Score based on findings
        if (blurMap.length > 20) {
            const transitionRatio = abruptTransitions / blurMap.length;

            if (transitionRatio > 0.1) {
                score = Math.min(80, transitionRatio * 400);
                issues.push({
                    type: 'blur',
                    subtype: 'abrupt_transitions',
                    location: 'multiple_regions',
                    description: 'Unnaturally abrupt blur transitions detected',
                    confidence: Math.min(80, Math.round(transitionRatio * 300))
                });
            }

            if (haloPatterns > 3) {
                score = Math.max(score, 70);
                issues.push({
                    type: 'blur',
                    subtype: 'halo_effect',
                    location: 'subject_edges',
                    description: 'Halo effect detected around subject (common in AI compositing)',
                    confidence: Math.min(75, 50 + haloPatterns * 5)
                });
            }
        }

        return { score: Math.round(score), issues };
    }

    /**
     * Analyze background for pattern repetition
     * @param {ImageData} imageData
     * @returns {Object} { score, issues }
     */
    _analyzeBackground(imageData) {
        const { data, width, height } = imageData;
        const issues = [];
        let score = 0;

        // Simple autocorrelation on downsampled image
        const sampleStep = 8;
        const samples = [];

        // Collect luminance samples
        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const idx = (y * width + x) * 4;
                const luminance = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
                samples.push({ x, y, lum: luminance });
            }
        }

        // Look for repeating patterns (simplified autocorrelation)
        const patternMatches = [];
        const checkOffsets = [
            { dx: 32, dy: 0 },
            { dx: 64, dy: 0 },
            { dx: 0, dy: 32 },
            { dx: 0, dy: 64 },
            { dx: 32, dy: 32 }
        ];

        for (const offset of checkOffsets) {
            let matches = 0;
            let comparisons = 0;

            for (const sample of samples) {
                const matchingSample = samples.find(s =>
                    s.x === sample.x + offset.dx && s.y === sample.y + offset.dy
                );

                if (matchingSample) {
                    comparisons++;
                    // Very similar luminance at offset = potential repetition
                    if (Math.abs(sample.lum - matchingSample.lum) < 5) {
                        matches++;
                    }
                }
            }

            if (comparisons > 10) {
                const matchRatio = matches / comparisons;
                if (matchRatio > 0.7) {
                    patternMatches.push({ offset, ratio: matchRatio });
                }
            }
        }

        if (patternMatches.length > 0) {
            score = Math.min(100, patternMatches.length * 30);
            issues.push({
                type: 'background',
                subtype: 'pattern_repetition',
                location: 'background_regions',
                description: 'Repeating pattern detected in background (common in AI-generated images)',
                confidence: Math.min(70, 40 + patternMatches.length * 15)
            });
        }

        // Check for warped lines (simplified)
        // Look for horizontal/vertical edge patterns that should be straight but aren't
        const edgePoints = [];
        for (let y = 10; y < height - 10; y += 20) {
            for (let x = 10; x < width - 10; x += 5) {
                const idx = (y * width + x) * 4;
                const gx = Math.abs(this._sobelX(data, x, y, width));
                if (gx > 50) {
                    edgePoints.push({ x, y, strength: gx });
                }
            }
        }

        // Group edge points by approximate y position
        const horizontalLines = {};
        for (const point of edgePoints) {
            const yBucket = Math.floor(point.y / 10);
            if (!horizontalLines[yBucket]) horizontalLines[yBucket] = [];
            horizontalLines[yBucket].push(point);
        }

        // Check if horizontal edges wobble
        for (const bucket in horizontalLines) {
            const points = horizontalLines[bucket];
            if (points.length > 5) {
                const yValues = points.map(p => p.y);
                const yVariance = this._calculateVariance(yValues);

                // High variance in what should be a straight line
                if (yVariance > 15) {
                    score = Math.max(score, 50);
                    issues.push({
                        type: 'background',
                        subtype: 'warped_lines',
                        location: 'edges',
                        description: 'Potentially warped straight lines detected',
                        confidence: Math.min(60, 35 + yVariance)
                    });
                    break;
                }
            }
        }

        return { score: Math.round(score), issues: issues.slice(0, 2) };
    }

    // ========== HELPER METHODS ==========

    /**
     * Sobel X operator for gradient detection
     */
    _sobelX(data, x, y, width) {
        const getGray = (px, py) => {
            const idx = (py * width + px) * 4;
            return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
        };

        return (
            -1 * getGray(x - 1, y - 1) + 1 * getGray(x + 1, y - 1) +
            -2 * getGray(x - 1, y) + 2 * getGray(x + 1, y) +
            -1 * getGray(x - 1, y + 1) + 1 * getGray(x + 1, y + 1)
        );
    }

    /**
     * Sobel Y operator for gradient detection
     */
    _sobelY(data, x, y, width) {
        const getGray = (px, py) => {
            const idx = (py * width + px) * 4;
            return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
        };

        return (
            -1 * getGray(x - 1, y - 1) + -2 * getGray(x, y - 1) + -1 * getGray(x + 1, y - 1) +
            1 * getGray(x - 1, y + 1) + 2 * getGray(x, y + 1) + 1 * getGray(x + 1, y + 1)
        );
    }

    /**
     * Laplacian operator for edge/sharpness detection
     */
    _laplacian(data, x, y, width, height) {
        if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return 0;

        const getGray = (px, py) => {
            const idx = (py * width + px) * 4;
            return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
        };

        const center = getGray(x, y);
        return (
            getGray(x - 1, y) + getGray(x + 1, y) +
            getGray(x, y - 1) + getGray(x, y + 1) -
            4 * center
        );
    }

    /**
     * Calculate local variance in a window
     */
    _localVariance(data, x, y, width, radius) {
        const values = [];

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const idx = ((y + dy) * width + (x + dx)) * 4;
                const gray = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
                values.push(gray);
            }
        }

        return this._calculateVariance(values);
    }

    /**
     * Calculate variance of an array
     */
    _calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Detect skin regions using YCbCr color space
     * @returns {boolean[]} Mask array indicating skin pixels
     */
    _detectSkinRegions(imageData) {
        const { data, width, height } = imageData;
        const mask = new Array(width * height).fill(false);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // Convert to YCbCr
                const y_val = 0.299 * r + 0.587 * g + 0.114 * b;
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

                // Skin detection thresholds in YCbCr space
                const isSkin = (
                    y_val > 80 &&
                    cb > 77 && cb < 127 &&
                    cr > 133 && cr < 173
                );

                mask[y * width + x] = isSkin;
            }
        }

        return mask;
    }

    /**
     * Create standardized result object
     */
    _createResult(score, issues, details, processingTime) {
        return {
            score: Math.max(0, Math.min(100, score)),
            issues: issues,
            details: details,
            layer: 'forensic',
            processingTime: processingTime
        };
    }
}

// Export weights and thresholds for external configuration if needed
export { WEIGHTS, THRESHOLDS };
