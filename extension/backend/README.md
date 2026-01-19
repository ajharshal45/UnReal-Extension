# UnReal ML Backend

Local Python server for AI content detection. The Chrome extension calls this backend for ML-based text and video analysis.

> 📖 For full documentation, see the main [README.md](../../README.md)

## Quick Start

```bash
# Navigate to backend folder
cd extension/backend

# Install dependencies
pip install -r requirements.txt

# Start the server
python server.py
```

Server starts at: `http://localhost:8000`

## API Endpoints

### Text Detection
**POST** `/detect`
```json
// Request
{ "text": "Content to analyze..." }

// Response
{
  "ai_score": 78.5,
  "human_score": 21.5,
  "confidence": 57,
  "model": "roberta-base-openai-detector"
}
```

### Video Analysis
**POST** `/analyze-video`
```json
// Request
{ "video_url": "https://example.com/video.mp4" }

// Response
{
  "success": true,
  "is_ai_generated": true,
  "confidence": 0.85,
  "frames_analyzed": 10
}
```

### Health Check
**GET** `/health`

## Requirements

- Python 3.8+
- ~2GB RAM for model
- GPU optional (uses CUDA if available)

## First Run

The first run downloads the RoBERTa model from HuggingFace (~500MB).
