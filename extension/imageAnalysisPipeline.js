/**
 * Image Analysis Pipeline
 * Orchestrates all detection layers for the UnReal Chrome extension
 * 
 * LAYER WEIGHTS:
 * - Layer 0: Metadata (+0 to +30 bonus points, additive)
 * - Layer 1: Forensic (45% of base score)
 * - Layer 2: Mathematical (40% of base score)
 * - Layer 3: CNN (15% - NOT YET IMPLEMENTED)
 * - Layer 4: Gemini (validation only, when score 40-80%)
 */

import { MetadataAnalyzer } from './layer0-metadata.js';
import { ForensicAnalyzer } from './layer1-forensic.js';
import { MathematicalAnalyzer } from './layer2-mathematical.js';
import { GeminiValidator } from './layer4-gemini.js';

// Layer weights for score calculation
const WEIGHTS = {
    layer1: 0.45,  // Forensic
    layer2: 0.40,  // Mathematical
    layer3: 0.15,  // CNN (placeholder)
    layer4: 0.15   // Gemini (replaces layer3 when unavailable)
};

// Risk level thresholds
const RISK_THRESHOLDS = {
    low: 40,
    high: 70
};

export class ImageAnalysisPipeline {
    constructor() {
        this.layer0 = new MetadataAnalyzer();
        this.layer1 = new ForensicAnalyzer();
        this.layer2 = new MathematicalAnalyzer();
        this.layer4 = new GeminiValidator();

        this.layer3Available = false;  // Placeholder for future CNN integration
        this.initialized = false;

        console.log('[Pipeline] ImageAnalysisPipeline created');
    }

    /**
     * Initialize async components (Web Worker, etc.)
     */
    async initialize() {
        if (this.initialized) return;

        try {
            await this.layer2.initialize();
            this.initialized = true;
            console.log('[Pipeline] Initialized successfully');
        } catch (error) {
            console.error('[Pipeline] Initialization error:', error);
            // Continue anyway - layer2 will handle its own errors
        }
    }

    /**
     * Main analysis entry point
     * @param {HTMLImageElement} imageElement - The image to analyze
     * @returns {Promise<Object>} Comprehensive analysis result
     */
    async analyze(imageElement) {
        const startTime = performance.now();
        console.log('[Pipeline] Starting image analysis...');

        // Ensure initialization
        if (!this.initialized) {
            await this.initialize();
        }

        const results = {
            layer0: null,
            layer1: null,
            layer2: null,
            layer3: { available: false, note: 'CNN layer not yet implemented' },
            layer4: null
        };

        const allArtifacts = [];

        try {
            // ========== LAYER 0: Metadata (instant) ==========
            try {
                results.layer0 = this.layer0.analyze(imageElement);
                console.log(`[Pipeline] Layer 0 complete: +${results.layer0.score} points`);

                // Add artifacts with layer tag
                results.layer0.signals.forEach(signal => {
                    allArtifacts.push({
                        ...signal,
                        layer: 'metadata'
                    });
                });
            } catch (error) {
                console.error('[Pipeline] Layer 0 error:', error);
                results.layer0 = { score: 0, signals: [], processingTime: 0 };
            }

            // ========== LAYER 1: Forensic (~500ms) ==========
            try {
                results.layer1 = await this.layer1.analyze(imageElement);
                console.log(`[Pipeline] Layer 1 complete: ${results.layer1.score}%`);

                // Add issues as artifacts
                results.layer1.issues.forEach(issue => {
                    allArtifacts.push({
                        ...issue,
                        layer: 'forensic'
                    });
                });
            } catch (error) {
                console.error('[Pipeline] Layer 1 error:', error);
                results.layer1 = { score: 0, issues: [], details: {}, processingTime: 0 };
            }

            // ========== LAYER 2: Mathematical (Web Worker, ~1000ms) ==========
            try {
                results.layer2 = await this.layer2.analyze(imageElement);
                console.log(`[Pipeline] Layer 2 complete: ${results.layer2.score}%`);

                // Add artifacts
                (results.layer2.artifacts || []).forEach(artifact => {
                    allArtifacts.push({
                        ...artifact,
                        layer: 'mathematical'
                    });
                });
            } catch (error) {
                console.error('[Pipeline] Layer 2 error:', error);
                results.layer2 = {
                    score: 0,
                    frequencyStats: {},
                    noiseStats: {},
                    artifacts: [],
                    processingTime: 0
                };
            }

            // ========== Calculate Preliminary Score ==========
            const preliminaryScore = this._calculatePreliminaryScore(
                results.layer0,
                results.layer1,
                results.layer2
            );
            console.log(`[Pipeline] Preliminary score: ${preliminaryScore}%`);

            // ========== LAYER 3: CNN (SKIPPED - Not Implemented) ==========
            // Placeholder for future implementation
            console.log('[Pipeline] Layer 3 (CNN): Skipped - not yet implemented');

            // ========== LAYER 4: Gemini (only if 40 <= preliminary <= 80) ==========
            try {
                if (this.layer4.shouldRun(preliminaryScore)) {
                    console.log('[Pipeline] Layer 4: Triggered (uncertain range)');
                    results.layer4 = await this.layer4.validate(
                        imageElement,
                        preliminaryScore,
                        allArtifacts
                    );

                    // Add Gemini artifacts
                    (results.layer4.artifacts || []).forEach(artifact => {
                        allArtifacts.push({
                            ...artifact,
                            layer: 'gemini'
                        });
                    });
                } else {
                    console.log('[Pipeline] Layer 4: Skipped (score outside 40-80 range)');
                    results.layer4 = {
                        confidence: 0,
                        skipped: true,
                        skipReason: preliminaryScore < 40
                            ? 'Score below threshold - high confidence human'
                            : 'Score above threshold - high confidence AI',
                        artifacts: [],
                        processingTime: 0
                    };
                }
            } catch (error) {
                console.error('[Pipeline] Layer 4 error:', error);
                results.layer4 = {
                    confidence: 0,
                    skipped: false,
                    error: error.message,
                    artifacts: [],
                    processingTime: 0
                };
            }

            // ========== Calculate Final Result ==========
            const finalResult = this._calculateFinalResult(results, preliminaryScore, allArtifacts);

            const totalTime = performance.now() - startTime;
            finalResult.processingTime = {
                total: Math.round(totalTime),
                layer0: results.layer0.processingTime || 0,
                layer1: results.layer1.processingTime || 0,
                layer2: results.layer2.processingTime || 0,
                layer4: results.layer4.processingTime || 0
            };

            console.log(`[Pipeline] Final: ${finalResult.finalScore}% (${finalResult.riskLevel}) in ${Math.round(totalTime)}ms`);

            return finalResult;

        } catch (error) {
            console.error('[Pipeline] Critical error:', error);
            return this._errorResult(error, performance.now() - startTime);
        }
    }

