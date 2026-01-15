# UnReal ML Backend

Local Python server for AI image detection. The Chrome extension calls this backend for Layer 3 ML analysis.

## Quick Start

```bash
# Navigate to backend folder
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
python server.py
```

Server will start at `http://localhost:8000`

## Directory Structure

```
backend/
├── server.py              # FastAPI server
├── requirements.txt       # Python dependencies
├── README.md              # This file
└── model/                 # Pre-trained model (327 MB)
    ├── config.json
    ├── model.safetensors
    └── preprocessor_config.json
```
```

**Response:**
```json
{
  "success": true,
  "score": 75,
  "confidence": 50,
  "realScore": 25,
  "fakeScore": 75,
  "processingTime": 150,
  "modelName": "dima806/ai_vs_real_image_detection"
}
```

## Requirements

- Python 3.8+
- ~2GB RAM for model
- GPU optional (uses CUDA if available)

## First Run

The first run will download the model from HuggingFace (~350MB). Subsequent runs will use cached model.
