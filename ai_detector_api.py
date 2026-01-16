"""
ShareSafe - Local AI Text Detection API
Step 2: Backend-only Inference Service

Uses 'roberta-base-openai-detector' to provide a secondary AI score signal.
This is NOT a binary detector; it provides raw probability scores.

Usage:
    python ai_detector_api.py

Endpoint:
    POST /detect
    { "text": "Content to analyze..." }
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import logging

# Configuration
MODEL_NAME = "openai-community/roberta-base-openai-detector"
PORT = 8000
HOST = "127.0.0.1"
MIN_WORDS = 15

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask App
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for browser extension access

# Global variables for model/tokenizer
tokenizer = None
model = None

def load_model():
    """Load model and tokenizer once at startup."""
    global tokenizer, model
    try:
        logger.info(f"Loading model: {MODEL_NAME}...")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        model.eval()  # Set to evaluation mode
        logger.info("Model loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise e

@app.route('/detect', methods=['POST'])
def detect():
    """
    Analyze text for AI generation probability.
    
    Returns:
        JSON with ai_score, human_score, confidence, etc.
    """
    try:
        # 1. Validate Input
        data = request.get_json(force=True)
        if not data or 'text' not in data:
            return jsonify({"error": "Missing 'text' field"}), 400
        
        text = data['text']
        
        # 2. Check Text Length
        word_count = len(text.split())
        if word_count < MIN_WORDS:
            return jsonify({
                "ai_score": 0,
                "human_score": 0,
                "confidence": 0,
                "model": "roberta-base-openai-detector",
                "method": "local_ml",
                "note": "Insufficient text for reliable ML inference"
            })

        # 3. Tokenize
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512
        )

        # 4. Inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=1).tolist()[0]
            
            # roberta-base-openai-detector labels: 0 -> Fake (AI), 1 -> Real (Human)
            # WAIT: Let's double check the model labels.
            # Usually: Label 0 is "Fake" (AI), Label 1 is "Real" (Human).
            # Hugging Face model card for openai-community/roberta-base-openai-detector:
            # "LABEL_0": "Fake", "LABEL_1": "Real"
            
            ai_prob = probs[0]   # Label 0
            human_prob = probs[1] # Label 1

        # 5. Format Scores (0-100)
        ai_score = round(ai_prob * 100, 2)
        human_score = round(human_prob * 100, 2)
        confidence = round(abs(ai_score - human_score), 2)

        # 6. Formal Style Heuristic
        # - Avg word length
        # - Absence of first person
        words = text.split()
        avg_word_len = sum(len(w) for w in words) / len(words) if words else 0
        
        # Check for first-person indicators (I, me, my, we, our, us)
        text_lower = text.lower()
        has_first_person = any(token in text_lower.split() for token in ["i", "me", "my", "we", "our", "us"])
        
        # Formal if: Long words AND No first person
        is_formal_style = (avg_word_len > 5.2) and (not has_first_person)

        ml_warning = ""
        if is_formal_style:
            ml_warning = "Formal writing may resemble AI"
            # CAP confidence for formal text (never > 80)
            if confidence > 80:
                confidence = 80
            
            # If text is formal and model says Human, reduce confidence further?
            # User requirement: "If text is formal AND human_score > ai_score: reduce confidence internally"
            # This is conservative: "We think it's human, but it's formal, so we aren't 100% sure".
            if human_score > ai_score:
                confidence = max(0, confidence - 15)

        # 7. Confidence Governance (API Level)
        # Never return high confidence for short text
        if word_count < 50 and confidence > 50:
             confidence = 50
             note = "Low confidence (short text)"
        elif confidence < 40:
             note = "Uncertain result"
        else:
             note = "Analysis complete"

        response = {
            "ai_score": ai_score,
            "human_score": human_score,
            "confidence": confidence,
            "model": "roberta-base-openai-detector",
            "method": "local_ml",
            "is_formal_style": is_formal_style,
            "text_length": word_count,
            "ml_warning": ml_warning,
            "note": note
        }
        
        logger.info(f"Analyzed {word_count} words. AI Score: {ai_score}")
        return jsonify(response)

    except Exception as e:
        logger.error(f"Error during detection: {e}")
        return jsonify({"error": str(e)}), 500

# Main Runner
if __name__ == "__main__":
    load_model()
    logger.info(f"Starting server at http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=True)
