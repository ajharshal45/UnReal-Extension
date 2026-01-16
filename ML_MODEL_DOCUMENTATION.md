# ShareSafe Local ML Integration - Developer Documentation

> **Status:** Production-Ready  
> **Last Updated:** 2026-01-16  
> **Role:** Secondary "Human-Likeness Verifier" (Safety Guard)

This document provides a technical deep-dive into the local Machine Learning subsystem of the ShareSafe browser extension. It explains the "Why", "How", and "What" of the architecture for developers maintaining or extending the system.

---

## 1. Model Identification

We utilize a fine-tuned Transformer model specifically optimized for detecting GPT-2/GPT-3 generation patterns.

*   **Model Name:** `roberta-base-openai-detector`
*   **Hugging Face ID:** [`openai-community/roberta-base-openai-detector`](https://huggingface.co/openai-community/roberta-base-openai-detector)
*   **Architecture:** RoBERTa (Robustly Optimized BERT) Base
*   **Parameters:** ~125 Million
*   **Training Objective:** Binary Sequence Classification
*   **Output Labels:**
    *   `LABEL_0`: **Fake** (AI-Generated)
    *   `LABEL_1`: **Real** (Human-Written)

**Why this model?**
It remains one of the most robust baselines for detecting "GPT-isms" (statistical regularities typical of LLMs) without the massive overhead of larger DeBERTa models.

---

## 2. Environment & Setup

The ML component runs as a local Python backend. It is *not* embedded in the browser.

### Prerequisites (Fresh Install)
*   **Python:** 3.8 - 3.11 (Recommended: 3.10 for stability with PyTorch)
*   **OS:** Windows, macOS, or Linux
*   **Hardware:** CPU is sufficient (Inference < 200ms). GPU is optional.

### Setup Instructions

1.  **Create a Virtual Environment** (Best Practice)
    ```bash
    # Windows
    python -m venv venv
    .\venv\Scripts\activate

    # MaxOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

2.  **Install Dependencies**
    We use `torch` for inference and `flask` for the API layer.
    ```bash
    pip install torch transformers flask flask-cors
    ```
    *(Note: This downloads the CPU version of PyTorch by default on most systems, which keeps the install size manageable ~800MB vs 2GB+ for CUDA versions.)*

3.  **Run the Server**
    ```bash
    python ai_detector_api.py
    ```
    *   **First Run:** The script will automatically download the model (~500MB) to your local Hugging Face cache.
    *   **Success Signal:** Look for `Starting server at http://127.0.0.1:8000` in the console.

4.  **Verify Reachability**
    ```bash
    curl -X POST http://127.0.0.1:8000/detect -H "Content-Type: application/json" -d "{\"text\": \"This is a test.\"}"
    ```

---

## 3. Architecture Decision: Why PyTorch?

We deliberately chose a **Local Python/PyTorch API** architecture over in-browser solutions like TensorFlow.js or ONNX Web.

### Why not TensorFlow.js?
Attempting to run a RoBERTa-base model directly in a Chrome Extension is technically non-viable for a smooth user experience:

1.  **Memory Impact (RAM):**
    *   loading `roberta-base` in `tfjs` requires ~300-500MB+ of VRAM/RAM in the browser tab process.
    *   **Result:** High risk of crashing the tab or slowing down the user's entire browser, especially on low-end devices.
2.  **Bundle Size:**
    *   The model weights alone are ~476MB.
    *   **Result:** Validating or updating the extension would require downloading half a gigabyte of data, which is unacceptable for a browser plugin.
3.  **Blocking Behavior:**
    *   Even with Web Workers, transferring large tensors and performing inference competes with the browser's resources.
    *   **Result:** UI stutters and lag during scroll (checking segments).
4.  **Security/Sandboxing:**
    *   Chrome MVP3 Manifest V3 imposes strict Content Security Policies (CSP) that make loading external binary blobs complicating/fragile.

### The Solution: Local Sidecar
By offloading inference to a local Python process:
*   **Zero Browser Impact:** The extension acts as a lightweight client.
*   **Native Performance:** PyTorch runs on native OS threads/optimizations (AVX2, etc.).
*   **Stability:** If the model crashes, the browser stays alive.

---

## 4. System Architecture

### A. High-Level Architecture

```text
[ Browser Extension ]                         [ Local Machine ]
+-------------------+                         +------------------+
|                   |    JSON / HTTP          |                  |
| segmentAnalyzer.js| ----------------------> | ai_detector_api.py |
| (Client Logic)    |      POST :8000         | (Flask Server)   |
|                   |                         |                  |
+---------+---------+                         +---------+--------+
          |                                             |
          v                                             v
[ Statistical Engine ]                        [ RoBERTa Model ]
(Entropy, Perplexity)                         (PyTorch Inference)
```

### B. Execution Flow Diagram

```mermaid
graph TD
    A[Browser: Segment Detected] --> B{Valid Candidate?}
    B -- No (Short/Social) --> C[Skip ML]
    B -- Yes --> D[Queue: mlQueue]
    
    D --> E{Cache Hit?}
    E -- Yes --> F[Return Cached Result]
    E -- No --> G[Fetch HTTP 127.0.0.1:8000]
    
    G --> H[Python API]
    H --> I[Tokenize Text]
    I --> J[RoBERTa Inference]
    J --> K[Formal Style Check]
    K --> L[Return JSON]
    
    L --> M[Browser: Gating Logic]
    M --> N{Result == Human?}
    N -- Yes (>85%) --> O[Reduce AI Confidence]
    N -- No --> P{Result == AI?}
    P -- Yes --> Q[IGNORE (Safety Rule)]
    P -- Low Conf --> R[IGNORE]
```

---

## 5. ML Workflow (End-to-End)

1.  **Trigger:** The user scrolls, and `segmentAnalyzer.js` identifies a text block > 120 words.
2.  **Pre-Flight:** The system checks if the statistical AI score is high enough to warrant a second opinion (Score > 55).
3.  **Serialization:** The request enters `mlQueue`. Previous active requests must finish or timeout (6s) before this one starts.
4.  **API Call:** text is sent to `127.0.0.1:8000/detect`.
5.  **Inference (Python):**
    *   Text is tokenized (truncated to 512 tokens).
    *   RoBERTa calculates logits -> Softmax -> Probabilities.
    *   **Heuristic:** API checks if input is "Formal Style" (avg word len > 5.2 + no first-person pronouns).
6.  **Response:** The API returns `human_score` and `ai_score`.
7.  **Safety Gating (JS):**
    *   **Verified Human:** If `human_score >= 85`, we explicitly *reduce* the original AI confidence.
    *   **AI Agree:** If `ai_score >= 80`, we **DO NOTHING**. The model is not allowed to increase suspicion, only decrease it.
    *   **Formal Cap:** If API flagged "Formal Style", confidence is hard-capped at 45-50%.

---

## 6. Code Walkthrough

### Python: `ai_detector_api.py`

#### Formal Style Heuristics
This block prevents the model from flagging encyclopedias (Wikipedia) as AI simply because they are formal.
```python
# ai_detector_api.py

# Heuristic: Encyclopedia style uses long words and no "I/We"
is_formal_style = (avg_word_len > 5.2) and (not has_first_person)

if is_formal_style:
    # Hard cap on confidence for formal text
    if confidence > 80: confidence = 80
    
    # Internal doubt: If looks formal AND human, be extra conservative
    if human_score > ai_score:
        confidence = max(0, confidence - 15)
```
*Purpose:* Stops false positives on technical academic content.

---

### JavaScript: `segmentAnalyzer.js`

#### Request Serialization (The "Abort Storm" Fix)
We use a promise chain to strictly serialize network calls.
```javascript
// segmentAnalyzer.js
let mlQueue = Promise.resolve();

// Inside callLocalMLDetector...
return new Promise(resolve => {
    // Chain onto the existing queue
    mlQueue = mlQueue.then(async () => {
        // ... perform fetch ...
    }).catch(() => resolve(null));
});
```
*Purpose:* Prevents the browser from choking on multiple simultaneous requests during rapid scrolling.

#### The "Human Verifier" Logic (Safety Core)
The most critical logic in the entire integration.
```javascript
// Logic Rule 2: Verified Human Signal
else if (mlResult.human_score >= 85) {
    const reduction = 0.3; // Reduce confidence by 30%
    const reducedConf = Math.round(stats.confidence * (1 - reduction));
    forceConfidence = reducedConf;
    reasons.push('Human-like writing style verified by ML');
}
// Logic Rule 3: AI Signal Ignored
else if (mlResult.ai_score >= 80) {
    // We intentionally IGNORE high AI scores from the ML model.
    // It is ONLY allowed to save a user (prove human), not convict them.
    console.log('[AI-DETECTOR][ML] Ignored: AI Signal Safety Constraint');
}
```
*Purpose:* Fundamental safety principle. The local model is a defense mechanism for humans, not a weapon for AI detection.

---

## 7. Safety Design Philosophy

This integration is built on a **"Do No Harm"** philosophy.

1.  **The "Human Verifier" Rule:**
    The ML model has *one job*: to find evidence of humanity that the statistical engine missed. It acts as an exculpatory evidence generator.

2.  **Asymmetric Trust:**
    *   **Trust Human Signals:** High. If RoBERTa says "Human", we execute logic to lower suspicion.
    *   **Distrust AI Signals:** High. If RoBERTa says "AI", we ignore it. Why? Because the original statistical engine already flagged it as suspicious (that's why we called ML). We don't need "more" suspicion; we need a sanity check.

3.  **The Wikipedia Problem:**
    GPT-2 was trained on the internet. Wikipedia is the internet. Therefore, standard detectors often flag Wikipedia as AI.
    *   **Mitigation:** `is_formal_style` heuristic + Hard Confidence Caps (40%).

---

## 8. Final Summary

This local ML architecture helps ShareSafe achieve reliability that purely statistical or purely cloud-based tools cannot match.

*   **What it DOES:** Drastically reduces false positives on well-written, formal human text.
*   **What it CANNOT do:** Run without the Python backend or on mobile browsers.
*   **Why it's Future-Proof:** We can swap `roberta-base` for `deberta-v3-small` or any newer model just by updating the Python script—zero changes to the extension code required.

This system is designed to be **conservative, explainable, and invisible** until it saves a user from a false accusation.
