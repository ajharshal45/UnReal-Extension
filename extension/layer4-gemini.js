/**
 * Layer 4: Gemini Validation (Fixed)
 * Only runs when preliminary score is 40-80% (uncertain range)
 * Validates findings from earlier layers and provides semantic analysis
 */

export class GeminiValidator {
  constructor() {
    this.minScore = 25;
    this.maxScore = 80;
    this.apiKey = null;
    console.log('[Layer4-Gemini] GeminiValidator initialized (40-80% range)');
  }

  /**
   * Initialize with API key
   */
  async initialize() {
    try {
      // Get API key from background script
      const credentials = await chrome.runtime.sendMessage({
        type: 'GET_API_CREDENTIALS'
      });
      
      this.apiKey = credentials?.geminiApiKey || null;
      
      if (!this.apiKey) {
        console.log('[Layer4-Gemini] No API key available - validation will be skipped');
      } else {
        console.log('[Layer4-Gemini] API key loaded successfully');
      }
    } catch (error) {
      console.error('[Layer4-Gemini] Failed to initialize:', error);
      this.apiKey = null;
    }
  }

  /**
   * Check if validation should run based on preliminary score
   */
  shouldRun(preliminaryScore) {
    if (!this.apiKey) {
      return false;
    }
    return preliminaryScore >= this.minScore && preliminaryScore <= this.maxScore;
  }

  /**
   * Main validation entry point
   */
  async validate(imageElement, preliminaryScore, previousArtifacts = []) {
    const startTime = performance.now();

    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.initialize();
    }

    // Skip if no API key or score is outside validation range
    if (!this.shouldRun(preliminaryScore)) {
      return this._skipResult(preliminaryScore);
    }

    console.log('[Layer4-Gemini] Running validation for score:', preliminaryScore);

    try {
      // Convert image to base64
      const base64Image = await this._imageToBase64(imageElement);
      
      // Build enhanced prompt
      const prompt = this._buildEnhancedPrompt(previousArtifacts);

      // Call Gemini Vision API through background script
      const response = await chrome.runtime.sendMessage({
        type: 'CALL_GEMINI_VISION_API',
        data: {
          base64Image: base64Image,
          apiKey: this.apiKey,
          prompt: prompt
        }
      });

      if (!response || !response.success) {
        console.error('[Layer4-Gemini] API call failed:', response?.error);
        return this._errorResult(response?.error || 'API call failed');
      }

      // Process response
      return this._processGeminiResult(response.data, performance.now() - startTime);

    } catch (error) {
      console.error('[Layer4-Gemini] Validation error:', error);
      return this._errorResult(error.message);
    }
  }

  /**
   * Build enhanced prompt with previous findings
   */
  _buildEnhancedPrompt(previousArtifacts) {
    const artifactSummary = previousArtifacts.length > 0
      ? previousArtifacts.slice(0, 10).map(a => `- [${a.type || a.layer}] ${a.description}`).join('\n')
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

RESPOND IN THIS EXACT JSON FORMAT (NO MARKDOWN CODE BLOCKS):
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
   */
  async _imageToBase64(imageElement) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size (cap at 1024 for API limits)
        const maxSize = 1024;
        let width = imageElement.naturalWidth || imageElement.width;
        let height = imageElement.naturalHeight || imageElement.height;

        if (width > maxSize || height > maxSize) {
          const scale = Math.min(maxSize / width, maxSize / height);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and convert
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
   */
  _processGeminiResult(geminiData, processingTime) {
    try {
      // Extract text from Gemini response
      if (!geminiData.candidates || !geminiData.candidates[0] || 
          !geminiData.candidates[0].content || !geminiData.candidates[0].content.parts ||
          !geminiData.candidates[0].content.parts[0]) {
        console.error('[Layer4-Gemini] Invalid response structure');
        return this._errorResult('Invalid response structure');
      }

      const text = geminiData.candidates[0].content.parts[0].text;

      // Extract JSON (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[Layer4-Gemini] No JSON found in response');
        return this._errorResult('No JSON found in response');
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('[Layer4-Gemini] JSON parse failed:', parseError.message);
        return this._errorResult('JSON parse failed');
      }

      // Build artifacts array from findings
      const artifacts = [];

      // Add verified findings
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
   */
  _skipResult(preliminaryScore) {
    const reason = !this.apiKey
      ? 'No API key available - Gemini validation skipped'
      : preliminaryScore < this.minScore
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

console.log('[Layer4-Gemini] Module loaded - Gemini validation only (40-80% range)');