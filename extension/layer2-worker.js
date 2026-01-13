/**
 * Layer 2: Mathematical Analysis Web Worker
 * Heavy mathematical computations run here to avoid blocking UI
 * 
 * Analysis weights:
 * - FFT Analysis: 40%
 * - Noise Analysis: 30%
 * - Color Histogram: 30%
 */

// Notify main thread that worker is ready
self.postMessage({ type: 'ready' });

console.log('[Layer2-Worker] Worker initialized');

// Message handler
self.onmessage = function (event) {
    const { type, imageData, width, height } = event.data;

    if (type === 'analyze') {
        try {
            const startTime = performance.now();
            const result = analyzeImage(imageData, width, height);
            result.processingTime = performance.now() - startTime;

            console.log(`[Layer2-Worker] Analysis complete in ${result.processingTime.toFixed(2)}ms`);

            self.postMessage({ type: 'result', ...result });
        } catch (error) {
            console.error('[Layer2-Worker] Analysis error:', error);
            self.postMessage({ type: 'error', message: error.message });
        }
    }
};

/**
 * Main analysis function
 */
function analyzeImage(imageData, width, height) {
    const artifacts = [];

    // Convert to grayscale Float32Array for FFT
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        gray[i] = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
    }

    // Run analyses
    const fftResult = analyzeFFT(gray, width, height);
    const noiseResult = analyzeNoise(imageData, width, height);
    const histogramResult = analyzeColorHistogram(imageData, width * height);

    // Collect artifacts
    artifacts.push(...fftResult.artifacts);
    artifacts.push(...noiseResult.artifacts);
    artifacts.push(...histogramResult.artifacts);

    // Calculate weighted score
    const score = Math.round(
        fftResult.score * 0.40 +
        noiseResult.score * 0.30 +
        histogramResult.score * 0.30
    );

    return {
        score: Math.min(100, Math.max(0, score)),
        frequencyStats: fftResult.stats,
        noiseStats: noiseResult.stats,
        colorStats: histogramResult.stats,
        artifacts: artifacts
    };
}

// ==================== FFT ANALYSIS (40%) ====================

/**
 * Analyze frequency domain using FFT
 */
function analyzeFFT(gray, width, height) {
    const artifacts = [];
    let score = 0;

    try {
        // Compute 2D FFT
        const { real, imag } = fft2d(gray, width, height);

        // Compute magnitude spectrum
        const magnitude = computeMagnitude(real, imag);

        // Shift zero frequency to center
        const shifted = fftShift(magnitude, width, height);

        // Detect GAN grid artifacts
        const ganResult = detectGANArtifacts(shifted, width, height);
        if (ganResult.detected) {
            score += 40;
            artifacts.push({
                type: 'frequency',
                subtype: 'gan_grid',
                description: 'GAN grid artifacts detected in frequency domain (spikes at N/4)',
                confidence: ganResult.confidence
            });
        }

        // Detect diffusion model signature
        const diffusionResult = detectDiffusionSignature(shifted, width, height);
        if (diffusionResult.detected) {
            score += 35;
            artifacts.push({
                type: 'frequency',
                subtype: 'diffusion_signature',
                description: 'Diffusion model signature detected (unnaturally smooth radial decay)',
                confidence: diffusionResult.confidence
            });
        }

        // Analyze spectral slope
        const slopeResult = analyzeSpectralSlope(shifted, width, height);
        if (slopeResult.anomaly) {
            score += 25;
            artifacts.push({
                type: 'frequency',
                subtype: 'spectral_slope',
                description: `Unnatural spectral slope: ${slopeResult.slope.toFixed(2)} (expected -1.0 to -1.5)`,
                confidence: slopeResult.confidence
            });
        }

        return {
            score: Math.min(100, score),
            stats: {
                ganArtifacts: ganResult.detected,
                diffusionSignature: diffusionResult.detected,
                spectralSlope: slopeResult.slope,
                slopeAnomaly: slopeResult.anomaly
            },
            artifacts
        };

    } catch (error) {
        console.error('[Layer2-Worker] FFT analysis error:', error);
        return { score: 0, stats: { ganArtifacts: false, diffusionSignature: false, spectralSlope: 0, slopeAnomaly: false }, artifacts: [] };
    }
}

/**
 * 2D FFT using Cooley-Tukey algorithm
 */
