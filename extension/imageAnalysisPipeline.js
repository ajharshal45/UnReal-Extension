/**
 * Image Analysis Pipeline v2.1 - Improved Accuracy
 * Orchestrates all detection layers for the UnReal Chrome extension
 * 
 * CHANGES:
 * - Added detailed diagnostic logging
 * - Adjusted layer weights for better differentiation
 * - Added confidence-based scoring
 * - Better handling of compressed images
 */

// Layer weights - ADJUSTED for better accuracy
const WEIGHTS = {
  layer1: 0.30,  // Forensic
  layer2: 0.25,  // Mathematical
  layer3: 0.30,  // Local ML (Swin Transformer)
  layer4: 0.15   // Gemini (tie-breaker)
};

// Risk level thresholds - ADJUSTED for fewer false positives
const RISK_THRESHOLDS = {
  low: 40,      // Below this = likely real
  high: 75      // Above this = likely AI
};

// Minimum confidence to trust a layer's result
const MIN_LAYER_CONFIDENCE = 30;

export class ImageAnalysisPipeline {
  constructor() {
    this.layer0 = null;
    this.layer1 = null;
    this.layer2 = null;
    this.layer3 = null;
    this.layer4 = null;

    this.layer3Available = false;
    this.initialized = false;
    this.initializing = null;

    console.log('[Pipeline] ImageAnalysisPipeline v2.1 created');
  }

  async initialize() {
    if (this.initializing) {
      return this.initializing;
    }

    if (this.initialized) {
      return;
    }

    this.initializing = (async () => {
      try {
        console.log('[Pipeline] Loading layer modules...');

        const [layer0Module, layer1Module, layer2Module, layer4Module] = await Promise.all([
          import(chrome.runtime.getURL('layer0-metadata.js')),
          import(chrome.runtime.getURL('layer1-forensic.js')),
          import(chrome.runtime.getURL('layer2-mathematical.js')),
          import(chrome.runtime.getURL('layer4-gemini.js'))
        ]);

        this.layer0 = new layer0Module.MetadataAnalyzer();
        this.layer1 = new layer1Module.ForensicAnalyzer();
        this.layer2 = new layer2Module.MathematicalAnalyzer();
        this.layer4 = new layer4Module.GeminiValidator();

        await this.layer2.initialize();
        await this.layer4.initialize();

        // Try to load Layer 3 (Local ML)
        try {
          console.log('[Pipeline] Loading Layer 3 (Local ML)...');
          const layer3Module = await import(chrome.runtime.getURL('layer3-local-ml.js'));
          this.layer3 = new layer3Module.LocalMLAnalyzer();
          const mlReady = await this.layer3.initialize();
          this.layer3Available = mlReady;
          console.log('[Pipeline] Layer 3 available:', mlReady);
        } catch (error) {
          console.warn('[Pipeline] Layer 3 not available:', error.message);
          this.layer3 = null;
          this.layer3Available = false;
        }

        this.initialized = true;
        console.log('[Pipeline] All layers loaded successfully');

      } catch (error) {
        console.error('[Pipeline] Failed to load layers:', error);
        this.initializing = null;
        throw error;
      }
    })();

    return this.initializing;
  }

