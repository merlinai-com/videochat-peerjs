import { debug } from "$lib";
import { ensureEmit } from "$lib/socket";
import type { JsonSafe, RecordingId } from "backend/lib/database";
import { AsyncQueue } from "backend/lib/queue";
import type { RoomSocket } from "backend/lib/types";

export type Recording = {
    blob: Blob;
    startTime: Date;
    id: JsonSafe<RecordingId>;
};

export interface RecordingHandler {
    start: (emit: boolean) => Promise<void>;
    stop: (emit: boolean) => Promise<void>;
}

const videoStore = "video";
const uploadInterval = 100;

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

export async function createRecordingHandler(
    socket: RoomSocket,
    streams: { local?: MediaStream; screen?: MediaStream },
    signal: AbortSignal,
    state: { recording: boolean },
    callbacks: {
        afterStart: () => void;
        afterStop: () => void;
    }
): Promise<RecordingHandler> {
    // TODO: choose codecs
    const videoMimeTypes = ["video/webm", "video/ogg"];
    const mimeType = videoMimeTypes.find(MediaRecorder.isTypeSupported);
    if (!mimeType) throw new Error("No support recorder MIME types");

    const db = await initIndexedDb();
    let recordings: Recording[] = [];

    let mediaRecorders = new Set<MediaRecorder>();

    const callbackQueue = new AsyncQueue<
        | {
              ev: "upload_chunk";
              id: JsonSafe<RecordingId>;
              data: Promise<ArrayBuffer>;
          }
        | { ev: "upload_stop"; id: JsonSafe<RecordingId>; count: number }
    >();
    callbackQueue
        .consume(
            async (val) => {
                if (val.ev === "upload_chunk") {
                    socket.emit("upload_chunk", val.id, await val.data);
                } else {
                    socket.emit("upload_stop", val.id, val.count);
                }
            },
            { signal }
        )
        .catch((err) => {
            if (!(err instanceof DOMException && err.name === "AbortError"))
                console.error(err);
        });

    const startRecorder = async (stream: MediaStream, is_screen: boolean) => {
        const { error, id } = await socket.emitWithAck("upload_start", {
            mimeType,
            is_screen,
        });
        if (error !== undefined) throw new Error(error);

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorders.add(recorder);
        const currentRecording = {
            id,
            startTime: new Date(),
            blobs: [] as Blob[],
        };

        recorder.addEventListener("dataavailable", (ev) => {
            if (ev.data.size > 0) {
                currentRecording.blobs.push(ev.data);
                callbackQueue.push({
                    ev: "upload_chunk",
                    id: currentRecording.id,
                    data: ev.data.arrayBuffer(),
                });
            }
        });
        recorder.addEventListener("stop", async () => {
            mediaRecorders.delete(recorder);
            const recording = {
                id: currentRecording.id,
                startTime: currentRecording.startTime,
                blob: new Blob(currentRecording.blobs, {
                    type: mimeType,
                }),
            };
            recordings.push(recording);
            callbackQueue.push({
                ev: "upload_stop",
                id: currentRecording.id,
                count: currentRecording.blobs.length,
            });
            await saveRecording(db, recording);
        });
        recorder.start(uploadInterval);
    };

    const handlers: RecordingHandler = {
        async start(emit) {
            if (state.recording == true) return;

            if (emit)
                await ensureEmit(socket, {}, "recording", { action: "start" });

            const promises = [];
            if (streams.local)
                promises.push(startRecorder(streams.local, false));
            if (streams.screen)
                promises.push(startRecorder(streams.screen, true));
            await Promise.all(promises);

            state.recording = true;
            callbacks.afterStart();
        },

        async stop(emit) {
            if (emit && state.recording)
                await ensureEmit(socket, {}, "recording", { action: "stop" });

            for (const recorder of mediaRecorders) {
                recorder.stop();
            }

            state.recording = false;
            callbacks.afterStop();
        },
    };

    // @ts-ignore
    if (debug("recording/handlers")) window.$recordingHandlers = handlers;

    socket.on("recording", ({ action }) => {
        if (action === "start") handlers.start(false);
        else if (action === "stop") handlers.stop(false);
    });

    return handlers;
}
