import io
import os
import pickle
import threading
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

app = FastAPI(title="Wildlife Object Detection API",
              description="API for detecting wildlife species using YOLOv8.")

# Configure CORS Middleware to prevent browser blocking
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the model. The best.pt file is in the parent directory (project root)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "best.pt")
AUDIO_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "audio_model_v2_77.keras")
NEW_AUDIO_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "AnimalSoundModel.keras")
LABEL_ENCODER_PATH = os.path.join(os.path.dirname(__file__), "..", "label_encoder_v2.pkl")

# Global variable to hold the model
model = None
audio_model = None
new_audio_model = None
label_encoder = None
model_loading = False
model_load_error = None

# Heavy ML libraries are imported by the background loader so the web server
# can bind to its cloud-assigned port before TensorFlow/PyTorch initialise.
np = None
librosa = None
tf = None
YOLO = None

def load_model():
    global model
    global audio_model
    global new_audio_model
    global label_encoder
    global model_loading
    global model_load_error
    global np
    global librosa
    global tf
    global YOLO

    try:
        print("Loading inference libraries in background...")
        import numpy as numpy_module
        import librosa as librosa_module
        import tensorflow as tensorflow_module
        from ultralytics import YOLO as yolo_model

        np = numpy_module
        librosa = librosa_module
        tf = tensorflow_module
        YOLO = yolo_model

        if os.path.exists(MODEL_PATH):
            model = YOLO(MODEL_PATH)
            print(f"Model loaded from {MODEL_PATH}")
        else:
            print(f"Error: Model not found at {MODEL_PATH}")

        if os.path.exists(AUDIO_MODEL_PATH):
            audio_model = tf.keras.models.load_model(AUDIO_MODEL_PATH)
            print(f"Audio model loaded from {AUDIO_MODEL_PATH}")
        else:
            print(f"Error: Audio model not found at {AUDIO_MODEL_PATH}")

        if os.path.exists(NEW_AUDIO_MODEL_PATH):
            try:
                new_audio_model = tf.keras.models.load_model(NEW_AUDIO_MODEL_PATH)
                print(f"New audio model loaded from {NEW_AUDIO_MODEL_PATH}")
            except Exception as e:
                print(f"Error loading new audio model: {e}")
        else:
            print(f"Warning: New audio model not found at {NEW_AUDIO_MODEL_PATH}")

        if os.path.exists(LABEL_ENCODER_PATH):
            with open(LABEL_ENCODER_PATH, "rb") as f:
                label_encoder = pickle.load(f)
            print(f"Label encoder loaded from {LABEL_ENCODER_PATH}")
        else:
            print(f"Error: Label encoder not found at {LABEL_ENCODER_PATH}")
    except Exception as e:
        model_load_error = str(e)
        print(f"Error loading inference assets: {e}")
    finally:
        model_loading = False


@app.on_event("startup")
def begin_model_loading():
    """Bind the web port first; model loading can take several minutes on CPU hosts."""
    global model_loading
    model_loading = True
    threading.Thread(target=load_model, name="model-loader", daemon=True).start()


@app.get("/healthz")
def health_check():
    """Liveness check for the host; the body reports inference readiness."""
    ready = model is not None and audio_model is not None and label_encoder is not None
    return JSONResponse(
        status_code=200,
        content={
            "status": "ready" if ready else ("loading" if model_loading else "degraded"),
            "object_model": model is not None,
            "audio_model": audio_model is not None,
            "ensemble_audio_model": new_audio_model is not None,
            "label_encoder": label_encoder is not None,
            "error": model_load_error
        }
    )

@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    if model is None:
        return JSONResponse(status_code=500, content={"error": "Model not loaded."})

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Run inference
        results = model(image)
        
        # Extract predictions
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = box.conf[0].item()
                cls_id = int(box.cls[0].item())
                cls_name = model.names[cls_id]
                
                detections.append({
                    "class": cls_name,
                    "confidence": conf,
                    "box": {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2
                    }
                })
                
        return JSONResponse(content={"detections": detections})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/predict_image/")
async def predict_image(file: UploadFile = File(...)):
    if model is None:
        return JSONResponse(status_code=500, content={"error": "Model not loaded."})

    try:
        from fastapi.responses import Response
        
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Run inference
        results = model(image)
        
        # The plot() method draws the boxes and labels on the image
        res_image_array = results[0].plot()
        
        # Convert BGR (used by OpenCV/Ultralytics) to RGB
        res_image_array_rgb = res_image_array[..., ::-1]
        
        # Create a PIL Image from the array
        res_image = Image.fromarray(res_image_array_rgb)
        
        # Save to bytes
        img_byte_arr = io.BytesIO()
        res_image.save(img_byte_arr, format='JPEG')
        
        # Return the image as a response
        return Response(content=img_byte_arr.getvalue(), media_type="image/jpeg")
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

def audio_to_spectrogram_image(file_path, target_size=(224, 224)):
    """Convert an audio file to a mel spectrogram image (224x224 RGB)."""
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt

    try:
        # Load audio
        audio, sr = librosa.load(file_path, sr=22050)

        # Generate mel spectrogram
        mel_spec = librosa.feature.melspectrogram(y=audio, sr=sr)
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

        # Render spectrogram to an image using matplotlib
        fig, ax = plt.subplots(1, 1, figsize=(2.24, 2.24), dpi=100)
        ax.axis('off')
        librosa.display.specshow(mel_spec_db, sr=sr, ax=ax)
        plt.tight_layout(pad=0)

        # Save to in-memory buffer
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        buf.seek(0)

        # Load as PIL Image, resize, convert to RGB
        img = Image.open(buf).convert('RGB').resize(target_size)
        img_array = np.array(img) / 255.0  # Normalize to [0, 1]

        return img_array

    except Exception as e:
        print(f"Error converting audio to spectrogram: {file_path}")
        print(f"Error details: {e}")
        return None

