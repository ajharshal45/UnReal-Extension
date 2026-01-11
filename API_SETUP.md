# API Credentials Setup

This extension uses two optional API services for enhanced AI image detection:

## Sightengine API (Optional)

Sightengine provides AI-generated image detection through their machine learning models.

### Getting Your Credentials:
1. Go to [sightengine.com](https://sightengine.com/)
2. Sign up for a free account
3. Get your API User ID and API Secret from the dashboard

### Configuration Options:

**Option 1: Extension Settings (Recommended for end users)**
1. Open the extension and click "Settings"
2. Enter your Sightengine User ID and Secret
3. Click "Save API Credentials"

**Option 2: For Development (.env file)**
1. Copy `.env.example` to `.env` in the extension folder
2. Fill in your credentials:
   ```
   SIGHTENGINE_USER=your_user_id_here
   SIGHTENGINE_SECRET=your_secret_key_here
   ```
3. The `.env` file is already in `.gitignore` and won't be committed

## Gemini Vision API (Optional)

Google's Gemini 2.0 Flash provides forensic analysis of images for AI artifact detection.

### Getting Your API Key:
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Enter it in the extension settings

## Security Notes

- All API credentials are stored locally in Chrome's secure storage
- Credentials are NEVER sent to any server except the respective API services
- The `.env` file (if used) is excluded from git commits
- Always use `.env.example` as a template and never commit your actual `.env` file

## Extension Behavior

- **Without any API keys**: Uses local pattern matching (URL patterns, dimensions, filenames)
- **With Sightengine only**: Adds ML-based AI image detection
- **With Gemini only**: Adds forensic analysis (artifacts, inconsistencies)
- **With both APIs**: Full 3-layer detection with highest accuracy