  async analyze(imageElement) {
    const startTime = performance.now();
    console.log('[Pipeline] ═══════════════════════════════════════════');
    console.log('[Pipeline] Starting image analysis...');

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
    let diagnostics = {
      layer0: {},
      layer1: {},
      layer2: {},
      layer3: {},
      layer4: {}
    };

    try {
      // ========== LAYER 0: Metadata (instant) ==========
      try {
        results.layer0 = this.layer0.analyze(imageElement);
        diagnostics.layer0 = {
          score: results.layer0.score,
          signals: results.layer0.signals.length,
          details: results.layer0.signals.map(s => s.type + ': ' + s.matched)
        };
        console.log(`[Pipeline] Layer 0 (Metadata): +${results.layer0.score} points`, diagnostics.layer0.details);

        results.layer0.signals.forEach(signal => {
          allArtifacts.push({ ...signal, layer: 'metadata' });
        });
      } catch (error) {
        console.error('[Pipeline] Layer 0 error:', error);
        results.layer0 = { score: 0, signals: [], processingTime: 0 };
      }

      // ========== LAYER 1: Forensic ==========
      try {
        results.layer1 = await this.layer1.analyze(imageElement);
        diagnostics.layer1 = {
          score: results.layer1.score,
          issueCount: results.layer1.issues?.length || 0,
          texture: results.layer1.details?.texture?.score || 0,
          lighting: results.layer1.details?.lighting?.score || 0,
          edges: results.layer1.details?.edges?.score || 0,
          blur: results.layer1.details?.blur?.score || 0,
          background: results.layer1.details?.background?.score || 0
        };
        console.log(`[Pipeline] Layer 1 (Forensic): ${results.layer1.score}%`, diagnostics.layer1);

        results.layer1.issues.forEach(issue => {
          allArtifacts.push({ ...issue, layer: 'forensic' });
        });
      } catch (error) {
        console.error('[Pipeline] Layer 1 error:', error);
        results.layer1 = { score: 0, issues: [], details: {}, processingTime: 0 };
      }

      // ========== LAYER 2: Mathematical ==========
      try {
        results.layer2 = await this.layer2.analyze(imageElement);
        diagnostics.layer2 = {
          score: results.layer2.score,
          artifactCount: results.layer2.artifacts?.length || 0,
          ganArtifacts: results.layer2.frequencyStats?.ganArtifacts || false,
          diffusionSignature: results.layer2.frequencyStats?.diffusionSignature || false,
          spectralSlope: results.layer2.frequencyStats?.spectralSlope?.toFixed(2) || 'N/A',
          prnuAbsent: results.layer2.noiseStats?.prnuAbsent || false,
          tooUniform: results.layer2.noiseStats?.tooUniform || false
        };
        console.log(`[Pipeline] Layer 2 (Mathematical): ${results.layer2.score}%`, diagnostics.layer2);

        (results.layer2.artifacts || []).forEach(artifact => {
          allArtifacts.push({ ...artifact, layer: 'mathematical' });
        });
      } catch (error) {
        console.error('[Pipeline] Layer 2 error:', error);
        results.layer2 = { score: 0, frequencyStats: {}, noiseStats: {}, artifacts: [], processingTime: 0 };
      }

      // ========== LAYER 3: Local ML (Swin Transformer) ==========
      let layer3Result = { score: 0, confidence: 0, available: false, artifacts: [], processingTime: 0 };
      if (this.layer3Available && this.layer3) {
        try {
          console.log('[Pipeline] Running Layer 3 (Local ML)...');
          layer3Result = await this.layer3.analyze(imageElement);
          results.layer3 = layer3Result;
          diagnostics.layer3 = {
            score: layer3Result.score,
            confidence: layer3Result.confidence,
            realScore: layer3Result.realScore,
            fakeScore: layer3Result.fakeScore,
            available: layer3Result.available
          };
          console.log(`[Pipeline] Layer 3 (Local ML): ${layer3Result.score}%`, diagnostics.layer3);

          (layer3Result.artifacts || []).forEach(artifact => {
            allArtifacts.push({ ...artifact, layer: 'local-ml' });
          });
        } catch (error) {
          console.warn('[Pipeline] Layer 3 error:', error.message);
          results.layer3 = { score: 0, confidence: 0, available: false, artifacts: [], processingTime: 0, error: error.message };
        }
      } else {
        console.log('[Pipeline] Layer 3: Not available (model not loaded)');
        results.layer3 = { score: 0, confidence: 0, available: false, note: 'Model not loaded', artifacts: [], processingTime: 0 };
      }

      // ========== Calculate Preliminary Score ==========
      const preliminaryScore = this._calculatePreliminaryScore(results.layer0, results.layer1, results.layer2, layer3Result);

      console.log('[Pipeline] ───────────────────────────────────────────');
      console.log(`[Pipeline] Preliminary score: ${preliminaryScore}%`);
      console.log('[Pipeline]   Layer 0 bonus: +' + (results.layer0?.score || 0));
      console.log('[Pipeline]   Layer 1 (30%): ' + (results.layer1?.score || 0) + ' → ' + Math.round((results.layer1?.score || 0) * 0.30));
      console.log('[Pipeline]   Layer 2 (25%): ' + (results.layer2?.score || 0) + ' → ' + Math.round((results.layer2?.score || 0) * 0.25));
      console.log('[Pipeline]   Layer 3 (30%): ' + (layer3Result?.score || 0) + ' → ' + Math.round((layer3Result?.score || 0) * 0.30) + (layer3Result?.available ? '' : ' (unavailable)'));

      // ========== LAYER 4: Gemini (if uncertain) ==========
      const shouldUseGemini = this.layer4.shouldRun(preliminaryScore);

      if (shouldUseGemini) {
        console.log('[Pipeline] Layer 4: Triggered (uncertain range 40-80%)');
        try {
          results.layer4 = await this.layer4.validate(imageElement, preliminaryScore, allArtifacts);

          if (results.layer4 && !results.layer4.skipped) {
            diagnostics.layer4 = {
              confidence: results.layer4.confidence,
              isAIGenerated: results.layer4.isAIGenerated,
              reasoning: results.layer4.reasoning
            };
            console.log(`[Pipeline] Layer 4 (Gemini): ${results.layer4.confidence}%`, diagnostics.layer4);

            (results.layer4.artifacts || []).forEach(artifact => {
              allArtifacts.push({ ...artifact, layer: 'gemini' });
            });
          }
        } catch (error) {
          console.error('[Pipeline] Layer 4 error:', error);
          results.layer4 = { confidence: 0, skipped: true, error: error.message, artifacts: [], processingTime: 0 };
        }
      } else {
        console.log(`[Pipeline] Layer 4: Skipped (score ${preliminaryScore}% outside 40-80%)`);
        results.layer4 = {
          confidence: 0,
          skipped: true,
          skipReason: preliminaryScore < 40 ? 'Score below threshold' : 'Score above threshold',
          artifacts: [],
          processingTime: 0
        };
      }

      // ========== Calculate Final Result ==========
      const finalResult = this._calculateFinalResult(results, preliminaryScore, allArtifacts, diagnostics);

      const totalTime = performance.now() - startTime;
      finalResult.processingTime = {
        total: Math.round(totalTime),
        layer0: results.layer0.processingTime || 0,
        layer1: results.layer1.processingTime || 0,
        layer2: results.layer2.processingTime || 0,
        layer3: results.layer3?.processingTime || 0,
        layer4: results.layer4?.processingTime || 0
      };
      finalResult.diagnostics = diagnostics;

      console.log('[Pipeline] ───────────────────────────────────────────');
      console.log(`[Pipeline] FINAL SCORE: ${finalResult.finalScore}% (${finalResult.riskLevel.toUpperCase()})`);
      console.log(`[Pipeline] Is AI Generated: ${finalResult.isAIGenerated}`);
      console.log(`[Pipeline] Artifacts found: ${allArtifacts.length}`);
      console.log(`[Pipeline] Processing time: ${Math.round(totalTime)}ms`);
      console.log('[Pipeline] ═══════════════════════════════════════════');

      return finalResult;

    } catch (error) {
      console.error('[Pipeline] Critical error:', error);
      return this._errorResult(error, performance.now() - startTime);
    }
  }

