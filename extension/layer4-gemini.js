// layer4-gemini.js - Refactored as Layer 4 (Gemini Validation Only)

/**
 * Layer 4: Gemini Validation
 * Only runs when preliminary score is 40-80% (uncertain range)
 * Validates findings from earlier layers and provides semantic analysis
 * 
 * CAPABILITIES (semantic analysis that earlier layers cannot do):
 * ✅ Anatomical problems (finger count, impossible poses)
 * ✅ Text/symbol anomalies (gibberish, distorted letters)
 * ✅ Eye anomalies (mismatched iris, dead appearance)
 * ✅ Physics violations (impossible shadows, perspective issues)
 * ✅ Verification of automated findings from Layers 0-2
 */

export class GeminiValidator {
    constructor() {
        this.minScore = 40;
        this.maxScore = 80;
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

        console.log('[Layer4-Gemini] GeminiValidator initialized (40-80% range)');
    }

    /**
     * Check if validation should run based on preliminary score
     * @param {number} preliminaryScore - Score from layers 0-2
     * @returns {boolean}
     */
    shouldRun(preliminaryScore) {
        return preliminaryScore >= this.minScore && preliminaryScore <= this.maxScore;
    }

    /**
     * Main validation entry point
     * @param {HTMLImageElement} imageElement - The image to validate
     * @param {number} preliminaryScore - Combined score from earlier layers
     * @param {Array} previousArtifacts - Artifacts detected by earlier layers
     * @returns {Promise<Object>} Validation result
     */
    async validate(imageElement, preliminaryScore, previousArtifacts = []) {
        const startTime = performance.now();

        // Skip if score is outside validation range
        if (!this.shouldRun(preliminaryScore)) {
            return this._skipResult(preliminaryScore);
        }

        console.log('[Layer4-Gemini] Running validation for score:', preliminaryScore);

        try {
            // Call Gemini with enhanced prompt
            const geminiResult = await this._callGemini(imageElement, previousArtifacts);

            // Process and return validation result
            return this._processGeminiResult(geminiResult, performance.now() - startTime);

        } catch (error) {
            console.error('[Layer4-Gemini] Validation error:', error);
            return this._errorResult(error.message);
        }
    }

    /**
     * Call Gemini Vision API with enhanced prompt
     * @param {HTMLImageElement} imageElement
     * @param {Array} previousArtifacts
     * @returns {Promise<Object>}
     */
    async _callGemini(imageElement, previousArtifacts) {
        try {
            // Convert image to base64
            const base64Image = await this._imageToBase64(imageElement);

            // Build enhanced prompt with previous findings
            const prompt = this._buildEnhancedPrompt(previousArtifacts);

            // Send to background script for API call
            const response = await chrome.runtime.sendMessage({
                action: 'analyzeImageWithGemini',
                imageBase64: base64Image,
                prompt: prompt
            });

            if (response.error) {
                throw new Error(response.error);
            }

            return response;
        } catch (error) {
            console.error('[Layer4-Gemini] Gemini API error:', error);
            throw error;
        }
    }

    /**
     * Build enhanced prompt that includes findings from earlier layers
     * @param {Array} previousArtifacts
     * @returns {string}
     */
    _buildEnhancedPrompt(previousArtifacts) {
        const artifactSummary = previousArtifacts.length > 0
            ? previousArtifacts.map(a => `- [${a.type}] ${a.description}`).join('\n')
            : '- No significant artifacts detected by automated analysis';

        return `You are an expert AI image forensics validator. Your task is to provide semantic validation of automated detection results.

AUTOMATED FINDINGS FROM EARLIER ANALYSIS:
${artifactSummary}

YOUR VALIDATION TASKS:
1. VERIFY the automated findings listed above - confirm or refute each one
2. CHECK FOR SEMANTIC ISSUES that automated analysis cannot detect:
   
   a) ANATOMICAL PROBLEMS:
      - Hand/finger anomalies (wrong count, merged, impossible poses)
      - Facial asymmetry or uncanny valley effects
      - Body proportion issues
      - Impossible joint positions
   
   b) TEXT AND SYMBOLS:
      - Gibberish or distorted text on signs, clothing, books
      - Malformed letters or numbers
      - Nonsensical writing
      - Distorted logos
   
   c) EYE ANOMALIES:
      - Mismatched iris patterns
      - Unusual or inconsistent reflections
      - "Dead" or lifeless appearance
      - Asymmetric pupils
   
   d) PHYSICS VIOLATIONS:
      - Impossible shadows or reflections
      - Objects defying gravity
      - Inconsistent perspective
      - Lighting that doesn't match

3. PROVIDE CONFIDENCE and clear reasoning

RESPOND IN THIS EXACT JSON FORMAT:
{
  "isAIGenerated": true or false,
  "confidence": 0-100,
  "verifiedFindings": ["list of confirmed automated findings"],
  "refutedFindings": ["list of automated findings you disagree with"],
  "newFindings": [
    {
      "category": "anatomy" | "text" | "eyes" | "physics" | "other",
      "description": "specific issue found",
      "severity": "high" | "medium" | "low"
    }
  ],
  "reasoning": "2-3 sentences explaining your overall conclusion"
}

Be specific and technical in your analysis. If the image appears genuine, explain why the automated findings might be false positives.`;
    }