    /**
     * Calculate preliminary score from layers 0-2
     * Layer 0 is additive bonus, layers 1-2 are weighted
     */
    _calculatePreliminaryScore(layer0, layer1, layer2) {
        // Layer 0 bonus (0-30 points)
        const bonus = layer0?.score || 0;

        // Weighted base score from layers 1-2
        // Since layer 3 is not available, redistribute weights: 53% layer1, 47% layer2
        const layer1Score = layer1?.score || 0;
        const layer2Score = layer2?.score || 0;

        const baseScore = (layer1Score * 0.53) + (layer2Score * 0.47);

        // Combined score (cap at 100)
        return Math.min(100, Math.round(bonus + baseScore));
    }

    /**
     * Calculate final result incorporating all layers
     */
    _calculateFinalResult(layers, preliminaryScore, allArtifacts) {
        let finalScore = preliminaryScore;

        // If Gemini ran and provided a confidence score, factor it in
        if (layers.layer4 && !layers.layer4.skipped && layers.layer4.confidence > 0) {
            // Blend Gemini confidence with preliminary score
            // Give Gemini 30% influence when it runs
            const geminiInfluence = 0.30;
            finalScore = Math.round(
                (preliminaryScore * (1 - geminiInfluence)) +
                (layers.layer4.confidence * geminiInfluence)
            );
        }

        // Ensure score is within bounds
        finalScore = Math.max(0, Math.min(100, finalScore));

        const riskLevel = this._determineRiskLevel(finalScore);
        const reasoning = this._generateReasoning(layers, finalScore, riskLevel);

        return {
            finalScore: finalScore,
            riskLevel: riskLevel,
            isAIGenerated: finalScore >= 50,
            allArtifacts: allArtifacts,
            reasoning: reasoning,
            layers: {
                layer0: {
                    score: layers.layer0?.score || 0,
                    signals: layers.layer0?.signals || [],
                    processingTime: layers.layer0?.processingTime || 0
                },
                layer1: {
                    score: layers.layer1?.score || 0,
                    issues: layers.layer1?.issues || [],
                    details: layers.layer1?.details || {},
                    processingTime: layers.layer1?.processingTime || 0
                },
                layer2: {
                    score: layers.layer2?.score || 0,
                    frequencyStats: layers.layer2?.frequencyStats || {},
                    noiseStats: layers.layer2?.noiseStats || {},
                    artifacts: layers.layer2?.artifacts || [],
                    processingTime: layers.layer2?.processingTime || 0
                },
                layer3: {
                    available: false,
                    note: 'CNN layer not yet implemented'
                },
                layer4: {
                    confidence: layers.layer4?.confidence || 0,
                    reasoning: layers.layer4?.reasoning || null,
                    skipped: layers.layer4?.skipped || false,
                    skipReason: layers.layer4?.skipReason || null,
                    artifacts: layers.layer4?.artifacts || [],
                    verifiedFindings: layers.layer4?.verifiedFindings || [],
                    refutedFindings: layers.layer4?.refutedFindings || [],
                    newFindings: layers.layer4?.newFindings || [],
                    processingTime: layers.layer4?.processingTime || 0
                }
            }
        };
    }

