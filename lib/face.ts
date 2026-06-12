import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
let modelsLoaded = false;
let loading = false;

export async function loadFaceModels(): Promise<void> {
    if (modelsLoaded) return;
    if (loading) {
        // Wait for in-progress load
        await new Promise<void>(resolve => {
            const check = setInterval(() => {
                if (modelsLoaded) { clearInterval(check); resolve(); }
            }, 100);
        });
        return;
    }
    loading = true;
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    loading = false;
}

/** Extract face descriptors from an image element or file. Returns null if no face found. */
export async function extractDescriptors(source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<Float32Array[] | null> {
    await loadFaceModels();
    const detections = await faceapi
        .detectAllFaces(source, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    if (!detections || detections.length === 0) return null;
    return detections.map(d => d.descriptor);
}

/** Extract a single descriptor from a File (for enrollment). */
export async function extractDescriptorFromFile(file: File): Promise<Float32Array | null> {
    await loadFaceModels();
    const img = await faceapi.bufferToImage(file);
    const detection = await faceapi
        .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
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

/** Match a live descriptor against a map of stored descriptors. */
export function matchFace(
    liveDescriptor: Float32Array,
    employeeDescriptors: { id: string; name: string; descriptors: number[][] }[]
): FaceMatch | null {
    let best: FaceMatch | null = null;

    for (const emp of employeeDescriptors) {
        if (!emp.descriptors || emp.descriptors.length === 0) continue;
        const labeledDescriptors = new faceapi.LabeledFaceDescriptors(
            emp.id,
            emp.descriptors.map(d => new Float32Array(d))
        );
        const matcher = new faceapi.FaceMatcher([labeledDescriptors], MATCH_THRESHOLD);
        const result = matcher.findBestMatch(liveDescriptor);
        if (result.label !== 'unknown' && (!best || result.distance < best.distance)) {
            best = { employeeId: emp.id, employeeName: emp.name, distance: result.distance };
        }
    }

    return best;
}