function fft2d(gray, width, height) {
    // Ensure dimensions are power of 2
    const n = width; // Assuming width === height and both are power of 2

    const real = new Float32Array(n * n);
    const imag = new Float32Array(n * n);

    // Copy input to real, imag = 0
    for (let i = 0; i < n * n; i++) {
        real[i] = gray[i];
        imag[i] = 0;
    }

    // Apply 1D FFT to each row
    const rowReal = new Float32Array(n);
    const rowImag = new Float32Array(n);

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            rowReal[x] = real[y * n + x];
            rowImag[x] = imag[y * n + x];
        }
        fft1d(rowReal, rowImag);
        for (let x = 0; x < n; x++) {
            real[y * n + x] = rowReal[x];
            imag[y * n + x] = rowImag[x];
        }
    }

    // Apply 1D FFT to each column
    const colReal = new Float32Array(n);
    const colImag = new Float32Array(n);

    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            colReal[y] = real[y * n + x];
            colImag[y] = imag[y * n + x];
        }
        fft1d(colReal, colImag);
        for (let y = 0; y < n; y++) {
            real[y * n + x] = colReal[y];
            imag[y * n + x] = colImag[y];
        }
    }

    return { real, imag };
}

/**
 * 1D FFT using Cooley-Tukey radix-2 algorithm
 */
function fft1d(real, imag) {
    const n = real.length;

    // Bit reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tempR = real[i];
            let tempI = imag[i];
            real[i] = real[j];
            imag[i] = imag[j];
            real[j] = tempR;
            imag[j] = tempI;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }

    // Cooley-Tukey butterfly
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = -2 * Math.PI / len;

        for (let i = 0; i < n; i += len) {
            for (let k = 0; k < halfLen; k++) {
                const theta = angle * k;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                const evenIdx = i + k;
                const oddIdx = i + k + halfLen;

                const tReal = cosT * real[oddIdx] - sinT * imag[oddIdx];
                const tImag = sinT * real[oddIdx] + cosT * imag[oddIdx];

                real[oddIdx] = real[evenIdx] - tReal;
                imag[oddIdx] = imag[evenIdx] - tImag;
                real[evenIdx] = real[evenIdx] + tReal;
                imag[evenIdx] = imag[evenIdx] + tImag;
            }
        }
    }
}

/**
 * Compute magnitude spectrum from real and imaginary parts
 */
function computeMagnitude(real, imag) {
    const n = real.length;
    const magnitude = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }

    return magnitude;
}

/**
 * Shift zero frequency to center (FFT shift)
 */
function fftShift(data, width, height) {
    const shifted = new Float32Array(width * height);
    const halfW = width >> 1;
    const halfH = height >> 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const srcX = (x + halfW) % width;
            const srcY = (y + halfH) % height;
            shifted[y * width + x] = data[srcY * width + srcX];
        }
    }

    return shifted;
}

/**
 * Detect GAN grid artifacts (spikes at N/4 frequencies)
 */
function detectGANArtifacts(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    // Check for spikes at N/4 positions (typical GAN checkerboard artifacts)
    const quarterPos = [
        [centerX + (width >> 2), centerY],
        [centerX - (width >> 2), centerY],
        [centerX, centerY + (height >> 2)],
        [centerX, centerY - (height >> 2)]
    ];

    // Calculate average magnitude
    let totalMag = 0;
    for (let i = 0; i < spectrum.length; i++) {
        totalMag += spectrum[i];
    }
    const avgMag = totalMag / spectrum.length;

    // Check spike positions
    let spikeCount = 0;
    let maxSpikeRatio = 0;

    for (const [x, y] of quarterPos) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            const mag = spectrum[y * width + x];
            const ratio = mag / avgMag;

            if (ratio > 5) { // Spike is 5x average
                spikeCount++;
                maxSpikeRatio = Math.max(maxSpikeRatio, ratio);
            }
        }
    }

    return {
        detected: spikeCount >= 2,
        confidence: Math.min(90, spikeCount * 20 + Math.min(30, maxSpikeRatio * 2))
    };
}

/**
 * Detect diffusion model signature (unnaturally smooth radial decay)
 */
