# Geospatial Sonifier

An experimental web application that transforms the semantic "latent space" of geographical landmarks into multi-voice orchestral compositions. By calculating the difference between two cultural or historical entities _as represented by the summary snippet from the associated Wikipedia article_, the app generates a unique auditory signature of their relationship.

## Architecture Overview

The application is built with a modern, on-device AI stack to ensure privacy, low latency, and offline-capable processing.

### 1. Semantic Intelligence (Transformers.js)
The core of the app is the **Sentence Transformer** model (`Xenova/all-MiniLM-L6-v2`).
- **On-Device Inference:** Unlike typical AI apps, the NLP model is downloaded to the browser's cache and runs locally.
- **Vectorization:** It transforms Wikipedia descriptions into 384-dimensional numerical vectors (embeddings). These vectors represent the "semantic DNA" of a place.
- **The "Journey" Vector:** By subtracting the Origin vector from the Target vector, we calculate a **Difference Vector**. This represents the semantic shift required to move from one concept to another.

### 2. Audio Synthesis Engine (Tone.js)
The `MusicEngine` is a hybrid sampler/synthesizer that operates across four classical voices:
- **Orchestral Sampler:** High-fidelity samples (Double Bass, Cello, Viola, Violin) are pulled from a CDN. Well, that's the goal.
- **Hybrid Fallback:** If the network blocks the samples, the engine automatically initializes specific synthesizers (FMSynth, AMSynth, etc.) to ensure the experience is never silent.
- **Dynamic BPM:** The "Energy" of a semantic profile (calculated via vector magnitude) determines the tempo. Highly complex or "heavy" semantic entities result in more frantic tempos.

### 3. Data Integration (Wikipedia & Geolocation)
- **Contextual Search:** The app uses the browser's Geolocation API to find the user's current coordinates.
- **Wiki Geosearch:** It queries the Wikipedia API for the 15 nearest landmarks, ensuring the "data" is always relevant to the user's physical surroundings.

---

## The Sonification Logic

**A Note on Interpretability:** In Transformer models, semantic information is *distributed*. There is no single dimension that represents "History" or "Nature." 

For this project, we employ a **Metaphorical Partitioning** strategy. We divide the 384 dimensions into four quadrants. This ensures each musical voice has a unique "identity" and reacts to a different slice of the model's internal data:

1.  **Bass (0-95):** Interpreted here as the "foundation" or broad semantic clusters.
2.  **Tenor (96-191):** Interpreted as mid-level cultural and functional features.
3.  **Alto (192-287):** Interpreted as contextual and historical relational data.
4.  **Soprano (288-383):** Interpreted as fine-grained, specific stylistic or descriptive details.

But... we don't really know. Maybe there are ways of finding out.

Each dimension influences:
-   **Pitch Selection:** Mapped to a Seven-Note Scale (C, D, Eb, F, G, Ab, Bb).
-   **Rhythmic Density:** Larger values increase the probability of a note triggering.
-   **Velocity:** The magnitude of the value determines the intensity of the performance.


---

## Exploration & Understanding

By using this app, you are exploring the **Latent Space of Human Knowledge**.

### What to Listen For:
- **The Origin vs. The Target:** Listen to how the "vibe" of a landmark changes. A park might sound airy and melodic, while a cathedral might sound dense and heavy in the bass register.
- **The Journey (The Difference):** The "Journey" button plays the *subtraction* of the two. This is essentially the "musical ghost" of what makes the two landmarks different. If you compare two very similar parks, the Journey will be sparse and quiet. If you compare a Tech Hub to an Ancient Ruin, the Journey will be musically chaotic and complex.
- **Semantic Consonance:** Notice how landmarks with shared history or function (e.g., two churches) tend to produce more harmonic relationships than unrelated entities (e.g., a stadium and a library).

## Technical Requirements
- **Browser:** Modern Chrome, Firefox, or Edge (for Geolocation and Web Audio support).
- **Audio:** Best experienced with headphones to hear the separation of the four orchestral voices.
- **Network:** Requires an initial connection to download the NLP model (~23MB) and the orchestral samples. Once cached, the NLP runs entirely offline.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`

2. Run the app:
   `npm run dev`

Or `npm run build` and drop the resulting `/dist` folder on a server somewhere.
