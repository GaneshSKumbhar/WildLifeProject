import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
import tensorflow as tf
import numpy as np

# Paths
MODEL_1_PATH = "audio_model_v2_77.keras"
MODEL_2_PATH = "AnimalSoundModel.keras"
OUTPUT_PATH = "ensembled_audio_model.keras"

print("Loading models...")
model1 = tf.keras.models.load_model(MODEL_1_PATH)
model1._name = "model_35_classes"

model2 = tf.keras.models.load_model(MODEL_2_PATH)
model2._name = "model_13_classes"

# --- TODO: UPDATE THIS MAPPING ---
# Key: class index in the 13-class model (AnimalSoundModel)
# Value: corresponding class index in the 35-class model (audio_model_v2_77)
# For example, if class 0 in the new model corresponds to class 12 in the old one, use `0: 12`.
CLASS_MAPPING_13_TO_35 = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 
    5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 
    10: 10, 11: 11, 12: 12
}

# Create a fixed weight matrix for mapping 13 classes to 35 classes
W = np.zeros((13, 35), dtype=np.float32)
for idx_13, idx_35 in CLASS_MAPPING_13_TO_35.items():
    W[idx_13, idx_35] = 1.0

# Define the common input
input_layer = tf.keras.layers.Input(shape=(224, 224, 3), name="ensemble_input")

# Get outputs from both models
out1 = model1(input_layer)  # Shape (None, 35)
out2_raw = model2(input_layer)  # Shape (None, 13)

# Map the 13 classes to 35 classes using a fixed, non-trainable Dense layer
# This avoids serialization issues with Lambda layers.
mapping_layer = tf.keras.layers.Dense(35, use_bias=False, trainable=False, name="class_mapper")
# Ensure the layer knows its input shape before setting weights
out2_mapped = mapping_layer(out2_raw)  # Shape (None, 35)
mapping_layer.set_weights([W])

# Average the predictions
averaged_output = tf.keras.layers.Average(name="average_predictions")([out1, out2_mapped])

# Create the final ensemble model
ensemble_model = tf.keras.models.Model(inputs=input_layer, outputs=averaged_output, name="EnsembleAudioModel")

print("Ensemble model summary:")
ensemble_model.summary()

# Save the model
print(f"Saving ensembled model to {OUTPUT_PATH}...")
ensemble_model.save(OUTPUT_PATH)
print("Done! You can now use the ensembled model.")
