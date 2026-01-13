/**
 * Layer 2: Mathematical Analysis (Main Thread)
 * Orchestrates heavy mathematical analysis in a Web Worker
 * Target: < 5 seconds processing time (with timeout)
 * Max Score: 100 points
 * 
 * Analysis performed in worker:
 * - FFT Analysis (40% weight) - GAN artifacts, diffusion signature, spectral slope
 * - Noise Analysis (30% weight) - PRNU patterns, noise uniformity
 * - Color Histogram (30% weight) - entropy, gaps, smoothness
 */

const WORKER_TIMEOUT = 5000; // 5 seconds timeout
const ANALYSIS_SIZE = 512;   // Power of 2 for FFT efficiency

export class MathematicalAnalyzer {
    constructor() {
        this.worker = null;
        this.workerReady = false;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.timeoutId = null;
        this.canvas = null;
        this.ctx = null;

        console.log('[Layer2-Math] MathematicalAnalyzer created');
    }

    /**
     * Initialize the Web Worker
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.workerReady) {
            console.log('[Layer2-Math] Worker already initialized');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                // Create worker from the worker script
                const workerUrl = chrome.runtime.getURL('layer2-worker.js');
                this.worker = new Worker(workerUrl);

                this.worker.onmessage = (event) => {
                    const { type, ...data } = event.data;

                    if (type === 'ready') {
                        this.workerReady = true;
                        console.log('[Layer2-Math] Worker ready');
                        resolve();
                    } else if (type === 'result') {
                        this._handleResult(data);
                    } else if (type === 'error') {
                        this._handleError(new Error(data.message));
                    }
                };

                this.worker.onerror = (error) => {
                    console.error('[Layer2-Math] Worker error:', error);
                    this._handleError(error);
                    reject(error);
                };

                // Create canvas for image data extraction
                this.canvas = document.createElement('canvas');
                this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

                // Timeout for initialization
                setTimeout(() => {
                    if (!this.workerReady) {
                        reject(new Error('Worker initialization timeout'));
                    }
                }, 3000);

            } catch (error) {
                console.error('[Layer2-Math] Failed to create worker:', error);
                reject(error);
            }
        });
    }

    /**
     * Analyze an image using mathematical methods
     * @param {HTMLImageElement} imageElement
     * @returns {Promise<Object>} Analysis results
     */
    async analyze(imageElement) {
        const startTime = performance.now();

        // Ensure worker is ready
        if (!this.workerReady) {
            try {
                await this.initialize();
            } catch (error) {
                console.error('[Layer2-Math] Worker initialization failed:', error);
                return this._createEmptyResult(performance.now() - startTime);
            }
        }

        try {
            // Get image data
            const imageData = this._getImageData(imageElement);
            if (!imageData) {
                console.log('[Layer2-Math] Failed to get image data');
                return this._createEmptyResult(performance.now() - startTime);
            }

            // Send to worker and wait for result
            const result = await this._analyzeInWorker(imageData);

            const processingTime = performance.now() - startTime;

            console.log(`[Layer2-Math] Analysis complete: score=${result.score}, time=${processingTime.toFixed(2)}ms`);

            return {
                score: result.score,
                frequencyStats: result.frequencyStats,
                noiseStats: result.noiseStats,
                artifacts: result.artifacts,
                layer: 'mathematical',
                processingTime: processingTime
            };

        } catch (error) {
            console.error('[Layer2-Math] Analysis error:', error);
            return this._createEmptyResult(performance.now() - startTime);
        }
    }

    /**
     * Get image data resized to 512x512 for FFT
     * @param {HTMLImageElement} img
     * @returns {ImageData|null}
     */
    _getImageData(img) {
        try {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;

            if (width < 50 || height < 50) {
                console.log('[Layer2-Math] Image too small for analysis');
                return null;
            }

            // Resize to 512x512 (power of 2 for FFT)
            this.canvas.width = ANALYSIS_SIZE;
            this.canvas.height = ANALYSIS_SIZE;

            // Draw with aspect ratio preservation (center crop)
            const scale = Math.max(ANALYSIS_SIZE / width, ANALYSIS_SIZE / height);
            const scaledWidth = width * scale;
            const scaledHeight = height * scale;
            const offsetX = (ANALYSIS_SIZE - scaledWidth) / 2;
            const offsetY = (ANALYSIS_SIZE - scaledHeight) / 2;

            this.ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

            return this.ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
        } catch (error) {
            console.error('[Layer2-Math] Error getting image data:', error);
            return null;
        }
    }

    /**
     * Send image data to worker and wait for result
     * @param {ImageData} imageData
     * @returns {Promise<Object>}
     */
    _analyzeInWorker(imageData) {
        return new Promise((resolve, reject) => {
            this.pendingResolve = resolve;
            this.pendingReject = reject;

            // Set timeout
            this.timeoutId = setTimeout(() => {
                console.error('[Layer2-Math] Worker timeout');
                this.pendingReject = null;
                this.pendingResolve = null;
                reject(new Error('Worker analysis timeout'));
            }, WORKER_TIMEOUT);

            // Transfer image data to worker (transferable object)
            const dataBuffer = imageData.data.buffer.slice(0);

            this.worker.postMessage({
                type: 'analyze',
                imageData: new Uint8ClampedArray(dataBuffer),
                width: imageData.width,
                height: imageData.height
            }, [dataBuffer]);
        });
    }

    /**
     * Handle result from worker
     * @param {Object} data
     */
    _handleResult(data) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        if (this.pendingResolve) {
            this.pendingResolve(data);
            this.pendingResolve = null;
            this.pendingReject = null;
        }
    }

    /**
     * Handle error from worker
     * @param {Error} error
     */
    _handleError(error) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        if (this.pendingReject) {
            this.pendingReject(error);
            this.pendingResolve = null;
            this.pendingReject = null;
        }
    }

    /**
     * Create empty result for error cases
     * @param {number} processingTime
     * @returns {Object}
     */
    _createEmptyResult(processingTime) {
        return {
            score: 0,
            frequencyStats: {
                ganArtifacts: false,
                diffusionSignature: false,
                spectralSlope: 0,
                slopeAnomaly: false
            },
            noiseStats: {
                prnuCorrelation: 0,
                prnuAbsent: false,
                uniformityCV: 0,
                tooUniform: false
            },
            artifacts: [],
            layer: 'mathematical',
            processingTime: processingTime
        };
    }

    /**
     * Clean up worker resources
     */
    terminate() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.workerReady = false;
            console.log('[Layer2-Math] Worker terminated');
        }
    }
}
