"""
UnReal ML Backend Server
Hosts the AI image detection model and provides API for Chrome extension

Run with: python server.py
API endpoint: POST http://localhost:8000/analyze
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import AutoModelForImageClassification, AutoImageProcessor
from PIL import Image
import base64
import io
import uvicorn
import time

app = FastAPI(title="UnReal ML Backend", version="1.0.0")

# Enable CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variables
model = None
processor = None
device = None

# Use local model path (relative to this script)
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "model")
MODEL_NAME = "dima806/ai_vs_real_image_detection"  # For display only


class ImageRequest(BaseModel):
    image: str  # Base64 encoded image
    

class AnalysisResponse(BaseModel):
    success: bool
    score: int  # 0-100, AI likelihood
    confidence: int
    realScore: int
    fakeScore: int
    processingTime: int  # milliseconds
    modelName: str
    error: str = None


@app.on_event("startup")
async def load_model():
    """Load the ML model on server startup"""
    global model, processor, device
    
    print(f"[ML Backend] Loading model: {MODEL_NAME}")
    start_time = time.time()
    
    try:
        # Determine device
        if torch.cuda.is_available():
            device = torch.device("cuda")
            print("[ML Backend] Using CUDA GPU")
        else:
            device = torch.device("cpu")
            print("[ML Backend] Using CPU")
        
        # Load model and processor from local path
        print(f"[ML Backend] Loading from local path: {MODEL_PATH}")
        model = AutoModelForImageClassification.from_pretrained(
            MODEL_PATH,
            local_files_only=True
        )
        processor = AutoImageProcessor.from_pretrained(
            MODEL_PATH,
            local_files_only=True
        )
        
        # Move model to device
        model = model.to(device)
        model.eval()
        
        load_time = time.time() - start_time
        print(f"[ML Backend] Model loaded successfully in {load_time:.2f}s")
        print(f"[ML Backend] Model labels: {model.config.id2label}")
        
    except Exception as e:
        print(f"[ML Backend] Failed to load model: {e}")
        raise e


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "model": MODEL_NAME,
        "device": str(device) if device else "not loaded"
    }


@app.get("/health")
async def health():
    """Health check for the extension"""
    return {
        "status": "ok",
        "modelLoaded": model is not None
    }


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_image(request: ImageRequest):
    """
    Analyze an image for AI-generated content
    
    Expects base64 encoded image in request body
    Returns score 0-100 where higher = more likely AI-generated
    """
    start_time = time.time()
    
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Decode base64 image
        image_data = request.image
        
        # Handle data URL format
        if "," in image_data:
            image_data = image_data.split(",")[1]
        
        # Decode and open image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Preprocess image
        inputs = processor(images=image, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            
            # Apply softmax
            probs = torch.nn.functional.softmax(logits, dim=-1)
            probs = probs.cpu().numpy()[0]
        
        # Get scores (label 0 = Real, label 1 = Fake)
        real_prob = float(probs[0])
        fake_prob = float(probs[1])
        
        # Calculate scores
        score = int(fake_prob * 100)  # AI likelihood score
        confidence = int(abs(fake_prob - real_prob) * 100)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        print(f"[ML Backend] Analysis complete: score={score}%, confidence={confidence}%, time={processing_time}ms")
        
        return AnalysisResponse(
            success=True,
            score=score,
            confidence=confidence,
            realScore=int(real_prob * 100),
            fakeScore=int(fake_prob * 100),
            processingTime=processing_time,
            modelName=MODEL_NAME
        )
        
    except Exception as e:
        print(f"[ML Backend] Analysis error: {e}")
        return AnalysisResponse(
            success=False,
            score=0,
            confidence=0,
            realScore=0,
            fakeScore=0,
            processingTime=int((time.time() - start_time) * 1000),
            modelName=MODEL_NAME,
            error=str(e)
        )


if __name__ == "__main__":
    print("=" * 60)
    print("UnReal ML Backend Server")
    print("=" * 60)
    print(f"Model: {MODEL_NAME}")
    print("Starting server on http://localhost:8000")
    print("API endpoint: POST http://localhost:8000/analyze")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