    /**
     * Convert image element to base64
     * @param {HTMLImageElement} imageElement
     * @returns {Promise<string>}
     */
    async _imageToBase64(imageElement) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Set canvas size to image size (cap at 1024 for API limits)
                const maxSize = 1024;
                let width = imageElement.naturalWidth || imageElement.width;
                let height = imageElement.naturalHeight || imageElement.height;

                if (width > maxSize || height > maxSize) {
                    const scale = Math.min(maxSize / width, maxSize / height);
                    width *= scale;
                    height *= scale;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and convert to base64
                ctx.drawImage(imageElement, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', 0.85);

                // Remove data URL prefix
                const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                resolve(base64Data);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Process Gemini API response
     * @param {Object|string} geminiResponse
     * @param {number} processingTime
     * @returns {Object}
     */
    _processGeminiResult(geminiResponse, processingTime) {
        try {
            // Parse JSON from response (might be wrapped in markdown code blocks)
            let parsedResult;
            if (typeof geminiResponse === 'string') {
                const jsonMatch = geminiResponse.match(/```json\s*([\s\S]*?)\s*```/);
                parsedResult = JSON.parse(jsonMatch ? jsonMatch[1] : geminiResponse);
            } else if (geminiResponse.result) {
                // Handle wrapped response from background script
                const resultText = geminiResponse.result;
                const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
                parsedResult = JSON.parse(jsonMatch ? jsonMatch[1] : resultText);
            } else {
                parsedResult = geminiResponse;
            }

            // Build artifacts array from findings
            const artifacts = [];

            // Add verified findings as semantic confirmations
            (parsedResult.verifiedFindings || []).forEach(finding => {
                artifacts.push({
                    type: 'semantic',
                    subtype: 'verified',
                    description: `Confirmed: ${finding}`,
                    confidence: 80
                });
            });

            // Add new findings
            (parsedResult.newFindings || []).forEach(finding => {
                artifacts.push({
                    type: 'semantic',
                    subtype: finding.category || 'other',
                    description: finding.description,
                    confidence: finding.severity === 'high' ? 90 : finding.severity === 'medium' ? 60 : 40
                });
            });

            console.log(`[Layer4-Gemini] Processed result: isAI=${parsedResult.isAIGenerated}, confidence=${parsedResult.confidence}`);

            return {
                confidence: parsedResult.confidence || 0,
                isAIGenerated: parsedResult.isAIGenerated || false,
                artifacts: artifacts,
                reasoning: parsedResult.reasoning || 'No reasoning provided',
                verifiedFindings: parsedResult.verifiedFindings || [],
                refutedFindings: parsedResult.refutedFindings || [],
                newFindings: parsedResult.newFindings || [],
                layer: 'gemini',
                skipped: false,
                processingTime: Math.round(processingTime)
            };

        } catch (error) {
            console.error('[Layer4-Gemini] Error processing result:', error);
            return this._errorResult('Failed to process Gemini response');
        }
    }

    /**
     * Return skip result when score is outside validation range
     * @param {number} preliminaryScore
     * @returns {Object}
     */
    _skipResult(preliminaryScore) {
        const reason = preliminaryScore < this.minScore
            ? `Score ${preliminaryScore}% is below ${this.minScore}% threshold - high confidence in human origin`
            : `Score ${preliminaryScore}% is above ${this.maxScore}% threshold - high confidence in AI generation`;

        console.log('[Layer4-Gemini] Skipped:', reason);

        return {
            confidence: 0,
            isAIGenerated: false,
            artifacts: [],
            reasoning: null,
            verifiedFindings: [],
            refutedFindings: [],
            newFindings: [],
            layer: 'gemini',
            skipped: true,
            skipReason: reason,
            processingTime: 0
        };
    }

    /**
     * Return error result
     * @param {string} errorMessage
     * @returns {Object}
     */
    _errorResult(errorMessage) {
        return {
            confidence: 0,
            isAIGenerated: false,
            artifacts: [],
            reasoning: null,
            verifiedFindings: [],
            refutedFindings: [],
            newFindings: [],
            layer: 'gemini',
            skipped: false,
            error: errorMessage,
            processingTime: 0
        };
    }
}

/**
 * Legacy function for backward compatibility during transition
 * Can be removed once all code is updated to use the class
 * @deprecated Use GeminiValidator class instead
 */
export async function analyzeImage(imageElement) {
    console.warn('[Layer4-Gemini] analyzeImage() is deprecated. Use GeminiValidator class instead.');
    const validator = new GeminiValidator();
    // Default to 50 to ensure it runs for backward compatibility
    return validator.validate(imageElement, 50, []);
}

// For debugging
console.log('[Layer4-Gemini] Module loaded - Gemini validation only (40-80% range)');
