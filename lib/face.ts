// face-api.js is dynamically imported so it only downloads when face features are used
type FaceApi = typeof import('face-api.js');

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let loading = false;

async function getFaceApi(): Promise<FaceApi> {
    if (!faceapi) faceapi = await import('face-api.js');
    return faceapi;
}

const MODEL_URL = '/models';

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    if (loading) {
        await new Promise<void>(resolve => {
            const check = setInterval(() => {
                if (modelsLoaded) { clearInterval(check); resolve(); }
            }, 100);
        });
        return;
    }
    loading = true;
    const api = await getFaceApi();
    await Promise.all([
        api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    loading = false;
}

/** Extract face descriptors from a video/canvas element. Returns null if no face found. */
export async function extractDescriptors(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array[] | null> {
    const api = await getFaceApi();
    const detections = await api
        .detectAllFaces(source, new api.SsdMobilenetv1Options({ minConfidence: 0.5 }))
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
        .detectSingleFace(img, new api.SsdMobilenetv1Options({ minConfidence: 0.5 }))
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