  _calculatePreliminaryScore(layer0, layer1, layer2, layer3Result) {
    // Layer 0 bonus (0-30 points) - only if strong signals
    const bonus = (layer0?.score >= 10) ? layer0.score : 0;

    // Get individual scores
    const layer1Score = layer1?.score || 0;
    const layer2Score = layer2?.score || 0;
    const layer3Score = layer3Result?.score || 0;
    const layer3Available = layer3Result?.available || false;

    // Apply weights
    let weightedSum = 0;
    let totalWeight = 0;

    // Layer 1 (Forensic)
    weightedSum += layer1Score * WEIGHTS.layer1;
    totalWeight += WEIGHTS.layer1;

    // Layer 2 (Mathematical)
    weightedSum += layer2Score * WEIGHTS.layer2;
    totalWeight += WEIGHTS.layer2;

    // Layer 3 (Local ML) - only if available
    if (layer3Available && layer3Score > 0) {
      weightedSum += layer3Score * WEIGHTS.layer3;
      totalWeight += WEIGHTS.layer3;
    }

    // Normalize score (excluding layer4 which is applied later)
    const maxPossibleWeight = WEIGHTS.layer1 + WEIGHTS.layer2 + (layer3Available ? WEIGHTS.layer3 : 0);
    const normalizedScore = totalWeight > 0 ? (weightedSum / totalWeight) * (maxPossibleWeight / 0.85) : 0;

    // Add metadata bonus
    const totalScore = normalizedScore + bonus;

    // Apply confidence adjustment
    // If layers strongly agree, boost confidence
    const scores = [layer1Score, layer2Score];
    if (layer3Available) scores.push(layer3Score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
    const agreement = 1 - Math.min(1, Math.sqrt(variance) / 50);

    const adjustedScore = totalScore * (0.8 + agreement * 0.2);

    return Math.min(100, Math.max(0, Math.round(adjustedScore)));
  }

  _calculateFinalResult(layers, preliminaryScore, allArtifacts, diagnostics) {
    let finalScore = preliminaryScore;
    let logicTrail = [];

    // Get Layer 3 (ML) score for disagreement detection
    const mlScore = layers.layer3?.score || 0;
    const mlAvailable = layers.layer3?.available || false;

    // Step 1: Dampen weak ML scores to reduce false positives from compression noise
    if (mlAvailable && mlScore > 0 && mlScore < 75) {
      // Weak ML signal - dampen its contribution to preliminary score
      const dampeningFactor = mlScore / 100; // 50% score = 0.5 factor
      const mlContribution = mlScore * 0.30; // What ML added to preliminary
      const dampenedContribution = mlContribution * dampeningFactor;
      const reduction = mlContribution - dampenedContribution;
      finalScore = Math.max(0, finalScore - reduction);
      logicTrail.push(`ML dampened (-${Math.round(reduction)}pts, weak ${mlScore}% signal)`);
      console.log(`[Pipeline] ML dampening: score ${mlScore}% is weak, reducing contribution by ${Math.round(reduction)}pts`);
    }

    // Step 2: Apply Gemini's verdict with veto power
    if (layers.layer4 && !layers.layer4.skipped && layers.layer4.confidence > 0) {
      const geminiConfidence = layers.layer4.confidence;
      const geminiSaysAI = layers.layer4.isAIGenerated;

      // Check for ML/Gemini disagreement
      const mlSaysAI = mlScore >= 60;
      const disagreement = mlAvailable && (mlSaysAI !== geminiSaysAI);

      if (geminiConfidence >= 80) {
        // HIGH CONFIDENCE GEMINI - Apply strong influence

        if (geminiSaysAI) {
          // Gemini says AI with high confidence - BOOST score
          const boost = Math.round((geminiConfidence - 50) * 0.6);
          finalScore = Math.min(100, finalScore + boost);
          logicTrail.push(`Gemini boost (+${boost}pts, AI@${geminiConfidence}%)`);
          console.log(`[Pipeline] Gemini BOOST: +${boost}pts (says AI with ${geminiConfidence}% confidence)`);

        } else {
          // Gemini says REAL with high confidence - VETO (strong penalty)
          const penalty = Math.round(geminiConfidence * 0.5);
          const preVetoScore = finalScore;
          finalScore = Math.max(5, finalScore - penalty);

          // If ML strongly disagreed, note it but still apply veto
          if (disagreement && mlScore >= 70) {
            logicTrail.push(`Gemini VETO (-${penalty}pts, Real@${geminiConfidence}%) [ML disagreed: ${mlScore}%]`);
            console.log(`[Pipeline] Gemini VETO (with ML disagreement): ${preVetoScore}% → ${finalScore}% (ML said ${mlScore}%)`);
          } else {
            logicTrail.push(`Gemini VETO (-${penalty}pts, Real@${geminiConfidence}%)`);
            console.log(`[Pipeline] Gemini VETO: ${preVetoScore}% → ${finalScore}% (says Real with ${geminiConfidence}% confidence)`);
          }
        }

      } else {
        // MEDIUM CONFIDENCE GEMINI - Apply moderate influence
        const weight = 0.35;
        const targetScore = geminiSaysAI ?
          Math.max(65, geminiConfidence) :
          Math.min(40, 100 - geminiConfidence);

        const oldScore = finalScore;
        finalScore = Math.round(finalScore * (1 - weight) + targetScore * weight);
        logicTrail.push(`Gemini adjust (${geminiSaysAI ? 'AI' : 'Real'}@${geminiConfidence}%, ${oldScore}→${finalScore})`);
        console.log(`[Pipeline] Gemini adjustment: ${oldScore}% → ${finalScore}% (${geminiSaysAI ? 'AI' : 'Real'} at ${geminiConfidence}%)`);
      }
    }

    // Step 3: Apply artifact boost - only for very strong signals
    const significantArtifacts = allArtifacts.filter(a => a.confidence >= 80);
    if (significantArtifacts.length >= 6) {
      const boost = Math.min(6, significantArtifacts.length);
      finalScore = Math.min(100, finalScore + boost);
      logicTrail.push(`Artifact boost (+${boost}pts)`);
      console.log(`[Pipeline] Artifact boost: +${boost} (${significantArtifacts.length} high-confidence artifacts)`);
    }

    // Ensure score is within bounds
    finalScore = Math.max(0, Math.min(100, finalScore));

    const riskLevel = this._determineRiskLevel(finalScore);

    // Add logic trail to reasoning
    const baseReasoning = this._generateReasoning(layers, finalScore, riskLevel, diagnostics);
    const reasoning = baseReasoning + (logicTrail.length > 0 ? ` [Logic: ${logicTrail.join(' → ')}]` : '');

    return {
      finalScore: finalScore,
      riskLevel: riskLevel,
      isAIGenerated: finalScore >= 65,
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
          score: layers.layer3?.score || 0,
          confidence: layers.layer3?.confidence || 0,
          realScore: layers.layer3?.realScore || 0,
          fakeScore: layers.layer3?.fakeScore || 0,
          available: layers.layer3?.available || false,
          artifacts: layers.layer3?.artifacts || [],
          processingTime: layers.layer3?.processingTime || 0,
          error: layers.layer3?.error || null
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

  _determineRiskLevel(score) {
    if (score < RISK_THRESHOLDS.low) {
      return 'low';
    } else if (score >= RISK_THRESHOLDS.high) {
      return 'high';
    }
    return 'medium';
  }

  _generateReasoning(layers, finalScore, riskLevel, diagnostics) {
    const parts = [];

    // Overall assessment
    if (riskLevel === 'high') {
      parts.push(`High likelihood of AI generation (${finalScore}% confidence).`);
    } else if (riskLevel === 'medium') {
      parts.push(`Uncertain origin - mixed signals detected (${finalScore}% score).`);
    } else {
      parts.push(`Likely authentic - minimal AI indicators (${finalScore}% score).`);
    }

    // Key findings
    const findings = [];

    // Layer 0 findings
    if (layers.layer0?.score >= 10) {
      findings.push('AI platform metadata detected');
    }

    // Layer 1 findings
    if (diagnostics.layer1?.texture > 40) findings.push('unnatural texture smoothness');
    if (diagnostics.layer1?.lighting > 40) findings.push('inconsistent lighting');
    if (diagnostics.layer1?.edges > 40) findings.push('unusual edge patterns');

    // Layer 2 findings
    if (diagnostics.layer2?.ganArtifacts) findings.push('GAN artifacts in frequency domain');
    if (diagnostics.layer2?.diffusionSignature) findings.push('diffusion model signature');
    if (diagnostics.layer2?.prnuAbsent) findings.push('missing camera fingerprint');

    // Layer 3 findings (ML)
    if (diagnostics.layer3?.available && diagnostics.layer3?.score > 70) {
      findings.push('neural network detected AI patterns');
    } else if (diagnostics.layer3?.available && diagnostics.layer3?.score < 30) {
      findings.push('neural network indicates authentic image');
    }

    if (findings.length > 0) {
      parts.push(`Key signals: ${findings.slice(0, 4).join(', ')}.`);
    }

    // Gemini finding if available
    if (layers.layer4?.reasoning && !layers.layer4.skipped) {
      parts.push(`AI validation: ${layers.layer4.reasoning}`);
    }

    return parts.join(' ');
  }

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
        layer3: { score: 0, confidence: 0, available: false, artifacts: [], processingTime: 0 },
        layer4: { confidence: 0, skipped: true, artifacts: [], processingTime: 0 }
      },
      processingTime: {
        total: Math.round(processingTime),
        layer0: 0,
        layer1: 0,
        layer2: 0,
        layer3: 0,
        layer4: 0
      }
    };
  }

  terminate() {
    if (this.layer2) {
      this.layer2.terminate();
    }
    if (this.layer3) {
      this.layer3.dispose();
    }
    console.log('[Pipeline] Terminated');
  }
}

export async function analyzeImage(imageElement) {
  const pipeline = new ImageAnalysisPipeline();
  try {
    await pipeline.initialize();
    return await pipeline.analyze(imageElement);
  } finally {
    pipeline.terminate();
  }
}

console.log('[Pipeline] Module loaded v2.1 - Improved accuracy');