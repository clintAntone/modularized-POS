// face-api.js is dynamically imported so it only downloads when face features are used
type FaceApi = typeof import('face-api.js');

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let loading = false;
let loadError: Error | null = null;

async function getFaceApi(): Promise<FaceApi> {
    if (!faceapi) faceapi = await import('face-api.js');
    return faceapi;
}

const MODEL_URL = '/models';

// All model files with known sizes (bytes) for progress tracking
const MODEL_FILES = [
    { path: '/models/tiny_face_detector_model-weights_manifest.json', size: 4000 },
    { path: '/models/tiny_face_detector_model-shard1',                size: 196608 },
    { path: '/models/face_landmark_68_model-weights_manifest.json',   size: 8192 },
    { path: '/models/face_landmark_68_model-shard1',                  size: 360448 },
    { path: '/models/face_recognition_model-weights_manifest.json',   size: 20480 },
    { path: '/models/face_recognition_model-shard1',                  size: 4194304 },
    { path: '/models/face_recognition_model-shard2',                  size: 2097152 },
];
const TOTAL_BYTES = MODEL_FILES.reduce((s, f) => s + f.size, 0);

/**
 * Pre-fetch model files into the browser cache while reporting per-file progress.
 * Also warms up the face-api.js dynamic import so it's ready before loadFaceModels().
 * onProgress receives (loadedBytes, totalBytes).
 */
export async function preloadFaceModels(
    onProgress: (loaded: number, total: number) => void
): Promise<void> {
    if (modelsLoaded) { onProgress(TOTAL_BYTES, TOTAL_BYTES); return; }
    let loadedBytes = 0;
    // Kick off the face-api.js JS bundle import in parallel with model file downloads
    const apiWarm = getFaceApi().catch(() => null);
    await Promise.all(MODEL_FILES.map(async ({ path, size }) => {
        try {
            const res = await fetch(path);
            await res.arrayBuffer();
            loadedBytes += size;
            onProgress(Math.min(loadedBytes, TOTAL_BYTES), TOTAL_BYTES);
        } catch { /* loadFaceModels will surface the error */ }
    }));
    await apiWarm; // ensure JS bundle is parsed before loadFaceModels runs
}

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    // Previous load failed — reset so caller can retry
    if (loadError) { loadError = null; }
    if (loading) {
        await new Promise<void>((resolve, reject) => {
            const check = setInterval(() => {
                if (modelsLoaded) { clearInterval(check); resolve(); }
                else if (loadError) { clearInterval(check); reject(loadError); }
            }, 100);
        });
        return;
    }
    loading = true;
    loadError = null;
    modelsLoaded = false;
    const TIMEOUT_MS = 30_000;
    try {
        const load = (async () => {
            const api = await getFaceApi();
            await Promise.all([
                api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
        })();
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Model load timed out — please retry')), TIMEOUT_MS)
        );
        await Promise.race([load, timeout]);
        modelsLoaded = true;
    } catch (err) {
        loadError = err instanceof Error ? err : new Error('Failed to load face models');
        throw loadError;
    } finally {
        loading = false;
    }
}

/** Extract face descriptors from a video/canvas element. Returns null if no face found. */
export async function extractDescriptors(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array[] | null> {
    const api = await getFaceApi();
    const detections = await api
        .detectAllFaces(source, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    if (!detections || detections.length === 0) return null;
    return detections.map(d => d.descriptor);
}

/** Extract a single descriptor from a File (for enrollment). */
export async function extractDescriptorFromFile(file: File): Promise<Float32Array | null> {
    const api = await getFaceApi();
    const img = await api.bufferToImage(file);
    const detection = await api
        .detectSingleFace(img, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    return detection ? detection.descriptor : null;
}

export interface FaceMatch {
    employeeId: string;
    employeeName: string;
    distance: number;
}

const MATCH_THRESHOLD = parseFloat(import.meta.env.VITE_FACE_MATCH_THRESHOLD ?? '0.4');

/** Match a live descriptor against stored employee descriptors. */
export async function matchFace(
    liveDescriptor: Float32Array,
    employeeDescriptors: { id: string; name: string; descriptors: number[][] }[]
): Promise<FaceMatch | null> {
    const api = await getFaceApi();
    let best: FaceMatch | null = null;

    for (const emp of employeeDescriptors) {
        if (!emp.descriptors || emp.descriptors.length === 0) continue;
        const labeled = new api.LabeledFaceDescriptors(
            emp.id,
            emp.descriptors.map(d => new Float32Array(d))
        );
        const matcher = new api.FaceMatcher([labeled], MATCH_THRESHOLD);
        const result = matcher.findBestMatch(liveDescriptor);
        if (result.label !== 'unknown' && (!best || result.distance < best.distance)) {
            best = { employeeId: emp.id, employeeName: emp.name, distance: result.distance };
        }
    }

    return best;
}