    /**
     * Determine risk level based on final score
     */
    _determineRiskLevel(score) {
        if (score < RISK_THRESHOLDS.low) {
            return 'low';
        } else if (score > RISK_THRESHOLDS.high) {
            return 'high';
        }
        return 'medium';
    }

    /**
     * Generate human-readable reasoning from layer results
     */
    _generateReasoning(layers, finalScore, riskLevel) {
        const parts = [];

        // Overall assessment
        if (riskLevel === 'high') {
            parts.push(`High likelihood of AI generation (${finalScore}% confidence).`);
        } else if (riskLevel === 'medium') {
            parts.push(`Uncertain origin - requires careful review (${finalScore}% score).`);
        } else {
            parts.push(`Low likelihood of AI generation (${finalScore}% score).`);
        }

        // Layer 0 findings
        if (layers.layer0?.score > 0) {
            const signals = layers.layer0.signals || [];
            if (signals.length > 0) {
                const types = signals.map(s => s.type).join(', ');
                parts.push(`Metadata signals detected: ${types}.`);
            }
        }

        // Layer 1 findings
        if (layers.layer1?.score > 30) {
            const issueCount = layers.layer1.issues?.length || 0;
            if (issueCount > 0) {
                parts.push(`Forensic analysis found ${issueCount} visual anomalies.`);
            }
        }

        // Layer 2 findings
        if (layers.layer2?.score > 30) {
            const stats = [];
            if (layers.layer2.frequencyStats?.ganArtifacts) stats.push('GAN artifacts');
            if (layers.layer2.frequencyStats?.diffusionSignature) stats.push('diffusion signature');
            if (layers.layer2.noiseStats?.prnuAbsent) stats.push('missing camera fingerprint');

            if (stats.length > 0) {
                parts.push(`Mathematical analysis detected: ${stats.join(', ')}.`);
            }
        }

        // Layer 4 findings
        if (layers.layer4 && !layers.layer4.skipped && layers.layer4.reasoning) {
            parts.push(`AI validation: ${layers.layer4.reasoning}`);
        }

        return parts.join(' ');
    }

    /**
     * Create error result when pipeline fails
     */
    _errorResult(error, processingTime) {
        return {
            finalScore: 0,
            riskLevel: 'low',
            isAIGenerated: false,
            allArtifacts: [],
            reasoning: `Analysis failed: ${error.message}`,
            error: error.message,
            layers: {
                layer0: { score: 0, signals: [], processingTime: 0 },
                layer1: { score: 0, issues: [], details: {}, processingTime: 0 },
                layer2: { score: 0, frequencyStats: {}, noiseStats: {}, artifacts: [], processingTime: 0 },
                layer3: { available: false, note: 'CNN layer not yet implemented' },
                layer4: { confidence: 0, skipped: true, artifacts: [], processingTime: 0 }
            },
            processingTime: {
                total: Math.round(processingTime),
                layer0: 0,
                layer1: 0,
                layer2: 0,
                layer4: 0
            }
        };
    }

    /**
     * Clean up resources (Web Worker, etc.)
     */
    terminate() {
        if (this.layer2) {
            this.layer2.terminate();
        }
        console.log('[Pipeline] Terminated');
    }
}

// Convenience function for one-off analysis
export async function analyzeImage(imageElement) {
    const pipeline = new ImageAnalysisPipeline();
    try {
        return await pipeline.analyze(imageElement);
    } finally {
        pipeline.terminate();
    }
}

console.log('[Pipeline] Module loaded');