@app.post("/predict_audio/")
async def predict_audio(file: UploadFile = File(...)):
    if audio_model is None or label_encoder is None:
        return JSONResponse(status_code=500, content={"error": "Audio model or label encoder not loaded."})

    import tempfile

    temp_file_path = None
    try:
        # Save the uploaded file to a proper temp file (avoids issues with
        # spaces and special characters in the original filename)
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=".") as tmp:
            tmp.write(await file.read())
            temp_file_path = tmp.name

        # Convert audio to spectrogram image (224x224x3)
        spectrogram_img = audio_to_spectrogram_image(temp_file_path)

        if spectrogram_img is None:
            return JSONResponse(status_code=400, content={
                "error": "Could not process audio file. Make sure it is a valid audio file (.wav, .mp3, .ogg, .flac)."
            })

        # Reshape for model input: (1, 224, 224, 3)
        input_data = np.expand_dims(spectrogram_img, axis=0)

        # Predict
        prediction1 = audio_model.predict(input_data)
        
        if new_audio_model is not None:
            prediction2 = new_audio_model.predict(input_data)
            # Map the 13 classes to the 35 classes
            # --- TODO: UPDATE THIS MAPPING ---
            # Key: class index in the 13-class model
            # Value: corresponding class index in the 35-class model
            CLASS_MAPPING_13_TO_35 = {i: i for i in range(13)}
            
            mapped_prediction2 = np.zeros_like(prediction1)
            for idx_13, idx_35 in CLASS_MAPPING_13_TO_35.items():
                mapped_prediction2[0, idx_35] = prediction2[0, idx_13]
                
            prediction = (prediction1 + mapped_prediction2) / 2
        else:
            prediction = prediction1

        # Get the predicted class index
        predicted_class_index = np.argmax(prediction, axis=1)
        confidence = float(np.max(prediction, axis=1)[0])

        # Decode the label
        predicted_class_name = label_encoder.inverse_transform(predicted_class_index)[0]

        return JSONResponse(content={
            "predicted_class": predicted_class_name,
            "confidence": confidence
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    finally:
        # Always clean up the temp file
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/predict_audio/species/{species_name}")
async def predict_single_species(species_name: str, file: UploadFile = File(...)):
    """
    Run prediction specifically for a single target species.
    Returns the confidence score and whether the target species is detected.
    """
    if audio_model is None or label_encoder is None:
        return JSONResponse(status_code=500, content={"error": "Audio model or label encoder not loaded."})

    # Validate species name
    supported_classes = list(label_encoder.classes_)
    target_class = None
    
    # Try exact match first
    if species_name in supported_classes:
        target_class = species_name
    else:
        # Try case-insensitive matching
        matches = [c for c in supported_classes if c.lower() == species_name.lower()]
        if matches:
            target_class = matches[0]

    if not target_class:
        return JSONResponse(
            status_code=400,
            content={
                "error": f"Species '{species_name}' is not supported by the model.",
                "supported_species": supported_classes
            }
        )

    import tempfile
    temp_file_path = None
    try:
        suffix = os.path.splitext(file.filename)[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=".") as tmp:
            tmp.write(await file.read())
            temp_file_path = tmp.name

        spectrogram_img = audio_to_spectrogram_image(temp_file_path)
        if spectrogram_img is None:
            return JSONResponse(status_code=400, content={"error": "Could not process audio file."})

        # Reshape to (1, 224, 224, 3)
        input_data = np.expand_dims(spectrogram_img, axis=0)
        prediction1 = audio_model.predict(input_data)
        
        if new_audio_model is not None:
            prediction2 = new_audio_model.predict(input_data)
            CLASS_MAPPING_13_TO_35 = {i: i for i in range(13)}
            
            mapped_prediction2 = np.zeros_like(prediction1)
            for idx_13, idx_35 in CLASS_MAPPING_13_TO_35.items():
                mapped_prediction2[0, idx_35] = prediction2[0, idx_13]
                
            prediction = (prediction1 + mapped_prediction2) / 2
        else:
            prediction = prediction1

        # Get probability for target species
        species_idx = supported_classes.index(target_class)
        confidence = float(prediction[0][species_idx])
        
        # Decide if detected (using a classification threshold of 0.35)
        detected = (confidence > 0.35)
        
        # Also find the highest prediction class
        max_idx = np.argmax(prediction, axis=1)[0]
        primary_class = supported_classes[max_idx]
        primary_conf = float(prediction[0][max_idx])

        return JSONResponse(content={
            "target_species": target_class,
            "detected": detected,
            "confidence": confidence,
            "is_primary_prediction": (target_class == primary_class),
            "primary_prediction": primary_class,
            "primary_confidence": primary_conf
        })

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.get("/audio_classes/")
def get_audio_classes():
    """Return the list of species classes the audio model can detect."""
    if label_encoder is None:
        return JSONResponse(status_code=500, content={"error": "Label encoder not loaded."})
    # label_encoder is a sklearn LabelEncoder; .classes_ is a numpy array
    classes = label_encoder.classes_.tolist()
    return JSONResponse(content={"classes": classes})

# Mount the frontend/ directory as static files to serve the landing page, css, and js.
# Declare at the end so it doesn't intercept other API routes.
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "frontend"), html=True), name="static")
