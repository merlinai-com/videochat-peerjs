import type { UUID } from "backend/types";

export type Recording = {
    blob: Blob;
    startTime: Date;
    id: UUID;
};

const videoStore = "video";

function initIndexedDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("recordings", 1);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("upgradeneeded", () => {
            const db = request.result;
            db.createObjectStore(videoStore, {
                keyPath: "id",
            });
            resolve(db);
        });
        request.addEventListener("error", () => reject(request.error));
    });
}

function saveRecording(db: IDBDatabase, recording: Recording): Promise<void> {
    return new Promise((resolve, reject) => {
        const trans = db.transaction(videoStore, "readwrite");
        const store = trans.objectStore(videoStore);
        const req = store.add(recording);
        req.addEventListener("success", () => resolve());
        req.addEventListener("error", () => reject(req.error));
    });
}

export async function createRecordingHandler(callbacks: {
    upload_start: (arg: { mimeType: string }) => Promise<{ id: UUID }>;
    upload_chunk: (id: UUID, data: Blob) => void;
    upload_stop: (id: UUID) => void;
    start: () => void;
    stop: () => void;
}): Promise<{
    start: (localStream: MediaStream) => Promise<void>;
    stop: () => void;
}> {
    // TODO: choose codecs
    const videoMimeTypes = ["video/webm", "video/ogg"];
    const mimeType = videoMimeTypes.find(MediaRecorder.isTypeSupported);
    if (!mimeType) {
        throw new Error("No support recorder MIME types");
    }

    const db = await initIndexedDb();
    let recordings: Recording[] = [];

    // let currentRecording:
    //     | { startTime: Date; blobs: Blob[]; id: UUID }
    //     | undefined;
    let mediaRecorder: MediaRecorder | undefined;

    return {
        async start(stream) {
            const { id } = await callbacks.upload_start({ mimeType });
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            const currentRecording = {
                id,
                startTime: new Date(),
                blobs: [] as Blob[],
            };

            mediaRecorder.addEventListener("dataavailable", (ev) => {
                if (ev.data.size > 0) {
                    currentRecording.blobs.push(ev.data);
                    callbacks.upload_chunk(currentRecording.id, ev.data);
                }
            });
            mediaRecorder.addEventListener("stop", async () => {
                mediaRecorder = undefined;
                const recording = {
                    id: currentRecording.id,
                    startTime: currentRecording.startTime,
                    blob: new Blob(currentRecording.blobs, {
                        type: mimeType,
                    }),
                };
                recordings.push(recording);
                callbacks.upload_stop(currentRecording.id);
                callbacks.stop();
                await saveRecording(db, recording);
            });
            mediaRecorder.start(1000);
            callbacks.start();
        },

        stop() {
            mediaRecorder?.stop();
        },
    };
}