function detectDiffusionSignature(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    // Sample radial profile
    const maxRadius = Math.min(centerX, centerY);
    const radialProfile = new Float32Array(maxRadius);
    const radialCounts = new Float32Array(maxRadius);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const r = Math.floor(Math.sqrt(dx * dx + dy * dy));

            if (r < maxRadius) {
                radialProfile[r] += Math.log1p(spectrum[y * width + x]);
                radialCounts[r]++;
            }
        }
    }

    // Average and check smoothness
    for (let r = 0; r < maxRadius; r++) {
        if (radialCounts[r] > 0) {
            radialProfile[r] /= radialCounts[r];
        }
    }

    // Calculate variance of second derivative (smoothness measure)
    let variance = 0;
    let count = 0;

    for (let r = 2; r < maxRadius - 2; r++) {
        if (radialCounts[r] > 0 && radialCounts[r - 1] > 0 && radialCounts[r + 1] > 0) {
            const secondDeriv = radialProfile[r - 1] - 2 * radialProfile[r] + radialProfile[r + 1];
            variance += secondDeriv * secondDeriv;
            count++;
        }
    }

    if (count > 0) {
        variance /= count;
    }

    // Very low variance = unnaturally smooth = diffusion model
    const isSmooth = variance < 0.001;

    return {
        detected: isSmooth,
        confidence: isSmooth ? Math.min(75, 50 + (0.001 - variance) * 25000) : 0
    };
}

/**
 * Analyze spectral slope (natural images follow 1/f pattern)
 */
function analyzeSpectralSlope(spectrum, width, height) {
    const centerX = width >> 1;
    const centerY = height >> 1;

    // Collect log-frequency vs log-magnitude data
    const dataPoints = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const freq = Math.sqrt(dx * dx + dy * dy);

            if (freq > 5 && freq < Math.min(centerX, centerY) * 0.8) {
                const mag = spectrum[y * width + x];
                if (mag > 0) {
                    dataPoints.push({
                        logFreq: Math.log(freq),
                        logMag: Math.log(mag)
                    });
                }
            }
        }
    }

    // Linear regression to find slope
    if (dataPoints.length < 100) {
        return { slope: -1.0, anomaly: false, confidence: 0 };
    }

    // Subsample for performance
    const sampleStep = Math.max(1, Math.floor(dataPoints.length / 1000));
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    let n = 0;

    for (let i = 0; i < dataPoints.length; i += sampleStep) {
        const { logFreq, logMag } = dataPoints[i];
        sumX += logFreq;
        sumY += logMag;
        sumXY += logFreq * logMag;
        sumXX += logFreq * logFreq;
        n++;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Natural images: slope between -1.0 and -1.5
    // Too flat (> -0.5) or too steep (< -2.5) is suspicious
    const anomaly = slope > -0.5 || slope < -2.5;

    return {
        slope: slope,
        anomaly: anomaly,
        confidence: anomaly ? Math.min(70, 40 + Math.abs(slope - (-1.25)) * 20) : 0
    };
}

// ==================== NOISE ANALYSIS (30%) ====================

/**
 * Analyze noise patterns
 */
function analyzeNoise(imageData, width, height) {
    const artifacts = [];
    let score = 0;

    try {
        // Extract noise residual
        const noise = extractNoiseResidual(imageData, width, height);

        // Analyze PRNU (Photo Response Non-Uniformity)
        const prnuResult = analyzePRNU(noise, width, height);
        if (prnuResult.absent) {
            score += 50;
            artifacts.push({
                type: 'noise',
                subtype: 'prnu_absent',
                description: 'Camera sensor fingerprint (PRNU) not detected - likely AI-generated',
                confidence: prnuResult.confidence
            });
        }

        // Analyze noise uniformity
        const uniformityResult = analyzeNoiseUniformity(noise, width, height);
        if (uniformityResult.tooUniform) {
            score += 35;
            artifacts.push({
                type: 'noise',
                subtype: 'uniform_noise',
                description: 'Noise pattern is unnaturally uniform across image',
                confidence: uniformityResult.confidence
            });
        }

        return {
            score: Math.min(100, score),
            stats: {
                prnuCorrelation: prnuResult.correlation,
                prnuAbsent: prnuResult.absent,
                uniformityCV: uniformityResult.cv,
                tooUniform: uniformityResult.tooUniform
            },
            artifacts
        };

    } catch (error) {
        console.error('[Layer2-Worker] Noise analysis error:', error);
        return { score: 0, stats: { prnuCorrelation: 0, prnuAbsent: false, uniformityCV: 0, tooUniform: false }, artifacts: [] };
    }
}

/**
 * Extract noise residual using simple high-pass filter
 */
