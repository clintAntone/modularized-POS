// face-api.js is dynamically imported so it only downloads when face features are used
type FaceApi = typeof import('face-api.js');

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let loading = false;
let loadError: Error | null = null;

// In-memory cache for model file buffers — populated by preloadFaceModels.
// loadFaceModels monkey-patches face-api's fetch to serve from this cache,
// avoiding a second network download (Android WebView bypasses HTTP cache for localhost).
const modelFileCache = new Map<string, ArrayBuffer>();

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
 * Pre-fetch model files and store them in modelFileCache while reporting progress.
 * Also pre-imports the face-api.js bundle in parallel so that by the time progress
 * hits 100%, getFaceApi() is already resolved and loadFaceModels() can start
 * loading model weights immediately with no additional JS-parse delay.
 * onProgress receives (loadedBytes, totalBytes).
 */
export async function preloadFaceModels(
    onProgress: (loaded: number, total: number) => void
): Promise<void> {
    if (modelsLoaded) { onProgress(TOTAL_BYTES, TOTAL_BYTES); return; }
    let loadedBytes = 0;
    // Pre-import face-api.js in parallel with model file downloads so the JS
    // bundle is parsed before the progress bar finishes — eliminates the freeze
    // at "Preparing AI engine…" that users see after progress hits 100%.
    const faceApiPrime = getFaceApi().catch(() => null);
    await Promise.all([
        faceApiPrime,
        ...MODEL_FILES.map(async ({ path, size }) => {
            try {
                if (!modelFileCache.has(path)) {
                    const res = await fetch(path);
                    const buf = await res.arrayBuffer();
                    modelFileCache.set(path, buf);
                }
                loadedBytes += size;
                onProgress(Math.min(loadedBytes, TOTAL_BYTES), TOTAL_BYTES);
            } catch { /* loadFaceModels will surface the error */ }
        }),
    ]);
}

/**
 * Returns a fetch function that serves model files from in-memory cache,
 * falling back to the real fetch for anything not cached.
 */
function makeCachedFetch(realFetch: typeof fetch): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        try {
            const url = typeof input === 'string' ? input
                : input instanceof URL ? input.href
                : (input as Request).url;
            const pathname = new URL(url, window.location.href).pathname;
            if (modelFileCache.has(pathname)) {
                const buf = modelFileCache.get(pathname)!;
                return new Response(buf.slice(0), {
                    status: 200,
                    headers: { 'Content-Type': pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream' },
                });
            }
        } catch { /* fall through to real fetch on URL parse errors */ }
        return realFetch(input as RequestInfo, init);
    };
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
            // Serve model files from in-memory cache so loadFromUri doesn't re-download.
            // This is the key fix for Android WebView where localhost HTTP cache is unreliable.
            api.env.monkeyPatch({ fetch: makeCachedFetch(window.fetch.bind(window)) as any });
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
        .detectAllFaces(source, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
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
