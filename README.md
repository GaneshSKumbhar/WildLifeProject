# Wildlife Object & Audio Detection API

This is a FastAPI backend for detecting wildlife species using a custom YOLOv8 model for images (`best.pt`) and a TensorFlow model for audio classification (`audio_model_v2_77.keras`).

## Setup Instructions

### 1. Python Environment

Ensure you have Python installed. The required packages depend on your Python version:

- **For Python 3.9 - 3.12 (Recommended):**
  Standard `tensorflow` is fully supported.
- **For Python 3.13 or 3.14+:**
  Standard `tensorflow` might not yet have pre-built packages. You will need to install the nightly build (`tf-nightly`) instead.

### 2. Install Dependencies

First, install the standard requirements:
```bash
pip install -r requirements.txt
```

**Important Note for Python 3.13/3.14+ Users:**
If `pip install -r requirements.txt` fails with a `tensorflow` module error, run this command to install the nightly version:
```bash
py -m pip install tf-nightly
```

### 3. Required Model Files

Make sure the following model files are placed in the **project root directory** (one level above `backend/`):
- `best.pt` (YOLOv8 image model)
- `audio_model_v2_77.keras` (TensorFlow audio model)
- `label_encoder_v2.pkl` (Label encoder for audio classes)

### 4. Run the FastAPI Server

Start the server using `uvicorn`:
```bash
python -m uvicorn main:app --reload
# Or depending on your system alias:
# py -m uvicorn main:app --reload
```
The server will start at `http://127.0.0.1:8000`. The frontend interface is automatically served at the root URL `/`.

## API Endpoints

### 🖼️ Image Detection

#### `POST /predict/`
Accepts an image file and returns object detection bounding boxes and confidence scores.
- **Body:** `multipart/form-data` with a `file` key containing the image.
- **Response:** JSON with `detections` (class name, confidence, and bounding box coordinates).

#### `POST /predict_image/`
Accepts an image file and returns the actual image with bounding boxes drawn over the detected wildlife.
- **Body:** `multipart/form-data` with a `file` key containing the image.
- **Response:** JPEG image.

### 🎵 Audio Classification

#### `POST /predict_audio/`
Accepts an audio file and returns the overall wildlife audio classification result.
- **Body:** `multipart/form-data` with a `file` key containing the audio file (e.g., .wav, .mp3).
- **Response:** JSON with `predicted_class` and `confidence`.

#### `POST /predict_audio/species/{species_name}`
Run a targeted prediction for a specific species. It will tell you if that particular species was detected.
- **Path Parameter:** The species name (e.g., `Lion Roar`).
- **Body:** `multipart/form-data` with a `file` key containing the audio file.
- **Response:** JSON showing if the target species was detected, its confidence, and the primary prediction.

#### `GET /audio_classes/`
Returns a list of all species classes the audio model can detect.
- **Response:** JSON with a `classes` array.

## Interactive Documentation

FastAPI provides automatic interactive API documentation. Once the server is running, you can access it by navigating to:
- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