function extractNoiseResidual(imageData, width, height) {
    const noise = new Float32Array(width * height);

    // Convert to grayscale and apply 3x3 high-pass filter
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            // Get grayscale values in 3x3 neighborhood
            let center = 0;
            let neighbors = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const idx = ((y + dy) * width + (x + dx)) * 4;
                    const gray = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];

                    if (dx === 0 && dy === 0) {
                        center = gray;
                    } else {
                        neighbors += gray;
                    }
                }
            }

            // Noise = center - average of neighbors
            noise[y * width + x] = center - neighbors / 8;
        }
    }

    return noise;
}

/**
 * Analyze PRNU (Photo Response Non-Uniformity)
 * Real cameras have consistent sensor noise patterns across quadrants
 */
function analyzePRNU(noise, width, height) {
    const halfW = width >> 1;
    const halfH = height >> 1;

    // Split into quadrants and compute cross-correlation
    const q1 = [], q2 = [], q3 = [], q4 = [];

    for (let y = 0; y < halfH; y++) {
        for (let x = 0; x < halfW; x++) {
            q1.push(noise[y * width + x]);
            q2.push(noise[y * width + (x + halfW)]);
            q3.push(noise[(y + halfH) * width + x]);
            q4.push(noise[(y + halfH) * width + (x + halfW)]);
        }
    }

    // Compute average correlation between opposite quadrants
    const corr13 = pearsonCorrelation(q1, q3);
    const corr24 = pearsonCorrelation(q2, q4);
    const corr12 = pearsonCorrelation(q1, q2);

    const avgCorrelation = (Math.abs(corr13) + Math.abs(corr24) + Math.abs(corr12)) / 3;

    // Real photos typically have correlation > 0.1 due to PRNU
    // AI images have near-zero correlation
    const absent = avgCorrelation < 0.05;

    return {
        correlation: avgCorrelation,
        absent: absent,
        confidence: absent ? Math.min(80, 50 + (0.05 - avgCorrelation) * 600) : 0
    };
}

/**
 * Pearson correlation coefficient
 */
function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 10) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

    // Subsample for performance
    const step = Math.max(1, Math.floor(n / 1000));
    let count = 0;

    for (let i = 0; i < n; i += step) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumXX += x[i] * x[i];
        sumYY += y[i] * y[i];
        count++;
    }

    const meanX = sumX / count;
    const meanY = sumY / count;

    let cov = 0, varX = 0, varY = 0;

    for (let i = 0; i < n; i += step) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        cov += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }

    const denom = Math.sqrt(varX * varY);
    return denom > 0 ? cov / denom : 0;
}

/**
 * Analyze noise uniformity across 4x4 grid
 */
function analyzeNoiseUniformity(noise, width, height) {
    const gridSize = 4;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    const cellVariances = [];

    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            const startX = gx * cellWidth;
            const startY = gy * cellHeight;

            // Calculate variance in this cell
            let sum = 0, sumSq = 0, count = 0;

            for (let y = startY; y < startY + cellHeight && y < height; y++) {
                for (let x = startX; x < startX + cellWidth && x < width; x++) {
                    const val = noise[y * width + x];
                    sum += val;
                    sumSq += val * val;
                    count++;
                }
            }

            if (count > 0) {
                const mean = sum / count;
                const variance = (sumSq / count) - (mean * mean);
                cellVariances.push(Math.max(0, variance));
            }
        }
    }

    // Calculate coefficient of variation of variances
    if (cellVariances.length < 4) {
        return { cv: 0, tooUniform: false, confidence: 0 };
    }

    const meanVar = cellVariances.reduce((a, b) => a + b, 0) / cellVariances.length;
    if (meanVar < 0.001) {
        return { cv: 0, tooUniform: true, confidence: 70 };
    }

    const varOfVar = cellVariances.reduce((sum, v) => sum + Math.pow(v - meanVar, 2), 0) / cellVariances.length;
    const stdVar = Math.sqrt(varOfVar);
    const cv = stdVar / meanVar;

    // CV < 0.3 is suspiciously uniform
    const tooUniform = cv < 0.3;

    return {
        cv: cv,
        tooUniform: tooUniform,
        confidence: tooUniform ? Math.min(75, 50 + (0.3 - cv) * 80) : 0
    };
}

// ==================== COLOR HISTOGRAM ANALYSIS (30%) ====================

/**
 * Analyze color histogram for AI artifacts
 */
function analyzeColorHistogram(imageData, pixelCount) {
    const artifacts = [];
    let score = 0;

    try {
        // Build RGB histograms
        const rHist = new Uint32Array(256);
        const gHist = new Uint32Array(256);
        const bHist = new Uint32Array(256);

        for (let i = 0; i < pixelCount; i++) {
            const idx = i * 4;
            rHist[imageData[idx]]++;
            gHist[imageData[idx + 1]]++;
            bHist[imageData[idx + 2]]++;
        }

        // Calculate entropy for each channel
        const rEntropy = calculateEntropy(rHist, pixelCount);
        const gEntropy = calculateEntropy(gHist, pixelCount);
        const bEntropy = calculateEntropy(bHist, pixelCount);
        const avgEntropy = (rEntropy + gEntropy + bEntropy) / 3;

        // Check for gaps (color banding)
        const rGaps = countHistogramGaps(rHist);
        const gGaps = countHistogramGaps(gHist);
        const bGaps = countHistogramGaps(bHist);
        const totalGaps = rGaps + gGaps + bGaps;

        // Check histogram smoothness
        const rSmoothness = calculateHistogramSmoothness(rHist);
        const gSmoothness = calculateHistogramSmoothness(gHist);
        const bSmoothness = calculateHistogramSmoothness(bHist);
        const avgSmoothness = (rSmoothness + gSmoothness + bSmoothness) / 3;

        // Score based on findings

        // Low entropy = limited color palette
        if (avgEntropy < 5.0) {
            score += 30;
            artifacts.push({
                type: 'histogram',
                subtype: 'low_entropy',
                description: 'Limited color variation detected in image',
                confidence: Math.min(70, 40 + (5.0 - avgEntropy) * 6)
            });
        }

        // Too many gaps = color banding (common in AI)
        if (totalGaps > 50) {
            score += 25;
            artifacts.push({
                type: 'histogram',
                subtype: 'color_banding',
                description: 'Color banding detected (gaps in histogram)',
                confidence: Math.min(75, 50 + totalGaps / 5)
            });
        }

        // Too smooth histogram = unnatural color distribution
        if (avgSmoothness > 0.9) {
            score += 20;
            artifacts.push({
                type: 'histogram',
                subtype: 'smooth_histogram',
                description: 'Unnaturally smooth color distribution',
                confidence: Math.min(65, 45 + avgSmoothness * 20)
            });
        }

        return {
            score: Math.min(100, score),
            stats: {
                entropy: avgEntropy,
                gaps: totalGaps,
                smoothness: avgSmoothness
            },
            artifacts
        };

    } catch (error) {
        console.error('[Layer2-Worker] Histogram analysis error:', error);
        return { score: 0, stats: { entropy: 0, gaps: 0, smoothness: 0 }, artifacts: [] };
    }
}

/**
 * Calculate Shannon entropy of histogram
 */
function calculateEntropy(histogram, total) {
    let entropy = 0;

    for (let i = 0; i < 256; i++) {
        if (histogram[i] > 0) {
            const p = histogram[i] / total;
            entropy -= p * Math.log2(p);
        }
    }

    return entropy;
}

/**
 * Count gaps (zero runs) in histogram
 */
function countHistogramGaps(histogram) {
    let gaps = 0;
    let inGap = false;

    for (let i = 10; i < 245; i++) { // Ignore edges
        if (histogram[i] === 0) {
            if (!inGap) {
                gaps++;
                inGap = true;
            }
        } else {
            inGap = false;
        }
    }

    return gaps;
}

/**
 * Calculate histogram smoothness (autocorrelation at lag 1)
 */
function calculateHistogramSmoothness(histogram) {
    let sum1 = 0, sum2 = 0, sumProd = 0;
    let count = 0;

    for (let i = 0; i < 255; i++) {
        if (histogram[i] > 0 || histogram[i + 1] > 0) {
            const v1 = Math.log1p(histogram[i]);
            const v2 = Math.log1p(histogram[i + 1]);
            sum1 += v1;
            sum2 += v2;
            sumProd += v1 * v2;
            count++;
        }
    }

    if (count < 10) return 0;

    const mean1 = sum1 / count;
    const mean2 = sum2 / count;
    const cov = sumProd / count - mean1 * mean2;

    // Normalize
    let var1 = 0, var2 = 0;
    for (let i = 0; i < 255; i++) {
        if (histogram[i] > 0 || histogram[i + 1] > 0) {
            const v1 = Math.log1p(histogram[i]);
            const v2 = Math.log1p(histogram[i + 1]);
            var1 += (v1 - mean1) * (v1 - mean1);
            var2 += (v2 - mean2) * (v2 - mean2);
        }
    }

    const denom = Math.sqrt((var1 / count) * (var2 / count));
    return denom > 0 ? Math.abs(cov / denom) : 0;
}
